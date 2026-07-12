import { expect, test } from '@/playwright/suite';
import { ensureRailOpen, openNewProjectModal } from '@/playwright/rail';
import { T } from '@/timeouts';
import {
  captureVisual,
  captureVisualTarget,
  configureVisualPage,
  gotoVisualHome,
  scrollVisualLocatorIntoStableView,
  VISUAL_AMR_AGENT,
  VISUAL_CLI_AGENTS,
  waitForVisualFonts,
  waitForVisualProjects,
} from '@/playwright/visual';

test('[P2] captures the onboarding cloud sign-in surface', async ({ page }) => {
  test.setTimeout(T.xlong);

  await configureVisualPage(page, {
    projects: [],
    agents: [VISUAL_AMR_AGENT, ...VISUAL_CLI_AGENTS],
    config: {
      onboardingCompleted: false,
    },
  });

  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.long });
  // The connect step opens on the cloud sign-in landing. Local CLI and BYOK
  // remain available as secondary paths from the same first screen.
  await expect(
    page.getByRole('heading', { name: /Sign in to Open Design|登录 Open Design/i }),
  ).toBeVisible({ timeout: T.medium });
  await expect(
    page.getByRole('button', { name: /Sign in to Open Design|登录 Open Design/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Local coding agent|本地 Coding Agent/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Bring your own key|自己的模型 Key/i }),
  ).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-onboarding-cloud');
});

test('[P2] captures the visual home harness', async ({ page }) => {
  await configureVisualPage(page, { projects: [] });
  await gotoVisualHome(page);

  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
  await waitForVisualProjects(page, []);

  await captureVisual(page, 'visual-home');
});

test('[P2] captures the home plugin catalog surface', async ({ page }) => {
  test.setTimeout(90_000);

  await configureVisualPage(page);
  const plugins = await openVisualPluginsCatalog(page);

  const catalog = plugins.locator('.plugin-marketplace__catalog');
  await expect(catalog).toBeVisible();
  await scrollVisualLocatorIntoStableView(page, catalog);
  await expect(pluginMarketplaceCard(plugins, 'Prototype Starter')).toBeVisible();
  await expect(pluginMarketplaceCard(plugins, 'Deck Writer')).toBeVisible();
  await expect(plugins.locator('.plugin-marketplace__search input')).toBeVisible();

  await captureVisual(page, 'visual-home-catalog');
});

test('[P2] captures the home plugin filtered surface', async ({ page }) => {
  await configureVisualPage(page);
  const plugins = await openVisualPluginsCatalog(page);

  await plugins.locator('.plugin-marketplace__search input').fill('Deck');
  await expect(pluginMarketplaceCard(plugins, 'Deck Writer')).toBeVisible();
  await expect(pluginMarketplaceCard(plugins, 'Prototype Starter')).toHaveCount(0);

  await captureVisual(page, 'visual-home-plugin-filter');
});

test('[P2] captures the home plugin detail surface', async ({ page }) => {
  await configureVisualPage(page);
  const plugins = await openVisualPluginsCatalog(page);

  const card = pluginMarketplaceCard(plugins, 'Prototype Starter');
  await expect(card).toBeVisible();
  await card.locator('.plugin-marketplace__more').click();
  await expect(card.locator('.plugin-marketplace__menu[role="menu"]')).toBeVisible();

  await captureVisual(page, 'visual-plugin-details');
});

test('[P2] captures the plugin detail share menu surface', async ({ page }) => {
  await configureVisualPage(page);
  const plugins = await openVisualPluginsCatalog(page);

  const card = pluginMarketplaceCard(plugins, 'Deck Writer');
  await expect(card).toBeVisible();
  const trigger = card.locator('.plugin-marketplace__more');
  await trigger.click();
  const popover = card.locator('.plugin-marketplace__menu[role="menu"]');
  await expect(popover).toBeVisible();

  await captureVisual(page, 'visual-plugin-share-menu');
  await captureVisualTarget(page, 'visual-plugin-share-menu-popover', [trigger, popover]);
});

test('[P2] captures the home context picker surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('home-hero-input').fill('@visual');
  const input = page.getByTestId('home-hero-input');
  const picker = page.getByTestId('home-hero-plugin-picker');
  await expect(picker).toBeVisible();
  await expect(page.getByRole('option', { name: /Prototype Starter/i })).toBeVisible();

  await captureVisual(page, 'visual-home-context-picker');
  await captureVisualTarget(page, 'visual-home-context-picker-popover', [input, picker]);
});

test('[P2] captures the home staged attachment surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await page.getByTestId('home-hero-file-input').setInputFiles({
    name: 'visual-brief.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Visual regression fixture for staged home attachments.\n', 'utf8'),
  });
  await expect(page.getByTestId('home-hero-staged-files')).toContainText('visual-brief.txt');

  await captureVisual(page, 'visual-home-staged-attachment');
});

test('[P2] captures the home plugin use staged surface', async ({ page }) => {
  await configureVisualPage(page);
  const plugins = await openVisualPluginsCatalog(page);

  await pluginMarketplaceCard(plugins, 'Prototype Starter').getByRole('button', { name: 'Try it' }).click();
  await expect(page.getByTestId('home-hero-active-plugin')).toContainText('Prototype Starter');
  await expect(page.getByTestId('home-hero-input')).toBeVisible();

  await captureVisual(page, 'visual-home-plugin-use-staged');
});

test('[P2] captures the home plugin use with query surface', async ({ page }) => {
  await configureVisualPage(page);
  const plugins = await openVisualPluginsCatalog(page);

  await plugins.locator('.plugin-marketplace__search input').fill('Deck');
  const card = pluginMarketplaceCard(plugins, 'Deck Writer');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Try it' }).click();
  await expect(page.getByTestId('home-hero-active-plugin')).toContainText('Deck Writer');
  await expect(page.getByTestId('home-hero-input')).toBeVisible();

  await captureVisual(page, 'visual-home-plugin-use-with-query');
});

test('[P2] captures the new project modal surface', async ({ page }) => {
  await configureVisualPage(page);
  await gotoVisualHome(page);

  await openNewProjectModal(page);
  await expect(page.getByTestId('new-project-name')).toBeVisible();

  await captureVisual(page, 'visual-new-project-modal');
});

async function openVisualPluginsCatalog(page: import('@playwright/test').Page) {
  await gotoVisualHome(page);
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-plugins').click();
  await expect(page).toHaveURL(/\/plugins$/);
  const plugins = page.getByTestId('entry-view-plugins');
  await expect(plugins.getByRole('heading', { name: 'Plugins', exact: true })).toBeVisible();
  return plugins;
}

function pluginMarketplaceCard(root: import('@playwright/test').Locator, title: string) {
  return root.locator('article.plugin-marketplace__item').filter({ hasText: title }).first();
}
