import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Home's inline scenario rail — the "Start from a template… / …or create a
 * blank project" row, its `home-hero-type-tabs` container, the
 * `home-hero-rail-<chipId>` cards and the "More" shortcuts menu — was removed
 * in the #5517 alignment. Choosing a project-type template is now a
 * composer control with two faces. With NOTHING picked the type row under the
 * composer (`home-hero-type-pills`, pills `home-hero-type-pill-<chipId>`,
 * overflow behind `home-hero-type-pills-more`) is the entry point and the
 * composer carries no pill. Picking a type retires the row and brings up the
 * green pill inside the card (`home-hero-template-picker` /
 * `home-hero-template-trigger`), which is display-only — it opens nothing.
 * Its leading icon clears back to the empty state
 * (`home-hero-template-clear`), and that is the only way to a different type.
 *
 * These helpers are the single place e2e encodes that entry point, so the next
 * time the picker's shape changes only this file moves.
 */

/**
 * The creation-type row under the composer. Present only while NOTHING is
 * picked — choosing a type retires it, and the composer's pill (which no
 * longer opens anything) names the choice from then on.
 */
export function homeTypeRow(page: Page): Locator {
  return page.getByTestId('home-hero-type-pills');
}

/**
 * Give up the picked type from the pill's leading icon (it swaps to an × on
 * hover), bringing the type row back. A no-op on an already-empty composer.
 */
export async function clearHomeTemplate(page: Page): Promise<void> {
  const clear = page.getByTestId('home-hero-template-clear');
  if ((await clear.count()) === 0) return;
  await clear.click();
  await expect(homeTypeRow(page)).toBeVisible();
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
/**
 * The window event a surface outside the hero raises to hand it a template
 * pick (the workspace tabs-bar's template fan dispatches it; HomeHero applies
 * the chip exactly as a row click). Mirrors `HOME_APPLY_TEMPLATE_EVENT` in
 * `apps/web/src/components/home-hero/chips.ts` — restated here because e2e
 * must not import app source.
 */
const HOME_APPLY_TEMPLATE_EVENT = 'open-design:home-apply-template';

/** The types the row itself offers: three inline, two behind 更多. */
export const HOME_TYPE_ROW_CHIP_IDS = ['prototype', 'deck', 'document'] as const;
export const HOME_TYPE_ROW_MORE_CHIP_IDS = ['image', 'web-clone'] as const;

export async function pickHomeTemplate(page: Page, chipId: string): Promise<void> {
  // A type already picked retires the row, so switching means clearing first.
  await clearHomeTemplate(page);
  const row = homeTypeRow(page);
  await expect(row).toBeVisible();
  const pill = row.getByTestId(`home-hero-type-pill-${chipId}`);
  if ((await pill.count()) > 0) {
    await expect(pill).toBeEnabled();
    await pill.click();
  } else if ((HOME_TYPE_ROW_MORE_CHIP_IDS as readonly string[]).includes(chipId)) {
    // Behind 更多: the popover only mounts while open.
    const more = page.getByTestId('home-hero-type-pills-more');
    await expect(more).toBeEnabled();
    await more.click();
    const overflowPill = page.getByTestId(`home-hero-type-pill-${chipId}-more`);
    await expect(overflowPill).toBeVisible();
    await overflowPill.click();
  } else {
    // The row is a curated entry set (product, 2026-08-31); every other create
    // type reaches the hero only through the cross-surface hand-off, so drive
    // that contract directly. Wait for the row to be in service first — the
    // hero drops a pick that lands while the plugin catalogue is still loading.
    await expect(row.getByTestId('home-hero-type-pill-prototype')).toBeEnabled();
    await page.evaluate(
      ({ eventName, id }) => {
        window.dispatchEvent(new CustomEvent(eventName, { detail: { chipId: id } }));
      },
      { eventName: HOME_APPLY_TEMPLATE_EVENT, id: chipId },
    );
  }
  // The pill in the card is the observable "it is set".
  await expect(page.getByTestId('home-hero-template-picker')).toHaveClass(/has-selection/);
}
