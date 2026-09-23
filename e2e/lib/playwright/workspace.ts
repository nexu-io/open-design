import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// The Design Files entry is a plain tab in the workspace tab strip — there is
// no dropdown to open first, and "active" is carried by aria-selected rather
// than by the tab's label. These helpers keep their historical names so the
// many existing call sites read the same.
export async function openAllProjectFiles(page: Page): Promise<void> {
  const tab = page.getByTestId('design-files-tab');
  await expect(tab).toBeVisible();
  await tab.click();
  await expectAllProjectFilesActive(page);
}

export async function expectAllProjectFilesActive(page: Page): Promise<void> {
  await expect(page.getByTestId('design-files-tab')).toHaveAttribute('aria-selected', 'true');
}

export async function expectAllProjectFilesInactive(page: Page): Promise<void> {
  await expect(page.getByTestId('design-files-tab')).toHaveAttribute('aria-selected', 'false');
}

export async function clickDeckNextSlide(page: Page): Promise<void> {
  await revealDeckNavigation(page);
  const button = page.locator('button[aria-label="Next slide"]:visible');
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
}

export async function clickDeckPreviousSlide(page: Page): Promise<void> {
  await revealDeckNavigation(page);
  const button = page.locator('button[aria-label="Previous slide"]:visible');
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
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
