// Entry rail layout under a signed-in workspace (OPEND-2757): the 最近项目 list
// scrolls inside the rail's remaining height while the top destinations and
// the bottom social links stay put — whatever the window height, and while it
// changes. The signed-out visual home keeps the recent-projects grid on the
// page instead, so this spec mocks the personal Workspace the rail section
// needs and seeds enough projects to overflow a short window.
import { expect, test } from '@/playwright/suite';
import type { Locator, Page } from '@playwright/test';
import { AMR_PERSONAL_WORKSPACE_ITEM, mockAmrPersonalWorkspace } from '@/playwright/amr';
import { ensureRailOpen } from '@/playwright/rail';
import { T } from '@/timeouts';
import {
  captureVisual,
  configureVisualPage,
  gotoVisualHome,
  mockSignedInVelaAccount,
  waitForVisualFonts,
  type VisualProject,
} from '@/playwright/visual';

/** The desktop target the list stops growing at: ~11 rows of 38px plus the
 *  2px rhythm between them and the list's 2px top padding. */
const DESKTOP_LIST_CAP_PX = 11 * 38 + 10 * 2 + 2;

const RAIL_PROJECTS: VisualProject[] = Array.from({ length: 24 }, (_, index) => {
  const ordinal = String(index + 1).padStart(2, '0');
  return {
    id: `visual-rail-project-${ordinal}`,
    name: `Rail project ${ordinal}`,
    skillId: null,
    designSystemId: null,
    createdAt: 1_700_000_000_000 + index * 1_000,
    updatedAt: 1_700_000_500_000 - index * 1_000,
    metadata: {},
  } as VisualProject;
});

async function expectInsideViewport(page: Page, locator: Locator): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  await expect.poll(async () => {
    const box = await locator.boundingBox();
    if (!box || !viewport) return null;
    return {
      left: Math.max(0, -box.x),
      top: Math.max(0, -box.y),
      right: Math.max(0, box.x + box.width - (viewport.width + 1)),
      bottom: Math.max(0, box.y + box.height - (viewport.height + 1)),
    };
  }).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
}

/** The element under the locator's centre is the locator itself (or a child
 *  of it): nothing that overflowed the rail is lying over the control. */
async function expectHitTargetIsSelf(locator: Locator): Promise<void> {
  await expect.poll(() => locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit !== null && (hit === element || element.contains(hit));
  })).toBe(true);
}

/** A workspace-bound Home lists projects through the workspace-scoped
 *  catalog (`GET /api/workspaces/:id/projects?view=drafts`), not the unscoped
 *  `/api/projects` the visual fixture already answers; wrap the same rows in
 *  the summary shape that read returns. */
async function mockWorkspaceProjectList(page: Page, projects: readonly VisualProject[]): Promise<void> {
  const summaries = projects.map((project) => ({
    ...project,
    workspaceId: AMR_PERSONAL_WORKSPACE_ITEM.workspaceId,
    visibility: 'personal',
    resourceState: 'active',
    createdByWorkspaceMemberId: AMR_PERSONAL_WORKSPACE_ITEM.workspaceMemberId,
    updatedByWorkspaceMemberId: AMR_PERSONAL_WORKSPACE_ITEM.workspaceMemberId,
    resourceHubResourceId: null,
    cloudTombstonedAt: null,
    syncState: 'local_only',
    currentUserAccess: {
      canOpen: true,
      canRename: true,
      canDelete: true,
      canDuplicate: true,
      canMoveToTeam: true,
      canMoveToPersonal: false,
      canExport: true,
      canSendTo: true,
      canRestoreVersion: true,
    },
    project,
  }));
  await page.route('**/api/workspaces/*/projects**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET' || !new URL(request.url()).pathname.endsWith('/projects')) {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: { projects: summaries } });
  });
}

async function openRailWithRecentProjects(page: Page): Promise<void> {
  await configureVisualPage(page, { projects: RAIL_PROJECTS });
  await mockSignedInVelaAccount(page);
  await mockAmrPersonalWorkspace(page);
  await mockWorkspaceProjectList(page, RAIL_PROJECTS);
  await gotoVisualHome(page);
  await ensureRailOpen(page);
  await expect(page.getByTestId('entry-nav-recent-item')).toHaveCount(RAIL_PROJECTS.length, {
    timeout: T.medium,
  });
}

test('[P1] keeps the rail footer reachable in a short window and lets the recent list scroll', async ({ page }) => {
  test.setTimeout(T.xlong);
  await page.setViewportSize({ width: 1280, height: 600 });
  await openRailWithRecentProjects(page);

  const list = page.locator('.entry-nav-rail__recent-list');
  const rows = page.getByTestId('entry-nav-recent-item');
  const social = page.getByTestId('entry-nav-rail-social');
  const discord = page.getByTestId('entry-nav-rail-discord');
  const settings = page.getByTestId('entry-settings-button');

  // The fixed ends of the rail are on screen…
  await expectInsideViewport(page, settings);
  await expectInsideViewport(page, social);
  await expectInsideViewport(page, discord);
  await expectHitTargetIsSelf(discord);
  await discord.hover();

  // …because the list, not the rail, is what scrolls: it sits entirely above
  // the social row and clips the rows it cannot fit.
  await expect.poll(() => list.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
  const listBox = await list.boundingBox();
  const socialBox = await social.boundingBox();
  expect(listBox).not.toBeNull();
  expect(socialBox).not.toBeNull();
  expect(listBox!.y + listBox!.height).toBeLessThanOrEqual(socialBox!.y);
  await expect(rows.last()).not.toBeInViewport();
  await waitForVisualFonts(page);
  await captureVisual(page, 'visual-entry-rail-short');

  await list.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
  await expect(rows.last()).toBeInViewport();
  await expectInsideViewport(page, social);
  await expectHitTargetIsSelf(discord);

  // Growing the window hands the list more rows at once, live, and the footer
  // still ends where the window does.
  const shortListHeight = await list.evaluate((el) => el.clientHeight);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(() => list.evaluate((el) => el.clientHeight)).toBeGreaterThan(shortListHeight);
  expect(await list.evaluate((el) => el.clientHeight)).toBeLessThanOrEqual(DESKTOP_LIST_CAP_PX);
  await expectInsideViewport(page, social);
  await expectHitTargetIsSelf(discord);
  await captureVisual(page, 'visual-entry-rail-tall');

  // …and shrinking it again takes rows away without anything else moving.
  await page.setViewportSize({ width: 1280, height: 600 });
  await expect.poll(() => list.evaluate((el) => el.clientHeight)).toBeLessThan(shortListHeight + 1);
  await expectInsideViewport(page, social);

  // Collapsing and re-expanding the section restores the same layout.
  const toggle = page.getByTestId('entry-nav-recent-toggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expectInsideViewport(page, social);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(rows.first()).toBeVisible();
  await expectInsideViewport(page, social);
  await expectHitTargetIsSelf(discord);
});
