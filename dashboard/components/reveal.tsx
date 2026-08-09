'use client';

import type { ReactNode } from 'react';

import { useReveal } from '@/lib/hooks/use-reveal';
import { cn } from '@/lib/utils';

/**
 * Client boundary for the GSAP entrance animation, so the pages that use it
 * can stay server components. Children marked `.motion-item` are staggered in.
 *
 * The wrapper renders a plain `div` with no layout of its own beyond the
 * `className` it is given, so it can stand in for a grid container directly
 * rather than adding a nesting level that would break the grid.
 */
export function Reveal({
  children,
  className,
  stagger,
  testId,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  testId?: string;
}) {
  const ref = useReveal<HTMLDivElement>({ stagger });
  return (
    <div ref={ref} data-testid={testId} className={cn(className)}>
      {children}
    </div>
  );
}
