import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// The Design Files entry is a plain tab in the workspace tab strip — there is
// no dropdown to open first, and "active" is carried by aria-selected rather
// than by the tab's label. These helpers keep their historical names so the
// many existing call sites read the same.
export async function openAllProjectFiles(page: Page): Promise<void> {
  const tab = page.getByTestId('design-files-tab');
  await expect(tab).toBeVisible();
  let activeSince = 0;
  await expect
    .poll(async () => {
      const active = await tab.getAttribute('aria-selected') === 'true';
      if (!active) {
        activeSince = 0;
        await tab.click();
        return 'activating';
      }
      activeSince ||= Date.now();
      return Date.now() - activeSince >= 1_000 ? 'stable' : 'settling';
    }, {
      timeout: 10_000,
      intervals: [100],
      message: 'expected Design Files to remain active after workspace restoration settled',
    })
    .toBe('stable');
}

export async function expectAllProjectFilesActive(page: Page): Promise<void> {
  await expect(page.getByTestId('design-files-tab')).toHaveAttribute('aria-selected', 'true');
}

export async function expectAllProjectFilesInactive(page: Page): Promise<void> {
  await expect(page.getByTestId('design-files-tab')).toHaveAttribute('aria-selected', 'false');
}

export async function clickDeckNextSlide(page: Page): Promise<void> {
  await revealDeckNavigation(page);
  const button = activeFileViewer(page).getByRole('button', { name: 'Next slide' });
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  // The deck HUD intentionally floats over the preview iframe. Playwright's
  // hit-target check can therefore see the iframe even after the HUD is
  // revealed; this helper's callers validate pagination state, not stacking.
  await button.click({ force: true });
}

export async function clickDeckPreviousSlide(page: Page): Promise<void> {
  await revealDeckNavigation(page);
  const button = activeFileViewer(page).getByRole('button', { name: 'Previous slide' });
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click({ force: true });
}

function activeFileViewer(page: Page): Locator {
  return page.locator('[data-testid="retained-file-viewer"]:not([aria-hidden="true"])');
}

export async function openPreviewToolbarMoreMenu(page: Page): Promise<Locator> {
  const workspace = page.locator('[data-testid="file-workspace"]:visible').first();
  await expect(workspace).toBeVisible();
  const toolbar = workspace.locator('.viewer-toolbar:visible').first();
  await expect(toolbar).toBeVisible();
  const trigger = toolbar.locator('.viewer-toolbar-more > button');
  await expect(trigger).toBeVisible();
  await trigger.click();
  const menu = toolbar.locator('.viewer-toolbar-more-menu[role="menu"]');
  await expect(menu).toBeVisible();
  return menu;
}

export async function clickPreviewToolbarAction(
  page: Page,
  inlineTestId: string,
  overflowName: RegExp,
): Promise<void> {
  const workspace = page.locator('[data-testid="file-workspace"]:visible').first();
  await expect(workspace).toBeVisible();
  const inlineAction = workspace.locator(`[data-testid="${inlineTestId}"]:visible`).first();
  if (await inlineAction.isVisible()) {
    await inlineAction.click();
    return;
  }

  const menu = await openPreviewToolbarMoreMenu(page);
  await menu.getByRole('menuitem', { name: overflowName }).click();
}

async function revealDeckNavigation(page: Page): Promise<void> {
  const canvas = page.getByTestId('comment-preview-canvas');
  if (await canvas.isVisible().catch(() => false)) {
    await canvas.hover();
  }
}
