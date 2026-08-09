/**
 * Policy tests: the fail-on-severity merge gate in `src/index.ts` — the only
 * thing this Action does that can block a merge — and the severity ordering it
 * depends on in `src/validator.ts`.
 *
 * The gate is a single inverted comparison:
 *
 *     SEVERITY_RANK[worst] <= SEVERITY_RANK[config.failOnSeverity]
 *
 * `SEVERITY_RANK` counts *down* in urgency (security = 0 … nit = 3), so `<=`
 * means "at least as urgent as the threshold". Flip the operator or the ranking
 * and the Action silently either blocks every pull request or blocks none of
 * them, so the matrix below walks all four severities against all five
 * threshold values rather than spot-checking a couple of cells.
 *
 * `run()` is exercised for real: `src/index.ts` self-executes only when it is
 * the process entry point, so importing it is safe. GitHub and Anthropic are
 * redirected at `GITHUB_API_URL` / `ANTHROPIC_BASE_URL` to a loopback server —
 * no outbound network, and no module mocking (`mock.module` needs
 * `--experimental-test-module-mocks`, which `tsx --test` does not pass).
 *
 * Run with: npm run test:unit
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

import {
  applyReviewPolicy,
  DEFAULT_POLICY,
  highestSeverity,
  SEVERITIES,
  SEVERITY_RANK,
  type Review,
  type ReviewComment,
  type Severity,
} from '../src/validator.js';

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

const ALL_SEVERITIES: Severity[] = ['security', 'bug', 'optimization', 'nit'];

/** Every accepted value of the `fail-on-severity` input. */
const THRESHOLDS = ['none', 'security', 'bug', 'optimization', 'nit'] as const;
type Threshold = (typeof THRESHOLDS)[number];

const FIXTURE_DIFF = `diff --git a/src/math.ts b/src/math.ts
index 3333333..4444444 100644
--- a/src/math.ts
+++ b/src/math.ts
@@ -1,3 +1,7 @@
 export function add(a: number, b: number): number {
   return a + b;
 }
+
+export function divide(a: number, b: number): number {
+  return a / b;
+}
`;

function makeComment(overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    path: 'src/math.ts',
    line: 6,
    severity: 'bug',
    title: 'Division by zero is unguarded',
    body: '`divide` returns Infinity when `b` is 0.',
    suggestion: null,
    confidence: 0.9,
    ...overrides,
  };
}

function makeReview(comments: ReviewComment[], overrides: Partial<Review> = {}): Review {
  return {
    summary: 'Adds a divide helper.',
    overall_risk: 'low',
    comments,
    ...overrides,
  };
}

// --------------------------------------------------------------------------
// Harness: drive the real `run()` against a loopback GitHub/Anthropic stub
// --------------------------------------------------------------------------

const WORKSPACE = mkdtempSync(join(tmpdir(), 'pr-reviewer-policy-'));
const EVENT_PATH = join(WORKSPACE, 'event.json');
const PULL_NUMBER = 42;
const REPO_PATH = `/repos/acme/widgets/pulls/${PULL_NUMBER}`;

writeFileSync(
  EVENT_PATH,
  JSON.stringify({
    pull_request: { number: PULL_NUMBER, head: { sha: 'f'.repeat(40) } },
  }),
);

/** The review the fake Anthropic endpoint hands back for the current run. */
let modelReview: Review = makeReview([]);
/** `"<METHOD> <path>"` for every request the current run issued. */
let requests: string[] = [];

/** A minimal `/v1/messages` body whose text block carries the review JSON. */
function anthropicMessage(review: Review): unknown {
  return {
    id: 'msg_policy_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    content: [{ type: 'text', text: JSON.stringify(review) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1234, output_tokens: 567 },
  };
}

