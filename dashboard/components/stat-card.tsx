import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { cn } from '@/lib/utils';

import { CountUpValue } from './count-up-value';

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  delta?: number;
  /** `true` when a rising number is a bad thing (e.g. open findings). */
  invertDelta?: boolean;
  icon: LucideIcon;
  /**
   * What the figure *means*, not what colour to paint it. The palette decides
   * the pigment; callers never name one.
   */
  tone?: 'brand' | 'success' | 'danger' | 'info' | 'warning';
  testId: string;
}

const TONES: Record<NonNullable<StatCardProps['tone']>, string> = {
  brand: 'border-accent/30 bg-accent/10 text-accent',
  success: 'border-state-success/25 bg-state-success/10 text-state-success',
  danger: 'border-state-danger/25 bg-state-danger/10 text-state-danger',
  info: 'border-state-info/25 bg-state-info/10 text-state-info',
  warning: 'border-state-warning/25 bg-state-warning/10 text-state-warning',
};

export function StatCard({
  label,
  value,
  hint,
  delta,
  invertDelta = false,
  icon: Icon,
  tone = 'brand',
  testId,
}: StatCardProps) {
  const good = delta === undefined ? null : invertDelta ? delta <= 0 : delta >= 0;
  const DeltaIcon = delta === undefined || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <article
      data-testid={testId}
      data-stat-card="true"
      className={cn(
        'motion-item surface group p-5',
        'transition-colors duration-200 hover:border-line-strong hover:bg-surface-overlay',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-content-secondary">{label}</p>
        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl border', TONES[tone])}>
          <Icon aria-hidden className="h-4 w-4" />
        </span>
      </div>

      <p className="mt-4 text-3xl font-semibold tabular-nums tracking-tight text-content-primary">
        <CountUpValue value={value} testId={`${testId}-value`} />
      </p>

      <div className="mt-2 flex items-center gap-2 text-xs">
        {delta !== undefined ? (
          <span
            data-testid={`${testId}-delta`}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium tabular-nums',
              good === null
                ? 'text-content-secondary'
                : good
                  ? 'bg-state-success/10 text-state-success'
                  : 'bg-state-danger/10 text-state-danger',
            )}
          >
            <DeltaIcon aria-hidden className="h-3 w-3" />
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        ) : null}
        {hint ? <span className="truncate text-content-tertiary">{hint}</span> : null}
      </div>
    </article>
  );
}
