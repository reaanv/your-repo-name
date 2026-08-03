import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

/**
 * End-to-end coverage for the dashboard.
 *
 * Every test runs against the production bundle (see `playwright.config.ts`) and
 * every test asserts that the page produced no console errors and no uncaught
 * page errors, so a React hydration mismatch or a runtime throw fails the suite
 * even when the assertions themselves pass.
 */

const ROUTES = [
  { path: '/', title: 'Dashboard', nav: 'nav-dashboard' },
  { path: '/reviews', title: 'PR Reviews', nav: 'nav-reviews' },
  { path: '/analytics', title: 'Analytics', nav: 'nav-analytics' },
  { path: '/rules', title: 'Rule Configuration', nav: 'nav-rules' },
  { path: '/settings', title: 'Settings', nav: 'nav-settings' },
] as const;

const SEVERITIES = ['security', 'bug', 'optimization', 'nit'] as const;

/** Console noise that is not a defect in the app under test. */
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  // A cancelled `<Link>` prefetch, not a broken route: navigating again before
  // the shell's prefetches land aborts them, and Gecko/WebKit report that where
  // Chromium stays quiet. Matched only in the form that names its own recovery,
  // so a real RSC failure still fails the run. See tests/robustness.spec.ts.
  /Failed to fetch RSC payload .*Falling back to browser navigation/i,
  // The same cancelled prefetch as Gecko words it when the aborted request was
  // the route's JS chunk. A chunk that truly failed to load would break that
  // route's own assertions. See tests/robustness.spec.ts.
  /Loading failed for the <script> with source .*_next\/static\/chunks/i,
];

interface Diagnostics {
  errors: string[];
}

function watchConsole(page: Page): Diagnostics {
  const errors: string[] = [];

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    // Warnings are recorded too: React logs hydration mismatches at warn level.
    if (message.type() === 'warning' && !/hydrat|Warning:/i.test(text)) return;
    errors.push(`console.${message.type()}: ${text}`);
  });

  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'unknown';
    if (/ERR_ABORTED/.test(failure)) return;
    errors.push(`requestfailed: ${request.url()} — ${failure}`);
  });

  return { errors };
}

