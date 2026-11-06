import type { Page } from '@playwright/test';

import { expect, test } from '@/playwright/suite';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { ensureRailOpen } from '@/playwright/rail';
import { T } from '@/timeouts';

// OPEND-2762 / OPEND-2795 — the rail's 最近项目 run-status glyphs, watched at
// the browser boundary: when the status reads leave relative to the rows
// painting, whether a glyph ever flashes away, and whether the same project
// reads the same in the rail and the project switcher.
//
// The daemon is real; the signed-in Workspace, its project list and the
// per-project runs feed are route mocks so each status is a known fixture and
// the runs feed has a visible, controlled latency.

const WORKSPACE = {
  workspaceId: 'ui-ws-run-status',
  workspaceName: 'Run status workspace',
  workspaceType: 'personal',
  workspaceMemberId: 'ui-wm-run-status',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'free',
  planId: null,
  seatSummary: { seatLimit: 1, usedSeats: 1, availableSeats: 0, isSeatFull: true },
  permissions: {
    canInviteMembers: false,
    canManageBilling: true,
    canViewWorkspaceSettings: true,
    canManageSharedResources: false,
    canShareProjects: false,
    canWriteSyncedFiles: true,
  },
  workspaceSettingsUrl: 'https://console.example.test/settings?workspaceId=ui-ws-run-status',
} as const;

type RunStatus = 'running' | 'succeeded' | 'failed';

const PROJECTS: ReadonlyArray<{
  id: string;
  name: string;
  run: RunStatus | null;
  awaiting?: boolean;
}> = [
  { id: 'ui-rs-running', name: 'Campaign landing (running)', run: 'running' },
  { id: 'ui-rs-awaiting', name: 'Brand deck (awaiting)', run: 'succeeded', awaiting: true },
  { id: 'ui-rs-done', name: 'Pricing page (done)', run: 'succeeded' },
  { id: 'ui-rs-failed', name: 'Onboarding flow (failed)', run: 'failed' },
  { id: 'ui-rs-quiet', name: 'Untouched notes', run: null },
];

/** How long the mocked runs feed takes to answer: long enough to see. */
const RUNS_LATENCY_MS = 300;

function projectRow(project: (typeof PROJECTS)[number]) {
  const base = {
    id: project.id,
    name: project.name,
    skillId: null,
    designSystemId: null,
    createdAt: 1_720_000_000_000,
    updatedAt: 1_720_000_000_000 + PROJECTS.length - PROJECTS.indexOf(project),
    metadata: { kind: 'prototype', nameSource: 'user' },
    workspaceId: WORKSPACE.workspaceId,
  };
  return {
    ...base,
    visibility: 'personal',
    resourceState: 'active',
    createdByWorkspaceMemberId: WORKSPACE.workspaceMemberId,
    updatedByWorkspaceMemberId: WORKSPACE.workspaceMemberId,
    resourceHubResourceId: null,
    cloudTombstonedAt: null,
    syncState: 'local_only',
    currentUserAccess: {
      canOpen: true,
      canRename: true,
      canDelete: true,
      canDuplicate: true,
      canMoveToTeam: false,
      canMoveToPersonal: false,
      canExport: true,
      canSendTo: true,
      canRestoreVersion: true,
    },
    project: base,
  };
}

