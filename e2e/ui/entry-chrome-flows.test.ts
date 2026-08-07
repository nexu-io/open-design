import { readFileSync } from 'node:fs';
import { expect, test } from '@/playwright/suite';
import { ensureRailOpen, openNewProjectModal } from '@/playwright/rail';
import { settingsSurface } from '@/playwright/amr';
import { expectStableCount } from '@/playwright/assertions';
import { openHomeTemplateMenu, pickHomeTemplate } from '@/playwright/home-hero';
import type {
  WorkspaceCollabContext,
  WorkspaceDirectoryItem,
} from '@open-design/contracts';
import type { Locator, Page, Request } from '@playwright/test';
import { applyStandardMocks, fulfillAgentsRoute, routeSuccessfulRuns, STORAGE_KEY } from '@/playwright/mock-factory';
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
const TAB_PERSONAL_WORKSPACE = {
  workspaceId: 'ws-tab-personal',
  workspaceName: 'Personal workspace',
  workspaceType: 'personal',
  workspaceMemberId: 'wm-tab-personal',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
} satisfies WorkspaceDirectoryItem;
const TAB_TEAM_WORKSPACE = {
  workspaceId: 'ws-tab-team',
  workspaceName: 'Team Atlas',
  workspaceType: 'team',
  workspaceMemberId: 'wm-tab-team',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
} satisfies WorkspaceDirectoryItem;

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
  await expect(page.getByTestId('recent-projects-strip')).toHaveCount(0);
  // The nav rail is collapsed by default — the pinned Home tab in the
  // workspace tabs bar is the expand toggle (#5517: no entry topbar).
  await expect(page.getByTestId('workspace-home-rail-toggle')).toBeVisible();
  await page.getByTestId('workspace-home-rail-toggle').click();
  await expect(page.locator('.entry-nav-rail')).toBeVisible();
  await expect(page.getByTestId('entry-nav-search')).toBeVisible();
  await expect(page.locator('.entry-brand')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
  await expect(page.getByTestId('home-hero-plus-trigger')).toBeVisible();
  // Empty input can still run the active placeholder-carousel suggestion.
  await expect(page.getByTestId('home-hero-submit')).toBeEnabled();
  await expect(page.getByTestId('home-hero-template-picker')).toBeVisible();
  await expect(page.getByTestId('home-hero-design-system-picker')).toBeVisible();
  await expect(page.getByTestId('working-dir-picker')).toBeVisible();
  // #5517 deleted the inline scenario rail (the "Start from a template… / …or
  // create a blank project" row and its cards); the composer footer's Template
  // picker owns every project type now.
  const templateMenu = await openHomeTemplateMenu(page);
  for (const id of ['prototype', 'live-artifact', 'deck', 'image', 'video', 'hyperframes', 'audio']) {
    await expect(templateMenu.getByTestId(`home-hero-template-wedge-${id}`)).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(templateMenu).toHaveCount(0);

  // The pet picker rail was removed; pet adoption now lives in
  // Settings → Pet exclusively. Make sure no rail leaks back into the
  // entry layout.
  await expect(page.locator('.pet-rail')).toHaveCount(0);

  await page.getByTestId('entry-settings-button').click();
  // From the entry, settings routes to a page surface rather than a modal.
  const settingsDialog = settingsSurface(page);
  await expect(settingsDialog).toBeVisible();
  // The surface's own <h2> is consumed as its accessible name (aria-labelledby),
  // so assert on the section nav instead.
  await expect(settingsDialog.getByTestId('settings-nav-execution')).toBeVisible();
  await expect(settingsDialog.getByRole('button', { name: /hide pet picker/i })).toHaveCount(0);
  await expect(settingsDialog.getByRole('button', { name: /show pet picker/i })).toHaveCount(0);
});

