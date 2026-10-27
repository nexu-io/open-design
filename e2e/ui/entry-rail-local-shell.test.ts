import type { Page } from '@playwright/test';

import { expect, test } from '@/playwright/suite';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { ensureRailOpen } from '@/playwright/rail';
import { T } from '@/timeouts';

// OPEND-3140 — the local (signed-out CLI / BYOK) shell on the entry rail
// layout: the rail's 最近项目 section lists the local project catalogue with
// live run status, 项目 is a rail destination, the message centre rides the
// foot dock, and Home carries no recent-projects grid.
//
// The daemon is real and signed out (the standard mocks answer the vela status
// probe with an outage, so no Workspace identity is ever claimed). The local
// project list and the per-project runs feed are route mocks so each status is
// a known fixture — nothing here goes through `/api/workspaces/*`.

type RunStatus = 'running' | 'succeeded' | 'failed';

const PROJECTS: ReadonlyArray<{
  id: string;
  name: string;
  run: RunStatus | null;
  awaiting?: boolean;
}> = [
  { id: 'ui-local-running', name: 'Local campaign (running)', run: 'running' },
  { id: 'ui-local-awaiting', name: 'Local brand deck (awaiting)', run: 'succeeded', awaiting: true },
  { id: 'ui-local-done', name: 'Local pricing page (done)', run: 'succeeded' },
  { id: 'ui-local-failed', name: 'Local onboarding (failed)', run: 'failed' },
  { id: 'ui-local-quiet', name: 'Local untouched notes', run: null },
];

function projectRow(project: (typeof PROJECTS)[number]) {
  return {
    id: project.id,
    name: project.name,
    skillId: null,
    designSystemId: null,
    createdAt: 1_720_000_000_000,
    updatedAt: 1_720_000_000_000 + PROJECTS.length - PROJECTS.indexOf(project),
    metadata: { kind: 'prototype', nameSource: 'user' },
  };
}

async function wireLocalProjects(page: Page): Promise<{ runsRequests: string[] }> {
  const runsRequests: string[] = [];

  await page.route('**/api/projects', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: { projects: PROJECTS.map(projectRow) } });
  });
  await page.route('**/api/projects/*/files**', async (route) => {
    await route.fulfill({ json: { files: [] } });
  });
  await page.route('**/api/runs?projectId=*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const projectId = url.searchParams.get('projectId') ?? '';
    const project = PROJECTS.find((candidate) => candidate.id === projectId);
    if (request.method() !== 'GET' || !project) {
      await route.fallback();
      return;
    }
    // A local project is asked about without any Workspace header.
    expect(request.headers()['x-od-workspace-id']).toBeUndefined();
    runsRequests.push(projectId);
    await route.fulfill({
      json: {
        runs: project.run
          ? [{
              id: `run-${project.id}`,
              projectId: project.id,
              conversationId: null,
              assistantMessageId: null,
              agentId: 'claude',
              status: project.run,
              createdAt: 1_720_000_000_000,
              updatedAt: 1_720_000_001_000,
            }]
          : [],
        awaitingInputProjectIds: project.awaiting ? [project.id] : [],
      },
    });
  });

  return { runsRequests };
}

function recentRow(page: Page, name: string) {
  return page.getByTestId('entry-nav-recent-item').filter({ hasText: name }).first();
}

async function gotoHome(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });
  await expect(page.getByTestId('home-hero')).toBeVisible({ timeout: T.medium });
  await ensureRailOpen(page);
}

test.describe.configure({ timeout: T.xlong });

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
});

test('[P1] the local shell lists its projects in the rail with live run status and no Home grid', async ({ page }) => {
  const { runsRequests } = await wireLocalProjects(page);
  await gotoHome(page);

  // No cloud identity: the sign-in card is still the rail's sign-in entry …
  await expect(page.getByTestId('entry-cloud-signin-tip')).toBeVisible();
  await expect(page.getByTestId('entry-nav-account')).toHaveCount(0);

  // … and the local catalogue is the rail's 最近项目 section, newest first.
  await expect(page.getByTestId('entry-nav-recent-toggle')).toBeVisible();
  await expect(page.getByTestId('entry-nav-recent-item')).toHaveText(PROJECTS.map((project) => project.name));
  await expect(recentRow(page, 'Local campaign').getByRole('img', { name: /Running|运行中/ })).toBeVisible();
  await expect(recentRow(page, 'Local brand deck').getByRole('img', { name: /Needs input|等待输入/ })).toBeVisible();
  await expect(recentRow(page, 'Local pricing page').getByRole('img', { name: /Completed|已完成/ })).toBeVisible();
  await expect(recentRow(page, 'Local onboarding').getByRole('img', { name: /Failed|失败/ })).toBeVisible();
  await expect(recentRow(page, 'Local untouched notes').getByRole('img')).toHaveCount(0);
  for (const project of PROJECTS) expect(runsRequests).toContain(project.id);

  // Home itself carries no recent-projects grid, nor the grid's controls.
  await expect(page.getByTestId('recent-projects-strip')).toHaveCount(0);
  await expect(page.getByTestId('entry-view-home').locator('.recent-projects')).toHaveCount(0);

  // The row menu only offers what a local project can do. The ⋮ is the row
  // button's sibling inside the row wrapper, painted on hover.
  const quietRow = page.locator('.entry-nav-rail__recent-row').filter({ hasText: 'Local untouched notes' });
  await quietRow.hover();
  await quietRow.getByTestId('entry-nav-recent-more').click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem')).toHaveText([/Rename|重命名/, /Duplicate|复制/, /Delete|删除/]);
  await page.keyboard.press('Escape');
});

test('[P1] 项目 is a rail destination in the local shell and lists the same catalogue', async ({ page }) => {
  await wireLocalProjects(page);
  await gotoHome(page);

  const drafts = page.getByTestId('entry-nav-drafts');
  await expect(drafts).toBeVisible();
  await expect(page.getByTestId('entry-nav-all-projects')).toHaveCount(0);
  await drafts.click();
  await expect(page).toHaveURL(/\/drafts$/, { timeout: T.medium });
  await expect(drafts).toHaveAttribute('aria-current', 'page');
  const strip = page.getByTestId('recent-projects-strip');
  await expect(strip).toBeVisible();
  for (const project of PROJECTS) {
    await expect(strip.getByText(project.name, { exact: true })).toBeVisible();
  }
  // Rail and page are two views of one list.
  await expect(page.getByTestId('entry-nav-recent-item')).toHaveCount(PROJECTS.length);
});

test('[P1] the message centre rides the rail foot dock in the local shell', async ({ page }) => {
  await wireLocalProjects(page);
  await gotoHome(page);

  const dock = page.locator('.entry-nav-rail__account-dock');
  await expect(dock).toBeVisible();
  const bell = dock.getByTestId('entry-nav-message-center');
  await expect(bell).toBeVisible();
  await expect(bell).toHaveAttribute('aria-haspopup', 'dialog');
  // Not a destination in the nav list any more.
  await expect(page.locator('.entry-nav-rail__group').getByTestId('entry-nav-message-center')).toHaveCount(0);
  await expect(dock.getByTestId('entry-nav-rail-social')).toBeVisible();
  await bell.click();
  await expect(page.getByTestId('message-center-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('message-center-dialog')).toHaveCount(0);
});
