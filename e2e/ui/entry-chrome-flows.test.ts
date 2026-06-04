import { expect, test } from '@playwright/test';
import { ensureRailOpen } from '@/playwright/rail';
import type { Page, Request } from '@playwright/test';
import { applyStandardMocks, fulfillAgentsRoute, STORAGE_KEY } from '@/playwright/mock-factory';
const LOCAL_CLI_LABEL = /Local CLI|本机 CLI|本地 CLI/i;
const STARTER_PLUGIN = makeStarterPlugin({
  id: 'localized-plugin',
  title: 'Localized Plugin',
  mode: 'prototype',
  featured: true,
  query: 'Make a {{topic}} brief.',
  inputs: [{ name: 'topic', type: 'string', default: 'design systems' }],
});
const STARTER_PLUGINS = [
  STARTER_PLUGIN,
  makeStarterPlugin({
    id: 'deck-writer',
    title: 'Deck Writer',
    mode: 'deck',
    query: 'Draft a {{topic}} deck.',
    inputs: [{ name: 'topic', type: 'string', default: 'quarterly review' }],
  }),
  makeStarterPlugin({
    id: 'hyperframes-video',
    title: 'Hyperframes Video',
    mode: 'video',
    featured: true,
    tags: ['hyperframes'],
    query: 'Create a {{topic}} video.',
    inputs: [{ name: 'topic', type: 'string', default: 'product teaser' }],
  }),
  makeStarterPlugin({
    id: 'figma-importer',
    title: 'Figma Importer',
    taskKind: 'figma-migration',
    description: 'Import a Figma file into a project.',
  }),
] as const;
const DESIGN_SYSTEMS = [
  {
    id: 'agentic',
    title: 'Agentic',
    category: 'Productivity & SaaS',
    summary: 'Conversational AI-first interface with minimal controls.',
    surface: 'web',
    swatches: ['#ff5a1f', '#111827'],
  },
  {
    id: 'airbnb',
    title: 'Airbnb',
    category: 'E-Commerce & Retail',
    summary: 'Travel marketplace with warm coral accents.',
    surface: 'web',
    swatches: ['#a3165b', '#ff385c'],
  },
  {
    id: 'motion-poster',
    title: 'Motion Poster',
    category: 'Design & Creative',
    summary: 'Motion-first visual system for video concepts.',
    surface: 'video',
    swatches: ['#111827', '#38bdf8'],
  },
] as const;

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
});

test('[P0] entry chrome exposes the primary home creation surface and settings entry', async ({ page }) => {
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.continue();
  });

  await gotoEntryHome(page);
  await expect(page.getByTestId('entry-star-badge')).toBeVisible();
  await expect(page.getByTestId('entry-use-everywhere-button')).toBeVisible();
  await expect(page.getByTestId('recent-projects-strip')).toHaveCount(0);
  // The nav rail is collapsed by default — only the topbar toggle shows.
  // Expand it to assert the rail and its logo are reachable.
  await expect(page.getByTestId('entry-rail-toggle')).toBeVisible();
  await page.getByTestId('entry-rail-toggle').click();
  await expect(page.locator('.entry-nav-rail')).toBeVisible();
  await expect(page.getByTestId('entry-nav-logo')).toBeVisible();
  await expect(page.locator('.entry-brand')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
  await expect(page.getByTestId('home-hero-attach')).toBeVisible();
  await expect(page.getByTestId('home-hero-submit')).toBeDisabled();
  const createTabs = page.getByTestId('home-hero-type-tabs');
  await expect(createTabs).toBeVisible();
  await expect(page.getByTestId('home-hero-rail-prototype')).toBeVisible();
  await expect(page.getByTestId('home-hero-rail-live-artifact')).toBeVisible();
  await expect(page.getByTestId('home-hero-rail-deck')).toBeVisible();
  await expect(page.getByTestId('home-hero-rail-image')).toBeVisible();
  await expect(page.getByTestId('home-hero-rail-video')).toBeVisible();
  await expect(page.getByTestId('home-hero-rail-hyperframes')).toBeVisible();
  await expect(page.getByTestId('home-hero-rail-audio')).toBeVisible();

  // The pet picker rail was removed; pet adoption now lives in
  // Settings → Pet exclusively. Make sure no rail leaks back into the
  // entry layout.
  await expect(page.locator('.pet-rail')).toHaveCount(0);

  await page.getByTestId('entry-settings-menu-trigger').click();
  await page.getByTestId('entry-settings-open-details').click();
  const settingsDialog = page.getByRole('dialog');
  await expect(settingsDialog).toBeVisible();
  await expect(settingsDialog.getByRole('heading', { name: 'Execution mode' })).toBeVisible();
  await expect(settingsDialog.getByRole('button', { name: /hide pet picker/i })).toHaveCount(0);
  await expect(settingsDialog.getByRole('button', { name: /show pet picker/i })).toHaveCount(0);
});

test('[P1] entry top navigation matches the current home tab structure', async ({ page }) => {
  await gotoEntryHome(page);
  await ensureRailOpen(page);

  await expect(page.getByTestId('entry-nav-logo')).toBeVisible();
  await expect(page.getByTestId('entry-nav-home')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('entry-nav-new-project')).toBeVisible();
  await expect(page.getByTestId('entry-nav-projects')).toBeVisible();
  await expect(page.getByTestId('entry-nav-tasks')).toBeVisible();
  await expect(page.getByTestId('entry-nav-design-systems')).toBeVisible();
  await expect(page.locator('.entry-nav-rail__group').getByTestId('entry-nav-plugins')).toBeVisible();
  await expect(page.locator('.entry-nav-rail__group').getByTestId('entry-nav-integrations')).toBeVisible();
  await expect(page.locator('.entry-nav-rail__footer').getByTestId('entry-nav-plugins')).toHaveCount(0);
  await expect(page.locator('.entry-nav-rail__footer').getByTestId('entry-nav-integrations')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-type-tabs')).toBeVisible();
  await expect(page.getByTestId('home-hero-active-type-chip')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-rail-prototype')).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByTestId('home-hero-footer-options')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-plugin-presets')).toHaveCount(0);
  await expect(page.getByTestId('plugins-home-pill-category-all')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('plugins-home-pill-category-prototype')).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByTestId('plugins-home-row-subcategory-prototype')).toHaveCount(0);
});