// A real loopback server rather than a `globalThis.fetch` stub: `@actions/github`
// builds its Octokit with `request.fetch` bound to undici's `fetch` at import
// time, so patching the global would never be seen by the GitHub calls.
const server = createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0] ?? '';
  requests.push(`${req.method ?? 'GET'} ${path}`);
  req.resume();

  const send = (status: number, contentType: string, body: string): void => {
    res.writeHead(status, { 'content-type': contentType });
    res.end(body);
  };
  const json = (payload: unknown): void =>
    send(200, 'application/json; charset=utf-8', JSON.stringify(payload));

  if (path === '/v1/messages') {
    json(anthropicMessage(modelReview));
  } else if (path === `${REPO_PATH}/reviews`) {
    json({ id: 1, state: 'COMMENTED' });
  } else if (path === REPO_PATH) {
    if ((req.headers.accept ?? '').includes('diff')) {
      send(200, 'text/plain; charset=utf-8', FIXTURE_DIFF);
    } else {
      json({
        number: PULL_NUMBER,
        title: 'Add a divide helper',
        body: 'Straightforward change, no credentials involved.',
      });
    }
  } else {
    send(404, 'application/json; charset=utf-8', JSON.stringify({ message: `unrouted ${path}` }));
  }
});

await new Promise<void>((resolve) => {
  server.listen(0, '127.0.0.1', resolve);
});
server.unref();
const { port } = server.address() as AddressInfo;

after(() => {
  server.closeAllConnections();
  server.close();
});

// `@actions/github` snapshots the event payload, the repo slug and the API base
// URL the first time it is imported, which happens on the first dynamic import
// of `src/index.ts` below — so these have to be in place before any test runs.
process.env.GITHUB_EVENT_PATH = EVENT_PATH;
process.env.GITHUB_REPOSITORY = 'acme/widgets';
process.env.GITHUB_TOKEN = 'github-token-for-tests';
process.env.GITHUB_API_URL = `http://127.0.0.1:${port}`;
process.env.ANTHROPIC_API_KEY = 'anthropic-key-for-tests';
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
// Unset so `writeSummary` takes its swallowed-error path instead of writing
// into whatever real step summary the ambient environment points at.
delete process.env.GITHUB_STEP_SUMMARY;

interface ActionOptions {
  /** Severities of the findings the model "returns", in that order. */
  findings: Severity[];
  /** Value of the `fail-on-severity` input. */
  failOnSeverity: string;
  /** Per-finding confidences, aligned with `findings`. Defaults to 0.9. */
  confidences?: number[];
  /** Value of the `severities` (allow-list) input. Omitted means "all". */
  allowedSeverities?: string;
  /** Value of the `min-confidence` input. Defaults to 0. */
  minConfidence?: string;
  /** Value of the `max-comments` input. Defaults to 25. */
  maxComments?: string;
  /** Defaults to false: the gate is exercised on the real posting path. */
  dryRun?: boolean;
  overallRisk?: Review['overall_risk'];
}

interface ActionRun {
  /** True when `core.setFailed` ran, i.e. the merge was blocked. */
  failed: boolean;
  failureMessage: string | null;
  /** Raw contents of the GITHUB_OUTPUT file after the run. */
  outputsRaw: string;
  /** `"<METHOD> <path>"` for every request the Action issued. */
  requests: string[];
}

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

let runCounter = 0;

