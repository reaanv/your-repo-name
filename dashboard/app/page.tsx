import {
  Bug,
  EyeOff,
  Gauge,
  GitPullRequest,
  ScanSearch,
  Send,
  ShieldCheck,
  ShieldQuestion,
  Timer,
} from 'lucide-react';

import { ChartPanel, HealthChart, TopIssuesChart } from '@/components/charts';
import { LiveFeed } from '@/components/live-feed';
import { Reveal } from '@/components/reveal';
import { StatCard } from '@/components/stat-card';
import { REVIEWS, headlineMetrics, healthSeries, topIssues } from '@/lib/mock-data';
import { formatDuration } from '@/lib/utils';

const PIPELINE = [
  {
    id: 'fetch',
    icon: GitPullRequest,
    title: 'Fetch diff',
    body: 'Octokit pulls the unified diff for the PR head against its base.',
  },
  {
    id: 'sanitize',
    icon: EyeOff,
    title: 'Sanitize',
    body: '16 redaction rules strip keys, tokens, and PEM blocks. Then the diff is budget-truncated.',
  },
  {
    id: 'analyze',
    icon: ScanSearch,
    title: 'Analyze',
    body: 'Claude Opus 5 reviews the diff as untrusted data, with adaptive thinking enabled.',
  },
  {
    id: 'validate',
    icon: ShieldQuestion,
    title: 'Validate',
    body: 'Zod gates the response. A schema violation fails the run instead of posting.',
  },
  {
    id: 'post',
    icon: Send,
    title: 'Post',
    body: 'Anchorable findings become inline comments; the rest fall back to the review body.',
  },
];

export default function DashboardPage() {
  const metrics = headlineMetrics();
  const health = healthSeries(30);
  const issues = topIssues(30).slice(0, 6);

  return (
    <div className="space-y-5">
      <section data-testid="hero" className="surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent-soft">
              <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
              Fail-closed by design
            </span>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-content-primary sm:text-3xl">
              Every pull request, reviewed before a human opens it.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-content-secondary">
              The action redacts secrets on the runner, sends only sanitized diffs to the model, validates
              the structured response against a schema, and posts inline comments anchored to real lines.
              Nothing is posted unless the payload parses.
            </p>
          </div>

          <dl data-testid="hero-stats" className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-content-tertiary">Secrets redacted</dt>
              <dd
                data-testid="hero-redactions"
                className="mt-1 text-2xl font-semibold tabular-nums text-content-primary"
              >
                {metrics.secretsRedacted}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-content-tertiary">Auto-resolved</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-content-primary">
                {metrics.autoResolvedPct}%
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <Reveal className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          testId="stat-reviews"
          icon={GitPullRequest}
          tone="brand"
          label="Reviews today"
          value={`${metrics.reviewsToday}`}
          delta={3}
          hint={`${REVIEWS.length} in the last 7 days`}
        />
        <StatCard
          testId="stat-open-findings"
          icon={Bug}
          tone="warning"
          label="Open findings"
          value={`${metrics.findingsOpen}`}
          delta={-6}
          hint={`${metrics.securityFindings} security`}
          invertDelta
        />
        <StatCard
          testId="stat-score"
          icon={Gauge}
          tone="success"
          label="Code health"
          value={`${metrics.healthScore}/100`}
          delta={metrics.healthDelta}
          hint="vs last week"
        />
        <StatCard
          testId="stat-duration"
          icon={Timer}
          tone="info"
          label="Median review time"
          value={formatDuration(metrics.medianDurationSec)}
          delta={-9}
          hint="wall clock, per PR"
          invertDelta
        />
      </Reveal>

      <section data-testid="pipeline" className="surface p-5">
        <h2 className="panel-title">Review pipeline</h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {PIPELINE.map((step, index) => {
            const Icon = step.icon;
            return (
              <li
                key={step.id}
                data-testid={`pipeline-step-${step.id}`}
                className="rounded-xl border border-line-subtle bg-surface-overlay/40 p-4 transition-colors hover:border-accent/30 hover:bg-surface-overlay"
              >
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent/25 bg-accent/10 text-accent">
                    <Icon aria-hidden className="h-4 w-4" />
                  </span>
                  <span className="text-xs tabular-nums text-content-muted">
                    Step {index + 1} of {PIPELINE.length}
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-content-primary">{step.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-content-tertiary">{step.body}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <ChartPanel
          testId="panel-health-summary"
          title="Code health, last 30 days"
          subtitle="Composite of finding density, severity mix, and resolution rate."
        >
          <HealthChart points={health} />
        </ChartPanel>

        <ChartPanel
          testId="panel-issues-summary"
          title="Top issue categories"
          subtitle="What the reviewer catches most often."
        >
          <TopIssuesChart issues={issues} />
        </ChartPanel>
      </div>

      <LiveFeed reviews={REVIEWS} limit={6} />
    </div>
  );
}
