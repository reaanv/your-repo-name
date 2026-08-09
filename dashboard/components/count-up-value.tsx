'use client';

import { useCallback, useMemo } from 'react';

import { useCountUp } from '@/lib/hooks/use-reveal';

/**
 * Pulls the leading number out of a display string so it can be counted up,
 * keeping any prefix/suffix ("94/100", "1.2k", "+18%") intact around it.
 * Returns null when there is no number to animate, in which case the string is
 * rendered as-is.
 */
function splitNumeric(value: string): { prefix: string; n: number; suffix: string } | null {
  const match = /^(\D*)(\d[\d,]*\.?\d*)(.*)$/s.exec(value);
  if (!match) return null;
  const n = Number(match[2].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return { prefix: match[1], n, suffix: match[3] };
}

/**
 * Lives in its own client module so that `StatCard` can stay a shared
 * component. Its callers are server components that pass a Lucide icon, and a
 * component reference cannot cross the server/client boundary as a prop, so the
 * boundary has to sit here at the leaf rather than around the whole card. Every
 * prop this takes is a string.
 */
export function CountUpValue({ value, testId }: { value: string; testId: string }) {
  // Memoised on `value` because `splitNumeric` returns a fresh object: without
  // this, `format` gets a new identity on every render, which re-runs the
  // effect in `useCountUp` and restarts the tween from zero each time a parent
  // re-renders.
  const parts = useMemo(() => splitNumeric(value), [value]);
  const decimals = parts && !Number.isInteger(parts.n) ? (parts.n.toString().split('.')[1]?.length ?? 0) : 0;

  const format = useCallback(
    (n: number) => {
      if (!parts) return value;
      const rounded = decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString('en-US');
      return `${parts.prefix}${rounded}${parts.suffix}`;
    },
    [parts, value, decimals],
  );

  const ref = useCountUp(parts?.n ?? 0, format);

  // The server-rendered text is the final value, so the figure is correct
  // before hydration and for anyone with JavaScript disabled. GSAP only ever
  // rewinds it and plays it forward.
  return (
    <span ref={parts ? ref : undefined} data-testid={testId}>
      {value}
    </span>
  );
}
