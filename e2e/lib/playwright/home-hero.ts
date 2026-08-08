import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Home's inline scenario rail — the "Start from a template… / …or create a
 * blank project" row, its `home-hero-type-tabs` container, the
 * `home-hero-rail-<chipId>` cards and the "More" shortcuts menu — was removed
 * in the #5517 alignment. Choosing a project-type template is now a
 * composer-footer control: `home-hero-template-trigger` opens a radial menu
 * (`home-hero-template-menu`) whose ring segments are the templates
 * (`home-hero-template-wedge-<chipId>`).
 *
 * These helpers are the single place e2e encodes that entry point, so the next
 * time the picker's shape changes only this file moves.
 */

/** Open the radial template menu (idempotent). Returns the menu locator. */
export async function openHomeTemplateMenu(page: Page): Promise<Locator> {
  const menu = page.getByTestId('home-hero-template-menu');
  if ((await menu.count()) > 0) return menu;
  await page.getByTestId('home-hero-template-trigger').click();
  await expect(menu).toBeVisible();
  return menu;
}

/**
 * Select a template by `HomeHeroChip` id (see
 * `apps/web/src/components/home-hero/chips.ts`) — `deck`, `prototype`,
 * `wireframe`, `mobile`, `document`, `web-clone`, `webgl`, `hyperframes`,
 * `live-artifact`, `image`, `video`, `audio`.
 *
 * Only `apply-scenario` chips are offered as wedges. The action chips that used
 * to share the rail moved to their own surfaces and are NOT reachable here:
 * Brand Kit → the composer design-system picker's Create button
 * (`project-ds-picker-create`), plugin authoring → the Extensions page
 * (`plugins-create-button`), Figma import → the composer plus menu.
 */
export async function pickHomeTemplate(page: Page, chipId: string): Promise<void> {
  await openHomeTemplateMenu(page);
  const wedge = page.getByTestId(`home-hero-template-wedge-${chipId}`);
  await expect(wedge).toBeVisible();
  await wedge.click();
  // Confirming a wedge closes the ring and swaps the trigger's chevron for the
  // reset (×) control, so the reset is the observable "a template is set".
  await expect(page.getByTestId('home-hero-template-menu')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-template-reset')).toBeVisible();
}

/**
 * Return Home to "no template": drop an active example plugin first (it
 * survives a template reset on its own chip), then clear the template pill.
 */
export async function clearHomeTemplate(page: Page): Promise<void> {
  const activePlugin = page.getByTestId('home-hero-active-plugin');
  if ((await activePlugin.count()) > 0) {
    const clearPlugin = page.getByRole('button', { name: /Clear active plugin|清除/i });
    if ((await clearPlugin.count()) > 0) {
      await clearPlugin.first().click();
    } else {
      await activePlugin.first().click();
    }
    await expect(activePlugin).toHaveCount(0);
  }

  const reset = page.getByTestId('home-hero-template-reset');
  if ((await reset.count()) > 0) {
    await reset.first().click();
    await expect(reset).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero-template-picker')).toBeVisible();
}