test('[P1] home view exposes the redesigned hero, recent projects, and starters', async ({ page }) => {
  await createProject(page, 'Home structure recent project');
  await gotoEntryHome(page);

  // The redesigned entry shell keeps every view mounted (only the active one
  // is visible), so `plugins-home-section` exists in both the home and plugins
  // views; scope the lookup to the home view to keep the locator unambiguous.
  const home = page.getByTestId('entry-view-home');
  await expect(page.getByTestId('recent-projects-strip')).toBeVisible();
  await expect(page.getByTestId('recent-projects-view-all')).toBeVisible();
  await expect(home.getByTestId('plugins-home-section')).toBeVisible();
  await expect(home.getByTestId('plugins-home-browse-registry')).toBeVisible();
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('entry-nav-home')).toHaveAttribute('aria-current', 'page');

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-projects').click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByTestId('entry-nav-projects')).toHaveAttribute('aria-current', 'page');
});

test('[P0] recent projects strip opens a project card and view all routes to the projects index', async ({ page }) => {
  const created = await createProject(page, 'Recent project entry point');
  await gotoEntryHome(page);

  const recentStrip = page.getByTestId('recent-projects-strip');
  await expect(recentStrip).toBeVisible();
  await recentStrip.locator(`[data-project-id="${created.project.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${created.project.id}`));

  await gotoEntryHome(page);
  await page.getByTestId('recent-projects-view-all').click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByTestId('entry-nav-projects')).toHaveAttribute('aria-current', 'page');
});

test('[P1] design systems page is reachable from entry nav and supports search, preview, and default selection', async ({ page }) => {
  const persistedConfigs: Array<{ designSystemId?: string | null }> = [];
  await routeDesignSystems(page);
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as { designSystemId?: string | null };
      persistedConfigs.push(body);
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          config: {
            onboardingCompleted: true,
            agentId: 'mock',
            skillId: null,
            designSystemId: 'agentic',
            agentModels: {},
            privacyDecisionAt: 1,
            telemetry: { metrics: false, content: false, artifactManifest: false },
          },
        },
      });
      return;
    }
    await route.continue();
  });

  await gotoEntryHome(page);
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-design-systems').click();

  await expect(page).toHaveURL(/\/design-systems$/);
  await expect(page.getByTestId('entry-nav-design-systems')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Design systems' })).toBeVisible();
  await expect(page.getByTestId('design-systems-tab')).toBeVisible();
  await page.getByRole('tab', { name: 'Official presets' }).click();
  await expect(page.getByTestId('design-system-card-agentic')).toBeVisible();
  await expect(page.getByTestId('design-system-card-agentic')).toContainText(/default/i);
  await expect(page.getByTestId('design-system-card-airbnb')).toBeVisible();

  await page.getByTestId('design-systems-search').fill('air');
  await expect(page.getByTestId('design-system-card-airbnb')).toBeVisible();
  await expect(page.getByTestId('design-system-card-agentic')).toHaveCount(0);
  await page.getByTestId('design-systems-search').fill('no matching system');
  await expect(page.getByTestId('design-systems-empty')).toBeVisible();
  await page.getByTestId('design-systems-search').fill('');

  await page.getByTestId('design-systems-surface-video').click();
  await expect(page.getByTestId('design-system-card-motion-poster')).toBeVisible();
  await expect(page.getByTestId('design-system-card-agentic')).toHaveCount(0);
  await page.getByTestId('design-systems-surface-all').click();

  await page.getByTestId('design-system-preview-airbnb').click();
  const preview = page.getByRole('dialog', { name: /Airbnb preview/i });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('tab', { name: /showcase/i })).toHaveAttribute('aria-selected', 'true');
  await expect(preview.getByRole('tab', { name: /tokens/i })).toBeVisible();
  await expect(preview.getByRole('button', { name: 'DESIGN.md', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);

  await page.getByTestId('design-system-select-airbnb').click();
  await expect(page.getByTestId('design-system-card-airbnb')).toContainText(/default/i);
  await expect
    .poll(() => persistedConfigs.at(-1)?.designSystemId)
    .toBe('airbnb');
});

test('[P2] entry chrome avoids horizontal overflow on compact desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await gotoEntryHome(page);
  await expect(page.locator('.entry-main__topbar')).toBeVisible();

  const { pageOverflow, topbarOverflow } = await page.evaluate(() => {
    const topbar = document.querySelector('.entry-main__topbar');
    return {
      pageOverflow: Math.max(
        0,
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      topbarOverflow:
        topbar instanceof HTMLElement
          ? Math.max(0, topbar.scrollWidth - topbar.clientWidth)
          : null,
    };
  });

  expect(topbarOverflow).not.toBeNull();
  expect(topbarOverflow!).toBeLessThanOrEqual(2);
  expect(pageOverflow).toBeLessThanOrEqual(2);
});

