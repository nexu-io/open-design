import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * The entry nav rail is collapsed by default; its destinations
 * (`entry-nav-*`) only become interactable once the rail is expanded via the
 * topbar toggle. This helper is idempotent — when the rail is already docked
 * the toggle is hidden, so it no-ops. Call it before clicking any rail nav
 * item or asserting the rail/logo is visible.
 */
export async function ensureRailOpen(page: Page): Promise<void> {
  const toggle = page.getByTestId('entry-rail-toggle');
  // The toggle is only present while collapsed (it's display:none once docked).
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
  }
  await expect(page.locator('.entry-nav-rail')).toBeVisible();
}

export async function openNewProjectModal(page: Page): Promise<void> {
  if (await page.getByTestId('new-project-panel').isVisible().catch(() => false)) return;
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-projects').click();
  const projectsView = page.getByTestId('entry-view-projects');
  await expect(projectsView).toBeVisible();
  const toolbarButton = projectsView.getByTestId('designs-new-project');
  if (await toolbarButton.isVisible().catch(() => false)) {
    await toolbarButton.click();
  } else {
    await projectsView.getByTestId('designs-empty-new-project').click();
  }
  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}
