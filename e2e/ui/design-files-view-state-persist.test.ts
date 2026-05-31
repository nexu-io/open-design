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
 * Each test must PASS on fix/web-design-files-persist-view and FAIL on
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

// 90 s: each test seeds ~18 files via sequential POST requests; on a cold CI
// runner this alone takes 40-50 s before any assertion.
test.describe.configure({ timeout: 90_000 });

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
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
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

async function seedFile(
  page: Page,
  projectId: string,
  name: string,
  content: string,
  encoding?: 'base64',
): Promise<void> {
  const res = await page.request.post(`/api/projects/${projectId}/files`, {
    data: { name, content, ...(encoding ? { encoding } : {}) },
    timeout: 10_000,
  });
  expect(res.ok()).toBeTruthy();
}

function seedTextFile(page: Page, projectId: string, name: string): Promise<void> {
  return seedFile(page, projectId, name, `# ${name}`);
}

function seedPngFile(page: Page, projectId: string, name: string): Promise<void> {
  return seedFile(page, projectId, name, TINY_PNG_B64, 'base64');
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
  await expect(page.getByTestId('df-page-size-select')).toBeVisible({ timeout: 10_000 });
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

/**
 * Seeds a project with 17 PNG files and 1 text file, then reloads.
 * Enough files so showListControls (> 15) fires and the kind-filter button
 * appears (2 kinds present).
 */
async function seedProjectWithFiles(page: Page, projectId: string): Promise<void> {
  for (let i = 1; i <= 17; i++) {
    await seedPngFile(page, projectId, `image-${String(i).padStart(2, '0')}.png`);
  }
  await seedTextFile(page, projectId, 'notes.txt');
  await page.reload();
  await waitForLoadingToClear(page);
}

/**
 * Sets non-default view prefs: pageSize=15, sort=name/asc, kindFilter=image.
 * Precondition: the Design Files tab must be open and the page-size select visible.
 */
async function setNonDefaultViewPrefs(page: Page): Promise<void> {
  // Change pageSize from default 30 to 15
  const pageSizeSelect = page.getByTestId('df-page-size-select');
  await pageSizeSelect.selectOption('15');
  await expect(pageSizeSelect).toHaveValue('15');

  // Change sort from default mtime/desc to name/asc by clicking Name header
  const nameHeader = page.locator('th.df-th-name button.df-th-btn');
  await nameHeader.click();
  await expect(page.locator('th.df-th-name')).toHaveAttribute('aria-sort', 'ascending');

  // Apply kind filter: open the filter popover and check "Image"
  const filterBtn = page.getByRole('button', { name: /filter by kind/i });
  await filterBtn.click();
  const filterPopover = page.getByRole('dialog', { name: /filter by kind/i });
  await expect(filterPopover).toBeVisible();
  await filterPopover.getByRole('checkbox', { name: /image/i }).check();
  // Close the popover
  await filterBtn.click();
  await expect(filterPopover).toBeHidden();
}

/**
 * Asserts that the non-default prefs set by setNonDefaultViewPrefs are visible.
 */
async function assertNonDefaultViewPrefs(page: Page): Promise<void> {
  await expect(page.getByTestId('df-page-size-select')).toHaveValue('15');
  await expect(page.locator('th.df-th-name')).toHaveAttribute('aria-sort', 'ascending');
  await expect(page.getByRole('button', { name: /filter by kind/i })).toContainText(/image/i);
}

/**
 * Asserts that the panel shows the default view prefs (as a fresh project would).
 */
async function assertDefaultViewPrefs(page: Page): Promise<void> {
  await expect(page.getByTestId('df-page-size-select')).toHaveValue('30');
  await expect(page.locator('th.df-th-name')).toHaveAttribute('aria-sort', 'none');
  await expect(page.locator('th.df-th-time')).toHaveAttribute('aria-sort', 'descending');
  await expect(page.getByRole('button', { name: /filter by kind/i })).not.toContainText(/image/i);
}

// ---------------------------------------------------------------------------
// Scenario (a): Tab-away / tab-back — prefs survive remount
// ---------------------------------------------------------------------------

test('(a) view prefs survive navigating away to a file tab and back', async ({ page }) => {
  await gotoEntryHome(page);
  const projectId = await createBlankProject(page, 'view-state-nav-test');
  await seedProjectWithFiles(page, projectId);

  await openDesignFilesTab(page);
  await waitForPageSizeSelect(page);
  await setNonDefaultViewPrefs(page);

  // Verify the localStorage entry was written
  const storedAfterChange = await readStoredViewState(page, projectId);
  expect(storedAfterChange).not.toBeNull();
  expect(storedAfterChange!.pageSize).toBe(15);
  expect(storedAfterChange!.sortKey).toBe('name');
  expect(storedAfterChange!.sortDir).toBe('asc');
  expect(Array.isArray(storedAfterChange!.kindFilter)).toBe(true);
  expect((storedAfterChange!.kindFilter as string[]).includes('image')).toBe(true);

  // Navigate AWAY: open image-01.png in its own tab
  const firstImageRow = page.getByTestId('design-file-row-image-01.png');
  await firstImageRow.getByRole('button').first().click();
  await page.getByTestId('design-file-preview').getByRole('button', { name: 'Open' }).click();
  const navAwayTab = page.getByRole('tab', { name: /image-01\.png/i });
  await expect(navAwayTab).toBeVisible();
  await expect(page.getByTestId('design-files-tab')).toHaveAttribute('aria-selected', 'false');

  // Navigate BACK — remounts DesignFilesPanel
  await openDesignFilesTab(page);
  await waitForPageSizeSelect(page);

  // All four prefs must survive the remount
  await assertNonDefaultViewPrefs(page);
});

// ---------------------------------------------------------------------------
// Scenario (b): Hard reload — prefs survive page.reload()
// ---------------------------------------------------------------------------

test('(b) view prefs survive a hard browser reload', async ({ page }) => {
  await gotoEntryHome(page);
  const projectId = await createBlankProject(page, 'view-state-reload-test');
  await seedProjectWithFiles(page, projectId);

  await openDesignFilesTab(page);
  await waitForPageSizeSelect(page);
  await setNonDefaultViewPrefs(page);

  // Hard reload
  await page.reload();
  await waitForLoadingToClear(page);
  await openDesignFilesTab(page);
  await waitForPageSizeSelect(page);

  // All four prefs must survive the reload
  await assertNonDefaultViewPrefs(page);

  // The localStorage key must still be intact
  const storedAfterReload = await readStoredViewState(page, projectId);
  expect(storedAfterReload).not.toBeNull();
  expect(storedAfterReload!.pageSize).toBe(15);
  expect(storedAfterReload!.sortKey).toBe('name');
  expect(storedAfterReload!.sortDir).toBe('asc');
  expect((storedAfterReload!.kindFilter as string[]).includes('image')).toBe(true);
});

// ---------------------------------------------------------------------------
// Scenario (c): Per-project key isolation — second project shows defaults
// ---------------------------------------------------------------------------

test('(c) second project view state is independent of the first project', async ({ page }) => {
  // --- Project A: set non-default prefs ---
  await gotoEntryHome(page);
  const projectAId = await createBlankProject(page, 'view-state-project-a');
  await seedProjectWithFiles(page, projectAId);

  await openDesignFilesTab(page);
  await waitForPageSizeSelect(page);
  await setNonDefaultViewPrefs(page);

  // Confirm project A's state was written to localStorage
  const storedA = await readStoredViewState(page, projectAId);
  expect(storedA).not.toBeNull();
  expect(storedA!.pageSize).toBe(15);

  // --- Project B: create, seed, assert defaults ---
  await gotoEntryHome(page);
  const projectBId = await createBlankProject(page, 'view-state-project-b');

  // Seed enough files that showListControls fires in project B as well.
  // Use text files so the kind-filter button appears (2 kinds: text + png).
  for (let i = 1; i <= 17; i++) {
    await seedTextFile(page, projectBId, `doc-${String(i).padStart(2, '0')}.txt`);
  }
  await seedPngFile(page, projectBId, 'icon.png');

  await page.reload();
  await waitForLoadingToClear(page);
  await openDesignFilesTab(page);
  await waitForPageSizeSelect(page);

  // Project B must show defaults, not project A's persisted prefs
  await assertDefaultViewPrefs(page);

  // The per-project key for project B, if it exists at all, must NOT contain
  // values inherited from project A. A default-value entry is acceptable.
  const storedB = await readStoredViewState(page, projectBId);
  if (storedB !== null) {
    expect(storedB.pageSize).not.toBe(15);
    expect(storedB.sortKey).not.toBe('name');
    const kf = storedB.kindFilter;
    if (Array.isArray(kf)) {
      expect((kf as string[]).includes('image')).toBe(false);
    }
  }
});
