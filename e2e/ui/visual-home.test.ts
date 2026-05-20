import { expect, test } from '@playwright/test';
import { captureVisual, configureVisualPage, gotoVisualHome } from '@/playwright/visual';

test('captures the visual home harness', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();

  await captureVisual(page, 'visual-home');
});
