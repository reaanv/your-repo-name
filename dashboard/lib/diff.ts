/**
 * Minimal unified-diff parser used by the PR inspector to render a diff with
 * line numbers so AI findings can be anchored inline.
 */

export type DiffLineType = 'add' | 'del' | 'context' | 'meta';

export interface DiffLine {
  type: DiffLineType;
  oldNumber: number | null;
  newNumber: number | null;
  content: string;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

export function parseUnifiedDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldNumber = 0;
  let newNumber = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      file = { path: parseGitHeaderPath(line), hunks: [], additions: 0, deletions: 0 };
      files.push(file);
      hunk = null;
      continue;
    }

    if (line.startsWith('+++ ')) {
      const raw = line.slice(4).trim();
      if (file && raw !== '/dev/null') file.path = stripPrefix(raw);
      continue;
    }

    if (line.startsWith('--- ') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file')) {
      continue;
    }

    if (line.startsWith('@@')) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
      if (!match) continue;
      oldNumber = Number.parseInt(match[1] ?? '1', 10);
      newNumber = Number.parseInt(match[2] ?? '1', 10);
      hunk = { header: line, lines: [] };
      if (!file) {
        file = { path: 'unknown', hunks: [], additions: 0, deletions: 0 };
        files.push(file);
      }
      file.hunks.push(hunk);
      continue;
    }

    if (!hunk || !file) continue;

    if (line.startsWith('+')) {
      hunk.lines.push({ type: 'add', oldNumber: null, newNumber, content: line.slice(1) });
      newNumber += 1;
      file.additions += 1;
    } else if (line.startsWith('-')) {
      hunk.lines.push({ type: 'del', oldNumber, newNumber: null, content: line.slice(1) });
      oldNumber += 1;
      file.deletions += 1;
    } else if (line.startsWith('\\')) {
      hunk.lines.push({ type: 'meta', oldNumber: null, newNumber: null, content: line });
    } else {
      hunk.lines.push({ type: 'context', oldNumber, newNumber, content: line.startsWith(' ') ? line.slice(1) : line });
      oldNumber += 1;
      newNumber += 1;
    }
  }

  return files;
}

function parseGitHeaderPath(line: string): string {
  const parts = line.slice('diff --git '.length).split(' b/');
  return (parts[1] ?? parts[0] ?? 'unknown').trim();
}

function stripPrefix(p: string): string {
  return p.startsWith('a/') || p.startsWith('b/') ? p.slice(2) : p;
}
