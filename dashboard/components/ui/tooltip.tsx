'use client';

import * as React from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/*
 * Tooltip, adapted from the shadcn registry `tooltip` onto this project's
 * tokens. Radix handles the accessibility contract: the trigger is described
 * by the content, Escape dismisses, and the tooltip never traps focus.
 *
 * `delayDuration` defaults to 0 here rather than the Radix default of 700ms.
 * Every tooltip in this dashboard explains a number that is already on screen
 * (a confidence score, a redaction count), so a delay reads as lag.
 */

export const TooltipProvider = TooltipPrimitive.Provider;
export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 max-w-xs rounded-lg border border-line-strong bg-surface-overlay px-2.5 py-1.5',
        'text-xs leading-relaxed text-content-secondary shadow-lift',
        'animate-scale-in',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = 'TooltipContent';

/**
 * Convenience wrapper for the common case: a short string explaining the
 * element it wraps. `label` is the accessible description, so the trigger
 * stays a plain child with no extra ARIA wiring at the call site.
 */
export function Tooltip({
  label,
  children,
  side = 'top',
}: {
  label: string;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <TooltipRoot delayDuration={0}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </TooltipRoot>
  );
}
