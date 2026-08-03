'use client';

import { useMemo, useState } from 'react';
import { Coins, Gauge, ListOrdered, PieChart } from 'lucide-react';

import {
  categoryBreakdown,
  healthSeries,
  tokenSeries,
  topIssues,
} from '@/lib/mock-data';
import { cn, formatCompact } from '@/lib/utils';

import { ChartPanel, HealthChart, SeverityDonut, TokenChart, TopIssuesChart } from './charts';
import { StatCard } from './stat-card';

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

export function AnalyticsView() {
  const [range, setRange] = useState<Range>(30);

  const data = useMemo(() => {
    const health = healthSeries(range);
    const tokens = tokenSeries(range);
    const categories = categoryBreakdown(range);
    const issues = topIssues(range);

    const latest = health[health.length - 1]?.value ?? 0;
    const earliest = health[0]?.value ?? latest;
    const totalTokens = tokens.reduce((sum, point) => sum + point.input + point.output, 0);
    const totalFindings = categories.reduce((sum, category) => sum + category.count, 0);
    const securityShare = categories.find((category) => category.severity === 'security')?.count ?? 0;

    return {
      health,
      tokens,
      categories,
      issues,
      latest,
      healthDelta: latest - earliest,
      totalTokens,
      avgTokensPerDay: Math.round(totalTokens / Math.max(1, tokens.length)),
      totalFindings,
      securityPct: Math.round((securityShare / Math.max(1, totalFindings)) * 100),
    };
  }, [range]);

  return (
    <div data-testid="analytics-view" data-range={range} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          Aggregated across every repository the reviewer is installed on.
        </p>
        {/* Filters, not tabs: these rescope every card and chart below rather than swapping one panel, so tab semantics would promise arrow-key navigation that does not exist. */}
        <div
          role="group"
          aria-label="Select time range"
          data-testid="range-tabs"
          className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1"
        >
          {RANGES.map((value) => {
            const active = range === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                data-testid={`range-${value}`}
                data-active={active ? 'true' : 'false'}
                onClick={() => setRange(value)}
                className={cn(
                  'rounded-lg px-3.5 py-1.5 text-xs font-medium transition',
                  active
                    ? 'bg-accent/20 text-white shadow-glow'
                    : 'text-slate-400 hover:text-slate-100',
                )}
              >
                {value}d
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          testId="stat-health"
          icon={Gauge}
          accent="violet"
          label="Code health score"
          value={`${data.latest}/100`}
          delta={data.healthDelta}
          hint={`vs ${range}d ago`}
        />
        <StatCard
          testId="stat-findings"
          icon={ListOrdered}
          accent="amber"
          label="Findings surfaced"
          value={data.totalFindings.toLocaleString('en-US')}
          delta={12}
          hint="vs previous period"
          invertDelta
        />
        <StatCard
          testId="stat-security-share"
          icon={PieChart}
          accent="rose"
          label="Security share"
          value={`${data.securityPct}%`}
          delta={-4}
          hint="of all findings"
          invertDelta
        />
        <StatCard
          testId="stat-tokens"
          icon={Coins}
          accent="sky"
          label="Tokens consumed"
          value={formatCompact(data.totalTokens)}
          delta={8}
          hint={`${formatCompact(data.avgTokensPerDay)}/day avg`}
        />
      </div>

      <ChartPanel
        testId="panel-health"
        title="Code health over time"
        subtitle={`Composite score derived from finding density, severity mix, and resolution rate — last ${range} days.`}
      >
        <HealthChart points={data.health} />
      </ChartPanel>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartPanel
          testId="panel-issues"
          title="Top issue categories"
          subtitle="Most frequent finding types across all reviewed pull requests."
        >
          <TopIssuesChart issues={data.issues} />
        </ChartPanel>

        <ChartPanel
          testId="panel-categories"
          title="Severity distribution"
          subtitle="How findings break down by severity band."
        >
          <SeverityDonut categories={data.categories} />
        </ChartPanel>
      </div>

      <ChartPanel
        testId="panel-tokens"
        title="Token usage"
        subtitle="Input and output tokens billed to the Anthropic API per day."
      >
        <TokenChart points={data.tokens} />
      </ChartPanel>
    </div>
  );
}
