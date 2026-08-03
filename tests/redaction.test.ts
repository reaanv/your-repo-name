/**
 * Regression tests for secret classes that were once forwarded to the model.
 *
 * Every case in `LEAKS` below was verified leaking against a previous revision
 * of `src/sanitizer.ts`. They live in their own file because they are not
 * "does the sanitizer work" tests — they are a list of holes that must stay
 * shut, and each one names the shape of diff that found it.
 *
 * `KEPT` is the other half of the contract: reading a credential from the
 * environment is the pattern we want a reviewer to *see* and approve, so
 * redacting it would make the review worse. Over-redaction is a real cost, not
 * a free safety margin.
 *
 * Run with: npm run test:unit
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { redactSecrets, sanitizeDiff } from '../src/sanitizer.js';

/** [name, diff line, the substring that must NOT survive] */
const LEAKS: Array<[string, string, string]> = [
  [
    'dotenv assignment with no quotes',
    '+DATABASE_PASSWORD=hunter2hunter2supersecret',
    'hunter2hunter2supersecret',
  ],
  ['YAML value with no quotes', '+  api_key: AbCdEfGh12345678xyz', 'AbCdEfGh12345678xyz'],
  ['shell export', '+export CLIENT_SECRET=s3cr3tvalue12345', 's3cr3tvalue12345'],
  ['ini-style spaced assignment', '+password = mysupersecret123', 'mysupersecret123'],
  [
    'JS template literal',
    '+const apiKey = `sk_prod_abcdefgh12345678`;',
    'sk_prod_abcdefgh12345678',
  ],
  [
    'lowercase bearer scheme (RFC 7235 makes it case-insensitive)',
    "+  headers: {'Authorization': 'bearer abcdefghij1234567890'}",
    'abcdefghij1234567890',
  ],
  [
    'lowercase basic scheme — the value base64-decodes to user:password',
    "+curl -H 'authorization: basic dXNlcjpwYXNzd29yZA=='",
    'dXNlcjpwYXNzd29yZA==',
  ],
  [
    'PGP armored key — the header ends in " BLOCK-----", not "KEY-----"',
    '+-----BEGIN PGP PRIVATE KEY BLOCK-----\n+lQOYBGF1c2VyAQxyzzy0123456789\n+-----END PGP PRIVATE KEY BLOCK-----',
    'lQOYBGF1c2VyAQxyzzy0123456789',
  ],
  [
    'Azure connection string AccountKey',
    '+DefaultEndpointsProtocol=https;AccountKey=abc123def456ghi789jkl012mno345pqr678==;EndpointSuffix=core.windows.net',
    'abc123def456ghi789jkl012mno345pqr678==',
  ],
];

for (const [name, line, secret] of LEAKS) {
  test(`redactSecrets closes the leak: ${name}`, () => {
    const result = redactSecrets(line);
    assert.ok(
      !result.text.includes(secret),
      `secret survived redaction:\n  in:  ${line}\n  out: ${result.text}`,
    );
    assert.ok(result.totalRedactions > 0, 'redaction happened but was not counted');
  });
}

/** Values that are references or placeholders — redacting them hides good code. */
const KEPT: Array<[string, string]> = [
  ['env read (JS)', '+  password: process.env.DB_PASSWORD'],
  ['env read (Python)', '+  api_key = os.environ["API_KEY"]'],
  ['Actions secret interpolation', '+  token: ${{ secrets.GITHUB_TOKEN }}'],
  ['config lookup', "+  const secret = config.get('secret');"],
  ['explicit null', '+  password: null'],
  ['explicit undefined', '+  apiKey: undefined'],
  ['documented placeholder', '+PASSWORD=your-password-here'],
  ['CHANGEME placeholder', '+  password = CHANGEME'],
  ['identifier that merely contains "key"', '+const monkey = "bananas12345";'],
];

for (const [name, line] of KEPT) {
  test(`redactSecrets leaves a non-secret alone: ${name}`, () => {
    const result = redactSecrets(line);
    assert.equal(
      result.totalRedactions,
      0,
      `over-redacted a symbolic reference:\n  in:  ${line}\n  out: ${result.text}`,
    );
    assert.equal(result.text, line);
  });
}

test('an entire .env file is redacted line by line, not skipped wholesale', () => {
  const envDiff = `diff --git a/.env.production b/.env.production
new file mode 100644
--- /dev/null
+++ b/.env.production
@@ -0,0 +1,5 @@
+DATABASE_PASSWORD=pr0duct10nD4tabase
+STRIPE_SECRET=sk_live_abcdefghijklmnop
+SESSION_KEY=8f14e45fceea167a5a36dedd4bea2543
+REDIS_PASSWORD=cache-me-if-you-can-123
+PUBLIC_APP_NAME=Atlas
`;

  const result = sanitizeDiff(envDiff, { maxChars: 100_000, maxFiles: 20 });

  for (const secret of [
    'pr0duct10nD4tabase',
    'sk_live_abcdefghijklmnop',
    '8f14e45fceea167a5a36dedd4bea2543',
    'cache-me-if-you-can-123',
  ]) {
    assert.ok(!result.content.includes(secret), `${secret} reached the payload`);
  }

  // The non-secret key keeps its value: the reviewer still sees what changed.
  assert.ok(result.content.includes('PUBLIC_APP_NAME=Atlas'));
  assert.equal(result.totalRedactions, 4);
});

test('redaction stays idempotent for the unquoted rule', () => {
  const once = redactSecrets('+DB_PASSWORD=supersecretvalue');
  const twice = redactSecrets(once.text);

  assert.equal(twice.totalRedactions, 0, 'a placeholder was itself redacted');
  assert.equal(twice.text, once.text);
});

test('a trailing comment survives an unquoted redaction', () => {
  // The value class stops at `#` so the reviewer keeps the author's intent.
  const result = redactSecrets('+API_KEY=abcdefgh12345678 # rotate before launch');

  assert.ok(!result.text.includes('abcdefgh12345678'));
  assert.ok(result.text.includes('# rotate before launch'));
});
