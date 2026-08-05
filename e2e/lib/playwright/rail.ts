import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { T } from '@/timeouts';

/**
 * The entry nav rail is collapsed by default; its destinations
 * (`entry-nav-*`) only become interactable once the rail is expanded. The
 * expand affordance is the pinned Home tab's sidebar toggle in the workspace
 * tabs bar (#5517 removed the entry topbar) — it only renders on the Home
 * view; on any other entry view the pinned tab is a Home shortcut instead,
 * so this helper returns Home first when it needs to expand. Idempotent —
 * no-ops when the rail is already docked open.
 *
 * Both controls hang off the pinned entry tab while it is the ACTIVE
 * workspace tab (`WorkspaceTabsBar.tsx`: `isPinned && active`), so this only
 * works from an entry surface. Inside a project the pinned tab renders as a
 * plain Home tab button and neither testid exists — call it after returning
 * to the entry shell, not from a project workspace.
 */
export async function ensureRailOpen(page: Page): Promise<void> {
  const shell = page.locator('.entry');
  const alreadyOpen = await shell
    .evaluate((el) => el.classList.contains('entry--rail-open'))
    .catch(() => false);
  if (!alreadyOpen) {
    const toggle = page.getByTestId('workspace-home-rail-toggle');
    if (!(await toggle.isVisible().catch(() => false))) {
      const homeNav = page.getByTestId('workspace-home-nav');
      if (await homeNav.isVisible().catch(() => false)) {
        await homeNav.click();
      }
    }
    await expect(toggle).toBeVisible();
    await toggle.click();
  }
  await expect(page.locator('.entry')).toHaveClass(/entry--rail-open/);
  await expect(page.locator('.entry-nav-rail')).not.toHaveAttribute('aria-hidden', 'true');
}

/**
 * Opens the New project modal.
 *
 * The rail is NOT the entry point any more. #5517 (b55f17169, f16075f7e)
 * rebuilt `EntryNavRail` and deleted both `entry-nav-new-project` and
 * `entry-nav-projects`; the rail's destinations are now Home / Community /
 * 草稿 / 全部项目 / 设计系统 / 插件. `onNewProject` is still destructured in
 * `EntryNavRail.tsx` but nothing calls it, so probing for a rail "+ New
 * project" button can only ever miss — this helper used to burn that probe
 * plus an `ensureRailOpen` round-trip before falling through to the path
 * below.
 *
 * The modal's only surviving trigger is `DesignsTab`'s own CTA
 * (`designs-new-project` once the workspace has projects,
 * `designs-empty-new-project` while it has none), which lives in the
 * `projects` entry view. That view has no UI entry either: `HomeView` passes
 * `heading` to `RecentProjectsStrip`, which selects the full-page-grid header
 * that omits `recent-projects-view-all`, so `HomeView.onViewAllProjects` is
 * wired but unreachable — the same gap `e2e/ui/entry-chrome-flows.test.ts`
 * documents. Drive the `/projects` route directly until an entry returns.
 */
export async function openNewProjectModal(page: Page): Promise<void> {
  if (await page.getByTestId('new-project-panel').isVisible().catch(() => false)) return;
  // Chrome parity only, never a functional step: the rail carries no
  // new-project affordance, but the rail's docked state persists
  // (`od.entry.railOpen`) and shows around the modal backdrop, so the
  // `visual-new-project-modal` baseline would churn if this flow stopped
  // docking it. Skipped outside the entry shell — a project surface has no
  // pinned-tab toggle at all (`WorkspaceTabsBar` renders it only for
  // `isPinned && active`) — and never allowed to fail the flow.
  if ((await page.locator('.entry').count()) > 0) {
    await ensureRailOpen(page).catch(() => {});
  }
  await openProjectsEntryView(page);
  const projectsView = page.getByTestId('entry-view-projects');
  await expect(projectsView).toBeVisible({ timeout: T.long });
  const createButton = projectsView
    .getByTestId('designs-new-project')
    .or(projectsView.getByTestId('designs-empty-new-project'))
    .first();
  await expect(createButton).toBeVisible({ timeout: T.long });
  await createButton.click();
  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}

/**
 * Puts the entry shell on its `projects` view.
 *
 * Prefers the client router (`src/router.ts` listens for `popstate`) over
 * `page.goto`: every caller already has a booted app, and a hard navigation
 * throws that tree away — plus the seconds of SPA boot it cost — to re-render
 * the very same view. Falls back to `page.goto` when the frame has no usable
 * history (a fresh context still parked on `about:blank`).
 */
async function openProjectsEntryView(page: Page): Promise<void> {
  const routed = await page
    .evaluate(() => {
      if (window.location.pathname.replace(/\/+$/, '') === '/projects') return true;
      if (typeof window.history?.pushState !== 'function') return false;
      window.history.pushState(null, '', '/projects');
      window.dispatchEvent(new PopStateEvent('popstate'));
      return true;
    })
    .catch(() => false);
  if (!routed) {
    await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  }
  // `apps/web` mounts `src/App` through `dynamic(..., { ssr: false })`, so a
  // hard navigation resolves `domcontentloaded` while the DOM still holds
  // nothing but the boot shell. Asserting an app testid straight after that
  // races the boot: `expect`'s configured 10s budget is well under the
  // `T.long` allowance every suite gives this wait, and the miss surfaces as
  // a bare "element(s) not found" on a testid that does ship.
  await page
    .getByText('Loading Open Design…')
    .waitFor({ state: 'hidden', timeout: T.long })
    .catch(() => {});
  await expect(page).toHaveURL(/\/projects$/, { timeout: T.medium });
}
