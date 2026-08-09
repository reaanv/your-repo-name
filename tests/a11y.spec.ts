import { expect, test, type Page } from '@playwright/test';

import type { ShimElement, ShimWindow } from './dom-shim.js';

/**
 * Keyboard and assistive-technology contracts.
 *
 * These assert behaviour a sighted mouse user never sees, which is exactly why
 * it rots silently: a focus trap, a roving tabindex, an `inert` off-canvas
 * drawer and a live region all look identical on screen whether they work or
 * not. Each test below corresponds to a WCAG 2.2 AA failure that was present in
 * this dashboard and fixed — the test is what stops it coming back.
 *
 * Where a rule is engine-sensitive it is noted inline. `inert` in particular is
 * the reason this file runs on all three desktop engines rather than Chromium
 * alone.
 */

/**
 * Selector for an exact id.
 *
 * Not `#${id}`: React's `useId()` produces ids containing `«»` and `:`, which
 * are not valid in a CSS id selector, and `CSS.escape` is a browser global that
 * does not exist on the Node side of a spec. An attribute selector sidesteps
 * both.
 */
const byId = (id: string) => `[id="${id.replace(/"/g, '\\"')}"]`;

/** Testid of the element that currently has focus, or a describing fallback. */
async function focusedTestId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const { document } = globalThis as unknown as ShimWindow;
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    return el.getAttribute('data-testid') ?? `<${el.tagName.toLowerCase()}>`;
  });
}

