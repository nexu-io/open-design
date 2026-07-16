import { expect } from '@playwright/test';
import type { Locator } from '@playwright/test';
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
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click();
  }
  await expect(page.locator('.entry')).toHaveClass(/entry--rail-open/);
  await expect(page.locator('.entry-nav-rail')).not.toHaveAttribute('aria-hidden', 'true');
}

export async function openNewProjectModal(page: Page): Promise<void> {
  if (await page.getByTestId('new-project-panel').isVisible().catch(() => false)) return;
  await ensureRailOpen(page);
  const railCreateButton = page.getByTestId('entry-nav-new-project');
  if (await railCreateButton.isVisible().catch(() => false)) {
    const point = await getActionablePoint(railCreateButton);
    if (point) {
      await page.mouse.click(point.x, point.y);
      await expect(page.getByTestId('new-project-modal')).toBeVisible();
      await expect(page.getByTestId('new-project-panel')).toBeVisible();
      return;
    }
  }

  const projectsNav = page.getByTestId('entry-nav-projects');
  if (await projectsNav.isVisible().catch(() => false)) {
    await projectsNav.scrollIntoViewIfNeeded();
    await projectsNav.click();
  } else if (!/\/projects$/.test(new URL(page.url()).pathname)) {
    await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  }
  const projectsView = page.getByTestId('entry-view-projects');
  await expect(projectsView).toBeVisible();
  const createButton = projectsView
    .getByTestId('designs-new-project')
    .or(projectsView.getByTestId('designs-empty-new-project'))
    .first();
  await expect(createButton).toBeVisible();
  await createButton.click();
  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}

async function getActionablePoint(locator: Locator): Promise<{ x: number; y: number } | null> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x > window.innerWidth ||
      point.y > window.innerHeight
    ) {
      return null;
    }
    const hit = document.elementFromPoint(point.x, point.y);
    return hit && element.contains(hit) ? point : null;
  }).catch(() => null);
}