test('[P0] @critical workspace selection remains isolated across two browser tabs', async ({ page, context }) => {
  const server = { activeWorkspaceId: TAB_PERSONAL_WORKSPACE.workspaceId };
  const requestsA: WorkspaceContextRequestWitness[] = [];
  const requestsB: WorkspaceContextRequestWitness[] = [];
  await routeTabWorkspaceApi(page, server, requestsA);

  const pageB = await context.newPage();
  try {
    await applyStandardMocks(pageB);
    await routeTabWorkspaceApi(pageB, server, requestsB);

    await Promise.all([gotoEntryHome(page), gotoEntryHome(pageB)]);
    await Promise.all([ensureRailOpen(page), ensureRailOpen(pageB)]);

    await expect(page.getByTestId('workspace-switcher')).toContainText(
      TAB_PERSONAL_WORKSPACE.workspaceName,
    );
    await expect(pageB.getByTestId('workspace-switcher')).toContainText(
      TAB_PERSONAL_WORKSPACE.workspaceName,
    );
    expect(await readTabWorkspaceSelection(page)).toEqual({
      workspaceId: TAB_PERSONAL_WORKSPACE.workspaceId,
      workspaceMemberId: TAB_PERSONAL_WORKSPACE.workspaceMemberId,
    });
    expect(await readTabWorkspaceSelection(pageB)).toEqual({
      workspaceId: TAB_PERSONAL_WORKSPACE.workspaceId,
      workspaceMemberId: TAB_PERSONAL_WORKSPACE.workspaceMemberId,
    });

    await page.getByTestId('workspace-switcher').click();
    await page.getByRole('menuitem', { name: TAB_TEAM_WORKSPACE.workspaceName }).click();
    await expect(page.getByTestId('workspace-switcher')).toContainText(
      TAB_TEAM_WORKSPACE.workspaceName,
    );

    // The compatibility endpoint's echo changed to Team, but that server-side
    // value is not browser authority. Tab B keeps its own session selection.
    expect(server.activeWorkspaceId).toBe(TAB_TEAM_WORKSPACE.workspaceId);
    expect(await readTabWorkspaceSelection(page)).toEqual({
      workspaceId: TAB_TEAM_WORKSPACE.workspaceId,
      workspaceMemberId: TAB_TEAM_WORKSPACE.workspaceMemberId,
    });
    expect(await readTabWorkspaceSelection(pageB)).toEqual({
      workspaceId: TAB_PERSONAL_WORKSPACE.workspaceId,
      workspaceMemberId: TAB_PERSONAL_WORKSPACE.workspaceMemberId,
    });
    await expect(pageB.getByTestId('workspace-switcher')).toContainText(
      TAB_PERSONAL_WORKSPACE.workspaceName,
    );

    // An ambient Personal read may already be in flight when the switch click
    // begins. The switch response retires that request before it can commit,
    // but the mock records requests at dispatch time. Start the post-switch
    // witness after the Team selection is visibly and durably adopted so only
    // reads issued under the new identity are judged below.
    const requestsABeforeSwitch = requestsA.length;

    // Exercise both ambient revalidation edges with the two tabs active at the
    // same time. The poll retries only an idempotent browser event until the
    // one-second GET coalescing window expires; there is no fixed sleep.
    await refreshTabsInterleaved(
      { page, eventName: 'focus', requests: requestsA },
      { page: pageB, eventName: 'pageshow', requests: requestsB },
    );
    await refreshTabsInterleaved(
      { page, eventName: 'pageshow', requests: requestsA },
      { page: pageB, eventName: 'focus', requests: requestsB },
    );

    const teamReads = requestsA.slice(requestsABeforeSwitch);
    expect(teamReads.length).toBeGreaterThanOrEqual(2);
    for (const request of teamReads) {
      expect(request).toEqual({
        workspaceId: TAB_TEAM_WORKSPACE.workspaceId,
        workspaceMemberId: TAB_TEAM_WORKSPACE.workspaceMemberId,
      });
    }
    expect(requestsB.length).toBeGreaterThanOrEqual(3);
    for (const request of requestsB) {
      expect(request).toEqual({
        workspaceId: TAB_PERSONAL_WORKSPACE.workspaceId,
        workspaceMemberId: TAB_PERSONAL_WORKSPACE.workspaceMemberId,
      });
    }

    expect(await readTabWorkspaceSelection(page)).toEqual({
      workspaceId: TAB_TEAM_WORKSPACE.workspaceId,
      workspaceMemberId: TAB_TEAM_WORKSPACE.workspaceMemberId,
    });
    expect(await readTabWorkspaceSelection(pageB)).toEqual({
      workspaceId: TAB_PERSONAL_WORKSPACE.workspaceId,
      workspaceMemberId: TAB_PERSONAL_WORKSPACE.workspaceMemberId,
    });
    await expect(page.getByTestId('workspace-switcher')).toContainText(
      TAB_TEAM_WORKSPACE.workspaceName,
    );
    await expect(pageB.getByTestId('workspace-switcher')).toContainText(
      TAB_PERSONAL_WORKSPACE.workspaceName,
    );
  } finally {
    await pageB.close();
  }
});