test('[P0] entry execution pill opens the Local CLI and BYOK switcher from Home', async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'codex',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: { codex: { model: 'default' } },
        privacyDecisionAt: 1,
        telemetry: { metrics: false, content: false, artifactManifest: false },
      }),
    );
  }, STORAGE_KEY);
  await page.route('**/api/agents**', async (route) => {
    await fulfillAgentsRoute(route, [
      {
        id: 'claude',
        name: 'Claude Code',
        bin: 'claude',
        available: true,
        version: '1.0.0',
        models: [{ id: 'default', label: 'Default' }],
      },
      {
        id: 'codex',
        name: 'Codex CLI',
        bin: 'codex',
        available: true,
        version: '0.80.0',
        models: [{ id: 'default', label: 'Default' }],
      },
      {
        id: 'opencode',
        name: 'OpenCode',
        bin: 'opencode',
        available: true,
        version: '0.5.0',
        models: [{ id: 'default', label: 'Default' }],
      },
      {
        id: 'hermes',
        name: 'Hermes',
        bin: 'hermes',
        available: true,
        version: '0.5.0',
        models: [{ id: 'default', label: 'Default' }],
      },
      {
        id: 'cursor-agent',
        name: 'Cursor Agent',
        bin: 'cursor-agent',
        available: true,
        version: '0.5.0',
        models: [{ id: 'default', label: 'Default' }],
      },
    ]);
  });
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        config: {
          onboardingCompleted: true,
          agentId: 'codex',
          skillId: null,
          designSystemId: null,
          agentModels: { codex: { model: 'default' } },
          privacyDecisionAt: 1,
          telemetry: { metrics: false, content: false, artifactManifest: false },
        },
      },
    });
  });

  await gotoEntryHome(page);

  const pill = page.getByTestId('inline-model-switcher-chip');
  await expect(pill).toContainText(LOCAL_CLI_LABEL);
  await expect(pill).toContainText('Codex CLI');
  await pill.click();

  const popover = page.getByTestId('inline-model-switcher-popover');
  await expect(popover).toBeVisible();
  await expect(page.getByTestId('inline-model-switcher-mode-daemon')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('inline-model-switcher-mode-api')).toBeVisible();
  await expect(page.getByTestId('inline-model-switcher-agent-claude')).toBeVisible();
  await expect(page.getByTestId('inline-model-switcher-agent-codex')).toBeVisible();
  await expect(page.getByTestId('inline-model-switcher-agent-opencode')).toBeVisible();
  await expect(page.getByTestId('inline-model-switcher-agent-hermes')).toBeVisible();
  await expect(page.getByTestId('inline-model-switcher-agent-cursor-agent')).toBeVisible();

  await page.getByTestId('inline-model-switcher-open-settings').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('tab', { name: LOCAL_CLI_LABEL })).toBeVisible();
});

test('[P2] entry help menu exposes community links and topbar routes Use everywhere', async ({ page }) => {
  await gotoEntryHome(page);

  // The help launcher lives in the (collapsed-by-default) rail footer.
  await ensureRailOpen(page);
  await page.getByTestId('entry-help-trigger').click();
  const menu = page.locator('.entry-help-popover[role="menu"]');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Follow @nexudotio on X/i })).toHaveAttribute(
    'href',
    'https://x.com/nexudotio',
  );
  await expect(menu.getByRole('menuitem', { name: /Join Discord/i })).toHaveAttribute(
    'href',
    'https://discord.gg/mHAjSMV6gz',
  );

  await page.getByTestId('entry-use-everywhere-button').click();
  await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();
  await expect(page.getByTestId('integrations-tab-use-everywhere')).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await ensureRailOpen(page);
  // Return home via the explicit Home nav (the logo is overlaid by the
  // collapse button on hover, which would intercept the click).
  await page.getByTestId('entry-nav-home').click();
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await page.getByTestId('entry-help-trigger').click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('[P2] home topbar overlays close on outside click, Escape, and Settings open', async ({ page }) => {
  await gotoEntryHome(page);

  const pill = page.getByTestId('inline-model-switcher-chip');
  const executionPopover = page.getByTestId('inline-model-switcher-popover');

  await pill.click();
  await expect(executionPopover).toBeVisible();

  // The settings entry is a menu; opening it dismisses the execution popover,
  // and its "Settings" item opens the full dialog.
  await page.getByTestId('entry-settings-menu-trigger').click();
  await expect(executionPopover).toHaveCount(0);
  await page.getByTestId('entry-settings-open-details').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await pill.click();
  await expect(executionPopover).toBeVisible();

  await page.getByTestId('home-hero').click();
  await expect(executionPopover).toHaveCount(0);

  await pill.click();
  await expect(executionPopover).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(executionPopover).toHaveCount(0);
});

test('[P1] entry execution pill remains available across secondary entry pages', async ({ page }) => {
  await routeDesignSystems(page);
  await gotoEntryHome(page);

  const destinations = [
    { nav: 'entry-nav-projects', heading: 'Projects' },
    { nav: 'entry-nav-tasks', heading: 'Automations' },
    { nav: 'entry-nav-plugins', heading: 'Plugins' },
    { nav: 'entry-nav-design-systems', heading: 'Design systems' },
    { nav: 'entry-nav-integrations', heading: 'Integrations' },
  ];

  for (const destination of destinations) {
    await ensureRailOpen(page);
    await page.getByTestId(destination.nav).click();
    await expect(
      page.locator('h1').filter({ hasText: destination.heading }).first(),
    ).toBeVisible();

    const pill = page.getByTestId('inline-model-switcher-chip');
    await expect(pill).toBeVisible();
    await pill.click();
    await expect(page.getByTestId('inline-model-switcher-popover')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('inline-model-switcher-popover')).toHaveCount(0);
  }
});

