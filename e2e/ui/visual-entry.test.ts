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
    velaLoggedIn: false,
    config: {
      onboardingCompleted: false,
    },
  });

  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.long });
  // Execution-source selection is intentionally gated behind Cloud identity.
  // The signed-out landing exposes only the authentication action.
  await expect(
    page.getByRole('heading', { name: /Sign in to Open Design|登录 Open Design/i }),
  ).toBeVisible({ timeout: T.medium });
  await expect(
    page.getByRole('button', { name: /Sign in to Open Design|登录 Open Design/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Local coding agent|本地 Coding Agent/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /Bring your own key|自己的模型 Key/i }),
  ).toHaveCount(0);
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
  // #5517 removed Home's own plugin grid: `PluginsHomeSection` (and with it
  // `plugins-home-pill-category-*` / `plugins-home__card`) now lives only in
  // the unrendered legacy `PluginsView`; `EntryShell` mounts
  // `ExtensionsMarketplace` on /plugins instead. The journey this capture
  // exists for is unchanged — narrow the catalog, open the plugin's details,
  // Use it — and Use still hands the plugin to Home's hero, which is the
  // state being captured.
  const plugins = await openVisualPluginsCatalog(page);

  // Category chips are derived from the same `extractCategories` taxonomy the
  // old Home pills used, so the fixture still lands under Prototype; the chips
  // carry no per-slug testid, only the taxonomy's `Prototype` label.
  await plugins
    .getByTestId('plugins-category-tags')
    .getByRole('button', { name: 'Prototype', exact: true })
    .click();
  // The filter has to really bite: Deck Writer is the deck-mode fixture.
  await expect(pluginMarketplaceCard(plugins, 'Deck Writer')).toHaveCount(0);

  const card = plugins.getByTestId('plugins-card-visual-prototype-starter');
  await expect(card).toBeVisible();
  // The row's own "Try it" button stops propagation, so target the row body —
  // clicking the card anywhere else is what opens the plugin's details.
  await card.locator('.plugin-marketplace__row-main').click();
  // #5517 turned plugin details into a full-page route: `openCardDetail` calls
  // navigate({ kind: 'marketplace-detail' }) for plugin records, so the details
  // surface is `PluginDetailView` at /marketplace/<id> — not a role="dialog"
  // overlay — and its Use control is the single `plugin-detail-use` button
  // rather than a per-slug `plugin-details-use-<id>` menu item.
  // Assert on the Use control rather than the `plugin-detail` shell: the shell
  // also renders for the loading and load-failed states, so it would go green
  // on a detail that never resolved.
  await expect(page).toHaveURL(/\/marketplace\/visual-prototype-starter$/);
  const usePlugin = page.getByTestId('plugin-detail-use');
  await expect(usePlugin).toBeVisible();
  await usePlugin.click();
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
  test.setTimeout(T.xlong);

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
  // The view renders `entry.navPlugins`: #5517 briefly called this surface
  // 扩展/Extensions, then reverted to 插件/Plugins to match the @-mention picker.
  await expect(plugins.getByRole('heading', { name: 'Plugins', exact: true })).toBeVisible();
  // The marketplace opens on the 官方 scope, which is fed by `/api/marketplaces`
  // — empty in this harness. The visual fixture plugins are user-installed, so
  // switch to 个人; it is also the only scope whose cards carry the per-card
  // overflow menu (share / unshare / uninstall) the menu captures need.
  await plugins.getByTestId('plugins-tab-installed').click();
  return plugins;
}

function pluginMarketplaceCard(root: import('@playwright/test').Locator, title: string) {
  return root.locator('article.plugin-marketplace__item').filter({ hasText: title }).first();
}
