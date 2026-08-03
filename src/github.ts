/**
 * Octokit integration: fetching the PR diff and posting the review back.
 *
 * The important defensive behaviour lives in `partitionComments` and
 * `postReview`: the model routinely invents line numbers that are not part of
 * the diff, and GitHub answers those with a 422 that kills the whole review.
 * Anything we can't anchor is demoted to a file-level note in the review body
 * rather than dropped, and a rejected inline batch degrades to a body-only
 * review instead of failing.
 */

import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';

import type { Review, ReviewComment, Severity } from './validator.js';
import { SEVERITY_RANK } from './validator.js';

export type Octokit = ReturnType<typeof getOctokit>;

export interface PullRequestTarget {
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
}

export interface InlineComment {
  path: string;
  line: number;
  side: 'RIGHT';
  body: string;
}

const SEVERITY_LABEL: Record<Severity, string> = {
  security: '🔴 Security',
  bug: '🟠 Bug',
  optimization: '🔵 Optimization',
  nit: '⚪ Nit',
};

const RISK_LABEL: Record<string, string> = {
  low: '🟢 Low risk',
  medium: '🟡 Medium risk',
  high: '🟠 High risk',
  critical: '🔴 Critical risk',
};

const REVIEW_MARKER = '<!-- autonomous-pr-reviewer -->';

/**
 * Reads the PR coordinates out of the Actions context. Returns null when the
 * workflow was triggered by something that isn't a pull request.
 */
export function resolvePullRequestTarget(): PullRequestTarget | null {
  const pr = context.payload.pull_request;
  if (!pr || typeof pr.number !== 'number') return null;

  const head = (pr as { head?: { sha?: string } }).head;
  if (!head?.sha) return null;

  return {
    owner: context.repo.owner,
    repo: context.repo.repo,
    pullNumber: pr.number,
    headSha: head.sha,
  };
}

/** Fetches the raw unified diff for a pull request. */
export async function fetchPullRequestDiff(
  octokit: Octokit,
  target: PullRequestTarget,
): Promise<string> {
  const response = await octokit.rest.pulls.get({
    owner: target.owner,
    repo: target.repo,
    pull_number: target.pullNumber,
    mediaType: { format: 'diff' },
  });

  // With `format: diff` GitHub returns text/plain, but the generated types
  // still describe the JSON pull-request object.
  const diff = response.data as unknown as string;
  if (typeof diff !== 'string') {
    throw new Error('GitHub returned an unexpected payload for the pull request diff.');
  }
  return diff;
}

/**
 * Maps each file in the diff to the set of new-file line numbers that GitHub
 * will accept a RIGHT-side review comment on (added lines and context lines).
 */
export function indexDiffLines(diff: string): Map<string, Set<number>> {
  const index = new Map<string, Set<number>>();
  let currentPath: string | null = null;
  let newLine = 0;
  let inHunk = false;

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      currentPath = null;
      inHunk = false;
      continue;
    }

    if (line.startsWith('+++ ')) {
      const raw = line.slice(4).trim();
      currentPath = raw === '/dev/null' ? null : stripDiffPrefix(raw);
      if (currentPath && !index.has(currentPath)) index.set(currentPath, new Set());
      inHunk = false;
      continue;
    }

    if (line.startsWith('@@')) {
      const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (match?.[1]) {
        newLine = Number.parseInt(match[1], 10);
        inHunk = true;
      } else {
        inHunk = false;
      }
      continue;
    }

    if (!inHunk || !currentPath) continue;

    if (line.startsWith('+') || line.startsWith(' ') || line === '') {
      index.get(currentPath)?.add(newLine);
      newLine += 1;
    }
    // '-' removals and '\ No newline at end of file' have no new-file line.
  }

  return index;
}

function stripDiffPrefix(p: string): string {
  return p.startsWith('a/') || p.startsWith('b/') ? p.slice(2) : p;
}

export interface PartitionedComments {
  inline: InlineComment[];
  /** Findings that could not be anchored to a line in the diff. */
  fallback: ReviewComment[];
}

/**
 * Splits findings into ones GitHub can anchor inline and ones that have to be
 * summarised in the review body.
 */
export function partitionComments(
  comments: ReviewComment[],
  index: Map<string, Set<number>>,
): PartitionedComments {
  const inline: InlineComment[] = [];
  const fallback: ReviewComment[] = [];

  for (const comment of comments) {
    const lines = index.get(comment.path);
    const line = comment.line;

    if (line === null || !Number.isInteger(line) || line <= 0 || !lines || !lines.has(line)) {
      fallback.push(comment);
      continue;
    }

    inline.push({
      path: comment.path,
      line,
      side: 'RIGHT',
      body: renderCommentBody(comment),
    });
  }

  return { inline, fallback };
}

