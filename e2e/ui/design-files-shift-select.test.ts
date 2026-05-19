// Playwright e2e: shift-click range selection, cmd/ctrl-click toggle,
// Shift+Space keyboard a11y, and aria attributes on the design files table.
//
// These tests use OD_PORT=18041 / OD_WEB_PORT=18042 (set via env at invocation).
// Each test that needs real modifier keys uses page.click(..., { modifiers: [...] })
// so the browser processes event.shiftKey / event.metaKey through the real event path,
// not a synthetic fireEvent call inside jsdom.
//
// Red-on-main: every scenario that exercises the new feature path goes red on
// origin/main because:
//   (a-c, e) main had no range selection; checkbox click was always an additive toggle.
//   (d)      main had no cmd/ctrl path; click was always additive.
//   (f)      main had no aria-selected on <tr> / aria-multiselectable on <table>.
//   (g)      main had no page-scoped range guard; shift-click silently crossed pages.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=';

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// (a) Plain click A then Shift+click C selects A, B, C inclusive
// ---------------------------------------------------------------------------

test('(a) shift-click selects an inclusive range from anchor to target', async ({ page }) => {
  await setupWorkspaceWithFiles(page, 'shift-select-a', [
    'aa-file.png',
    'ab-file.png',
    'ac-file.png',
  ]);

  await openDesignFilesTab(page);
  // Sort by name asc to guarantee aa < ab < ac row order regardless of mtime.
  await sortByNameAsc(page);

  // Plain click on the first row's checkbox sets the anchor.
  await clickRowCheckbox(page, 'aa-file.png');
  await expectSelected(page, 'aa-file.png', true);
  await expectSelected(page, 'ab-file.png', false);
  await expectSelected(page, 'ac-file.png', false);

  // Shift+click on the third row range-selects all three.
  // Uses real browser modifier handling, not synthetic fireEvent.
  await clickRowCheckbox(page, 'ac-file.png', ['Shift']);

  await expectSelected(page, 'aa-file.png', true);
  await expectSelected(page, 'ab-file.png', true);
  await expectSelected(page, 'ac-file.png', true);
});

// ---------------------------------------------------------------------------
// (b) After A-C range, Shift+click back on A collapses range to just A
// ---------------------------------------------------------------------------

test('(b) shift-click back to anchor collapses range to the anchor row only', async ({ page }) => {
  await setupWorkspaceWithFiles(page, 'shift-select-b', [
    'ba-file.png',
    'bb-file.png',
    'bc-file.png',
  ]);

  await openDesignFilesTab(page);
  await sortByNameAsc(page);

  await clickRowCheckbox(page, 'ba-file.png');
  await clickRowCheckbox(page, 'bc-file.png', ['Shift']);

  // All three selected.
  await expectSelected(page, 'ba-file.png', true);
  await expectSelected(page, 'bb-file.png', true);
  await expectSelected(page, 'bc-file.png', true);

  // Shift+click back on the anchor — range from anchor to anchor = only anchor.
  await clickRowCheckbox(page, 'ba-file.png', ['Shift']);

  await expectSelected(page, 'ba-file.png', true);
  await expectSelected(page, 'bb-file.png', false);
  await expectSelected(page, 'bc-file.png', false);
});

// ---------------------------------------------------------------------------
// (c) Plain click on D after a range resets anchor to D; only D selected
// ---------------------------------------------------------------------------

test('(c) plain click after range resets anchor and clears previous selection', async ({ page }) => {
  await setupWorkspaceWithFiles(page, 'shift-select-c', [
    'ca-file.png',
    'cb-file.png',
    'cc-file.png',
    'cd-file.png',
  ]);

  await openDesignFilesTab(page);
  await sortByNameAsc(page);

  await clickRowCheckbox(page, 'ca-file.png');
  await clickRowCheckbox(page, 'cc-file.png', ['Shift']);

  // A, B, C selected; D not.
  await expectSelected(page, 'ca-file.png', true);
  await expectSelected(page, 'cb-file.png', true);
  await expectSelected(page, 'cc-file.png', true);
  await expectSelected(page, 'cd-file.png', false);

  // Plain click on D: only D should remain selected.
  await clickRowCheckbox(page, 'cd-file.png');

  await expectSelected(page, 'ca-file.png', false);
  await expectSelected(page, 'cb-file.png', false);
  await expectSelected(page, 'cc-file.png', false);
  await expectSelected(page, 'cd-file.png', true);
});