test.describe('accessibility contracts', () => {
  // -------------------------------------------------------------------------
  // Inspector dialog: focus trap and focus restoration
  // -------------------------------------------------------------------------

  test('the inspector traps Tab inside the dialog', async ({ page }) => {
    // Without a trap, Tab walks straight out of the modal and into the page
    // behind it, where a screen-reader user has no way to know they have left
    // the dialog and no way to find their way back.
    await page.goto('/reviews');
    await page.getByTestId('review-row').first().click();
    await expect(page.getByTestId('review-inspector')).toBeVisible();

    const dialog = page.getByTestId('review-inspector');
    const focusIsInsideDialog = () =>
      dialog.evaluate((node: ShimElement) => {
        const { document } = globalThis as unknown as ShimWindow;
        return node === document.activeElement || node.contains(document.activeElement);
      });

    // Twenty-five tabs is comfortably more than the dialog's focusable count,
    // so if focus can escape at all it will have escaped by now.
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab');
      expect(await focusIsInsideDialog(), `focus escaped the dialog after ${i + 1} Tab press(es)`).toBe(
        true,
      );
    }

    // Shift+Tab must wrap backwards without escaping either.
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(
        await focusIsInsideDialog(),
        `focus escaped backwards after ${i + 1} Shift+Tab press(es)`,
      ).toBe(true);
    }
  });

  test('closing the inspector returns focus to the row that opened it', async ({ page }) => {
    // WCAG 2.4.3. Losing focus to <body> dumps a keyboard user back at the top
    // of the document and makes them re-traverse the whole page.
    await page.goto('/reviews');

    const row = page.getByTestId('review-row').first();
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('review-inspector')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('review-inspector')).toHaveCount(0);

    const restored = await row.evaluate((node: ShimElement) => {
      const { document } = globalThis as unknown as ShimWindow;
      return node === document.activeElement || node.contains(document.activeElement);
    });
    expect(restored, 'focus was not restored to the opening row').toBe(true);
  });

  test('the inspector tablist implements the APG keyboard model', async ({ page }) => {
    await page.goto('/reviews');
    await page.getByTestId('review-row').first().click();

    const findings = page.getByTestId('inspector-tab-findings');
    const diff = page.getByTestId('inspector-tab-diff');
    const json = page.getByTestId('inspector-tab-json');

    // Roving tabindex: exactly one tab is in the tab order.
    await expect(findings).toHaveAttribute('tabindex', '0');
    await expect(diff).toHaveAttribute('tabindex', '-1');
    await expect(json).toHaveAttribute('tabindex', '-1');

    // Each tab must point at the panel it controls, and the panel back at it.
    const controls = await findings.getAttribute('aria-controls');
    expect(controls, 'tab has no aria-controls').toBeTruthy();
    await expect(page.locator(byId(controls!))).toHaveCount(1);

    await findings.focus();
    await page.keyboard.press('ArrowRight');
    await expect(diff).toHaveAttribute('aria-selected', 'true');
    expect(await focusedTestId(page)).toBe('inspector-tab-diff');

    await page.keyboard.press('ArrowRight');
    await expect(json).toHaveAttribute('aria-selected', 'true');

    // Wraps at the end rather than dead-ending.
    await page.keyboard.press('ArrowRight');
    await expect(findings).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('End');
    await expect(json).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(findings).toHaveAttribute('aria-selected', 'true');
  });

  // -------------------------------------------------------------------------
  // Off-canvas drawer
  // -------------------------------------------------------------------------

  test('@responsive a closed drawer holds no tabbable controls', async ({ page }) => {
    // A translated-off-screen drawer is still in the tab order. On a phone that
    // means several invisible tab stops before the first real control — focus
    // apparently vanishing into nothing.
    await page.goto('/');

    const sidebar = page.getByTestId('sidebar');
    await expect(page.getByTestId('sidebar-toggle')).toBeVisible();

    const countTabbable = () =>
      sidebar.evaluate((node: ShimElement) => {
        const { getComputedStyle } = globalThis as unknown as ShimWindow;
        const candidates = node.querySelectorAll('a[href], button, input, select, textarea');
        return Array.from(candidates).filter((el) => {
          if (el.tabIndex < 0) return false;
          // `inert` is inherited, so walk up to an inert ancestor rather than
          // reading the attribute off the control itself.
          if (el.closest('[inert]')) return false;
          // `visibility: hidden` is inherited too, and takes an element out of
          // the tab order on its own. It is the drawer's first line of defence
          // precisely because it needs no JavaScript: `inert` is applied by an
          // effect, so before hydration it is the only thing holding. Counting
          // a hidden control as tabbable would report a tab stop that no user
          // can actually reach.
          if (getComputedStyle(el).visibility === 'hidden') return false;
          return true;
        }).length;
      });

    const tabbableWhenClosed = await countTabbable();

    expect(tabbableWhenClosed, 'the closed drawer left controls in the tab order').toBe(0);

    // Opening it puts them back.
    await page.getByTestId('sidebar-toggle').click();
    await expect(page.getByTestId('sidebar-close')).toBeVisible();

    const tabbableWhenOpen = await countTabbable();
    expect(tabbableWhenOpen, 'the open drawer has no reachable controls').toBeGreaterThan(0);
  });

  test('@responsive the drawer closes on Escape and restores focus to its toggle', async ({ page }) => {
    await page.goto('/');

    const toggle = page.getByTestId('sidebar-toggle');
    await toggle.click();
    await expect(page.getByTestId('sidebar-close')).toBeVisible();

    await page.keyboard.press('Escape');

    // Not `not.toBeVisible()`: closing the drawer pushes it off-canvas with a
    // transform instead of unmounting it, and Playwright counts any element with
    // a non-empty bounding box as visible no matter where that box sits relative
    // to the viewport. So that assertion could never pass here however correct
    // the app was. `inert` plus `data-open` is the contract that actually
    // governs whether the drawer is reachable.
    await expect(page.getByTestId('sidebar')).toHaveAttribute('data-open', 'false');
    await expect(page.getByTestId('sidebar')).toHaveAttribute('inert', '');
    await expect(page.getByTestId('sidebar-overlay')).toHaveCount(0);

    expect(await focusedTestId(page)).toBe('sidebar-toggle');
  });

  // -------------------------------------------------------------------------
  // Account menu
  // -------------------------------------------------------------------------

  test('the account menu implements the APG menu keyboard model', async ({ page }) => {
    // `role="menu"` puts a screen reader into focus mode, where the only way to
    // move is the arrow keys the role promises. Declaring the role without
    // implementing the keys makes the menu less usable than a plain list.
    await page.goto('/');

    const button = page.getByTestId('account-button');
    await expect(button).toHaveAttribute('aria-haspopup', 'menu');
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('account-menu')).toBeVisible();

    // Opening moves focus into the menu — otherwise the arrow keys go nowhere.
    expect(await focusedTestId(page)).toBe('account-menu-settings');

    await page.keyboard.press('ArrowDown');
    expect(await focusedTestId(page)).toBe('account-menu-signout');

    await page.keyboard.press('ArrowDown');
    expect(await focusedTestId(page), 'ArrowDown did not wrap to the first item').toBe(
      'account-menu-settings',
    );

    await page.keyboard.press('ArrowUp');
    expect(await focusedTestId(page), 'ArrowUp did not wrap to the last item').toBe(
      'account-menu-signout',
    );

    // Escape closes and hands focus back to the trigger.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('account-menu')).toHaveCount(0);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(await focusedTestId(page)).toBe('account-button');
  });

  // -------------------------------------------------------------------------
  // Rules form: radiogroup, switches, live regions
  // -------------------------------------------------------------------------

  test('the strictness radiogroup moves selection with the arrow keys', async ({ page }) => {
    await page.goto('/rules');

    const group = page.getByRole('radiogroup', { name: 'Strictness level' });
    await expect(group).toHaveCount(1);

    const radios = group.getByRole('radio');
    await expect(radios).toHaveCount(3);

    // Exactly one radio is in the tab order, and it is the checked one.
    const checked = group.getByRole('radio', { checked: true });
    await expect(checked).toHaveCount(1);
    await expect(checked).toHaveAttribute('tabindex', '0');

    await checked.focus();
    const before = await focusedTestId(page);

    await page.keyboard.press('ArrowRight');
    const after = await focusedTestId(page);
    expect(after, 'ArrowRight did not move focus within the radiogroup').not.toBe(before);

    // Selection follows focus, as a radiogroup promises.
    await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
    const nowChecked = await group
      .getByRole('radio', { checked: true })
      .getAttribute('data-testid');
    expect(nowChecked, 'selection did not follow focus').toBe(after);

    await page.keyboard.press('Home');
    await expect(page.getByTestId('strictness-lenient')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('End');
    await expect(page.getByTestId('strictness-strict')).toHaveAttribute('aria-checked', 'true');
  });

  test('every switch names itself and is associated with its description', async ({ page }) => {
    // A switch whose helper text is merely adjacent in the DOM is read as a
    // bare "on/off" with no indication of what it toggles.
    await page.goto('/rules');

    const switches = page.getByRole('switch');
    const count = await switches.count();
    expect(count, 'no switches found on the rules page').toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const control = switches.nth(i);
      await expect(control).toHaveAttribute('aria-checked', /^(true|false)$/);

      const name = (await control.getAttribute('aria-label')) ?? (await control.innerText());
      expect(name.trim().length, `switch ${i} has no accessible name`).toBeGreaterThan(0);

      const describedBy = await control.getAttribute('aria-describedby');
      if (describedBy) {
        for (const id of describedBy.split(/\s+/).filter(Boolean)) {
          await expect(
            page.locator(byId(id)),
            `switch ${i} points aria-describedby at a missing id`,
          ).toHaveCount(1);
        }
      }
    }
  });

  test('save confirmations are announced by a live region that pre-exists them', async ({ page }) => {
    // WCAG 4.1.3. A live region mounted at the same moment as its own text is
    // not announced by most screen readers — the region has to already be in
    // the accessibility tree when the content changes.
    await page.goto('/rules');

    // Attached, not visible: while idle the region is deliberately empty, so it
    // has zero size. Presence in the accessibility tree is the whole point.
    const liveRegion = page.locator('[role="status"][aria-live="polite"]');
    await expect(liveRegion.first(), 'no live region before saving').toBeAttached();

    // Nothing announced yet.
    await expect(page.getByTestId('rules-saved')).toHaveCount(0);

    await page.getByTestId('rules-save').click();

    await expect(page.getByTestId('rules-saved')).toBeVisible();
    // The confirmation must land *inside* the pre-existing region.
    const insideLiveRegion = await page
      .getByTestId('rules-saved')
      .evaluate((node: ShimElement) => Boolean(node.closest('[role="status"][aria-live]')));
    expect(insideLiveRegion, 'the confirmation is not inside a live region').toBe(true);
  });

  test('settings save and disconnect both announce through live regions', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.locator('[role="status"][aria-live="polite"]').first()).toBeAttached();

    await page.getByTestId('settings-save').click();
    await expect(page.getByTestId('settings-saved')).toBeVisible();
    expect(
      await page
        .getByTestId('settings-saved')
        .evaluate((node: ShimElement) => Boolean(node.closest('[role="status"][aria-live]'))),
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Document-wide
  // -------------------------------------------------------------------------

  for (const route of ['/', '/reviews', '/analytics', '/rules', '/settings']) {
    test(`${route} has one h1-level landmark set and no duplicate ids`, async ({ page }) => {
      // Duplicate ids silently break every aria-controls / aria-describedby /
      // label association that points at the repeated one, which is the exact
      // wiring the tests above rely on.
      await page.goto(route);

      const duplicates = await page.evaluate(() => {
        const { document } = globalThis as unknown as ShimWindow;
        const counts = new Map<string, number>();
        for (const el of Array.from(document.querySelectorAll('[id]'))) {
          counts.set(el.id, (counts.get(el.id) ?? 0) + 1);
        }
        return Array.from(counts.entries())
          .filter(([, n]) => n > 1)
          .map(([id, n]) => `${id} ×${n}`);
      });
      expect(duplicates, `duplicate element ids on ${route}`).toEqual([]);

      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.locator('nav[aria-label]').first()).toBeAttached();
    });
  }
});
