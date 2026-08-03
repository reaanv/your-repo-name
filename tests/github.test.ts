/**
 * Unit tests for the GitHub half of the pipeline: the diff line index that
 * decides which findings can be anchored, the comment/body renderers that have
 * to survive model-authored Markdown, and `postReview`'s 422 degradation path —
 * the reason the module exists. A rejected inline batch must come back as a
 * body-only review carrying every finding, never as a lost review.
 *
 * Run with: npm run test:unit
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { context } from '@actions/github';

import {
  indexDiffLines,
  partitionComments,
  postReview,
  renderReviewBody,
  resolvePullRequestTarget,
  type Octokit,
  type PullRequestTarget,
} from '../src/github.js';
import type { Review, ReviewComment } from '../src/validator.js';

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

/** Two hunks in one file. The second hunk must re-seed the new-file counter. */
const TWO_HUNK_DIFF = `diff --git a/src/two-hunks.ts b/src/two-hunks.ts
index 1111111..2222222 100644
--- a/src/two-hunks.ts
+++ b/src/two-hunks.ts
@@ -1,3 +1,4 @@
 const a = 1;
 const b = 2;
+const c = 3;
 const d = 4;
@@ -40,3 +41,4 @@
 const e = 5;
+const f = 6;
 const g = 7;
 const h = 8;`;

/** Deletions ahead of the surviving lines: '-' must not advance the counter. */
const REMOVAL_DIFF = `diff --git a/src/removals.ts b/src/removals.ts
index 3333333..4444444 100644
--- a/src/removals.ts
+++ b/src/removals.ts
@@ -1,5 +1,3 @@
-const gone = 1;
-const alsoGone = 2;
 const kept = 3;
+const added = 4;
 const tail = 5;`;

/** Two files whose hunks live in disjoint line ranges, so bleed is visible. */
const MULTI_FILE_DIFF = `diff --git a/src/alpha.ts b/src/alpha.ts
index 5555555..6666666 100644
--- a/src/alpha.ts
+++ b/src/alpha.ts
@@ -1,2 +1,3 @@
 const alphaOne = 1;
+const alphaTwo = 2;
 const alphaThree = 3;
diff --git a/src/beta.ts b/src/beta.ts
index 7777777..8888888 100644
--- a/src/beta.ts
+++ b/src/beta.ts
@@ -100,2 +100,3 @@
 const betaOne = 1;
+const betaTwo = 2;
 const betaThree = 3;`;

/** A deleted file (+++ /dev/null) followed by a live one. */
const DELETED_FILE_DIFF = `diff --git a/src/gone.ts b/src/gone.ts
deleted file mode 100644
index 9999999..0000000
--- a/src/gone.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-const goneOne = 1;
-const goneTwo = 2;
-const goneThree = 3;
diff --git a/src/stays.ts b/src/stays.ts
index aaaaaaa..bbbbbbb 100644
--- a/src/stays.ts
+++ b/src/stays.ts
@@ -1,2 +1,3 @@
 const staysOne = 1;
+const staysTwo = 2;
 const staysThree = 3;`;

/** Hand-built index, so the postReview tests don't depend on the diff parser. */
const MATH_INDEX = new Map<string, Set<number>>([
  ['src/math.ts', new Set([1, 2, 3, 4, 5, 6, 7])],
]);

const TARGET: PullRequestTarget = {
  owner: 'acme',
  repo: 'widgets',
  pullNumber: 42,
  headSha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
};

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

function makeReview(comments: ReviewComment[]): Review {
  return {
    summary: 'Adds a divide helper.',
    overall_risk: 'low',
    comments,
  };
}

function sorted(lines: Set<number> | undefined): number[] {
  return [...(lines ?? [])].sort((a, b) => a - b);
}

