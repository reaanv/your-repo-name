'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';

/**
 * Staggered entrance animation for a list of sibling elements.
 *
 * Returns a ref to attach to the container. Every descendant matching
 * `.motion-item` inside it is revealed in sequence.
 *
 * Two things this deliberately does *not* do:
 *
 * 1. It never leaves an element mid-animation. `prefers-reduced-motion` is
 *    honoured by clearing the props outright rather than by shortening the
 *    duration, so a reduced-motion user gets the resting layout on the first
 *    frame and no transform is ever committed.
 * 2. It does not animate opacity from exactly 0 without also clearing it on
 *    teardown. An interrupted GSAP tween that owns `opacity` can otherwise
 *    strand a node at `opacity: 0`, which is invisible to sighted users but
 *    still in the accessibility tree.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  options: { stagger?: number; y?: number; duration?: number } = {},
) {
  const containerRef = useRef<T | null>(null);
  const { stagger = 0.04, y = 8, duration = 0.32 } = options;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const items = container.querySelectorAll<HTMLElement>('.motion-item');
    if (items.length === 0) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      gsap.set(items, { clearProps: 'all' });
      return;
    }

    const context = gsap.context(() => {
      gsap.fromTo(
        items,
        { opacity: 0, y },
        {
          opacity: 1,
          y: 0,
          duration,
          stagger,
          ease: 'power2.out',
          // Hand the element back to CSS once it has landed, so no inline
          // transform survives to fight a later hover or media-query change.
          clearProps: 'transform,opacity',
        },
      );
    }, container);

    return () => context.revert();
  }, [stagger, y, duration]);

  return containerRef;
}

/**
 * Counts a number up to its final value on mount.
 *
 * Writes through a ref callback rather than React state: a stat tile can tick
 * 60 times a second and re-rendering the subtree that often is wasted work.
 * The element's text is set to the final value immediately under reduced
 * motion, and on unmount, so the DOM never holds a partial number.
 */
export function useCountUp(value: number, format: (n: number) => string) {
  const elementRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const settle = () => {
      element.textContent = format(value);
    };

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      settle();
      return;
    }

    const counter = { n: 0 };
    const tween = gsap.to(counter, {
      n: value,
      duration: 0.9,
      ease: 'power2.out',
      onUpdate: () => {
        element.textContent = format(counter.n);
      },
      onComplete: settle,
    });

    return () => {
      tween.kill();
      settle();
    };
  }, [value, format]);

  return elementRef;
}