async function runAction(options: ActionOptions): Promise<ActionRun> {
  const { run } = await import('../src/index.js');

  modelReview = makeReview(
    options.findings.map((severity, i) =>
      makeComment({
        severity,
        title: `${severity} finding #${i}`,
        confidence: options.confidences?.[i] ?? 0.9,
      }),
    ),
    options.overallRisk ? { overall_risk: options.overallRisk } : {},
  );
  requests = [];

  runCounter += 1;
  const outputPath = join(WORKSPACE, `outputs-${runCounter}.txt`);
  writeFileSync(outputPath, '');

  setEnv('GITHUB_OUTPUT', outputPath);
  setEnv('REVIEW_FAIL_ON_SEVERITY', options.failOnSeverity);
  setEnv('REVIEW_SEVERITIES', options.allowedSeverities);
  setEnv('REVIEW_MIN_CONFIDENCE', options.minConfidence ?? '0');
  setEnv('REVIEW_MAX_COMMENTS', options.maxComments ?? '25');
  setEnv('REVIEW_DRY_RUN', options.dryRun === true ? 'true' : 'false');

  // `core.setFailed` reports through `process.exitCode` and an `::error::`
  // workflow command on stdout, so both have to be observed. This hook *tees*
  // — it must forward every chunk to the wrapper it replaced, unchanged.
  // `node:test` installs its own `process.stdout.write` wrapper to ship
  // child-process results back to the runner, so swallowing (or blanking) a
  // chunk makes whole tests silently vanish from the report.
  const log: string[] = [];
  const realWrite = process.stdout.write;
  process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => {
    log.push(typeof chunk === 'string' ? chunk : String(chunk));
    return (realWrite as (...args: unknown[]) => boolean).call(process.stdout, chunk, ...rest);
  }) as typeof process.stdout.write;

  const previousExitCode = process.exitCode;
  process.exitCode = 0;

  try {
    await run();
  } finally {
    process.stdout.write = realWrite;
  }

  const failed = process.exitCode === 1;
  process.exitCode = previousExitCode;

  const errorLine = /::error::(.*)/.exec(log.join(''));
  return {
    failed,
    failureMessage: errorLine?.[1] ?? null,
    // `core.setOutput` writes its heredoc delimiters with `os.EOL`, so this
    // file is CRLF-terminated on Windows and LF-terminated everywhere else.
    // Both are valid to the Actions runner, and no assertion below is about
    // which one we got, so normalise here rather than spelling `\r?\n` into
    // every regex that reads this field.
    outputsRaw: readFileSync(outputPath, 'utf8').replace(/\r\n/g, '\n'),
    requests: [...requests],
  };
}

// --------------------------------------------------------------------------
// Severity ranking — the ordering the merge gate is built on
// --------------------------------------------------------------------------

test('SEVERITY_RANK is inverted: a lower number means a more urgent finding', () => {
  assert.deepEqual(SEVERITY_RANK, { security: 0, bug: 1, optimization: 2, nit: 3 });
  assert.ok(SEVERITY_RANK.security < SEVERITY_RANK.bug);
  assert.ok(SEVERITY_RANK.bug < SEVERITY_RANK.optimization);
  assert.ok(SEVERITY_RANK.optimization < SEVERITY_RANK.nit);
  // Every declared severity must be rankable, or the gate reads `undefined`
  // and every comparison quietly becomes false.
  for (const severity of SEVERITIES) {
    assert.equal(typeof SEVERITY_RANK[severity], 'number', `${severity} has no rank`);
  }
  assert.equal(Object.keys(SEVERITY_RANK).length, SEVERITIES.length);
});

// --------------------------------------------------------------------------
// The merge gate — src/index.ts
// --------------------------------------------------------------------------

test('fail-on-severity "none" never blocks, not even on a security finding', async () => {
  const result = await runAction({ findings: ['security'], failOnSeverity: 'none' });
  assert.equal(result.failed, false);
  assert.equal(result.failureMessage, null);
  // The finding was still produced and reported — only the blocking is off.
  assert.match(result.outputsRaw, /findings<<\S+\n1\n/);
});

test('a clean review never blocks, even at the most aggressive threshold', async () => {
  for (const threshold of THRESHOLDS) {
    const result = await runAction({ findings: [], failOnSeverity: threshold });
    assert.equal(result.failed, false, `clean review blocked at threshold "${threshold}"`);
  }
});

test('a finding more urgent than the threshold blocks the merge', async () => {
  // security (rank 0) is strictly more urgent than bug (rank 1).
  const result = await runAction({ findings: ['security'], failOnSeverity: 'bug' });
  assert.equal(result.failed, true);
  assert.equal(
    result.failureMessage,
    'Review found a "security" finding, which meets the configured fail-on-severity threshold "bug".',
  );
});

