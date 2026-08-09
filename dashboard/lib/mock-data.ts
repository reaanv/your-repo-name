import type { Finding, PullRequestReview, RiskLevel, ReviewStatus, Severity } from './types';

/**
 * Every timestamp and every chart series is derived from this fixed instant and
 * a seeded PRNG. Nothing here calls `Date.now()` or `Math.random()`, so the
 * server render and the client hydration always agree.
 */
export const NOW = new Date('2026-08-03T09:00:00.000Z');

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

// ---------------------------------------------------------------------------
// Diff fixtures
// ---------------------------------------------------------------------------

const DIFF_AUTH = `diff --git a/src/server/auth/session.ts b/src/server/auth/session.ts
index 8a1f2c3..b7d9e01 100644
--- a/src/server/auth/session.ts
+++ b/src/server/auth/session.ts
@@ -14,12 +14,26 @@ import { db } from '../db';

 const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

-export async function getSession(token: string) {
-  const row = await db.session.findUnique({ where: { token } });
-  if (!row) return null;
-  return row;
+export async function getSession(token: string) {
+  const row = await db.session.findUnique({ where: { token } });
+  if (!row) return null;
+
+  // Refresh the session so active users are not logged out mid-flow.
+  await db.session.update({
+    where: { token },
+    data: { expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
+  });
+
+  return row;
 }

+export async function impersonate(userId: string, actorId: string) {
+  const actor = await db.user.findUnique({ where: { id: actorId } });
+  const token = crypto.randomUUID();
+  await db.session.create({
+    data: { token, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
+  });
+  return token;
+}
+
 export async function destroySession(token: string) {
   await db.session.delete({ where: { token } });
 }
`;

const DIFF_CHECKOUT = `diff --git a/src/checkout/pricing.ts b/src/checkout/pricing.ts
index 4c8b1a0..9f2e7d5 100644
--- a/src/checkout/pricing.ts
+++ b/src/checkout/pricing.ts
@@ -22,9 +22,21 @@ export interface LineItem {
   quantity: number;
 }

-export function subtotal(items: LineItem[]): number {
-  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
+export function subtotal(items: LineItem[]): number {
+  let sum = 0;
+  for (const item of items) {
+    sum += item.unitPrice * item.quantity;
+  }
+  return sum;
 }

+export function applyDiscount(total: number, code: string): number {
+  const discount = DISCOUNTS[code];
+  return total - total * discount;
+}
+
+export function formatMoney(cents: number): string {
+  return '$' + (cents / 100).toFixed(2);
+}
+
 export function taxFor(total: number, rate: number): number {
   return Math.round(total * rate);
 }
`;

const DIFF_UPLOADS = `diff --git a/src/api/uploads.ts b/src/api/uploads.ts
index 1d4f8e2..3a7c9b6 100644
--- a/src/api/uploads.ts
+++ b/src/api/uploads.ts
@@ -8,10 +8,24 @@ import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

 const s3 = new S3Client({ region: process.env.AWS_REGION });

-export async function handleUpload(req: Request) {
-  const body = await req.formData();
-  return new Response('ok');
+export async function handleUpload(req: Request) {
+  const body = await req.formData();
+  const file = body.get('file') as File;
+  const key = body.get('key') as string;
+
+  await s3.send(
+    new PutObjectCommand({
+      Bucket: process.env.UPLOAD_BUCKET,
+      Key: key,
+      Body: Buffer.from(await file.arrayBuffer()),
+      ContentType: file.type,
+    }),
+  );
+
+  return Response.json({ url: \`https://cdn.example.com/\${key}\` });
 }

+export async function listUploads(prefix: string) {
+  return s3.send(new ListObjectsV2Command({ Bucket: process.env.UPLOAD_BUCKET, Prefix: prefix }));
+}
+
 export const runtime = 'nodejs';
`;

