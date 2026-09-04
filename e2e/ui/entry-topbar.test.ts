import { expect, test } from '@/playwright/suite';
import { ensureRailOpen } from '@/playwright/rail';
import { settingsSurface } from '@/playwright/amr';
import { routeAgents } from '@/playwright/mock-factory';
import { T } from '@/timeouts';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

test.describe.configure({ timeout: T.xlong });

async function waitForLoadingToClear(page: Page) {
  await expect(page.getByText('Loading OpenDesign…')).toHaveCount(0, { timeout: T.long });
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve OpenDesign' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
  }
  // The settings button moved into the collapsed-by-default rail (#5517), so
  // the hero is the reliable "entry is ready" signal now.
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
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

// #5517 deleted the entry topbar outright (`EntryShell` renders
// `entry-shell--no-header` and its comment spells this out). Everything the bar
// used to carry either moved or went away:
//   • GitHub star badge  — `GithubStarBadge` is no longer rendered anywhere
//   • Discord badge      — removed
//   • "Use everywhere"   — removed; the guide keeps its Integrations tab
//   • Settings button    — moved into the (collapsed-by-default) rail footer
//   • Execution pill     — moved into the Home composer footer
// The chip/link inventory and external-link-contract specs are therefore gone;
// what remains below pins the two controls that survived, at their new homes.

test('[P2] home chrome exposes the composer execution pill and the rail settings entry', async ({ page }) => {
  await gotoEntryHome(page);

  await expect(page.locator('.entry-main__topbar')).toHaveCount(0);
  await expect(page.getByTestId('inline-model-switcher-chip')).toBeVisible();

  await ensureRailOpen(page);
  await expect(page.getByTestId('entry-settings-button')).toBeVisible();
});

test('[P1] home execution pill reflects the selected Local CLI agent and opens the switcher', async ({ page }) => {
  await gotoEntryHome(page);

  // The composer pill is icon-only now: the selected agent + model live on its
  // accessible name / tooltip rather than in visible text.
  const pill = page.getByTestId('inline-model-switcher-chip');
  await expect(pill).toHaveAttribute('aria-label', /Codex CLI/i);
  await expect(pill).toHaveAttribute('aria-label', /default/i);

  await pill.click();

  const popover = page.getByTestId('inline-model-switcher-popover');
  await expect(popover).toBeVisible();
  // The composer's switcher is the compact variant: it drops the Local CLI /
  // BYOK segmented control and the full agent list, opening straight on the
  // CURRENT agent's models plus an entry into the execution settings where a
  // different agent is chosen.
  await expect(popover.getByTestId('inline-model-switcher-compact-model-default')).toBeVisible();
  await expect(popover.getByTestId('inline-model-switcher-mode-daemon')).toHaveCount(0);
  await expect(popover.getByTestId('inline-model-switcher-agent-codex')).toHaveCount(0);
  await expect(popover.getByTestId('inline-model-switcher-open-settings')).toBeVisible();
});

test('[P1] rail settings entry opens settings and closes the execution popover', async ({ page }) => {
  await gotoEntryHome(page);

  const pill = page.getByTestId('inline-model-switcher-chip');
  const popover = page.getByTestId('inline-model-switcher-popover');

  await pill.click();
  await expect(popover).toBeVisible();

  // Settings is a rail nav item now, so the rail has to be expanded before it
  // is interactive (collapsed the rail is `inert`).
  await ensureRailOpen(page);
  await page.getByTestId('entry-settings-button').click();
  await expect(settingsSurface(page)).toBeVisible();
  await expect(popover).toHaveCount(0);
});

test('[P2] returning from another entry view via the home nav reaches the home hero', async ({ page }) => {
  await gotoEntryHome(page);

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-design-systems').click();
  await expect(page).toHaveURL(/\/design-systems$/);

  // The logo doubles as a hover-to-collapse control now, so home is reached
  // through the explicit Home nav item rather than clicking the brand mark.
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-home').click();
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
  await expect(page.getByTestId('home-hero-type-pills')).toBeVisible();
});