test('[P0] @critical home hero submit creates a project and lands on a usable workspace', async ({ page }) => {
  await routeSuccessfulRuns(page, { runIdPrefix: 'home-entry-workspace-smoke' });

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

test('[P1] onboarding lands on the home composer without a recommended-start strip', async ({ page }) => {
  const createdBodies: Array<Record<string, unknown>> = [];
  const runBodies: Array<Record<string, unknown>> = [];
  const runRequests = await routeSuccessfulRuns(page, {
    bodies: runBodies,
    runIdPrefix: 'recommendation-should-not-auto-send',
    events: false,
  });
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
  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({
      json: {
        loggedIn: true,
        loginInFlight: false,
        profile: 'local',
        configPath: '/tmp/.amr/config.json',
        user: { id: 'entry-onboarding', email: 'entry-onboarding@example.com' },
      },
    });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.long });

  // Cloud-first onboarding no longer contains the legacy runtime/About-you/
  // Product-design survey. A signed-in user accepts the recommended Hosted
  // source and lands directly on Home.
  const cloudPrimary = page.locator('.onboarding-cloud__primary');
  await expect(cloudPrimary).toBeEnabled();
  await cloudPrimary.click();
  await expect(page.getByRole('heading', { name: /Choose your model source|选择模型来源/i })).toBeVisible();
  await page.getByRole('radio', { name: /Open Design Hosted/i }).click();
  await page.getByRole('button', { name: /^Continue$/i }).click();

  // Finishing model-source setup lands the user on Home with the composer
  // ready — and NOT on the old recommended-start strip. That strip (sparkle +
  // 「Start with your first project」 + 全部类型 / 开始创作) sat between the
  // composer and the template line, offering a third way to say what the two
  // around it already said, and has been removed. Nothing may create a project
  // or start a run on the user's behalf on the way here.
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
  await expect(page.getByTestId('home-recommendation')).toHaveCount(0);
  await expect(page.getByTestId('home-recommendation-start')).toHaveCount(0);

  await expectStableCount(() => createdBodies.length, 0, {
    timeout: T.short,
    message: 'finishing onboarding should not create a project automatically',
  });
  await runRequests.expectNone({
    message: 'finishing onboarding should not start a run automatically',
  });
});

test('[P1] entry top navigation matches the current home tab structure', async ({ page }) => {
  await gotoEntryHome(page);
  await ensureRailOpen(page);

  // The rail is header-free: no logo, no in-rail collapse control — the
  // column starts at the search box, and folding lives in the pinned Home
  // tab's toggle on the workspace tabs bar.
  await expect(page.getByTestId('entry-nav-logo')).toHaveCount(0);
  await expect(page.getByTestId('entry-nav-collapse')).toHaveCount(0);
  await expect(page.getByTestId('entry-nav-search')).toBeVisible();
  await expect(page.getByTestId('entry-nav-home')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('entry-nav-community')).toBeVisible();
  await expect(page.locator('.entry-nav-rail__group').getByTestId('entry-nav-design-systems')).toBeVisible();
  await expect(page.locator('.entry-nav-rail__group').getByTestId('entry-nav-plugins')).toBeVisible();
  // #5517's rail dropped the "+ New project", Projects, Automations and
  // Integrations destinations. New project is now the Projects view's own CTA,
  // and Automations / Integrations keep their routes without a rail entry.
  await expect(page.getByTestId('entry-nav-new-project')).toHaveCount(0);
  await expect(page.getByTestId('entry-nav-projects')).toHaveCount(0);
  await expect(page.getByTestId('entry-nav-tasks')).toHaveCount(0);
  await expect(page.getByTestId('entry-nav-integrations')).toHaveCount(0);
  // Signed-out settings is the nav group's own item right under 扩展 — #5517
  // dropped the footer settings chip, so the footer carries no settings entry
  // (nor any other nav destination, e.g. plugins).
  await expect(page.locator('.entry-nav-rail__group').getByTestId('entry-settings-button')).toBeVisible();
  await expect(page.locator('.entry-nav-rail__footer').getByTestId('entry-settings-button')).toHaveCount(0);
  await expect(page.locator('.entry-nav-rail__footer').getByTestId('entry-nav-plugins')).toHaveCount(0);

  await expect(page.getByTestId('home-hero-template-picker')).toBeVisible();
  // Nothing is applied on a fresh Home: no template pill reset, no plugin
  // chip, no template-driven footer options or presets.
  await expect(page.getByTestId('home-hero-template-reset')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-active-plugin')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-options')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-plugin-presets')).toHaveCount(0);
});

