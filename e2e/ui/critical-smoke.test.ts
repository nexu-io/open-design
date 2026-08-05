import { expect, test } from '@/playwright/suite';
import { ensureRailOpen, openNewProjectModal as openNewProjectModalFromProjects } from '@/playwright/rail';
import { settingsSurface } from '@/playwright/amr';
import type { Locator, Page } from '@playwright/test';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { T } from '@/timeouts';

test.describe.configure({ timeout: T.xlong });

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
});

test('[P0] @critical home loads with the primary entry controls', async ({ page }) => {
  await gotoEntryHome(page);

  // The rail is collapsed by default — the hero owns the first screen and the
  // only chrome affordance is the pinned Home tab's sidebar toggle in the
  // workspace tabs bar. Expand to reach the rail nav.
  await expect(page.getByTestId('workspace-home-rail-toggle')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
  await ensureRailOpen(page);
  await expect(page.getByTestId('entry-nav-home')).toHaveAttribute('aria-current', 'page');
  // #5517's rail has no "+ New project" button; project creation starts from
  // the composer, or from the Projects view's own CTA (see the modal spec below).
  await expect(page.getByTestId('entry-nav-search')).toBeVisible();
  await expect(page.getByTestId('entry-nav-design-systems')).toBeVisible();
});

test('[P0] @critical settings dialog is reachable from home', async ({ page }) => {
  await gotoEntryHome(page);

  // #5971 cut the rail-footer settings chip; signed out, Settings is the rail's
  // own nav item — `entry-settings-button` is the testid that item carries (see
  // EntryNavRail: it is the ONLY signed-out settings entry, and the e2e
  // contract). Collapsed, the rail is `inert` and it cannot be clicked, so
  // expand first.
  await ensureRailOpen(page);
  await clickVisible(page.getByTestId('entry-settings-button'));
  // From the entry, settings is now a routed page (`role="region"`), not a
  // modal — `.modal-settings` is the class both presentations share.
  const settingsDialog = settingsSurface(page);
  await expect(settingsDialog).toBeVisible();
  // The surface's own <h2> is consumed as its accessible name (aria-labelledby),
  // so assert on the section nav instead — that is what proves settings opened.
  await expect(settingsDialog.getByTestId('settings-nav-execution')).toBeVisible();
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
  await openNewProjectModalFromProjects(page);
}

async function clickVisible(locator: Locator) {
  await expect(locator).toBeVisible({ timeout: T.medium });
  await locator.evaluate((element: HTMLElement) => element.click());
}

async function expectWorkspaceReady(page: Page) {
  await waitForLoadingToClear(page);
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}

async function waitForLoadingToClear(page: Page) {
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.long });
}