// ---------------------------------------------------------------------------
// (d) Cmd+click (or Ctrl+click on non-mac) toggles one file without clearing others
// ---------------------------------------------------------------------------

test('(d) cmd/ctrl-click toggles a single file without clearing the rest', async ({ page }) => {
  await setupWorkspaceWithFiles(page, 'shift-select-d', [
    'da-file.png',
    'db-file.png',
    'dc-file.png',
  ]);

  await openDesignFilesTab(page);
  await sortByNameAsc(page);

  // Select A as anchor.
  await clickRowCheckbox(page, 'da-file.png');
  await expectSelected(page, 'da-file.png', true);
  await expectSelected(page, 'db-file.png', false);

  // Cmd/Ctrl+click B — adds B without clearing A.
  const metaKey = process.platform === 'darwin' ? 'Meta' : 'Control';
  await clickRowCheckbox(page, 'db-file.png', [metaKey]);
  await expectSelected(page, 'da-file.png', true);
  await expectSelected(page, 'db-file.png', true);
  await expectSelected(page, 'dc-file.png', false);

  // Cmd/Ctrl+click A again — toggles A off, B stays.
  await clickRowCheckbox(page, 'da-file.png', [metaKey]);
  await expectSelected(page, 'da-file.png', false);
  await expectSelected(page, 'db-file.png', true);
  await expectSelected(page, 'dc-file.png', false);
});

// ---------------------------------------------------------------------------
// (e) Keyboard: Space sets anchor and selects; Shift+Space range-selects
// ---------------------------------------------------------------------------

test('(e) Space sets anchor; Shift+Space range-selects from anchor to focused row', async ({
  page,
}) => {
  await setupWorkspaceWithFiles(page, 'shift-select-e', [
    'ea-file.png',
    'eb-file.png',
    'ec-file.png',
  ]);

  await openDesignFilesTab(page);
  await sortByNameAsc(page);

  // Focus the first row's checkbox and press Space to set anchor + select.
  const checkboxA = page.locator(`[data-testid="design-file-row-ea-file.png"] .df-row-check`);
  await checkboxA.focus();
  await page.keyboard.press('Space');

  await expectSelected(page, 'ea-file.png', true);
  await expectSelected(page, 'eb-file.png', false);
  await expectSelected(page, 'ec-file.png', false);

  // Focus the third row's checkbox and press Shift+Space to range-select a..c.
  const checkboxC = page.locator(`[data-testid="design-file-row-ec-file.png"] .df-row-check`);
  await checkboxC.focus();
  await page.keyboard.press('Shift+Space');

  await expectSelected(page, 'ea-file.png', true);
  await expectSelected(page, 'eb-file.png', true);
  await expectSelected(page, 'ec-file.png', true);
});

// ---------------------------------------------------------------------------
// (f) aria-selected on rows, aria-multiselectable on table
// ---------------------------------------------------------------------------

