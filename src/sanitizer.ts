/**
 * Sanitization Pipeline.
 *
 * Two responsibilities, in this order:
 *   1. Redact secrets so nothing sensitive ever reaches the LLM provider.
 *   2. Keep the payload inside a token budget by dropping/truncating files.
 *
 * Redaction runs BEFORE truncation so a secret can never survive by being
 * split across a truncation boundary.
 */

export interface RedactionRule {
  /** Stable identifier that shows up in logs and in the placeholder. */
  id: string;
  /** Human readable description used in the run summary. */
  label: string;
  pattern: RegExp;
  /** Builds the replacement. Receives the full match plus capture groups. */
  replace: (match: string, groups: string[]) => string;
}

export interface RedactionCount {
  id: string;
  label: string;
  count: number;
}

export interface SanitizeOptions {
  /** Hard cap on the sanitized diff, in characters. Default 180_000 (~45k tokens). */
  maxChars?: number;
  /** Maximum number of files to include. Default 60. */
  maxFiles?: number;
  /** Per-file ceiling regardless of the global budget. Default 24_000. */
  maxCharsPerFile?: number;
  /** Extra glob-ish substrings to skip, on top of the built-in noise list. */
  extraIgnoredPaths?: string[];
}

export interface SanitizedDiff {
  /** The redacted, size-bounded diff that is safe to send to the LLM. */
  content: string;
  redactions: RedactionCount[];
  totalRedactions: number;
  originalChars: number;
  sanitizedChars: number;
  /** True if any file was dropped or shortened. */
  truncated: boolean;
  /** Files that were included but shortened. */
  truncatedFiles: string[];
  /** Files dropped because the budget ran out. */
  omittedFiles: string[];
  /** Files dropped because they are generated/vendored noise. */
  skippedFiles: string[];
  filesInDiff: number;
  filesIncluded: number;
}

const placeholder = (id: string): string => `[REDACTED:${id}]`;

/**
 * Identifier substrings that mark an assignment as credential-bearing, plus the
 * `=`/`:` that follows. Shared by the quoted and unquoted assignment rules so
 * the two can never drift apart — a name added here is caught in both forms.
 *
 * Capture groups: 1 = the identifier, 2 = the separator.
 */
const SECRET_KEY_ASSIGNMENT =
  '\\b([A-Za-z0-9_.-]*(?:api[_-]?key|secret|passwd|password|pwd|token|' +
  'access[_-]?key|account[_-]?key|shared[_-]?access[_-]?key|client[_-]?secret|' +
  'private[_-]?key|signing[_-]?key|encryption[_-]?key|session[_-]?key|' +
  'auth[_-]?token|refresh[_-]?token|credential|dsn)[A-Za-z0-9_.-]*)\\b(\\s*[:=]\\s*)';

/**
 * Values that are references or placeholders rather than live credentials.
 * Redacting these would hide the *correct* pattern from the reviewer — reading a
 * secret from the environment is exactly what we want a PR to be praised for —
 * so they are exempted from the unquoted rule. The `i` flag covers case.
 */
const SYMBOLIC_VALUE_PREFIXES =
  '(?:process\\.env|import\\.meta\\.env|Deno\\.env|os\\.environ|os\\.getenv|' +
  'System\\.getenv|getenv|ENV\\[|ENV\\.|env\\[|env\\.|secrets\\.|vars\\.|' +
  'config\\.|settings\\.|self\\.|this\\.|None\\b|null\\b|nil\\b|undefined\\b|' +
  'true\\b|false\\b|REDACTED|CHANGEME|placeholder|example\\b|your[-_])';

/**
 * Ordered most-specific first. A private key block has to be swallowed whole
 * before the generic assignment rule gets a chance to nibble at one line of it.
 */