test('a finding exactly at the threshold blocks the merge', async () => {
  const result = await runAction({ findings: ['bug'], failOnSeverity: 'bug' });
  assert.equal(result.failed, true);
  assert.equal(
    result.failureMessage,
    'Review found a "bug" finding, which meets the configured fail-on-severity threshold "bug".',
  );
});

test('a finding less urgent than the threshold does not block the merge', async () => {
  // nit (rank 3) is strictly less urgent than optimization (rank 2).
  const result = await runAction({ findings: ['nit'], failOnSeverity: 'optimization' });
  assert.equal(result.failed, false);
  assert.equal(result.failureMessage, null);
});

test('fail-on-severity gate: the full severity x threshold matrix', async () => {
  // Rows are the worst severity in the review, columns are the configured
  // threshold. `true` means the run must block the merge.
  //
  // A gate that used `>=` instead of `<=` would invert every cell; a gate that
  // used `===` would clear the whole lower-left triangle. Both are caught here.
  const expected: Record<Severity, Record<Threshold, boolean>> = {
    security: { none: false, security: true, bug: true, optimization: true, nit: true },
    bug: { none: false, security: false, bug: true, optimization: true, nit: true },
    optimization: { none: false, security: false, bug: false, optimization: true, nit: true },
    nit: { none: false, security: false, bug: false, optimization: false, nit: true },
  };

  const actual: Record<string, Record<string, boolean>> = {};
  for (const severity of ALL_SEVERITIES) {
    const row: Record<string, boolean> = {};
    for (const threshold of THRESHOLDS) {
      // A less urgent companion finding must not change the verdict: the gate
      // looks at the worst severity only.
      const findings: Severity[] = severity === 'nit' ? [severity] : [severity, 'nit'];
      const result = await runAction({ findings, failOnSeverity: threshold });
      row[threshold] = result.failed;
    }
    actual[severity] = row;
  }

  assert.deepEqual(actual, expected);
});

test('an unrecognised fail-on-severity value degrades to "none" instead of blocking', async () => {
  // "critical" is a valid *risk level*, not a severity — an easy input mix-up.
  // readConfig falls back to "none", so nothing blocks.
  const result = await runAction({ findings: ['security'], failOnSeverity: 'critical' });
  assert.equal(result.failed, false);
  assert.equal(result.failureMessage, null);
});

test('the gate sees the post-policy review: a filtered-out severity cannot block', async () => {
  // The security finding is dropped by the severity allow-list before
  // `highestSeverity` runs, so the strictest threshold still passes.
  const result = await runAction({
    findings: ['security', 'nit'],
    allowedSeverities: 'bug;optimization;nit',
    failOnSeverity: 'security',
  });
  assert.equal(result.failed, false);
  assert.match(result.outputsRaw, /findings<<\S+\n1\n/);
});

test('the gate sees the post-policy review: a low-confidence severity cannot block', async () => {
  const result = await runAction({
    findings: ['security'],
    confidences: [0.3],
    minConfidence: '0.6',
    failOnSeverity: 'security',
  });
  assert.equal(result.failed, false);
  assert.match(result.outputsRaw, /findings<<\S+\n0\n/);
});

test('the gate still blocks on the real posting path, not just in dry run', async () => {
  const result = await runAction({
    findings: ['security'],
    failOnSeverity: 'security',
    dryRun: false,
  });
  assert.equal(result.failed, true);
  assert.equal(
    result.failureMessage,
    'Review found a "security" finding, which meets the configured fail-on-severity threshold "security".',
  );
  assert.ok(
    result.requests.includes(`POST ${REPO_PATH}/reviews`),
    `expected the review to be posted, got: ${result.requests.join(', ')}`,
  );
});

