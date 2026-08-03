import type { Metadata, Viewport } from 'next';

import { AppShell } from '@/components/app-shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'Autonomous PR Reviewer',
  description:
    'Analytics and control plane for the agentic pull request reviewer: live audit log, findings inspector, code health trends, and rule configuration.',
};

export const viewport: Viewport = {
  themeColor: '#05060a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
