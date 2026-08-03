import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.DASHBOARD_PORT ?? 3100);
/** Point at a deployed URL to run the same suite against a real environment. */
const EXTERNAL_URL = process.env.E2E_BASE_URL;
const BASE_URL = EXTERNAL_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests',
  // Every `*.spec.ts` — `tests/` also holds `*.test.ts` files that belong to
  // the Node unit runner, and `dom-shim.ts`, which is types only.
  testMatch: /\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    // Desktop engines run the whole suite. Blink, Gecko and WebKit disagree on
    // enough — focus order, Escape handling, `inert`, backdrop-filter compositing
    // — that a Chromium-only pass is not evidence the dashboard works.
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      // The drawer only exists below the `lg` breakpoint; those specs run in the
      // mobile projects instead.
      grepInvert: /@responsive/,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
      grepInvert: /@responsive/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
      grepInvert: /@responsive/,
    },
    // Tablet sits between the `md` and `lg` breakpoints — the layout switches
    // there, so it gets its own pass rather than being assumed from the ends.
    {
      name: 'tablet',
      use: { ...devices['iPad Mini landscape'] },
      grepInvert: /@responsive/,
    },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] }, grep: /@responsive/ },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] }, grep: /@responsive/ },
  ],

  // Build once, then serve the production bundle — the dev server's overlay and
  // fast-refresh sockets add console noise the suite deliberately asserts against.
  // Skipped entirely when E2E_BASE_URL targets an already-running deployment.
  webServer: EXTERNAL_URL
    ? undefined
    : {
        command: 'npm --prefix dashboard run build && npm --prefix dashboard run start',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