const DIFF_FEED = `diff --git a/src/components/ActivityFeed.tsx b/src/components/ActivityFeed.tsx
index 2b6d0a1..7e1c4f8 100644
--- a/src/components/ActivityFeed.tsx
+++ b/src/components/ActivityFeed.tsx
@@ -5,14 +5,26 @@ import { useEffect, useState } from 'react';

 export function ActivityFeed({ userId }: { userId: string }) {
   const [events, setEvents] = useState<Event[]>([]);
+  const [cursor, setCursor] = useState<string | null>(null);

   useEffect(() => {
-    fetch('/api/events').then((r) => r.json()).then(setEvents);
-  });
+    let cancelled = false;
+    fetch(\`/api/events?user=\${userId}&cursor=\${cursor ?? ''}\`)
+      .then((r) => r.json())
+      .then((data) => {
+        if (!cancelled) setEvents((prev) => [...prev, ...data.events]);
+      });
+    return () => {
+      cancelled = true;
+    };
+  }, [userId, cursor]);

   return (
     <ul>
-      {events.map((e) => (
-        <li>{e.title}</li>
+      {events.map((e, i) => (
+        <li key={i}>{e.title}</li>
       ))}
     </ul>
   );
 }
`;

const DIFF_CONFIG = `diff --git a/src/config/integrations.ts b/src/config/integrations.ts
index 5f0a2b9..8c3d1e4 100644
--- a/src/config/integrations.ts
+++ b/src/config/integrations.ts
@@ -1,6 +1,14 @@
 export const integrations = {
   analytics: {
     endpoint: 'https://metrics.internal/v2/ingest',
-    apiKey: process.env.METRICS_KEY,
+    apiKey: '[REDACTED:GENERIC_SECRET_ASSIGNMENT]',
   },
+  billing: {
+    endpoint: 'https://billing.internal/v1',
+    token: '[REDACTED:BEARER_TOKEN]',
+    retries: 3,
+  },
+  search: {
+    endpoint: process.env.SEARCH_URL,
+    timeoutMs: 30000,
+  },
 };
`;

const DIFF_MIGRATION = `diff --git a/migrations/0042_add_indexes.sql b/migrations/0042_add_indexes.sql
index 0000000..a1b2c3d 100644
--- /dev/null
+++ b/migrations/0042_add_indexes.sql
@@ -0,0 +1,9 @@
+BEGIN;
+
+CREATE INDEX idx_events_user_created ON events (user_id, created_at DESC);
+
+CREATE INDEX idx_sessions_token ON sessions (token);
+
+DROP INDEX IF EXISTS idx_events_legacy;
+
+COMMIT;
`;

const DIFF_DOCS = `diff --git a/docs/runbook.md b/docs/runbook.md
index 9a8b7c6..1f2e3d4 100644
--- a/docs/runbook.md
+++ b/docs/runbook.md
@@ -18,6 +18,12 @@ Restart the ingest worker with:
 kubectl rollout restart deploy/ingest
 \`\`\`

+## Rotating the metrics key
+
+1. Generate a new key in the metrics console.
+2. Update the \`METRICS_KEY\` secret in the cluster.
+3. Roll the ingest deployment.
+
 ## Escalation

 Page the on-call SRE in #incident-response.
`;

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

function finding(
  id: string,
  severity: Severity,
  title: string,
  path: string,
  line: number | null,
  body: string,
  confidence: number,
  suggestion: string | null = null,
): Finding {
  return { id, severity, title, body, path, line, suggestion, confidence };
}

