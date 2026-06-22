import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';
import { T } from '@/timeouts';

const STORAGE_KEY = 'open-design:config';

test.describe.configure({ timeout: 30_000 });

test.beforeEach(async ({ page }) => {
  // Seed a standard config so the app treats itself as bootstrapped
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

  // Intercept app-config + agents so the fan-out succeeds once a token is
  // provided (we only test the prompt, not the full post-token flow).
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') { await route.continue(); return; }
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

  await page.route('**/api/agents', async (route) => {
    if (route.request().method() !== 'GET') { await route.continue(); return; }
    await route.fulfill({
      json: [{
        id: 'mock',
        name: 'Mock Agent',
        bin: 'mock-agent',
        available: true,
        version: 'test',
        models: [{ id: 'default', label: 'Default' }],
      }],
    });
  });
});

test('[P0] bootstrap denied shows token prompt', async ({ page }) => {
  // Intercept bootstrap endpoints to return 403 (proxied deployment scenario)
  await page.route('**/api/auth/bootstrap-token', async (route) => {
    if (route.request().method() !== 'GET') { await route.continue(); return; }
    await route.fulfill({
      status: 403,
      json: { error: { code: 'BOOTSTRAP_TOKEN_NOT_AVAILABLE', message: 'Token bootstrap not available from this network' } },
    });
  });
  await page.route('**/api/auth/bootstrap', async (route) => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    await route.fulfill({
      status: 403,
      json: { error: { code: 'BOOTSTRAP_NOT_AVAILABLE', message: 'Bootstrap not available from this network' } },
    });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // The token prompt should render instead of the normal home hero
  const passwordField = page.locator('input[type="password"]');
  await expect(passwordField).toBeVisible({ timeout: T.medium });

  // Title and description should be visible
  await expect(page.getByText('Daemon requires a token')).toBeVisible();
  await expect(page.getByText('OD_API_TOKEN')).toBeVisible();

  // Entering a valid token and submitting should dismiss the prompt
  await passwordField.fill('test-daemon-token-abc');
  await page.getByRole('button', { name: /save/i }).click();

  // The prompt should disappear and the app should start loading
  await expect(passwordField).not.toBeVisible({ timeout: T.short });
});

test('[P0] bootstrap denied hides token prompt on daemon health failure', async ({ page }) => {
  // Daemon not alive — should show "daemon not available" UI, not the prompt
  await page.route('**/api/health', async (route) => {
    await route.fulfill({ status: 503 });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // No password prompt should appear since daemon is not live
  const passwordField = page.locator('input[type="password"]');
  await expect(passwordField).toHaveCount(0);
});