test('[P1] home starters can browse registry and use a starter query from Home', async ({ page }) => {
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({
      json: {
        plugins: [STARTER_PLUGIN],
      },
    });
  });

  await gotoEntryHome(page);
  await expect(page.getByTestId('plugins-home-browse-registry')).toBeVisible();
  await page.getByTestId('plugins-home-browse-registry').click();
  await expect(page).toHaveURL(/\/plugins$/);
  await expect(page.getByTestId('entry-nav-plugins')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('h1').filter({ hasText: 'Plugins' })).toBeVisible();
  await expect(page.getByTestId('plugins-tab-installed')).toBeVisible();
  await expect(page.getByTestId('plugins-tab-available')).toBeVisible();
  await expect(page.getByTestId('plugins-tab-sources')).toBeVisible();
  await expect(page.getByTestId('plugins-create-button')).toBeVisible();
  await expect(page.getByTestId('plugins-import-button')).toBeVisible();

  await ensureRailOpen(page);
  // Return home via the explicit Home nav (the logo is overlaid by the
  // collapse button on hover, which would intercept the click).
  await page.getByTestId('entry-nav-home').click();
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('plugins-home-use-menu-localized-plugin')).toBeVisible();
  await page.getByTestId('plugins-home-use-menu-localized-plugin').click({ force: true });
  await page.getByTestId('plugins-home-use-with-query-localized-plugin').click();

  const input = page.getByTestId('home-hero-input');
  await expect(input).toHaveText('Make a design systems brief.');
});

test('[P2] home starters shows the empty catalog state when no plugins are available', async ({ page }) => {
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({
      json: {
        plugins: [],
      },
    });
  });

  await gotoEntryHome(page);
  // `plugins-home-section` is rendered in both the home and plugins views (both
  // stay mounted), so scope to the home view to keep the locator unambiguous.
  await expect(page.getByTestId('entry-view-home').getByTestId('plugins-home-section')).toContainText(
    'Catalog is empty.',
  );
});

test('[P2] home starters search and facet filters narrow the visible gallery', async ({ page }) => {
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({
      json: {
        plugins: STARTER_PLUGINS,
      },
    });
  });

  await gotoEntryHome(page);

  await expect(page.getByTestId('plugins-home-chip-saved')).toBeVisible();
  await expect(page.getByTestId('plugins-home-chip-saved')).toContainText('0');
  await expect(page.getByTestId('plugins-home-pill-category-all')).toContainText('4');

  await page.getByTestId('plugins-home-pill-category-deck').click();
  await expect(page.locator('[data-plugin-id="deck-writer"]')).toBeVisible();
  await expect(page.locator('[data-plugin-id="figma-importer"]')).toHaveCount(0);
  await expect(page.locator('[data-plugin-id="localized-plugin"]')).toHaveCount(0);
  await expect(page.locator('[data-plugin-id="hyperframes-video"]')).toHaveCount(0);

  await page.getByTestId('plugins-home-pill-category-all').click();
  await expect(page.locator('[data-plugin-id="figma-importer"]')).toBeVisible();
  await expect(page.locator('[data-plugin-id="localized-plugin"]')).toBeVisible();
  await expect(page.locator('[data-plugin-id="hyperframes-video"]')).toBeVisible();
  await expect(page.locator('[data-plugin-id="deck-writer"]')).toBeVisible();

  const search = page.getByTestId('plugins-home-search');
  await search.fill('Deck Writer');
  await expect(page.locator('[data-plugin-id="deck-writer"]')).toBeVisible();
  await expect(page.locator('[data-plugin-id="localized-plugin"]')).toHaveCount(0);
  await expect(page.locator('[data-plugin-id="hyperframes-video"]')).toHaveCount(0);
  await page.getByTestId('plugins-home-search-clear').click();

  await page.getByTestId('plugins-home-save-localized-plugin').click();
  await page.getByTestId('plugins-home-save-hyperframes-video').click();
  await expect(page.getByTestId('plugins-home-chip-saved')).toContainText('2');
  await page.getByTestId('plugins-home-chip-saved').click();
  await expect(page.locator('[data-plugin-id="localized-plugin"]')).toBeVisible();
  await expect(page.locator('[data-plugin-id="hyperframes-video"]')).toBeVisible();
  await expect(page.locator('[data-plugin-id="deck-writer"]')).toHaveCount(0);
  await expect(page.locator('[data-plugin-id="figma-importer"]')).toHaveCount(0);
});

test('[P1] home starters can jump into plugin creation through the registry browse flow', async ({ page }) => {
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({
      json: {
        plugins: STARTER_PLUGINS,
      },
    });
  });

  await gotoEntryHome(page);
  await page.getByTestId('plugins-home-browse-registry').click();
  await expect(page).toHaveURL(/\/plugins$/);
  await expect(page.locator('h1').filter({ hasText: 'Plugins' })).toBeVisible();
  await page.getByTestId('plugins-create-button').click();

  await expect(page.getByTestId('home-hero-input')).toHaveText(/Create an Open Design plugin/i);
});

test('[P2] home starters search can enter a no-results state and recover with clear', async ({ page }) => {
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({
      json: {
        plugins: STARTER_PLUGINS,
      },
    });
  });

  await gotoEntryHome(page);

  // `plugins-home-section` and its children are rendered in both the home and
  // plugins views (both stay mounted), so scope to the home view to keep these
  // strict-mode locators unambiguous.
  const home = page.getByTestId('entry-view-home');
  await home.getByTestId('plugins-home-pill-category-all').click();
  await home.getByTestId('plugins-home-search').fill('no-such-starter');
  await expect(home.getByTestId('plugins-home-section')).toContainText(
    'No plugins match the current filters.',
  );
  await home.getByRole('button', { name: /Clear filters/i }).click();
  await expect(page.locator('[data-plugin-id="localized-plugin"]')).toBeVisible();
  await expect(page.locator('[data-plugin-id="deck-writer"]')).toBeVisible();
});

