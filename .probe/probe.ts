import { redactSecrets } from '../src/sanitizer.js';

const cases: Array<[string, string]> = [
  ['dotenv unquoted', '+DATABASE_PASSWORD=hunter2hunter2supersecret'],
  ['yaml unquoted', '+  api_key: AbCdEfGh12345678xyz'],
  ['dockerfile ENV', '+ENV AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY123'],
  ['shell export', '+export CLIENT_SECRET=s3cr3tvalue12345'],
  ['backtick js', '+const apiKey = `sk_prod_abcdefgh12345678`;'],
  ['lowercase bearer', "+  headers: {'Authorization': 'bearer abcdefghij1234567890'}"],
  ['lowercase basic', "+curl -H 'authorization: basic dXNlcjpwYXNzd29yZA=='"],
  ['PGP block', '+-----BEGIN PGP PRIVATE KEY BLOCK-----\n+lQOYBGF1c2VyAQ\n+-----END PGP PRIVATE KEY BLOCK-----'],
  ['OpenSSH block', '+-----BEGIN OPENSSH PRIVATE KEY-----\n+b3BlbnNzaC1rZXk\n+-----END OPENSSH PRIVATE KEY-----'],
  ['azure AccountKey', '+DefaultEndpointsProtocol=https;AccountKey=abc123def456ghi789jkl012mno345pqr678==;'],
  ['ini', '+password = mysupersecret123'],
  ['CONTROL quoted', '+const password = "hunter2hunter2";'],
  ['CONTROL Bearer', '+Authorization: Bearer abcdefghij1234567890'],
];

for (const [name, input] of cases) {
  const r = redactSecrets(input);
  const safe = r.totalRedactions > 0;
  console.log(`${safe ? 'REDACTED ' : '** LEAK **'} ${name.padEnd(20)} -> ${r.text.replace(/\n/g, '\\n').slice(0, 78)}`);
}

console.log('\n--- non-regression: symbolic references must NOT be redacted ---');
const clean = [
  '+  password: process.env.DB_PASSWORD',
  '+  token: ${{ secrets.GITHUB_TOKEN }}',
  '+  api_key = os.environ["API_KEY"]',
  "+  const secret = config.get('secret');",
  '+  password: null',
  '+  apiKey: undefined',
  '+PASSWORD=your-password-here',
  '+  password = CHANGEME',
  '+const monkey = "bananas12345";',
  '+  password: hunter2 # short',
];
for (const c of clean) {
  const r = redactSecrets(c);
  console.log(`${r.totalRedactions === 0 ? 'kept    ' : '!! OVER-REDACTED'} ${r.text}`);
}
