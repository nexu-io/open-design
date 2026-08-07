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
 * Prefer a real navigation over synthetic `history.pushState` + `popstate`.
 * Next.js App Router patches History in dev; a foreign pushState can leave
 * `window.location` on `/` while the custom client router never commits
 * `/projects`, which is exactly the CI signature that times out waiting for
 * `/\/projects$/`. `page.goto` is the same path every other projects-entry
 * helper already uses (`openNewProjectFromProjectsView`, entry-chrome).
 *
 * `apps/web` mounts `src/App` through `dynamic(..., { ssr: false })`, so
 * `domcontentloaded` resolves while the DOM still holds the boot shell —
 * wait that out with `T.long` before asserting the destination.
 */
async function openProjectsEntryView(page: Page): Promise<void> {
  const alreadyThere = /\/projects\/?$/.test(new URL(page.url()).pathname);
  if (!alreadyThere) {
    await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  }
  await page
    .getByText('Loading Open Design…')
    .waitFor({ state: 'hidden', timeout: T.long })
    .catch(() => {});
  await expect(page).toHaveURL(/\/projects\/?$/, { timeout: T.long });
  await expect(page.getByTestId('entry-view-projects')).toBeVisible({ timeout: T.long });
}
