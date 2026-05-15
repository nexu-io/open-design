import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

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
        privacyDecisionAt: 1,
        telemetry: { metrics: false, content: false, artifactManifest: false },
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

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        config: {
          onboardingCompleted: true,
          agentId: 'mock',
          skillId: null,
          designSystemId: null,
          agentModels: {},
          privacyDecisionAt: 1,
          telemetry: { metrics: false, content: false, artifactManifest: false },
        },
      },
    });
  });
});

test('entry chrome settings menu opens with brand header and no pet rail', async ({ page }) => {
  await gotoEntryHome(page);
  await expect(page.getByTestId('entry-star-badge')).toBeVisible();
  await expect(page.getByTestId('entry-use-everywhere-button')).toBeVisible();
  await expect(page.getByTestId('entry-nav-logo')).toBeVisible();
  await expect(page.getByTestId('recent-projects-strip')).toBeVisible();
  await expect(page.locator('.entry-nav-rail')).toBeVisible();
  await expect(page.getByTestId('entry-nav-new-project')).toBeVisible();
  await expect(page.locator('.entry-brand')).toHaveCount(0);

  // The pet picker rail was removed; pet adoption now lives in
  // Settings → Pet exclusively. Make sure no rail leaks back into the
  // entry layout.
  await expect(page.locator('.pet-rail')).toHaveCount(0);

  await page.locator('.avatar-menu .settings-icon-btn').click();
  const settingsMenu = page.locator('.avatar-popover[role="menu"]');
  await expect(settingsMenu).toBeVisible();
  await expect(settingsMenu.getByRole('button', { name: /^settings$/i })).toBeVisible();
  await expect(settingsMenu.getByRole('button', { name: /hide pet picker/i })).toHaveCount(0);
  await expect(settingsMenu.getByRole('button', { name: /show pet picker/i })).toHaveCount(0);
});

test('entry top navigation matches the current home tab structure', async ({ page }) => {
  await gotoEntryHome(page);

  await expect(page.getByTestId('entry-nav-new-project')).toBeVisible();
  await expect(page.getByTestId('entry-nav-home')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('entry-nav-projects')).toBeVisible();
  await expect(page.getByTestId('entry-nav-tasks')).toBeVisible();
  await expect(page.getByTestId('entry-nav-plugins')).toBeVisible();
  await expect(page.getByTestId('entry-nav-design-systems')).toBeVisible();
  await expect(page.getByTestId('entry-nav-integrations')).toBeVisible();
  await expect(page.getByTestId('home-hero-rail')).toBeVisible();
  await expect(page.getByTestId('home-hero-rail-prototype')).toBeVisible();
  await expect(page.getByTestId('home-hero-rail-live-artifact')).toBeVisible();
  await expect(page.getByTestId('home-hero-rail-deck')).toBeVisible();
  await expect(page.getByTestId('home-hero-rail-image')).toBeVisible();
  await expect(page.getByTestId('home-hero-rail-video')).toBeVisible();
});

test('entry chrome avoids horizontal overflow on compact desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await gotoEntryHome(page);
  await expect(page.locator('.entry-main__topbar')).toBeVisible();

  const { pageOverflow, topbarOverflow } = await page.evaluate(() => {
    const topbar = document.querySelector('.entry-main__topbar');
    return {
      pageOverflow: Math.max(
        0,
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      topbarOverflow:
        topbar instanceof HTMLElement
          ? Math.max(0, topbar.scrollWidth - topbar.clientWidth)
          : null,
    };
  });

  expect(topbarOverflow).not.toBeNull();
  expect(topbarOverflow!).toBeLessThanOrEqual(2);
  expect(pageOverflow).toBeLessThanOrEqual(2);
});

async function gotoEntryHome(page: Page) {
  await page.goto('/');
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /not now/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
}