test('[P2] home starters details modal opens from a gallery card and closes on Escape', async ({ page }) => {
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({
      json: {
        plugins: [STARTER_PLUGIN],
      },
    });
  });

  await gotoEntryHome(page);

  const card = page.locator('[data-plugin-id="localized-plugin"]').first();
  await expect(card).toBeVisible();
  await card.hover();
  await page.getByTestId('plugins-home-details-localized-plugin').click({ force: true });

  const dialog = page.getByTestId('plugin-details-modal');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Localized Plugin');
  await expect(page.getByTestId('plugin-details-use-localized-plugin')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('[P2] home starters html details modal exposes header actions and closes from the close button', async ({ page }) => {
  const htmlPlugin = makeStarterPlugin({
    id: 'html-details-plugin',
    title: 'HTML Details Plugin',
    description: 'A richly described HTML starter.',
    mode: 'deck',
    featured: true,
    query: 'Draft a {{topic}} deck.',
    inputs: [{ name: 'topic', type: 'string', default: 'warm paper' }],
    previewEntry: './example.html',
  });

  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({ json: { plugins: [htmlPlugin] } });
  });
  await page.route('**/api/plugins/html-details-plugin/preview', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<!doctype html><html><body><h1>HTML Details Preview</h1></body></html>',
    });
  });

  await gotoEntryHome(page);
  await page.locator('article.plugins-home__card[data-plugin-id="html-details-plugin"]').hover();
  await page.getByTestId('plugins-home-details-html-details-plugin').click({ force: true });

  const dialog = page.getByRole('dialog', { name: /HTML Details Plugin preview/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('HTML Details Plugin');
  await expect(page.getByTestId('plugin-details-use-html-details-plugin')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Plugin info', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Fullscreen|全屏/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Share/i }).first()).toBeVisible();
  await expect(page.getByTestId('plugin-share-html-details-plugin')).toBeVisible();

  await page.getByRole('button', { name: 'Plugin info', exact: true }).click();
  await expect(page.locator('.ds-modal-sidebar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Plugin info', exact: true }).click();
  await expect(page.locator('.ds-modal-sidebar')).toBeVisible();

  await dialog.locator('.ds-modal-close').click();
  await expect(dialog).toHaveCount(0);
});

test('[P2] home starters html details modal shows metadata links, supports copy query, and opens the plugin share menu', async ({ page }) => {
  const htmlPlugin = makeStarterPlugin({
    id: 'html-metadata-plugin',
    title: 'HTML Metadata Plugin',
    description: 'A richly described HTML starter.',
    mode: 'deck',
    featured: true,
    query: 'Use the {{topic}} template for a polished launch deck.',
    inputs: [{ name: 'topic', type: 'string', default: 'editorial systems' }],
    previewEntry: './example.html',
    tags: ['deck', 'marketing'],
    authorName: 'Open Design',
    authorUrl: 'https://github.com/nexu-io/open-design',
    homepage: 'https://example.com/html-metadata-plugin',
    context: {
      skills: [{ path: './SKILL.md' }],
      assets: ['./example.html'],
    },
    pipeline: {
      stages: [{ id: 'draft', atoms: ['outline', 'compose'] }],
    },
  });

  await page.addInitScript(() => {
    const store: string[] = [];
    const clipboard = {
      writeText(text: string) {
        store.push(text);
        return Promise.resolve();
      },
      readText() {
        return Promise.resolve(store.at(-1) ?? '');
      },
    };
    Object.defineProperty(window, '__copiedTexts', {
      value: store,
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: clipboard,
      configurable: true,
    });
  });
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({ json: { plugins: [htmlPlugin] } });
  });
  await page.route('**/api/plugins/html-metadata-plugin/preview', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<!doctype html><html><body><h1>HTML Metadata Preview</h1></body></html>',
    });
  });

  await gotoEntryHome(page);
  await page.locator('article.plugins-home__card[data-plugin-id="html-metadata-plugin"]').hover();
  await page.getByTestId('plugins-home-details-html-metadata-plugin').click({ force: true });

  const dialog = page.getByRole('dialog', { name: /HTML Metadata Plugin preview/i });
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('plugin-details-author')).toContainText('Open Design');
  await expect(page.getByTestId('plugin-details-author-profile')).toHaveAttribute(
    'href',
    'https://github.com/nexu-io/open-design',
  );
  await expect(page.getByTestId('plugin-details-author-homepage')).toHaveAttribute(
    'href',
    'https://github.com/nexu-io/open-design',
  );
  await expect(dialog).toContainText('Context bundles');
  await expect(dialog).toContainText('./SKILL.md');
  await expect(dialog).toContainText('./example.html');
  await expect(dialog).toContainText('Workflow');
  await expect(dialog).toContainText('draft');
  await expect(dialog).toContainText('outline');

  const copyButton = dialog.getByRole('button', { name: /^Copy$/i }).first();
  await copyButton.click();
  await expect(dialog.getByRole('button', { name: /^Copied$/i })).toBeVisible();
  const copied = await page.evaluate(() => (window as typeof window & { __copiedTexts?: string[] }).__copiedTexts ?? []);
  expect(copied.at(-1)).toBe('Use the {{topic}} template for a polished launch deck.');

  await page.getByTestId('plugin-share-html-metadata-plugin').getByRole('button', { name: /^More$/i }).click();
  const shareMenu = page.locator('.plugin-share-popover[role="menu"]');
  await expect(shareMenu).toBeVisible();
  await expect(shareMenu.getByRole('menuitem', { name: /Copy install command/i })).toBeVisible();
  await expect(shareMenu.getByRole('menuitem', { name: /Copy plugin ID/i })).toBeVisible();
  // Bundled plugins now have a public open-design.ai detail page, so the
  // README badge (which links to it) is offered.
  await expect(shareMenu.getByRole('menuitem', { name: /Copy README badge/i })).toBeVisible();
  await expect(shareMenu.getByRole('menuitem', { name: /Open source on GitHub/i })).toBeVisible();
  await expect(shareMenu.getByRole('menuitem', { name: /Open homepage/i })).toBeVisible();
  await expect(shareMenu.getByRole('menuitem', { name: /Open in marketplace/i })).toBeVisible();
});