test('dry run reports findings without writing anything to the pull request', async () => {
  const result = await runAction({
    findings: ['bug'],
    failOnSeverity: 'none',
    overallRisk: 'high',
    dryRun: true,
  });
  const writes = result.requests.filter((r) => !r.startsWith('GET '));
  assert.deepEqual(
    writes,
    ['POST /v1/messages'],
    'dry run must not issue any write request against GitHub',
  );
  assert.match(result.outputsRaw, /findings<<\S+\n1\n/);
  assert.match(result.outputsRaw, /overall-risk<<\S+\nhigh\n/);
  assert.match(result.outputsRaw, /input-tokens<<\S+\n1234\n/);
  assert.match(result.outputsRaw, /output-tokens<<\S+\n567\n/);
});

// --------------------------------------------------------------------------
// applyReviewPolicy — ordering, cap edges and clamping the existing suite
// does not reach
// --------------------------------------------------------------------------

test('applyReviewPolicy orders findings by urgency, then by descending confidence', () => {
  const result = applyReviewPolicy(
    makeReview([
      makeComment({ severity: 'nit', confidence: 0.99, title: 'nit' }),
      makeComment({ severity: 'optimization', confidence: 0.7, title: 'opt' }),
      makeComment({ severity: 'bug', confidence: 0.61, title: 'bug-low' }),
      makeComment({ severity: 'security', confidence: 0.65, title: 'sec-low' }),
      makeComment({ severity: 'bug', confidence: 0.95, title: 'bug-high' }),
      makeComment({ severity: 'security', confidence: 0.8, title: 'sec-high' }),
    ]),
    { minConfidence: 0, maxComments: 10, allowedSeverities: [...ALL_SEVERITIES] },
  );

  assert.deepEqual(
    result.review.comments.map((c) => c.title),
    ['sec-high', 'sec-low', 'bug-high', 'bug-low', 'opt', 'nit'],
  );
});

test('applyReviewPolicy keeps a finding sitting exactly on the confidence floor', () => {
  const result = applyReviewPolicy(
    makeReview([
      makeComment({ confidence: 0.6, title: 'on the floor' }),
      makeComment({ confidence: 0.599, title: 'below the floor' }),
    ]),
    { minConfidence: 0.6, maxComments: 10, allowedSeverities: [...ALL_SEVERITIES] },
  );
  assert.deepEqual(
    result.review.comments.map((c) => c.title),
    ['on the floor'],
  );
  assert.equal(result.droppedByConfidence, 1);
});

test('applyReviewPolicy falls back to DEFAULT_POLICY when none is supplied', () => {
  assert.equal(DEFAULT_POLICY.minConfidence, 0.6);
  assert.equal(DEFAULT_POLICY.maxComments, 25);

  const result = applyReviewPolicy(
    makeReview([
      makeComment({ confidence: 0.9, title: 'confident' }),
      makeComment({ confidence: 0.5, title: 'unsure' }),
    ]),
  );
  assert.deepEqual(
    result.review.comments.map((c) => c.title),
    ['confident'],
  );
  assert.equal(result.droppedByConfidence, 1);
});

test('applyReviewPolicy with a cap of zero posts nothing and says so', () => {
  const result = applyReviewPolicy(
    makeReview([makeComment({ severity: 'security' }), makeComment({ severity: 'bug' })]),
    { minConfidence: 0, maxComments: 0, allowedSeverities: [...ALL_SEVERITIES] },
  );
  assert.equal(result.review.comments.length, 0);
  assert.equal(result.droppedByCap, 2);
  // Nothing survives the cap, so nothing can block the merge either.
  assert.equal(highestSeverity(result.review), null);
});

test('applyReviewPolicy treats a negative cap as zero rather than slicing from the end', () => {
  const result = applyReviewPolicy(
    makeReview([makeComment({ severity: 'security' }), makeComment({ severity: 'nit' })]),
    { minConfidence: 0, maxComments: -1, allowedSeverities: [...ALL_SEVERITIES] },
  );
  assert.equal(result.review.comments.length, 0);
  assert.equal(result.droppedByCap, 2);
});

