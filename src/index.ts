/**
 * Entry point / orchestrator.
 *
 * Flow: resolve PR → fetch diff → sanitize → prompt → validate → post.
 *
 * Every failure path is fail-closed: the run ends with `core.setFailed` and a
 * non-zero exit code, and nothing is written to the pull request.
 */

import { pathToFileURL } from 'node:url';

import * as core from '@actions/core';
import { getOctokit } from '@actions/github';

import { AiReviewError, createClient, requestReview, type Strictness } from './ai.js';
import {
  fetchPullRequestDiff,
  indexDiffLines,
  postReview,
  resolvePullRequestTarget,
} from './github.js';
import { describeSanitization, redactSecrets, sanitizeDiff } from './sanitizer.js';
import {
  applyReviewPolicy,
  DEFAULT_POLICY,
  highestSeverity,
  ReviewValidationError,
  SEVERITIES,
  SEVERITY_RANK,
  type Severity,
} from './validator.js';

const STRICTNESS_VALUES: Strictness[] = ['lenient', 'balanced', 'strict'];

function input(name: string, envName: string, fallback = ''): string {
  const fromAction = core.getInput(name);
  if (fromAction) return fromAction;
  return process.env[envName] ?? fallback;
}

function numberInput(name: string, envName: string, fallback: number): number {
  const raw = input(name, envName);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    core.warning(`Input "${name}" is not a number ("${raw}"); using ${fallback}.`);
    return fallback;
  }
  return parsed;
}