export const REVIEWS: PullRequestReview[] = [
  {
    id: 'rv_001',
    repo: 'acme/atlas-api',
    number: 4821,
    title: 'Add session refresh and admin impersonation',
    author: 'dana-w',
    branch: 'feat/session-refresh',
    baseBranch: 'main',
    status: 'changes-requested',
    risk: 'critical',
    createdAt: minutesAgo(11),
    durationMs: 42_100,
    summary:
      'Adds sliding-window session refresh and a new `impersonate` helper. The refresh logic is sound, but `impersonate` creates a privileged session without checking whether the actor is allowed to impersonate anyone, and the fetched actor record is never used.',
    findings: [
      finding(
        'fd_001',
        'security',
        'Impersonation creates a session without an authorization check',
        'src/server/auth/session.ts',
        31,
        'The actor is loaded but never checked. Anyone who can reach this function can mint a session for any `userId`, which is a full account-takeover primitive. Gate it on an explicit role check and fail closed when the actor is missing.',
        0.97,
        "  const actor = await db.user.findUnique({ where: { id: actorId } });\n  if (!actor?.roles.includes('admin')) {\n    throw new ForbiddenError('impersonation requires an admin actor');\n  }",
      ),
      finding(
        'fd_002',
        'security',
        'Impersonated sessions are indistinguishable from real ones',
        'src/server/auth/session.ts',
        33,
        'The created session carries no marker that it was produced by impersonation, so audit logs cannot tell the two apart. Store `impersonatedBy: actorId` on the row and surface it in the session payload.',
        0.88,
        null,
      ),
      finding(
        'fd_003',
        'bug',
        'Session refresh runs a write on every read',
        'src/server/auth/session.ts',
        20,
        '`getSession` now issues an UPDATE on every single request, including read-only ones. On a hot path this doubles database writes and can deadlock against the session delete in `destroySession`. Only refresh when the session is within, say, 24h of expiry.',
        0.83,
        null,
      ),
      finding(
        'fd_004',
        'optimization',
        'Two round-trips where one would do',
        'src/server/auth/session.ts',
        18,
        '`findUnique` followed by `update` on the same key can be collapsed into a single `update` with a `select`, halving the latency of the hottest query in the service.',
        0.71,
        null,
      ),
    ],
    diff: DIFF_AUTH,
    tokens: { input: 18_420, output: 2_180 },
    filesChanged: 1,
    additions: 21,
    deletions: 5,
    redactions: 0,
  },
  {
    id: 'rv_002',
    repo: 'acme/atlas-web',
    number: 2290,
    title: 'Introduce discount codes at checkout',
    author: 'marcus-t',
    branch: 'feat/discount-codes',
    baseBranch: 'main',
    status: 'changes-requested',
    risk: 'high',
    createdAt: minutesAgo(38),
    durationMs: 31_400,
    summary:
      'Adds discount-code support to the pricing module. `applyDiscount` trusts an unvalidated lookup and will produce `NaN` totals for any unknown code, which flows straight into the payment intent.',
    findings: [
      finding(
        'fd_010',
        'bug',
        'Unknown discount code yields NaN instead of an error',
        'src/checkout/pricing.ts',
        33,
        '`DISCOUNTS[code]` is `undefined` for any code that is not in the table, so `total - total * undefined` evaluates to `NaN`. That value is passed to the payment intent and fails deep inside Stripe with an opaque error. Validate the code and reject unknown ones.',
        0.95,
        "  const discount = DISCOUNTS[code];\n  if (discount === undefined) {\n    throw new InvalidDiscountCodeError(code);\n  }\n  return total - total * discount;",
      ),
      finding(
        'fd_011',
        'bug',
        'Money is formatted with floating-point division',
        'src/checkout/pricing.ts',
        38,
        '`(cents / 100).toFixed(2)` loses precision for large amounts and rounds half-to-even inconsistently across engines. Use an integer-safe formatter or `Intl.NumberFormat` with the minor-unit value.',
        0.79,
        null,
      ),
      finding(
        'fd_012',
        'optimization',
        'The rewritten subtotal loop is slower than the reduce it replaced',
        'src/checkout/pricing.ts',
        25,
        'The manual loop is not faster than `reduce` on any modern engine and it drops the point-free style used everywhere else in this module. This change adds lines without adding value.',
        0.62,
        null,
      ),
      finding(
        'fd_013',
        'nit',
        'Prefer template literals over string concatenation',
        'src/checkout/pricing.ts',
        38,
        "`'$' + (cents / 100).toFixed(2)` reads better as a template literal, matching the rest of the file.",
        0.68,
        null,
      ),
    ],
    diff: DIFF_CHECKOUT,
    tokens: { input: 14_980, output: 1_940 },
    filesChanged: 1,
    additions: 16,
    deletions: 2,
    redactions: 0,
  },
  {
    id: 'rv_003',
    repo: 'acme/atlas-api',
    number: 4818,
    title: 'Wire up direct-to-S3 uploads',
    author: 'priya-n',
    branch: 'feat/s3-uploads',
    baseBranch: 'main',
    status: 'changes-requested',
    risk: 'high',
    createdAt: minutesAgo(96),
    durationMs: 38_700,
    summary:
      'Implements the upload handler against S3. The object key comes straight from the request body with no normalization, which allows a caller to write outside their prefix, and `ListObjectsV2Command` is used without being imported.',
    findings: [
      finding(
        'fd_020',
        'security',
        'Caller-controlled S3 key allows writing outside the tenant prefix',
        'src/api/uploads.ts',
        16,
        "`key` is taken verbatim from the form body, so a caller can pass `../../other-tenant/secret.json` and overwrite another tenant's object. Derive the key server-side from the authenticated tenant and a generated ID.",
        0.94,
        "  const key = `${tenantId}/${crypto.randomUUID()}`;",
      ),
      finding(
        'fd_021',
        'security',
        'No content-type allowlist or size limit on uploads',
        'src/api/uploads.ts',
        22,
        '`file.type` is attacker-controlled and passed straight to `ContentType`. Combined with a CDN that serves objects inline, this is a stored-XSS vector. Enforce an allowlist and cap the body size before buffering it into memory.',
        0.86,
        null,
      ),
      finding(
        'fd_022',
        'bug',
        '`ListObjectsV2Command` is used but never imported',
        'src/api/uploads.ts',
        29,
        'The import at the top of the file only pulls in `S3Client` and `PutObjectCommand`. `listUploads` will throw a `ReferenceError` the first time it runs.',
        0.99,
        "import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';",
      ),
      finding(
        'fd_023',
        'optimization',
        'Whole file is buffered into memory before upload',
        'src/api/uploads.ts',
        21,
        '`Buffer.from(await file.arrayBuffer())` materialises the entire upload in memory. Stream `file.stream()` into the S3 client instead so a large upload cannot exhaust the pod.',
        0.81,
        null,
      ),
    ],
    diff: DIFF_UPLOADS,
    tokens: { input: 16_310, output: 2_040 },
    filesChanged: 1,
    additions: 19,
    deletions: 3,
    redactions: 0,
  },
  {
    id: 'rv_004',
    repo: 'acme/atlas-web',
    number: 2287,
    title: 'Paginate the activity feed',
    author: 'sam-oduya',
    branch: 'fix/feed-pagination',
    baseBranch: 'main',
    status: 'passed',
    risk: 'medium',
    createdAt: minutesAgo(142),
    durationMs: 26_800,
    summary:
      'Fixes the missing dependency array that caused the feed to refetch on every render and adds cursor pagination. Correct overall; the remaining notes are about list keys and duplicate events.',
    findings: [
      finding(
        'fd_030',
        'bug',
        'Array index used as a React key',
        'src/components/ActivityFeed.tsx',
        26,
        'Using the index as a key means React reuses DOM nodes across pages, so an event can visually inherit the previous item’s state. Use `e.id`.',
        0.87,
        '        <li key={e.id}>{e.title}</li>',
      ),
      finding(
        'fd_031',
        'bug',
        'Appending pages can duplicate events',
        'src/components/ActivityFeed.tsx',
        18,
        'The effect appends to `events` whenever `userId` changes as well as `cursor`, so switching users appends the new user’s events to the previous user’s list instead of replacing them. Reset the list when `userId` changes.',
        0.84,
        null,
      ),
      finding(
        'fd_032',
        'optimization',
        'Missing loading and error states',
        'src/components/ActivityFeed.tsx',
        14,
        'A rejected fetch leaves the component permanently empty with no feedback. Track a status alongside the data.',
        0.66,
        null,
      ),
    ],
    diff: DIFF_FEED,
    tokens: { input: 12_240, output: 1_510 },
    filesChanged: 1,
    additions: 15,
    deletions: 4,
    redactions: 0,
  },
  {
    id: 'rv_005',
    repo: 'acme/atlas-api',
    number: 4815,
    title: 'Add billing + search integration config',
    author: 'dana-w',
    branch: 'chore/integration-config',
    baseBranch: 'main',
    status: 'changes-requested',
    risk: 'critical',
    createdAt: minutesAgo(198),
    durationMs: 22_300,
    summary:
      'Three hardcoded credentials were committed in this diff. The sanitizer redacted them before the payload left the runner, but they are still present in git history and must be rotated immediately.',
    findings: [
      finding(
        'fd_040',
        'security',
        'Hardcoded credentials committed to the repository',
        'src/config/integrations.ts',
        4,
        'Two secrets were replaced with `[REDACTED:…]` placeholders before this diff reached the model, which means they were committed in plaintext. Rotate both credentials, purge them from history, and move them to the secret store.',
        0.99,
        "    apiKey: process.env.METRICS_KEY,",
      ),
      finding(
        'fd_041',
        'security',
        'Billing token inlined instead of read from the environment',
        'src/config/integrations.ts',
        8,
        'The billing bearer token is checked in alongside the endpoint. Read it from `process.env.BILLING_TOKEN` and fail fast at boot when it is unset.',
        0.98,
        null,
      ),
      finding(
        'fd_042',
        'optimization',
        '30s search timeout will outlive the request budget',
        'src/config/integrations.ts',
        13,
        'The gateway cancels at 15s, so a 30s client timeout can never fire: the request is killed upstream first and the retry budget is wasted. Set it below the gateway timeout.',
        0.74,
        null,
      ),
    ],
    diff: DIFF_CONFIG,
    tokens: { input: 9_870, output: 1_320 },
    filesChanged: 1,
    additions: 9,
    deletions: 1,
    redactions: 3,
  },
  {
    id: 'rv_006',
    repo: 'acme/atlas-api',
    number: 4812,
    title: 'Add composite indexes for the events table',
    author: 'lin-zhao',
    branch: 'perf/event-indexes',
    baseBranch: 'main',
    status: 'passed',
    risk: 'medium',
    createdAt: minutesAgo(260),
    durationMs: 18_900,
    summary:
      'Adds two indexes and drops a legacy one inside a transaction. The index choices match the observed query patterns; the note is about lock behaviour on a large table.',
    findings: [
      finding(
        'fd_050',
        'optimization',
        'CREATE INDEX without CONCURRENTLY will lock writes',
        'migrations/0042_add_indexes.sql',
        3,
        '`events` is the largest table in the cluster. A plain `CREATE INDEX` takes an ACCESS EXCLUSIVE-adjacent lock for the duration of the build and will stall ingest. Use `CREATE INDEX CONCURRENTLY` outside the transaction block.',
        0.89,
        '+CREATE INDEX CONCURRENTLY idx_events_user_created ON events (user_id, created_at DESC);',
      ),
      finding(
        'fd_051',
        'nit',
        'Dropped index is not documented',
        'migrations/0042_add_indexes.sql',
        7,
        'Add a comment explaining what `idx_events_legacy` served, so a future rollback does not have to reconstruct the reasoning from git blame.',
        0.63,
        null,
      ),
    ],
    diff: DIFF_MIGRATION,
    tokens: { input: 6_420, output: 890 },
    filesChanged: 1,
    additions: 9,
    deletions: 0,
    redactions: 0,
  },
  {
    id: 'rv_007',
    repo: 'acme/atlas-docs',
    number: 611,
    title: 'Document metrics key rotation',
    author: 'priya-n',
    branch: 'docs/key-rotation',
    baseBranch: 'main',
    status: 'passed',
    risk: 'low',
    createdAt: minutesAgo(320),
    durationMs: 9_100,
    summary: 'Documentation-only change. Accurate, well-scoped, and consistent with the surrounding runbook. No blocking findings.',
    findings: [
      finding(
        'fd_060',
        'nit',
        'Mention the propagation delay after rotation',
        'docs/runbook.md',
        24,
        'Rolling the deployment does not evict in-flight pods immediately. A sentence about the ~2 minute propagation window would save the next on-call a confusing five minutes.',
        0.61,
        null,
      ),
    ],
    diff: DIFF_DOCS,
    tokens: { input: 4_180, output: 520 },
    filesChanged: 1,
    additions: 6,
    deletions: 0,
    redactions: 0,
  },
  {
    id: 'rv_008',
    repo: 'acme/atlas-web',
    number: 2281,
    title: 'Refresh the marketing hero section',
    author: 'marcus-t',
    branch: 'design/hero-refresh',
    baseBranch: 'main',
    status: 'passed',
    risk: 'low',
    createdAt: minutesAgo(410),
    durationMs: 11_600,
    summary: 'Presentational change with no logic. Clean diff, nothing worth blocking on.',
    findings: [],
    diff: DIFF_FEED,
    tokens: { input: 7_640, output: 410 },
    filesChanged: 3,
    additions: 42,
    deletions: 38,
    redactions: 0,
  },
  {
    id: 'rv_009',
    repo: 'acme/atlas-api',
    number: 4809,
    title: 'Retry failed webhook deliveries',
    author: 'sam-oduya',
    branch: 'feat/webhook-retry',
    baseBranch: 'main',
    status: 'running',
    risk: 'medium',
    createdAt: minutesAgo(6),
    durationMs: 0,
    summary: 'Review in progress: the diff has been sanitized and sent to the model.',
    findings: [],
    diff: DIFF_UPLOADS,
    tokens: { input: 0, output: 0 },
    filesChanged: 4,
    additions: 118,
    deletions: 12,
    redactions: 1,
  },
  {
    id: 'rv_010',
    repo: 'acme/atlas-web',
    number: 2276,
    title: 'Migrate the settings page to server actions',
    author: 'lin-zhao',
    branch: 'refactor/server-actions',
    baseBranch: 'main',
    status: 'failed',
    risk: 'high',
    createdAt: minutesAgo(520),
    durationMs: 3_200,
    summary:
      'The review failed closed: the model returned a payload that did not satisfy the response schema, so nothing was posted to the pull request. Re-run the workflow to retry.',
    findings: [],
    diff: DIFF_CHECKOUT,
    tokens: { input: 21_030, output: 160 },
    filesChanged: 9,
    additions: 264,
    deletions: 301,
    redactions: 0,
  },
  {
    id: 'rv_011',
    repo: 'acme/atlas-api',
    number: 4803,
    title: 'Cache tenant lookups in the request context',
    author: 'dana-w',
    branch: 'perf/tenant-cache',
    baseBranch: 'main',
    status: 'passed',
    risk: 'low',
    createdAt: minutesAgo(720),
    durationMs: 16_400,
    summary: 'Adds a per-request memo around the tenant lookup. Correct, well-scoped, and covered by tests.',
    findings: [
      finding(
        'fd_070',
        'optimization',
        'Cache has no negative-result handling',
        'src/server/auth/session.ts',
        22,
        'A missing tenant is re-queried on every call within the same request because `undefined` is treated as a cache miss. Store an explicit sentinel.',
        0.72,
        null,
      ),
    ],
    diff: DIFF_AUTH,
    tokens: { input: 11_120, output: 940 },
    filesChanged: 2,
    additions: 34,
    deletions: 9,
    redactions: 0,
  },
  {
    id: 'rv_012',
    repo: 'acme/atlas-web',
    number: 2270,
    title: 'Add keyboard navigation to the command palette',
    author: 'priya-n',
    branch: 'a11y/command-palette',
    baseBranch: 'main',
    status: 'passed',
    risk: 'low',
    createdAt: minutesAgo(880),
    durationMs: 14_200,
    summary: 'Solid accessibility work. Focus management is correct and the escape handling is properly scoped.',
    findings: [
      finding(
        'fd_080',
        'nit',
        'Duplicate aria-label on the palette input',
        'src/components/ActivityFeed.tsx',
        8,
        'The input has both `aria-label` and a visible `<label>`; screen readers will announce the accessible name twice. Drop the `aria-label`.',
        0.65,
        null,
      ),
    ],
    diff: DIFF_FEED,
    tokens: { input: 8_960, output: 700 },
    filesChanged: 2,
    additions: 61,
    deletions: 14,
    redactions: 0,
  },
  {
    id: 'rv_013',
    repo: 'acme/atlas-api',
    number: 4798,
    title: 'Expose per-tenant rate limit headers',
    author: 'lin-zhao',
    branch: 'feat/ratelimit-headers',
    baseBranch: 'main',
    status: 'changes-requested',
    risk: 'medium',
    createdAt: minutesAgo(1_050),
    durationMs: 20_700,
    summary: 'Adds `X-RateLimit-*` headers. The remaining-count calculation is off by one at the boundary.',
    findings: [
      finding(
        'fd_090',
        'bug',
        'Remaining count is off by one at the limit boundary',
        'src/api/uploads.ts',
        12,
        'The header reports `limit - used` after the counter has already been incremented for the current request, so a client that has exactly hit its limit is told it has one request left and gets a surprise 429.',
        0.86,
        null,
      ),
      finding(
        'fd_091',
        'optimization',
        'Rate-limit lookup happens twice per request',
        'src/api/uploads.ts',
        18,
        'The middleware reads the counter and the handler reads it again to build the header. Thread the value through the request context instead.',
        0.7,
        null,
      ),
    ],
    diff: DIFF_UPLOADS,
    tokens: { input: 13_450, output: 1_180 },
    filesChanged: 3,
    additions: 77,
    deletions: 21,
    redactions: 0,
  },
  {
    id: 'rv_014',
    repo: 'acme/atlas-docs',
    number: 604,
    title: 'Fix broken links in the API reference',
    author: 'marcus-t',
    branch: 'docs/fix-links',
    baseBranch: 'main',
    status: 'passed',
    risk: 'low',
    createdAt: minutesAgo(1_400),
    durationMs: 7_400,
    summary: 'Link-only change. Nothing to flag.',
    findings: [],
    diff: DIFF_DOCS,
    tokens: { input: 3_210, output: 280 },
    filesChanged: 6,
    additions: 12,
    deletions: 12,
    redactions: 0,
  },
];

