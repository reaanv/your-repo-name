'use client';

import { ChevronRight, GitPullRequest } from 'lucide-react';

import { SEVERITIES, type PullRequestReview, type Severity } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';

import { RiskBadge, SeverityBadge, StatusBadge } from './ui/badge';

export function countSeverities(review: PullRequestReview): Record<Severity, number> {
  const counts: Record<Severity, number> = { security: 0, bug: 0, optimization: 0, nit: 0 };
  for (const finding of review.findings) counts[finding.severity] += 1;
  return counts;
}

export function ReviewRow({
  review,
  onOpen,
  showRisk = true,
}: {
  review: PullRequestReview;
  onOpen: (review: PullRequestReview) => void;
  showRisk?: boolean;
}) {
  const counts = countSeverities(review);

  return (
    <button
      type="button"
      data-testid="review-row"
      data-review-id={review.id}
      data-status={review.status}
      data-risk={review.risk}
      onClick={() => onOpen(review)}
      className={cn(
        'group flex w-full items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-3.5 text-left transition',
        'hover:border-accent/30 hover:bg-white/[0.05] hover:shadow-glow',
      )}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-400 transition group-hover:text-accent-soft">
        <GitPullRequest aria-hidden className="h-4 w-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium text-slate-100 group-hover:text-white">
            {review.title}
          </span>
          <span className="font-mono text-xs text-slate-500">
            {review.repo}#{review.number}
          </span>
        </span>

        <span className="mt-1.5 flex flex-wrap items-center gap-2">
          <StatusBadge status={review.status} />
          {showRisk ? <RiskBadge risk={review.risk} /> : null}
          {SEVERITIES.filter((severity) => counts[severity] > 0).map((severity) => (
            <SeverityBadge key={severity} severity={severity} count={counts[severity]} showIcon={false} />
          ))}
          <span className="text-xs text-slate-500">
            {review.author} · {timeAgo(review.createdAt)}
          </span>
        </span>
      </span>

      <ChevronRight
        aria-hidden
        className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-accent-soft"
      />
    </button>
  );
}
