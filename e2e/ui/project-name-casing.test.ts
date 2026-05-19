/**
 * Playwright regression spec: all five project-name display sites apply
 * text-transform: capitalize in a real Chromium rendering environment.
 *
 * jsdom honours getComputedStyle for declared property values but does NOT
 * execute text-transform on painted glyphs, so Playwright is required to
 * verify the actual CSS property is both declared and inherited correctly.
 *
 * The five selectors under test:
 *   1. .app-project-title .title    - design-files page header
 *   2. .workspace-tab__label        - workspace tab bar strip
 *   3. .workspace-tabs-list__title  - workspace tab overflow / search popover
 *   4. .design-card-name            - designs grid and kanban cards
 *   5. .recent-projects__card-name  - recent-projects strip on Home
 *
 * Red-on-main: c9d93498 is the parent of the first fix commit (fix(web): preserve
 * project title casing on design files page). On that commit only selector 1 has
 * text-transform: capitalize; selectors 2-5 do NOT. Running this test against
 * c9d93498 will therefore fail at the workspace-tab__label assertion.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';
// Use the ports assigned to this suite per the task spec.
// playwright.config.ts picks up OD_PORT / OD_WEB_PORT from the environment;
// these constants document the intended values; the config reads the env vars
// directly so no further wiring is needed here.
const PROJECT_NAME = 'acme studio'; // intentionally lowercase with a space

test.beforeEach(async ({ page }) => {
  // Seed localStorage so the app skips onboarding and uses the real daemon.
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
// Helper: seed a project via the production HTTP API (matches the pattern
// used by entry-chrome-flows.test.ts createProject helper).
// ---------------------------------------------------------------------------
async function createTestProject(page: Page, name: string): Promise<string> {
  const id = `casing-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const response = await page.request.post('/api/projects', {
    data: {
      id,
      name,
      skillId: null,
      designSystemId: null,
      metadata: { kind: 'prototype' },
    },
  });
  expect(response.ok(), `POST /api/projects failed: ${await response.text()}`).toBeTruthy();
  const body = (await response.json()) as { project: { id: string } };
  return body.project.id;
}

async function waitForLoadingToClear(page: Page) {
  const loading = page.getByText('Loading Open Design…');
  await loading.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
}

async function gotoEntryHome(page: Page) {
  await page.goto('/');
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /not now/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
}

// ---------------------------------------------------------------------------
// Selector 1 + 2: .app-project-title .title and .workspace-tab__label
// ---------------------------------------------------------------------------

test('design-files page header applies capitalize to project name', async ({ page }) => {
  const projectId = await createTestProject(page, PROJECT_NAME);

  // Navigate directly to the project workspace so the workspace tab bar is rendered.
  await page.goto(`/projects/${projectId}`);
  await waitForLoadingToClear(page);
  await expect(page.getByTestId('chat-composer')).toBeVisible({ timeout: 15_000 });

  // Site 1: .app-project-title .title
  const header = page.locator('.app-project-title .title');
  await expect(header).toBeVisible();

  // The stored name must be unchanged; a storage-layer fix would remove the CSS rule.
  const storedText = await header.textContent();
  expect(storedText?.trim()).toBe(PROJECT_NAME);

  // The CSS property must be declared as capitalize in the real browser.
  const headerTransform = await header.evaluate(
    (el) => window.getComputedStyle(el).textTransform,
  );
  expect(headerTransform).toBe('capitalize');
});

test('workspace tab bar label applies capitalize to project name', async ({ page }) => {
  const projectId = await createTestProject(page, PROJECT_NAME);

  await page.goto(`/projects/${projectId}`);
  await waitForLoadingToClear(page);
  await expect(page.getByTestId('chat-composer')).toBeVisible({ timeout: 15_000 });

  // Site 2: .workspace-tab__label (the active project tab in the strip)
  // The tab strip shows the project name for the active project tab.
  const tabLabel = page.locator('.workspace-tab.is-active .workspace-tab__label');
  await expect(tabLabel).toBeVisible();

  const tabStoredText = await tabLabel.textContent();
  expect(tabStoredText?.trim()).toBe(PROJECT_NAME);

  const tabTransform = await tabLabel.evaluate(
    (el) => window.getComputedStyle(el).textTransform,
  );
  expect(tabTransform).toBe('capitalize');
});

// ---------------------------------------------------------------------------
// Selector 3: .workspace-tabs-list__title (tab overflow / search popover)
//
// The overflow list is accessible by clicking the "Search tabs" button
// (aria-label="Search tabs") which opens the workspace-tabs-popover.
// This is always available regardless of viewport width and does not require
// creating enough tabs to overflow the strip.
// ---------------------------------------------------------------------------

test('workspace tabs overflow list applies capitalize to project name', async ({ page }) => {
  const projectId = await createTestProject(page, PROJECT_NAME);

  await page.goto(`/projects/${projectId}`);
  await waitForLoadingToClear(page);
  await expect(page.getByTestId('chat-composer')).toBeVisible({ timeout: 15_000 });

  // Open the tab search/overflow popover.
  const searchTabsBtn = page.locator('button[aria-label="Search tabs"]');
  await expect(searchTabsBtn).toBeVisible();
  await searchTabsBtn.click();

  const popover = page.locator('.workspace-tabs-popover');
  await expect(popover).toBeVisible();

  // Site 3: .workspace-tabs-list__title -- shows the project name in the list.
  const listTitle = popover.locator('.workspace-tabs-list__title', {
    hasText: PROJECT_NAME,
  });
  await expect(listTitle).toBeVisible();

  const listTransform = await listTitle.evaluate(
    (el) => window.getComputedStyle(el).textTransform,
  );
  expect(listTransform).toBe('capitalize');

  // Close the popover before continuing.
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Selector 4: .design-card-name (designs grid)
// ---------------------------------------------------------------------------

test('designs grid card applies capitalize to project name', async ({ page }) => {
  await createTestProject(page, PROJECT_NAME);

  // The designs tab at /projects renders the grid.
  await page.goto('/projects');
  await waitForLoadingToClear(page);
  await expect(page.locator('.design-grid, .design-kanban-board')).toBeVisible({ timeout: 10_000 });

  // Site 4: .design-card-name with matching text
  const cardName = page.locator('.design-card-name', {
    hasText: PROJECT_NAME,
  }).first();
  await expect(cardName).toBeVisible();

  const cardStoredText = await cardName.textContent();
  expect(cardStoredText?.trim()).toBe(PROJECT_NAME);

  const cardTransform = await cardName.evaluate(
    (el) => window.getComputedStyle(el).textTransform,
  );
  expect(cardTransform).toBe('capitalize');
});

// ---------------------------------------------------------------------------
// Selector 5: .recent-projects__card-name (recent-projects strip on Home)
// ---------------------------------------------------------------------------

test('recent-projects strip applies capitalize to project name', async ({ page }) => {
  await createTestProject(page, PROJECT_NAME);

  await gotoEntryHome(page);

  const recentStrip = page.getByTestId('recent-projects-strip');
  await expect(recentStrip).toBeVisible({ timeout: 10_000 });

  // Site 5: .recent-projects__card-name
  const recentCardName = recentStrip.locator('.recent-projects__card-name', {
    hasText: PROJECT_NAME,
  }).first();
  await expect(recentCardName).toBeVisible();

  const recentStoredText = await recentCardName.textContent();
  expect(recentStoredText?.trim()).toBe(PROJECT_NAME);

  const recentTransform = await recentCardName.evaluate(
    (el) => window.getComputedStyle(el).textTransform,
  );
  expect(recentTransform).toBe('capitalize');
});

// ---------------------------------------------------------------------------
// Selector scoping guard: the capitalize rule is limited to project tabs only.
//
// After the CSS was scoped to .workspace-tab__label--project, entry-view nav
// tabs (Home, Projects) render with plain .workspace-tab__label and must NOT
// receive the capitalize rule. This test verifies that scoping is respected.
// ---------------------------------------------------------------------------

test('workspace tab bar does not apply capitalize to nav entry tabs', async ({ page }) => {
  await page.goto('/');
  await waitForLoadingToClear(page);

  // The active tab when landing on Home is the entry-view "Home" tab.
  // Its label is the translated string for home, e.g. "Home".
  const activeTabLabel = page.locator('.workspace-tab.is-active .workspace-tab__label');
  await expect(activeTabLabel).toBeVisible({ timeout: 10_000 });

  const labelText = await activeTabLabel.textContent();
  expect(labelText?.trim()).toBeTruthy();
  expect(labelText?.trim()[0]).toMatch(/[A-Z]/);

  // The CSS rule is scoped to --project modifier; it must NOT apply to this plain nav entry tab.
  const labelTransform = await activeTabLabel.evaluate(
    (el) => window.getComputedStyle(el).textTransform,
  );
  expect(labelTransform).not.toBe('capitalize');

  // Navigate to a second entry view and verify the same invariant holds.
  await page.getByTestId('entry-nav-projects').click();
  await expect(page).toHaveURL(/\/projects$/);

  const projectsTabLabel = page.locator('.workspace-tab.is-active .workspace-tab__label');
  await expect(projectsTabLabel).toBeVisible();

  const projectsLabelText = await projectsTabLabel.textContent();
  expect(projectsLabelText?.trim()).toBeTruthy();
  expect(projectsLabelText?.trim()[0]).toMatch(/[A-Z]/);

  const projectsTransform = await projectsTabLabel.evaluate(
    (el) => window.getComputedStyle(el).textTransform,
  );
  expect(projectsTransform).not.toBe('capitalize');
});