export const REDACTION_RULES: RedactionRule[] = [
  {
    id: 'PRIVATE_KEY_BLOCK',
    label: 'PEM/PGP private key block',
    // `PRIVATE KEY` may be followed by ` BLOCK` — that is how PGP/GnuPG armors
    // its secret keyring (`-----BEGIN PGP PRIVATE KEY BLOCK-----`). Anchoring on
    // `PRIVATE KEY-----` alone silently forwards every line of an armored key.
    pattern:
      /-----BEGIN[A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END[A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/g,
    replace: () => placeholder('PRIVATE_KEY_BLOCK'),
  },
  {
    id: 'AWS_ACCESS_KEY_ID',
    label: 'AWS access key ID',
    pattern: /\b(?:AKIA|ASIA|ABIA|ACCA|AGPA|AIDA|AIPA|ANPA|ANVA|AROA)[0-9A-Z]{16}\b/g,
    replace: () => placeholder('AWS_ACCESS_KEY_ID'),
  },
  {
    id: 'AWS_SECRET_ACCESS_KEY',
    label: 'AWS secret access key',
    pattern:
      /\b(aws[_-]?(?:secret|private)[_-]?(?:access[_-]?)?key)\b(\s*[:=]\s*)(["']?)[A-Za-z0-9/+=]{40}\3/gi,
    replace: (_m, g) => `${g[0]}${g[1]}${g[2] ?? ''}${placeholder('AWS_SECRET_ACCESS_KEY')}${g[2] ?? ''}`,
  },
  {
    id: 'ANTHROPIC_API_KEY',
    label: 'Anthropic API key',
    pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}/g,
    replace: () => placeholder('ANTHROPIC_API_KEY'),
  },
  {
    id: 'STRIPE_KEY',
    label: 'Stripe secret/restricted key',
    pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    replace: () => placeholder('STRIPE_KEY'),
  },
  {
    id: 'GENERIC_SK_KEY',
    label: 'sk-… provider API key',
    pattern: /\bsk-[A-Za-z0-9_-]{16,}/g,
    replace: () => placeholder('GENERIC_SK_KEY'),
  },
  {
    id: 'GITHUB_TOKEN',
    label: 'GitHub token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})\b/g,
    replace: () => placeholder('GITHUB_TOKEN'),
  },
  {
    id: 'SLACK_TOKEN',
    label: 'Slack token',
    pattern: /\bxox[baprse]-[A-Za-z0-9-]{10,}\b/g,
    replace: () => placeholder('SLACK_TOKEN'),
  },
  {
    id: 'GOOGLE_API_KEY',
    label: 'Google API key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    replace: () => placeholder('GOOGLE_API_KEY'),
  },
  {
    id: 'SENDGRID_KEY',
    label: 'SendGrid API key',
    pattern: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g,
    replace: () => placeholder('SENDGRID_KEY'),
  },
  {
    id: 'NPM_TOKEN',
    label: 'npm access token',
    pattern: /\bnpm_[A-Za-z0-9]{30,}\b/g,
    replace: () => placeholder('NPM_TOKEN'),
  },
  {
    id: 'JWT',
    label: 'JSON Web Token',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replace: () => placeholder('JWT'),
  },
  // HTTP auth schemes are case-insensitive (RFC 7235 §2.1), and lowercase
  // `bearer`/`basic` are routine in curl snippets and requests/axios fixtures.
  // Matching case-sensitively leaks the credential these rules exist to catch.
  {
    id: 'BEARER_TOKEN',
    label: 'Bearer authorization token',
    pattern: /\b(Bearer)\s+([A-Za-z0-9\-._~+/]{12,}={0,2})/gi,
    replace: (_m, g) => `${g[0]} ${placeholder('BEARER_TOKEN')}`,
  },
  {
    id: 'BASIC_AUTH_HEADER',
    label: 'Basic authorization header',
    // Worse than Bearer when it leaks: the value base64-decodes to user:password.
    pattern: /\b(Basic)\s+([A-Za-z0-9+/]{12,}={0,2})/gi,
    replace: (_m, g) => `${g[0]} ${placeholder('BASIC_AUTH_HEADER')}`,
  },
  {
    id: 'CONNECTION_STRING_PASSWORD',
    label: 'Password inside a connection string',
    pattern: /\b([a-z][a-z0-9+.-]*):\/\/([^:/\s@"']+):([^@/\s"']+)@/gi,
    replace: (_m, g) => `${g[0]}://${g[1]}:${placeholder('CONNECTION_STRING_PASSWORD')}@`,
  },
  {
    id: 'GENERIC_SECRET_ASSIGNMENT',
    label: 'Hardcoded secret assignment (quoted)',
    // Backticks count: a template literal is the idiomatic way to write a secret
    // in modern JS, and omitting them left `const key = \`...\`` fully exposed.
    pattern: new RegExp(`${SECRET_KEY_ASSIGNMENT}(["'\`])([^"'\`\\n]{8,})\\3`, 'gi'),
    replace: (_m, g) => `${g[0]}${g[1]}${g[2]}${placeholder('GENERIC_SECRET_ASSIGNMENT')}${g[2]}`,
  },
  {
    id: 'UNQUOTED_SECRET_ASSIGNMENT',
    label: 'Hardcoded secret assignment (unquoted)',
    // The quoted rule above made the surrounding quote mandatory, so an entire
    // `.env` file — the single most common way a credential reaches a diff —
    // passed through with zero redactions. Every unquoted form (dotenv, YAML,
    // Dockerfile ENV, shell export, .ini, `AccountKey=...;`) lands here.
    //
    // The value class deliberately stops at whitespace, quotes, `;`, `,` and `#`
    // so a trailing comment or the next key of a connection string survives, and
    // excludes `$`/`{`/`<` so `${{ secrets.X }}` never matches in the first place.
    pattern: new RegExp(
      `${SECRET_KEY_ASSIGNMENT}(?!["'\`])(?!${SYMBOLIC_VALUE_PREFIXES})([A-Za-z0-9_\\-./+=~]{8,})`,
      'gi',
    ),
    replace: (_m, g) => `${g[0]}${g[1]}${placeholder('UNQUOTED_SECRET_ASSIGNMENT')}`,
  },
];

/** Paths whose diffs are pure noise for a code review and pure cost for tokens. */
const DEFAULT_IGNORED_PATHS = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'Cargo.lock',
  'poetry.lock',
  'composer.lock',
  'Gemfile.lock',
  'go.sum',
  '/node_modules/',
  '/dist/',
  '/build/',
  '/.next/',
  '/vendor/',
  '.min.js',
  '.min.css',
  '.map',
  '.snap',
];

const BINARY_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz',
  '.tar', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3', '.wasm',
];

export interface RedactionResult {
  text: string;
  redactions: RedactionCount[];
  totalRedactions: number;
}

/**
 * Runs every redaction rule over `text`. Pure — never mutates its input.
 */
export function redactSecrets(text: string): RedactionResult {
  let output = text;
  const redactions: RedactionCount[] = [];

  for (const rule of REDACTION_RULES) {
    let count = 0;
    // A fresh RegExp per pass keeps `lastIndex` from leaking between calls.
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    output = output.replace(pattern, (match: string, ...rest: unknown[]) => {
      count += 1;
      // `rest` tail is offset, whole string, and (when named groups exist) the groups object.
      const groups = rest.filter((v): v is string => typeof v === 'string');
      return rule.replace(match, groups);
    });
    if (count > 0) {
      redactions.push({ id: rule.id, label: rule.label, count });
    }
  }

  const totalRedactions = redactions.reduce((sum, r) => sum + r.count, 0);
  return { text: output, redactions, totalRedactions };
}

export interface DiffFileChunk {
  index: number;
  path: string;
  text: string;
  chars: number;
}

/** Splits a unified diff into one chunk per file. */
export function splitDiffIntoFiles(diff: string): DiffFileChunk[] {
  if (!diff.trim()) return [];

  const lines = diff.split('\n');
  const chunks: DiffFileChunk[] = [];
  let current: string[] = [];

  const flush = (): void => {
    if (current.length === 0) return;
    const text = current.join('\n');
    chunks.push({
      index: chunks.length,
      path: extractPath(current),
      text,
      chars: text.length,
    });
    current = [];
  };

  for (const line of lines) {
    if (line.startsWith('diff --git ')) flush();
    current.push(line);
  }
  flush();

  return chunks;
}

function extractPath(lines: string[]): string {
  for (const line of lines) {
    if (line.startsWith('+++ ')) {
      const raw = line.slice(4).trim();
      if (raw !== '/dev/null') return stripPrefix(raw);
    }
  }
  for (const line of lines) {
    if (line.startsWith('--- ')) {
      const raw = line.slice(4).trim();
      if (raw !== '/dev/null') return stripPrefix(raw);
    }
  }
  const header = lines[0];
  if (header?.startsWith('diff --git ')) {
    const parts = header.slice('diff --git '.length).split(' b/');
    const tail = parts[1];
    if (tail) return tail.trim();
  }
  return 'unknown';
}

function stripPrefix(p: string): string {
  if (p.startsWith('a/') || p.startsWith('b/')) return p.slice(2);
  return p;
}

function isIgnoredPath(path: string, extra: string[]): boolean {
  const normalized = `/${path}`;
  const haystack = normalized.toLowerCase();
  const needles = [...DEFAULT_IGNORED_PATHS, ...extra, ...BINARY_EXTENSIONS];
  return needles.some((needle) => haystack.includes(needle.toLowerCase()));
}

/** Cuts a file chunk down to `budget` characters, keeping its header intact. */
function truncateChunk(chunk: DiffFileChunk, budget: number): string {
  if (chunk.chars <= budget) return chunk.text;

  const lines = chunk.text.split('\n');
  const kept: string[] = [];
  let used = 0;

  for (const line of lines) {
    const cost = line.length + 1;
    if (used + cost > budget) break;
    kept.push(line);
    used += cost;
  }

  const dropped = lines.length - kept.length;
  kept.push(`... [TRUNCATED: ${dropped} more diff lines in ${chunk.path} omitted to stay within the token budget]`);
  return kept.join('\n');
}

/**
 * Redacts secrets, drops generated/vendored files, and fits the remainder into
 * a character budget by giving every file a fair share of the space.
 */
export function sanitizeDiff(diff: string, options: SanitizeOptions = {}): SanitizedDiff {
  const maxChars = options.maxChars ?? 180_000;
  const maxFiles = options.maxFiles ?? 60;
  const maxCharsPerFile = options.maxCharsPerFile ?? 24_000;
  const extraIgnoredPaths = options.extraIgnoredPaths ?? [];

  const originalChars = diff.length;
  const { text: redacted, redactions, totalRedactions } = redactSecrets(diff);

  const allChunks = splitDiffIntoFiles(redacted);
  const skippedFiles: string[] = [];
  let candidates = allChunks.filter((chunk) => {
    if (isIgnoredPath(chunk.path, extraIgnoredPaths)) {
      skippedFiles.push(chunk.path);
      return false;
    }
    return true;
  });

  const omittedFiles: string[] = [];
  if (candidates.length > maxFiles) {
    // Keep the smallest files: more files reviewed per character spent.
    const bySize = [...candidates].sort((a, b) => a.chars - b.chars);
    const keep = new Set(bySize.slice(0, maxFiles).map((c) => c.index));
    for (const chunk of candidates) {
      if (!keep.has(chunk.index)) omittedFiles.push(chunk.path);
    }
    candidates = candidates.filter((c) => keep.has(c.index));
  }

  // Fair-share allocation: small files are kept whole and their leftover
  // budget is redistributed to the files that are still over their share.
  const allocation = new Map<number, number>();
  let remaining = maxChars;
  let pending = [...candidates];

  while (pending.length > 0) {
    const share = Math.min(Math.floor(remaining / pending.length), maxCharsPerFile);
    const fits = pending.filter((c) => c.chars <= share);
    if (fits.length === 0) {
      for (const c of pending) allocation.set(c.index, share);
      break;
    }
    for (const c of fits) {
      allocation.set(c.index, c.chars);
      remaining -= c.chars;
    }
    pending = pending.filter((c) => c.chars > share);
  }

  const truncatedFiles: string[] = [];
  const parts: string[] = [];
  for (const chunk of candidates) {
    const budget = allocation.get(chunk.index) ?? 0;
    if (budget <= 0) {
      omittedFiles.push(chunk.path);
      continue;
    }
    if (chunk.chars > budget) truncatedFiles.push(chunk.path);
    parts.push(truncateChunk(chunk, budget));
  }

  const content = parts.join('\n');

  return {
    content,
    redactions,
    totalRedactions,
    originalChars,
    sanitizedChars: content.length,
    truncated: truncatedFiles.length > 0 || omittedFiles.length > 0,
    truncatedFiles,
    omittedFiles,
    skippedFiles,
    filesInDiff: allChunks.length,
    filesIncluded: parts.length,
  };
}

/** Formats the sanitization result as a one-line log entry. */
export function describeSanitization(result: SanitizedDiff): string {
  const redactionText =
    result.totalRedactions === 0
      ? 'no secrets detected'
      : result.redactions.map((r) => `${r.id}×${r.count}`).join(', ');
  return [
    `files ${result.filesIncluded}/${result.filesInDiff}`,
    `chars ${result.originalChars}→${result.sanitizedChars}`,
    `redactions: ${redactionText}`,
    result.skippedFiles.length ? `skipped ${result.skippedFiles.length} generated file(s)` : null,
    result.truncatedFiles.length ? `truncated ${result.truncatedFiles.length} file(s)` : null,
    result.omittedFiles.length ? `omitted ${result.omittedFiles.length} file(s)` : null,
  ]
    .filter(Boolean)
    .join(' | ');
}