/** Records every createReview payload; optionally throws on the first call. */
function makeOctokit(failFirstCallWith?: Error): {
  octokit: Octokit;
  calls: Record<string, unknown>[];
} {
  const calls: Record<string, unknown>[] = [];
  const octokit = {
    rest: {
      pulls: {
        createReview: async (params: Record<string, unknown>) => {
          calls.push(params);
          if (failFirstCallWith && calls.length === 1) throw failFirstCallWith;
          return { data: { id: 1 } };
        },
      },
    },
  } as unknown as Octokit;
  return { octokit, calls };
}

/** `core.warning` is an `::warning::` command written to stdout. */
async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const original = process.stdout.write;
  process.stdout.write = ((...args: unknown[]) => {
    const [chunk] = args;
    if (typeof chunk === 'string') chunks.push(chunk);
    return (original as unknown as (...a: unknown[]) => boolean).apply(process.stdout, args);
  }) as unknown as typeof process.stdout.write;

  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }

  return chunks.join('');
}

/** Swaps the `@actions/github` context singleton's inputs, then restores them. */
function withContext<T>(repository: string | undefined, pullRequest: unknown, fn: () => T): T {
  const payload = context.payload as { pull_request?: unknown };
  const previousRepository = process.env.GITHUB_REPOSITORY;
  const previousPullRequest = payload.pull_request;

  if (repository === undefined) delete process.env.GITHUB_REPOSITORY;
  else process.env.GITHUB_REPOSITORY = repository;
  payload.pull_request = pullRequest;

  try {
    return fn();
  } finally {
    if (previousRepository === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = previousRepository;
    payload.pull_request = previousPullRequest;
  }
}

// --------------------------------------------------------------------------
// indexDiffLines — anchoring is what keeps GitHub from 422-ing the batch.
// --------------------------------------------------------------------------

test('indexDiffLines re-seeds the new-file counter at every hunk header', () => {
  const lines = indexDiffLines(TWO_HUNK_DIFF).get('src/two-hunks.ts');

  // Without the re-seed the second hunk would land on 5–8 instead of 41–44.
  assert.deepEqual(sorted(lines), [1, 2, 3, 4, 41, 42, 43, 44]);
  assert.equal(lines?.has(41), true);
  assert.equal(lines?.has(5), false);
});

test('indexDiffLines does not advance the new-file counter on removal lines', () => {
  const lines = indexDiffLines(REMOVAL_DIFF).get('src/removals.ts');

  // Two '-' lines precede the survivors; if they counted, everything would be
  // shifted down by exactly two and the index would run to 5.
  assert.deepEqual(sorted(lines), [1, 2, 3]);
  assert.equal(lines?.has(4), false);
  assert.equal(lines?.has(5), false);
});

test('partitionComments anchors past removals at the correct new-file line', () => {
  const index = indexDiffLines(REMOVAL_DIFF);
  const { inline, fallback } = partitionComments(
    [
      makeComment({ path: 'src/removals.ts', line: 2, title: 'Added line' }),
      makeComment({ path: 'src/removals.ts', line: 4, title: 'Pre-deletion line number' }),
    ],
    index,
  );

  assert.equal(inline.length, 1);
  assert.equal(inline[0]?.line, 2);
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0]?.title, 'Pre-deletion line number');
});

test('indexDiffLines keeps paths separate in a multi-file diff', () => {
  const index = indexDiffLines(MULTI_FILE_DIFF);

  assert.equal(index.size, 2);
  assert.deepEqual(sorted(index.get('src/alpha.ts')), [1, 2, 3]);
  assert.deepEqual(sorted(index.get('src/beta.ts')), [100, 101, 102]);
  // The second file's hunk must not leak backwards into the first.
  assert.equal(index.get('src/alpha.ts')?.has(100), false);
  assert.equal(index.get('src/beta.ts')?.has(1), false);
});

