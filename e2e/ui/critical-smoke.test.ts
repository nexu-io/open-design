import { expect, test } from '@playwright/test';
import { ensureRailOpen } from '@/playwright/rail';
import type { Page } from '@playwright/test';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { T } from '@/timeouts';

test.describe.configure({ timeout: 30_000 });

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
});

test('[P0] @critical home loads with the primary entry controls', async ({ page }) => {
  await gotoEntryHome(page);

  // The rail is collapsed by default — the hero owns the first screen and the
  // only chrome affordance is the topbar toggle. Expand to reach the rail nav.
  await expect(page.getByTestId('entry-rail-toggle')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
  await ensureRailOpen(page);
  await expect(page.getByTestId('entry-nav-logo')).toBeVisible();
  await expect(page.getByTestId('entry-nav-home')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('entry-nav-new-project')).toBeVisible();
});

test('[P0] @critical settings dialog is reachable from home', async ({ page }) => {
  await gotoEntryHome(page);

  // The home settings entry is a menu: open it, then the "Settings" item
  // opens the full execution-mode dialog.
  await page.getByTestId('entry-settings-menu-trigger').click();
  await page.getByTestId('entry-settings-open-details').click();
  const settingsDialog = page.getByRole('dialog');
  await expect(settingsDialog).toBeVisible();
  await expect(settingsDialog.getByRole('heading', { name: 'Execution mode' })).toBeVisible();
});

test('[P0] @critical prototype project creation reaches the workspace shell', async ({ page }) => {
  await gotoEntryHome(page);
  await openNewProjectModal(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill('Critical smoke project');
  await page.getByTestId('create-project').click();

  await expectWorkspaceReady(page);
});

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
}

async function openNewProjectModal(page: Page) {
  // The nav rail is collapsed by default; expand it before the rail's
  // "New project" entry becomes interactable.
  await page.getByTestId('entry-rail-toggle').click();
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-new-project').click();
  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}

async function expectWorkspaceReady(page: Page) {
  await waitForLoadingToClear(page);
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}

async function waitForLoadingToClear(page: Page) {
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.medium });
}