test('applyReviewPolicy counts only post-filter survivors against the cap', () => {
  const result = applyReviewPolicy(
    makeReview([
      makeComment({ severity: 'security', confidence: 0.9 }),
      makeComment({ severity: 'bug', confidence: 0.9 }),
      makeComment({ severity: 'nit', confidence: 0.9 }),
      makeComment({ severity: 'bug', confidence: 0.1 }),
    ]),
    { minConfidence: 0.5, maxComments: 1, allowedSeverities: ['security', 'bug'] },
  );
  assert.equal(result.droppedBySeverity, 1);
  assert.equal(result.droppedByConfidence, 1);
  // 2 survivors, cap of 1 — the cap counter must not include the 2 already
  // filtered out.
  assert.equal(result.droppedByCap, 1);
  assert.equal(result.review.comments[0]?.severity, 'security');
});

test('applyReviewPolicy clamps a negative confidence to zero', () => {
  const result = applyReviewPolicy(makeReview([makeComment({ confidence: -3 })]), {
    minConfidence: 0,
    maxComments: 10,
    allowedSeverities: [...ALL_SEVERITIES],
  });
  assert.equal(result.review.comments[0]?.confidence, 0);
});

test('applyReviewPolicy treats a non-finite confidence as zero, not as certainty', () => {
  for (const bogus of [Number.POSITIVE_INFINITY, Number.NaN]) {
    const kept = applyReviewPolicy(makeReview([makeComment({ confidence: bogus })]), {
      minConfidence: 0,
      maxComments: 10,
      allowedSeverities: [...ALL_SEVERITIES],
    });
    assert.equal(kept.review.comments[0]?.confidence, 0, `${bogus} should clamp to 0`);

    // ...and with any floor at all it is dropped rather than trusted.
    const dropped = applyReviewPolicy(makeReview([makeComment({ confidence: bogus })]), {
      minConfidence: 0.1,
      maxComments: 10,
      allowedSeverities: [...ALL_SEVERITIES],
    });
    assert.equal(dropped.review.comments.length, 0, `${bogus} should be dropped by the floor`);
    assert.equal(dropped.droppedByConfidence, 1);
  }
});

test('applyReviewPolicy preserves the summary and risk, and does not mutate its input', () => {
  const original = makeReview([makeComment({ confidence: 4.2, title: 'over-confident' })], {
    summary: 'Two new helpers.',
    overall_risk: 'critical',
  });
  const result = applyReviewPolicy(original, {
    minConfidence: 0,
    maxComments: 10,
    allowedSeverities: [...ALL_SEVERITIES],
  });

  assert.equal(result.review.summary, 'Two new helpers.');
  assert.equal(result.review.overall_risk, 'critical');
  assert.equal(result.review.comments[0]?.confidence, 1);
  // The clamp must produce a copy — mutating the caller's review would corrupt
  // whatever else still holds a reference to the model output.
  assert.equal(original.comments[0]?.confidence, 4.2);
  assert.notEqual(result.review.comments[0], original.comments[0]);
});

test('applyReviewPolicy with an empty allow-list drops everything', () => {
  const result = applyReviewPolicy(
    makeReview([makeComment({ severity: 'security' }), makeComment({ severity: 'bug' })]),
    { minConfidence: 0, maxComments: 10, allowedSeverities: [] },
  );
  assert.equal(result.review.comments.length, 0);
  assert.equal(result.droppedBySeverity, 2);
  assert.equal(highestSeverity(result.review), null);
});

test('highestSeverity picks the most urgent finding regardless of position', () => {
  // Guards the same ranking inversion the merge gate depends on: a `>`
  // comparison here would return the *least* urgent severity instead.
  for (const severity of ALL_SEVERITIES) {
    const noisier = ALL_SEVERITIES.filter((s) => SEVERITY_RANK[s] > SEVERITY_RANK[severity]);
    assert.equal(
      highestSeverity(makeReview([...noisier, severity].map((s) => makeComment({ severity: s })))),
      severity,
      `expected ${severity} to win over ${noisier.join(', ')}`,
    );
    assert.equal(
      highestSeverity(makeReview([severity, ...noisier].map((s) => makeComment({ severity: s })))),
      severity,
      `${severity} must win when it comes first too`,
    );
  }
});
