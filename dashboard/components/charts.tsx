'use client';

import { useId } from 'react';

import type { CategoryCount, TimePoint, TokenPoint, TopIssue } from '@/lib/mock-data';
import type { Severity } from '@/lib/types';
import { cn, formatCompact, formatDay } from '@/lib/utils';

const SEVERITY_COLORS: Record<Severity, string> = {
  security: '#fb7185',
  bug: '#fbbf24',
  optimization: '#38bdf8',
  nit: '#94a3b8',
};

// ---------------------------------------------------------------------------
// Code health over time
// ---------------------------------------------------------------------------

export function HealthChart({ points, height = 220 }: { points: TimePoint[]; height?: number }) {
  const gradientId = useId();
  const width = 720;
  const padX = 8;
  const padY = 16;

  if (points.length === 0) return null;

  const min = 0;
  const max = 100;
  const stepX = (width - padX * 2) / Math.max(1, points.length - 1);

  const toX = (i: number) => padX + i * stepX;
  const toY = (value: number) => padY + (1 - (value - min) / (max - min)) * (height - padY * 2);

  const line = points.map((point, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(2)},${toY(point.value).toFixed(2)}`).join(' ');
  const area = `${line} L${toX(points.length - 1).toFixed(2)},${height - padY} L${toX(0).toFixed(2)},${height - padY} Z`;

  const last = points[points.length - 1];
  const first = points[0];

  return (
    <figure data-testid="health-chart" data-points={points.length} className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Code health score over the last ${points.length} days, currently ${last?.value ?? 0} out of 100`}
        className="h-[220px] w-full"
      >
        <defs>
          <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${gradientId}-stroke`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6d28d9" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>

        {[25, 50, 75, 100].map((value) => (
          <line
            key={value}
            x1={padX}
            x2={width - padX}
            y1={toY(value)}
            y2={toY(value)}
            stroke="rgba(148,163,184,0.12)"
            strokeDasharray="3 5"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={area} fill={`url(#${gradientId}-fill)`} />
        <path
          d={line}
          fill="none"
          stroke={`url(#${gradientId}-stroke)`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {points.map((point, i) => (
          <circle
            key={point.date}
            data-testid="health-point"
            cx={toX(i)}
            cy={toY(point.value)}
            r={i === points.length - 1 ? 4 : 2.5}
            fill={i === points.length - 1 ? '#a78bfa' : 'rgba(167,139,250,0.45)'}
          >
            <title>{`${formatDay(point.date)}: ${point.value}/100`}</title>
          </circle>
        ))}
      </svg>

      <figcaption className="mt-2 flex justify-between font-mono text-[0.7rem] text-slate-500">
        <span>{first ? formatDay(first.date) : ''}</span>
        <span className="text-slate-400">
          now <span className="text-accent-soft">{last?.value ?? 0}</span>/100
        </span>
        <span>{last ? formatDay(last.date) : ''}</span>
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Token usage
// ---------------------------------------------------------------------------

export function TokenChart({ points }: { points: TokenPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.input + point.output));

  return (
    <figure data-testid="token-chart" data-points={points.length} className="w-full">
      <div className="flex h-[180px] items-end gap-[3px]">
        {points.map((point) => {
          const total = point.input + point.output;
          const totalPct = (total / max) * 100;
          const outputPct = (point.output / total) * 100;
          return (
            <div
              key={point.date}
              data-testid="token-bar"
              title={`${formatDay(point.date)}: ${formatCompact(point.input)} in / ${formatCompact(point.output)} out`}
              className="group relative flex-1 rounded-t-[3px] bg-white/[0.04] transition hover:bg-white/[0.08]"
              style={{ height: '100%' }}
            >
              <div
                className="absolute bottom-0 w-full overflow-hidden rounded-t-[3px]"
                style={{ height: `${totalPct}%` }}
              >
                <div className="h-full w-full bg-gradient-to-t from-accent-deep to-accent" />
                <div
                  className="absolute inset-x-0 top-0 bg-sky-400/80"
                  style={{ height: `${outputPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent" />
          Input tokens
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-sky-400" />
          Output tokens
        </span>
        <span className="ml-auto font-mono">
          {formatCompact(points.reduce((sum, point) => sum + point.input + point.output, 0))} total
        </span>
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Top issue categories
// ---------------------------------------------------------------------------

export function TopIssuesChart({ issues }: { issues: TopIssue[] }) {
  const max = Math.max(1, ...issues.map((issue) => issue.count));

  return (
    <ul data-testid="top-issues" className="space-y-2.5">
      {issues.map((issue) => (
        <li key={issue.label} data-testid="top-issue-row" data-severity={issue.severity}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-slate-300">{issue.label}</span>
            <span className="font-mono text-slate-500">{issue.count}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.05]">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${(issue.count / max) * 100}%`,
                backgroundColor: SEVERITY_COLORS[issue.severity],
                opacity: 0.85,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Severity distribution donut
// ---------------------------------------------------------------------------

export function SeverityDonut({ categories }: { categories: CategoryCount[] }) {
  const total = categories.reduce((sum, category) => sum + category.count, 0) || 1;
  const radius = 56;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;

  return (
    <div data-testid="severity-donut" className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 160 160" role="img" aria-label="Findings by severity" className="h-40 w-40 shrink-0">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="18" />
        {categories.map((category) => {
          const fraction = category.count / total;
          const dash = fraction * circumference;
          const element = (
            <circle
              key={category.severity}
              data-testid="donut-segment"
              data-severity={category.severity}
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={SEVERITY_COLORS[category.severity]}
              strokeWidth="18"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
              strokeLinecap="butt"
              opacity={0.9}
            >
              <title>{`${category.label}: ${category.count}`}</title>
            </circle>
          );
          offset += dash;
          return element;
        })}
        <text x="80" y="75" textAnchor="middle" className="fill-white font-mono text-[1.4rem] font-semibold">
          {total}
        </text>
        <text x="80" y="95" textAnchor="middle" className="fill-slate-500 text-[0.65rem] uppercase tracking-widest">
          findings
        </text>
      </svg>

      <ul className="min-w-[10rem] flex-1 space-y-2">
        {categories.map((category) => (
          <li
            key={category.severity}
            data-testid="donut-legend-row"
            className="flex items-center justify-between gap-3 text-xs"
          >
            <span className="inline-flex items-center gap-2 text-slate-300">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: SEVERITY_COLORS[category.severity] }}
              />
              {category.label}
            </span>
            <span className="font-mono text-slate-500">
              {category.count}
              <span className="ml-1.5 text-slate-600">{Math.round((category.count / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared panel wrapper
// ---------------------------------------------------------------------------

export function ChartPanel({
  title,
  subtitle,
  action,
  children,
  className,
  testId,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section data-testid={testId} className={cn('glass p-5', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
