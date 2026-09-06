import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { T } from '@/timeouts';

// The Design Files entry is a plain tab in the workspace tab strip — there is
// no dropdown to open first, and "active" is carried by aria-selected rather
// than by the tab's label. These helpers keep their historical names so the
// many existing call sites read the same.
export async function openAllProjectFiles(page: Page): Promise<void> {
  const tab = page.getByTestId('design-files-tab');
  await expect(tab).toBeVisible({ timeout: T.medium });
  // The active tab is restored asynchronously after the workspace mounts. A
  // one-shot click can be overwritten by that late restore, leaving a visible
  // but inactive Design Files tab. Re-apply the idempotent selection until the
  // DOM and persisted state converge.
  await expect(async () => {
    if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: T.short });
  }).toPass({ timeout: T.long });
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

async function revealDeckNavigation(page: Page): Promise<void> {
  const canvas = page.getByTestId('comment-preview-canvas');
  if (await canvas.isVisible().catch(() => false)) {
    await canvas.hover();
  }
}