async function wireSignedInWorkspace(page: Page): Promise<{
  runsRequests: string[];
  /** A NEW run finished in this project: the feed starts naming a fresh run
   *  id, which is what makes a spent ✓ come back. */
  finishAnotherRun: (projectId: string) => void;
}> {
  const runsRequests: string[] = [];
  const runGeneration = new Map<string, number>();

  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({
      json: {
        loggedIn: true,
        loginInFlight: false,
        profile: 'test',
        user: { id: 'ui-run-status-user', email: 'run-status@example.com', name: 'Run Status', plan: 'free' },
        account: { plan: 'free', balanceUsd: '0.00' },
        configPath: '/tmp/.amr/config.json',
      },
    });
  });

  await page.route('**/api/workspace/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();
    if (pathname === '/api/workspace/context' && method === 'GET') {
      await route.fulfill({ json: { context: WORKSPACE } });
      return;
    }
    if (pathname === '/api/workspace/directory' && method === 'GET') {
      await route.fulfill({
        json: {
          items: [{
            workspaceId: WORKSPACE.workspaceId,
            workspaceName: WORKSPACE.workspaceName,
            workspaceType: WORKSPACE.workspaceType,
            workspaceMemberId: WORKSPACE.workspaceMemberId,
            role: WORKSPACE.role,
            memberStatus: WORKSPACE.memberStatus,
            lifecycleState: WORKSPACE.lifecycleState,
          }],
          activeWorkspaceId: WORKSPACE.workspaceId,
        },
      });
      return;
    }
    if (pathname === '/api/workspace/billing' && method === 'GET') {
      await route.fulfill({
        json: {
          summary: null,
          workspaceBalance: {
            workspaceId: WORKSPACE.workspaceId,
            workspaceMemberId: WORKSPACE.workspaceMemberId,
            balanceUsd: '0.00',
            billingScopeVersion: 2,
            expiresAt: null,
            updatedAt: '2026-07-31T00:00:00.000Z',
          },
        },
      });
      return;
    }
    if (pathname === '/api/workspace/projects/team' && method === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.fallback();
  });

  await page.route('**/api/workspaces/*/projects**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: { projects: PROJECTS.map(projectRow) } });
  });

  await page.route('**/api/projects/*/workspace-scope', async (route) => {
    const projectId = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2) ?? '');
    await route.fulfill({
      json: {
        scope: {
          kind: 'personal',
          projectId,
          workspaceId: WORKSPACE.workspaceId,
          visibility: 'personal',
          context: WORKSPACE,
        },
      },
    });
  });
  await page.route('**/api/projects/*/files**', async (route) => {
    await route.fulfill({ json: { files: [] } });
  });
  await page.route('**/api/projects/*/conversations**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: { conversations: [] } });
  });
  await page.route('**/api/projects/*', async (route) => {
    const request = route.request();
    const projectId = decodeURIComponent(new URL(request.url()).pathname.split('/').at(-1) ?? '');
    const project = PROJECTS.find((candidate) => candidate.id === projectId);
    if (request.method() !== 'GET' || !project) {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: { project: projectRow(project).project } });
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
    runsRequests.push(projectId);
    await new Promise((resolve) => setTimeout(resolve, RUNS_LATENCY_MS));
    const generation = runGeneration.get(projectId) ?? 0;
    await route.fulfill({
      json: {
        runs: project.run
          ? [{
              id: generation === 0 ? `run-${project.id}` : `run-${project.id}-${generation}`,
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

  return {
    runsRequests,
    finishAnotherRun: (projectId) => {
      runGeneration.set(projectId, (runGeneration.get(projectId) ?? 0) + 1);
    },
  };
}

type PaintLog = {
  /** performance.now() when the first 最近项目 row was attached. */
  rowsAt: number | null;
  /** performance.now() when the first status glyph inside a row was attached. */
  glyphAt: number | null;
  /** Status glyphs removed from the DOM — every one is a visible flash. */
  glyphRemovals: number;
};

/**
 * Watch the rail from inside the page: a MutationObserver stamps the first row
 * and the first status glyph as they attach, and counts glyphs detaching.
 * `reset()` re-arms it for a second navigation.
 */
async function installPaintLog(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const ROW = '[data-testid="entry-nav-recent-item"]';
    const GLYPH = `${ROW} [role="img"]`;
    const log: PaintLog = { rowsAt: null, glyphAt: null, glyphRemovals: 0 };
    (window as unknown as { __odPaintLog: PaintLog }).__odPaintLog = log;
    (window as unknown as { __odPaintLogReset: () => void }).__odPaintLogReset = () => {
      log.rowsAt = null;
      log.glyphAt = null;
      log.glyphRemovals = 0;
    };
    const matches = (node: Node, selector: string) =>
      node instanceof Element && (node.matches(selector) || node.querySelector(selector) !== null);
    const observer = new MutationObserver((records) => {
      const now = performance.now();
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (log.rowsAt === null && matches(node, ROW)) log.rowsAt = now;
          if (log.glyphAt === null && matches(node, GLYPH)) log.glyphAt = now;
        }
        for (const node of record.removedNodes) {
          if (node instanceof Element && (node.matches('[role="img"]') || node.querySelector('[role="img"]'))
            && record.target instanceof Element && record.target.closest(ROW)) {
            log.glyphRemovals += 1;
          }
        }
      }
    });
    // `document` itself: an init script can run before <html> exists, and a
    // subtree watch from the document node covers everything that follows.
    observer.observe(document, { childList: true, subtree: true });
  });
}

async function readPaintLog(page: Page): Promise<PaintLog> {
  return page.evaluate(() => (window as unknown as { __odPaintLog: PaintLog }).__odPaintLog);
}

async function resetPaintLog(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __odPaintLogReset: () => void }).__odPaintLogReset());
}