test('(f) aria-selected on rows and aria-multiselectable on table reflect selection state', async ({
  page,
}) => {
  await setupWorkspaceWithFiles(page, 'shift-select-f', [
    'fa-file.png',
    'fb-file.png',
  ]);

  await openDesignFilesTab(page);

  // Before any selection, rows should be aria-selected="false" (attribute exists).
  const rowA = page.locator('[data-testid="design-file-row-fa-file.png"]');
  const rowB = page.locator('[data-testid="design-file-row-fb-file.png"]');
  await expect(rowA).toHaveAttribute('aria-selected', 'false');
  await expect(rowB).toHaveAttribute('aria-selected', 'false');

  // The table must carry aria-multiselectable="true" on the real DOM.
  const table = page.locator('table.df-table');
  await expect(table).toHaveAttribute('aria-multiselectable', 'true');

  // Select A.
  await clickRowCheckbox(page, 'fa-file.png');
  await expect(rowA).toHaveAttribute('aria-selected', 'true');
  await expect(rowB).toHaveAttribute('aria-selected', 'false');

  // Cmd/Ctrl+click B — both selected.
  const metaKey = process.platform === 'darwin' ? 'Meta' : 'Control';
  await clickRowCheckbox(page, 'fb-file.png', [metaKey]);
  await expect(rowA).toHaveAttribute('aria-selected', 'true');
  await expect(rowB).toHaveAttribute('aria-selected', 'true');

  // Plain click A — only A selected, B reverts.
  await clickRowCheckbox(page, 'fa-file.png');
  await expect(rowA).toHaveAttribute('aria-selected', 'true');
  await expect(rowB).toHaveAttribute('aria-selected', 'false');
});

// ---------------------------------------------------------------------------
// (g) Cross-page scenario: shift-click from page-1 anchor to page-2 target
//     must NOT silently include invisible page-2 rows.
//     Post-review behavior: the range is page-scoped; a cross-page shift-click
//     degrades to a plain selection on the target and resets the anchor.
// ---------------------------------------------------------------------------

