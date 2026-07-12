import { expect, test } from '@/playwright/suite';
import { ensureRailOpen } from '@/playwright/rail';
import {
  captureVisual,
  configureVisualPage,
  gotoVisualHome,
  waitForVisualFonts,
} from '@/playwright/visual';

test('[P2] captures the projects page surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await ensureRailOpen(page);
  const legacyProjectsNav = page.getByTestId('entry-nav-projects');
  const teamProjectsNav = page.getByTestId('entry-nav-all-projects');
  if (await legacyProjectsNav.isVisible().catch(() => false)) {
    await legacyProjectsNav.click();
    await expect(page).toHaveURL(/\/projects$/);
    const projects = page.getByTestId('entry-view-projects');
    await expect(projects.getByRole('heading', { name: 'Projects' })).toBeVisible();
    await expect(projects.getByText('Launchpad dashboard').first()).toBeVisible();
  } else {
    if (await teamProjectsNav.isVisible().catch(() => false)) {
      await teamProjectsNav.click();
      await expect(page.getByRole('heading', { name: /all projects|全部项目/i })).toBeVisible();
    } else {
      await expect(page.getByTestId('recent-projects-strip')).toBeVisible();
      await expect(page.getByText('Launchpad dashboard').first()).toBeVisible();
    }
  }
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-projects');
});

test('[P2] captures the projects kanban surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await ensureRailOpen(page);
  const legacyProjectsNav = page.getByTestId('entry-nav-projects');
  const teamProjectsNav = page.getByTestId('entry-nav-all-projects');
  if (await legacyProjectsNav.isVisible().catch(() => false)) {
    await legacyProjectsNav.click();
    const projects = page.getByTestId('entry-view-projects');
    await projects.getByTestId('designs-view-kanban').click();
    await expect(projects.getByTestId('designs-view-kanban')).toHaveAttribute('aria-pressed', 'true');
    await expect(projects.getByText('Launchpad dashboard').first()).toBeVisible();
  } else {
    if (await teamProjectsNav.isVisible().catch(() => false)) {
      await teamProjectsNav.click();
      await expect(page.getByRole('heading', { name: /all projects|全部项目/i })).toBeVisible();
    } else {
      await expect(page.getByTestId('recent-projects-strip')).toBeVisible();
      await expect(page.getByText('Launchpad dashboard').first()).toBeVisible();
    }
  }
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-projects-kanban');
});

test('[P2] captures the design systems page surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-design-systems').click();
  await expect(page).toHaveURL(/\/design-systems$/);
  await expect(page.getByTestId('design-systems-tab')).toBeVisible();
  await page.getByRole('tab', { name: 'Official presets' }).click();
  await expect(page.getByTestId('design-system-card-agentic')).toBeVisible();
  await expect(page.getByTestId('design-system-card-airbnb')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-design-systems');
});

test('[P2] captures the design system detail preview surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-design-systems').click();
  await page.getByRole('tab', { name: 'Official presets' }).click();
  await page.getByTestId('design-system-card-agentic').click();
  const detail = page.getByTestId('design-system-detail-agentic');
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId('design-kit-view-agentic')).toBeVisible();
  await expect(detail.getByTestId('design-kit-logo-section')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-design-system-detail');
});

test('[P2] captures the plugins page surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-plugins').click();
  await expect(page).toHaveURL(/\/plugins$/);
  const plugins = page.getByTestId('entry-view-plugins');
  await expect(plugins.getByRole('heading', { name: 'Plugins', exact: true })).toBeVisible();
  await expect(plugins.getByTestId('plugins-tab-installed')).toBeVisible();
  await expect(plugins.getByText('Prototype Starter').first()).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-plugins');
});

test('[P2] captures the integrations page surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  const dialog = await openSettingsSection(page, 'settings-nav-connectors');
  await expect(dialog.getByTestId('connector-grid-wrap')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-integrations');
});

test('[P2] captures the integrations use everywhere surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  const dialog = await openSettingsSection(page, 'settings-nav-execution');
  await expect(dialog.getByRole('tablist', { name: /Execution mode/i })).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-integrations-use-everywhere');
});

test('[P2] captures the integrations MCP surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  const dialog = await openSettingsSection(page, 'settings-nav-connectors');
  await expect(dialog.getByText(/Composio|Connectors/i).first()).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-integrations-mcp');
});

test('[P2] captures the tasks page surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await ensureRailOpen(page);
  const tasksNav = page.getByTestId('entry-nav-tasks');
  test.skip(!(await tasksNav.isVisible().catch(() => false)), 'Tasks navigation is not present in the current entry shell.');
  await tasksNav.click();
  await expect(page).toHaveURL(/\/automations$/);
  await expect(page.getByTestId('tasks-view')).toBeVisible();
  await expect(page.getByText('No automations yet')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-tasks');
});

async function openSettingsSection(page: import('@playwright/test').Page, testId: string) {
  const settingsButton = page.getByTestId('entry-settings-button');
  await expect(settingsButton).toBeVisible();
  await settingsButton.evaluate((element: HTMLElement) => element.click());
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId(testId).click();
  return dialog;
}