export function findReview(id: string): PullRequestReview | undefined {
  return REVIEWS.find((review) => review.id === id);
}

// ---------------------------------------------------------------------------
// Analytics series
// ---------------------------------------------------------------------------

export interface TimePoint {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  value: number;
}

export interface TokenPoint {
  date: string;
  input: number;
  output: number;
}

function dayStamp(daysAgo: number): string {
  const d = new Date(NOW.getTime() - daysAgo * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Code-health score, 0-100. Trends upward over the window with realistic noise. */
export function healthSeries(days: number): TimePoint[] {
  const rng = mulberry32(0xc0ffee + days);
  const points: TimePoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const progress = (days - 1 - i) / Math.max(1, days - 1);
    const base = 62 + progress * 26;
    const noise = (rng() - 0.5) * 9;
    const dip = i === Math.floor(days * 0.35) ? -11 : 0;
    points.push({ date: dayStamp(i), value: clamp(Math.round(base + noise + dip), 0, 100) });
  }
  return points;
}

export function tokenSeries(days: number): TokenPoint[] {
  const rng = mulberry32(0xbadf00d + days);
  const points: TokenPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const weekday = new Date(NOW.getTime() - i * 86_400_000).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const scale = weekend ? 0.28 : 1;
    const input = Math.round((90_000 + rng() * 140_000) * scale);
    points.push({ date: dayStamp(i), input, output: Math.round(input * (0.1 + rng() * 0.05)) });
  }
  return points;
}

