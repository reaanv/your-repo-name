'use client';

import { useMemo, useState } from 'react';
import { Filter, Inbox, Search, X } from 'lucide-react';

import { REVIEW_STATUSES, SEVERITIES, type PullRequestReview, type ReviewStatus, type Severity } from '@/lib/types';
import { STATUS_LABELS } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

import { ReviewInspector } from './review-inspector';
import { ReviewRow } from './review-row';

type StatusFilter = ReviewStatus | 'all';
type SortKey = 'newest' | 'oldest' | 'findings' | 'risk';

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'findings', label: 'Most findings' },
  { id: 'risk', label: 'Highest risk' },
];

const RISK_ORDER: Record<PullRequestReview['risk'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const PAGE_SIZE = 6;

export function ReviewsExplorer({ reviews }: { reviews: PullRequestReview[] }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [severities, setSeverities] = useState<Severity[]>([]);
  const [sort, setSort] = useState<SortKey>('newest');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<PullRequestReview | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matched = reviews.filter((review) => {
      if (status !== 'all' && review.status !== status) return false;

      if (severities.length > 0) {
        const hasAll = severities.every((severity) =>
          review.findings.some((finding) => finding.severity === severity),
        );
        if (!hasAll) return false;
      }

      if (needle.length === 0) return true;
      const haystack = [
        review.title,
        review.repo,
        review.author,
        review.branch,
        `#${review.number}`,
        ...review.findings.map((finding) => `${finding.title} ${finding.path}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });

    const sorted = [...matched];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'findings':
          return b.findings.length - a.findings.length;
        case 'risk':
          return RISK_ORDER[a.risk] - RISK_ORDER[b.risk];
        case 'newest':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
    return sorted;
  }, [reviews, query, status, severities, sort]);

  const visible = filtered.slice(0, visibleCount);
  const filtersActive = query.trim().length > 0 || status !== 'all' || severities.length > 0;

  const toggleSeverity = (severity: Severity) => {
    setVisibleCount(PAGE_SIZE);
    setSeverities((current) =>
      current.includes(severity) ? current.filter((s) => s !== severity) : [...current, severity],
    );
  };

  const resetFilters = () => {
    setQuery('');
    setStatus('all');
    setSeverities([]);
    setSort('newest');
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <section data-testid="reviews-explorer" className="space-y-4">
      <div className="glass space-y-4 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="Search by title, repo, author, branch, or finding…"
              aria-label="Search reviews"
              data-testid="reviews-search"
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-500 transition focus:border-accent/50 focus:bg-white/[0.06]"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="reviews-sort" className="text-xs text-slate-500">
              Sort
            </label>
            <select
              id="reviews-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              data-testid="reviews-sort"
              className="rounded-xl border border-white/10 bg-ink-850 px-3 py-2.5 text-sm text-slate-200 transition focus:border-accent/50"
            >
              {SORTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              data-testid="reviews-reset"
              onClick={resetFilters}
              disabled={!filtersActive && sort === 'newest'}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X aria-hidden className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Filters, not tabs: these narrow the list below rather than swapping panels, so tab semantics would promise arrow-key navigation that does not exist. */}
          <div role="group" aria-label="Filter by status" data-testid="status-tabs" className="flex flex-wrap gap-1.5">
            {(['all', ...REVIEW_STATUSES] as StatusFilter[]).map((value) => {
              const active = status === value;
              const count =
                value === 'all' ? reviews.length : reviews.filter((review) => review.status === value).length;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  data-testid={`status-${value}`}
                  data-active={active ? 'true' : 'false'}
                  onClick={() => {
                    setStatus(value);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                    active
                      ? 'border-accent/50 bg-accent/15 text-white shadow-glow'
                      : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-100',
                  )}
                >
                  {value === 'all' ? 'All' : STATUS_LABELS[value]}
                  <span className="ml-1.5 font-mono opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          <div
            role="group"
            aria-label="Filter by severity"
            data-testid="severity-filters"
            className="flex flex-wrap items-center gap-1.5"
          >
            <Filter aria-hidden className="h-3.5 w-3.5 text-slate-500" />
            {SEVERITIES.map((severity) => {
              const active = severities.includes(severity);
              return (
                <button
                  key={severity}
                  type="button"
                  aria-pressed={active}
                  data-testid={`severity-filter-${severity}`}
                  data-active={active ? 'true' : 'false'}
                  onClick={() => toggleSeverity(severity)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition',
                    active
                      ? 'border-accent/50 bg-accent/15 text-white shadow-glow'
                      : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-100',
                  )}
                >
                  {severity}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <p data-testid="reviews-count" className="text-xs text-slate-500">
        Showing <span className="font-mono text-slate-300">{visible.length}</span> of{' '}
        <span className="font-mono text-slate-300">{filtered.length}</span> review
        {filtered.length === 1 ? '' : 's'}
        {filtersActive ? ' matching your filters' : ''}.
      </p>

      <div data-testid="reviews-list" className="space-y-2">
        {visible.length === 0 ? (
          <p
            data-testid="reviews-empty"
            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-14 text-sm text-slate-500"
          >
            <Inbox aria-hidden className="h-4 w-4" />
            No reviews match your filters.
          </p>
        ) : (
          visible.map((review) => <ReviewRow key={review.id} review={review} onOpen={setSelected} />)
        )}
      </div>

      {visible.length < filtered.length ? (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            data-testid="reviews-load-more"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-accent/40 hover:bg-white/[0.07] hover:text-white"
          >
            Load {Math.min(PAGE_SIZE, filtered.length - visible.length)} more
          </button>
        </div>
      ) : null}

      <ReviewInspector review={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