test('[P1] home starters Use plugin from the details modal applies the plugin to the home hero', async ({ page }) => {
  const htmlPlugin = makeStarterPlugin({
    id: 'detail-use-plugin',
    title: 'Detail Use Plugin',
    description: 'A detail-apply fixture.',
    mode: 'prototype',
    query: 'Make a {{topic}} brief.',
    inputs: [{ name: 'topic', type: 'string', default: 'detail modal' }],
    previewEntry: './example.html',
  });

  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({ json: { plugins: [htmlPlugin] } });
  });
  await page.route('**/api/plugins/detail-use-plugin/preview', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<!doctype html><html><body><h1>Detail Use Preview</h1></body></html>',
    });
  });

  await gotoEntryHome(page);
  await page.locator('article.plugins-home__card[data-plugin-id="detail-use-plugin"]').hover();
  await page.getByTestId('plugins-home-details-detail-use-plugin').click({ force: true });

  const dialog = page.getByRole('dialog', { name: /Detail Use Plugin preview/i });
  await expect(dialog).toBeVisible();
  await page.getByTestId('plugin-details-use-detail-use-plugin').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('home-hero-context-plugin-detail-use-plugin')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toHaveText('');
});

test('[P0] home starters direct Use keeps prompt empty and still allows a freeform submit', async ({ page }) => {
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({
      json: {
        plugins: [STARTER_PLUGIN],
      },
    });
  });

  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');
  await expect(input).toHaveText('');

  await page.locator('article.plugins-home__card[data-plugin-id="localized-plugin"]').hover();
  await page.getByTestId('plugins-home-use-localized-plugin').click({ force: true });
  await expect(input).toHaveText('');

  await input.fill('Use the selected starter as context');
  const projectRequestPromise = page.waitForRequest(isCreateProjectRequest);
  const runRequestPromise = page.waitForRequest(isCreateRunRequest);
  await page.getByTestId('home-hero-submit').click();

  const projectRequest = await projectRequestPromise;
  const projectBody = projectRequest.postDataJSON() as {
    pluginId?: string;
    pendingPrompt?: string;
  };
  expect(projectBody.pendingPrompt).toBe('Use the selected starter as context');
  expect(projectBody.pluginId).toBe('od-default');

  const runRequest = await runRequestPromise;
  const runBody = runRequest.postDataJSON() as { message?: string };
  expect(runBody.message).toContain('Use the selected starter as context');
  await expect(page).toHaveURL(/\/projects\//);
});

test('[P1] home starters Use with query hydrates the prompt and keeps plugin context visible', async ({ page }) => {
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({
      json: {
        plugins: [STARTER_PLUGIN],
      },
    });
  });

  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');
  await expect(input).toHaveText('');
  const starterCard = page.locator('[data-plugin-id="localized-plugin"]').first();
  await starterCard.scrollIntoViewIfNeeded();
  await starterCard.hover();
  await expect(page.getByTestId('plugins-home-use-menu-localized-plugin')).toBeVisible();
  await page.getByTestId('plugins-home-use-menu-localized-plugin').click();
  await page.getByTestId('plugins-home-use-with-query-localized-plugin').click();
  await expect(page.getByTestId('home-hero-context-plugin-localized-plugin')).toBeVisible();
  await expect(input).toHaveText('Make a design systems brief.');
});

test('[P0] home starters Use with query carries the hydrated starter prompt into the created project and first user turn', async ({ page }) => {
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({
      json: {
        plugins: [STARTER_PLUGIN],
      },
    });
  });

  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');
  const starterCard = page.locator('[data-plugin-id="localized-plugin"]').first();
  await starterCard.scrollIntoViewIfNeeded();
  await starterCard.hover();
  await expect(page.getByTestId('plugins-home-use-menu-localized-plugin')).toBeVisible();
  await page.getByTestId('plugins-home-use-menu-localized-plugin').click();
  await page.getByTestId('plugins-home-use-with-query-localized-plugin').click();
  await expect(page.getByTestId('home-hero-context-plugin-localized-plugin')).toBeVisible();
  await expect(input).toHaveText('Make a design systems brief.');

  const projectRequestPromise = page.waitForRequest(isCreateProjectRequest);
  const runRequestPromise = page.waitForRequest(isCreateRunRequest);
  await page.getByTestId('home-hero-submit').click();

  const projectRequest = await projectRequestPromise;
  const projectBody = projectRequest.postDataJSON() as {
    metadata?: { kind?: string };
    pendingPrompt?: string;
    pluginId?: string;
  };
  expect(projectBody.pendingPrompt).toBe('Make a design systems brief.');
  expect(projectBody.pluginId).toBe('od-default');
  expect(typeof projectBody.metadata?.kind).toBe('string');

  const runRequest = await runRequestPromise;
  const runBody = runRequest.postDataJSON() as { message?: string };
  expect(runBody.message).toContain('Make a design systems brief.');

  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: 'Make a design systems brief.' }).first()).toBeVisible();

  const { projectId, conversationId } = await getCurrentProjectContext(page);
  const project = await fetchProjectFromApi(page, projectId);
  expect(project.metadata?.kind).toBe(projectBody.metadata?.kind);

  const messages = await listMessagesFromApi(page, projectId, conversationId);
  expect(
    messages.some((message) => message.role === 'user' && message.content === 'Make a design systems brief.'),
  ).toBe(true);
});

