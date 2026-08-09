'use client';

import { useEffect, useRef, useState } from 'react';
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
  { id: 'claude-opus-5', label: 'Claude Opus 5: deepest analysis' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5: balanced' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5: fastest' },
];

export function SettingsForm() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dangerConfirm, setDangerConfirm] = useState(false);
  const [disconnected, setDisconnected] = useState(false);

  const disconnectRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  /*
   * The danger zone swaps one control for another in place, so every
   * transition unmounts whatever the user just activated and drops focus to
   * `<body>`. Someone who confirms with the keyboard is thrown back to the top
   * of the document and has to tab all the way down to the confirmation they
   * asked for. This moves focus to whatever replaced the control they used.
   */
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (dangerConfirm) {
      // Cancel, not the destructive button: a stray Enter should be the
      // harmless outcome.
      cancelRef.current?.focus();
    } else if (wasConfirming.current) {
      // Confirm removes the trigger for good, so land on the result instead.
      (disconnected ? doneRef.current : disconnectRef.current)?.focus();
    }
    // Guarded so the first render, where nothing has been opened yet, does not
    // pull focus out of wherever the page put it.
    wasConfirming.current = dangerConfirm;
  }, [dangerConfirm, disconnected]);

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
      <section data-testid="settings-workspace" className="surface space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Plug aria-hidden className="h-4 w-4 text-accent-soft" />
          <h2 className="text-sm font-semibold text-content-primary">Workspace</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="workspace-name" className="text-xs font-medium text-content-secondary">
              Organization
            </label>
            <input
              id="workspace-name"
              type="text"
              value={settings.workspace}
              data-testid="workspace-name"
              onChange={(event) => patch('workspace', event.target.value)}
              className="mt-2 w-full rounded-xl border border-line-default bg-surface-overlay/50 px-3 py-2.5 text-sm text-content-primary transition focus:border-accent/50 focus:bg-surface-overlay"
            />
          </div>

          <div>
            <label htmlFor="default-branch" className="text-xs font-medium text-content-secondary">
              Default base branch
            </label>
            <input
              id="default-branch"
              type="text"
              value={settings.defaultBranch}
              data-testid="default-branch"
              onChange={(event) => patch('defaultBranch', event.target.value)}
              className="mt-2 w-full rounded-xl border border-line-default bg-surface-overlay/50 px-3 py-2.5 font-mono text-sm text-content-primary transition focus:border-accent/50 focus:bg-surface-overlay"
            />
          </div>
        </div>

        <div>
          <label htmlFor="review-model" className="text-xs font-medium text-content-secondary">
            Review model
          </label>
          <select
            id="review-model"
            value={settings.model}
            data-testid="review-model"
            onChange={(event) => patch('model', event.target.value)}
            className="mt-2 w-full rounded-xl border border-line-default bg-surface-overlay px-3 py-2.5 text-sm text-content-primary transition focus:border-accent/50"
          >
            {MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section data-testid="settings-credentials" className="surface space-y-4 p-5">
        <div className="flex items-center gap-2">
          <KeyRound aria-hidden className="h-4 w-4 text-accent-soft" />
          <h2 className="text-sm font-semibold text-content-primary">Credentials</h2>
        </div>

        <div>
          <label htmlFor="api-key" className="text-xs font-medium text-content-secondary">
            Anthropic API key
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="api-key"
              type={showKey ? 'text' : 'password'}
              value={settings.apiKey}
              data-testid="api-key"
              /*
               * A `password` input with no `autocomplete` makes Chrome offer to
               * save the value to the browser's password manager, which for an
               * API key means a credential ending up somewhere this project
               * spends the rest of its code keeping credentials out of. `off`
               * also stops the key being suggested into unrelated fields, and
               * spellcheck would ship it to the spellcheck service on some
               * platforms.
               */
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => patch('apiKey', event.target.value)}
              className="w-full rounded-xl border border-line-default bg-surface-overlay/50 px-3 py-2.5 font-mono text-sm text-content-primary transition focus:border-accent/50 focus:bg-surface-overlay"
            />
            <button
              type="button"
              data-testid="api-key-toggle"
              data-state={showKey ? 'visible' : 'hidden'}
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
              onClick={() => setShowKey((value) => !value)}
              className="shrink-0 rounded-xl border border-line-default bg-surface-overlay/50 px-3 text-content-secondary transition hover:border-line-strong hover:text-content-primary"
            >
              {showKey ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-xs text-content-tertiary">
            Stored as a repository secret. The value never reaches this dashboard in a real deployment. It is
            read from <code className="font-mono text-content-secondary">ANTHROPIC_API_KEY</code> at action runtime.
          </p>
        </div>

        <div>
          <label htmlFor="webhook-url" className="text-xs font-medium text-content-secondary">
            Notification webhook
          </label>
          <input
            id="webhook-url"
            type="url"
            value={settings.webhookUrl}
            data-testid="webhook-url"
            onChange={(event) => patch('webhookUrl', event.target.value)}
            className="mt-2 w-full rounded-xl border border-line-default bg-surface-overlay/50 px-3 py-2.5 font-mono text-sm text-content-primary transition focus:border-accent/50 focus:bg-surface-overlay"
          />
        </div>
      </section>

      <section data-testid="settings-triggers" className="surface space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Bell aria-hidden className="h-4 w-4 text-accent-soft" />
          <h2 className="text-sm font-semibold text-content-primary">Triggers &amp; notifications</h2>
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

      <section data-testid="settings-danger" className="rounded-2xl border border-state-danger/25 bg-state-danger/[0.04] p-5">
        <h2 className="text-sm font-semibold text-state-danger">Danger zone</h2>
        <p className="mt-1 text-xs text-state-danger/70">
          Disconnecting removes the GitHub App installation. Historical reviews are retained for 30 days.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {disconnected ? null : dangerConfirm ? (
            <>
              <span data-testid="disconnect-confirm-prompt" className="text-xs text-state-danger">
                Disconnect <span className="font-mono">{settings.workspace}</span>?
              </span>
              <button
                type="button"
                data-testid="disconnect-confirm"
                onClick={() => {
                  setDisconnected(true);
                  setDangerConfirm(false);
                }}
                className="rounded-xl border border-state-danger/40 bg-state-danger/20 px-4 py-2 text-xs font-semibold text-state-danger transition hover:bg-state-danger/30"
              >
                Yes, disconnect
              </button>
              <button
                ref={cancelRef}
                type="button"
                data-testid="disconnect-cancel"
                onClick={() => setDangerConfirm(false)}
                className="rounded-xl border border-line-default bg-surface-overlay/50 px-4 py-2 text-xs font-medium text-content-secondary transition hover:border-line-strong hover:text-content-primary"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              ref={disconnectRef}
              type="button"
              data-testid="disconnect"
              onClick={() => setDangerConfirm(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-state-danger/30 bg-state-danger/10 px-4 py-2 text-xs font-semibold text-state-danger transition hover:bg-state-danger/20"
            >
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
              Disconnect workspace
            </button>
          )}

          {/* Mounted even when idle: a live region only announces changes it was already present for. Trailing so the empty region adds no leading gap. */}
          <p
            ref={doneRef}
            tabIndex={-1}
            role="status"
            aria-live="polite"
            className="focus-visible:outline-none"
          >
            {disconnected ? (
              <span
                data-testid="disconnect-done"
                className="inline-flex items-center gap-2 rounded-lg border border-state-danger/30 bg-state-danger/10 px-3 py-2 text-xs font-medium text-state-danger"
              >
                <Check aria-hidden className="h-3.5 w-3.5" />
                Workspace disconnected (simulated).
              </span>
            ) : null}
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {/* Mounted even when idle: a live region only announces changes it was already present for. */}
        <p role="status" aria-live="polite" className="mr-auto">
          {saved ? (
            <span
              data-testid="settings-saved"
              className="inline-flex items-center gap-2 rounded-lg border border-state-success/25 bg-state-success/10 px-3 py-2 text-xs font-medium text-state-success"
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
            'inline-flex items-center gap-2 rounded-xl border border-line-default bg-surface-overlay/50 px-4 py-2.5',
            'text-sm font-medium text-content-secondary transition hover:border-line-strong hover:text-content-primary',
          )}
        >
          <RotateCcw aria-hidden className="h-3.5 w-3.5" />
          Discard changes
        </button>

        <button
          type="submit"
          data-testid="settings-save"
          className="inline-flex items-center gap-2 rounded-xl border border-accent/50 bg-accent/20 px-5 py-2.5 text-sm font-semibold text-content-primary shadow-ring transition hover:bg-accent/30"
        >
          <Check aria-hidden className="h-4 w-4" />
          Save settings
        </button>
      </div>
    </form>
  );
}