test('[P1] home view exposes the redesigned hero, recent projects, and starters', async ({ page }) => {
  await createProject(page, 'Home structure recent project');
  await gotoEntryHome(page);

  const home = page.getByTestId('entry-view-home');
  await expect(page.getByTestId('recent-projects-strip')).toBeVisible();
  await expect(home.getByTestId('home-hero-template-picker')).toBeVisible();
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('entry-nav-home')).toHaveAttribute('aria-current', 'page');

  // NOTE: /projects currently has no UI entry. #5517 dropped the rail's
  // Projects destination, and Home passes `heading` to RecentProjectsStrip,
  // which flips it into the full-page-grid header that omits the
  // `recent-projects-view-all` button — so `HomeView.onViewAllProjects` is
  // wired but unreachable. Drive the route directly until an entry returns.
  await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.long });
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByTestId('entry-view-projects')).toBeVisible();
});

test('[P0] @critical recent projects strip opens a project card from Home', async ({ page }) => {
  const created = await createProject(page, 'Recent project entry point');
  await gotoEntryHome(page);

  const recentStrip = page.getByTestId('recent-projects-strip');
  await expect(recentStrip).toBeVisible();
  await recentStrip.locator(`[data-project-id="${created.project.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${created.project.id}`));
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

  // The rail's "+ New project" button is gone (#5517); the shared helper opens
  // the modal from the Projects view's own CTA instead.
  await openNewProjectModal(page);
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

  // The entry topbar is gone (#5517), so the composer card is the widest fixed
  // chrome left on the entry: neither it nor the page may scroll sideways.
  const { pageOverflow, composerOverflow } = await page.evaluate(() => {
    const composer = document.querySelector('[data-testid="home-hero"]');
    return {
      pageOverflow: Math.max(
        0,
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
      composerOverflow:
        composer instanceof HTMLElement
          ? Math.max(0, composer.scrollWidth - composer.clientWidth)
          : null,
    };
  });

  expect(composerOverflow).not.toBeNull();
  expect(composerOverflow!).toBeLessThanOrEqual(2);
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

  // The pill now lives in the Home composer footer as the compact, icon-only
  // variant: the selected agent + model are on its accessible name, and the
  // popover drops the Local CLI / BYOK segmented control in favour of the
  // agent list plus an Execution-settings entry.
  const pill = page.getByTestId('inline-model-switcher-chip');
  await expect(pill).toHaveAttribute('aria-label', /Codex CLI/i);
  await pill.click();

  const popover = page.getByTestId('inline-model-switcher-popover');
  await expect(popover).toBeVisible();
  await expect(popover.getByTestId('inline-model-switcher-mode-daemon')).toHaveCount(0);
  await expect(popover.getByTestId('inline-model-switcher-agent-claude')).toHaveCount(0);
  await expect(popover.getByTestId('inline-model-switcher-open-settings')).toBeVisible();

  await page.getByTestId('inline-model-switcher-open-settings').click();
  const settings = settingsSurface(page);
  await expect(settings).toBeVisible();
  await expect(settings.getByRole('tab', { name: LOCAL_CLI_LABEL })).toBeVisible();
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
        setMenuLabels: async () => ({ ok: true }),
        subscribe: () => () => {},
        subscribeOpenDialog: () => () => {},
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

// The entry help launcher (`entry-help-trigger` / `.entry-help-popover`, the X
// + Discord community links) went away with the entry topbar in #5517 —
// `EntryHelpMenu` is no longer rendered anywhere — and so did the topbar's
// "Use everywhere" button. Its spec is gone; the Use-everywhere guide itself
// still lives on the Integrations view and is covered below.
test('[P1] Settings About surfaces prerelease updater check failures with retry affordance', async ({ page }) => {
  await page.addInitScript(() => {
    const idleStatus = {
      arch: 'arm64',
      capabilities: {
        canApplyInPlace: false,
        canDownload: true,
        canOpenInstaller: true,
        requiresManualInstall: false,
      },
      channel: 'prerelease',
      currentVersion: '0.16.0-prerelease.1',
      enabled: true,
      mode: 'package-launcher',
      platform: 'darwin',
      state: 'idle',
      supported: true,
    };
    const failedStatus = {
      ...idleStatus,
      error: {
        code: 'metadata-fetch-failed',
        message: 'prerelease metadata returned 503',
      },
      lastCheckedAt: '2026-07-21T12:00:00.000Z',
      state: 'error',
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
          return failedStatus;
        },
        download: async () => failedStatus,
        install: async () => failedStatus,
        quit: async () => ({ ok: true }),
        setMenuLabels: async () => ({ ok: true }),
        subscribe: () => () => {},
        subscribeOpenDialog: () => () => {},
      },
    };
  });
  await page.route('**/api/version', async (route) => {
    await route.fulfill({
      json: {
        version: {
          version: '0.16.0-prerelease.1',
          channel: 'prerelease',
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
  await expect(dialog.locator('.settings-about-version-num')).toContainText('0.16.0-prerelease.1');
  await expect(dialog.locator('.settings-about-update-status')).toContainText('Not checked yet');

  await dialog.getByRole('button', { name: 'Check for updates' }).click();
  await expect(dialog.locator('.settings-about-update-status')).toContainText('Update failed');
  await expect(dialog.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __odUpdaterCalls?: string[] }).__odUpdaterCalls ?? []))
    .toEqual(['check']);
});

test('[P1] Settings BYOK connection failures emit a classified analytics error code', async ({ page }) => {
  const byokConfig = {
    mode: 'api',
    apiKey: 'sk-openai-e2e',
    apiProtocol: 'openai',
    apiVersion: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiProviderBaseUrl: 'https://api.openai.com/v1',
    agentId: 'codex',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    privacyDecisionAt: 1,
    telemetry: { metrics: true, content: false, artifactManifest: false },
    agentModels: { codex: { model: 'default' } },
  };
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: byokConfig },
  );

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({ json: { config: byokConfig } });
  });
  await page.route('**/api/analytics/config', async (route) => {
    const origin = new URL(route.request().url()).origin;
    await route.fulfill({
      json: {
        enabled: true,
        key: 'phc_e2e',
        host: origin,
        env: 'test',
        installationId: 'e2e-byok-error-device',
      },
    });
  });

  const analyticsPayloads: string[] = [];
  for (const pattern of ['**/e/**', '**/batch/**', '**/capture/**', '**/decide/**']) {
    await page.route(pattern, async (route) => {
      analyticsPayloads.push(route.request().postData() ?? route.request().url());
      await route.fulfill({ json: { status: 1 } });
    });
  }

  await page.route('**/api/test/connection', async (route) => {
    expect(route.request().method()).toBe('POST');
    const body = route.request().postDataJSON() as Record<string, unknown>;
    expect(body).toMatchObject({
      mode: 'provider',
      protocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-openai-e2e',
      model: 'gpt-4o-mini',
    });
    await route.fulfill({
      json: {
        ok: false,
        kind: 'unknown',
        status: 402,
        latencyMs: 12,
        model: 'gpt-4o-mini',
        detail: 'provider reported insufficient credits',
      },
    });
  });

  await gotoEntryHome(page);
  await page.getByTestId('entry-settings-menu-trigger').click();
  await page.getByTestId('entry-settings-open-details').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  const connectionTest = dialog.locator('.settings-byok-connection-test');
  await expect(connectionTest).toBeVisible();
  await connectionTest.getByRole('button', { name: /^Test$/ }).click();
  await expect(dialog.getByRole('alert')).toContainText(/insufficient credits/i);

  await expect
    .poll(() => analyticsPayloads.join('\n'), { timeout: 15_000 })
    .toContain('settings_byok_test_result');
  const captured = analyticsPayloads.join('\n');
  expect(captured).toContain('HTTP_402');
  expect(captured).toContain('unknown');
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
  // With the topbar's "Use everywhere" button gone (#5517) the Integrations
  // route is the entry; its default tab is still the Use everywhere guide.
  await page.goto('/integrations', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.long });
  await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();
  // Landing on the route directly opens the view's own default tab, so select
  // the Use everywhere guide explicitly.
  await page.getByTestId('integrations-tab-use-everywhere').click();
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

  // Settings is a rail nav item now, and the collapsed rail is `inert`.
  await ensureRailOpen(page);
  await page.getByTestId('entry-settings-button').click();
  await expect(executionPopover).toHaveCount(0);
  await expect(settingsSurface(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settingsSurface(page)).toHaveCount(0);

  await pill.click();
  await expect(executionPopover).toBeVisible();

  await page.getByTestId('home-hero').click();
  await expect(executionPopover).toHaveCount(0);

  await pill.click();
  await expect(executionPopover).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(executionPopover).toHaveCount(0);
});

