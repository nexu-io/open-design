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
  await expect(page.getByTestId('plugins-home-chip-featured')).toBeVisible();

  await captureVisual(page, 'visual-home-catalog');
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