test('[P0] home hero input keeps Shift+Enter as a newline and submits on Enter', async ({ page }) => {
  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');
  const submit = page.getByTestId('home-hero-submit');

  await expect(submit).toBeDisabled();
  await input.click();
  await input.fill('Line one');
  await input.press('Shift+Enter');
  await input.type('Line two');
  // Lexical renders the soft break as separate block nodes, so the editor's
  // textContent collapses the newline; assert both lines are present rather
  // than an exact "\n"-joined value. The newline itself is verified below
  // against the create-project/run payloads.
  await expect(input).toContainText('Line one');
  await expect(input).toContainText('Line two');
  await expect(page).toHaveURL(/\/$/);
  await expect(submit).toBeEnabled();

  const projectRequestPromise = page.waitForRequest(isCreateProjectRequest);
  const runRequestPromise = page.waitForRequest(isCreateRunRequest);
  await input.press('Enter');

  const projectRequest = await projectRequestPromise;
  const projectBody = projectRequest.postDataJSON() as { pendingPrompt?: string };
  expect(projectBody.pendingPrompt).toBe('Line one\nLine two');

  const runRequest = await runRequestPromise;
  const runBody = runRequest.postDataJSON() as { message?: string };
  expect(runBody.message).toContain('Line one\nLine two');
  await expect(page).toHaveURL(/\/projects\//);
});

test('[P1] home hero @ mention picker opens and Enter applies the highlighted plugin', async ({ page }) => {
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({
      json: {
        plugins: [STARTER_PLUGIN],
      },
    });
  });

  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');
  await input.click();
  await input.fill('@local');

  const picker = page.getByTestId('home-hero-plugin-picker');
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('option', { name: /Localized Plugin/i })).toBeVisible();

  await input.press('Enter');

  await expect(picker).toHaveCount(0);
  await expect(input).toHaveText('@Localized Plugin');
});

test('[P0] home hero attachment input stages files, enables submit, and supports removal', async ({ page }) => {
  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-file-input');
  const submit = page.getByTestId('home-hero-submit');
  await expect(submit).toBeDisabled();

  await input.setInputFiles({
    name: 'brief.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Attachment staged from the home hero.\n', 'utf8'),
  });

  const staged = page.getByTestId('home-hero-staged-files');
  await expect(staged).toBeVisible();
  await expect(staged.getByText('brief.txt', { exact: true })).toBeVisible();
  await expect(submit).toBeEnabled();

  await page.getByRole('button', { name: /Remove brief\.txt/i }).click();
  await expect(staged).toHaveCount(0);
  await expect(submit).toBeDisabled();
});

test('[P0] home hero attachment-only submit uploads the file and sends it with the first message', async ({ page }) => {
  await gotoEntryHome(page);

  const uploadResponse = page.waitForResponse(
    (resp) =>
      /\/api\/projects\/[^/]+\/upload$/.test(new URL(resp.url()).pathname) &&
      resp.request().method() === 'POST',
  );

  await page.getByTestId('home-hero-file-input').setInputFiles({
    name: 'reference.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Attachment-only home submission.\n', 'utf8'),
  });

  await expect(page.getByTestId('home-hero-staged-files')).toBeVisible();
  await expect(page.getByTestId('home-hero-staged-files')).toContainText('reference.txt');
  await expect(page.getByTestId('home-hero-submit')).toBeEnabled();

  await page.getByTestId('home-hero-submit').click();
  await expect((await uploadResponse).ok()).toBeTruthy();

  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.locator('.user-attachments').getByText('reference.txt', { exact: true })).toBeVisible();
});

test('[P1] collapsed rail stays out of the keyboard tab order on the home view', async ({ page }) => {
  await gotoEntryHome(page);

  // Collapsed by default: the rail must be inert so its still-mounted logo and
  // nav buttons cannot receive keyboard focus before the visible toggle/hero.
  const rail = page.locator('.entry-nav-rail');
  await expect(rail).toHaveAttribute('inert', '');

  // Tabbing from the top of the document must never land inside the rail.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    const inRail = await page.evaluate(
      () => !!document.activeElement?.closest('.entry-nav-rail'),
    );
    expect(inRail).toBe(false);
  }

  // Once expanded the rail becomes interactive again and drops inert.
  await ensureRailOpen(page);
  await expect(rail).not.toHaveAttribute('inert', '');
  await expect(page.getByTestId('entry-nav-new-project')).toBeVisible();
});

test('[P1] collapsed new-user templates gallery stays out of the keyboard tab order', async ({ page }) => {
  // Force the no-project (new-user) state so the templates gallery starts
  // collapsed behind the scroll-up hint.
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.continue();
  });
  await gotoEntryHome(page);

  const body = page.locator('.home-templates-reveal__body');
  await expect(body).toHaveAttribute('inert', '');

  // Tabbing from the top of the document must never land inside the still-
  // mounted (but hidden) Community-template controls.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const inBody = await page.evaluate(
      () => !!document.activeElement?.closest('.home-templates-reveal__body'),
    );
    expect(inBody).toBe(false);
  }

  // Revealing the gallery (click the hint) drops inert and exposes the grid.
  await page.getByTestId('home-templates-hint').click();
  await expect(body).not.toHaveAttribute('inert', '');
});

