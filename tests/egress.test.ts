/**
 * Egress test: what actually leaves the runner.
 *
 * Every other test in this repo checks a function's return value. This one
 * checks the bytes on the wire. `sanitizeDiff` can be perfect and the Action can
 * still leak — if a caller forgets to use it, sends the raw diff alongside the
 * sanitized one, or puts an unredacted PR body in the prompt. That is exactly
 * the class of bug that unit tests structurally cannot catch, and it is the one
 * that matters most here: the whole security premise of this project is
 * "credentials in a diff never reach the model provider."
 *
 * So the entire pipeline runs for real against a loopback HTTP server, with
 * both `GITHUB_API_URL` and `ANTHROPIC_BASE_URL` pointed at it, and the captured
 * request body is searched for every secret that was planted upstream.
 *
 * The assertion is deliberately blunt — a plain substring scan over the whole
 * serialized body, not over a field the test picked. If a secret appears
 * anywhere, in any shape, in anything sent to the provider, this fails.
 *
 * Run with: npm run test:unit
 */

import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

const PULL_NUMBER = 99;
const REPO_PATH = `/repos/acme/widgets/pulls/${PULL_NUMBER}`;

/**
 * One planted secret per redaction rule that a real diff plausibly carries.
 * `value` must not survive into the request body; `label` names it in failures.
 */
const PLANTED: Array<{ label: string; value: string }> = [
  { label: 'AWS access key id', value: 'AKIAIOSFODNN7EXAMPLE' },
  { label: 'AWS secret access key', value: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' },
  { label: 'Anthropic key', value: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789' },
// removed
  { label: 'GitHub PAT', value: 'ghp_ABCdefGHIjklMNOpqrSTUvwxYZ0123456789' },
// removed
  { label: 'Google API key', value: 'AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q' },
  { label: 'unquoted dotenv password', value: 'pr0duct10nD4tabaseP4ss' },
  { label: 'unquoted YAML api key', value: 'AbCdEfGh12345678xyzQQ' },
  { label: 'bearer token (lowercase scheme)', value: 'abcdefghij1234567890bearerleak' },
  { label: 'connection string password', value: 'sup3rs3cr3tPgP4ssw0rd' },
];

/** A diff that carries every planted secret, in the shape each really appears. */
const HOSTILE_DIFF = `diff --git a/.env.production b/.env.production
new file mode 100644
--- /dev/null
+++ b/.env.production
@@ -0,0 +1,4 @@
+DATABASE_PASSWORD=pr0duct10nD4tabaseP4ss
+AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
+AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
+PUBLIC_APP_NAME=Atlas
diff --git a/config/app.yml b/config/app.yml
--- a/config/app.yml
+++ b/config/app.yml
@@ -1,2 +1,5 @@
 service: widgets
+  api_key: AbCdEfGh12345678xyzQQ
+  database_url: postgres://svc:sup3rs3cr3tPgP4ssw0rd@db.internal:5432/widgets
diff --git a/src/clients.ts b/src/clients.ts
--- a/src/clients.ts
+++ b/src/clients.ts
@@ -1,3 +1,9 @@
 import Anthropic from '@anthropic-ai/sdk';
+const anthropic = new Anthropic({ apiKey: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789' });
// removed
+const gh = 'ghp_ABCdefGHIjklMNOpqrSTUvwxYZ0123456789';
// removed
+const maps = 'AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q';
+// correct code that must survive: const key = process.env.SERVICE_API_KEY;
`;

/**
 * The PR description. Historically this was forwarded verbatim: a pasted
 * failing request with a live header is a routine thing to put in one.
 */
const PR_BODY = [
  'Repro for the 401 we saw in staging:',
  '',
  '```',
  "curl -H 'authorization: bearer abcdefghij1234567890bearerleak' https://api.internal/v1/me",
  '```',
];

const REVIEW_PAYLOAD = {
  summary: 'Credentials were committed.',
  overall_risk: 'critical',
  comments: [
    {
      path: 'src/clients.ts',
      line: 2,
      severity: 'security',
      title: 'Hardcoded credential',
      body: 'Move this to a secret.',
      suggestion: null,
      confidence: 0.99,
    },
  ],
};

// --------------------------------------------------------------------------
// Loopback provider
// --------------------------------------------------------------------------

/** Every body POSTed to `/v1/messages`, verbatim. */
const anthropicBodies: string[] = [];

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      raw += chunk;
    });
    req.on('end', () => resolve(raw));
  });
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  void (async () => {
    const path = (req.url ?? '').split('?')[0] ?? '';
    const body = await readBody(req);

    const send = (status: number, contentType: string, payload: string): void => {
      res.writeHead(status, { 'content-type': contentType });
      res.end(payload);
    };
    const json = (payload: unknown): void =>
      send(200, 'application/json; charset=utf-8', JSON.stringify(payload));

    if (path === '/v1/messages') {
      anthropicBodies.push(body);
      json({
        id: 'msg_egress_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5',
        content: [{ type: 'text', text: JSON.stringify(REVIEW_PAYLOAD) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      });
      return;
    }

    if (path === `${REPO_PATH}/reviews`) {
      json({ id: 1, state: 'COMMENTED' });
      return;
    }

    if (path === REPO_PATH) {
      if ((req.headers.accept ?? '').includes('diff')) {
        send(200, 'text/plain; charset=utf-8', HOSTILE_DIFF);
      } else {
        json({
          number: PULL_NUMBER,
          title: 'Hotfix: rotate AKIAIOSFODNN7EXAMPLE after deploy',
          body: PR_BODY.join('\n'),
        });
      }
      return;
    }

    send(404, 'application/json; charset=utf-8', JSON.stringify({ message: `unrouted ${path}` }));
  })();
});

