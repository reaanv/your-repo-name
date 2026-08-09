import type { Metadata, Viewport } from 'next';

import { AppShell } from '@/components/app-shell';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

export const metadata: Metadata = {
  title: 'Autonomous PR Reviewer',
  description:
    'Analytics and control plane for the agentic pull request reviewer: live audit log, findings inspector, code health trends, and rule configuration.',
};

export const viewport: Viewport = {
  // Must stay in sync with `--surface-base` in globals.css. A standalone hex
  // is unavoidable here: the browser reads this before any stylesheet loads.
  themeColor: '#08090b',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans">
        <TooltipProvider delayDuration={0} skipDelayDuration={300}>
          <AppShell>{children}</AppShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