// The execution pill is no longer entry-wide chrome: with the topbar gone
// (#5517) `EntryShell` hands the switcher to `HomeView` only, so it renders
// inside the Home composer footer and does not follow the user to secondary
// entry pages. This spec now pins the rail's surviving destinations plus the
// pill at its new, Home-only home.
test('[P1] rail destinations navigate and Home keeps its composer execution pill', async ({ page }) => {
  await routeDesignSystems(page);
  await gotoEntryHome(page);

  const destinations = [
    { nav: 'entry-nav-design-systems', url: /\/design-systems$/ },
    { nav: 'entry-nav-plugins', url: /\/plugins$/ },
    { nav: 'entry-nav-community', url: /\/community$/ },
  ];

  for (const destination of destinations) {
    await ensureRailOpen(page);
    await page.getByTestId(destination.nav).click();
    await expect(page).toHaveURL(destination.url);
    await expect(page.getByTestId(destination.nav)).toHaveAttribute('aria-current', 'page');
  }

  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-home').click();
  await expect(page.getByTestId('home-hero')).toBeVisible();

  const pill = page.getByTestId('inline-model-switcher-chip');
  await expect(pill).toBeVisible();
  await pill.click();
  await expect(page.getByTestId('inline-model-switcher-popover')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('inline-model-switcher-popover')).toHaveCount(0);
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
  await skipWithoutHomeStarters(page);
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
  await skipWithoutHomeStarters(page);
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
  await skipWithoutHomeStarters(page);
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
  await skipWithoutHomeStarters(page);

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
  await skipWithoutHomeStarters(page);
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

test('[P2] home starters Use-plugin-only routes the plugin as the active driver and keeps the prompt freeform', async ({ page }) => {
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
  // Guard before arming waitForResponse: a mid-flight skip inside
  // openHomePluginDetails would leave that promise dangling.
  await skipWithoutHomeStarters(page);

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
  await skipWithoutHomeStarters(page);

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

test('[P2] home starters Use with query carries the hydrated starter prompt into the created project and first user turn', async ({ page }) => {
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
  await skipWithoutHomeStarters(page);

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

test('[P2] required home plugin prompt parameters gate submit and bind the project snapshot', async ({ page }) => {
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
  await skipWithoutHomeStarters(page);
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

  await expect(page.getByTestId('composer-mode-trigger')).toHaveAttribute('aria-label', 'Mode: Design');

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
  await expect(page.getByTestId('working-dir-trigger')).toContainText('Working directory');

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
  await expect(page.getByTestId('entry-nav-home')).toBeVisible();
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
  await skipWithoutHomeStarters(page);

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
  // Emulate a touch device where `(hover: none)` matches. The rail has no
  // in-rail collapse control, so folding must work through the pinned Home
  // tab's toggle — which must stay tappable without any hover affordance.
  // emulateMedia() doesn't cover `hover`, so use CDP.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'hover', value: 'none' },
      { name: 'pointer', value: 'coarse' },
    ],
  });

  await gotoEntryHome(page);
  await ensureRailOpen(page);

  const toggle = page.getByTestId('workspace-home-rail-toggle');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator('.entry')).not.toHaveClass(/entry--rail-open/);
});

interface WorkspaceContextRequestWitness {
  workspaceId: string | null;
  workspaceMemberId: string | null;
}

interface TabWorkspaceMockState {
  activeWorkspaceId: string;
}

function tabWorkspaceContext(item: WorkspaceDirectoryItem): WorkspaceCollabContext {
  return {
    ...item,
    billingState: item.workspaceType === 'team' ? 'active' : 'free',
    planId: item.workspaceType === 'team' ? 'team_basic' : null,
    providerMode: 'platform_credits',
    seatSummary: {
      seatLimit: item.workspaceType === 'team' ? 5 : 1,
      usedSeats: 1,
      availableSeats: item.workspaceType === 'team' ? 4 : 0,
      isSeatFull: item.workspaceType !== 'team',
    },
    permissions: {
      canManageMembers: true,
      canManageBilling: true,
      canInviteMembers: true,
      canManageAutoRecharge: true,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true,
      canManageSharedResources: true,
    },
    ...(item.workspaceType === 'team'
      ? {
          teamId: 'team-tab-atlas',
          teamName: item.workspaceName,
          workspaceSettingsUrl: 'https://example.invalid/team-tab-atlas',
        }
      : {}),
  };
}

async function routeTabWorkspaceApi(
  page: Page,
  state: TabWorkspaceMockState,
  contextRequests: WorkspaceContextRequestWitness[],
): Promise<void> {
  const directory = [TAB_PERSONAL_WORKSPACE, TAB_TEAM_WORKSPACE];

  await page.route('**/api/workspace/directory', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        items: directory,
        activeWorkspaceId: state.activeWorkspaceId,
      },
    });
  });

  await page.route('**/api/workspace/context', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const headers = route.request().headers();
    const witness = {
      workspaceId: headers['x-od-workspace-id'] ?? null,
      workspaceMemberId: headers['x-od-workspace-member-id'] ?? null,
    };
    contextRequests.push(witness);
    const selected = directory.find(
      (item) =>
        item.workspaceId === witness.workspaceId
        && item.workspaceMemberId === witness.workspaceMemberId,
    );
    if (!selected) {
      await route.fulfill({
        status: 400,
        json: { error: 'exact_workspace_scope_required' },
      });
      return;
    }
    await route.fulfill({ json: { context: tabWorkspaceContext(selected) } });
  });

  await page.route('**/api/workspace/active', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fallback();
      return;
    }
    const body = route.request().postDataJSON() as {
      workspaceId?: unknown;
      workspaceMemberId?: unknown;
    };
    const selected = directory.find(
      (item) =>
        item.workspaceId === body.workspaceId
        && item.workspaceMemberId === body.workspaceMemberId,
    );
    if (!selected) {
      await route.fulfill({
        status: 400,
        json: { error: 'exact_workspace_scope_required' },
      });
      return;
    }
    state.activeWorkspaceId = selected.workspaceId;
    await route.fulfill({
      json: {
        activeWorkspaceId: selected.workspaceId,
        context: tabWorkspaceContext(selected),
      },
    });
  });
}