test('(g) cross-page shift-click does not silently select invisible rows from another page', async ({
  page,
}) => {
  // Seed 16 files so that with page size 15 we get two pages.
  const fileNames = Array.from({ length: 16 }, (_, i) => `pg-file-${String(i + 1).padStart(2, '0')}.png`);
  await setupWorkspaceWithFiles(page, 'shift-select-g', fileNames);

  await openDesignFilesTab(page);

  // The list controls (including page-size select) appear when sortedFiles.length > 15.
  // Change page size to 15 so we get 2 pages (files 1-15 on page 1, file 16 on page 2).
  const perPageSelect = page.locator('.df-pagination-start select').first();
  await expect(perPageSelect).toBeVisible({ timeout: 10_000 });
  await perPageSelect.selectOption('15');

  // Page 1 should now show 15 files; page 2 has the 16th.
  // Confirm pagination controls are visible (multiple pages).
  const prevBtn = page.locator('button.df-page-btn').first();
  await expect(prevBtn).toBeVisible();

  // Click a row on page 1 (row 0 — the topmost visible file) to set the anchor.
  // Files are sorted by mtime desc; the newest are at the top.
  // pg-file-16 is the last uploaded so it sorts first (newest mtime).
  // We need an anchor on page 1 that is NOT on page 2.
  // Find the first visible df-row-check on the current page.
  const firstRowCheckbox = page.locator('table.df-table tbody tr[data-testid^="design-file-row-"] .df-row-check').first();
  await firstRowCheckbox.click();

  // Record which row is now selected (the anchor).
  const anchorRow = page.locator('table.df-table tbody tr[aria-selected="true"]');
  await expect(anchorRow).toHaveCount(1);
  const anchorTestId = await anchorRow.getAttribute('data-testid');
  expect(anchorTestId).toBeTruthy();

  // Navigate to page 2 by clicking Next.
  const nextBtn = page.locator('button.df-page-btn').last();
  await nextBtn.click();

  // Page 2 should show the remaining file(s).
  // Anchor row (on page 1) is now invisible.
  await expect(anchorRow).toHaveCount(0);

  // Shift+click on the lone page-2 row's checkbox.
  const page2Checkbox = page.locator('table.df-table tbody tr[data-testid^="design-file-row-"] .df-row-check').first();
  await page2Checkbox.click({ modifiers: ['Shift'] });

  // Expected: since the anchor is not on the current page, the shift-click degrades to
  // a plain selection. Only the clicked row on page 2 should be selected.
  const selectedRows = page.locator('table.df-table tbody tr[aria-selected="true"]');
  await expect(selectedRows).toHaveCount(1);

  // The single selected row must be on page 2 (not the page-1 anchor).
  const selectedTestId = await selectedRows.getAttribute('data-testid');
  expect(selectedTestId).not.toBe(anchorTestId);
  expect(selectedTestId).toBeTruthy();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function gotoEntryHome(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Open Design…').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /not now/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
}

async function createProject(page: Page, projectName: string): Promise<void> {
  await page.getByTestId('entry-nav-new-project').click();
  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill(projectName);
  await page.getByTestId('create-project').click();

  await expect(page).toHaveURL(/\/projects\//, { timeout: 20_000 });
  await page.getByText('Loading Open Design…').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}

async function getCurrentProjectId(page: Page): Promise<string> {
  const url = new URL(page.url());
  const parts = url.pathname.split('/');
  const idx = parts.indexOf('projects');
  const id = idx !== -1 ? parts[idx + 1] : null;
  if (!id) throw new Error(`Cannot extract project id from ${url.pathname}`);
  return id;
}

async function setupWorkspaceWithFiles(page: Page, projectName: string, fileNames: string[]): Promise<void> {
  await gotoEntryHome(page);
  await createProject(page, projectName);

  // Seed all files by hitting the API directly — faster than setInputFiles N times.
  const projectId = await getCurrentProjectId(page);
  for (let i = 0; i < fileNames.length; i++) {
    const name = fileNames[i];
    if (!name) continue;
    const resp = await page.request.post(`/api/projects/${projectId}/files`, {
      data: { name, content: TINY_PNG_B64, encoding: 'base64' },
      timeout: 10_000,
    });
    if (!resp.ok()) {
      // Fallback: use the upload input (opens tabs as side-effect).
      await page.getByTestId('design-files-upload-input').setInputFiles({
        name,
        mimeType: 'image/png',
        buffer: Buffer.from(TINY_PNG_B64, 'base64'),
      });
    }
  }

  // Reload so the file list reflects all seeded files.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Open Design…').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}

async function openDesignFilesTab(page: Page): Promise<void> {
  const tab = page.getByTestId('design-files-tab');
  await expect(tab).toBeVisible({ timeout: 10_000 });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

// Sort the design-files table by Name ascending so rows appear in alphabetical
// order regardless of upload time. Tests (a)-(e) name files with sequential
// prefixes (aa, ab, ac, ...) so this guarantees stable row ordering.
async function sortByNameAsc(page: Page): Promise<void> {
  const nameHeader = page.locator('table.df-table th.df-th-name button.df-th-btn');
  await expect(nameHeader).toBeVisible({ timeout: 5_000 });
  // Default sort is mtime desc. One click → name asc (since name != current key,
  // clicking sets sortKey='name' and sortDir='asc').
  await nameHeader.click();
  // Confirm ascending sort is active.
  await expect(page.locator('table.df-table th.df-th-name[aria-sort="ascending"]')).toBeVisible();
}

// Click the .df-row-check span for a specific file, optionally with modifier keys.
// modifiers is the Playwright modifier list, e.g. ['Shift'], ['Meta'], ['Control'].
async function clickRowCheckbox(page: Page, fileName: string, modifiers: Array<'Shift' | 'Meta' | 'Control' | 'Alt'> = []): Promise<void> {
  const checkbox = page.locator(`[data-testid="design-file-row-${fileName}"] .df-row-check`);
  await expect(checkbox).toBeVisible({ timeout: 5_000 });
  if (modifiers.length === 0) {
    await checkbox.click();
  } else {
    await checkbox.click({ modifiers });
  }
}

// Assert aria-selected on the <tr> row for a given file.
async function expectSelected(page: Page, fileName: string, expected: boolean): Promise<void> {
  const row = page.locator(`[data-testid="design-file-row-${fileName}"]`);
  await expect(row).toHaveAttribute('aria-selected', String(expected));
}
