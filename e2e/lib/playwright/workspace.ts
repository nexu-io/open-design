import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export async function openAllProjectFiles(page: Page): Promise<void> {
  const trigger = page.getByTestId('workspace-pages-menu-trigger');
  await expect(trigger).toBeVisible();
  await trigger.click();
  const menu = page.getByTestId('workspace-pages-menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: /All project files/i }).click();
  await expectAllProjectFilesActive(page);
}

export async function expectAllProjectFilesActive(page: Page): Promise<void> {
  await expect(page.getByTestId('workspace-pages-menu-trigger')).toContainText('All project files');
}

export async function expectAllProjectFilesInactive(page: Page): Promise<void> {
  await expect(page.getByTestId('workspace-pages-menu-trigger')).not.toContainText('All project files');
}

export async function clickDeckNextSlide(page: Page): Promise<void> {
  await revealDeckNavigation(page);
  await page.getByLabel('Next slide').click();
}

export async function clickDeckPreviousSlide(page: Page): Promise<void> {
  await revealDeckNavigation(page);
  await page.getByLabel('Previous slide').click();
}

async function revealDeckNavigation(page: Page): Promise<void> {
  const canvas = page.getByTestId('comment-preview-canvas');
  if (await canvas.isVisible().catch(() => false)) {
    await canvas.hover();
  }
}