/** The pinned Home tab inside a project: the SPA way back, not a reload. */
function projectHomeTab(page: Page) {
  return page.getByRole('banner', { name: /Workspace tabs/ }).getByRole('button', { name: /^(Home|首页)$/ });
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

async function expectRailStatuses(page: Page): Promise<void> {
  await expect(recentRow(page, 'Campaign landing').getByRole('img', { name: /Running|运行中/ })).toBeVisible();
  await expect(recentRow(page, 'Brand deck').getByRole('img', { name: /Needs input|等待输入/ })).toBeVisible();
  await expect(recentRow(page, 'Pricing page').getByRole('img', { name: /Completed|已完成/ })).toBeVisible();
  await expect(recentRow(page, 'Onboarding flow').getByRole('img', { name: /Failed|失败/ })).toBeVisible();
  await expect(recentRow(page, 'Untouched notes').getByRole('img')).toHaveCount(0);
}

test.describe.configure({ timeout: T.xlong });

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
  await installPaintLog(page);
});

test('[P1] first paint asks for every visible row\'s status once and never flashes a glyph away', async ({ page }) => {
  const { runsRequests } = await wireSignedInWorkspace(page);
  await gotoHome(page);
  await expectRailStatuses(page);

  const log = await readPaintLog(page);
  const perProject = new Map<string, number>();
  for (const id of runsRequests) perProject.set(id, (perProject.get(id) ?? 0) + 1);
  await test.info().attach('rail-paint-log', {
    body: JSON.stringify({ ...log, runsRequestsPerProject: Object.fromEntries(perProject) }, null, 2),
    contentType: 'application/json',
  });
  expect(log.rowsAt).not.toBeNull();
  expect(log.glyphAt).not.toBeNull();
  // The glyphs can only land after the mocked feed answers; what must not
  // happen is a glyph appearing and being torn down again while the catalog
  // settles.
  expect(log.glyphRemovals).toBe(0);
  // One read per row while Home settles: the feed is asked as the rows paint,
  // not once per re-render of the catalog.
  for (const project of PROJECTS) expect(perProject.get(project.id), project.id).toBe(1);
});

test('[P1] returning from a project paints the rows and their statuses together', async ({ page }) => {
  await wireSignedInWorkspace(page);
  await gotoHome(page);
  await expectRailStatuses(page);

  // Into the running project (not a finished one, so nothing is spent) …
  await recentRow(page, 'Campaign landing').click();
  await expect(page).toHaveURL(/\/projects\/ui-rs-running/, { timeout: T.medium });
  await expect(page.getByTestId('entry-nav-recent-item')).toHaveCount(0);

  // … and back to Home through the pinned Home tab (the SPA path, not a reload).
  await resetPaintLog(page);
  await projectHomeTab(page).click();
  await expect(page.getByTestId('home-hero')).toBeVisible({ timeout: T.medium });
  await ensureRailOpen(page);
  await expectRailStatuses(page);

  const log = await readPaintLog(page);
  await test.info().attach('rail-paint-log', {
    body: JSON.stringify(log, null, 2),
    contentType: 'application/json',
  });
  expect(log.rowsAt).not.toBeNull();
  expect(log.glyphAt).not.toBeNull();
  // The feed already knows these statuses: the rows and their glyphs are one
  // paint, not a round trip apart.
  expect(log.glyphAt! - log.rowsAt!).toBeLessThan(RUNS_LATENCY_MS / 2);
  expect(log.glyphRemovals).toBe(0);
});