export interface CategoryCount {
  severity: Severity;
  label: string;
  count: number;
}

export function categoryBreakdown(days: number): CategoryCount[] {
  const rng = mulberry32(0x5eed + days);
  const weights: Record<Severity, number> = { security: 0.22, bug: 0.38, optimization: 0.27, nit: 0.13 };
  const total = Math.round(180 + days * 6 + rng() * 40);
  return (Object.keys(weights) as Severity[]).map((severity) => ({
    severity,
    label: SEVERITY_LABELS[severity],
    count: Math.max(1, Math.round(total * weights[severity] * (0.85 + rng() * 0.3))),
  }));
}

export interface TopIssue {
  label: string;
  count: number;
  severity: Severity;
}

export function topIssues(days: number): TopIssue[] {
  const rng = mulberry32(0xfeed + days);
  const rows: TopIssue[] = [
    { label: 'Unvalidated user input', count: 0, severity: 'security' },
    { label: 'Missing null / undefined guard', count: 0, severity: 'bug' },
    { label: 'Unhandled promise rejection', count: 0, severity: 'bug' },
    { label: 'N+1 database query', count: 0, severity: 'optimization' },
    { label: 'Hardcoded credential', count: 0, severity: 'security' },
    { label: 'Missing dependency array', count: 0, severity: 'bug' },
    { label: 'Unnecessary re-render', count: 0, severity: 'optimization' },
    { label: 'Inconsistent naming', count: 0, severity: 'nit' },
  ];
  const scale = 1 + days / 30;
  return rows
    .map((row, i) => ({ ...row, count: Math.round((44 - i * 4) * scale * (0.8 + rng() * 0.45)) }))
    .sort((a, b) => b.count - a.count);
}

