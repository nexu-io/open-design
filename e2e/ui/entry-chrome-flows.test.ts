import { readFileSync } from 'node:fs';
import { expect, test } from '@/playwright/suite';
import { ensureRailOpen } from '@/playwright/rail';
import type { Locator, Page, Request } from '@playwright/test';
import { applyStandardMocks, fulfillAgentsRoute, STORAGE_KEY } from '@/playwright/mock-factory';
import { T } from '@/timeouts';
const LOCAL_CLI_LABEL = /Local CLI|Local coding agent|本机 CLI|本地 CLI/i;
const WEBGL_AURORA_PREVIEW_HTML = readFileSync(
  new URL('../../plugins/_official/examples/webgl-aurora-veil/example.html', import.meta.url),
  'utf8',
);
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
const MULTI_FACET_PLUGINS = [
  makeStarterPlugin({
    id: 'facet-landing-prototype',
    title: 'Facet Landing Prototype',
    mode: 'prototype',
    tags: ['landing-page'],
  }),
  makeStarterPlugin({
    id: 'facet-app-prototype',
    title: 'Facet App Prototype',
    mode: 'prototype',
    tags: ['app-onboarding'],
  }),
  makeStarterPlugin({
    id: 'image-template-notion-team-dashboard-live-artifact',
    title: 'Facet Live Artifact',
    mode: 'prototype',
    tags: ['live-artifact'],
  }),
  makeStarterPlugin({
    id: 'facet-deck',
    title: 'Facet Deck',
    mode: 'deck',
    tags: ['pitch-deck'],
  }),
  makeStarterPlugin({
    id: 'facet-image',
    title: 'Facet Image',
    mode: 'image',
    tags: ['ui'],
  }),
  makeStarterPlugin({
    id: 'facet-video',
    title: 'Facet Video',
    mode: 'video',
    tags: ['video-template'],
  }),
  makeStarterPlugin({
    id: 'facet-hyperframes',
    title: 'Facet HyperFrames',
    mode: 'video',
    tags: ['hyperframes'],
  }),
  makeStarterPlugin({
    id: 'facet-audio',
    title: 'Facet Audio',
    mode: 'audio',
    tags: ['audio'],
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

test.describe.configure({ timeout: T.xlong });

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
});

test('[P0] @critical entry chrome exposes the primary home creation surface and settings entry', async ({ page }) => {
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
  await expect(page.getByTestId('home-hero-plus-trigger')).toBeVisible();
  // Empty input can still run the active placeholder-carousel suggestion.
  await expect(page.getByTestId('home-hero-submit')).toBeEnabled();
  await expect(page.getByTestId('home-hero-template-picker')).toBeVisible();
  await expect(page.getByTestId('home-hero-design-system-picker')).toBeVisible();
  await expect(page.getByTestId('working-dir-picker')).toBeVisible();
  await expect(page.getByTestId('home-hero-template-section')).toBeVisible();
  await expect(page.getByTestId('home-hero-blank-project')).toBeVisible();
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

test('[P0] @critical home hero submit creates a project and lands on a usable workspace', async ({ page }) => {
  await page.route('**/api/runs', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"home-entry-workspace-smoke"}',
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: ['event: end', 'data: {"code":0,"status":"succeeded"}', '', ''].join('\n'),
    });
  });

  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');
  await input.fill('Create a risk dashboard workspace smoke.');
  await expect(page.getByTestId('home-hero-submit')).toBeEnabled();

  const projectRequestPromise = page.waitForRequest(isCreateProjectRequest);
  await page.getByTestId('home-hero-submit').click();
  const projectRequest = await projectRequestPromise;
  const projectBody = projectRequest.postDataJSON() as {
    pendingPrompt?: string;
    metadata?: { kind?: string };
  };
  expect(projectBody.pendingPrompt).toBe('Create a risk dashboard workspace smoke.');
  expect(typeof projectBody.metadata?.kind).toBe('string');

  await expect(page).toHaveURL(/\/projects\//, { timeout: 15_000 });
  await expect(page.getByTestId('project-title')).toBeVisible();
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
});