test('indexDiffLines contributes no anchorable lines for a deleted file', () => {
  const index = indexDiffLines(DELETED_FILE_DIFF);

  assert.equal(index.has('src/gone.ts'), false);
  assert.deepEqual([...index.keys()], ['src/stays.ts']);
  // The deleted file's hunk must not bleed into the next file either.
  assert.deepEqual(sorted(index.get('src/stays.ts')), [1, 2, 3]);
});

// --------------------------------------------------------------------------
// Rendering — model-authored Markdown must not break out of its container.
// --------------------------------------------------------------------------

test('renderCommentBody neutralises a triple backtick inside a suggestion', () => {
  const suggestion = [
    'if (b === 0) throw new RangeError("divide by zero");',
    '```',
    'break out of the suggestion block',
    '```',
  ].join('\n');

  const { inline } = partitionComments([makeComment({ suggestion })], MATH_INDEX);
  const body = inline[0]?.body ?? '';

  // Written as an explicit escape so a formatter cannot silently delete it.
  const escapeIndex = body.indexOf('`\u200B``');
  assert.ok(escapeIndex >= 0, 'embedded fence was not rewritten with a zero-width space');
  // Assert the separator by codepoint: a "cleanup" commit that strips U+200B
  // silently re-opens the escape.
  assert.equal(body.codePointAt(escapeIndex + 1), 0x200b);

  // Exactly one opening ```suggestion fence and one closing fence survive.
  assert.equal(body.split('```').length - 1, 2);
  assert.ok(body.includes('\n```suggestion\n'));
  assert.ok(body.includes('if (b === 0) throw new RangeError("divide by zero");'));
});

test('renderCommentBody leaves a fence-free suggestion byte-for-byte intact', () => {
  const { inline } = partitionComments(
    [makeComment({ suggestion: 'if (b === 0) return 0;' })],
    MATH_INDEX,
  );
  const body = inline[0]?.body ?? '';

  assert.ok(body.includes('\n```suggestion\nif (b === 0) return 0;\n```'));
  assert.equal(body.includes('\u200B'), false, 'no zero-width space should be injected');
  assert.ok(body.includes('<sub>AI review · confidence 90%</sub>'));
});

test('renderCommentBody omits the suggestion fence when there is no suggestion', () => {
  const { inline } = partitionComments([makeComment({ suggestion: '   ' })], MATH_INDEX);

  assert.equal(inline[0]?.body.includes('```suggestion'), false);
});

