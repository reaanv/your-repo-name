import type { Metadata } from 'next';

import { SettingsForm } from '@/components/settings-form';

export const metadata: Metadata = {
  title: 'Settings · Autonomous PR Reviewer',
};

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <header data-testid="settings-header">
        <h2 className="text-lg font-semibold text-white">Settings</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">
          Workspace, credentials, and trigger configuration. In a real deployment the API key is read from a
          repository secret at action runtime and never round-trips through this dashboard.
        </p>
      </header>

      <SettingsForm />
    </div>
  );
}
