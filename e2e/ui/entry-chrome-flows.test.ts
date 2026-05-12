import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'mock',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: {},
      }),
    );
  }, STORAGE_KEY);

  await page.route('**/api/agents', async (route) => {
    await route.fulfill({
      json: {
        agents: [
          {
            id: 'mock',
            name: 'Mock Agent',
            bin: 'mock-agent',
            available: true,
            version: 'test',
            models: [{ id: 'default', label: 'Default' }],
          },
        ],
      },
    });
  });
});

test('pet pill toggle hides and shows the pet rail', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await expect(page.locator('.entry-brand')).toBeVisible();
  await expect(page.locator('.entry-brand .entry-brand-title')).toHaveText('Open Design');
  await expect(page.locator('.app-chrome-header')).toHaveCount(0);
  await expect(page.locator('.pet-rail')).toBeVisible();

  const hideToggle = page.locator('.pet-pill-toggle');
  await expect(hideToggle).toHaveAttribute('aria-label', /hide pet picker/i);
  await hideToggle.click();
  await expect(page.locator('.pet-rail')).toHaveCount(0);

  const showToggle = page.locator('.pet-pill-toggle');
  await expect(showToggle).toHaveAttribute('aria-label', /show pet picker/i);
  await showToggle.click();
  await expect(page.locator('.pet-rail')).toBeVisible();
});

test('entry top navigation matches the current home tab structure', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('new-project-panel')).toBeVisible();

  const tabs = page.locator('.entry-tabs').getByRole('tab');
  await expect(tabs).toHaveText([
    'Designs',
    'Templates',
    'Design systems',
    'Image templates',
    'Video templates',
  ]);
  await expect(page.getByTestId('entry-tab-designs')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('entry-tab-templates')).toBeVisible();
  await expect(page.getByTestId('entry-tab-design-systems')).toBeVisible();
  await expect(page.getByTestId('entry-tab-image-templates')).toBeVisible();
  await expect(page.getByTestId('entry-tab-video-templates')).toBeVisible();
  await expect(page.locator('.entry-tabs').getByRole('tab', { name: 'Connectors' })).toHaveCount(0);
  await expect(page.locator('.entry-tabs').getByRole('tab', { name: 'Designs' })).toHaveCount(1);
});

test('entry chrome avoids horizontal overflow on compact desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await expect(page.locator('.entry-brand')).toBeVisible();

  // The brand row replaced the old global chrome header; if it overflows
  // horizontally on a compact desktop, the logo/title/settings cog will
  // wrap or push the layout sideways. Keep it pinned to no-overflow.
  const brandOverflow = await page.evaluate(() => {
    const brand = document.querySelector('.entry-brand');
    if (!(brand instanceof HTMLElement)) return null;
    return Math.max(0, brand.scrollWidth - brand.clientWidth);
  });
  expect(brandOverflow).not.toBeNull();
  expect(brandOverflow!).toBeLessThanOrEqual(2);

  const pageOverflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  );
  expect(pageOverflow).toBeLessThanOrEqual(2);
});