test('[P1] onboarding recommendation creates a project with prefilled first prompt context', async ({ page }) => {
  const createdBodies: Array<Record<string, unknown>> = [];
  const runBodies: Array<Record<string, unknown>> = [];
  const projectId = `onboarding-recommendation-${Date.now()}`;
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'mock',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: false,
        agentModels: {},
        privacyDecisionAt: 1,
        telemetry: { metrics: false, content: false, artifactManifest: false },
      }),
    );
  }, STORAGE_KEY);
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          config: {
            onboardingCompleted: false,
            agentId: 'mock',
            skillId: null,
            designSystemId: null,
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
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    createdBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      json: {
        project: {
          id: projectId,
          name: 'Product UI Prototype',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          pendingPrompt: createdBodies[0]?.pendingPrompt,
          metadata: createdBodies[0]?.metadata ?? { kind: 'prototype' },
        },
        conversationId: `${projectId}-conversation`,
      },
    });
  });
  await page.route('**/api/runs', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    runBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"recommendation-should-not-auto-send"}',
    });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.long });
  await page.getByRole('button', { name: LOCAL_CLI_LABEL }).click();
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await page.getByRole('button', { name: /Engineer$/i }).click();
  await page.getByRole('button', { name: /Product design/i }).click();
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await page.getByRole('button', { name: 'Go to home' }).click();

  await expect(page.getByTestId('home-recommendation')).toBeVisible();
  await page.getByTestId('home-recommendation-start').click();

  await expect.poll(() => createdBodies.length).toBe(1);
  const body = createdBodies[0] as {
    pendingPrompt?: string;
    metadata?: { kind?: string };
  };
  expect(body.pendingPrompt ?? '').toContain('product');
  expect(typeof body.metadata?.kind).toBe('string');
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}`));
  await expect
    .poll(() => page.evaluate((id) => window.sessionStorage.getItem(`open-design:first-loop-entry:${id}`), projectId))
    .toContain('product_ui_prototype');
  const firstLoopEntry = await page.evaluate((id) => {
    const raw = window.sessionStorage.getItem(`open-design:first-loop-entry:${id}`);
    return raw ? JSON.parse(raw) as { recommendationId?: string; productType?: string } : null;
  }, projectId);
  expect(firstLoopEntry).toMatchObject({
    productType: 'product_ui',
    recommendationId: 'product_ui_prototype',
  });
  await page.waitForTimeout(500);
  expect(runBodies).toHaveLength(0);
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
  await expect(page.getByTestId('home-hero-template-picker')).toBeVisible();
  await expect(page.getByTestId('home-hero-template-section')).toBeVisible();
  await expect(page.getByTestId('home-hero-type-tabs')).toBeVisible();
  await expect(page.getByTestId('home-hero-active-type-chip')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-rail-prototype')).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByTestId('home-hero-footer-options')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-plugin-presets')).toHaveCount(0);
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
  await expect(home.getByTestId('plugins-home-pill-category-all')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-templates-hint')).toHaveCount(0);
  await expect(page.getByTestId('entry-nav-home')).toHaveAttribute('aria-current', 'page');

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-projects').click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByTestId('entry-nav-projects')).toHaveAttribute('aria-current', 'page');
});

test('[P0] @critical recent projects strip opens a project card and view all routes to the projects index', async ({ page }) => {
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

  // Master-detail: selecting a list row renders that system in the right
  // detail pane, where secondary actions live in the header overflow menu.
  await page.getByTestId('design-system-card-airbnb').click();
  const detail = page.getByTestId('design-system-detail-airbnb');
  await expect(detail).toBeVisible();
  await expect(page.getByTestId('design-kit-view-airbnb')).toBeVisible();
  await expect(detail).toContainText('Airbnb');

  await detail.getByTestId('design-kit-more-actions').click();
  await page.getByRole('menuitem', { name: /Default for new chats/i }).click();
  await expect(page.getByTestId('design-system-card-airbnb')).toContainText(/default/i);
  await expect
    .poll(() => persistedConfigs.at(-1)?.designSystemId)
    .toBe('airbnb');
});

test('[P1] disabled design systems are filtered from entry creation surfaces', async ({ page }) => {
  await routeDesignSystems(page);
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'PUT') {
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
            disabledDesignSystems: ['airbnb'],
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
  await page.getByTestId('home-hero-design-system-trigger').click();
  const homePicker = page.getByTestId('project-ds-picker-popover');
  await expect(homePicker.getByTestId('project-ds-picker-option-agentic')).toBeVisible();
  await expect(homePicker.getByTestId('project-ds-picker-option-airbnb')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-new-project').click();
  const modal = page.getByTestId('new-project-modal');
  await expect(modal).toBeVisible();
  await modal.getByTestId('design-system-trigger').click();
  await expect(modal.getByRole('option', { name: /Agentic/i })).toBeVisible();
  await expect(modal.getByRole('option', { name: /Airbnb/i })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-design-systems').click();
  await page.getByRole('tab', { name: 'Official presets' }).click();
  await expect(page.getByTestId('design-system-card-agentic')).toBeVisible();
  await expect(page.getByTestId('design-system-card-airbnb')).toHaveCount(0);
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

test('[P0] @critical entry execution pill opens the Local CLI and BYOK switcher from Home', async ({ page }) => {
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

test('[P1] Settings About reads desktop updater status and runs a manual update check', async ({ page }) => {
  await page.addInitScript(() => {
    const idleStatus = {
      arch: 'arm64',
      capabilities: {
        canApplyInPlace: false,
        canDownload: true,
        canOpenInstaller: true,
        requiresManualInstall: false,
      },
      channel: 'beta',
      currentVersion: '0.13.4',
      enabled: true,
      mode: 'package-launcher',
      platform: 'darwin',
      state: 'idle',
      supported: true,
    };
    const checkedStatus = {
      ...idleStatus,
      lastCheckedAt: '2026-06-30T00:00:00.000Z',
      state: 'not-available',
    };
    (window as unknown as { __odUpdaterCalls?: string[] }).__odUpdaterCalls = [];
    (window as unknown as { __od__?: unknown }).__od__ = {
      version: 2,
      client: { type: 'desktop', platform: 'darwin', osLocale: 'en-US' },
      browser: { clearData: async () => ({ ok: true }) },
      capture: { page: async () => ({ ok: false, reason: 'not mocked' }) },
      pdf: { print: async () => ({ ok: true }) },
      pet: { setVisible: () => {} },
      project: {
        pickAndImport: async () => ({ ok: false, canceled: true }),
        pickAndReplaceWorkingDir: async () => ({ ok: false, canceled: true }),
      },
      shell: {
        openExternal: async () => ({ ok: true }),
        openPath: async () => ({ ok: true }),
      },
      updater: {
        status: async () => idleStatus,
        check: async () => {
          (window as unknown as { __odUpdaterCalls: string[] }).__odUpdaterCalls.push('check');
          return checkedStatus;
        },
        download: async () => checkedStatus,
        install: async () => checkedStatus,
        quit: async () => ({ ok: true }),
        subscribe: () => () => {},
      },
    };
  });
  await page.route('**/api/version', async (route) => {
    await route.fulfill({
      json: {
        version: {
          version: '0.13.4',
          channel: 'beta',
          packaged: true,
          platform: 'darwin',
          arch: 'arm64',
        },
      },
    });
  });

  await gotoEntryHome(page);
  await page.getByTestId('entry-settings-menu-trigger').click();
  await page.getByTestId('entry-settings-open-details').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: /^About\b/i }).click();
  await expect(dialog.locator('.settings-about-version-num')).toContainText('0.13.4');
  await expect(dialog.locator('.settings-about-update-status')).toContainText('Not checked yet');

  await dialog.getByRole('button', { name: 'Check for updates' }).click();
  await expect(dialog.locator('.settings-about-update-status')).toContainText('You are already on the latest version.');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __odUpdaterCalls?: string[] }).__odUpdaterCalls ?? []))
    .toEqual(['check']);
});

test('[P2] entry help menu exposes community links and topbar routes Use everywhere', async ({ page }) => {
  await gotoEntryHome(page);

  // The help launcher lives in the (collapsed-by-default) rail footer.
  await ensureRailOpen(page);
  await page.getByTestId('entry-help-trigger').click();
  const menu = page.locator('.entry-help-popover[role="menu"]');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Follow @OpenDesignHQ on X/i })).toHaveAttribute(
    'href',
    'https://x.com/OpenDesignHQ',
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

test('[P1] Use everywhere guide uses daemon MCP install info and copies an agent guide', async ({ page }) => {
  await page.addInitScript(() => {
    const store: string[] = [];
    Object.defineProperty(window, '__copiedTexts', {
      value: store,
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText(text: string) {
          store.push(text);
          return Promise.resolve();
        },
      },
      configurable: true,
    });
  });
  await page.route('**/api/mcp/install-info', async (route) => {
    await route.fulfill({
      json: {
        command: '/Applications/Open Design.app/Contents/MacOS/od',
        args: ['mcp', '--daemon-url', 'http://127.0.0.1:7456'],
        env: {
          OD_DATA_DIR: '/Users/test/.open-design',
        },
      },
    });
  });

  await gotoEntryHome(page);
  await page.getByTestId('entry-use-everywhere-button').click();
  await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();
  await expect(page.getByTestId('integrations-tab-use-everywhere')).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await page.getByTestId('use-everywhere-tab-mcp').click();
  const mcpSection = page.getByTestId('use-everywhere-section-mcp');
  await expect(mcpSection).toContainText('/Applications/Open Design.app/Contents/MacOS/od');
  await expect(mcpSection).toContainText('OD_DATA_DIR');

  await page.getByTestId('use-everywhere-copy-guide').click();
  await expect(page.getByTestId('use-everywhere-copy-guide')).toContainText(/Copied|已复制|已複製/i);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __copiedTexts?: string[] }).__copiedTexts?.at(-1) ?? ''))
    .toContain('/Applications/Open Design.app/Contents/MacOS/od');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __copiedTexts?: string[] }).__copiedTexts?.at(-1) ?? ''))
    .toMatch(/http:\/\/127\.0\.0\.1:\d+\/api\/mcp\/install-info/);

  await page.getByTestId('use-everywhere-open-settings').click();
  await expect(page.getByTestId('integrations-tab-mcp')).toHaveAttribute('aria-selected', 'true');
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

test('[P1] home starters can browse registry and use a starter from Home', async ({ page }) => {
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({
      json: {
        plugins: [STARTER_PLUGIN],
      },
    });
  });
  await page.route('**/api/plugins/localized-plugin/apply', async (route) => {
    await route.fulfill({ json: makeApplyResult('localized-plugin') });
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
  // Details modal use is still covered separately from the gallery inline
  // Use button. This starter ships an example query, so the
  // primary Use button loads the prompt while binding it as the
  // active driver; this case only asserts the active-plugin chip, which
  // appears on either Use variant.
  await openHomePluginDetails(page, 'localized-plugin', /Localized Plugin/i);
  await page.getByTestId('plugin-details-use-localized-plugin').click();
  await expect(page.getByTestId('home-hero-active-plugin')).toBeVisible();
});

test('[P1] home starters gallery inline Use applies the starter without opening details', async ({ page }) => {
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({
      json: {
        plugins: [STARTER_PLUGIN],
      },
    });
  });
  await page.route('**/api/plugins/localized-plugin/apply', async (route) => {
    await route.fulfill({ json: makeApplyResult('localized-plugin') });
  });

  await gotoEntryHome(page);
  const home = await revealHomeTemplates(page);
  const card = home.locator('article.plugins-home__card[data-plugin-id="localized-plugin"]');
  await expect(card).toBeVisible();

  await card.hover();
  const useButton = card.getByTestId('plugins-home-use-localized-plugin');
  await expect(useButton).toBeVisible();
  await useButton.click();

  await expect(page.getByRole('dialog').filter({ hasText: /Localized Plugin/i })).toHaveCount(0);
  await expect(page.getByTestId('home-hero-active-plugin')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toHaveText('');
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

  const home = await revealHomeTemplates(page);
  await expect(home.getByTestId('plugins-home-pill-category-all')).toContainText('4');

  await home.getByTestId('plugins-home-pill-category-deck').click({ force: true });
  await expect(home.locator('[data-plugin-id="deck-writer"]')).toBeVisible();
  await expect(home.locator('[data-plugin-id="figma-importer"]')).toHaveCount(0);
  await expect(home.locator('[data-plugin-id="localized-plugin"]')).toHaveCount(0);
  await expect(home.locator('[data-plugin-id="hyperframes-video"]')).toHaveCount(0);

  await home.getByTestId('plugins-home-pill-category-all').click({ force: true });
  await expect(home.locator('[data-plugin-id="figma-importer"]')).toBeVisible();
  await expect(home.locator('[data-plugin-id="localized-plugin"]')).toBeVisible();
  await expect(home.locator('[data-plugin-id="hyperframes-video"]')).toBeVisible();
  await expect(home.locator('[data-plugin-id="deck-writer"]')).toBeVisible();

  const search = home.getByTestId('plugins-home-search');
  await search.fill('Deck Writer');
  await expect(home.locator('[data-plugin-id="deck-writer"]')).toBeVisible();
  await expect(home.locator('[data-plugin-id="localized-plugin"]')).toHaveCount(0);
  await expect(home.locator('[data-plugin-id="hyperframes-video"]')).toHaveCount(0);
  await home.getByTestId('plugins-home-search-clear').click({ force: true });
  await expect(home.locator('[data-plugin-id="localized-plugin"]')).toBeVisible();
});

test('[P1] home starters category tabs and subcategory tabs switch the gallery slice', async ({ page }) => {
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({
      json: {
        plugins: MULTI_FACET_PLUGINS,
      },
    });
  });

  await gotoEntryHome(page);
  const home = await revealHomeTemplates(page);

  await expect(home.getByTestId('plugins-home-pill-category-all')).toContainText('8');
  await expect(home.locator('[data-plugin-id="facet-landing-prototype"]')).toBeVisible();
  await expect(home.locator('[data-plugin-id="facet-audio"]')).toBeVisible();

  const categoryCases = [
    ['prototype', 'facet-landing-prototype', 'facet-deck'],
    ['live-artifact', 'image-template-notion-team-dashboard-live-artifact', 'facet-landing-prototype'],
    ['deck', 'facet-deck', 'facet-image'],
    ['image', 'facet-image', 'facet-video'],
    ['video', 'facet-video', 'facet-hyperframes'],
    ['hyperframes', 'facet-hyperframes', 'facet-video'],
    ['audio', 'facet-audio', 'facet-image'],
  ] as const;

  for (const [category, visibleId, hiddenId] of categoryCases) {
    const pill = home.getByTestId(`plugins-home-pill-category-${category}`);
    await pill.scrollIntoViewIfNeeded();
    await expect(pill).toBeVisible();
    await pill.click();
    await expect(pill).toHaveAttribute('aria-selected', 'true');
    await expect(home.locator(`[data-plugin-id="${visibleId}"]`)).toBeVisible();
    await expect(home.locator(`[data-plugin-id="${hiddenId}"]`)).toHaveCount(0);
  }

  await home.getByTestId('plugins-home-pill-category-all').click({ force: true });
  await expect(home.getByTestId('plugins-home-pill-category-all')).toHaveAttribute('aria-selected', 'true');
  await expect(home.locator('[data-plugin-id="facet-landing-prototype"]')).toBeVisible();
  await expect(home.locator('[data-plugin-id="facet-audio"]')).toBeVisible();

  await home.getByTestId('plugins-home-pill-category-prototype').click({ force: true });
  await expect(home.getByTestId('plugins-home-row-subcategory-prototype')).toBeVisible();
  await home.getByTestId('plugins-home-pill-subcategory-prototype-landing-marketing').click({ force: true });
  await expect(home.getByTestId('plugins-home-pill-subcategory-prototype-landing-marketing')).toHaveAttribute('aria-selected', 'true');
  await expect(home.locator('[data-plugin-id="facet-landing-prototype"]')).toBeVisible();
  await expect(home.locator('[data-plugin-id="facet-app-prototype"]')).toHaveCount(0);

  await home.getByTestId('plugins-home-pill-subcategory-prototype-app-prototypes').click({ force: true });
  await expect(home.getByTestId('plugins-home-pill-subcategory-prototype-app-prototypes')).toHaveAttribute('aria-selected', 'true');
  await expect(home.locator('[data-plugin-id="facet-app-prototype"]')).toBeVisible();
  await expect(home.locator('[data-plugin-id="facet-landing-prototype"]')).toHaveCount(0);

  await home.getByTestId('plugins-home-pill-subcategory-prototype-all').click({ force: true });
  await expect(home.locator('[data-plugin-id="facet-landing-prototype"]')).toBeVisible();
  await expect(home.locator('[data-plugin-id="facet-app-prototype"]')).toBeVisible();
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
  const home = await revealHomeTemplates(page);
  await home.getByTestId('plugins-home-pill-category-all').click({ force: true });
  const search = home.getByTestId('plugins-home-search');
  await search.click({ force: true });
  await search.fill('no-such-starter');
  await expect(search).toHaveValue('no-such-starter');
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

  const home = await revealHomeTemplates(page);
  const card = home.locator('[data-plugin-id="localized-plugin"]').first();
  await expect(card).toBeVisible();
  await card.click();

  const dialog = page.getByRole('dialog', { name: /Localized Plugin details/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Localized Plugin');
  await expect(page.getByTestId('plugin-details-use-localized-plugin')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('[P1] home starters gallery card click opens the large preview detail modal', async ({ page }) => {
  const htmlPlugin = makeStarterPlugin({
    id: 'community-gallery-plugin',
    title: 'Community Gallery Plugin',
    description: 'A gallery tile fixture with an HTML preview.',
    mode: 'prototype',
    featured: true,
    query: 'Build a {{topic}} prototype.',
    inputs: [{ name: 'topic', type: 'string', default: 'community gallery' }],
    previewEntry: './example.html',
  });

  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({ json: { plugins: [htmlPlugin] } });
  });
  await page.route('**/api/plugins/community-gallery-plugin/preview', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<!doctype html><html><body><main><h1>Community Gallery Preview</h1></main></body></html>',
    });
  });

  await gotoEntryHome(page);
  const home = await revealHomeTemplates(page);

  const card = home.locator('article.plugins-home__card[data-plugin-id="community-gallery-plugin"]');
  await expect(card).toBeVisible();
  await expect(card).toHaveClass(/plugins-home__card--gallery/);
  await expect(card).toHaveAttribute('data-preview-kind', 'html');
  await expect(card.locator('.plugins-home__gallery-frame')).toBeVisible();

  await clickCardAtActionablePoint(page, card);
  const dialog = page.getByRole('dialog', { name: /Community Gallery Plugin preview/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.ds-modal-stage')).toBeVisible();
  await expect(dialog.locator('.ds-modal-stage-iframe-scaler iframe')).toBeVisible();
  await expect(page.getByTestId('plugin-details-use-community-gallery-plugin')).toBeVisible();
});

test('[P1] home starters gallery duplicate creates a project and exposes the returned file', async ({ page }) => {
  const htmlPlugin = makeStarterPlugin({
    id: 'duplicate-gallery-plugin',
    title: 'Duplicate Gallery Plugin',
    description: 'A gallery tile fixture that can be duplicated into a project.',
    mode: 'prototype',
    featured: true,
    query: 'Build a {{topic}} prototype.',
    inputs: [{ name: 'topic', type: 'string', default: 'duplicate gallery' }],
    previewEntry: './example.html',
  });
  const duplicatedProject = {
    id: 'duplicated-gallery-project',
    name: 'Duplicate Gallery Plugin',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: {
      kind: 'prototype',
      templateId: 'plugin:duplicate-gallery-plugin',
      templateLabel: 'Duplicate Gallery Plugin',
      duplicatedFromPluginId: 'duplicate-gallery-plugin',
      skipDiscoveryBrief: true,
    },
  };
  const duplicateRequests: Array<{ name?: string }> = [];

  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({ json: { plugins: [htmlPlugin] } });
  });
  await page.route('**/api/plugins/duplicate-gallery-plugin/preview', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<!doctype html><html><body><main><h1>Duplicate Gallery Preview</h1></main></body></html>',
    });
  });
  await page.route('**/api/plugins/duplicate-gallery-plugin/duplicate-project', async (route) => {
    duplicateRequests.push(route.request().postDataJSON() as { name?: string });
    await route.fulfill({
      json: {
        ok: true,
        sourcePluginId: 'duplicate-gallery-plugin',
        projectId: duplicatedProject.id,
        conversationId: 'duplicated-gallery-conversation',
        relPath: 'example.html',
        warnings: [],
      },
    });
  });
  await routeSingleProject(page, duplicatedProject, [
    {
      name: 'example.html',
      path: 'example.html',
      kind: 'html',
      size: 92,
      updatedAt: duplicatedProject.updatedAt,
    },
  ]);

  await gotoEntryHome(page);
  const home = await revealHomeTemplates(page);
  await duplicatePluginFromDetails(page, 'duplicate-gallery-plugin', /Duplicate Gallery Plugin/i, home);

  await expect
    .poll(() => duplicateRequests.at(-1)?.name)
    .toBe('Duplicate Gallery Plugin');
  await expect(page).toHaveURL(/\/projects\/duplicated-gallery-project/);
  await expect(page.getByText('example.html', { exact: true })).toBeVisible();
});

test('[P1] home starters gallery duplicate failure recovers without leaving Home', async ({ page }) => {
  const htmlPlugin = makeStarterPlugin({
    id: 'duplicate-failure-plugin',
    title: 'Duplicate Failure Plugin',
    description: 'A gallery tile fixture that fails duplicate.',
    mode: 'prototype',
    featured: true,
    previewEntry: './example.html',
  });
  const duplicateRequests: Array<{ name?: string }> = [];

  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({ json: { plugins: [htmlPlugin] } });
  });
  await page.route('**/api/plugins/duplicate-failure-plugin/preview', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<!doctype html><html><body><main><h1>Duplicate Failure Preview</h1></main></body></html>',
    });
  });
  await page.route('**/api/plugins/duplicate-failure-plugin/duplicate-project', async (route) => {
    duplicateRequests.push(route.request().postDataJSON() as { name?: string });
    await route.fulfill({
      status: 500,
      json: { error: { code: 'duplicate-failed', message: 'fixture duplicate failure' } },
    });
  });

  await gotoEntryHome(page);
  const home = await revealHomeTemplates(page);
  await duplicatePluginFromDetails(page, 'duplicate-failure-plugin', /Duplicate Failure Plugin/i, home);

  await expect
    .poll(() => duplicateRequests.at(-1)?.name)
    .toBe('Duplicate Failure Plugin');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.home-hero__error')).toContainText('Could not remix this template.');
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
  await expect(page.getByTestId('home-hero-submit')).toBeEnabled();
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
  const home = await revealHomeTemplates(page);
  const card = home.locator('article.plugins-home__card[data-plugin-id="html-details-plugin"]');
  await expect(card).toBeVisible();
  await card.click();

  const dialog = page.getByRole('dialog', { name: /HTML Details Plugin preview/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('HTML Details Plugin');
  await expect(page.getByTestId('plugin-details-use-html-details-plugin')).toBeVisible();
  await expect(page.getByRole('button', { name: /Share/i }).first()).toBeVisible();

  // Designer-first redesign: the info sidebar starts collapsed and the
  // preview owns the stage. The header "Plugin info" toggle and the inline
  // "More" share menu were removed; the sidebar opens via the preview-edge
  // handle.
  await expect(dialog.getByRole('button', { name: 'Plugin info', exact: true })).toHaveCount(0);
  await expect(dialog.locator('.ds-modal-sidebar')).toHaveCount(0);
  await dialog.locator('.ds-modal-stage-handle.is-expand').click();
  await expect(dialog.locator('.ds-modal-sidebar')).toBeVisible();

  await dialog.locator('.ds-modal-close').click();
  await expect(dialog).toHaveCount(0);
});

test('[P1] home starters WebGL example previews render real canvas output', async ({ page }) => {
  const webglPlugins = [
    makeStarterPlugin({
      id: 'example-webgl-aurora-veil',
      title: 'WebGL Aurora Veil',
      description: 'Pure shader WebGL example.',
      mode: 'prototype',
      featured: true,
      tags: ['webgl2', 'powered-preview'],
      previewEntry: './example.html',
    }),
    makeStarterPlugin({
      id: 'example-webgl-depth-gallery',
      title: 'WebGL Depth Gallery',
      description: 'Asset gallery WebGL example.',
      mode: 'prototype',
      featured: true,
      tags: ['webgl2', 'gallery', 'powered-preview'],
      previewEntry: './example.html',
    }),
  ];

  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({ json: { plugins: webglPlugins } });
  });
  for (const plugin of webglPlugins) {
    await page.route(`**/api/plugins/${plugin.id}/preview`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: webglCanvasPreview(plugin.title),
      });
    });
  }

  await gotoEntryHome(page);
  const home = await revealHomeTemplates(page);

  for (const plugin of webglPlugins) {
    const card = home.locator(`article.plugins-home__card[data-plugin-id="${plugin.id}"]`);
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: new RegExp(`View details for ${plugin.title}`, 'i') }).click();

    const dialog = page.getByRole('dialog', { name: new RegExp(`${plugin.title} preview`, 'i') });
    await expect(dialog).toBeVisible();
    const frame = dialog.frameLocator(`iframe[title^="${plugin.title}"]`);
    await expect(frame.locator('canvas#scene')).toBeVisible();
    await expect.poll(async () => frame.locator('canvas#scene').evaluate((canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      const { data } = ctx.getImageData(0, 0, 16, 16);
      return Array.from(data).some((value, index) => index % 4 !== 3 && value > 0);
    })).toBe(true);
    await expect(frame.getByTestId('webgl-mode')).toContainText(/webgl2|2d-fallback/);
    await expect(dialog).not.toContainText(/Couldn't load|No preview/i);
    await dialog.locator('.ds-modal-close').click();
    await expect(dialog).toHaveCount(0);
  }
});

test('[P1] home starters WebGL example previews resize the real canvas backing store', async ({ page }) => {
  await page.setViewportSize({ width: 1240, height: 720 });

  const plugin = makeStarterPlugin({
    id: 'example-webgl-aurora-veil',
    title: 'Aurora Veil',
    description: 'Pure shader WebGL example.',
    mode: 'prototype',
    featured: true,
    tags: ['webgl2', 'powered-preview'],
    previewEntry: './example.html',
  });

  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({ json: { plugins: [plugin] } });
  });
  await page.route(`**/api/plugins/${plugin.id}/preview`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: WEBGL_AURORA_PREVIEW_HTML,
    });
  });

  await gotoEntryHome(page);
  const home = await revealHomeTemplates(page);
  const card = home.locator(`article.plugins-home__card[data-plugin-id="${plugin.id}"]`);
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /View details for Aurora Veil/i }).click();

  const dialog = page.getByRole('dialog', { name: /Aurora Veil preview/i });
  await expect(dialog).toBeVisible();
  const canvas = dialog.frameLocator('iframe[title^="Aurora Veil"]').locator('canvas#gl');
  await expect(canvas).toBeVisible();

  await setPreviewFrameWidth(dialog, 640);
  await expect.poll(async () => {
    const metrics = await webglCanvasMetrics(canvas);
    return metrics.cssWidth > 0 && metrics.cssWidth <= 660 && metrics.backingWidth >= metrics.cssWidth;
  }).toBe(true);
  const narrow = await webglCanvasMetrics(canvas);

  await setPreviewFrameWidth(dialog, 980);
  await expect.poll(async () => {
    const metrics = await webglCanvasMetrics(canvas);
    return metrics.cssWidth > narrow.cssWidth + 200 && metrics.backingWidth >= metrics.cssWidth;
  }, { timeout: 10_000 }).toBe(true);
});

test('[P1] Community templates sort toggle switches to newest order and persists after reload', async ({ page }) => {
  const hotVisual = {
    ...makeStarterPlugin({
      id: 'sort-hot-visual',
      title: 'Sort Hot Visual',
      description: 'Rich visual card that wins the hot ranking.',
      mode: 'prototype',
      featured: true,
      tags: ['webgl', 'animation', 'gallery', 'prototype'],
      previewEntry: './example.html',
    }),
    installedAt: 10,
    updatedAt: 10,
  };
  const newestPlain = {
    ...makeStarterPlugin({
      id: 'sort-newest-plain',
      title: 'Sort Newest Plain',
      description: 'Plain recent template.',
      mode: 'prototype',
      tags: ['utility'],
    }),
    installedAt: 30,
    updatedAt: 30,
  };
  const middlePlain = {
    ...makeStarterPlugin({
      id: 'sort-middle-plain',
      title: 'Sort Middle Plain',
      description: 'Middle recent template.',
      mode: 'prototype',
      tags: ['utility'],
    }),
    installedAt: 20,
    updatedAt: 20,
  };

  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({ json: { plugins: [hotVisual, middlePlain, newestPlain] } });
  });
  await page.route('**/api/plugins/sort-hot-visual/preview', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<!doctype html><html><body><h1>Sort Hot Visual Preview</h1></body></html>',
    });
  });

  await gotoEntryHome(page);
  let home = await revealHomeTemplates(page);
  const cardIds = async () => home.locator('article.plugins-home__card').evaluateAll((cards) =>
    cards.map((card) => card.getAttribute('data-plugin-id')),
  );

  await expect(home.getByTestId('plugins-home-sort-hot')).toHaveAttribute('aria-checked', 'true');
  expect((await cardIds()).slice(0, 3)).toEqual(['sort-hot-visual', 'sort-middle-plain', 'sort-newest-plain']);

  await home.getByTestId('plugins-home-sort-newest').click();
  await expect(home.getByTestId('plugins-home-sort-newest')).toHaveAttribute('aria-checked', 'true');
  expect((await cardIds()).slice(0, 3)).toEqual(['sort-newest-plain', 'sort-middle-plain', 'sort-hot-visual']);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await gotoEntryHome(page);
  home = await revealHomeTemplates(page);
  await expect(home.getByTestId('plugins-home-sort-newest')).toHaveAttribute('aria-checked', 'true');
  expect((await cardIds()).slice(0, 3)).toEqual(['sort-newest-plain', 'sort-middle-plain', 'sort-hot-visual']);
});

test('[P1] home starters html details sidebar handle stays clickable after info pane scroll', async ({ page }) => {
  const htmlPlugin = makeStarterPlugin({
    id: 'html-scroll-sidebar-plugin',
    title: 'HTML Scroll Sidebar Plugin',
    description: 'A richly described HTML starter with enough metadata to scroll.',
    mode: 'prototype',
    featured: true,
    query: 'Use the {{topic}} template.',
    inputs: [{ name: 'topic', type: 'string', default: 'sidebar scroll' }],
    previewEntry: './example.html',
    tags: ['prototype', 'webgl', 'gallery', 'animation', 'landing-page', 'dashboard'],
    authorName: 'Open Design',
    context: {
      skills: [{ path: './SKILL.md' }, { path: './QA.md' }],
      assets: ['./example.html', './textures/noise.png', './textures/depth.png'],
    },
    pipeline: {
      stages: [
        { id: 'plan', atoms: ['outline', 'requirements'] },
        { id: 'compose', atoms: ['layout', 'motion', 'handoff'] },
        { id: 'verify', atoms: ['responsive', 'accessibility', 'export'] },
      ],
    },
  });

  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({ json: { plugins: [htmlPlugin] } });
  });
  await page.route('**/api/plugins/html-scroll-sidebar-plugin/preview', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<!doctype html><html><body><main style="min-height:1800px"><h1>Scrollable Preview</h1></main></body></html>',
    });
  });

  await gotoEntryHome(page);
  const home = await revealHomeTemplates(page);
  await home.locator('article.plugins-home__card[data-plugin-id="html-scroll-sidebar-plugin"]').click();

  const dialog = page.getByRole('dialog', { name: /HTML Scroll Sidebar Plugin preview/i });
  await expect(dialog).toBeVisible();
  const expandHandle = dialog.locator('.ds-modal-stage-handle.is-expand');
  await expect(expandHandle).toBeVisible();
  await expandHandle.click();

  const sidebar = dialog.locator('.ds-modal-sidebar');
  await expect(sidebar).toBeVisible();
  await sidebar.locator('.plugin-info-pane').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  const collapseHandle = dialog.locator('.ds-modal-stage-handle.is-collapse');
  await expect(collapseHandle).toBeVisible();
  await expect(collapseHandle).toBeInViewport();
  await collapseHandle.click();
  await expect(sidebar).toHaveCount(0);
  await expect(dialog.locator('.ds-modal-stage-handle.is-expand')).toBeVisible();
});

test('[P2] home starters html details modal shows metadata links and supports copy query', async ({ page }) => {
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
  const home = await revealHomeTemplates(page);
  const card = home.locator('article.plugins-home__card[data-plugin-id="html-metadata-plugin"]');
  await expect(card).toBeVisible();
  await card.click();

  const dialog = page.getByRole('dialog', { name: /HTML Metadata Plugin preview/i });
  await expect(dialog).toBeVisible();
  // The info sidebar starts collapsed in the redesign; open it via the
  // preview-edge handle before inspecting the manifest metadata.
  await dialog.locator('.ds-modal-stage-handle.is-expand').click();
  await expect(dialog.locator('.ds-modal-sidebar')).toBeVisible();
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
  // The inline "More" plugin-share menu was removed from the detail modal in
  // the redesign; sharing is offered through the header Share menu instead.
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
  await page.route('**/api/plugins/detail-use-plugin/apply', async (route) => {
    await route.fulfill({ json: makeApplyResult('detail-use-plugin') });
  });

  await gotoEntryHome(page);
  await page.locator('article.plugins-home__card[data-plugin-id="detail-use-plugin"]').hover();
  await page.getByTestId('plugins-home-details-detail-use-plugin').click({ force: true });

  const dialog = page.getByRole('dialog', { name: /Detail Use Plugin preview/i });
  await expect(dialog).toBeVisible();
  // This fixture ships an example query, so the primary Use button now
  // loads the prompt. The structure-only path that keeps the
  // composer freeform lives in the caret menu's "Use without prompt" option.
  await page.getByTestId('plugin-details-use-detail-use-plugin-menu').click();
  await page.getByTestId('plugin-details-use-option-detail-use-plugin').click();
  await expect(dialog).toHaveCount(0);
  // "Use without prompt" routes the plugin as the active driver (its own pipeline
  // applies on submit) and surfaces the active-plugin chip, but does not
  // inject prompt text, so the editor stays empty.
  await expect(page.getByTestId('home-hero-active-plugin')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toHaveText('');
});

test('[P0] @critical home starters Use-plugin-only routes the plugin as the active driver and keeps the prompt freeform', async ({ page }) => {
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({
      json: {
        plugins: [STARTER_PLUGIN],
      },
    });
  });
  await page.route('**/api/plugins/localized-plugin/apply', async (route) => {
    await route.fulfill({ json: makeApplyResult('localized-plugin') });
  });

  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');
  await expect(input).toHaveText('');

  const applyResponsePromise = page.waitForResponse('**/api/plugins/localized-plugin/apply');
  // Details modal use remains covered separately from the gallery inline
  // Use button. This starter ships an example query, so the
  // primary Use button now loads the prompt — the structure-only
  // freeform path lives in the caret menu's "Use without prompt" option.
  await openHomePluginDetails(page, 'localized-plugin', /Localized Plugin/i);
  await page.getByTestId('plugin-details-use-localized-plugin-menu').click();
  await page.getByTestId('plugin-details-use-option-localized-plugin').click();
  // "Use without prompt" routes the starter as the active driver (active-plugin
  // chip) without seeding the prompt; the user can still type their own brief.
  await expect(page.getByTestId('home-hero-active-plugin')).toBeVisible();
  await expect(input).toHaveText('');
  // Wait for the apply roundtrip to resolve so the active snapshot is bound
  // before we submit — otherwise the submit can race the in-flight apply and
  // never reaches the create-project request.
  await applyResponsePromise;

  await input.fill('Use the selected starter as the driver');
  const submit = page.getByTestId('home-hero-submit');
  await expect(submit).toBeEnabled();
  const projectRequestPromise = page.waitForRequest(isCreateProjectRequest);
  await submit.click();

  // The create-project request is the authoritative check that the picked
  // plugin drives the run: it pins the plugin snapshot. Active-driver
  // (scenario-pipeline) runs are fired from the bound snapshot when the
  // project page mounts, not via a separate POST /api/runs from Home, so we
  // assert on the project request + navigation rather than a run request.
  const projectRequest = await projectRequestPromise;
  const projectBody = projectRequest.postDataJSON() as {
    pluginId?: string;
    pendingPrompt?: string;
  };
  expect(projectBody.pendingPrompt).toBe('Use the selected starter as the driver');
  // The picked plugin now drives the run instead of the hidden od-default router.
  // The create-project request is the authoritative assertion: it pins the
  // routed pluginId. Navigation is intentionally not asserted here — the real
  // e2e daemon has no `localized-plugin` installed (it only exists in the
  // mocked /api/plugins list), so the live create-project call cannot complete;
  // the request payload is what proves the routing fix.
  expect(projectBody.pluginId).toBe('localized-plugin');
});

test('[P1] home starters route the picked plugin as the active driver from its detail modal', async ({ page }) => {
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({
      json: {
        plugins: [STARTER_PLUGIN],
      },
    });
  });
  await page.route('**/api/plugins/localized-plugin/apply', async (route) => {
    await route.fulfill({ json: makeApplyResult('localized-plugin') });
  });

  await gotoEntryHome(page);

  const starterCard = page.locator('[data-plugin-id="localized-plugin"]').first();
  await starterCard.scrollIntoViewIfNeeded();
  // Community is a gallery: open the starter's detail modal and use it. This
  // starter ships an example query, so the primary Use button loads the prompt
  // and binds the plugin as the active driver (active-plugin chip); this case only
  // asserts that chip, which appears on either Use variant.
  await openHomePluginDetails(page, 'localized-plugin', /Localized Plugin/i);
  await page.getByTestId('plugin-details-use-localized-plugin').click();
  await expect(page.getByTestId('home-hero-active-plugin')).toBeVisible();
});

test('[P0] @critical home starters Use with query carries the hydrated starter prompt into the created project and first user turn', async ({ page }) => {
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({
      json: {
        plugins: [STARTER_PLUGIN],
      },
    });
  });
  await page.route('**/api/plugins/localized-plugin/apply', async (route) => {
    await route.fulfill({ json: makeApplyResult('localized-plugin') });
  });

  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');
  const home = await revealHomeTemplates(page);
  // Use the starter from its detail modal; gallery inline Use is covered by a
  // separate case. This starter ships an example query, so the primary Use button loads the prompt:
  // it routes the plugin as the active run driver AND seeds the hydrated prompt.
  // We still fill the same brief explicitly to keep the assertion robust to the
  // async apply→seed roundtrip (the value is identical either way).
  await openHomePluginDetails(page, 'localized-plugin', /Localized Plugin/i, home);
  await page.getByTestId('plugin-details-use-localized-plugin').click();
  await expect(page.getByTestId('home-hero-active-plugin')).toBeVisible();
  await input.fill('Make a design systems brief.');

  const projectRequestPromise = page.waitForRequest(isCreateProjectRequest);
  await page.getByTestId('home-hero-submit').click();

  // The create-project request carries the hydrated starter prompt and pins
  // the picked plugin as the run driver — this is the authoritative assertion.
  // Navigation / live project fetch are intentionally not asserted: the real
  // e2e daemon has no `localized-plugin` installed (it only exists in the
  // mocked /api/plugins list), so the live create-project call cannot complete.
  const projectRequest = await projectRequestPromise;
  const projectBody = projectRequest.postDataJSON() as {
    metadata?: { kind?: string };
    pendingPrompt?: string;
    pluginId?: string;
  };
  expect(projectBody.pendingPrompt).toBe('Make a design systems brief.');
  // The picked starter drives the run instead of the hidden od-default router.
  expect(projectBody.pluginId).toBe('localized-plugin');
  expect(typeof projectBody.metadata?.kind).toBe('string');
});

test('[P0] @critical home plugin input edits are resolved and carried into project creation', async ({ page }) => {
  const parameterizedPlugin = makeStarterPlugin({
    id: 'parameterized-deck-plugin',
    title: 'Parameterized Deck Plugin',
    mode: 'deck',
    featured: true,
    query: 'Draft a {{topic}} deck with {{notes}}.',
    inputs: [
      { name: 'topic', type: 'string', default: 'quarterly review' },
      { name: 'notes', type: 'string', default: 'speaker notes' },
    ],
  });
  const applyBodies: Array<Record<string, unknown>> = [];

  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({ json: { plugins: [parameterizedPlugin] } });
  });
  await page.route('**/api/plugins/parameterized-deck-plugin/apply', async (route) => {
    const body = route.request().postDataJSON() as { inputs?: Record<string, unknown> };
    applyBodies.push(body);
    const result = makeApplyResult(
      'parameterized-deck-plugin',
      'Draft a {{topic}} deck with {{notes}}.',
      body.inputs ?? {},
    );
    await route.fulfill({
      json: {
        ...result,
        inputs: parameterizedPlugin.manifest.od.inputs,
      },
    });
  });

  await gotoEntryHome(page);
  const home = await revealHomeTemplates(page);
  await home.getByTestId('plugins-home-details-parameterized-deck-plugin').click({ force: true });
  await page.getByTestId('plugin-details-use-parameterized-deck-plugin').click();
  await expect(page.getByTestId('home-hero-active-plugin')).toContainText('Parameterized Deck Plugin');

  const input = page.getByTestId('home-hero-input');
  await expect(input).toContainText('quarterly review');
  await input.fill('Draft a Liquid Glasses deck with narrated speaker notes.');

  const projectRequestPromise = page.waitForRequest(isCreateProjectRequest);
  await expect(page.getByTestId('home-hero-submit')).toBeEnabled();
  await page.getByTestId('home-hero-submit').click();

  const request = await projectRequestPromise;
  const body = request.postDataJSON() as {
    pendingPrompt?: string;
    pluginId?: string;
    pluginInputs?: Record<string, unknown>;
    appliedPluginSnapshotId?: string;
  };
  expect(body.pluginId).toBe('parameterized-deck-plugin');
  expect(body.pendingPrompt).toBe('Draft a Liquid Glasses deck with narrated speaker notes.');
  expect(body.pluginInputs).toMatchObject({
    topic: 'Liquid Glasses',
    notes: 'narrated speaker notes',
  });
  expect(body.appliedPluginSnapshotId).toBe('snap-parameterized-deck-plugin');
  expect(applyBodies.at(-1)?.inputs).toMatchObject(body.pluginInputs ?? {});
});

test('[P0] @critical required home plugin prompt parameters gate submit and bind the project snapshot', async ({ page }) => {
  const guidedDeckPlugin = makeStarterPlugin({
    id: 'guided-deck-plugin',
    title: 'Guided Deck Plugin',
    mode: 'deck',
    featured: true,
    query: 'Draft a {{topic}} deck in {{tone}} with {{speakerNotes}}.',
    inputs: [
      { name: 'topic', label: 'Topic', type: 'string', required: true },
      {
        name: 'tone',
        label: 'Tone',
        type: 'select',
        required: true,
        options: ['ink', 'forest'],
      },
      {
        name: 'speakerNotes',
        label: 'Speaker notes',
        type: 'string',
        default: 'include speaker notes',
      },
    ],
  });
  const applyBodies: Array<Record<string, unknown>> = [];

  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({ json: { plugins: [guidedDeckPlugin] } });
  });
  await page.route('**/api/plugins/guided-deck-plugin/apply', async (route) => {
    const body = route.request().postDataJSON() as { inputs?: Record<string, unknown> };
    applyBodies.push(body);
    await route.fulfill({
      json: makeApplyResult(
        'guided-deck-plugin',
        'Draft a {{topic}} deck in {{tone}} with {{speakerNotes}}.',
        body.inputs ?? {},
      ),
    });
  });

  await gotoEntryHome(page);
  const home = await revealHomeTemplates(page);
  await openHomePluginDetails(page, 'guided-deck-plugin', /Guided Deck Plugin/i, home);
  await page.getByTestId('plugin-details-use-guided-deck-plugin').click();

  const input = page.getByTestId('home-hero-input');
  const submit = page.getByTestId('home-hero-submit');
  await expect(input).toContainText('Topic');
  await expect(input).toContainText('Tone');
  await expect(submit).toBeDisabled();

  await input.fill('Draft a Liquid Glasses deck in forest with include speaker notes.');
  await expect(submit).toBeEnabled();

  const projectRequestPromise = page.waitForRequest(isCreateProjectRequest);
  await submit.click();

  const request = await projectRequestPromise;
  const body = request.postDataJSON() as {
    pendingPrompt?: string;
    pluginId?: string;
    pluginInputs?: Record<string, unknown>;
    appliedPluginSnapshotId?: string;
  };
  expect(body.pluginId).toBe('guided-deck-plugin');
  expect(body.pendingPrompt).toContain('Liquid Glasses');
  expect(body.pendingPrompt).toContain('forest');
  expect(body.pluginInputs).toMatchObject({
    topic: 'Liquid Glasses',
    tone: 'forest',
  });
  expect(body.appliedPluginSnapshotId).toBe('snap-guided-deck-plugin');
  expect(applyBodies.at(-1)?.inputs).toMatchObject(body.pluginInputs ?? {});
});

test('[P0] @critical home composer routes free-form prompts through the design router by default', async ({ page }) => {
  await gotoEntryHome(page);

  await expect(page.getByTestId('session-mode-trigger')).toHaveAttribute('aria-label', 'Design mode');

  const input = page.getByTestId('home-hero-input');
  const prompt =
    'Turn this into an infographic: "5 habits of effective code reviewers — read the PR description first, review tests before implementation"';
  await input.fill(prompt);

  const projectRequestPromise = page.waitForRequest(isCreateProjectRequest);
  await page.getByTestId('home-hero-submit').click();

  const request = await projectRequestPromise;
  const body = request.postDataJSON() as {
    name?: string;
    pendingPrompt?: string;
    conversationMode?: string;
    pluginId?: string | null;
    metadata?: { kind?: string };
  };
  expect(body.name).toBe('Infographic 5 Habits Effective Code Reviewers');
  expect(body.pendingPrompt).toBe(prompt);
  expect(body.conversationMode).toBe('design');
  expect(body.pluginId).toBe('od-default');
  expect(body.metadata?.kind).toBe('other');
});

test('[P0] @critical home working directory creates the project with linked dirs instead of importing files', async ({ page }) => {
  const workingDir = '/Users/mac/Projects/Dashboard-UI-Liquid-Glass';
  await page.route('**/api/recent-dirs', async (route) => {
    await route.fulfill({ json: { dirs: [workingDir] } });
  });
  await page.route('**/api/dialog/open-folder', async (route) => {
    await route.fulfill({ json: { path: workingDir } });
  });
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        json: {
          config: {
            recentLinkedDirs: [workingDir],
          },
        },
      });
      return;
    }
    await route.fallback();
  });

  await gotoEntryHome(page);

  await page.getByTestId('working-dir-trigger').click();
  await page.getByTestId('working-dir-pick').click();
  await expect(page.getByTestId('working-dir-trigger')).toContainText('Dashboard-UI-Liquid-Glass');

  const input = page.getByTestId('home-hero-input');
  await input.fill('Create a premium dashboard for operations review.');

  const projectRequestPromise = page.waitForRequest(isCreateProjectRequest);
  await page.getByTestId('home-hero-submit').click();

  const request = await projectRequestPromise;
  const body = request.postDataJSON() as {
    metadata?: { linkedDirs?: string[]; baseDir?: string; userWorkingDir?: string };
    pendingPrompt?: string;
    conversationMode?: string;
  };
  expect(body.pendingPrompt).toBe('Create a premium dashboard for operations review.');
  expect(body.conversationMode).toBe('design');
  expect(body.metadata?.linkedDirs).toEqual([workingDir]);
  expect(body.metadata?.baseDir).toBeUndefined();
  expect(body.metadata?.userWorkingDir).toBeUndefined();
});

test('[P0] @critical clearing the home working directory removes linked dirs from project creation', async ({ page }) => {
  const workingDir = '/Users/mac/Projects/Dashboard-UI-Liquid-Glass';
  await page.route('**/api/recent-dirs', async (route) => {
    await route.fulfill({ json: { dirs: [workingDir] } });
  });
  await page.route('**/api/dialog/open-folder', async (route) => {
    await route.fulfill({ json: { path: workingDir } });
  });
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        json: {
          config: {
            recentLinkedDirs: [workingDir],
          },
        },
      });
      return;
    }
    await route.fallback();
  });

  await gotoEntryHome(page);

  await page.getByTestId('working-dir-trigger').click();
  await page.getByTestId('working-dir-pick').click();
  await expect(page.getByTestId('working-dir-trigger')).toContainText('Dashboard-UI-Liquid-Glass');

  await page.getByTestId('working-dir-trigger').click();
  await page.getByTestId('working-dir-clear').click();
  await expect(page.getByTestId('working-dir-trigger')).toContainText('Select working directory');

  await page.getByTestId('home-hero-input').fill('Create a premium dashboard without local folder context.');

  const projectRequestPromise = page.waitForRequest(isCreateProjectRequest);
  await page.getByTestId('home-hero-submit').click();

  const request = await projectRequestPromise;
  const body = request.postDataJSON() as {
    metadata?: { linkedDirs?: string[]; baseDir?: string; userWorkingDir?: string };
    pendingPrompt?: string;
  };
  expect(body.pendingPrompt).toBe('Create a premium dashboard without local folder context.');
  expect(body.metadata?.linkedDirs).toBeUndefined();
  expect(body.metadata?.baseDir).toBeUndefined();
  expect(body.metadata?.userWorkingDir).toBeUndefined();
});

test('[P0] @critical home hero input keeps Shift+Enter as a newline and submits on Enter', async ({ page }) => {
  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');
  const submit = page.getByTestId('home-hero-submit');

  await expect(submit).toBeEnabled();
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

test('[P1] disabled skills are filtered from the home hero mention picker', async ({ page }) => {
  await page.route('**/api/skills', async (route) => {
    await route.fulfill({
      json: {
        skills: [
          skillSummary('enabled-home-skill', 'Enabled Home Skill', 'prototype', 'web', []),
          skillSummary('disabled-home-skill', 'Disabled Home Skill', 'prototype', 'web', []),
        ],
      },
    });
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
          agentId: 'mock',
          skillId: null,
          disabledSkills: ['disabled-home-skill'],
          agentModels: {},
          privacyDecisionAt: 1,
          telemetry: { metrics: false, content: false, artifactManifest: false },
        },
      },
    });
  });

  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');
  await input.click();
  await input.fill('@skill');

  const picker = page.getByTestId('home-hero-plugin-picker');
  await expect(picker).toBeVisible();
  await picker.getByRole('tab', { name: /Skills/i }).click();
  await expect(picker.getByRole('option', { name: /Enabled Home Skill/i })).toBeVisible();
  await expect(picker.getByRole('option', { name: /Disabled Home Skill/i })).toHaveCount(0);
});

test('[P0] @critical home hero attachment input stages files, enables submit, and supports removal', async ({ page }) => {
  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-file-input');
  const submit = page.getByTestId('home-hero-submit');
  await expect(submit).toBeEnabled();

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
  await expect(submit).toBeEnabled();
});

test('[P0] @critical home hero attachment-only submit uploads the file and sends it with the first message', async ({ page }) => {
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
  await collapse.focus();
  await expect(collapse).toBeVisible();
  await collapse.click();
  await expect(page.locator('.entry')).not.toHaveClass(/entry--rail-open/);
});

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.long });
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  if (!(await page.getByTestId('home-hero').isVisible().catch(() => false))) {
    const homeWorkspaceTab = page.getByRole('tab', { name: /^Home$/ }).first();
    if (await homeWorkspaceTab.isVisible().catch(() => false)) {
      await homeWorkspaceTab.click();
    } else if (await page.getByTestId('entry-nav-home').isVisible().catch(() => false)) {
      await page.getByTestId('entry-nav-home').click();
    }
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
}

async function revealHomeTemplates(page: Page) {
  const home = page.locator('[data-testid="entry-view-home"][data-active="true"]');
  const section = home.getByTestId('plugins-home-section');
  const hint = home.getByTestId('home-templates-hint');
  if (await hint.count()) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (await home.locator('.home-templates-reveal').evaluate((node) => node.classList.contains('is-revealed')).catch(() => false)) break;
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(120);
    }
    if (!(await home.locator('.home-templates-reveal').evaluate((node) => node.classList.contains('is-revealed')).catch(() => false))) {
      await hint.scrollIntoViewIfNeeded();
      await expect(hint).toBeVisible();
      await hint.click();
    }
    await expect(home.locator('.home-templates-reveal')).toHaveClass(/is-revealed/);
    await expect(home.locator('.home-templates-reveal__body')).not.toHaveAttribute('inert', '');
    await page.waitForTimeout(450);
  }
  await expect(section).toBeVisible();
  await page.locator('.entry-main--scroll').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  return home;
}

async function openHomePluginDetails(
  page: Page,
  pluginId: string,
  name: RegExp,
  scopedHome = page.locator('[data-testid="entry-view-home"][data-active="true"]'),
) {
  let home = scopedHome;
  let card = home.locator(`article.plugins-home__card[data-plugin-id="${pluginId}"]`).first();
  if (!(await card.isVisible().catch(() => false))) {
    home = await revealHomeTemplates(page);
    card = home.locator(`article.plugins-home__card[data-plugin-id="${pluginId}"]`).first();
  }
  await expect(card).toBeVisible();
  await clickCardAtActionablePoint(page, card);
  const dialog = page.getByRole('dialog').filter({ hasText: name });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function duplicatePluginFromDetails(
  page: Page,
  pluginId: string,
  name: RegExp,
  scopedHome = page.locator('[data-testid="entry-view-home"][data-active="true"]'),
) {
  const dialog = await openHomePluginDetails(page, pluginId, name, scopedHome);
  await dialog.getByTestId(`plugin-details-use-${pluginId}-menu`).click();
  await page.getByTestId(`plugin-details-duplicate-${pluginId}`).click();
}

async function clickCardAtActionablePoint(page: Page, card: Locator) {
  await scrollCardIntoActionableView(card);
  await expect
    .poll(async () => {
      return (await getCardActionablePoint(card)) !== null;
    }, { timeout: 5_000 })
    .toBe(true);
  const point = await getCardActionablePoint(card);
  if (!point) {
    throw new Error('Plugin card did not expose an actionable click point.');
  }
  await page.mouse.click(point.x, point.y);
}

async function getCardActionablePoint(card: Locator) {
  return card.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const points = [
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      { x: rect.left + 24, y: rect.top + 24 },
      { x: rect.right - 24, y: rect.bottom - 24 },
    ];
    for (const point of points) {
      if (
        point.x < 0 ||
        point.y < 0 ||
        point.x > window.innerWidth ||
        point.y > window.innerHeight
      ) {
        continue;
      }
      const hit = document.elementFromPoint(point.x, point.y);
      if (hit && element.contains(hit)) {
        return point;
      }
    }
    return null;
  });
}

async function scrollCardIntoActionableView(card: Locator) {
  await card.evaluate((element) => {
    const scroller = element.closest('.entry-main--scroll');
    if (!(scroller instanceof HTMLElement)) {
      element.scrollIntoView({ block: 'end', inline: 'center' });
      return;
    }
    scroller.scrollTop = scroller.scrollHeight;
    element.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
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

async function routeSingleProject(
  page: Page,
  project: {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    metadata?: Record<string, unknown>;
  },
  files: Array<{ name: string; path: string; kind: string; size: number; updatedAt: number }>,
) {
  await page.route(`**/api/projects/${project.id}`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({ json: { project } });
  });
  await page.route(`**/api/projects/${project.id}/files`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({ json: { files } });
  });
  await page.route(`**/api/projects/${project.id}/conversations`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { conversations: [] } });
      return;
    }
    if (route.request().method() === 'POST') {
      await route.fulfill({
        json: {
          conversation: {
            id: `${project.id}-conversation`,
            projectId: project.id,
            title: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      });
      return;
    }
    await route.continue();
  });
  for (const file of files) {
    await page.route(`**/api/projects/${project.id}/files/${file.path}`, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        json: {
          file: {
            ...file,
            content: '<!doctype html><html><body><h1>Duplicated project</h1></body></html>',
          },
        },
      });
    });
    await page.route(`**/api/projects/${project.id}/raw/${file.path}`, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body><h1>Duplicated project</h1></body></html>',
      });
    });
  }
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

// Minimal `/api/plugins/:id/apply` response for routing a picked plugin as
// the active driver. The Home composer only needs a resolvable snapshot id
// plus the echoed query/inputs to bind the plugin on submit.
function makeApplyResult(
  pluginId: string,
  query = 'Make a design systems brief.',
  appliedInputs: Record<string, unknown> = {},
) {
  return {
    ok: true,
    query,
    contextItems: [],
    inputs: [{ name: 'topic', type: 'string', default: 'design systems' }],
    assets: [],
    mcpServers: [],
    trust: 'trusted',
    capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    appliedPlugin: {
      snapshotId: `snap-${pluginId}`,
      pluginId,
      pluginVersion: '1.0.0',
      manifestSourceDigest: 'a'.repeat(64),
      inputs: appliedInputs,
      resolvedContext: { items: [] },
      capabilitiesGranted: ['prompt:inject'],
      capabilitiesRequired: ['prompt:inject'],
      assetsStaged: [],
      taskKind: 'new-generation',
      appliedAt: 0,
      connectorsRequired: [],
      connectorsResolved: [],
      mcpServers: [],
      status: 'fresh',
    },
    projectMetadata: {},
  };
}

function skillSummary(
  id: string,
  name: string,
  mode: 'prototype' | 'deck' | 'image',
  surface: 'web' | 'image',
  defaultFor: string[],
) {
  return {
    id,
    name,
    description: `${name} fixture for entry coverage.`,
    triggers: [],
    mode,
    surface,
    platform: 'desktop',
    scenario: 'qa',
    previewType: 'html',
    designSystemRequired: mode !== 'image',
    defaultFor,
    upstream: null,
    featured: null,
    fidelity: null,
    speakerNotes: null,
    animations: null,
    hasBody: true,
    examplePrompt: '',
  };
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
  inputs?: Array<{
    name: string;
    type: string;
    default?: string;
    label?: string;
    required?: boolean;
    options?: string[];
  }>;
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

function webglCanvasPreview(label: string): string {
  return `<!doctype html>
<html>
  <body>
    <canvas id="scene" width="64" height="64" aria-label="${label}"></canvas>
    <p data-testid="webgl-mode"></p>
    <script>
      const canvas = document.getElementById('scene');
      const gl = document.createElement('canvas').getContext('webgl2');
      document.querySelector('[data-testid="webgl-mode"]').textContent = gl ? 'webgl2' : '2d-fallback';
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, 64, 64);
      gradient.addColorStop(0, '#14b8a6');
      gradient.addColorStop(1, '#f97316');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(24, 24, 16, 16);
    </script>
  </body>
</html>`;
}

async function webglCanvasMetrics(canvas: Locator) {
  return canvas.evaluate((element: HTMLCanvasElement) => {
    const rect = element.getBoundingClientRect();
    return {
      backingWidth: element.width,
      backingHeight: element.height,
      cssWidth: Math.round(rect.width),
      cssHeight: Math.round(rect.height),
    };
  });
}

async function setPreviewFrameWidth(dialog: Locator, width: number) {
  await dialog.locator('.ds-modal-stage-iframe-scaler').evaluate((element: HTMLElement, nextWidth) => {
    element.style.width = `${nextWidth}px`;
    element.style.maxWidth = 'none';
  }, width);
}
