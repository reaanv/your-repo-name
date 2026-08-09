import type { Config } from 'tailwindcss';

/**
 * Maps the CSS custom properties declared in `app/globals.css` onto Tailwind
 * utilities. The `rgb(var(--x) / <alpha-value>)` form is what lets opacity
 * modifiers keep working (`border-line-default/40`).
 *
 * Deliberately absent: the raw Tailwind palette scales. Components name
 * semantics (`text-content-secondary`, `bg-state-danger`), never pigments, so
 * a palette change is a change to `globals.css` alone.
 */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'Liberation Mono', 'monospace'],
      },
      colors: {
        surface: {
          base: token('surface-base'),
          raised: token('surface-raised'),
          overlay: token('surface-overlay'),
          inset: token('surface-inset'),
        },
        // Spelled `default` rather than Tailwind's `DEFAULT` on purpose: the
        // three steps are a ramp, and `border-line-default` sits next to
        // `border-line-subtle` legibly in a class list where a bare
        // `border-line` would read as an unrelated utility.
        line: {
          subtle: 'rgb(var(--line-subtle) / 0.06)',
          default: 'rgb(var(--line-default) / 0.09)',
          strong: 'rgb(var(--line-strong) / 0.16)',
        },
        content: {
          primary: token('content-primary'),
          secondary: token('content-secondary'),
          tertiary: token('content-tertiary'),
          muted: token('content-muted'),
        },
        accent: {
          DEFAULT: token('accent'),
          soft: token('accent-soft'),
          deep: token('accent-deep'),
          ink: token('accent-ink'),
        },
        state: {
          danger: token('state-danger'),
          warning: token('state-warning'),
          caution: token('state-caution'),
          success: token('state-success'),
          info: token('state-info'),
          neutral: token('state-neutral'),
        },
      },
      boxShadow: {
        // Flat by default. Elevation is carried by the hairline and the
        // surface step, not by a drop shadow, so only the focus/hover ring
        // needs a shadow token at all.
        ring: '0 0 0 1px rgb(var(--accent) / 0.35)',
        lift: '0 16px 40px -24px rgb(0 0 0 / 0.9)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out both',
        'scale-in': 'scale-in 0.18s ease-out both',
        'pulse-soft': 'pulse-soft 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