function booleanInput(name: string, envName: string, fallback: boolean): boolean {
  const raw = input(name, envName).trim().toLowerCase();
  if (!raw) return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function listInput(name: string, envName: string): string[] {
  return input(name, envName)
    .split('\n')
    .flatMap((line) => line.split(';'))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

interface Config {
  githubToken: string;
  anthropicApiKey: string;
  strictness: Strictness;
  enforceSecurityChecks: boolean;
  minConfidence: number;
  maxComments: number;
  allowedSeverities: Severity[];
  customRules: string[];
  failOnSeverity: Severity | 'none';
  maxDiffChars: number;
  dryRun: boolean;
}

function readConfig(): Config {
  const strictnessRaw = (input('strictness', 'REVIEW_STRICTNESS', 'balanced') as Strictness);
  const strictness = STRICTNESS_VALUES.includes(strictnessRaw) ? strictnessRaw : 'balanced';
  if (strictness !== strictnessRaw) {
    core.warning(`Unknown strictness "${strictnessRaw}"; falling back to "balanced".`);
  }

  const severityRaw = listInput('severities', 'REVIEW_SEVERITIES');
  const allowedSeverities = severityRaw.length
    ? severityRaw.filter((s): s is Severity => (SEVERITIES as readonly string[]).includes(s))
    : [...SEVERITIES];

  const failOnRaw = input('fail-on-severity', 'REVIEW_FAIL_ON_SEVERITY', 'none');
  const failOnSeverity: Severity | 'none' = (SEVERITIES as readonly string[]).includes(failOnRaw)
    ? (failOnRaw as Severity)
    : 'none';

  return {
    githubToken: input('github-token', 'GITHUB_TOKEN'),
    anthropicApiKey: input('anthropic-api-key', 'ANTHROPIC_API_KEY'),
    strictness,
    enforceSecurityChecks: booleanInput('enforce-security-checks', 'REVIEW_ENFORCE_SECURITY', true),
    minConfidence: numberInput('min-confidence', 'REVIEW_MIN_CONFIDENCE', DEFAULT_POLICY.minConfidence),
    maxComments: numberInput('max-comments', 'REVIEW_MAX_COMMENTS', DEFAULT_POLICY.maxComments),
    allowedSeverities: allowedSeverities.length ? allowedSeverities : [...SEVERITIES],
    customRules: listInput('custom-rules', 'REVIEW_CUSTOM_RULES'),
    failOnSeverity,
    maxDiffChars: numberInput('max-diff-chars', 'REVIEW_MAX_DIFF_CHARS', 180_000),
    dryRun: booleanInput('dry-run', 'REVIEW_DRY_RUN', false),
  };
}

export async function run(): Promise<void> {
  const config = readConfig();

  const target = resolvePullRequestTarget();
  if (!target) {
    core.info('No pull request found in the event payload — nothing to review.');
    return;
  }

  if (!config.githubToken) {
    throw new Error('GITHUB_TOKEN is missing. Pass it via the `github-token` input or the GITHUB_TOKEN env var.');
  }
  if (!config.anthropicApiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is missing. Add it to the repository secrets and pass it via the `anthropic-api-key` input.',
    );
  }

  const octokit = getOctokit(config.githubToken);

  core.startGroup('Fetching pull request diff');
  const rawDiff = await fetchPullRequestDiff(octokit, target);
  core.info(`Fetched ${rawDiff.length} characters of diff for PR #${target.pullNumber}.`);
  core.endGroup();

  core.startGroup('Sanitizing diff');
  const sanitized = sanitizeDiff(rawDiff, { maxChars: config.maxDiffChars });
  core.info(describeSanitization(sanitized));
  if (sanitized.totalRedactions > 0) {
    core.warning(
      `Redacted ${sanitized.totalRedactions} potential secret(s) before building the LLM payload: ` +
        sanitized.redactions.map((r) => `${r.label} ×${r.count}`).join(', '),
    );
  }
  core.endGroup();

  if (sanitized.content.trim().length === 0) {
    core.info('Nothing reviewable left after sanitization (generated files only). Skipping.');
    return;
  }

  const { data: pr } = await octokit.rest.pulls.get({
    owner: target.owner,
    repo: target.repo,
    pull_number: target.pullNumber,
  });

  // The title and body reach the same provider as the diff, and are the same
  // author-controlled surface — a pasted failing `curl -H 'Authorization: ...'`
  // or a copied .env block belongs in a PR description far more often than in
  // the code. Redacting only the diff left that wide open.
  const redactedTitle = redactSecrets(pr.title ?? '');
  const redactedBody = redactSecrets(pr.body ?? '');
  const metadataRedactions = redactedTitle.totalRedactions + redactedBody.totalRedactions;
  if (metadataRedactions > 0) {
    core.warning(
      `Redacted ${metadataRedactions} potential secret(s) from the pull request title/body ` +
        'before building the LLM payload.',
    );
  }

  const sanitizationNote = buildSanitizationNote(
    sanitized.totalRedactions + metadataRedactions,
    sanitized.truncated,
  );

  core.startGroup('Requesting review from Anthropic');
  const client = createClient({ apiKey: config.anthropicApiKey });
  const result = await requestReview(client, {
    diff: sanitized.content,
    prTitle: redactedTitle.text,
    prBody: redactedBody.text,
    strictness: config.strictness,
    enforceSecurityChecks: config.enforceSecurityChecks,
    customRules: config.customRules,
    sanitizationNote,
  });
  core.info(
    `Model ${result.model} returned ${result.review.comments.length} finding(s) ` +
      `(in ${result.usage.inputTokens} tokens, out ${result.usage.outputTokens} tokens, stop_reason ${result.stopReason}).`,
  );
  if (result.injectionSuspected) {
    core.warning('Static scan flagged possible prompt-injection content in this diff. The model was warned.');
  }
  core.endGroup();

  const policy = applyReviewPolicy(result.review, {
    minConfidence: config.minConfidence,
    maxComments: config.maxComments,
    allowedSeverities: config.allowedSeverities,
  });
  const dropped = policy.droppedByConfidence + policy.droppedBySeverity + policy.droppedByCap;
  if (dropped > 0) {
    core.info(
      `Policy filtered ${dropped} finding(s): ${policy.droppedByConfidence} below confidence ` +
        `${config.minConfidence}, ${policy.droppedBySeverity} by severity filter, ${policy.droppedByCap} over the cap.`,
    );
  }

  const policyNote = `strictness \`${config.strictness}\` · min confidence \`${config.minConfidence}\``;
  const index = indexDiffLines(rawDiff);

  if (config.dryRun) {
    core.info('Dry run enabled — not posting to GitHub. Review payload follows:');
    core.info(JSON.stringify(policy.review, null, 2));
  } else {
    const posted = await postReview(octokit, target, policy.review, index, {
      sanitizationNote,
      policyNote,
      model: result.model,
    });
    core.info(
      `Posted review: ${posted.inlinePosted} inline comment(s), ${posted.fallbackReported} in the summary body` +
        (posted.degradedToBodyOnly ? ' (degraded to body-only after a GitHub rejection).' : '.'),
    );
  }

  // Report every redaction, diff and metadata alike — a summary that says
  // "Secrets redacted: 0" while a credential was stripped from the PR body is
  // actively misleading to the person deciding whether to rotate it.
  const totalRedactions = sanitized.totalRedactions + metadataRedactions;
  await writeSummary(policy.review.comments.length, result, totalRedactions, config);

  core.setOutput('findings', String(policy.review.comments.length));
  core.setOutput('overall-risk', policy.review.overall_risk);
  core.setOutput('redactions', String(totalRedactions));
  core.setOutput('input-tokens', String(result.usage.inputTokens));
  core.setOutput('output-tokens', String(result.usage.outputTokens));

  const worst = highestSeverity(policy.review);
  if (
    config.failOnSeverity !== 'none' &&
    worst !== null &&
    SEVERITY_RANK[worst] <= SEVERITY_RANK[config.failOnSeverity]
  ) {
    core.setFailed(
      `Review found a "${worst}" finding, which meets the configured fail-on-severity threshold "${config.failOnSeverity}".`,
    );
  }
}

function buildSanitizationNote(redactions: number, truncated: boolean): string {
  const parts: string[] = [];
  parts.push(
    redactions === 0
      ? 'No secrets were detected in this diff.'
      : `${redactions} potential secret(s) were replaced with \`[REDACTED:…]\` placeholders before the diff left this runner.`,
  );
  if (truncated) {
    parts.push('The diff was too large to send in full, so some files were shortened or omitted.');
  }
  return parts.join(' ');
}

async function writeSummary(
  findings: number,
  result: Awaited<ReturnType<typeof requestReview>>,
  redactions: number,
  config: Config,
): Promise<void> {
  try {
    await core.summary
      .addHeading('🤖 Autonomous PR Review', 2)
      .addTable([
        [
          { data: 'Metric', header: true },
          { data: 'Value', header: true },
        ],
        ['Findings posted', String(findings)],
        ['Overall risk', result.review.overall_risk],
        ['Secrets redacted', String(redactions)],
        ['Strictness', config.strictness],
        ['Model', result.model],
        ['Input tokens', String(result.usage.inputTokens)],
        ['Output tokens', String(result.usage.outputTokens)],
      ])
      .write();
  } catch (error) {
    // A missing GITHUB_STEP_SUMMARY (local runs) must never fail the review.
    core.debug(`Skipped job summary: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ReviewValidationError) {
      core.error(error.describe());
      core.setFailed('Fail-closed: the model returned data that did not satisfy the review schema. Nothing was posted.');
    } else if (error instanceof AiReviewError) {
      core.error(error.message);
      core.setFailed('Fail-closed: the review could not be generated. Nothing was posted.');
    } else {
      const message = error instanceof Error ? error.message : String(error);
      core.error(error instanceof Error && error.stack ? error.stack : message);
      core.setFailed(`Fail-closed: ${message}`);
    }
    process.exitCode = 1;
  }
}

// Only self-execute when this module IS the process entry point. Without the
// guard, `import { run } from '../src/index.js'` in a test fires the whole
// action — env reads, an Octokit client, a live Anthropic call — before the
// first assertion, which is why `run` had no tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