test('[P1] rail can be collapsed again on coarse-pointer / non-hover devices', async ({ page }) => {
  // Emulate a touch device where `(hover: none)` matches: the collapse button
  // can't be revealed by hover and the topbar toggle is display:none once the
  // rail docks, so the rail must stay foldable through the always-visible
  // collapse control. emulateMedia() doesn't cover `hover`, so use CDP.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'hover', value: 'none' },
      { name: 'pointer', value: 'coarse' },
    ],
  });

  await gotoEntryHome(page);
  await ensureRailOpen(page);

  // Without a hover, the collapse control must still be visible and tappable,
  // and tapping it must actually fold the rail back.
  const collapse = page.getByTestId('entry-nav-collapse');
  await expect(collapse).toBeVisible();
  await collapse.click();
  await expect(page.locator('.entry')).not.toHaveClass(/entry--rail-open/);
});

async function gotoEntryHome(page: Page) {
  await page.goto('/');
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /not now/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
}

async function createProject(page: Page, name: string) {
  const id = `entry-home-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const response = await page.request.post('/api/projects', {
    data: {
      id,
      name,
      skillId: null,
      designSystemId: null,
      metadata: { kind: 'prototype' },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{ project: { id: string; name: string } }>;
}

async function getCurrentProjectContext(page: Page): Promise<{ projectId: string; conversationId: string }> {
  const current = new URL(page.url());
  const [, projects, projectId, maybeConversations, conversationId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) {
    throw new Error(`unexpected project route: ${current.pathname}`);
  }
  if (maybeConversations === 'conversations' && conversationId) {
    return { projectId, conversationId };
  }

  const response = await page.request.get(`/api/projects/${projectId}/conversations`);
  expect(response.ok()).toBeTruthy();
  const { conversations } = (await response.json()) as {
    conversations: Array<{ id: string; updatedAt: number }>;
  };
  const active = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!active) throw new Error(`no conversations found for project ${projectId}`);
  return { projectId, conversationId: active.id };
}

async function fetchProjectFromApi(
  page: Page,
  projectId: string,
): Promise<{ id: string; metadata?: { kind?: string } }> {
  const response = await page.request.get(`/api/projects/${projectId}`);
  expect(response.ok()).toBeTruthy();
  const { project } = (await response.json()) as {
    project: { id: string; metadata?: { kind?: string } };
  };
  return project;
}

async function listMessagesFromApi(
  page: Page,
  projectId: string,
  conversationId: string,
): Promise<Array<{ role: 'assistant' | 'user'; content: string }>> {
  const response = await page.request.get(
    `/api/projects/${projectId}/conversations/${conversationId}/messages`,
  );
  expect(response.ok()).toBeTruthy();
  const { messages } = (await response.json()) as {
    messages: Array<{ role: 'assistant' | 'user'; content: string }>;
  };
  return messages;
}

async function routeDesignSystems(page: Page) {
  await page.route('**/api/design-systems', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { designSystems: DESIGN_SYSTEMS } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/design-systems/*/showcase', async (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2) ?? '');
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body><main><h1>${id} showcase</h1></main></body></html>`,
    });
  });
  await page.route('**/api/design-systems/*/preview', async (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2) ?? '');
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body><main><h1>${id} tokens</h1></main></body></html>`,
    });
  });
  await page.route('**/api/design-systems/*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) ?? '');
    const system = DESIGN_SYSTEMS.find((item) => item.id === id) ?? DESIGN_SYSTEMS[0];
    await route.fulfill({
      json: {
        designSystem: {
          ...system,
          body: `# ${system.title}\n\nDesign guidance for ${system.title}.`,
        },
      },
    });
  });
}

function isCreateRunRequest(request: Request): boolean {
  const url = new URL(request.url());
  return url.pathname === '/api/runs' && request.method() === 'POST';
}

function isCreateProjectRequest(request: Request): boolean {
  const url = new URL(request.url());
  return url.pathname === '/api/projects' && request.method() === 'POST';
}

function makeStarterPlugin({
  id,
  title,
  description = 'A localized fixture',
  mode = 'prototype',
  taskKind = 'new-generation',
  featured = false,
  tags = [],
  query,
  inputs = [],
  previewEntry,
  authorName,
  authorUrl,
  homepage,
  context,
  pipeline,
}: {
  id: string;
  title: string;
  description?: string;
  mode?: string;
  taskKind?: 'new-generation' | 'figma-migration' | 'code-migration' | 'tune-collab';
  featured?: boolean;
  tags?: string[];
  query?: string;
  inputs?: Array<{ name: string; type: string; default?: string }>;
  previewEntry?: string;
  authorName?: string;
  authorUrl?: string;
  homepage?: string;
  context?: Record<string, unknown>;
  pipeline?: Record<string, unknown>;
}) {
  return {
    id,
    title,
    version: '1.0.0',
    trust: 'trusted',
    sourceKind: 'bundled',
    source: `/tmp/${id}`,
    capabilitiesGranted: ['prompt:inject'],
    fsPath: `/tmp/${id}`,
    installedAt: 0,
    updatedAt: 0,
    manifest: {
      name: id,
      title,
      version: '1.0.0',
      description,
      ...(authorName || authorUrl
        ? {
            author: {
              ...(authorName ? { name: authorName } : {}),
              ...(authorUrl ? { url: authorUrl } : {}),
            },
          }
        : {}),
      ...(homepage ? { homepage } : {}),
      ...(tags.length > 0 ? { tags } : {}),
      od: {
        kind: 'scenario',
        taskKind,
        mode,
        ...(featured ? { featured: true } : {}),
        ...(previewEntry
          ? {
              preview: {
                type: 'html',
                entry: previewEntry,
              },
            }
          : {}),
        ...(query
          ? {
              useCase: {
                query: {
                  en: query,
                },
              },
            }
          : {}),
        ...(inputs.length > 0 ? { inputs } : {}),
        ...(context ? { context } : {}),
        ...(pipeline ? { pipeline } : {}),
      },
    },
  } as const;
}
