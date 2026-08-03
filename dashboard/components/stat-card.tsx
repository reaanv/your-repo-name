import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  delta?: number;
  /** `true` when a rising number is a bad thing (e.g. open findings). */
  invertDelta?: boolean;
  icon: LucideIcon;
  accent?: 'violet' | 'emerald' | 'rose' | 'sky' | 'amber';
  testId: string;
}

const ACCENTS: Record<NonNullable<StatCardProps['accent']>, string> = {
  violet: 'border-accent/30 bg-accent/12 text-accent-soft',
  emerald: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
  rose: 'border-rose-400/25 bg-rose-500/10 text-rose-200',
  sky: 'border-sky-400/25 bg-sky-500/10 text-sky-200',
  amber: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
};

export function StatCard({
  label,
  value,
  hint,
  delta,
  invertDelta = false,
  icon: Icon,
  accent = 'violet',
  testId,
}: StatCardProps) {
  const good = delta === undefined ? null : invertDelta ? delta <= 0 : delta >= 0;
  const DeltaIcon = delta === undefined || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <article
      data-testid={testId}
      data-stat-card="true"
      className="glass group relative overflow-hidden p-5 transition duration-300 hover:border-white/20"
    >
      <div className="pointer-events-none absolute inset-x-0 -top-24 h-32 bg-gradient-to-b from-white/[0.06] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="flex items-start justify-between gap-4">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">{label}</p>
        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl border', ACCENTS[accent])}>
          <Icon aria-hidden className="h-4 w-4" />
        </span>
      </div>

      <p data-testid={`${testId}-value`} className="mt-4 font-mono text-3xl font-semibold tracking-tight text-white">
        {value}
      </p>

      <div className="mt-2 flex items-center gap-2 text-xs">
        {delta !== undefined ? (
          <span
            data-testid={`${testId}-delta`}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium',
              good === null
                ? 'text-slate-400'
                : good
                  ? 'bg-emerald-500/10 text-emerald-300'
                  : 'bg-rose-500/10 text-rose-300',
            )}
          >
            <DeltaIcon aria-hidden className="h-3 w-3" />
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        ) : null}
        {hint ? <span className="truncate text-slate-500">{hint}</span> : null}
      </div>
    </article>
  );
}
