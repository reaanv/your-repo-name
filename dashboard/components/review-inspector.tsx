'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  Braces,
  ExternalLink,
  FileDiff,
  GitBranch,
  ListChecks,
  ShieldCheck,
  Timer,
  X,
} from 'lucide-react';

import { parseUnifiedDiff } from '@/lib/diff';
import type { Finding, PullRequestReview } from '@/lib/types';
import { cn, formatCompact, timeAgo } from '@/lib/utils';

import { RiskBadge, SeverityBadge, StatusBadge } from './ui/badge';

type Tab = 'findings' | 'diff' | 'json';

const TABS: Array<{ id: Tab; label: string; icon: typeof ListChecks }> = [
  { id: 'findings', label: 'Findings', icon: ListChecks },
  { id: 'diff', label: 'Diff', icon: FileDiff },
  { id: 'json', label: 'Raw JSON', icon: Braces },
];

// Deliberately broad: candidates are filtered by tabIndex so the roving -1 tabs stay out.
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

export function ReviewInspector({
  review,
  onClose,
}: {
  review: PullRequestReview | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('findings');
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const uid = useId();
  const open = review !== null;

  // Reset to the first tab whenever a different review is opened.
  useEffect(() => {
    if (review) setTab('findings');
  }, [review?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyed on open/closed alone: swapping to another review must not bounce focus
  // back to the trigger. Runs before the effect below so it captures the opener
  // rather than the close button.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;

    return () => {
      // The trigger row can be unmounted by a filter change while the dialog is open.
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!review) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      // Queried per keystroke rather than once on mount: the panels swap content.
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => node.tabIndex >= 0 && !node.hasAttribute('disabled'),
      );
      if (focusable.length === 0) return;

      // aria-modal tells assistive tech the page behind is hidden, so Tab must not reach it.
      //
      // Every Tab is driven from this list rather than letting the browser's own
      // sequential order run and only correcting at the two ends. Engines do not
      // agree on what that order contains — Gecko and WebKit place scrollable
      // regions in it, and none of them promise it matches DOM order — so a trap
      // that only fires when `activeElement` is the DOM-first or DOM-last node
      // leaks at exactly the point where the two orders diverge. That is not
      // hypothetical: WebKit escaped this dialog on the first Shift+Tab while
      // Chromium held for 25 forward presses. Cycling by index over our own list
      // behaves identically in every engine.
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      const step = event.shiftKey ? -1 : 1;
      const next =
        index === -1
          ? // Focus is outside the dialog (or on the container itself): pull it
            // back to the near edge for the direction being travelled.
            (focusable[event.shiftKey ? focusable.length - 1 : 0] as HTMLElement)
          : (focusable[(index + step + focusable.length) % focusable.length] as HTMLElement);

      event.preventDefault();
      next.focus();
    };
    document.addEventListener('keydown', onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [review, onClose]);

  if (!review) return null;

  // role="tab" promises arrow-key navigation: selection and focus move together, wrapping.
  const onTabsKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((entry) => entry.id === tab);
    const last = TABS.length - 1;
    let next: number;

    switch (event.key) {
      case 'ArrowRight':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }

    // Arrows would otherwise scroll the panel.
    event.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div
      data-testid="review-inspector"
      data-review-id={review.id}
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
    >
      <button
        type="button"
        aria-label="Dismiss inspector"
        data-testid="inspector-backdrop"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Review for pull request ${review.number}`}
        className="glass relative flex h-[92vh] w-full max-w-6xl animate-scale-in flex-col overflow-hidden sm:h-[86vh]"
      >
        <header className="flex items-start gap-4 border-b border-white/[0.07] px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="font-mono text-slate-300">{review.repo}</span>
              <span aria-hidden>·</span>
              <span data-testid="inspector-pr-number" className="font-mono text-accent-soft">
                #{review.number}
              </span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <GitBranch aria-hidden className="h-3 w-3" />
                <span className="font-mono">{review.branch}</span>
              </span>
            </div>

            <h2 data-testid="inspector-title" className="mt-1.5 text-balance text-lg font-semibold text-white">
              {review.title}
            </h2>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={review.status} />
              <RiskBadge risk={review.risk} />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-slate-300">
                <Timer aria-hidden className="h-3.5 w-3.5" />
                {review.durationMs > 0 ? `${(review.durationMs / 1000).toFixed(1)}s` : 'in progress'}
              </span>
              {review.redactions > 0 ? (
                <span
                  data-testid="inspector-redactions"
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200"
                >
                  <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
                  {review.redactions} secret{review.redactions === 1 ? '' : 's'} redacted
                </span>
              ) : null}
            </div>
          </div>

          <button
            ref={closeRef}
            type="button"
            aria-label="Close inspector"
            data-testid="inspector-close"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-white/10 p-2 text-slate-400 transition hover:bg-white/[0.07] hover:text-white"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </header>

        <div
          role="tablist"
          aria-label="Inspector sections"
          data-testid="inspector-tabs"
          onKeyDown={onTabsKeyDown}
          className="flex gap-1 border-b border-white/[0.07] px-4 sm:px-6"
        >
          {TABS.map(({ id, label, icon: Icon }, index) => {
            const active = tab === id;
            return (
              <button
                key={id}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`${uid}-tab-${id}`}
                aria-selected={active}
                aria-controls={`${uid}-panel-${id}`}
                tabIndex={active ? 0 : -1}
                data-testid={`inspector-tab-${id}`}
                data-active={active ? 'true' : 'false'}
                onClick={() => setTab(id)}
                className={cn(
                  '-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-sm transition',
                  active
                    ? 'border-accent text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200',
                )}
              >
                <Icon aria-hidden className="h-4 w-4" />
                {label}
                {id === 'findings' ? (
                  <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[0.7rem] text-slate-300">
                    {review.findings.length}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Only the selected panel is mounted, so its id tracks the active tab's aria-controls. */}
        <div
          data-testid={`inspector-panel-${tab}`}
          id={`${uid}-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`${uid}-tab-${tab}`}
          className="scrollbar-slim flex-1 overflow-y-auto px-5 py-5 sm:px-6"
        >
          {tab === 'findings' ? <FindingsPanel review={review} /> : null}
          {tab === 'diff' ? <DiffPanel review={review} /> : null}
          {tab === 'json' ? <JsonPanel review={review} /> : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] px-5 py-3 text-xs text-slate-500 sm:px-6">
          <span>
            {review.filesChanged} file{review.filesChanged === 1 ? '' : 's'} ·{' '}
            <span className="text-emerald-300">+{review.additions}</span>{' '}
            <span className="text-rose-300">−{review.deletions}</span> · reviewed {timeAgo(review.createdAt)}
          </span>
          <span className="inline-flex items-center gap-3">
            <span className="font-mono">
              {formatCompact(review.tokens.input)} in / {formatCompact(review.tokens.output)} out
            </span>
            <span
              data-testid="inspector-open-github"
              className="inline-flex items-center gap-1 text-slate-400"
            >
              <ExternalLink aria-hidden className="h-3 w-3" />
              {review.repo}#{review.number}
            </span>
          </span>
        </footer>
      </div>
    </div>
  );
}

