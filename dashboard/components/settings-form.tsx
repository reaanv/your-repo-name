'use client';

import { useState } from 'react';
import { Bell, Check, Eye, EyeOff, KeyRound, Plug, RotateCcw, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';

import { Switch } from './ui/switch';

interface SettingsState {
  workspace: string;
  defaultBranch: string;
  model: string;
  apiKey: string;
  webhookUrl: string;
  reviewOnDraft: boolean;
  reviewOnSynchronize: boolean;
  emailDigest: boolean;
  slackAlerts: boolean;
  dryRun: boolean;
  telemetry: boolean;
}

const DEFAULT_SETTINGS: SettingsState = {
  workspace: 'acme-engineering',
  defaultBranch: 'main',
  model: 'claude-opus-5',
  apiKey: 'sk-ant-••••••••••••••••••••••••4f2a',
  webhookUrl: 'https://hooks.acme.dev/pr-reviewer',
  reviewOnDraft: false,
  reviewOnSynchronize: true,
  emailDigest: true,
  slackAlerts: true,
  dryRun: false,
  telemetry: false,
};

const MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5 — deepest analysis' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — balanced' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — fastest' },
];

export function SettingsForm() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dangerConfirm, setDangerConfirm] = useState(false);
  const [disconnected, setDisconnected] = useState(false);

  const patch = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSaved(false);
    setSettings((current) => ({ ...current, [key]: value }));
  };

  return (
    <form
      data-testid="settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(true);
      }}
      className="space-y-5"
    >
      <section data-testid="settings-workspace" className="glass space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Plug aria-hidden className="h-4 w-4 text-accent-soft" />
          <h2 className="text-sm font-semibold text-white">Workspace</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="workspace-name" className="text-xs font-medium text-slate-300">
              Organization
            </label>
            <input
              id="workspace-name"
              type="text"
              value={settings.workspace}
              data-testid="workspace-name"
              onChange={(event) => patch('workspace', event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-100 transition focus:border-accent/50 focus:bg-white/[0.06]"
            />
          </div>

          <div>
            <label htmlFor="default-branch" className="text-xs font-medium text-slate-300">
              Default base branch
            </label>
            <input
              id="default-branch"
              type="text"
              value={settings.defaultBranch}
              data-testid="default-branch"
              onChange={(event) => patch('defaultBranch', event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 font-mono text-sm text-slate-100 transition focus:border-accent/50 focus:bg-white/[0.06]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="review-model" className="text-xs font-medium text-slate-300">
            Review model
          </label>
          <select
            id="review-model"
            value={settings.model}
            data-testid="review-model"
            onChange={(event) => patch('model', event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-ink-850 px-3 py-2.5 text-sm text-slate-200 transition focus:border-accent/50"
          >
            {MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section data-testid="settings-credentials" className="glass space-y-4 p-5">
        <div className="flex items-center gap-2">
          <KeyRound aria-hidden className="h-4 w-4 text-accent-soft" />
          <h2 className="text-sm font-semibold text-white">Credentials</h2>
        </div>

        <div>
          <label htmlFor="api-key" className="text-xs font-medium text-slate-300">
            Anthropic API key
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="api-key"
              type={showKey ? 'text' : 'password'}
              value={settings.apiKey}
              data-testid="api-key"
              onChange={(event) => patch('apiKey', event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 font-mono text-sm text-slate-100 transition focus:border-accent/50 focus:bg-white/[0.06]"
            />
            <button
              type="button"
              data-testid="api-key-toggle"
              data-state={showKey ? 'visible' : 'hidden'}
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
              onClick={() => setShowKey((value) => !value)}
              className="shrink-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-slate-300 transition hover:border-white/20 hover:text-white"
            >
              {showKey ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Stored as a repository secret. The value never reaches this dashboard in a real deployment — it is
            read from <code className="font-mono text-slate-400">ANTHROPIC_API_KEY</code> at action runtime.
          </p>
        </div>

        <div>
          <label htmlFor="webhook-url" className="text-xs font-medium text-slate-300">
            Notification webhook
          </label>
          <input
            id="webhook-url"
            type="url"
            value={settings.webhookUrl}
            data-testid="webhook-url"
            onChange={(event) => patch('webhookUrl', event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 font-mono text-sm text-slate-100 transition focus:border-accent/50 focus:bg-white/[0.06]"
          />
        </div>
      </section>

      <section data-testid="settings-triggers" className="glass space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Bell aria-hidden className="h-4 w-4 text-accent-soft" />
          <h2 className="text-sm font-semibold text-white">Triggers &amp; notifications</h2>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Switch
            testId="setting-review-draft"
            label="Review draft pull requests"
            description="Run on PRs that are still marked as drafts."
            checked={settings.reviewOnDraft}
            onChange={(value) => patch('reviewOnDraft', value)}
          />
          <Switch
            testId="setting-review-synchronize"
            label="Re-review on new commits"
            description="Triggers again on every push to the PR head branch."
            checked={settings.reviewOnSynchronize}
            onChange={(value) => patch('reviewOnSynchronize', value)}
          />
          <Switch
            testId="setting-email-digest"
            label="Daily email digest"
            description="A single summary of every review from the previous 24 hours."
            checked={settings.emailDigest}
            onChange={(value) => patch('emailDigest', value)}
          />
          <Switch
            testId="setting-slack-alerts"
            label="Slack alerts for critical findings"
            description="Posts to the webhook above whenever a critical severity lands."
            checked={settings.slackAlerts}
            onChange={(value) => patch('slackAlerts', value)}
          />
          <Switch
            testId="setting-dry-run"
            label="Dry run mode"
            description="Runs the full pipeline but posts nothing to GitHub. Useful for tuning rules."
            checked={settings.dryRun}
            onChange={(value) => patch('dryRun', value)}
          />
          <Switch
            testId="setting-telemetry"
            label="Share anonymous telemetry"
            description="Sends aggregate finding counts only. Never diffs, code, or repository names."
            checked={settings.telemetry}
            onChange={(value) => patch('telemetry', value)}
          />
        </div>
      </section>

      <section data-testid="settings-danger" className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.04] p-5">
        <h2 className="text-sm font-semibold text-rose-200">Danger zone</h2>
        <p className="mt-1 text-xs text-rose-200/70">
          Disconnecting removes the GitHub App installation. Historical reviews are retained for 30 days.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {disconnected ? null : dangerConfirm ? (
            <>
              <span data-testid="disconnect-confirm-prompt" className="text-xs text-rose-200">
                Disconnect <span className="font-mono">{settings.workspace}</span>?
              </span>
              <button
                type="button"
                data-testid="disconnect-confirm"
                onClick={() => {
                  setDisconnected(true);
                  setDangerConfirm(false);
                }}
                className="rounded-xl border border-rose-400/40 bg-rose-500/20 px-4 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/30"
              >
                Yes, disconnect
              </button>
              <button
                type="button"
                data-testid="disconnect-cancel"
                onClick={() => setDangerConfirm(false)}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:text-white"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              data-testid="disconnect"
              onClick={() => setDangerConfirm(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20"
            >
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
              Disconnect workspace
            </button>
          )}

          {/* Mounted even when idle — a live region only announces changes it was already present for. Trailing so the empty region adds no leading gap. */}
          <p role="status" aria-live="polite">
            {disconnected ? (
              <span
                data-testid="disconnect-done"
                className="inline-flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200"
              >
                <Check aria-hidden className="h-3.5 w-3.5" />
                Workspace disconnected (simulated).
              </span>
            ) : null}
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {/* Mounted even when idle — a live region only announces changes it was already present for. */}
        <p role="status" aria-live="polite" className="mr-auto">
          {saved ? (
            <span
              data-testid="settings-saved"
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200"
            >
              <Check aria-hidden className="h-3.5 w-3.5" />
              Settings saved.
            </span>
          ) : null}
        </p>

        <button
          type="button"
          data-testid="settings-reset"
          onClick={() => {
            setSettings(DEFAULT_SETTINGS);
            setSaved(false);
            setShowKey(false);
            setDangerConfirm(false);
            setDisconnected(false);
          }}
          className={cn(
            'inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5',
            'text-sm font-medium text-slate-300 transition hover:border-white/20 hover:text-white',
          )}
        >
          <RotateCcw aria-hidden className="h-3.5 w-3.5" />
          Discard changes
        </button>

        <button
          type="submit"
          data-testid="settings-save"
          className="inline-flex items-center gap-2 rounded-xl border border-accent/50 bg-accent/20 px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:bg-accent/30"
        >
          <Check aria-hidden className="h-4 w-4" />
          Save settings
        </button>
      </div>
    </form>
  );
}