test('[P1] the project switcher and the rail tell one story about a finished project', async ({ page }) => {
  await wireSignedInWorkspace(page);
  await gotoHome(page);
  await expectRailStatuses(page);

  // Open the finished project from the rail: that spends its ✓.
  await recentRow(page, 'Pricing page').click();
  await expect(page).toHaveURL(/\/projects\/ui-rs-done/, { timeout: T.medium });

  // The switcher inside the project reads the same feed — and the same rule.
  // Wait for its own read of this project to land before judging: an early
  // look would pass on a blank column that was about to fill with a ✓.
  const switcherRead = page.waitForResponse((response) =>
    response.request().method() === 'GET'
    && response.url().includes('/api/runs?projectId=ui-rs-done'));
  await page.getByTestId('workspace-tabs-dropdown-trigger').click();
  const listbox = page.getByRole('listbox');
  await expect(listbox.getByRole('option', { name: /Pricing page/ })).toBeVisible();
  expect((await switcherRead).ok()).toBe(true);
  await expect(listbox.getByRole('option', { name: /Pricing page/ }).getByRole('img', { name: /Completed|已完成/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Back on Home the rail agrees: the ✓ is gone there too, while every live
  // status stays.
  await projectHomeTab(page).click();
  await expect(page.getByTestId('home-hero')).toBeVisible({ timeout: T.medium });
  await ensureRailOpen(page);
  await expect(recentRow(page, 'Pricing page')).toBeVisible();
  await expect(recentRow(page, 'Pricing page').getByRole('img')).toHaveCount(0);
  await expect(recentRow(page, 'Campaign landing').getByRole('img', { name: /Running|运行中/ })).toBeVisible();
  await expect(recentRow(page, 'Brand deck').getByRole('img', { name: /Needs input|等待输入/ })).toBeVisible();
  await expect(recentRow(page, 'Onboarding flow').getByRole('img', { name: /Failed|失败/ })).toBeVisible();
});

// OPEND-3129 / OPEND-3133 — a finished project is not a ✓ in the glyph column:
// it keeps the folder every idle project leads with and carries a small blue
// dot at the row's end until it is opened. Both surfaces read that from the
// one shared store, so the dot leaves the rail and the switcher together.
test('[P1] a finished project keeps its folder and carries an unread dot until it is opened, in the rail and the switcher', async ({ page }) => {
  const { finishAnotherRun } = await wireSignedInWorkspace(page);
  await gotoHome(page);
  await expectRailStatuses(page);

  const folderIn = (row: ReturnType<typeof recentRow>) => row.getByTestId('project-folder-glyph');
  // Finished: folder + dot. Quiet: folder alone. Running: the orb, no dot.
  await expect(folderIn(recentRow(page, 'Pricing page'))).toBeVisible();
  await expect(recentRow(page, 'Pricing page').getByTestId('entry-nav-recent-unread')).toBeVisible();
  await expect(folderIn(recentRow(page, 'Untouched notes'))).toBeVisible();
  await expect(recentRow(page, 'Untouched notes').getByTestId('entry-nav-recent-unread')).toHaveCount(0);
  await expect(folderIn(recentRow(page, 'Campaign landing'))).toHaveCount(0);
  await expect(recentRow(page, 'Campaign landing').getByTestId('entry-nav-recent-unread')).toHaveCount(0);

  // Opening the finished project spends its dot …
  await recentRow(page, 'Pricing page').click();
  await expect(page).toHaveURL(/\/projects\/ui-rs-done/, { timeout: T.medium });
  await projectHomeTab(page).click();
  await expect(page.getByTestId('home-hero')).toBeVisible({ timeout: T.medium });
  await ensureRailOpen(page);
  await expect(folderIn(recentRow(page, 'Pricing page'))).toBeVisible();
  await expect(recentRow(page, 'Pricing page').getByTestId('entry-nav-recent-unread')).toHaveCount(0);

  // … and a NEW finished run brings it back. Watch it from inside another
  // project, where the switcher lists both tabs: the finished one leads with
  // the folder and ends with the dot, the running one keeps its orb. The
  // switcher reads the feed only while its menu is open, so open it first and
  // let the next poll carry the new run in.
  await recentRow(page, 'Campaign landing').click();
  await expect(page).toHaveURL(/\/projects\/ui-rs-running/, { timeout: T.medium });
  await page.getByTestId('workspace-tabs-dropdown-trigger').click();
  const listbox = page.getByRole('listbox');
  await expect(listbox.getByRole('option', { name: /Pricing page/ })).toBeVisible();
  finishAnotherRun('ui-rs-done');
  await page.waitForResponse((response) =>
    response.request().method() === 'GET'
    && response.url().includes('/api/runs?projectId=ui-rs-done'), { timeout: T.long });
  const doneOption = listbox.getByRole('option', { name: /Pricing page/ });
  const runningOption = listbox.getByRole('option', { name: /Campaign landing/ });
  await expect(doneOption.getByTestId('project-folder-glyph')).toBeVisible();
  await expect(doneOption.getByTestId('workspace-tabs-dropdown-unread')).toBeVisible({ timeout: T.medium });
  await expect(runningOption.getByRole('img', { name: /Running|运行中/ })).toBeVisible();
  await expect(runningOption.getByTestId('workspace-tabs-dropdown-unread')).toHaveCount(0);

  // Opening it from the switcher spends the dot there and in the rail alike.
  await doneOption.click();
  await expect(page).toHaveURL(/\/projects\/ui-rs-done/, { timeout: T.medium });
  await page.getByTestId('workspace-tabs-dropdown-trigger').click();
  await expect(page.getByRole('listbox').getByRole('option', { name: /Pricing page/ })
    .getByTestId('workspace-tabs-dropdown-unread')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await projectHomeTab(page).click();
  await expect(page.getByTestId('home-hero')).toBeVisible({ timeout: T.medium });
  await ensureRailOpen(page);
  await expect(folderIn(recentRow(page, 'Pricing page'))).toBeVisible();
  await expect(recentRow(page, 'Pricing page').getByTestId('entry-nav-recent-unread')).toHaveCount(0);
});
