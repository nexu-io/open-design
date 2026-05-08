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

test('entry chrome settings menu toggles pet rail visibility', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await expect(page.locator('.app-chrome-header')).toBeVisible();
  await expect(page.locator('.app-chrome-brand[aria-label="Open Design"]')).toBeVisible();
  await expect(page.locator('.entry-brand')).toHaveCount(0);

  const openSettings = page.getByRole('button', { name: /open settings/i });
  await openSettings.click();
  const settingsMenu = page.locator('.avatar-popover[role="menu"]');
  await expect(settingsMenu).toBeVisible();

  await settingsMenu.getByRole('button', { name: /hide pet picker/i }).click();
  await expect(settingsMenu).toHaveCount(0);
  await expect(page.locator('.pet-rail')).toHaveCount(0);

  await openSettings.click();
  await expect(page.getByRole('button', { name: /show pet picker/i })).toBeVisible();
  await page.getByRole('button', { name: /show pet picker/i }).click();
  await expect(page.locator('.pet-rail')).toBeVisible();
});

test('entry chrome avoids horizontal overflow on compact desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await expect(page.locator('.app-chrome-header')).toBeVisible();

  const overflow = await page.evaluate(() => {
    const header = document.querySelector('.app-chrome-header');
    if (!(header instanceof HTMLElement)) return null;
    return Math.max(0, header.scrollWidth - header.clientWidth);
  });
  expect(overflow).not.toBeNull();
  expect(overflow!).toBeLessThanOrEqual(2);

  const pageOverflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  );
  expect(pageOverflow).toBeLessThanOrEqual(2);
});
