import { expect, test } from '@playwright/test';
import {
  captureVisual,
  configureVisualPage,
  gotoVisualHome,
  waitForVisualFonts,
  waitForVisualProjects,
} from '@/playwright/visual';

test('captures the visual home harness', async ({ page }) => {
  await configureVisualPage(page, { projects: [] });
  await gotoVisualHome(page);

  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
  await waitForVisualProjects(page, []);

  await captureVisual(page, 'visual-home');
});

test('captures the home plugin catalog surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await expect(page.getByTestId('recent-projects-strip')).toBeVisible();
  await expect(page.getByTestId('plugins-home-section')).toBeVisible();
  await expect(page.getByTestId('plugins-home-chip-saved')).toBeVisible();

  await captureVisual(page, 'visual-home-catalog');
});

test('captures the home plugin filtered surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('plugins-home-pill-category-deck').click();
  await expect(page.locator('article.plugins-home__card[data-plugin-id="visual-deck-writer"]')).toBeVisible();

  await captureVisual(page, 'visual-home-plugin-filter');
});

test('captures the home plugin detail surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('plugins-home-pill-category-deck').click();
  const card = page.locator('article.plugins-home__card[data-plugin-id="visual-deck-writer"]');
  await expect(card).toBeVisible();
  await card.hover();
  await page.getByTestId('plugins-home-details-visual-deck-writer').click({ force: true });
  await expect(page.getByRole('dialog', { name: /Deck Writer preview/i })).toBeVisible();
  await expect(page.getByTestId('plugin-details-use-visual-deck-writer')).toBeVisible();
  await expect(page.locator('.ds-modal-stage-iframe-scaler iframe')).toBeVisible();

  await captureVisual(page, 'visual-plugin-details');
});

test('captures the home context picker surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('home-hero-input').fill('@visual');
  await expect(page.getByTestId('home-hero-plugin-picker')).toBeVisible();
  await expect(page.getByRole('option', { name: /Prototype Starter/i })).toBeVisible();

  await captureVisual(page, 'visual-home-context-picker');
});

test('captures the new project modal surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('entry-nav-new-project').click();
  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await expect(page.getByTestId('new-project-name')).toBeVisible();

  await captureVisual(page, 'visual-new-project-modal');
});

test('captures the projects page surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('entry-nav-projects').click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await expect(page.getByText('Launchpad dashboard')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-projects');
});

test('captures the projects kanban surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('entry-nav-projects').click();
  await page.getByTestId('designs-view-kanban').click();
  await expect(page.getByTestId('designs-view-kanban')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Launchpad dashboard')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-projects-kanban');
});

test('captures the design systems page surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('entry-nav-design-systems').click();
  await expect(page).toHaveURL(/\/design-systems$/);
  await expect(page.getByTestId('design-systems-tab')).toBeVisible();
  await expect(page.getByTestId('design-system-card-agentic')).toBeVisible();
  await expect(page.getByTestId('design-system-card-airbnb')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-design-systems');
});

test('captures the plugins page surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('entry-nav-plugins').click();
  await expect(page).toHaveURL(/\/plugins$/);
  await expect(page.getByRole('heading', { name: 'Plugins', exact: true })).toBeVisible();
  await expect(page.getByTestId('plugins-tab-installed')).toBeVisible();
  await expect(page.getByText('Prototype Starter').first()).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-plugins');
});

test('captures the integrations page surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('entry-nav-integrations').click();
  await expect(page).toHaveURL(/\/integrations$/);
  await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();
  await expect(page.getByTestId('integrations-tab-connectors')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-integrations');
});

test('captures the integrations use everywhere surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('entry-nav-integrations').click();
  await page.getByTestId('integrations-tab-use-everywhere').click();
  await expect(page.getByTestId('integrations-tab-use-everywhere')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('CLI, HTTP, MCP').first()).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-integrations-use-everywhere');
});

test('captures the tasks page surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('entry-nav-tasks').click();
  await expect(page).toHaveURL(/\/automations$/);
  await expect(page.getByTestId('tasks-view')).toBeVisible();
  await expect(page.getByText('No automations yet')).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-tasks');
});

test('captures the topbar execution switcher surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('inline-model-switcher-chip').click();
  await expect(page.getByTestId('inline-model-switcher-popover')).toBeVisible();
  await expect(page.getByTestId('inline-model-switcher-mode-daemon')).toBeVisible();

  await captureVisual(page, 'visual-topbar-execution-switcher');
});

test('captures the avatar menu surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const menu = await openAvatarMenu(page);
  await expect(menu.getByRole('button', { name: /^Settings\b/i })).toBeVisible();

  await captureVisual(page, 'visual-avatar-menu');
});

test('captures the settings execution surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const menu = await openAvatarMenu(page);
  await menu.getByRole('button', { name: /^Settings\b/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('tab', { name: /Local CLI/i })).toBeVisible();
  await expect(dialog.getByRole('tablist', { name: 'Execution mode' })).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-settings-execution');
});

test('captures the settings BYOK surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);

  const menu = await openAvatarMenu(page);
  await menu.getByRole('button', { name: /^Settings\b/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('tab', { name: 'BYOK' }).click();
  await expect(dialog.getByRole('tablist', { name: 'API protocol' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Anthropic API' })).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-settings-byok');
});

async function openAvatarMenu(page: Parameters<typeof configureVisualPage>[0]) {
  await page.locator('.avatar-menu .settings-icon-btn').click();
  const menu = page.locator('.avatar-popover[role="menu"]');
  await expect(menu).toBeVisible();
  return menu;
}

async function gotoVisualWorkspace(page: Parameters<typeof configureVisualPage>[0]) {
  await page.getByTestId('recent-projects-strip').locator('[data-project-id]').first().click();
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
}
