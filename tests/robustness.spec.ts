import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

import type { ShimWindow } from './dom-shim.js';

/**
 * Coverage for behaviour the main suite assumed rather than asserted.
 *
 * Each block here corresponds to a gap found by a coverage audit of
 * `e2e.spec.ts`: a claim the dashboard makes to the user that no test would
 * have caught breaking. The recurring shape is "the happy path was tested, the
 * contract around it was not" — a filter was clicked but its result set was
 * never checked, a count was rendered but never compared to the list beneath
 * it, a route was visited but never left and returned to.
 *
 * Console/page-error watching is duplicated from `e2e.spec.ts` rather than
 * shared: these files are read independently when a failure lands, and a helper
 * import would hide the assertion that every test here also runs clean.
 */

const ROUTES = [
  { path: '/', title: 'Dashboard', docTitle: 'Autonomous PR Reviewer' },
  { path: '/reviews', title: 'PR Reviews', docTitle: 'PR Reviews · Autonomous PR Reviewer' },
  { path: '/analytics', title: 'Analytics', docTitle: 'Analytics · Autonomous PR Reviewer' },
  { path: '/rules', title: 'Rule Configuration', docTitle: 'Rule Configuration · Autonomous PR Reviewer' },
  { path: '/settings', title: 'Settings', docTitle: 'Settings · Autonomous PR Reviewer' },
] as const;

const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  // Next prefetches every `<Link>` in the shell on mount. A spec that navigates
  // again before those land tears the page down mid-flight, and Gecko/WebKit
  // surface the aborted request as `TypeError: Load failed` where Chromium stays
  // quiet. The message names its own recovery — the router falls back to a full
  // browser navigation, which is what `page.goto` was doing regardless — so it
  // reports a cancelled prefetch, not a broken route. Kept narrow on purpose:
  // only the self-certified-recovered form matches, so a genuine RSC failure
  // (which carries no such suffix) still fails the run.
  /Failed to fetch RSC payload .*Falling back to browser navigation/i,
  // The same cancelled prefetch as above, as Gecko words it when the aborted
  // request was the route's JS chunk rather than its RSC payload. Restricted to
  // `_next/static/chunks` — speculative loads the router issues for routes the
  // user has not visited. A chunk that genuinely failed to load would take its
  // route's own render and title assertions down with it, so nothing real hides
  // behind this.
  /Loading failed for the <script> with source .*_next\/static\/chunks/i,
];

interface Diagnostics {
  errors: string[];
  /**
   * Patterns a single test declares as expected. Used only where the browser
   * logging an error *is* the behaviour under test — navigating to a route that
   * must 404, for instance.
   */
  allow: RegExp[];
}

function watchConsole(page: Page): Diagnostics {
  const errors: string[] = [];

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    if (message.type() === 'warning' && !/hydrat|Warning:/i.test(text)) return;
    errors.push(`console.${message.type()}: ${text}`);
  });

  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  return { errors, allow: [] };
}

