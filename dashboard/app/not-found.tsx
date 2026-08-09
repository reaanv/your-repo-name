import type { Metadata } from 'next';
import Link from 'next/link';
import { Compass } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Not found · Autonomous PR Reviewer',
};

/**
 * Without this file an unknown URL renders Next's built-in error page: no app
 * shell, no navigation, light-on-white against a dark product. Anyone who
 * mistypes a route or follows a stale link lands somewhere that does not look
 * like the dashboard and offers no way back into it.
 */
export default function NotFound() {
  return (
    <div className="space-y-5">
      <header data-testid="not-found">
        <h2 className="text-lg font-semibold text-content-primary">Page not found</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-content-secondary">
          That route does not exist in this dashboard. It may have been renamed, or the link that
          brought you here may be out of date.
        </p>
      </header>

      <div className="surface flex flex-col items-center gap-4 px-4 py-14 text-center">
        <Compass aria-hidden className="h-8 w-8 text-content-muted" />
        <p className="text-sm text-content-secondary">Pick up where you left off:</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link
            href="/"
            data-testid="not-found-home"
            className="rounded-xl border border-accent/40 bg-accent/15 px-4 py-2.5 text-sm font-medium text-content-primary transition hover:bg-accent/25"
          >
            Overview
          </Link>
          <Link
            href="/reviews"
            data-testid="not-found-reviews"
            className="rounded-xl border border-line-default bg-surface-overlay/50 px-4 py-2.5 text-sm font-medium text-content-primary transition hover:border-line-strong hover:text-content-primary"
          >
            PR reviews
          </Link>
        </div>
      </div>
    </div>
  );
}