function renderCommentBody(comment: ReviewComment): string {
  const parts = [
    `**${SEVERITY_LABEL[comment.severity]} — ${comment.title}**`,
    '',
    comment.body,
  ];

  if (comment.suggestion && comment.suggestion.trim().length > 0) {
    parts.push('', '```suggestion', comment.suggestion.replace(/```/g, '`​``'), '```');
  }

  parts.push('', `<sub>AI review · confidence ${(comment.confidence * 100).toFixed(0)}%</sub>`);
  return parts.join('\n');
}

export interface ReviewBodyContext {
  sanitizationNote?: string;
  policyNote?: string;
  model?: string;
}

/** Builds the top-level review body, including any un-anchorable findings. */
export function renderReviewBody(
  review: Review,
  fallback: ReviewComment[],
  ctx: ReviewBodyContext = {},
): string {
  const counts = countBySeverity(review.comments);
  const badges = (Object.keys(counts) as Severity[])
    .sort((a, b) => SEVERITY_RANK[a] - SEVERITY_RANK[b])
    .map((severity) => `\`${SEVERITY_LABEL[severity]}: ${counts[severity]}\``)
    .join(' ');

  const lines: string[] = [
    REVIEW_MARKER,
    '## 🤖 Autonomous PR Review',
    '',
    `**Verdict:** ${RISK_LABEL[review.overall_risk] ?? review.overall_risk} · **${review.comments.length}** finding(s)`,
  ];

  if (badges) lines.push('', badges);
  lines.push('', review.summary);

  if (fallback.length > 0) {
    lines.push(
      '',
      '### Findings without a diff anchor',
      '',
      '_These lines are not part of this diff, so they are reported here instead of inline._',
      '',
    );
    for (const comment of fallback) {
      const location = comment.line === null ? comment.path : `${comment.path}:${comment.line}`;
      lines.push(
        `<details><summary><strong>${SEVERITY_LABEL[comment.severity]}</strong> · <code>${location}</code> — ${escapeHtml(comment.title)}</summary>`,
        '',
        comment.body,
        '',
        '</details>',
        '',
      );
    }
  }

  const footer: string[] = [];
  if (ctx.sanitizationNote) footer.push(ctx.sanitizationNote);
  if (ctx.policyNote) footer.push(ctx.policyNote);
  if (ctx.model) footer.push(`model \`${ctx.model}\``);

  lines.push('', '---', `<sub>${footer.join(' · ') || 'Generated by the Autonomous PR Reviewer.'}</sub>`);

  return lines.join('\n');
}

function countBySeverity(comments: ReviewComment[]): Record<Severity, number> {
  const counts = { security: 0, bug: 0, optimization: 0, nit: 0 } satisfies Record<Severity, number>;
  for (const comment of comments) counts[comment.severity] += 1;
  return counts;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface PostReviewResult {
  inlinePosted: number;
  fallbackReported: number;
  degradedToBodyOnly: boolean;
}

/**
 * Posts the review. If GitHub rejects the inline batch (usually a stale
 * `commit_id` or a line outside the diff) the review is retried body-only so
 * the human still gets the findings.
 */
export async function postReview(
  octokit: Octokit,
  target: PullRequestTarget,
  review: Review,
  index: Map<string, Set<number>>,
  ctx: ReviewBodyContext = {},
): Promise<PostReviewResult> {
  const { inline, fallback } = partitionComments(review.comments, index);
  const body = renderReviewBody(review, fallback, ctx);

  try {
    await octokit.rest.pulls.createReview({
      owner: target.owner,
      repo: target.repo,
      pull_number: target.pullNumber,
      commit_id: target.headSha,
      event: 'COMMENT',
      body,
      comments: inline,
    });
    return { inlinePosted: inline.length, fallbackReported: fallback.length, degradedToBodyOnly: false };
  } catch (error) {
    if (inline.length === 0) throw error;

    const detail = error instanceof Error ? error.message : String(error);
    core.warning(
      `Inline review rejected by GitHub (${detail}). Retrying with a body-only review so the findings are not lost.`,
    );

    const degradedBody = renderReviewBody(review, review.comments, ctx);
    await octokit.rest.pulls.createReview({
      owner: target.owner,
      repo: target.repo,
      pull_number: target.pullNumber,
      commit_id: target.headSha,
      event: 'COMMENT',
      body: degradedBody,
    });
    return { inlinePosted: 0, fallbackReported: review.comments.length, degradedToBodyOnly: true };
  }
}
