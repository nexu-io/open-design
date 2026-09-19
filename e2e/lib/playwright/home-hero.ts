import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

export function homeTemplateTrigger(page: Page): Locator {
  return page.getByTestId('home-hero-template-trigger').getByRole('button');
}

export const HOME_TYPE_PRIMARY_CHIP_IDS = ['prototype', 'deck', 'document'] as const;
export const HOME_TYPE_OTHER_CHIP_IDS = [
  'image',
  'hyperframes',
  'web-clone',
  'video',
  'audio',
  'live-artifact',
  'webgl',
] as const;


export async function openHomeTemplates(page: Page): Promise<Locator> {
  const trigger = homeTemplateTrigger(page);
  await expect(trigger).toBeEnabled();
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  const menu = page.getByTestId('home-hero-template-menu');
  await expect(menu).toBeVisible();
  return menu;
}

export async function pickHomeTemplate(page: Page, chipId: string): Promise<void> {
  if (chipId === 'wireframe' || chipId === 'mobile') {
    await expect(homeTemplateTrigger(page)).toBeEnabled();
    await page.evaluate((id) => {
      window.dispatchEvent(new CustomEvent('open-design:home-apply-template', { detail: { chipId: id } }));
    }, chipId);
  } else {
    const menu = await openHomeTemplates(page);
    await menu.locator(`[data-chip="${chipId}"]`).click();
    await expect(menu).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero-template-picker')).toHaveAttribute(
    'data-type', chipId === 'wireframe' || chipId === 'mobile' ? 'prototype' : chipId,
  );
}
