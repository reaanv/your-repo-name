import type { Metadata } from 'next';

import { AnalyticsView } from '@/components/analytics-view';

export const metadata: Metadata = {
  title: 'Analytics · Autonomous PR Reviewer',
};

export default function AnalyticsPage() {
  return (
    <div className="space-y-5">
      <header data-testid="analytics-header">
        <h2 className="text-lg font-semibold text-content-primary">Analytics</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-content-secondary">
          Code health over time, the issue categories the reviewer surfaces most, and what the pipeline
          costs in tokens.
        </p>
      </header>

      <AnalyticsView />
    </div>
  );
}
