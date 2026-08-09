import type { Metadata } from 'next';

import { ReviewsExplorer } from '@/components/reviews-explorer';
import { REVIEWS } from '@/lib/mock-data';

export const metadata: Metadata = {
  title: 'PR Reviews · Autonomous PR Reviewer',
};

export default function ReviewsPage() {
  return (
    <div className="space-y-5">
      <header data-testid="reviews-header">
        <h2 className="text-lg font-semibold text-content-primary">Pull request reviews</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-content-secondary">
          Every run the action has completed, newest first. Open a row to inspect the findings, the diff with
          inline AI comments anchored to real lines, and the raw structured payload the model returned.
        </p>
      </header>

      <ReviewsExplorer reviews={REVIEWS} />
    </div>
  );
}
