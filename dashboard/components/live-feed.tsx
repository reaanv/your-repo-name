'use client';

import { useMemo, useState } from 'react';
import { Activity, Inbox } from 'lucide-react';

import { SEVERITIES, type PullRequestReview, type Severity } from '@/lib/types';
import { cn } from '@/lib/utils';

import { ReviewInspector } from './review-inspector';
import { ReviewRow, countSeverities } from './review-row';

type Filter = Severity | 'all';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  ...SEVERITIES.map((severity) => ({
    id: severity as Filter,
    label: severity.charAt(0).toUpperCase() + severity.slice(1),
  })),
];

export function LiveFeed({ reviews, limit = 6 }: { reviews: PullRequestReview[]; limit?: number }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<PullRequestReview | null>(null);

  const totals = useMemo(() => {
    const totals: Record<Severity, number> = { security: 0, bug: 0, optimization: 0, nit: 0 };
    for (const review of reviews) {
      const counts = countSeverities(review);
      for (const severity of SEVERITIES) totals[severity] += counts[severity];
    }
    return totals;
  }, [reviews]);

  const visible = useMemo(() => {
    const matched =
      filter === 'all'
        ? reviews
        : reviews.filter((review) => review.findings.some((finding) => finding.severity === filter));
    return matched.slice(0, limit);
  }, [reviews, filter, limit]);

  return (
    <section data-testid="live-feed" className="surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity aria-hidden className="h-4 w-4 text-accent-soft" />
          <h2 className="text-sm font-semibold text-content-primary">Live audit log</h2>
          <span className="rounded-md bg-surface-overlay px-1.5 py-0.5 text-[0.7rem] tabular-nums text-content-secondary">
            {visible.length}
          </span>
        </div>

        <div
          role="group"
          aria-label="Filter by severity"
          data-testid="feed-filters"
          className="flex flex-wrap gap-1.5"
        >
          {FILTERS.map((item) => {
            const active = filter === item.id;
            const count = item.id === 'all' ? undefined : totals[item.id];
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                data-testid={`filter-${item.id}`}
                data-active={active ? 'true' : 'false'}
                onClick={() => setFilter(item.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                  active
                    ? 'border-accent/50 bg-accent/15 text-content-primary shadow-ring'
                    : 'border-line-default bg-surface-overlay/30 text-content-secondary hover:border-line-strong hover:text-content-primary',
                )}
              >
                {item.label}
                {count !== undefined ? <span className="ml-1.5 tabular-nums opacity-70">{count}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div data-testid="feed-rows" className="mt-4 space-y-2">
        {visible.length === 0 ? (
          <p
            data-testid="feed-empty"
            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-line-default px-4 py-10 text-sm text-content-tertiary"
          >
            <Inbox aria-hidden className="h-4 w-4" />
            No reviews match this filter.
          </p>
        ) : (
          visible.map((review) => <ReviewRow key={review.id} review={review} onOpen={setSelected} />)
        )}
      </div>

      <ReviewInspector review={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