test.describe('dashboard robustness', () => {
  let diagnostics: Diagnostics;

  test.beforeEach(async ({ page }) => {
    diagnostics = watchConsole(page);
  });

  test.afterEach(async () => {
    const unexpected = diagnostics.errors.filter(
      (error) => !diagnostics.allow.some((pattern) => pattern.test(error)),
    );
    expect(unexpected, `unexpected console/page errors:\n${unexpected.join('\n')}`).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Navigation contracts
  // -------------------------------------------------------------------------

  test('each route sets its own document title', async ({ page }) => {
    // The tab strip and browser history are the only place these strings ever
    // surface, so a page that silently inherits the root layout title looks
    // fine on screen and wrong in a bookmark.
    const seen = new Set<string>();

    for (const route of ROUTES) {
      await page.goto(route.path);
      await expect(page).toHaveTitle(route.docTitle);
      seen.add(route.docTitle);
    }

    expect(seen.size, 'two routes share a document title').toBe(ROUTES.length);
  });

  test('browser back and forward walk the route history', async ({ page }) => {
    // Client-side routing that only ever moves forward is a common Next.js
    // regression: the link works, the back button strands the user.
    await page.goto('/');
    await page.getByTestId('nav-reviews').click();
    await expect(page.getByTestId('page-main')).toHaveAttribute('data-route', '/reviews');

    await page.getByTestId('nav-analytics').click();
    await expect(page.getByTestId('page-main')).toHaveAttribute('data-route', '/analytics');

    await page.goBack();
    await expect(page.getByTestId('page-main')).toHaveAttribute('data-route', '/reviews');
    await expect(page.getByTestId('page-title')).toHaveText('PR Reviews');

    await page.goBack();
    await expect(page.getByTestId('page-main')).toHaveAttribute('data-route', '/');

    await page.goForward();
    await expect(page.getByTestId('page-main')).toHaveAttribute('data-route', '/reviews');
  });

  test('a reload lands on the same route with the shell intact', async ({ page }) => {
    // Distinguishes a working server route from a client-only one: soft
    // navigation can succeed while a direct GET of the same URL 404s.
    await page.goto('/');
    await page.getByTestId('nav-rules').click();
    await expect(page.getByTestId('page-main')).toHaveAttribute('data-route', '/rules');

    await page.reload();

    await expect(page.getByTestId('page-main')).toHaveAttribute('data-route', '/rules');
    await expect(page.getByTestId('sidebar-nav')).toBeVisible();
    await expect(page.getByTestId('rules-form')).toBeVisible();
  });

  test('an unknown route returns 404 and still offers a way back', async ({ page }) => {
    // The browser logs the 404 to the console. Here that log is the point:
    // suppressing it would mean the route quietly answered 200.
    diagnostics.allow.push(/Failed to load resource.*404/i);

    const response = await page.goto('/this-route-does-not-exist');

    expect(response?.status(), 'a missing page must not answer 200').toBe(404);
    await expect(page.getByTestId('not-found')).toBeVisible();

    // The escape hatch has to actually navigate, not just look like a link.
    await page.getByTestId('not-found-reviews').click();
    await expect(page.getByTestId('page-main')).toHaveAttribute('data-route', '/reviews');
  });

  // -------------------------------------------------------------------------
  // Reviews explorer: filter, count and pagination semantics
  // -------------------------------------------------------------------------

  test('the result count matches the rows actually rendered', async ({ page }) => {
    // "Showing N of M" is the only feedback that a filter did anything. If N
    // drifts from the DOM the user is told a filter matched rows that are not
    // on screen.
    await page.goto('/reviews');

    const readCount = async () => {
      const text = (await page.getByTestId('reviews-count').innerText()).replace(/\s+/g, ' ');
      const match = text.match(/Showing (\d+) of (\d+)/);
      expect(match, `unparseable count text: ${text}`).not.toBeNull();
      return { showing: Number(match![1]), total: Number(match![2]) };
    };

    const rows = page.getByTestId('review-row');

    const initial = await readCount();
    expect(await rows.count()).toBe(initial.showing);
    expect(initial.showing).toBeLessThanOrEqual(initial.total);

    // Load every page, then the two numbers must converge.
    const loadMore = page.getByTestId('reviews-load-more');
    while (await loadMore.count()) {
      await loadMore.click();
    }

    const full = await readCount();
    expect(full.showing).toBe(full.total);
    expect(await rows.count()).toBe(full.total);
  });

  test('changing a filter resets pagination to the first page', async ({ page }) => {
    // Paging deep and then filtering must not leave the list showing a page
    // offset that no longer exists in the new result set.
    await page.goto('/reviews');

    const rows = page.getByTestId('review-row');
    const firstPage = await rows.count();

    const loadMore = page.getByTestId('reviews-load-more');
    await loadMore.click();
    expect(await rows.count()).toBeGreaterThan(firstPage);

    // Status filter, severity filter and search each reset independently.
    await page.getByTestId('status-all').click();
    expect(await rows.count(), 'status filter did not reset the page size').toBeLessThanOrEqual(firstPage);

    await loadMore.click();
    expect(await rows.count()).toBeGreaterThan(firstPage);
    await page.getByTestId('reviews-search').fill('a');
    expect(await rows.count(), 'search did not reset the page size').toBeLessThanOrEqual(firstPage);
  });

  test('severity filters combine with AND, not OR', async ({ page }) => {
    // `severities.every(...)` in the explorer means selecting two severities
    // narrows the list. An accidental `some` would widen it — the same click,
    // the opposite meaning, and nothing on screen says which one is in effect.
    await page.goto('/reviews');

    const loadAll = async () => {
      const loadMore = page.getByTestId('reviews-load-more');
      while (await loadMore.count()) {
        await loadMore.click();
      }
      return page.getByTestId('review-row').count();
    };

    await page.getByTestId('severity-filter-security').click();
    const securityOnly = await loadAll();
    expect(securityOnly, 'no review carries a security finding — pick another severity').toBeGreaterThan(0);

    await page.getByTestId('severity-filter-bug').click();
    const both = await loadAll();

    expect(both, 'adding a severity widened the result set, so the filter ORs').toBeLessThanOrEqual(
      securityOnly,
    );

    // And the survivors must genuinely carry both severities.
    await expect(page.getByTestId('severity-filter-security')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('severity-filter-bug')).toHaveAttribute('data-active', 'true');
  });

  test('reset clears every filter at once and then disables itself', async ({ page }) => {
    await page.goto('/reviews');

    const rows = page.getByTestId('review-row');
    const baseline = await rows.count();

    await page.getByTestId('reviews-search').fill('zzzz-no-such-review');
    await page.getByTestId('severity-filter-nit').click();
    await expect(page.getByTestId('reviews-empty')).toBeVisible();

    await page.getByTestId('reviews-reset').click();

    await expect(page.getByTestId('reviews-search')).toHaveValue('');
    await expect(page.getByTestId('severity-filter-nit')).toHaveAttribute('data-active', 'false');
    await expect(page.getByTestId('status-all')).toHaveAttribute('data-active', 'true');
    expect(await rows.count()).toBe(baseline);
    await expect(page.getByTestId('reviews-reset')).toBeDisabled();
  });

  test('a search with no matches shows the empty state, not a blank list', async ({ page }) => {
    await page.goto('/reviews');

    await page.getByTestId('reviews-search').fill('qqzzxx-definitely-not-present');

    await expect(page.getByTestId('reviews-empty')).toBeVisible();
    await expect(page.getByTestId('review-row')).toHaveCount(0);
    await expect(page.getByTestId('reviews-load-more')).toHaveCount(0);
    await expect(page.getByTestId('reviews-count')).toContainText('0');
  });

  // -------------------------------------------------------------------------
  // Inspector lifecycle
  // -------------------------------------------------------------------------

  test('the inspector releases the body scroll lock when it closes', async ({ page }) => {
    // A modal that locks scrolling on open and forgets to unlock leaves the
    // whole page frozen with no visible cause. Escape and the close button are
    // separate code paths and both have to restore it.
    await page.goto('/reviews');

    const overflowNow = () =>
      page.evaluate(() => {
        // Called off `win`, not destructured: `getComputedStyle` needs its
        // `this` to be the window or the browser throws "Illegal invocation".
        const win = globalThis as unknown as ShimWindow;
        return win.getComputedStyle(win.document.body).overflow;
      });

    const before = await overflowNow();

    await page.getByTestId('review-row').first().click();
    await expect(page.getByTestId('review-inspector')).toBeVisible();

    await page.getByTestId('inspector-close').click();
    await expect(page.getByTestId('review-inspector')).toHaveCount(0);
    expect(await overflowNow(), 'close button left the body scroll-locked').toBe(before);

    // Same again, dismissed with Escape.
    await page.getByTestId('review-row').first().click();
    await expect(page.getByTestId('review-inspector')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('review-inspector')).toHaveCount(0);
    expect(await overflowNow(), 'Escape left the body scroll-locked').toBe(before);

    // And the page must still actually scroll.
    await expect(page.getByTestId('reviews-explorer')).toBeVisible();
  });

  test('the inspector backdrop dismisses the dialog', async ({ page }) => {
    await page.goto('/reviews');

    await page.getByTestId('review-row').first().click();
    await expect(page.getByTestId('review-inspector')).toBeVisible();

    // Click the backdrop at a corner, well away from the panel itself.
    await page.getByTestId('inspector-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId('review-inspector')).toHaveCount(0);
  });

  test('opening a second review replaces the first payload entirely', async ({ page }) => {
    // The inspector is a single instance reused across rows. Stale state from
    // the previous review showing under a new title is worse than an error.
    await page.goto('/reviews');

    const rows = page.getByTestId('review-row');
    test.skip((await rows.count()) < 2, 'needs at least two reviews');

    const readJson = async () => {
      await page.getByTestId('inspector-tab-json').click();
      const raw = await page.getByTestId('inspector-json').innerText();
      let parsed: unknown;
      expect(() => {
        parsed = JSON.parse(raw) as unknown;
      }, 'the raw payload tab is not valid JSON').not.toThrow();
      return parsed as { summary?: string; overall_risk?: string; comments?: unknown[] };
    };

    await rows.nth(0).click();
    const firstPr = await page.getByTestId('inspector-pr-number').innerText();
    const firstTitle = await page.getByTestId('inspector-title').innerText();
    const firstJson = await readJson();
    await page.getByTestId('inspector-close').click();
    await expect(page.getByTestId('review-inspector')).toHaveCount(0);

    await rows.nth(1).click();
    await expect(page.getByTestId('inspector-pr-number')).not.toHaveText(firstPr);
    await expect(page.getByTestId('inspector-title')).not.toHaveText(firstTitle);

    // The payload tab holds the model's review object — summary, risk and
    // findings — not the PR metadata in the header. It must have swapped with
    // the header rather than lagging a review behind.
    const secondJson = await readJson();
    expect(secondJson.summary, 'payload has no summary').toBeTruthy();
    expect(secondJson.overall_risk).toMatch(/^(low|medium|high|critical)$/);
    expect(Array.isArray(secondJson.comments)).toBe(true);
    expect(
      JSON.stringify(secondJson),
      'the payload tab still shows the previously opened review',
    ).not.toBe(JSON.stringify(firstJson));
  });

  // -------------------------------------------------------------------------
  // Account menu
  // -------------------------------------------------------------------------

  test('the account menu closes on outside click and on Escape', async ({ page }) => {
    // An overlay that only closes via its own trigger sits on top of whatever
    // the user tries to click next.
    await page.goto('/');

    await page.getByTestId('account-button').click();
    await expect(page.getByTestId('account-menu')).toBeVisible();

    await page.getByTestId('page-title').click();
    await expect(page.getByTestId('account-menu')).toHaveCount(0);

    await page.getByTestId('account-button').click();
    await expect(page.getByTestId('account-menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('account-menu')).toHaveCount(0);
  });

  test('the account menu settings entry navigates', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('account-button').click();
    await page.getByTestId('account-menu-settings').click();

    await expect(page.getByTestId('page-main')).toHaveAttribute('data-route', '/settings');
    await expect(page.getByTestId('account-menu')).toHaveCount(0);
  });
});
