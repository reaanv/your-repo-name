'use client';

import { useId } from 'react';

import { cn } from '@/lib/utils';

export function Switch({
  checked,
  onChange,
  label,
  description,
  testId,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  testId: string;
  disabled?: boolean;
}) {
  const descriptionId = useId();

  return (
    // Deliberately a <div>, not a <label>: <button> is labelable, so a wrapping
    // label forwards clicks to it and risks double-toggling. `aria-label` on the
    // switch carries the accessible name instead.
    <div
      className={cn(
        'group flex items-start justify-between gap-6 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 transition',
        disabled ? 'opacity-50' : 'hover:border-white/15 hover:bg-white/[0.04]',
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-100">{label}</span>
        {description ? (
          <span id={descriptionId} className="mt-1 block text-xs leading-relaxed text-slate-400">
            {description}
          </span>
        ) : null}
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        // Guarded: without a description the span is not rendered, so an
        // unconditional reference would point at a nonexistent id.
        aria-describedby={description ? descriptionId : undefined}
        data-testid={testId}
        data-state={checked ? 'checked' : 'unchecked'}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors duration-200',
          checked
            ? 'border-accent/60 bg-accent/80 shadow-glow'
            : 'border-white/15 bg-white/[0.06]',
          disabled && 'pointer-events-none',
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-all duration-200',
            checked ? 'left-[calc(100%-1.375rem)]' : 'left-1',
          )}
          style={{ height: '1.125rem', width: '1.125rem' }}
        />
      </button>
    </div>
  );
}