function FindingsPanel({ review }: { review: PullRequestReview }) {
  if (review.findings.length === 0) {
    return (
      <div data-testid="inspector-empty" className="glass-soft px-5 py-10 text-center">
        <ShieldCheck aria-hidden className="mx-auto h-8 w-8 text-emerald-300" />
        <p className="mt-3 text-sm font-medium text-white">No findings on this diff</p>
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-400">{review.summary}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass-soft p-4">
        <p className="panel-title">Model summary</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{review.summary}</p>
      </div>

      <ul data-testid="inspector-findings" className="space-y-3">
        {review.findings.map((finding) => (
          <li key={finding.id}>
            <FindingCard finding={finding} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FindingCard({ finding, compact = false }: { finding: Finding; compact?: boolean }) {
  return (
    <article
      data-testid="finding-card"
      data-finding-id={finding.id}
      data-severity={finding.severity}
      className={cn(
        'rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 transition hover:border-white/[0.16]',
        compact && 'bg-white/[0.04]',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <span className="font-mono text-xs text-slate-400">
          {finding.path}
          {finding.line !== null ? `:${finding.line}` : ''}
        </span>
        <span className="ml-auto font-mono text-xs text-slate-500">
          {(finding.confidence * 100).toFixed(0)}% confident
        </span>
      </div>

      <h3 className="mt-2.5 text-sm font-semibold text-white">{finding.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{finding.body}</p>

      {finding.suggestion ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-emerald-300/80">
            Suggested change
          </p>
          <pre className="scrollbar-slim overflow-x-auto rounded-lg border border-emerald-400/20 bg-emerald-500/[0.06] p-3 font-mono text-xs leading-relaxed text-emerald-100">
            <code>{finding.suggestion}</code>
          </pre>
        </div>
      ) : null}
    </article>
  );
}

function DiffPanel({ review }: { review: PullRequestReview }) {
  const files = useMemo(() => parseUnifiedDiff(review.diff), [review.diff]);

  const commentsByAnchor = useMemo(() => {
    const map = new Map<string, Finding[]>();
    for (const finding of review.findings) {
      if (finding.line === null) continue;
      const key = `${finding.path}:${finding.line}`;
      const bucket = map.get(key);
      if (bucket) bucket.push(finding);
      else map.set(key, [finding]);
    }
    return map;
  }, [review.findings]);

  const orphans = review.findings.filter((f) => f.line === null);

  return (
    <div className="space-y-5">
      {files.map((file) => (
        <section key={file.path} data-testid="diff-file" data-path={file.path} className="glass-soft overflow-hidden">
          <header className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
            <FileDiff aria-hidden className="h-4 w-4 text-slate-500" />
            <span className="font-mono text-xs text-slate-200">{file.path}</span>
            <span className="ml-auto font-mono text-xs">
              <span className="text-emerald-300">+{file.additions}</span>{' '}
              <span className="text-rose-300">−{file.deletions}</span>
            </span>
          </header>

          <div className="scrollbar-slim overflow-x-auto">
            <table className="w-full border-collapse font-mono text-xs">
              <tbody>
                {file.hunks.flatMap((hunk, hunkIndex) => [
                  <tr key={`h-${hunkIndex}`} data-testid="diff-hunk-header" className="bg-white/[0.04]">
                    <td colSpan={3} className="px-3 py-1.5 text-[0.7rem] text-slate-500">
                      {hunk.header}
                    </td>
                  </tr>,
                  ...hunk.lines.flatMap((line, lineIndex) => {
                    const anchor =
                      line.newNumber !== null ? commentsByAnchor.get(`${file.path}:${line.newNumber}`) : undefined;

                    const rows = [
                      <tr
                        key={`l-${hunkIndex}-${lineIndex}`}
                        data-testid="diff-line"
                        data-line-type={line.type}
                        className={cn(
                          line.type === 'add' && 'bg-emerald-500/[0.08]',
                          line.type === 'del' && 'bg-rose-500/[0.08]',
                        )}
                      >
                        <td className="w-12 select-none border-r border-white/[0.05] px-2 py-0.5 text-right text-slate-600">
                          {line.oldNumber ?? ''}
                        </td>
                        <td className="w-12 select-none border-r border-white/[0.05] px-2 py-0.5 text-right text-slate-600">
                          {line.newNumber ?? ''}
                        </td>
                        <td
                          className={cn(
                            'whitespace-pre px-3 py-0.5',
                            line.type === 'add' && 'text-emerald-100',
                            line.type === 'del' && 'text-rose-100',
                            line.type === 'context' && 'text-slate-400',
                            line.type === 'meta' && 'text-slate-600',
                          )}
                        >
                          {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                          {line.content || ' '}
                        </td>
                      </tr>,
                    ];

                    if (anchor) {
                      rows.push(
                        <tr key={`c-${hunkIndex}-${lineIndex}`} data-testid="diff-inline-comment">
                          <td colSpan={3} className="px-3 py-2">
                            <div className="space-y-2">
                              {anchor.map((finding) => (
                                <FindingCard key={finding.id} finding={finding} compact />
                              ))}
                            </div>
                          </td>
                        </tr>,
                      );
                    }

                    return rows;
                  }),
                ])}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {orphans.length > 0 ? (
        <section data-testid="diff-orphans" className="glass-soft p-4">
          <p className="panel-title">Findings without a diff anchor</p>
          <p className="mt-1.5 text-xs text-slate-500">
            These lines are not part of this diff, so the Action reports them in the review body instead of inline.
          </p>
          <div className="mt-3 space-y-2">
            {orphans.map((finding) => (
              <FindingCard key={finding.id} finding={finding} compact />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function JsonPanel({ review }: { review: PullRequestReview }) {
  const payload = {
    summary: review.summary,
    overall_risk: review.risk,
    comments: review.findings.map((finding) => ({
      path: finding.path,
      line: finding.line,
      severity: finding.severity,
      title: finding.title,
      body: finding.body,
      suggestion: finding.suggestion,
      confidence: finding.confidence,
    })),
  };

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-slate-500">
        The exact structured payload the model returned, after Zod validation. A response that fails this schema
        is rejected and nothing is posted to the pull request.
      </p>
      <pre
        data-testid="inspector-json"
        className="scrollbar-slim overflow-x-auto rounded-xl border border-white/[0.08] bg-ink-950/60 p-4 font-mono text-xs leading-relaxed text-slate-300"
      >
        <code>{JSON.stringify(payload, null, 2)}</code>
      </pre>
    </div>
  );
}
