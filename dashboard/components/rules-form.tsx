'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, RotateCcw, ShieldCheck, SlidersHorizontal } from 'lucide-react';

import { DEFAULT_RULES, SEVERITIES, type RuleConfig, type Severity } from '@/lib/types';
import { SEVERITY_LABELS } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

import { Switch } from './ui/switch';

const STRICTNESS: Array<{ id: RuleConfig['strictness']; label: string; blurb: string }> = [
  { id: 'lenient', label: 'Lenient', blurb: 'Only high-confidence, high-impact findings. Minimal noise.' },
  { id: 'balanced', label: 'Balanced', blurb: 'Correctness and security issues plus meaningful optimizations.' },
  { id: 'strict', label: 'Strict', blurb: 'Everything, including style nits and speculative edge cases.' },
];

const FAIL_OPTIONS: Array<{ id: RuleConfig['failOnSeverity']; label: string }> = [
  { id: 'none', label: 'Never fail the check' },
  ...SEVERITIES.map((severity) => ({
    id: severity as RuleConfig['failOnSeverity'],
    label: `Fail on ${SEVERITY_LABELS[severity].toLowerCase()} or worse`,
  })),
];

export function RulesForm() {
  const [rules, setRules] = useState<RuleConfig>(DEFAULT_RULES);
  const [saved, setSaved] = useState(false);
  const strictnessRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const dirty = useMemo(() => JSON.stringify(rules) !== JSON.stringify(DEFAULT_RULES), [rules]);

  const patch = <K extends keyof RuleConfig>(key: K, value: RuleConfig[K]) => {
    setSaved(false);
    setRules((current) => ({ ...current, [key]: value }));
  };

  const toggleSeverity = (severity: Severity) => {
    setSaved(false);
    setRules((current) => ({
      ...current,
      enabledSeverities: current.enabledSeverities.includes(severity)
        ? current.enabledSeverities.filter((value) => value !== severity)
        : [...current.enabledSeverities, severity],
    }));
  };

  // A radiogroup moves focus and selection together on arrow keys, wrapping at both ends.
  const onStrictnessKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = STRICTNESS.length - 1;
    let next: number;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }

    // Arrows would otherwise scroll the page.
    event.preventDefault();
    patch('strictness', STRICTNESS[next].id);
    strictnessRefs.current[next]?.focus();
  };

  const reset = () => {
    setRules(DEFAULT_RULES);
    setSaved(false);
  };

  return (
    <form
      data-testid="rules-form"
      data-dirty={dirty ? 'true' : 'false'}
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(true);
      }}
      className="space-y-5"
    >
      <section data-testid="rules-toggles" className="glass p-5">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck aria-hidden className="h-4 w-4 text-accent-soft" />
          <h2 className="text-sm font-semibold text-white">Review policy</h2>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Switch
            testId="rule-enforce-security"
            label="Enforce security checks"
            description="Always run the security ruleset, even when a PR only touches non-application code."
            checked={rules.enforceSecurityChecks}
            onChange={(value) => patch('enforceSecurityChecks', value)}
          />
          <Switch
            testId="rule-block-critical"
            label="Block merge on critical findings"
            description="Marks the check as failed so branch protection can hold the PR."
            checked={rules.blockOnCriticalFindings}
            onChange={(value) => patch('blockOnCriticalFindings', value)}
          />
          <Switch
            testId="rule-redact-secrets"
            label="Redact secrets before the model call"
            description="Strips API keys, tokens, and private keys from the diff. Disabling this is not recommended."
            checked={rules.redactSecrets}
            onChange={(value) => patch('redactSecrets', value)}
          />
          <Switch
            testId="rule-skip-generated"
            label="Skip generated files"
            description="Ignores lockfiles, build output, snapshots, and minified bundles."
            checked={rules.skipGeneratedFiles}
            onChange={(value) => patch('skipGeneratedFiles', value)}
          />
          <Switch
            testId="rule-auto-approve"
            label="Auto-approve clean diffs"
            description="Posts an approving review when zero findings clear the confidence floor."
            checked={rules.autoApproveCleanDiffs}
            onChange={(value) => patch('autoApproveCleanDiffs', value)}
          />
          <Switch
            testId="rule-notify-failure"
            label="Notify on run failure"
            description="Pings the configured channel if the action exits non-zero."
            checked={rules.notifyOnFailure}
            onChange={(value) => patch('notifyOnFailure', value)}
          />
        </div>
      </section>

      <section data-testid="rules-strictness" className="glass p-5">
        <div className="mb-4 flex items-center gap-2">
          <SlidersHorizontal aria-hidden className="h-4 w-4 text-accent-soft" />
          <h2 className="text-sm font-semibold text-white">Strictness level</h2>
        </div>

        <div role="radiogroup" aria-label="Strictness level" className="grid gap-3 sm:grid-cols-3">
          {STRICTNESS.map((option, index) => {
            const active = rules.strictness === option.id;
            return (
              <button
                key={option.id}
                ref={(node) => {
                  strictnessRefs.current[index] = node;
                }}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                data-testid={`strictness-${option.id}`}
                data-active={active ? 'true' : 'false'}
                onClick={() => patch('strictness', option.id)}
                onKeyDown={(event) => onStrictnessKeyDown(event, index)}
                className={cn(
                  'rounded-xl border p-4 text-left transition',
                  active
                    ? 'border-accent/50 bg-accent/12 shadow-glow'
                    : 'border-white/[0.06] bg-white/[0.015] hover:border-white/20 hover:bg-white/[0.04]',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className={cn('text-sm font-semibold', active ? 'text-white' : 'text-slate-200')}>
                    {option.label}
                  </span>
                  {active ? <Check aria-hidden className="h-4 w-4 text-accent-soft" /> : null}
                </span>
                <span className="mt-1.5 block text-xs leading-relaxed text-slate-400">{option.blurb}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section data-testid="rules-thresholds" className="glass space-y-5 p-5">
          <h2 className="text-sm font-semibold text-white">Thresholds</h2>

          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="min-confidence" className="text-xs font-medium text-slate-300">
                Minimum confidence
              </label>
              <span data-testid="min-confidence-value" className="font-mono text-xs text-accent-soft">
                {rules.minConfidence.toFixed(2)}
              </span>
            </div>
            <input
              id="min-confidence"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={rules.minConfidence}
              data-testid="min-confidence"
              onChange={(event) => patch('minConfidence', Number(event.target.value))}
              className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-accent"
            />
            <p className="mt-2 text-xs text-slate-500">
              Findings the model scores below this are dropped before anything is posted.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="max-comments" className="text-xs font-medium text-slate-300">
                Max inline comments
              </label>
              <input
                id="max-comments"
                type="number"
                min={1}
                max={100}
                value={rules.maxComments}
                data-testid="max-comments"
                onChange={(event) => patch('maxComments', Number(event.target.value))}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 font-mono text-sm text-slate-100 transition focus:border-accent/50 focus:bg-white/[0.06]"
              />
            </div>

            <div>
              <label htmlFor="max-diff-chars" className="text-xs font-medium text-slate-300">
                Max diff characters
              </label>
              <input
                id="max-diff-chars"
                type="number"
                min={1000}
                step={1000}
                value={rules.maxDiffChars}
                data-testid="max-diff-chars"
                onChange={(event) => patch('maxDiffChars', Number(event.target.value))}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 font-mono text-sm text-slate-100 transition focus:border-accent/50 focus:bg-white/[0.06]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="fail-on-severity" className="text-xs font-medium text-slate-300">
              Fail the check when
            </label>
            <select
              id="fail-on-severity"
              value={rules.failOnSeverity}
              data-testid="fail-on-severity"
              onChange={(event) => patch('failOnSeverity', event.target.value as RuleConfig['failOnSeverity'])}
              className="mt-2 w-full rounded-xl border border-white/10 bg-ink-850 px-3 py-2.5 text-sm text-slate-200 transition focus:border-accent/50"
            >
              {FAIL_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section data-testid="rules-severities" className="glass space-y-5 p-5">
          <div>
            <h2 className="text-sm font-semibold text-white">Enabled severities</h2>
            <p className="mt-1 text-xs text-slate-500">
              Severities the reviewer is allowed to post. Disabled bands are dropped by the policy layer.
            </p>
          </div>

          <div role="group" aria-label="Enabled severities" className="flex flex-wrap gap-2">
            {SEVERITIES.map((severity) => {
              const active = rules.enabledSeverities.includes(severity);
              return (
                <button
                  key={severity}
                  type="button"
                  aria-pressed={active}
                  data-testid={`severity-toggle-${severity}`}
                  data-active={active ? 'true' : 'false'}
                  onClick={() => toggleSeverity(severity)}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-xs font-medium transition',
                    active
                      ? 'border-accent/50 bg-accent/15 text-white shadow-glow'
                      : 'border-white/10 bg-white/[0.02] text-slate-500 hover:border-white/20 hover:text-slate-200',
                  )}
                >
                  {SEVERITY_LABELS[severity]}
                </button>
              );
            })}
          </div>

          <div>
            <label htmlFor="custom-rules" className="text-xs font-medium text-slate-300">
              Custom rules
            </label>
            <textarea
              id="custom-rules"
              rows={6}
              value={rules.customRules}
              data-testid="custom-rules"
              onChange={(event) => patch('customRules', event.target.value)}
              placeholder="One rule per line…"
              className="scrollbar-slim mt-2 w-full resize-y rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 transition focus:border-accent/50 focus:bg-white/[0.06]"
            />
            <p className="mt-2 text-xs text-slate-500">
              Appended verbatim to the system prompt. The diff itself is always treated as untrusted data.
            </p>
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {/* Mounted even when idle — a live region only announces changes it was already present for. */}
        <p role="status" aria-live="polite" className="mr-auto">
          {saved ? (
            <span
              data-testid="rules-saved"
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200"
            >
              <Check aria-hidden className="h-3.5 w-3.5" />
              Rule configuration saved.
            </span>
          ) : null}
        </p>

        <button
          type="button"
          data-testid="rules-reset"
          onClick={reset}
          disabled={!dirty}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw aria-hidden className="h-3.5 w-3.5" />
          Restore defaults
        </button>

        <button
          type="submit"
          data-testid="rules-save"
          className="inline-flex items-center gap-2 rounded-xl border border-accent/50 bg-accent/20 px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:bg-accent/30"
        >
          <Check aria-hidden className="h-4 w-4" />
          Save configuration
        </button>
      </div>
    </form>
  );
}