export const SEVERITY_LABELS: Record<Severity, string> = {
  security: 'Security',
  bug: 'Bug',
  optimization: 'Optimization',
  nit: 'Nit',
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  passed: 'Passed',
  'changes-requested': 'Changes requested',
  running: 'Running',
  failed: 'Failed',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// Derived headline metrics
// ---------------------------------------------------------------------------

export interface HeadlineMetrics {
  reviewsToday: number;
  findingsOpen: number;
  securityFindings: number;
  secretsRedacted: number;
  medianDurationSec: number;
  tokensThisWeek: number;
  healthScore: number;
  healthDelta: number;
  autoResolvedPct: number;
}

export function headlineMetrics(): HeadlineMetrics {
  const findings = REVIEWS.flatMap((r) => r.findings);
  const durations = REVIEWS.filter((r) => r.durationMs > 0)
    .map((r) => r.durationMs)
    .sort((a, b) => a - b);
  const median = durations.length
    ? durations[Math.floor(durations.length / 2)] ?? durations[0] ?? 0
    : 0;

  const health = healthSeries(30);
  const latest = health[health.length - 1]?.value ?? 0;
  const weekAgo = health[health.length - 8]?.value ?? latest;

  const week = tokenSeries(7);

  return {
    reviewsToday: REVIEWS.filter((r) => NOW.getTime() - new Date(r.createdAt).getTime() < 86_400_000).length,
    findingsOpen: findings.length,
    securityFindings: findings.filter((f) => f.severity === 'security').length,
    secretsRedacted: REVIEWS.reduce((sum, r) => sum + r.redactions, 0),
    medianDurationSec: Math.round((median ?? 0) / 1000),
    tokensThisWeek: week.reduce((sum, p) => sum + p.input + p.output, 0),
    healthScore: latest,
    healthDelta: latest - weekAgo,
    autoResolvedPct: 63,
  };
}