async function readTabWorkspaceSelection(page: Page): Promise<WorkspaceContextRequestWitness> {
  return page.evaluate(() => {
    const raw = JSON.parse(
      window.sessionStorage.getItem('od.workspaceSelection.v1') ?? 'null',
    ) as {
      workspaceId?: unknown;
      workspaceMemberId?: unknown;
    } | null;
    return {
      workspaceId: typeof raw?.workspaceId === 'string' ? raw.workspaceId : null,
      workspaceMemberId:
        typeof raw?.workspaceMemberId === 'string' ? raw.workspaceMemberId : null,
    };
  });
}

async function refreshTabsInterleaved(
  first: {
    page: Page;
    eventName: 'focus' | 'pageshow';
    requests: WorkspaceContextRequestWitness[];
  },
  second: {
    page: Page;
    eventName: 'focus' | 'pageshow';
    requests: WorkspaceContextRequestWitness[];
  },
): Promise<void> {
  const firstCount = first.requests.length;
  const secondCount = second.requests.length;
  await expect
    .poll(
      async () => {
        await Promise.all([
          dispatchAmbientWorkspaceEvent(first.page, first.eventName),
          dispatchAmbientWorkspaceEvent(second.page, second.eventName),
        ]);
        return {
          first: first.requests.length > firstCount,
          second: second.requests.length > secondCount,
        };
      },
      { timeout: T.medium },
    )
    .toEqual({ first: true, second: true });
}