test.describe('Autonomous PR Reviewer dashboard', () => {
  let diagnostics: Diagnostics;

  test.beforeEach(async ({ page }) => {
    diagnostics = watchConsole(page);
  });

  test.afterEach(async () => {
    expect(diagnostics.errors, `unexpected console/page errors:\n${diagnostics.errors.join('\n')}`).toEqual(
      [],
    );
  });

  // -------------------------------------------------------------------------
  // Routing & shell
  // -------------------------------------------------------------------------

  for (const route of ROUTES) {
    test(`renders ${route.path} with its shell chrome`, async ({ page }) => {
      await page.goto(route.path);

      await expect(page.getByTestId('page-main')).toHaveAttribute('data-route', route.path);
      await expect(page.getByTestId('page-title')).toHaveText(route.title);
      await expect(page.getByTestId('sidebar-nav')).toBeVisible();
      await expect(page.getByTestId('agent-status')).toBeVisible();
      await expect(page.getByTestId(route.nav)).toHaveAttribute('data-active', 'true');

      // Exactly one nav item may be active at a time.
      const active = page.locator('[data-testid^="nav-"][data-active="true"]');
      await expect(active).toHaveCount(1);
    });
  }

  test('every sidebar link navigates and marks itself active', async ({ page }) => {
    await page.goto('/');

    for (const route of ROUTES) {
      await page.getByTestId(route.nav).click();
      await expect(page).toHaveURL(new RegExp(`${route.path === '/' ? '/$' : route.path}`));
      await expect(page.getByTestId('page-main')).toHaveAttribute('data-route', route.path);
      await expect(page.getByTestId('page-title')).toHaveText(route.title);
      await expect(page.getByTestId(route.nav)).toHaveAttribute('data-active', 'true');
    }
  });

  test('top bar sync button runs and settles', async ({ page }) => {
    await page.goto('/');

    const sync = page.getByTestId('sync-button');
    await expect(sync).toHaveAttribute('data-syncing', 'false');
    await sync.click();
    await expect(page.getByTestId('sync-button')).toHaveAttribute('data-syncing', 'false', {
      timeout: 5_000,
    });
    await expect(page.getByTestId('sync-label')).toHaveText('Synced just now');
  });

  test('account menu opens, navigates to settings, and closes on Escape', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('account-button').click();
    await expect(page.getByTestId('account-menu')).toBeVisible();

    // Escape dismisses.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('account-menu')).toHaveCount(0);

    // Sign out is a no-op that closes the menu.
    await page.getByTestId('account-button').click();
    await page.getByTestId('account-menu-signout').click();
    await expect(page.getByTestId('account-menu')).toHaveCount(0);

    // Settings link routes.
    await page.getByTestId('account-button').click();
    await page.getByTestId('account-menu-settings').click();
    await expect(page.getByTestId('page-main')).toHaveAttribute('data-route', '/settings');
  });

  test('@responsive mobile drawer opens via toggle and closes three ways', async ({ page }) => {
    await page.goto('/');

    const sidebar = page.getByTestId('sidebar');
    await expect(sidebar).toHaveAttribute('data-open', 'false');

    // Close button.
    await page.getByTestId('sidebar-toggle').click();
    await expect(sidebar).toHaveAttribute('data-open', 'true');
    await page.getByTestId('sidebar-close').click();
    await expect(sidebar).toHaveAttribute('data-open', 'false');

    // Overlay. It spans the whole viewport and the drawer sits on top of its
    // left edge, so click the exposed strip to the right of the drawer rather
    // than the overlay's (occluded) centre.
    await page.getByTestId('sidebar-toggle').click();
    const overlay = page.getByTestId('sidebar-overlay');
    await expect(overlay).toBeVisible();
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    await overlay.click({ position: { x: (box?.width ?? 100) - 8, y: (box?.height ?? 100) / 2 } });
    await expect(sidebar).toHaveAttribute('data-open', 'false');

    // Navigating dismisses it.
    await page.getByTestId('sidebar-toggle').click();
    await expect(sidebar).toHaveAttribute('data-open', 'true');
    await page.getByTestId('nav-analytics').click();
    await expect(page.getByTestId('page-main')).toHaveAttribute('data-route', '/analytics');
    await expect(sidebar).toHaveAttribute('data-open', 'false');
  });

  // -------------------------------------------------------------------------
  // Dashboard
  // -------------------------------------------------------------------------

  test('dashboard renders hero, stats, pipeline, charts, and feed', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('hero')).toBeVisible();
    await expect(page.getByTestId('hero-redactions')).not.toBeEmpty();

    for (const id of ['stat-reviews', 'stat-open-findings', 'stat-score', 'stat-duration']) {
      await expect(page.getByTestId(id)).toBeVisible();
      await expect(page.getByTestId(`${id}-value`)).not.toBeEmpty();
      await expect(page.getByTestId(`${id}-delta`)).toBeVisible();
    }

    for (const step of ['fetch', 'sanitize', 'analyze', 'validate', 'post']) {
      await expect(page.getByTestId(`pipeline-step-${step}`)).toBeVisible();
    }

    await expect(page.getByTestId('health-chart')).toBeVisible();
    await expect(page.getByTestId('health-chart')).toHaveAttribute('data-points', '30');
    await expect(page.getByTestId('top-issues').first()).toBeVisible();
    await expect(page.getByTestId('live-feed')).toBeVisible();
    await expect(page.getByTestId('review-row').first()).toBeVisible();
  });

  test('live feed severity filters each produce a consistent result set', async ({ page }) => {
    await page.goto('/');

    const rows = page.getByTestId('feed-rows').getByTestId('review-row');
    const baseline = await rows.count();
    expect(baseline).toBeGreaterThan(0);

    for (const severity of SEVERITIES) {
      const pill = page.getByTestId(`filter-${severity}`);
      await pill.click();
      await expect(pill).toHaveAttribute('data-active', 'true');

      // Only one filter may be active at a time.
      await expect(page.getByTestId('feed-filters').locator('[data-active="true"]')).toHaveCount(1);

      const count = await rows.count();
      if (count === 0) {
        await expect(page.getByTestId('feed-empty')).toBeVisible();
      } else {
        // Every visible row must actually carry that severity.
        for (let i = 0; i < count; i += 1) {
          await expect(rows.nth(i).getByTestId(`severity-badge-${severity}`)).toHaveCount(1);
        }
      }
    }

    await page.getByTestId('filter-all').click();
    await expect(page.getByTestId('filter-all')).toHaveAttribute('data-active', 'true');
    await expect(rows).toHaveCount(baseline);
  });

  // -------------------------------------------------------------------------
  // Review inspector modal
  // -------------------------------------------------------------------------

  test('inspector opens from the feed, switches tabs, and closes via the close button', async ({ page }) => {
    await page.goto('/');

    const firstRow = page.getByTestId('review-row').first();
    const reviewId = await firstRow.getAttribute('data-review-id');
    await firstRow.click();

    const inspector = page.getByTestId('review-inspector');
    await expect(inspector).toBeVisible();
    await expect(inspector).toHaveAttribute('data-review-id', reviewId ?? '');
    await expect(page.getByTestId('inspector-title')).not.toBeEmpty();
    await expect(page.getByTestId('inspector-pr-number')).toContainText('#');

    // Findings is the default tab.
    await expect(page.getByTestId('inspector-tab-findings')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('inspector-panel-findings')).toBeVisible();

    // Diff tab: hunks, lines, and at least one inline AI comment.
    await page.getByTestId('inspector-tab-diff').click();
    await expect(page.getByTestId('inspector-panel-diff')).toBeVisible();
    await expect(page.getByTestId('diff-file').first()).toBeVisible();
    await expect(page.getByTestId('diff-hunk-header').first()).toBeVisible();
    await expect(page.getByTestId('diff-line').first()).toBeVisible();
    await expect(page.getByTestId('diff-inline-comment').first()).toBeVisible();

    // JSON tab: the validated payload.
    await page.getByTestId('inspector-tab-json').click();
    await expect(page.getByTestId('inspector-panel-json')).toBeVisible();
    const json = await page.getByTestId('inspector-json').innerText();
    const parsed = JSON.parse(json) as { summary: string; overall_risk: string; comments: unknown[] };
    expect(parsed).toHaveProperty('summary');
    expect(parsed).toHaveProperty('overall_risk');
    expect(Array.isArray(parsed.comments)).toBe(true);

    await page.getByTestId('inspector-close').click();
    await expect(page.getByTestId('review-inspector')).toHaveCount(0);
  });

  test('inspector closes via Escape and via the backdrop, and resets to the findings tab', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByTestId('review-row').first().click();
    await expect(page.getByTestId('review-inspector')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('review-inspector')).toHaveCount(0);

    // Reopen, move off the default tab, close, reopen: it must reset.
    await page.getByTestId('review-row').first().click();
    await page.getByTestId('inspector-tab-json').click();
    await expect(page.getByTestId('inspector-tab-json')).toHaveAttribute('data-active', 'true');
    await page.getByTestId('inspector-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId('review-inspector')).toHaveCount(0);

    await page.getByTestId('review-row').nth(1).click();
    await expect(page.getByTestId('inspector-tab-findings')).toHaveAttribute('data-active', 'true');
    await page.getByTestId('inspector-close').click();
    await expect(page.getByTestId('review-inspector')).toHaveCount(0);
  });

  // Opening every review and walking all three of its tabs is ~70 sequential
  // round trips. That fits the budget on Chromium and ran in ~25s alone on
  // Gecko, but with six browser projects competing for the worker pool it blew
  // even a tripled 135s budget. Splitting into interleaved shards keeps the
  // coverage exactly the same — every index is claimed by exactly one shard, and
  // `i % SHARDS` needs no advance knowledge of how many reviews exist — while
  // giving each a fraction of the work, its own budget, and a worker of its own.
  // A failure now also names which review broke instead of one opaque timeout.
  const INSPECTOR_SHARDS = 3;

  for (let shard = 0; shard < INSPECTOR_SHARDS; shard += 1) {
    test(`every review in the explorer opens an inspector with a coherent payload (shard ${shard + 1}/${INSPECTOR_SHARDS})`, async ({
      page,
    }) => {
      // Sharding cuts the work per test but each shard still opens and closes a
      // third of the reviews, so keep the widened budget: on Gecko under a full
      // six-project matrix that is still comfortably more than 45s of work.
      test.slow();

      await page.goto('/reviews');

      // Expand the full list first.
      const loadMore = page.getByTestId('reviews-load-more');
      while (await loadMore.count()) {
        await loadMore.click();
      }

      const rows = page.getByTestId('review-row');
      const total = await rows.count();
      expect(total).toBeGreaterThan(0);
      expect(total, 'more shards than reviews would leave a shard asserting nothing').toBeGreaterThan(
        shard,
      );

      for (let i = shard; i < total; i += INSPECTOR_SHARDS) {
        const row = rows.nth(i);
        const id = await row.getAttribute('data-review-id');
        await row.click();

        const inspector = page.getByTestId('review-inspector');
        await expect(inspector, `review ${i} did not open`).toBeVisible();
        await expect(inspector).toHaveAttribute('data-review-id', id ?? '');

        // Findings tab shows either the findings list or the explicit empty state.
        // Wait for one of the two to paint before counting — otherwise a slow
        // render reads as "zero findings" and the wrong branch is asserted.
        await expect(
          page.locator('[data-testid="inspector-findings"], [data-testid="inspector-empty"]'),
        ).toBeVisible();

        if (await page.getByTestId('inspector-empty').count()) {
          await expect(page.getByTestId('finding-card')).toHaveCount(0);
        } else {
          expect(await page.getByTestId('finding-card').count()).toBeGreaterThan(0);
        }

        // The diff tab must render for every review.
        await page.getByTestId('inspector-tab-diff').click();
        await expect(page.getByTestId('inspector-panel-diff')).toBeVisible();

        // The JSON tab must always be parseable.
        await page.getByTestId('inspector-tab-json').click();
        const json = await page.getByTestId('inspector-json').innerText();
        expect(() => JSON.parse(json), `review ${i} rendered unparseable JSON`).not.toThrow();

        await page.getByTestId('inspector-close').click();
        await expect(page.getByTestId('review-inspector')).toHaveCount(0);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Reviews explorer
  // -------------------------------------------------------------------------

  test('reviews explorer status tabs filter to matching rows', async ({ page }) => {
    await page.goto('/reviews');

    const rows = page.getByTestId('reviews-list').getByTestId('review-row');
    await expect(page.getByTestId('status-all')).toHaveAttribute('data-active', 'true');

    for (const status of ['passed', 'changes-requested', 'running', 'failed'] as const) {
      const tab = page.getByTestId(`status-${status}`);
      await tab.click();
      await expect(tab).toHaveAttribute('data-active', 'true');
      await expect(page.getByTestId('status-tabs').locator('[data-active="true"]')).toHaveCount(1);

      const count = await rows.count();
      if (count === 0) {
        await expect(page.getByTestId('reviews-empty')).toBeVisible();
        continue;
      }
      for (let i = 0; i < count; i += 1) {
        await expect(rows.nth(i)).toHaveAttribute('data-status', status);
      }
    }

    await page.getByTestId('status-all').click();
    await expect(page.getByTestId('status-all')).toHaveAttribute('data-active', 'true');
  });

  test('reviews explorer severity pills are multi-select and every row satisfies them', async ({ page }) => {
    await page.goto('/reviews');

    const rows = page.getByTestId('reviews-list').getByTestId('review-row');

    for (const severity of SEVERITIES) {
      const pill = page.getByTestId(`severity-filter-${severity}`);
      await pill.click();
      await expect(pill).toHaveAttribute('data-active', 'true');
    }
    await expect(page.getByTestId('severity-filters').locator('[data-active="true"]')).toHaveCount(4);

    // Turn them all back off; the list must return to the unfiltered size.
    for (const severity of SEVERITIES) {
      await page.getByTestId(`severity-filter-${severity}`).click();
      await expect(page.getByTestId(`severity-filter-${severity}`)).toHaveAttribute('data-active', 'false');
    }

    // A single severity: every visible row must carry that badge.
    await page.getByTestId('severity-filter-security').click();
    await expect(page.getByTestId('severity-filter-security')).toHaveAttribute('data-active', 'true');
    const count = await rows.count();
    if (count === 0) {
      await expect(page.getByTestId('reviews-empty')).toBeVisible();
    } else {
      for (let i = 0; i < count; i += 1) {
        await expect(rows.nth(i).getByTestId('severity-badge-security')).toHaveCount(1);
      }
    }
  });

  test('reviews search narrows results and the empty state appears for nonsense queries', async ({
    page,
  }) => {
    await page.goto('/reviews');

    const rows = page.getByTestId('reviews-list').getByTestId('review-row');
    const search = page.getByTestId('reviews-search');

    await search.fill('checkout');
    await expect(page.getByTestId('reviews-count')).toBeVisible();
    // Retrying poll rather than a bare count(): the list re-renders after fill.
    await expect.poll(() => rows.count()).toBeGreaterThan(0);

    await search.fill('zzzz-no-such-review-zzzz');
    await expect(page.getByTestId('reviews-empty')).toBeVisible();
    await expect(rows).toHaveCount(0);

    await search.fill('');
    await expect(rows.first()).toBeVisible();
  });

  test('reviews sort select reorders the list for every option', async ({ page }) => {
    await page.goto('/reviews');

    const rows = page.getByTestId('reviews-list').getByTestId('review-row');
    const sort = page.getByTestId('reviews-sort');

    for (const option of ['oldest', 'findings', 'risk', 'newest'] as const) {
      await sort.selectOption(option);
      await expect(sort).toHaveValue(option);
      await expect(rows.first()).toBeVisible();
    }

    // Highest-risk sort must lead with the worst risk present.
    await sort.selectOption('risk');
    const firstRisk = await rows.first().getAttribute('data-risk');
    const allRisks = await rows.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-risk') ?? ''),
    );
    const order = ['critical', 'high', 'medium', 'low'];
    const best = order.find((risk) => allRisks.includes(risk));
    expect(firstRisk).toBe(best);
  });

  test('reviews reset button clears search, status, severity, and sort', async ({ page }) => {
    await page.goto('/reviews');

    await page.getByTestId('reviews-search').fill('atlas');
    await page.getByTestId('status-passed').click();
    await page.getByTestId('severity-filter-bug').click();
    await page.getByTestId('reviews-sort').selectOption('oldest');

    const reset = page.getByTestId('reviews-reset');
    await expect(reset).toBeEnabled();
    await reset.click();

    await expect(page.getByTestId('reviews-search')).toHaveValue('');
    await expect(page.getByTestId('status-all')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('severity-filter-bug')).toHaveAttribute('data-active', 'false');
    await expect(page.getByTestId('reviews-sort')).toHaveValue('newest');
    await expect(reset).toBeDisabled();
  });

  test('load more pages through the full result set', async ({ page }) => {
    await page.goto('/reviews');

    const rows = page.getByTestId('reviews-list').getByTestId('review-row');
    const initial = await rows.count();

    const loadMore = page.getByTestId('reviews-load-more');
    await expect(loadMore).toBeVisible();
    await loadMore.click();
    await expect.poll(() => rows.count()).toBeGreaterThan(initial);

    while (await loadMore.count()) {
      await loadMore.click();
    }
    await expect(page.getByTestId('reviews-load-more')).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // Analytics
  // -------------------------------------------------------------------------

  test('analytics range tabs redraw every chart', async ({ page }) => {
    await page.goto('/analytics');

    await expect(page.getByTestId('analytics-view')).toHaveAttribute('data-range', '30');

    for (const range of ['7', '30', '90'] as const) {
      await page.getByTestId(`range-${range}`).click();
      await expect(page.getByTestId(`range-${range}`)).toHaveAttribute('data-active', 'true');
      await expect(page.getByTestId('range-tabs').locator('[data-active="true"]')).toHaveCount(1);
      await expect(page.getByTestId('analytics-view')).toHaveAttribute('data-range', range);

      await expect(page.getByTestId('health-chart')).toHaveAttribute('data-points', range);
      await expect(page.getByTestId('token-chart')).toHaveAttribute('data-points', range);
      await expect(page.getByTestId('token-bar')).toHaveCount(Number(range));
      await expect(page.getByTestId('health-point')).toHaveCount(Number(range));
    }
  });

  test('analytics panels, donut, and stat cards all render', async ({ page }) => {
    await page.goto('/analytics');

    for (const id of ['panel-health', 'panel-issues', 'panel-categories', 'panel-tokens']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }

    for (const id of ['stat-health', 'stat-findings', 'stat-security-share', 'stat-tokens']) {
      await expect(page.getByTestId(`${id}-value`)).not.toBeEmpty();
    }

    await expect(page.getByTestId('severity-donut')).toBeVisible();
    await expect(page.getByTestId('donut-segment')).toHaveCount(4);
    await expect(page.getByTestId('donut-legend-row')).toHaveCount(4);
    await expect(page.getByTestId('top-issue-row').first()).toBeVisible();
    await expect.poll(() => page.getByTestId('top-issue-row').count()).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Rule configuration
  // -------------------------------------------------------------------------

  const RULE_SWITCHES = [
    'rule-enforce-security',
    'rule-block-critical',
    'rule-redact-secrets',
    'rule-skip-generated',
    'rule-auto-approve',
    'rule-notify-failure',
  ] as const;

  test('every rule switch toggles both ways and updates aria-checked', async ({ page }) => {
    await page.goto('/rules');

    for (const id of RULE_SWITCHES) {
      const toggle = page.getByTestId(id);
      const before = await toggle.getAttribute('data-state');
      const flipped = before === 'checked' ? 'unchecked' : 'checked';

      await toggle.click();
      await expect(toggle).toHaveAttribute('data-state', flipped);
      await expect(toggle).toHaveAttribute('aria-checked', String(flipped === 'checked'));

      await toggle.click();
      await expect(toggle).toHaveAttribute('data-state', before ?? 'checked');
    }
  });

  test('strictness radios are mutually exclusive', async ({ page }) => {
    await page.goto('/rules');

    for (const level of ['lenient', 'strict', 'balanced'] as const) {
      await page.getByTestId(`strictness-${level}`).click();
      await expect(page.getByTestId(`strictness-${level}`)).toHaveAttribute('data-active', 'true');
      await expect(page.locator('[data-testid^="strictness-"][data-active="true"]')).toHaveCount(1);
    }
  });

  test('threshold inputs accept values and the confidence readout tracks the slider', async ({ page }) => {
    await page.goto('/rules');

    const slider = page.getByTestId('min-confidence');
    await slider.fill('0.85');
    await expect(page.getByTestId('min-confidence-value')).toHaveText('0.85');

    await slider.fill('0');
    await expect(page.getByTestId('min-confidence-value')).toHaveText('0.00');

    const maxComments = page.getByTestId('max-comments');
    await maxComments.fill('12');
    await expect(maxComments).toHaveValue('12');

    const maxDiff = page.getByTestId('max-diff-chars');
    await maxDiff.fill('90000');
    await expect(maxDiff).toHaveValue('90000');

    const failOn = page.getByTestId('fail-on-severity');
    for (const value of ['security', 'bug', 'optimization', 'nit', 'none'] as const) {
      await failOn.selectOption(value);
      await expect(failOn).toHaveValue(value);
    }

    const custom = page.getByTestId('custom-rules');
    await custom.fill('Reject any new dependency without a lockfile entry.');
    await expect(custom).toHaveValue('Reject any new dependency without a lockfile entry.');
  });

  test('severity toggles flip, and save then restore-defaults round-trips the form', async ({ page }) => {
    await page.goto('/rules');

    const form = page.getByTestId('rules-form');
    await expect(form).toHaveAttribute('data-dirty', 'false');
    await expect(page.getByTestId('rules-reset')).toBeDisabled();

    for (const severity of SEVERITIES) {
      const toggle = page.getByTestId(`severity-toggle-${severity}`);
      await expect(toggle).toHaveAttribute('data-active', 'true');
      await toggle.click();
      await expect(toggle).toHaveAttribute('data-active', 'false');
    }

    await expect(form).toHaveAttribute('data-dirty', 'true');

    await page.getByTestId('rules-save').click();
    await expect(page.getByTestId('rules-saved')).toBeVisible();

    await page.getByTestId('rules-reset').click();
    await expect(form).toHaveAttribute('data-dirty', 'false');
    await expect(page.getByTestId('rules-saved')).toHaveCount(0);
    for (const severity of SEVERITIES) {
      await expect(page.getByTestId(`severity-toggle-${severity}`)).toHaveAttribute('data-active', 'true');
    }
    await expect(page.getByTestId('rules-reset')).toBeDisabled();
  });

  test('saving rules does not reload the page', async ({ page }) => {
    await page.goto('/rules');

    // `globalThis` is `window` in the page context; the root tsconfig has no DOM lib.
    await page.evaluate(() => {
      (globalThis as unknown as { __stillHere: boolean }).__stillHere = true;
    });

    await page.getByTestId('rules-save').click();
    await expect(page.getByTestId('rules-saved')).toBeVisible();

    const survived = await page.evaluate(
      () => (globalThis as unknown as { __stillHere?: boolean }).__stillHere === true,
    );
    expect(survived).toBe(true);
    expect(new URL(page.url()).search).toBe('');
  });

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  const SETTINGS_SWITCHES = [
    'setting-review-draft',
    'setting-review-synchronize',
    'setting-email-digest',
    'setting-slack-alerts',
    'setting-dry-run',
    'setting-telemetry',
  ] as const;

  test('every settings switch toggles both ways', async ({ page }) => {
    await page.goto('/settings');

    for (const id of SETTINGS_SWITCHES) {
      const toggle = page.getByTestId(id);
      const before = await toggle.getAttribute('data-state');
      const flipped = before === 'checked' ? 'unchecked' : 'checked';

      await toggle.click();
      await expect(toggle).toHaveAttribute('data-state', flipped);
      await toggle.click();
      await expect(toggle).toHaveAttribute('data-state', before ?? 'checked');
    }
  });

  test('settings text inputs accept edits and the model select changes', async ({ page }) => {
    await page.goto('/settings');

    const workspace = page.getByTestId('workspace-name');
    await workspace.fill('nightly-build-co');
    await expect(workspace).toHaveValue('nightly-build-co');

    const branch = page.getByTestId('default-branch');
    await branch.fill('trunk');
    await expect(branch).toHaveValue('trunk');

    const webhook = page.getByTestId('webhook-url');
    await webhook.fill('https://example.test/hook');
    await expect(webhook).toHaveValue('https://example.test/hook');

    const model = page.getByTestId('review-model');
    for (const value of ['claude-sonnet-5', 'claude-haiku-4-5', 'claude-opus-5'] as const) {
      await model.selectOption(value);
      await expect(model).toHaveValue(value);
    }
  });

  test('api key visibility toggle flips the input type', async ({ page }) => {
    await page.goto('/settings');

    const input = page.getByTestId('api-key');
    const toggle = page.getByTestId('api-key-toggle');

    await expect(input).toHaveAttribute('type', 'password');
    await toggle.click();
    await expect(input).toHaveAttribute('type', 'text');
    await expect(toggle).toHaveAttribute('data-state', 'visible');
    await toggle.click();
    await expect(input).toHaveAttribute('type', 'password');
    await expect(toggle).toHaveAttribute('data-state', 'hidden');
  });

  test('danger zone requires confirmation and can be cancelled', async ({ page }) => {
    await page.goto('/settings');

    // Cancel path.
    await page.getByTestId('disconnect').click();
    await expect(page.getByTestId('disconnect-confirm-prompt')).toBeVisible();
    await page.getByTestId('disconnect-cancel').click();
    await expect(page.getByTestId('disconnect')).toBeVisible();
    await expect(page.getByTestId('disconnect-confirm')).toHaveCount(0);

    // Confirm path.
    await page.getByTestId('disconnect').click();
    await page.getByTestId('disconnect-confirm').click();
    await expect(page.getByTestId('disconnect-done')).toBeVisible();

    // Discarding changes restores the danger zone.
    await page.getByTestId('settings-reset').click();
    await expect(page.getByTestId('disconnect')).toBeVisible();
  });

  test('settings save shows confirmation and discard reverts every field', async ({ page }) => {
    await page.goto('/settings');

    await page.getByTestId('workspace-name').fill('temporary-org');
    await page.getByTestId('setting-dry-run').click();
    await expect(page.getByTestId('setting-dry-run')).toHaveAttribute('data-state', 'checked');

    await page.getByTestId('settings-save').click();
    await expect(page.getByTestId('settings-saved')).toBeVisible();

    await page.getByTestId('settings-reset').click();
    await expect(page.getByTestId('workspace-name')).toHaveValue('acme-engineering');
    await expect(page.getByTestId('setting-dry-run')).toHaveAttribute('data-state', 'unchecked');
    await expect(page.getByTestId('settings-saved')).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // Cross-cutting: nothing on any page throws when clicked
  // -------------------------------------------------------------------------

  test('every enabled button on every route is clickable without breaking the page', async ({ page }) => {
    // Four routes' worth of every visible button, clicked one at a time. It fits
    // the default budget alone but not with six browser projects competing for
    // workers, where it timed out on Gecko and passed in 50s run by itself.
    // Widen rather than trim: clicking *every* button is the whole assertion.
    test.slow();

    for (const route of ROUTES) {
      await page.goto(route.path);

      const buttons = page.locator('main button:not([disabled]), header button:not([disabled])');
      const count = await buttons.count();
      expect(count).toBeGreaterThan(0);

      for (let i = 0; i < count; i += 1) {
        const button = buttons.nth(i);
        if (!(await button.isVisible())) continue;
        if (await button.isDisabled()) continue;

        await button.click({ trial: false, timeout: 5_000 }).catch(() => {
          // A click that re-renders the list can detach this handle; the page
          // itself is still asserted below, and console errors are checked in
          // afterEach.
        });

        // If a modal opened, close it so the sweep can continue.
        if (await page.getByTestId('review-inspector').count()) {
          await page.keyboard.press('Escape');
          await expect(page.getByTestId('review-inspector')).toHaveCount(0);
        }
        if (await page.getByTestId('account-menu').count()) {
          await page.keyboard.press('Escape');
        }

        // Any navigation triggered by a click must land on a real route.
        const route2 = new URL(page.url()).pathname;
        if (route2 !== route.path) {
          await expect(page.getByTestId('page-main')).toHaveAttribute('data-route', route2);
          await page.goto(route.path);
        }
      }

      await expect(page.getByTestId('page-main')).toHaveAttribute('data-route', route.path);
    }
  });
});