await new Promise<void>((resolve) => {
  server.listen(0, '127.0.0.1', resolve);
});
server.unref();
const { port } = server.address() as AddressInfo;
const BASE = `http://127.0.0.1:${port}`;

after(() => {
  server.closeAllConnections();
  server.close();
});

// --------------------------------------------------------------------------
// Environment
//
// `@actions/github` snapshots the repo slug, the event payload and the API base
// URL on first import, so every one of these must be set before `src/index.ts`
// is imported below.
// --------------------------------------------------------------------------

const WORKSPACE = mkdtempSync(join(tmpdir(), 'egress-test-'));
const EVENT_PATH = join(WORKSPACE, 'event.json');
writeFileSync(
  EVENT_PATH,
  JSON.stringify({
    pull_request: { number: PULL_NUMBER, head: { sha: 'a'.repeat(40) } },
  }),
);

process.env.GITHUB_EVENT_PATH = EVENT_PATH;
process.env.GITHUB_EVENT_NAME = 'pull_request';
process.env.GITHUB_REPOSITORY = 'acme/widgets';
process.env.GITHUB_API_URL = BASE;
process.env.GITHUB_TOKEN = 'github-token-for-tests';
process.env.ANTHROPIC_BASE_URL = BASE;
process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-test-key-not-a-real-credential';
process.env.GITHUB_OUTPUT = join(WORKSPACE, 'outputs.txt');
writeFileSync(process.env.GITHUB_OUTPUT, '');
process.env.REVIEW_DRY_RUN = 'false';
process.env.REVIEW_MIN_CONFIDENCE = '0';

// --------------------------------------------------------------------------
// The run
// --------------------------------------------------------------------------

const log: string[] = [];
const realWrite = process.stdout.write;
process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => {
  log.push(typeof chunk === 'string' ? chunk : String(chunk));
  return (realWrite as (...a: unknown[]) => boolean).call(process.stdout, chunk, ...rest);
}) as typeof process.stdout.write;

let runError: unknown = null;
try {
  const { run } = await import('../src/index.js');
  await run();
} catch (error) {
  runError = error;
} finally {
  process.stdout.write = realWrite;
}

const stdout = log.join('');
const outbound = anthropicBodies.join('\n');

// --------------------------------------------------------------------------
// Assertions
// --------------------------------------------------------------------------

test('the run completed against the loopback provider', () => {
  assert.equal(runError, null, `run() threw: ${String(runError)}`);
  assert.equal(anthropicBodies.length, 1, 'expected exactly one call to the model provider');
});

for (const { label, value } of PLANTED) {
  test(`no secret reaches the provider: ${label}`, () => {
    assert.ok(
      !outbound.includes(value),
      `"${label}" was sent to the model provider verbatim.\n` +
        `The payload is what leaves the runner — this is a live credential leak, not a style issue.`,
    );
  });
}

test('the secret planted in the PR title never reaches the provider', () => {
  // The title is author-controlled and goes into the same prompt as the diff.
  assert.ok(!outbound.includes('AKIAIOSFODNN7EXAMPLE'));
});

test('the secret planted in the PR body never reaches the provider', () => {
  assert.ok(!outbound.includes('abcdefghij1234567890bearerleak'));
});

test('the redacted payload still carries the reviewable code', () => {
  // A sanitizer that deletes everything would pass every test above and make
  // the product useless, so assert the surviving signal too.
  assert.ok(outbound.includes('src/clients.ts'), 'file paths were stripped');
  assert.ok(outbound.includes('PUBLIC_APP_NAME=Atlas'), 'a non-secret value was over-redacted');
  assert.ok(
    outbound.includes('process.env.SERVICE_API_KEY'),
    'a correct environment read was redacted — that is the pattern reviewers should see',
  );
  assert.ok(outbound.includes('[REDACTED:'), 'nothing was marked as redacted at all');
});

test('the run reports the redactions it performed', () => {
  // Silent redaction is its own failure: whoever reads the summary is the
  // person who has to decide whether to rotate the credential.
  // On modern runners `core.setOutput` writes to the GITHUB_OUTPUT file rather
  // than stdout, so read it there and fall back to the legacy stdout command.
  const outputs = readFileSync(process.env.GITHUB_OUTPUT as string, 'utf8');
  const match =
    /redactions<<[^\n]*\n(\d+)/.exec(outputs) ??
    /::set-output name=redactions::(\d+)/.exec(stdout);

  const reported = Number(match?.[1] ?? '0');
  assert.ok(reported > 0, `the run reported ${reported} redactions for a diff full of secrets`);

  // And the warning that names them has to be on the log, not just the output.
  assert.match(stdout, /Redacted \d+ potential secret/i);
});