async function dispatchAmbientWorkspaceEvent(
  page: Page,
  eventName: 'focus' | 'pageshow',
): Promise<void> {
  await page.evaluate((name) => {
    window.dispatchEvent(
      name === 'pageshow'
        ? new PageTransitionEvent('pageshow', { persisted: false })
        : new Event('focus'),
    );
  }, eventName);
}

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

/**
 * Home's starters gallery. #5517 removed both the scroll-up reveal
 * (`HomeTemplatesReveal`, no longer rendered) and the gallery itself:
 * `PluginsHomeSection` is only mounted by `PluginsView`, and the entry shell
 * now renders `ExtensionsMarketplace` instead, so `plugins-home-section` is not
 * on Home — or anywhere. Community browsing moved to `CommunityView`, which
 * ships no test hooks.
 *
 * Rather than delete a dozen-plus specs for a capability that plausibly comes
 * back, they self-skip while the surface is absent and light up again the
 * moment `plugins-home-section` renders. If the gallery is NOT coming back,
 * delete these specs outright rather than leaving them skipped forever.
 */
const HOME_STARTERS_MISSING =
  'Home starters gallery (plugins-home-section) is not rendered after #5517; see revealHomeTemplates.';

/** Same guard as `revealHomeTemplates`, for specs that hit the gallery directly. */
async function skipWithoutHomeStarters(page: Page) {
  const section = page.getByTestId('entry-view-home').getByTestId('plugins-home-section');
  test.skip((await section.count()) === 0, HOME_STARTERS_MISSING);
}

