import { expect, test } from '@/playwright/suite';
import { ensureRailOpen, openNewProjectModal } from '@/playwright/rail';
import { T } from '@/timeouts';
import {
  captureVisual,
  captureVisualTarget,
  configureVisualPage,
  gotoVisualHome,
  mockSignedInVelaAccount,
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
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });
  // Cloud stays primary while identity-independent Local Agent and BYOK setup
  // remain available directly from the signed-out landing.
  await expect(
    page.getByRole('heading', { name: /Sign in to OpenDesign|登录 OpenDesign/i }),
  ).toBeVisible({ timeout: T.medium });
  await expect(
    page.getByRole('button', { name: /Sign in to OpenDesign|登录 OpenDesign/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Local (coding )?agent|本地 (Coding )?Agent/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Bring your own key|使用自己的 Key|自己的模型 Key/i }),
  ).toBeVisible();
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-onboarding-cloud');
});

// The step past sign-in had no baseline at all, so the one surface whose whole
// job is to line up a two-column grid of detected CLIs was invisible to the
// visual suite. `visual-avatar-local-agent-list` covers the avatar menu's agent
// list — a different component — and stayed 0px through an alignment change to
// this one.
test('[P2] captures the onboarding Local Agent CLI list surface', async ({ page }) => {
  test.setTimeout(T.xlong);

  await configureVisualPage(page, {
    projects: [],
    agents: [VISUAL_AMR_AGENT, ...VISUAL_CLI_AGENTS],
    config: {
      onboardingCompleted: false,
    },
  });
  await mockSignedInVelaAccount(page);

  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });

  await page
    .getByRole('button', { name: /Continue \(signed in\)|继续（已登录）/i })
    .click();
  await expect(
    page.getByRole('heading', { name: /Choose your model source|选择模型来源/i }),
  ).toBeVisible({ timeout: T.medium });
  await page.getByRole('radio', { name: /Local Agent|本地 Agent/i }).click();
  await page.getByRole('button', { name: /^(Continue|继续)$/ }).click();

  const panel = page.locator('.onboarding-view__setup-panel');
  await expect(panel).toBeVisible({ timeout: T.medium });
  const chips = page.locator('.onboarding-view__agent-chip');
  // More than one chip is the point: a single card cannot show whether the
  // column shares an alignment line.
  await expect(chips.first()).toBeVisible();
  expect(await chips.count()).toBeGreaterThan(1);
  // The panel validates the selected agent on its own, so its status line is
  // part of the surface being archived. Let that settle first, or the capture
  // races the transient "testing" copy.
  await expect(panel.locator('.onboarding-view__test-status.is-success')).toBeVisible({
    timeout: T.medium,
  });
  await waitForVisualFonts(page);

  await captureVisual(page, 'visual-onboarding-local-agent');
  await captureVisualTarget(page, 'visual-onboarding-local-agent-panel', panel);
});

test('[P2] captures the visual home harness', async ({ page }) => {
  await configureVisualPage(page, { projects: [] });
  await gotoVisualHome(page);

  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
  await waitForVisualProjects(page, []);

  await captureVisual(page, 'visual-home');
});

test('[P2] captures the unpaid DeepSeek campaign at narrow and short viewport boundaries', async ({ page }) => {
  test.setTimeout(T.xlong);

  await page.clock.setFixedTime('2026-08-21T00:00:00+08:00');
  await page.setViewportSize({ width: 600, height: 720 });
  await configureVisualPage(page, { projects: [] });
  await mockSignedInVelaAccount(page, { plan: 'free' });
  await gotoVisualHome(page);
  // Functional specs seed campaign dismissals globally so marketing surfaces
  // cannot interrupt unrelated flows. This visual contract deliberately opts
  // back into the DeepSeek modal after establishing same-origin storage.
  await page.evaluate(() => {
    window.localStorage.removeItem('open-design:campaign-seen:deepseek-v4-dual-unlimited-2026');
  });
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-community').evaluate((element: HTMLButtonElement) => {
    element.click();
  });
  await expect(page.getByTestId('entry-view-home')).toHaveAttribute('data-active', 'false');
  await page.getByTestId('entry-nav-home').evaluate((element: HTMLButtonElement) => {
    element.click();
  });

  const dialog = page.getByTestId('deepseek-v4-flash-campaign-dialog');
  const close = page.getByRole('button', { name: 'Close' });
  const cta = page.getByRole('button', { name: 'Upgrade and use' });
  await expect(dialog).toBeVisible();
  await expect(close).toBeVisible();
  await expect(cta).toBeVisible();
  await expectInsideViewport(page, dialog);
  await expectInsideViewport(page, close);
  await expectInsideViewport(page, cta);
  await captureVisual(page, 'visual-deepseek-unpaid-campaign-600');

  await page.setViewportSize({ width: 760, height: 400 });
  await expect(close).toBeVisible();
  await expectInsideViewport(page, dialog);
  await expectInsideViewport(page, close);
  await expect.poll(async () => dialog.evaluate((element) => (
    element.scrollHeight > element.clientHeight
  ))).toBe(true);
  await captureVisual(page, 'visual-deepseek-unpaid-campaign-short-height');
  await cta.scrollIntoViewIfNeeded();
  await expect(cta).toBeVisible();
  await expectInsideViewport(page, cta);
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

test('[P2] plugin detail owns vertical scrolling inside the fixed workspace shell', async ({ page }) => {
  await configureVisualPage(page);
  const plugins = await openVisualPluginsCatalog(page);
  // Navigate with the standard visual viewport; shrink only the detail page so
  // the assertion owns the detail scroller rather than the responsive nav.
  await page.setViewportSize({ width: 960, height: 600 });

  const card = plugins.getByTestId('plugins-card-visual-prototype-starter');
  await expect(card).toBeVisible();
  await card.locator('.plugin-marketplace__row-main').click();
  await expect(page).toHaveURL(/\/marketplace\/visual-prototype-starter$/);

  const detail = page.locator('.plugin-suite-detail');
  await expect(detail).toBeVisible();
  await expect(detail).toHaveCSS('overflow-y', 'auto');
  const before = await detail.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
  expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);
  expect(before.scrollTop).toBe(0);

  await detail.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await expect.poll(() => detail.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
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
  // The lead chip cuts the title to eight code points (#7635).
  await expect(page.getByTestId('home-hero-active-plugin')).toContainText('Prototyp…');
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
  await expect(page.getByTestId('home-hero-active-plugin')).toContainText('Deck Wri…');
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

async function expectInsideViewport(
  page: import('@playwright/test').Page,
  locator: import('@playwright/test').Locator,
): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  await expect.poll(async () => {
    const box = await locator.boundingBox();
    if (!box || !viewport) return null;
    return {
      left: Math.max(0, -box.x),
      top: Math.max(0, -box.y),
      right: Math.max(0, box.x + box.width - (viewport.width + 1)),
      bottom: Math.max(0, box.y + box.height - (viewport.height + 1)),
    };
  }, {
    message: 'expected locator bounds to settle inside the viewport',
    timeout: T.short,
  }).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
}