test('renderReviewBody escapes HTML in an un-anchorable finding title', () => {
  const comment = makeComment({
    line: 9999,
    title: '<script>alert(1)</script> & friends',
    body: 'The title is interpolated into a details summary.',
  });
  const body = renderReviewBody(makeReview([comment]), [comment]);

  assert.ok(body.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; friends'));
  assert.equal(body.includes('<script>'), false, 'raw script tag leaked into the summary');
  // The surrounding <details>/<summary> markup itself must stay real markup.
  assert.ok(body.includes('<details><summary>'));
  assert.ok(body.includes('</details>'));
});

// --------------------------------------------------------------------------
// postReview — the 422 degradation path.
// --------------------------------------------------------------------------

test('postReview posts inline comments and reports the fallback count', async () => {
  const { octokit, calls } = makeOctokit();
  const review = makeReview([
    makeComment({ line: 6 }),
    makeComment({ line: 3, title: 'Second anchored finding' }),
    makeComment({ line: 9999, title: 'Hallucinated line' }),
  ]);

  const result = await postReview(octokit, TARGET, review, MATH_INDEX, { model: 'claude-opus-5' });

  assert.deepEqual(result, { inlinePosted: 2, fallbackReported: 1, degradedToBodyOnly: false });
  assert.equal(calls.length, 1);

  const payload = calls[0] ?? {};
  assert.equal(payload.owner, 'acme');
  assert.equal(payload.repo, 'widgets');
  assert.equal(payload.pull_number, 42);
  assert.equal(payload.commit_id, TARGET.headSha);
  assert.equal(payload.event, 'COMMENT');
  assert.equal(Array.isArray(payload.comments), true);
  assert.equal((payload.comments as unknown[]).length, 2);
  assert.ok(String(payload.body).includes('Hallucinated line'));
});

test('postReview rethrows without retrying when there is nothing inline to drop', async () => {
  const boom = new Error('GitHub said 422: something else entirely');
  const { octokit, calls } = makeOctokit(boom);
  const review = makeReview([
    makeComment({ line: 9999, title: 'Hallucinated line' }),
    makeComment({ line: null, title: 'File-level note' }),
  ]);

  await assert.rejects(
    () => postReview(octokit, TARGET, review, MATH_INDEX),
    (error: unknown) => {
      assert.equal(error, boom);
      return true;
    },
  );

  // A body-only retry would be pointless here: retrying must not happen.
  assert.equal(calls.length, 1);
});

test('postReview degrades a rejected inline batch to a body-only review', async () => {
  const boom = new Error('stale commit_id: 422');
  const { octokit, calls } = makeOctokit(boom);
  const review = makeReview([
    makeComment({ line: 6, title: 'Anchored finding one' }),
    makeComment({ line: 3, title: 'Anchored finding two' }),
    makeComment({ line: 9999, title: 'Un-anchorable finding' }),
  ]);

  let result: Awaited<ReturnType<typeof postReview>> | undefined;
  const output = await captureStdout(async () => {
    result = await postReview(octokit, TARGET, review, MATH_INDEX, { model: 'claude-opus-5' });
  });

  assert.deepEqual(result, { inlinePosted: 0, fallbackReported: 3, degradedToBodyOnly: true });
  assert.equal(calls.length, 2);

  const retry = calls[1] ?? {};
  // Key ABSENCE, not `undefined`: passing `comments: []` (or `undefined`) on the
  // retry is what would 422 a second time and lose the review entirely.
  assert.equal('comments' in retry, false, 'retry payload must not carry a comments key');
  assert.equal(retry.commit_id, TARGET.headSha);
  assert.equal(retry.event, 'COMMENT');
  assert.equal(retry.pull_number, 42);

  // Every finding, including the ones that were inline, must survive in the body.
  const retryBody = String(retry.body);
  assert.ok(retryBody.includes('Anchored finding one'));
  assert.ok(retryBody.includes('Anchored finding two'));
  assert.ok(retryBody.includes('Un-anchorable finding'));
  assert.ok(retryBody.includes('Findings without a diff anchor'));
  assert.ok(retryBody.includes('claude-opus-5'));

  assert.match(output, /::warning::Inline review rejected by GitHub \(stale commit_id: 422\)/);
});

// --------------------------------------------------------------------------
// resolvePullRequestTarget — returning null is how the action exits cleanly.
// --------------------------------------------------------------------------

test('resolvePullRequestTarget reads owner, repo, number and head sha', () => {
  const target = withContext('acme/widgets', { number: 42, head: { sha: 'abc123' } }, () =>
    resolvePullRequestTarget(),
  );

  assert.deepEqual(target, {
    owner: 'acme',
    repo: 'widgets',
    pullNumber: 42,
    headSha: 'abc123',
  });
});

test('resolvePullRequestTarget returns null on a non-pull-request trigger', () => {
  assert.equal(
    withContext('acme/widgets', undefined, () => resolvePullRequestTarget()),
    null,
  );
});

test('resolvePullRequestTarget returns null when the number is not a number', () => {
  assert.equal(
    withContext('acme/widgets', { number: '42', head: { sha: 'abc123' } }, () =>
      resolvePullRequestTarget(),
    ),
    null,
  );
});

test('resolvePullRequestTarget returns null when the payload has no head sha', () => {
  assert.equal(
    withContext('acme/widgets', { number: 42 }, () => resolvePullRequestTarget()),
    null,
  );
  assert.equal(
    withContext('acme/widgets', { number: 42, head: {} }, () => resolvePullRequestTarget()),
    null,
  );
});