async function revealHomeTemplates(page: Page) {
  const home = page.locator('[data-testid="entry-view-home"][data-active="true"]');
  const section = home.getByTestId('plugins-home-section');
  test.skip((await section.count()) === 0, HOME_STARTERS_MISSING);
  const hint = home.getByTestId('home-templates-hint');
  const reveal = home.locator('.home-templates-reveal');
  const revealBody = home.locator('.home-templates-reveal__body');
  if (await hint.count()) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (await reveal.evaluate((node) => node.classList.contains('is-revealed')).catch(() => false)) {
        break;
      }
      // The product listens for a positive wheel delta anywhere on the window
      // (`HomeTemplatesReveal`). Wait for the reveal class itself — the state
      // flip is synchronous with the listener — instead of sleeping 120ms.
      await page.mouse.wheel(0, 900);
      if (
        await reveal
          .evaluate((node) => node.classList.contains('is-revealed'))
          .catch(() => false)
      ) {
        break;
      }
      await expect
        .poll(
          async () => reveal.evaluate((node) => node.classList.contains('is-revealed')).catch(() => false),
          { timeout: T.short, intervals: [50] },
        )
        .toBe(true)
        .catch(() => undefined);
    }
    if (!(await reveal.evaluate((node) => node.classList.contains('is-revealed')).catch(() => false))) {
      await hint.scrollIntoViewIfNeeded();
      await expect(hint).toBeVisible();
      await hint.click();
    }
    await expect(reveal).toHaveClass(/is-revealed/);
    await expect(revealBody).not.toHaveAttribute('inert', '');
    // The accordion uses `grid-template-rows` + opacity transitions
    // (~420ms). Wait for the body to finish expanding so follow-up clicks
    // land on actionable gallery cards instead of a mid-transition hitbox.
    await expect
      .poll(async () => {
        return revealBody.evaluate((node) => {
          const style = getComputedStyle(node);
          const rowsDone = style.gridTemplateRows !== '0fr' && !style.gridTemplateRows.startsWith('0');
          const opacityDone = Number.parseFloat(style.opacity || '0') >= 0.99;
          const rect = node.getBoundingClientRect();
          return rowsDone && opacityDone && rect.height > 0;
        });
      }, { timeout: T.short, intervals: [50] })
      .toBe(true);
    await expect(section).toBeVisible();
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
