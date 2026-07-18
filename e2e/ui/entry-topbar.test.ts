import { expect, test } from '@/playwright/suite';
import { ensureRailOpen } from '@/playwright/rail';
import { routeAgents } from '@/playwright/mock-factory';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';
const LOCAL_CLI_LABEL = /Local CLI|本机 CLI|本地 CLI/i;
const OPEN_SETTINGS_LABEL = /Open settings|打开设置|開啟設定/i;

test.describe.configure({ timeout: 30_000 });

async function waitForLoadingToClear(page: Page) {
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, { timeout: 15_000 });
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
  }
  await expect(page.getByRole('button', { name: OPEN_SETTINGS_LABEL })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'codex',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: { codex: { model: 'default', reasoning: 'default' } },
        privacyDecisionAt: 1,
        telemetry: { metrics: false, content: false, artifactManifest: false },
      }),
    );
  }, STORAGE_KEY);

  await page.route('**/api/github/open-design', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stargazers_count: 51600 }),
    });
  });

  await routeAgents(page, [
    {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      available: true,
      version: '0.80.0',
      path: '/usr/local/bin/codex',
      models: [{ id: 'default', label: 'Default' }],
    },
    {
      id: 'mock',
      name: 'Mock Agent',
      bin: 'mock-agent',
      available: true,
      version: 'test',
      models: [{ id: 'default', label: 'Default' }],
    },
  ]);

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        config: {
          onboardingCompleted: true,
          agentId: 'codex',
          skillId: null,
          designSystemId: null,
          mode: 'daemon',
          agentModels: { codex: { model: 'default', reasoning: 'default' } },
          privacyDecisionAt: 1,
          telemetry: { metrics: false, content: false, artifactManifest: false },
        },
      },
    });
  });
});

test('[P2] home topbar shows the new entry chips and links', async ({ page }) => {
  await gotoEntryHome(page);

  const topbar = page.locator('.entry-main__topbar');
  await expect(topbar).toBeVisible();

  const star = page.getByTestId('entry-star-badge');
  await expect(star).toBeVisible();
  await expect(star).toHaveAttribute('href', 'https://github.com/nexu-io/open-design');
  await expect(star).toContainText('Star');
  await expect(star).toContainText('51.6K');

  const discord = page.getByTestId('entry-discord-badge');
  await expect(discord).toBeVisible();
  await expect(discord).toHaveAttribute('href', 'https://discord.gg/mHAjSMV6gz');
  await expect(discord).toContainText('Join Discord');

  await expect(page.getByTestId('inline-model-switcher-chip')).toBeVisible();
  await expect(page.getByTestId('entry-use-everywhere-button')).toBeVisible();
  await expect(page.getByRole('button', { name: OPEN_SETTINGS_LABEL })).toBeVisible();
});

test('[P1] home topbar execution pill reflects the selected Local CLI agent and opens the switcher', async ({ page }) => {
  await gotoEntryHome(page);

  const pill = page.getByTestId('inline-model-switcher-chip');
  await expect(pill).toContainText(LOCAL_CLI_LABEL);
  await expect(pill).toContainText(/Codex CLI/i);
  await expect(pill).toContainText(/default/i);

  await pill.click();

  const popover = page.getByTestId('inline-model-switcher-popover');
  await expect(popover).toBeVisible();
  await expect(page.getByTestId('inline-model-switcher-mode-daemon')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('inline-model-switcher-agent-codex')).toBeVisible();
  await expect(page.getByTestId('inline-model-switcher-agent-mock')).toBeVisible();
  await expect(popover.getByRole('radio', { name: /Codex CLI/i })).toBeVisible();
});

test('[P2] home topbar star and discord badges expose the current external-link contract', async ({ page }) => {
  await gotoEntryHome(page);

  const star = page.getByTestId('entry-star-badge');
  await expect(star).toHaveAttribute('target', '_blank');
  await expect(star).toHaveAttribute('rel', /noreferrer/);
  await expect(star).toHaveAttribute('rel', /noopener/);

  const discord = page.getByTestId('entry-discord-badge');
  await expect(discord).toHaveAttribute('href', 'https://discord.gg/mHAjSMV6gz');
  await expect(discord).toHaveAttribute('title', /Join the Open Design Discord/i);
  await expect(discord).toHaveAttribute('aria-label', /Join the Open Design Discord/i);
});

test('[P2] home topbar Use everywhere navigates to Integrations with the tab selected', async ({ page }) => {
  await gotoEntryHome(page);

  await page.getByTestId('entry-use-everywhere-button').click();
  await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();
  await expect(page.getByTestId('integrations-tab-use-everywhere')).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('[P1] home topbar settings button opens settings and closes the execution popover', async ({ page }) => {
  await gotoEntryHome(page);

  const pill = page.getByTestId('inline-model-switcher-chip');
  const popover = page.getByTestId('inline-model-switcher-popover');

  await pill.click();
  await expect(popover).toBeVisible();

  await page.getByRole('button', { name: OPEN_SETTINGS_LABEL }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(popover).toHaveCount(0);
});

test('[P2] returning from another entry view via the home nav reaches the home hero', async ({ page }) => {
  await gotoEntryHome(page);

  await page.getByTestId('entry-use-everywhere-button').click();
  await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();

  // The logo doubles as a hover-to-collapse control now, so home is reached
  // through the explicit Home nav item rather than clicking the brand mark.
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-home').click();
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
  await expect(page.getByTestId('home-hero-type-tabs')).toBeVisible();
  await expect(page.getByTestId('entry-star-badge')).toBeVisible();
});
