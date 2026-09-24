import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { T } from '@/timeouts';

/**
 * The entry nav rail is collapsed by default; its destinations
 * (`entry-nav-*`) only become interactable once the rail is expanded. The
 * expand affordance is the rail toggle in the workspace tabs chrome row
 * (`entry-rail-collapse`, beside the search button — #7635 moved the pair out
 * of the rail and hid the pinned Home pill there; #5517 had already removed
 * the entry topbar). It renders on every entry view, so no Home round-trip is
 * needed. Idempotent — no-ops when the rail is already docked open.
 *
 * The cluster only renders while the strip is undocked, i.e. on an entry
 * surface (`WorkspaceTabsBar.tsx`: `!tabsDockEl && !settingsPageChrome`).
 * Inside a project the strip lives in the chat column dock and the testid
 * does not exist — call it after returning to the entry shell, not from a
 * project workspace.
 */
/**
 * Close the release announcement if it is up. `WhatsNewPopup` is a shared
 * `<Dialog>`, which mounts its scrim on <body> above every piece of chrome
 * (#7635) — while it is open nothing behind it, the rail toggle included, can
 * be clicked. Specs that apply the standard mocks never see it
 * (`suppressWhatsNew`); the ones that drive a real daemon do, whenever the
 * running build ships highlights. Idempotent — no-ops when there is none.
 */
export async function dismissWhatsNewPopup(page: Page): Promise<void> {
  const popup = page.getByTestId('whats-new-popup');
  await popup.waitFor({ state: 'visible', timeout: 1_000 }).catch(() => {});
  if (await popup.isVisible().catch(() => false)) {
    await popup.getByTestId('whats-new-dismiss').click();
    await expect(popup).toBeHidden();
  }
}

export async function ensureRailOpen(page: Page): Promise<void> {
  await dismissWhatsNewPopup(page);
  const shell = page.locator('.entry');
  const alreadyOpen = await shell
    .evaluate((el) => el.classList.contains('entry--rail-open'))
    .catch(() => false);
  if (!alreadyOpen) {
    const toggle = page.getByTestId('entry-rail-collapse');
    if (!(await toggle.isVisible().catch(() => false))) {
      const homeNav = page.getByTestId('workspace-home-nav');
      if (await homeNav.isVisible().catch(() => false)) {
        await homeNav.click();
      }
    }
    await expect(toggle).toBeVisible();
    // Bounded on purpose. This config sets no `actionTimeout`, so a bare
    // `click()` inherits Playwright's default of 0 — no limit — and an
    // unclickable toggle does not reject, it hangs until the whole test's
    // budget runs out. Callers that wrap this helper in `.catch(() => {})`
    // (`openNewProjectModal` below: "never allowed to fail the flow") can only
    // swallow a rejection, so without a bound their opt-out silently becomes
    // the opposite — the flow dies rather than skipping the rail. That is not
    // hypothetical: 8d0b542d0a raised `.backdrop` to `z-index: 1500` over the
    // `z-index: 120` tabs bar, the hit-target check stopped passing, and a UI
    // P0 burned ~120s before failing on the NEXT action (`page.goto`), naming
    // the wrong culprit.
    //
    // `T.short` (3s local / 6s CI) rather than a longer tier: visibility was
    // just asserted above, so all that remains is Playwright's stability /
    // hit-target / enabled polling, and this repo's UI transitions budget
    // ~200ms (root AGENTS.md) — 3s is an order of magnitude of headroom, and
    // `T` already doubles it on CI for slower machines. Longer would not fit:
    // `test:ui:extended` runs rail consumers under `OD_PLAYWRIGHT_TIMEOUT=10000`,
    // where a 10s+ bound is no bound at all. A bound can only turn an
    // unbounded hang into a fast, attributable failure; it cannot fail a click
    // that would have landed inside it.
    await toggle.click({ timeout: T.short });
  }
  await expect(page.locator('.entry')).toHaveClass(/entry--rail-open/);
  await expect(page.locator('.entry-nav-rail')).not.toHaveAttribute('aria-hidden', 'true');
}

/**
 * Opens the New project modal.
 *
 * The rail's `entry-nav-new-project` item is the entry point (#8097). #5517
 * (b55f17169, f16075f7e) had deleted it — leaving `EntryShell`'s
 * `onNewProject` handler as dead wiring and the dialog reachable only through
 * the `/projects` deep link — so this helper drove `DesignsTab`'s CTA
 * instead. The restored item heads the second destination group on both
 * identity branches, so it opens the modal from any entry view without a
 * route change first.
 *
 * `DesignsTab`'s own CTA (`designs-new-project` once the workspace has
 * projects, `designs-empty-new-project` while it has none) stays as the
 * fallback for callers that arrive outside the entry shell or before the rail
 * has committed; the helper keeps its long-standing "never fail the flow"
 * contract and lets the `/projects` route surface any real regression. The
 * rail's docked state persists (`od.entry.railOpen`) and shows around the
 * modal backdrop, so `visual-new-project-modal` expects it open either way.
 */
/**
 * Opens 全部项目 from the rail and switches it to the 团队项目 tab (OPEND-3108).
 * The former `entry-nav-all-projects` destination is this tab now; the rail
 * has one project entry in every workspace.
 */
export async function openTeamProjectsTab(page: Page): Promise<void> {
  await page.getByTestId('entry-nav-drafts').click();
  await page.getByTestId('recent-projects-collection-teamProjects').click();
}

export async function openNewProjectModal(page: Page): Promise<void> {
  if (await page.getByTestId('new-project-panel').isVisible().catch(() => false)) return;
  // Canonical opener inside the entry shell (#8097). Outside it — a project
  // surface has no rail at all (`WorkspaceTabsBar` renders the pinned-tab
  // toggle only for `isPinned && active`) — or if the rail path cannot land,
  // fall through to the Projects-view CTA below rather than fail the flow.
  if ((await page.locator('.entry').count()) > 0) {
    try {
      await ensureRailOpen(page);
      const railButton = page.getByTestId('entry-nav-new-project');
      await expect(railButton).toBeVisible({ timeout: T.short });
      await railButton.click();
      await expect(page.getByTestId('new-project-modal')).toBeVisible({ timeout: T.long });
      await expect(page.getByTestId('new-project-panel')).toBeVisible();
      return;
    } catch {
      // The rail did not open the modal; the Projects-view CTA below is the
      // fallback, and `entry-chrome-flows`' P1 asserts the rail item itself.
    }
  }
  await openProjectsEntryView(page);
  await dismissWhatsNewPopup(page);
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
    .getByText('Loading OpenDesign…')
    .waitFor({ state: 'hidden', timeout: T.long })
    .catch(() => {});
  await expect(page).toHaveURL(/\/projects\/?$/, { timeout: T.long });
  await expect(page.getByTestId('entry-view-projects')).toBeVisible({ timeout: T.long });
}
