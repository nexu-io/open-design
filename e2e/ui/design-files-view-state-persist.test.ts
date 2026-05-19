/**
 * Verifies that the DesignFilesPanel view state (sortKey, sortDir, pageSize,
 * kindFilter) is written to localStorage under the per-project key
 * 'od:design-files:view-state:v1:<projectId>' and is restored correctly
 * across three scenarios:
 *
 *   (a) Tab-away / tab-back: navigating to a file tab and returning remounts
 *       the panel; prefs must survive.
 *   (b) Hard reload: localStorage persists across page.reload(); prefs must
 *       survive.
 *   (c) Project isolation: opening a second project starts with defaults, NOT
 *       the first project's persisted state.
 *
 * This test must PASS on fix/web-design-files-persist-view and FAIL on
 * origin/main (where no persistence is implemented).
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Matches the constant in DesignFilesPanel.tsx
const VIEW_STATE_KEY_PREFIX = 'od:design-files:view-state:v1:';

// Config key expected by the web app to skip onboarding
const CONFIG_STORAGE_KEY = 'open-design:config';

// Minimal 1x1 PNG, base64-encoded
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=';

test.describe.configure({ timeout: 60_000 });

// Inject onboarding bypass and mock app-config before each test so the web app
// boots straight into the workspace without prompts.
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
  }, CONFIG_STORAGE_KEY);

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForLoadingToClear(page: Page): Promise<void> {
  await page
    .getByText('Loading Open Design…')
    .waitFor({ state: 'detached', timeout: 15_000 })
    .catch(() => {});
}

async function gotoEntryHome(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page
    .getByRole('dialog')
    .filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /not now/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
}

async function createBlankProject(page: Page, name: string): Promise<string> {
  await page.getByTestId('entry-nav-new-project').click();
  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await page.getByTestId('new-project-name').fill(name);
  await page.getByTestId('create-project').click();
  await waitForLoadingToClear(page);
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();

  const url = new URL(page.url());
  const segments = url.pathname.split('/');
  const projectId = segments[2];
  if (!projectId) throw new Error(`could not extract projectId from ${url.pathname}`);
  return projectId;
}

async function seedTextFile(page: Page, projectId: string, name: string): Promise<void> {
  const res = await page.request.post(`/api/projects/${projectId}/files`, {
    data: { name, content: `# ${name}` },
    timeout: 10_000,
  });
  expect(res.ok()).toBeTruthy();
}

async function seedPngFile(page: Page, projectId: string, name: string): Promise<void> {
  const res = await page.request.post(`/api/projects/${projectId}/files`, {
    data: { name, content: TINY_PNG_B64, encoding: 'base64' },
    timeout: 10_000,
  });
  expect(res.ok()).toBeTruthy();
}

async function openDesignFilesTab(page: Page): Promise<void> {
  await page.getByTestId('design-files-tab').click();
  // The Design Files panel renders a table once files are present; wait for
  // the controls row that always appears at the top of the panel.
  await expect(page.locator('.df-controls-row')).toBeVisible({ timeout: 10_000 });
}

// Wait until the per-page <select> is present — it only appears when
// sortedFiles.length > 15 (showListControls = true).
async function waitForPageSizeSelect(page: Page): Promise<void> {
  await expect(page.getByLabel('Show')).toBeVisible({ timeout: 10_000 });
}

// Read the view state from localStorage for a given projectId.
// Returns null when no entry has been written yet.
async function readStoredViewState(
  page: Page,
  projectId: string,
): Promise<Record<string, unknown> | null> {
  const raw = await page.evaluate(
    ([prefix, pid]) => window.localStorage.getItem(prefix + pid) ?? 'null',
    [VIEW_STATE_KEY_PREFIX, projectId] as [string, string],
  );
  return JSON.parse(raw) as Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Main test
// ---------------------------------------------------------------------------

test('design files view state persists across tab navigation and reload, and stays project-scoped', async ({
  page,
}) => {
  // -------------------------------------------------------------------------
  // Setup: create project and seed files
  // -------------------------------------------------------------------------
  await gotoEntryHome(page);
  const projectId = await createBlankProject(page, 'view-state-persist-test');

  // Seed 17 PNG files so showListControls (> 15) fires even when the kind
  // filter is active and shows only images. Seed one text file so
  // availableKinds has two entries, making the kind-filter button appear.
  for (let i = 1; i <= 17; i++) {
    await seedPngFile(page, projectId, `image-${String(i).padStart(2, '0')}.png`);
  }
  await seedTextFile(page, projectId, 'notes.txt');

  // Reload so the files appear in the panel.
  await page.reload();
  await waitForLoadingToClear(page);

  // -------------------------------------------------------------------------
  // (a) Change all four prefs, navigate away, navigate back, assert persistence
  // -------------------------------------------------------------------------

  await openDesignFilesTab(page);
  await waitForPageSizeSelect(page);

  // Change pageSize from default 30 to 15
  const pageSizeSelect = page.getByLabel('Show');
  await pageSizeSelect.selectOption('15');
  await expect(pageSizeSelect).toHaveValue('15');

  // Change sort from default mtime/desc to name/asc by clicking Name header
  // (first click sets name+asc; default column is mtime so this switches key)
  const nameHeader = page.locator('th.df-th-name button.df-th-btn');
  await nameHeader.click();
  // Verify aria-sort is now ascending on the Name column
  await expect(page.locator('th.df-th-name')).toHaveAttribute('aria-sort', 'ascending');

  // Apply kind filter: open the filter popover and check "Image"
  const filterBtn = page.getByRole('button', { name: /filter by kind/i });
  await filterBtn.click();
  const filterPopover = page.getByRole('dialog', { name: /filter by kind/i });
  await expect(filterPopover).toBeVisible();
  await filterPopover.getByRole('checkbox', { name: /image/i }).check();
  // Close the popover by clicking the filter button again
  await filterBtn.click();
  await expect(filterPopover).toBeHidden();

  // Verify the localStorage entry was written with the correct shape
  const storedAfterChange = await readStoredViewState(page, projectId);
  expect(storedAfterChange).not.toBeNull();
  expect(storedAfterChange!.pageSize).toBe(15);
  expect(storedAfterChange!.sortKey).toBe('name');
  expect(storedAfterChange!.sortDir).toBe('asc');
  expect(Array.isArray(storedAfterChange!.kindFilter)).toBe(true);
  expect((storedAfterChange!.kindFilter as string[]).includes('image')).toBe(true);

  // Navigate AWAY: upload a tiny file to create a tab, then click that tab
  await page.getByTestId('design-files-upload-input').setInputFiles({
    name: 'nav-away.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TINY_PNG_B64, 'base64'),
  });
  const navAwayTab = page.getByRole('tab', { name: /nav-away\.png/i });
  await expect(navAwayTab).toBeVisible();
  await navAwayTab.click();
  // Design Files tab should no longer be selected
  await expect(page.getByTestId('design-files-tab')).toHaveAttribute('aria-selected', 'false');

  // Navigate BACK to Design Files — this remounts DesignFilesPanel
  await openDesignFilesTab(page);
  await waitForPageSizeSelect(page);

  // Assert all four prefs survived the remount
  await expect(page.getByLabel('Show')).toHaveValue('15');
  await expect(page.locator('th.df-th-name')).toHaveAttribute('aria-sort', 'ascending');
  // Kind filter button should show "Image" (1 active filter)
  await expect(filterBtn).toContainText(/image/i);

  // -------------------------------------------------------------------------
  // (b) Hard reload — assert localStorage survives the page reload
  // -------------------------------------------------------------------------

  await page.reload();
  await waitForLoadingToClear(page);
  await openDesignFilesTab(page);
  await waitForPageSizeSelect(page);

  await expect(page.getByLabel('Show')).toHaveValue('15');
  await expect(page.locator('th.df-th-name')).toHaveAttribute('aria-sort', 'ascending');
  await expect(page.getByRole('button', { name: /filter by kind/i })).toContainText(/image/i);

  // Confirm the localStorage key is still intact after reload
  const storedAfterReload = await readStoredViewState(page, projectId);
  expect(storedAfterReload).not.toBeNull();
  expect(storedAfterReload!.pageSize).toBe(15);
  expect(storedAfterReload!.sortKey).toBe('name');
  expect(storedAfterReload!.sortDir).toBe('asc');
  expect((storedAfterReload!.kindFilter as string[]).includes('image')).toBe(true);

  // -------------------------------------------------------------------------
  // (c) Second project: its view state must use defaults, NOT project 1's state
  // -------------------------------------------------------------------------

  // Navigate home and create a second project
  await gotoEntryHome(page);
  const project2Id = await createBlankProject(page, 'view-state-persist-second');

  // Seed enough files that showListControls fires in project 2 as well.
  // 17 text files + 1 PNG so the kind filter button appears (2 kinds).
  for (let i = 1; i <= 17; i++) {
    await seedTextFile(page, project2Id, `doc-${String(i).padStart(2, '0')}.txt`);
  }
  await seedPngFile(page, project2Id, 'icon.png');

  await page.reload();
  await waitForLoadingToClear(page);
  await openDesignFilesTab(page);
  await waitForPageSizeSelect(page);

  // Page size must be the default (30), not inherited from project 1 (15)
  await expect(page.getByLabel('Show')).toHaveValue('30');

  // Sort must be on mtime/desc (default), not name/asc
  await expect(page.locator('th.df-th-name')).toHaveAttribute('aria-sort', 'none');
  await expect(page.locator('th.df-th-time')).toHaveAttribute('aria-sort', 'descending');

  // Kind filter button must show the default "Filter by kind" label (no active filter)
  await expect(page.getByRole('button', { name: /filter by kind/i })).not.toContainText(
    /image/i,
  );

  // The per-project key for project 2, if it exists at all, must NOT contain
  // values inherited from project 1 (pageSize=15, kindFilter=['image'],
  // sortKey='name'). Isolation is the invariant; a default-value entry written
  // opportunistically by the component is acceptable.
  const storedProject2 = await readStoredViewState(page, project2Id);
  if (storedProject2 !== null) {
    expect(storedProject2.pageSize).not.toBe(15);
    expect(storedProject2.sortKey).not.toBe('name');
    const kf = storedProject2.kindFilter;
    if (Array.isArray(kf)) {
      expect((kf as string[]).includes('image')).toBe(false);
    }
  }
});
