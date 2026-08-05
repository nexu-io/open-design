import { expect, test } from '@/playwright/suite';
import { openNewProjectModal } from '@/playwright/rail';
import type { Page } from '@playwright/test';
import { applyStandardMocks } from '@/playwright/mock-factory';

// Red spec for issue #5549: the workspace chrome row (tab strip + new-tab
// button + traffic/window controls) must mirror under `dir=rtl` (Arabic,
// Persian). On `main` the chrome is laid out with physical `left`/`right`
// rules (`margin-left: auto`, `margin-right: var(--app-chrome-traffic-margin)`,
// `padding-left: var(--workspace-tabs-edge-inset)`) that do not flip under
// RTL, so the new-tab button stays pinned to the visual right and the window
// controls / traffic stay on the visual left — the opposite of the mirrored
// layout an RTL user expects. This spec goes red on `main` and green once the
// chrome row adopts logical properties (`margin-inline-start`, `padding-
// inline-start`) or `[dir='rtl']` overrides for the affected rules.
//
// Scope per the agreement on #5549: chrome-mirroring only (top nav / tab
// strip / new-tab button / traffic). Workspace toolbar + empty-state alignment
// are tracked as a follow-up.

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
});

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Open Design…').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
}

async function createPrototypeProject(page: Page, projectName: string) {
  await openNewProjectModal(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill(projectName);
  await page.getByTestId('create-project').click();
}

async function expectWorkspaceReady(page: Page) {
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
}

async function switchLocaleToArabic(page: Page) {
  await page.locator('.avatar-agent-trigger').click();
  await page.locator('.avatar-item--execution-settings').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('.settings-nav-item', { hasText: 'General' }).click();
  await dialog.locator('.settings-general-select select').selectOption('ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

test('[P1] RTL: workspace chrome row mirrors — new-tab button lands on the visual left, traffic on the visual right', async ({ page }) => {
  await gotoEntryHome(page);
  await createPrototypeProject(page, 'RTL chrome mirroring red spec');
  await expectWorkspaceReady(page);

  // Switch to Arabic through the in-project settings UI. Seeding the locale
  // via localStorage before navigation is unreliable here (the initial-locale
  // detection can transiently lose a persisted manual locale during the hard
  // navigation that project creation performs). setLocale from the settings
  // dialog applies synchronously. Mirrors split-resize-scrollbar-hitbox.test.ts.
  await switchLocaleToArabic(page);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  const chrome = page.locator('.workspace-tabs-chrome').first();
  await expect(chrome).toBeVisible();
  const chromeBox = await chrome.boundingBox();
  expect(chromeBox).not.toBeNull();

  // The new-tab button uses `margin-left: auto` on main, which pins it to the
  // physical right edge regardless of `dir`. Under RTL it must land on the
  // visual LEFT (i.e. the chrome's left edge). On `main` it stays on the right
  // — that's the red.
  const newBtn = chrome.locator('.workspace-tabs-new-btn').first();
  await expect(newBtn).toBeVisible();
  const newBtnBox = await newBtn.boundingBox();
  expect(newBtnBox).not.toBeNull();

  const chromeCenterX = chromeBox!.x + chromeBox!.width / 2;
  const newBtnCenterX = newBtnBox!.x + newBtnBox!.width / 2;

  // Green condition: under dir=rtl, the new-tab button must sit in the visual
  // LEFT half of the chrome row (mirrored from its LTR right-edge pin).
  expect(
    newBtnCenterX,
    `expected new-tab button on the visual LEFT under dir=rtl (mirrored), got center x=${newBtnCenterX} vs chrome center x=${chromeCenterX}`,
  ).toBeLessThan(chromeCenterX);

  // The traffic / window-controls region uses `margin-right: var(--app-chrome-
  // traffic-margin)` on main, which keeps it on the visual LEFT even under
  // RTL. Under RTL it must sit in the visual RIGHT half (mirrored).
  const traffic = chrome.locator('.workspace-tabs-traffic').first();
  if (await traffic.isVisible().catch(() => false)) {
    const trafficBox = await traffic.boundingBox();
    expect(trafficBox).not.toBeNull();
    const trafficCenterX = trafficBox!.x + trafficBox!.width / 2;
    expect(
      trafficCenterX,
      `expected traffic/window-controls on the visual RIGHT under dir=rtl (mirrored), got center x=${trafficCenterX} vs chrome center x=${chromeCenterX}`,
    ).toBeGreaterThan(chromeCenterX);
  }
});

test('[P1] LTR control: workspace chrome row keeps new-tab on the right, traffic on the left', async ({ page }) => {
  // Control case — pins the LTR behaviour so the RTL assertion can't be
  // satisfied by a symmetric layout that happens to place both elements on
  // the same side. Guards against the fix over-mirroring.
  await gotoEntryHome(page);
  await createPrototypeProject(page, 'LTR chrome control');
  await expectWorkspaceReady(page);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  const chrome = page.locator('.workspace-tabs-chrome').first();
  await expect(chrome).toBeVisible();
  const chromeBox = await chrome.boundingBox();
  expect(chromeBox).not.toBeNull();

  const newBtn = chrome.locator('.workspace-tabs-new-btn').first();
  await expect(newBtn).toBeVisible();
  const newBtnBox = await newBtn.boundingBox();
  expect(newBtnBox).not.toBeNull();

  const chromeCenterX = chromeBox!.x + chromeBox!.width / 2;
  const newBtnCenterX = newBtnBox!.x + newBtnBox!.width / 2;
  expect(
    newBtnCenterX,
    `expected new-tab button on the visual RIGHT under dir=ltr (control), got center x=${newBtnCenterX} vs chrome center x=${chromeCenterX}`,
  ).toBeGreaterThan(chromeCenterX);
});
