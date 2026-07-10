import { expect, test } from '@/playwright/suite';
import { ensureRailOpen, openNewProjectModal } from '@/playwright/rail';
import { openAllProjectFiles } from '@/playwright/workspace';
import { T } from '@/timeouts';
import type { Locator, Page, Request, Route } from '@playwright/test';
import { routeAgents } from '../lib/playwright/mock-factory.js';

// The `/projects` view in `EntryShell` renders a `CenteredLoader` until
// `projectsLoading || skillsLoading || designSystemsLoading` all clear
// (`apps/web/src/components/EntryShell.tsx`). Tests that land on `/projects`
// should stub the catalog endpoints that are unrelated to the project-list
// behavior under test; otherwise a large registry response can keep the first
// assertion gated on daemon/catalog timing instead of the UI contract.
async function stubCatalogsEmpty(page: Page): Promise<void> {
  await page.route('**/api/design-templates', async (route) => {
    await route.fulfill({ json: { designTemplates: [] } });
  });
  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: [] } });
  });
}

const STORAGE_KEY = 'open-design:config';
const ACTIVE_ARTIFACT_PREVIEW_SELECTOR = '[data-testid="artifact-preview-frame"]:visible, [data-testid="artifact-preview-frame-url-load"]:visible, [data-testid="artifact-preview-frame-srcdoc"]:visible, [data-testid="live-artifact-preview-frame"]:visible';

const AGENTS = [
  {
    id: 'codex',
    name: 'Codex CLI',
    bin: 'codex',
    available: true,
    version: '0.134.0',
    models: [
      { id: 'default', label: 'Default (CLI config)' },
      { id: 'gpt-5.5', label: 'GPT 5.5' },
    ],
  },
  {
    id: 'claude',
    name: 'Claude Code',
    bin: 'claude',
    available: true,
    version: '2.1.131',
    models: [
      { id: 'default', label: 'Default (CLI config)' },
      { id: 'sonnet', label: 'Sonnet (alias)' },
      { id: 'opus', label: 'Opus (alias)' },
    ],
  },
];

const DESIGN_SYSTEMS = [
  {
    id: 'nexu-soft-tech',
    title: 'Nexu Soft Tech',
    category: 'Product',
    summary: 'Warm utility system for product interfaces.',
    swatches: ['#F7F4EE', '#D6CBBF', '#1F2937', '#D97757'],
  },
  {
    id: 'editorial-noir',
    title: 'Editorial Noir',
    category: 'Editorial',
    summary: 'High-contrast editorial system with expressive type.',
    swatches: ['#111111', '#F6EFE6', '#C44536', '#F2C14E'],
  },
  {
    id: 'data-mist',
    title: 'Data Mist',
    category: 'Analytics',
    summary: 'Calm dashboard system for dense data products.',
    swatches: ['#EAF4F4', '#5EAAA8', '#05668D', '#0B132B'],
  },
];

async function stubEmptyProjectsNewProjectData(page: Page): Promise<void> {
  await page.route('**/api/skills', async (route) => {
    await route.fulfill({ json: { skills: TAB_SKILLS } });
  });
  await page.route('**/api/connectors', async (route) => {
    await route.fulfill({ json: { connectors: [] } });
  });
  await page.route('**/api/connectors/status', async (route) => {
    await route.fulfill({ json: { statuses: {} } });
  });
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: DESIGN_SYSTEMS } });
  });
}

async function openNewProjectFromEmptyProjects(page: Page): Promise<void> {
  await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.designs-empty-state')).toBeVisible();
  await page.getByTestId('designs-empty-new-project').click();

  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}

async function openNewProjectFromLeftRail(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('od.entry.railOpen', 'true');
  });
  await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.entry')).toHaveClass(/entry--rail-open/);
  await expect(page.getByTestId('entry-nav-new-project')).toBeVisible();
  await page.getByTestId('entry-nav-new-project').click();

  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}

const TAB_SKILLS = [
  skillSummary('prototype-skill', 'Prototype Skill', 'prototype', 'web', ['prototype']),
  skillSummary('live-artifact', 'live-artifact', 'prototype', 'web', []),
  skillSummary('deck-skill', 'Deck Skill', 'deck', 'web', ['deck']),
  skillSummary('image-skill', 'Image Skill', 'image', 'image', ['image']),
];

const COMPOSER_PLUS_PLUGIN = {
  id: 'composer-context-plugin',
  title: 'Composer Context Plugin',
  version: '1.0.0',
  trust: 'bundled',
  sourceKind: 'bundled',
  source: '/tmp/composer-context-plugin',
  fsPath: '/tmp/composer-context-plugin',
  capabilitiesGranted: ['prompt:inject'],
  installedAt: 0,
  updatedAt: 0,
  manifest: {
    name: 'composer-context-plugin',
    title: 'Composer Context Plugin',
    version: '1.0.0',
    description: 'Project composer context picker fixture.',
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      useCase: {
        query: 'Use the composer context plugin.',
      },
    },
  },
};

test.beforeEach(async ({ page }) => {
  let appConfig = {
    onboardingCompleted: true,
    privacyDecisionAt: 1,
    telemetry: { metrics: false, content: false, artifactManifest: false },
    mode: 'daemon',
    agentId: 'codex',
    skillId: null,
    designSystemId: null,
    agentModels: { codex: { model: 'default' } },
    agentCliEnv: {},
  };

  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'default',
        agentId: 'codex',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        privacyDecisionAt: 1,
        telemetry: { metrics: false, content: false, artifactManifest: false },
        agentModels: { codex: { model: 'default' } },
      }),
    );
  }, STORAGE_KEY);

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'PUT') {
      const next = route.request().postDataJSON() as Record<string, unknown>;
      appConfig = {
        ...appConfig,
        ...next,
      };
      await route.fulfill({ json: { config: appConfig } });
      return;
    }
    await route.fulfill({
      json: {
        config: appConfig,
      },
    });
  });

  await routeAgents(page, AGENTS);
});

function artifactPreview(page: Page) {
  return page.locator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR).first();
}

function artifactPreviewFrame(page: Page) {
  return page.frameLocator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR);
}

test.describe('new project modal from left rail', () => {
  test.describe.configure({ mode: 'serial', timeout: 60_000 });

  test('[P1] new project tabs switch visible form sections and preserve drafts', async ({ page }) => {
    await stubEmptyProjectsNewProjectData(page);
    await openNewProjectFromLeftRail(page);
    await expect(page.getByTestId('new-project-tab-prototype')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.newproj-title')).toContainText('New prototype');
    await expect(page.getByTestId('design-system-trigger')).toBeVisible();
    await expect(page.getByText('Fidelity', { exact: true })).toBeVisible();
    await page.getByTestId('new-project-name').fill('Prototype draft survives');

    await page.getByTestId('new-project-tab-live-artifact').click();
    await expect(page.getByTestId('new-project-tab-live-artifact')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.newproj-title')).toContainText('New live artifact');
    await expect(page.locator('.newproj-title')).toContainText('Beta');
    await expect(page.getByTestId('design-system-picker')).toHaveCount(0);
    await expect(page.getByTestId('new-project-connectors')).toBeVisible();
    await expect(page.getByTestId('create-project')).toContainText('Create live artifact');

    await page.getByTestId('new-project-tab-deck').click();
    await expect(page.getByTestId('new-project-tab-deck')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.newproj-title')).toContainText('New slide deck');
    await expect(page.getByTestId('design-system-trigger')).toBeVisible();
    await expect(page.getByText('Use speaker notes')).toBeVisible();
    await expect(page.getByTestId('new-project-connectors')).toHaveCount(0);

    await page.getByTestId('new-project-tab-prototype').click();
    await expect(page.getByTestId('new-project-tab-prototype')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.newproj-title')).toContainText('New prototype');
    await expect(page.getByTestId('new-project-name')).toHaveValue('Prototype draft survives');
  });

  test('[P1] new project media tab switches inner media surfaces', async ({ page }) => {
    await stubEmptyProjectsNewProjectData(page);
    await openNewProjectFromLeftRail(page);

    // Playwright auto-scrolls the tab into view; the consolidated media flow
    // keeps image/video/audio as inner segmented surfaces.
    await page.getByTestId('new-project-tab-media').click();
    await expect(page.getByTestId('new-project-tab-media')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('new-project-media-surface-image').click();
    await expect(page.getByTestId('new-project-media-surface-image')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.newproj-title')).toContainText('New image');
    await expect(page.getByTestId('design-system-picker')).toHaveCount(0);
    await expect(page.getByText('Model', { exact: true })).toBeVisible();
    await expect(page.getByText('Aspect', { exact: true })).toBeVisible();

    await page.getByTestId('new-project-media-surface-video').click();
    await expect(page.getByTestId('new-project-media-surface-video')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.newproj-title')).toContainText('New video');

    await page.getByTestId('new-project-media-surface-audio').click();
    await expect(page.getByTestId('new-project-media-surface-audio')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.newproj-title')).toContainText('New audio');
  });
});

test('[P0] projects empty state create action opens the new project flow', async ({ page }) => {
  await page.route('**/api/skills', async (route) => {
    await route.fulfill({ json: { skills: TAB_SKILLS } });
  });
  await page.route('**/api/connectors', async (route) => {
    await route.fulfill({ json: { connectors: [] } });
  });
  await page.route('**/api/connectors/status', async (route) => {
    await route.fulfill({ json: { statuses: {} } });
  });
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.fallback();
  });

  await stubCatalogsEmpty(page);
  await openNewProjectFromEmptyProjects(page);

  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await expect(page.getByTestId('new-project-tab-prototype')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.newproj-title')).toContainText('New prototype');
});

test('[P1] design system multi-select stores primary and inspiration metadata', async ({ page }) => {
  await stubEmptyProjectsNewProjectData(page);
  await openNewProjectFromLeftRail(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill('Design system multi select metadata');
  await expect(page.getByTestId('design-system-trigger')).toContainText('Nexu Soft Tech');

  await page.getByTestId('design-system-trigger').click();
  const multiTab = page.getByRole('tab', { name: /multi/i });
  await multiTab.click();
  await expect(multiTab).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('option', { name: /Editorial Noir/i }).click();
  await page.getByRole('option', { name: /Data Mist/i }).click();

  await expect(page.getByTestId('design-system-trigger')).toContainText('Nexu Soft Tech');
  await expect(page.getByTestId('design-system-trigger')).toContainText('+2');
  await page.getByTestId('design-system-trigger').click();
  await expect(page.locator('.ds-picker-popover')).toHaveCount(0);
  const createProjectRequest = page.waitForRequest(isCreateProjectRequest);
  await expect(page.getByTestId('create-project')).toBeEnabled();
  await page.getByTestId('create-project').click({ force: true });
  const request = await createProjectRequest;
  const body = request.postDataJSON() as {
    designSystemId?: string | null;
    metadata?: {
      inspirationDesignSystemIds?: string[];
    };
  };
  expect(body.designSystemId).toBe('nexu-soft-tech');
  expect(body.metadata?.inspirationDesignSystemIds).toEqual([
    'editorial-noir',
    'data-mist',
  ]);
});

test('[P1] design system picker searches and switches the single selected system', async ({ page }) => {
  await stubEmptyProjectsNewProjectData(page);
  await openNewProjectFromLeftRail(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill('Design system single switch flow');
  await expect(page.getByTestId('design-system-trigger')).toBeVisible();

  await page.getByTestId('design-system-trigger').click();
  await page.getByTestId('design-system-search').fill('mist');
  await expect(page.getByRole('option', { name: /Data Mist/i })).toBeVisible();
  await expect(page.getByRole('option', { name: /Nexu Soft Tech/i })).toHaveCount(0);
  await page.getByRole('option', { name: /Data Mist/i }).click();

  await expect(page.getByTestId('design-system-trigger')).toContainText('Data Mist');
  await expect(page.getByTestId('design-system-trigger')).toContainText('Analytics');
  const createProjectRequest = page.waitForRequest(isCreateProjectRequest);
  await expect(page.getByTestId('create-project')).toBeEnabled();
  await page.getByTestId('create-project').click({ force: true });
  const request = await createProjectRequest;
  const body = request.postDataJSON() as {
    designSystemId?: string | null;
    metadata?: {
      inspirationDesignSystemIds?: string[];
    };
  };
  expect(body.designSystemId).toBe('data-mist');
  expect(body.metadata?.inspirationDesignSystemIds).toBeUndefined();
});

test('[P1] design system picker can clear the default system before creating a project', async ({ page }) => {
  await stubEmptyProjectsNewProjectData(page);
  await openNewProjectFromLeftRail(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill('Design system clear create flow');
  await expect(page.getByTestId('design-system-trigger')).toContainText('Nexu Soft Tech');

  await page.getByTestId('design-system-trigger').click();
  await page.getByRole('option', { name: /None.*freeform/i }).click();

  await expect(page.getByTestId('design-system-trigger')).toContainText('None');
  await expect(page.getByTestId('design-system-trigger')).not.toContainText('Nexu Soft Tech');

  const createProjectRequest = page.waitForRequest(isCreateProjectRequest);
  await expect(page.getByTestId('create-project')).toBeEnabled();
  await page.getByTestId('create-project').click({ force: true });
  const request = await createProjectRequest;
  const body = request.postDataJSON() as {
    designSystemId?: string | null;
    metadata?: {
      inspirationDesignSystemIds?: string[];
    };
  };
  expect(body.designSystemId).toBeNull();
  expect(body.metadata?.inspirationDesignSystemIds).toBeUndefined();
});

test('[P1] stale daemon default design system is not posted when creating a project', async ({ page }) => {
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        json: {
          config: {
            onboardingCompleted: true,
            privacyDecisionAt: 1,
            telemetry: { metrics: false, content: false, artifactManifest: false },
            mode: 'daemon',
            agentId: 'codex',
            skillId: null,
            designSystemId: 'stale-design-system',
            agentModels: { codex: { model: 'default' } },
            agentCliEnv: {},
          },
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        config: {
          onboardingCompleted: true,
          privacyDecisionAt: 1,
          telemetry: { metrics: false, content: false, artifactManifest: false },
          mode: 'daemon',
          agentId: 'codex',
          skillId: null,
          designSystemId: 'stale-design-system',
          agentModels: { codex: { model: 'default' } },
          agentCliEnv: {},
        },
      },
    });
  });
  await stubEmptyProjectsNewProjectData(page);
  await openNewProjectFromLeftRail(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill('Stale design system default flow');

  await expect(page.getByTestId('design-system-trigger')).toContainText('None');
  await expect(page.getByTestId('design-system-trigger')).not.toContainText('stale-design-system');

  const createProjectRequest = page.waitForRequest(isCreateProjectRequest);
  await expect(page.getByTestId('create-project')).toBeEnabled();
  await page.getByTestId('create-project').click({ force: true });
  const request = await createProjectRequest;
  const body = request.postDataJSON() as {
    designSystemId?: string | null;
    metadata?: {
      inspirationDesignSystemIds?: string[];
    };
  };
  expect(body.designSystemId).toBeNull();
  expect(body.designSystemId).not.toBe('stale-design-system');
  expect(body.metadata?.inspirationDesignSystemIds).toBeUndefined();
});

test('[P2] project detail header keeps the title and execution controls aligned on one row', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Header controls stay pinned');
  await expectWorkspaceReady(page);
  await page.setViewportSize({ width: 1365, height: 900 });

  const title = page.getByTestId('project-title');
  const settingsButton = page.locator('.settings-icon-btn');
  const handoffButton = page.getByRole('button', { name: /Choose hand-off target/i });

  await expect(title).toBeVisible();
  await expect(settingsButton).toBeVisible();
  await expect(handoffButton).toBeVisible();
  await expect(page.getByTestId('chat-composer').getByTestId('project-ds-picker-trigger')).toBeVisible();

  const [titleBox, settingsBox, handoffBox] = await Promise.all([
    title.boundingBox(),
    settingsButton.boundingBox(),
    handoffButton.boundingBox(),
  ]);

  expect(titleBox).toBeTruthy();
  expect(settingsBox).toBeTruthy();
  expect(handoffBox).toBeTruthy();

  const yValues = [titleBox!.y, settingsBox!.y, handoffBox!.y];
  expect(Math.max(...yValues) - Math.min(...yValues)).toBeLessThan(24);
});

test('[P1] project detail header design system picker switches the active project design system', async ({ page }) => {
  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: DESIGN_SYSTEMS } });
  });

  await page.goto('/');
  await createProject(page, 'Header design system switch');
  await expectWorkspaceReady(page);

  const trigger = page.getByTestId('project-ds-picker-trigger');
  await expect(trigger).toContainText(/design system/i);

  await trigger.click();
  const popover = page.getByTestId('project-ds-picker-popover');
  await expect(popover).toBeVisible();
  await page.getByTestId('project-ds-picker-search').fill('editorial');
  const editorialOption = page.getByRole('option', { name: /^Editorial Noir$/ });
  await expect(editorialOption).toBeVisible();
  const patchRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === `/api/projects/${getProjectContextFromUrl(page).projectId}` && request.method() === 'PATCH';
  });
  await editorialOption.click();

  await expect(popover).toHaveCount(0);

  const request = await patchRequest;
  const body = request.postDataJSON() as { designSystemId?: string | null };
  expect(body.designSystemId).toBe('editorial-noir');
  await expect(trigger).toBeVisible();
});

test('[P0] @critical project detail header design system switch carries into the next run request', async ({ page }) => {
  const runRequestBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/runs', async (route) => {
    const raw = route.request().postData();
    if (raw) {
      try {
        runRequestBodies.push(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        // ignore non-JSON bodies; assertion below will surface missing payloads
      }
    }
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"mock-run"}',
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: ['event: end', 'data: {"code":0,"status":"succeeded"}', '', ''].join('\n'),
    });
  });

  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: DESIGN_SYSTEMS } });
  });

  await page.goto('/');
  await createProject(page, 'Header design system run context');
  await expectWorkspaceReady(page);

  const trigger = page.getByTestId('project-ds-picker-trigger');
  await trigger.click();
  await page.getByTestId('project-ds-picker-search').fill('editorial');
  const editorialOption = page.getByRole('option', { name: /^Editorial Noir$/ });
  await expect(editorialOption).toBeVisible();
  const patchRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === `/api/projects/${getProjectContextFromUrl(page).projectId}` && request.method() === 'PATCH';
  });
  await editorialOption.click();
  const patchBody = await patchRequest.then((request) => request.postDataJSON() as { designSystemId?: string | null });
  expect(patchBody.designSystemId).toBe('editorial-noir');

  const input = page.getByTestId('chat-composer-input');
  await input.fill('Use the active design system in this layout.');
  const sendButton = page.getByTestId('chat-send');
  await expect(sendButton).toBeEnabled();
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    sendButton.click(),
  ]);

  expect(runRequestBodies.length).toBeGreaterThan(0);
  expect(runRequestBodies[0]?.designSystemId).toBe('editorial-noir');
});

test('[P1] project detail design system picker stays inside the composer controls', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Composer design system position');
  await expectWorkspaceReady(page);

  const composer = page.getByTestId('chat-composer');
  await expect(composer.getByTestId('project-ds-picker-trigger')).toBeVisible();
});

test('[P1] project detail composer working directory picker opens without leaving chat', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Composer working directory picker');
  await expectWorkspaceReady(page);

  const composer = page.getByTestId('chat-composer');
  const trigger = composer.getByTestId('working-dir-trigger');
  await expect(trigger).toBeVisible();
  await trigger.click();

  await expect(composer.getByTestId('working-dir-panel')).toBeVisible();
  await expect(composer.getByTestId('working-dir-pick')).toBeVisible();
});

test('[P1] project detail composer plus menu exposes attachment, connector, plugin, and MCP entries', async ({ page }) => {
  await routeComposerPlusFixtures(page);
  await page.goto('/');
  await createProject(page, 'Composer plus context menu');
  await expectWorkspaceReady(page);

  const composer = page.getByTestId('chat-composer');
  await composer.getByTestId('chat-plus-trigger').click();
  await expect(page.getByTestId('composer-plus-attach')).toBeVisible();
  await expect(page.getByTestId('composer-plus-connectors')).toBeVisible();
  await expect(page.getByTestId('composer-plus-plugins')).toBeVisible();
  await expect(page.getByTestId('composer-plus-mcp')).toBeVisible();

  await page.getByTestId('composer-plus-connectors').click();
  await expect(page.getByRole('menuitem', { name: /Figma Connector/i })).toBeVisible();

  await page.getByTestId('composer-plus-plugins').click();
  await expect(page.getByRole('menuitem', { name: /Composer Context Plugin/i })).toBeVisible();

  await page.getByTestId('composer-plus-mcp').click();
  await expect(page.getByRole('menuitem', { name: /Design Docs MCP/i })).toBeVisible();
});

test('[P1] project detail composer plus menu opens project, local code, Figma help, and design system context actions', async ({ page }) => {
  const referenceProject = {
    id: 'ref-project-context',
    name: 'Reference Project Context',
    skillId: null,
    designSystemId: null,
    createdAt: Date.now() - 1_000,
    updatedAt: Date.now(),
    metadata: {
      kind: 'prototype',
      nameSource: 'user',
    },
  };

  await routeComposerPlusFixtures(page);
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [referenceProject] } });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/projects/ref-project-context**', async (route) => {
    await route.fulfill({
      json: {
        project: referenceProject,
        resolvedDir: '/tmp/open-design/reference-project-context',
      },
    });
  });
  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.fallback();
      return;
    }
    const url = new URL(route.request().url());
    const id = decodeURIComponent(url.pathname.split('/').pop() ?? 'composer-plus-context-actions');
    const body = route.request().postDataJSON() as { metadata?: Record<string, unknown> };
    await route.fulfill({
      json: {
        project: {
          id,
          name: 'Composer plus context actions',
          skillId: null,
          designSystemId: null,
          createdAt: Date.now() - 1_000,
          updatedAt: Date.now(),
          metadata: body.metadata ?? { kind: 'prototype' },
        },
      },
    });
  });
  await page.route('**/api/dialog/open-folder', async (route) => {
    await route.fulfill({ json: { path: '/tmp/open-design/local-code-project' } });
  });
  await page.route('**/api/dir-exists', async (route) => {
    await route.fulfill({ json: { exists: true } });
  });

  await page.goto('/');
  await createProject(page, 'Composer plus context actions');
  await expectWorkspaceReady(page);
  const composer = page.getByTestId('chat-composer');
  const input = page.getByTestId('chat-composer-input');

  await composer.getByTestId('chat-plus-trigger').click();
  await page.getByTestId('composer-plus-reference-project').click();
  const referenceDialog = page.getByRole('dialog', { name: 'Reference another project' });
  await expect(referenceDialog).toBeVisible();
  await expect(referenceDialog.getByRole('option', { name: /Reference Project Context/i })).toHaveAttribute('aria-selected', 'true');
  await referenceDialog.getByRole('button', { name: 'Reference project' }).click();
  await expect(referenceDialog).toHaveCount(0);
  await expect(input).toContainText('Reference Project Context');
  await expect(composer.locator('.staged-context--workspace', { hasText: 'Reference Project Context' })).toBeVisible();

  await composer.getByTestId('chat-plus-trigger').click();
  await page.getByTestId('composer-plus-local-code').click();
  await expect(input).toContainText('local-code-project');
  await expect(composer.locator('.staged-context--workspace', { hasText: 'local-code-project' })).toBeVisible();

  await composer.getByTestId('chat-plus-trigger').click();
  await page.getByTestId('composer-plus-figma-help').click();
  const figmaHelp = page.getByRole('dialog', { name: 'How to download a .fig file' });
  await expect(figmaHelp).toBeVisible();
  await expect(figmaHelp).toContainText('Save local copy');
  await figmaHelp.getByRole('button', { name: 'Close' }).click();
  await expect(figmaHelp).toHaveCount(0);

  await composer.getByTestId('chat-plus-trigger').click();
  await page.getByTestId('composer-plus-design-system').click();
  await expect(page.getByTestId('project-ds-picker-popover')).toBeVisible();
});

test('[P1] project detail Figma import uploads a .fig file and stages the suggested prompt', async ({ page }) => {
  const importBodies: string[] = [];
  const suggestedPrompt = 'Build the current project from figma/DESIGN-context.md.';

  await routeComposerPlusFixtures(page);
  await page.route('**/api/projects/*/figma/import', async (route) => {
    importBodies.push(route.request().postData() ?? '');
    await route.fulfill({
      json: {
        snapshotDir: 'figma',
        files: ['figma/tree.json', 'figma/DESIGN-context.md', 'figma/thumbnail.png'],
        inventory: {
          decoded: true,
          source: 'fig-file',
          nodeCount: 10,
          pageCount: 1,
          frameCount: 2,
          componentCount: 2,
          colors: ['#0B5FFF'],
          fonts: [{ family: 'Inter', styles: ['Regular'] }],
          assetCount: 1,
          hasThumbnail: true,
          warnings: [],
        },
        thumbnailPath: 'figma/thumbnail.png',
        contextPath: 'figma/DESIGN-context.md',
        suggestedPrompt,
        label: 'project-flow.fig',
      },
    });
  });

  await page.goto('/');
  await createProject(page, 'Project Figma import success');
  await expectWorkspaceReady(page);
  const composer = page.getByTestId('chat-composer');
  const input = page.getByTestId('chat-composer-input');

  await composer.getByTestId('chat-plus-trigger').click();
  await page.getByTestId('composer-plus-figma').click();
  const figmaImport = page.getByRole('dialog', { name: 'Import from Figma' });
  await expect(figmaImport).toBeVisible();
  await figmaImport.locator('input[type="file"]').setInputFiles({
    name: 'project-flow.fig',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('fake project fig payload', 'utf8'),
  });
  await expect(figmaImport).toContainText('project-flow.fig');
  await figmaImport.getByPlaceholder(/Optional: notes/i).fill('Keep the original hierarchy.');
  await figmaImport.getByRole('button', { name: 'Import & build' }).click();

  await expect.poll(() => importBodies.length, { timeout: 10_000 }).toBe(1);
  expect(importBodies[0]).toContain('project-flow.fig');
  expect(importBodies[0]).toContain('Keep the original hierarchy.');
  await expect(figmaImport).toBeVisible();
  await expect(input).toContainText(suggestedPrompt);
});

test('[P1] project detail Figma import keeps the dialog open and retryable on decode failure', async ({ page }) => {
  const importBodies: string[] = [];

  await routeComposerPlusFixtures(page);
  await page.route('**/api/projects/*/figma/import', async (route) => {
    importBodies.push(route.request().postData() ?? '');
    await route.fulfill({
      status: 500,
      json: { error: { message: 'Could not decode the Figma archive.' } },
    });
  });

  await page.goto('/');
  await createProject(page, 'Project Figma import failure');
  await expectWorkspaceReady(page);
  const composer = page.getByTestId('chat-composer');
  const input = page.getByTestId('chat-composer-input');

  await composer.getByTestId('chat-plus-trigger').click();
  await page.getByTestId('composer-plus-figma').click();
  const figmaImport = page.getByRole('dialog', { name: 'Import from Figma' });
  await figmaImport.locator('input[type="file"]').setInputFiles({
    name: 'broken-project-flow.fig',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('broken fig payload', 'utf8'),
  });
  await figmaImport.getByRole('button', { name: 'Import & build' }).click();

  await expect.poll(() => importBodies.length, { timeout: 10_000 }).toBe(1);
  await expect(figmaImport).toBeVisible();
  await expect(figmaImport).toContainText('Could not decode the Figma archive.');
  await expect(figmaImport.getByRole('button', { name: 'Import & build' })).toBeEnabled();
  await expect(input).not.toContainText('figma/DESIGN-context.md');
});

test('[P1] project detail composer sends referenced workspace contexts into the run request', async ({ page }) => {
  const runRequestBodies: Array<Record<string, unknown>> = [];
  const referenceProject = {
    id: 'ref-project-payload',
    name: 'Reference Project Payload',
    skillId: null,
    designSystemId: null,
    createdAt: Date.now() - 1_000,
    updatedAt: Date.now(),
    metadata: {
      kind: 'prototype',
      nameSource: 'user',
    },
  };

  await routeComposerPlusFixtures(page);
  await routeSuccessfulRuns(page, runRequestBodies, 'workspace-context-payload-run');
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [referenceProject] } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/projects/ref-project-payload**', async (route) => {
    await route.fulfill({
      json: {
        project: referenceProject,
        resolvedDir: '/tmp/open-design/reference-project-payload',
      },
    });
  });
  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        json: {
          project: {
            id: route.request().url().split('/api/projects/')[1]?.split(/[/?#]/)[0] ?? 'project',
            name: 'Composer workspace context payload',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: body.metadata ?? { kind: 'prototype' },
          },
        },
      });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/dialog/open-folder', async (route) => {
    await route.fulfill({ json: { path: '/tmp/open-design/local-code-project-payload' } });
  });
  await page.route('**/api/dir-exists', async (route) => {
    await route.fulfill({ json: { exists: true } });
  });

  await page.goto('/');
  await createProject(page, 'Composer workspace context payload');
  await expectWorkspaceReady(page);
  const composer = page.getByTestId('chat-composer');
  const input = page.getByTestId('chat-composer-input');

  await composer.getByTestId('chat-plus-trigger').click();
  await page.getByTestId('composer-plus-reference-project').click();
  const referenceDialog = page.getByRole('dialog', { name: 'Reference another project' });
  await expect(referenceDialog.getByRole('option', { name: /Reference Project Payload/i })).toHaveAttribute('aria-selected', 'true');
  await referenceDialog.getByRole('button', { name: 'Reference project' }).click();
  await expect(composer.locator('.staged-context--workspace', { hasText: 'Reference Project Payload' })).toBeVisible();

  await composer.getByTestId('chat-plus-trigger').click();
  await page.getByTestId('composer-plus-local-code').click();
  await expect(composer.locator('.staged-context--workspace', { hasText: 'local-code-project-payload' })).toBeVisible();

  await input.fill('Use the referenced workspace contexts in this run.');
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);

  await expect.poll(() => runRequestBodies.length).toBe(1);
  const context = runRequestBodies[0]?.context as { workspaceItems?: Array<{ id?: string; label?: string; absolutePath?: string }> } | undefined;
  expect(context?.workspaceItems ?? []).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'project:ref-project-payload',
        label: 'Reference Project Payload',
        absolutePath: '/tmp/open-design/reference-project-payload',
      }),
      expect.objectContaining({
        id: 'local-code:/tmp/open-design/local-code-project-payload',
        label: 'local-code-project-payload',
        absolutePath: '/tmp/open-design/local-code-project-payload',
      }),
    ]),
  );
});

test('[P1] project detail composer removing local-code context updates metadata and the next run request', async ({ page }) => {
  const patchRequests: Array<Record<string, unknown>> = [];
  const runRequestBodies: Array<Record<string, unknown>> = [];

  await routeComposerPlusFixtures(page);
  await routeSuccessfulRuns(page, runRequestBodies, 'workspace-context-remove-run');
  await page.route('**/api/dialog/open-folder', async (route) => {
    await route.fulfill({ json: { path: '/tmp/open-design/local-code-remove' } });
  });
  await page.route('**/api/dir-exists', async (route) => {
    await route.fulfill({ json: { exists: true } });
  });
  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      patchRequests.push(body);
      await route.fulfill({
        json: {
          project: {
            id: route.request().url().split('/api/projects/')[1]?.split(/[/?#]/)[0] ?? 'project',
            name: 'Composer remove context',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: body.metadata ?? { kind: 'prototype' },
          },
        },
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await createProject(page, 'Composer remove context');
  await expectWorkspaceReady(page);
  const composer = page.getByTestId('chat-composer');
  const input = page.getByTestId('chat-composer-input');

  await composer.getByTestId('chat-plus-trigger').click();
  await page.getByTestId('composer-plus-local-code').click();
  const chip = composer.locator('.staged-context--workspace', { hasText: 'local-code-remove' });
  await expect(chip).toBeVisible();
  await expect(input).toContainText('local-code-remove');

  await chip.getByRole('button', { name: /local-code-remove/i }).click();
  await expect(chip).toHaveCount(0);
  await expect(input).not.toContainText('local-code-remove');
  await expect.poll(() => patchRequests.length).toBeGreaterThanOrEqual(2);
  expect((patchRequests.at(-1)?.metadata as { linkedDirs?: string[] } | undefined)?.linkedDirs ?? []).toEqual([]);

  await input.fill('Run without the removed local code context.');
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);

  await expect.poll(() => runRequestBodies.length).toBe(1);
  const context = runRequestBodies[0]?.context as { workspaceItems?: Array<{ label?: string; absolutePath?: string }> } | undefined;
  expect(context?.workspaceItems ?? []).toEqual([]);
});

test('[P1] project detail composer context actions emit analytics event fields', async ({ page }) => {
  const analyticsBodies: string[] = [];

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        config: {
          mode: 'daemon',
          apiKey: '',
          baseUrl: 'https://api.anthropic.com',
          model: 'claude-sonnet-4-5',
          agentId: 'codex',
          skillId: null,
          designSystemId: null,
          onboardingCompleted: true,
          agentModels: { codex: { model: 'default', reasoning: 'default' } },
          privacyDecisionAt: 1,
          telemetry: { metrics: true, content: false, artifactManifest: false },
        },
      },
    });
  });
  await page.route('**/api/analytics/config', async (route) => {
    await route.fulfill({
      json: {
        enabled: true,
        env: 'e2e',
        key: 'phc_e2e',
        host: 'https://analytics.open-design.test',
        installationId: 'e2e-installation',
      },
    });
  });
  await page.route('https://analytics.open-design.test/**', async (route) => {
    analyticsBodies.push(route.request().postData() ?? '');
    await route.fulfill({ status: 200, json: { status: 1 } });
  });
  await routeComposerPlusFixtures(page);
  await page.route('**/api/dialog/open-folder', async (route) => {
    await route.fulfill({ json: { path: '/tmp/open-design/local-code-analytics' } });
  });
  await page.route('**/api/dir-exists', async (route) => {
    await route.fulfill({ json: { exists: true } });
  });
  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        json: {
          project: {
            id: route.request().url().split('/api/projects/')[1]?.split(/[/?#]/)[0] ?? 'project',
            name: 'Composer context analytics',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: body.metadata ?? { kind: 'prototype' },
          },
        },
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await createProject(page, 'Composer context analytics');
  await expectWorkspaceReady(page);
  const composer = page.getByTestId('chat-composer');

  await composer.getByTestId('chat-plus-trigger').click();
  await page.getByTestId('composer-plus-local-code').click();
  const chip = composer.locator('.staged-context--workspace', { hasText: 'local-code-analytics' });
  await expect(chip).toBeVisible();
  await chip.getByRole('button', { name: /local-code-analytics/i }).click();
  await expect(chip).toHaveCount(0);

  await expect.poll(() => analyticsBodies.join('\n')).toContain('plus_pick');
  const raw = analyticsBodies.join('\n');
  expect(raw).toContain('context_remove');
  expect(raw).toContain('workspace');
  expect(raw).toContain('local-code');
});

test('[P1] Open Design Cloud hard balance gate blocks a project send before a daemon run starts', async ({ page }) => {
  test.setTimeout(60_000);

  const runRequestBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          config: {
            mode: 'daemon',
            apiKey: '',
            baseUrl: 'https://api.anthropic.com',
            model: 'claude-sonnet-4-5',
            agentId: 'amr',
            skillId: null,
            designSystemId: null,
            onboardingCompleted: true,
            privacyDecisionAt: 1,
            telemetry: { metrics: false, content: false, artifactManifest: false },
            agentModels: {},
            agentCliEnv: {},
          },
        },
      });
      return;
    }
    await route.continue();
  });
  await routeAgents(page, [
    ...AGENTS,
    {
      id: 'amr',
      name: 'Open Design Cloud',
      bin: 'amr',
      available: true,
      version: 'cloud',
      models: [{ id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' }],
    },
  ]);
  await page.route('**/api/integrations/vela/wallet**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'available',
        profile: 'local',
        user: { id: 'amr-balance-user', email: 'blocked@example.com', plan: 'free' },
        balanceUsd: '0.00',
        updatedAt: '2026-07-09T00:00:00.000Z',
        fetchedAt: '2026-07-09T00:00:00.000Z',
        stale: false,
        source: 'vela_api',
      }),
    });
  });
  await page.route('**/api/runs', async (route) => {
    runRequestBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"should-not-start"}',
    });
  });

  await page.goto('/');
  await createProject(page, 'AMR balance gate project send');
  await expectWorkspaceReady(page);

  const input = page.getByTestId('chat-composer-input');
  await input.fill('Start a cloud run that should be blocked before the daemon run.');
  await page.getByTestId('chat-send').click();

  const dialog = page.getByTestId('amr-balance-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('$0.00');
  await expect(dialog.getByTestId('amr-balance-dialog-plans')).toBeVisible();
  await page.waitForTimeout(500);
  expect(runRequestBodies).toHaveLength(0);
  await expect(page.getByTestId('chat-queued-send-strip')).toContainText(
    'Start a cloud run that should be blocked',
  );
});

test('[P0] @critical project detail composer agent menu lets the user switch Local CLI agents and models', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await createProject(page, 'Composer agent switch');
  await expectWorkspaceReady(page);

  const { menu, claudeButton } = await openComposerAgentMenu(page);
  await expect(claudeButton).toBeVisible();
  await claudeButton.click();

  await expect(claudeButton).toHaveAttribute('aria-current', 'true');
  const modelSelect = menu.locator('.avatar-model-section [role=\"combobox\"]').first();
  await expect(modelSelect).toBeVisible();
  await expect(modelSelect).toContainText(/default/i);
  await modelSelect.click();
  await page.getByRole('option', { name: /^Sonnet \(alias\)$/i }).click();
  await expect(modelSelect).toContainText(/Sonnet/i);
});

test('[P0] project detail composer agent, model, and Plan mode switches carry into the next daemon run request', async ({ page }) => {
  test.setTimeout(60_000);
  const runRequestBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/runs', async (route) => {
    const raw = route.request().postData();
    if (raw) runRequestBodies.push(JSON.parse(raw) as Record<string, unknown>);
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"agent-model-run"}',
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: ['event: end', 'data: {"code":0,"status":"succeeded"}', '', ''].join('\n'),
    });
  });

  await page.goto('/');
  await createProject(page, 'Composer agent switch run context');
  await expectWorkspaceReady(page);

  const { menu, claudeButton } = await openComposerAgentMenu(page);
  await claudeButton.click();
  const modelSelect = menu.locator('.avatar-model-section [role=\"combobox\"]').first();
  await modelSelect.click();
  await page.getByRole('option', { name: /^Sonnet \(alias\)$/i }).click();
  await expect(modelSelect).toContainText(/Sonnet/i);
  await page.keyboard.press('Escape');
  await expect(page.locator('.avatar-popover[role="dialog"]')).toHaveCount(0);

  await selectComposerSessionMode(page, 'Plan mode');

  const input = page.getByTestId('chat-composer-input');
  await input.fill('Plan the selected local agent run.');
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);

  expect(runRequestBodies.length).toBeGreaterThan(0);
  expect(runRequestBodies[0]?.agentId).toBe('claude');
  expect(runRequestBodies[0]?.model).toBe('sonnet');
  expect(runRequestBodies[0]?.sessionMode).toBe('plan');
});

test('[P1] project detail composer can alternate Design, Ask, and Plan modes across turns', async ({ page }) => {
  test.setTimeout(60_000);
  const runRequestBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/runs', async (route) => {
    const raw = route.request().postData();
    if (raw) runRequestBodies.push(JSON.parse(raw) as Record<string, unknown>);
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: `mode-run-${runRequestBodies.length}` }),
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: ['event: end', 'data: {"code":0,"status":"succeeded"}', '', ''].join('\n'),
    });
  });

  await page.goto('/');
  await createProject(page, 'Composer session mode alternation');
  await expectWorkspaceReady(page);

  async function sendTurn(prompt: string) {
    const input = page.getByTestId('chat-composer-input');
    await expect(input).toBeVisible();
    await input.fill(prompt);
    await Promise.all([
      page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
      page.getByTestId('chat-send').click(),
    ]);
    await expect(page.getByTestId('chat-send')).toBeEnabled({ timeout: 15_000 });
  }

  await selectComposerSessionMode(page, 'Design mode');
  await sendTurn('Design the first iteration.');

  await selectComposerSessionMode(page, 'Ask mode');
  await sendTurn('Ask a clarifying question about the direction.');

  await selectComposerSessionMode(page, 'Plan mode');
  await sendTurn('Plan the implementation steps.');

  await selectComposerSessionMode(page, 'Design mode');
  await sendTurn('Design the final iteration.');

  expect(runRequestBodies.map((body) => body.sessionMode)).toEqual(['design', 'chat', 'plan', 'design']);
});

test('[P1] project detail composer keeps the selected mode across consecutive turns', async ({ page }) => {
  test.setTimeout(60_000);
  const runRequestBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/runs', async (route) => {
    const raw = route.request().postData();
    if (raw) runRequestBodies.push(JSON.parse(raw) as Record<string, unknown>);
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: `same-mode-run-${runRequestBodies.length}` }),
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: ['event: end', 'data: {"code":0,"status":"succeeded"}', '', ''].join('\n'),
    });
  });

  await page.goto('/');
  await createProject(page, 'Composer same session mode reuse');
  await expectWorkspaceReady(page);

  async function sendTurn(prompt: string) {
    const input = page.getByTestId('chat-composer-input');
    await expect(input).toBeVisible();
    await input.fill(prompt);
    await Promise.all([
      page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
      page.getByTestId('chat-send').click(),
    ]);
    await expect(page.getByTestId('chat-send')).toBeEnabled({ timeout: 15_000 });
  }

  await selectComposerSessionMode(page, 'Plan mode');
  await sendTurn('Plan the first pass.');
  await sendTurn('Plan the second pass without changing mode.');

  expect(runRequestBodies.map((body) => body.sessionMode)).toEqual(['plan', 'plan']);
  await expect(page.getByTestId('chat-composer').getByTestId('session-mode-trigger')).toHaveAttribute(
    'aria-label',
    'Plan mode',
  );
});

test('[P0] @critical project detail composer BYOK model switch persists from the agent menu', async ({ page }) => {
  test.setTimeout(60_000);
  const config = {
    mode: 'daemon',
    apiKey: 'sk-openai-test',
    apiProtocol: 'openai',
    apiVersion: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-2024-05-13',
    apiProviderBaseUrl: 'https://api.openai.com/v1',
    agentId: 'codex',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    privacyDecisionAt: 1,
    telemetry: { metrics: false, content: false, artifactManifest: false },
    mediaProviders: {},
    agentModels: { codex: { model: 'default' } },
    agentCliEnv: {},
  };

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: config },
  );
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ config: body }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ config }),
    });
  });

  await page.goto('/');
  await createProject(page, 'Composer BYOK model switch');
  await expectWorkspaceReady(page);

  const { menu } = await openComposerAgentMenu(page);
  await menu.getByRole('button', { name: /API · BYOK|Use API/i }).click();

  const modelSelect = menu.locator('.avatar-model-section [role="combobox"]').first();
  await expect(modelSelect).toContainText('gpt-4o-2024-05-13');
  await modelSelect.click();
  const modelPopover = page.getByTestId('avatar-byok-model-popover');
  await expect(modelPopover.getByRole('option', { name: /^gpt-4o-mini$/i })).toBeVisible();
  await expect(modelPopover.getByRole('option', { name: /deepseek/i })).toHaveCount(0);
  await expect(modelPopover.getByRole('option', { name: /MiniMax/i })).toHaveCount(0);
  await modelPopover.getByRole('option', { name: /^gpt-4o-mini$/i }).click();

  await expect(modelSelect).toContainText('gpt-4o-mini');
  await expect.poll(async () => page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY)).toMatchObject({
    mode: 'api',
    model: 'gpt-4o-mini',
  });
});

test('[P0] @critical project detail composer keeps Local CLI and BYOK model choices isolated', async ({ page }) => {
  test.setTimeout(60_000);
  const config = {
    mode: 'daemon',
    apiKey: 'sk-openai-test',
    apiProtocol: 'openai',
    apiVersion: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-2024-05-13',
    apiProviderBaseUrl: 'https://api.openai.com/v1',
    agentId: 'codex',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    privacyDecisionAt: 1,
    telemetry: { metrics: false, content: false, artifactManifest: false },
    mediaProviders: {},
    agentModels: { codex: { model: 'default' } },
    agentCliEnv: {},
  };

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: config },
  );
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ config: body }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ config }),
    });
  });

  await page.goto('/');
  await createProject(page, 'Composer model mode isolation');
  await expectWorkspaceReady(page);

  const { menu, claudeButton } = await openComposerAgentMenu(page);
  await claudeButton.click();
  const localModelSelect = menu.locator('.avatar-model-section [role="combobox"]').first();
  await localModelSelect.click();
  await page.getByRole('option', { name: /^Sonnet \(alias\)$/i }).click();
  await expect(localModelSelect).toContainText(/Sonnet/i);

  await menu.getByRole('button', { name: /API · BYOK|Use API/i }).click();
  const byokModelSelect = menu.locator('.avatar-model-section [role="combobox"]').first();
  await expect(byokModelSelect).toContainText('gpt-4o-2024-05-13');
  await byokModelSelect.click();
  await page.getByTestId('avatar-byok-model-popover').getByRole('option', { name: /^gpt-4o-mini$/i }).click();
  await expect(byokModelSelect).toContainText('gpt-4o-mini');

  await menu.getByRole('button', { name: /Local CLI|Use local|本机 CLI|本地 CLI/i }).click();
  await expect(claudeButton).toHaveAttribute('aria-current', 'true');
  await expect(localModelSelect).toContainText(/Sonnet/i);
  await expect.poll(async () => page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY)).toMatchObject({
    mode: 'daemon',
    agentId: 'claude',
    model: 'gpt-4o-mini',
    agentModels: {
      claude: { model: 'sonnet' },
    },
  });
});

test('[P0] clearing the project design system removes designSystemId from the next run request', async ({ page }) => {
  const patchBodies: Array<Record<string, unknown>> = [];
  const runRequestBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: DESIGN_SYSTEMS } });
  });
  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    patchBodies.push(body);
    await route.continue();
  });
  await page.route('**/api/runs', async (route) => {
    const raw = route.request().postData();
    if (raw) runRequestBodies.push(JSON.parse(raw) as Record<string, unknown>);
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"design-system-clear-run"}',
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: ['event: end', 'data: {"code":0,"status":"succeeded"}', '', ''].join('\n'),
    });
  });

  await page.goto('/');
  await createProject(page, 'Header design system clear run context');
  await expectWorkspaceReady(page);

  const trigger = page.getByTestId('project-ds-picker-trigger');
  await trigger.click();
  await page.getByTestId('project-ds-picker-search').fill('editorial');
  const editorialOption = page.getByRole('option', { name: /^Editorial Noir$/ });
  await expect(editorialOption).toBeVisible();
  await editorialOption.click();
  await expect(trigger).toContainText(/Editorial Noir/i);

  await trigger.click();
  await page.locator('.project-ds-picker-option').first().click();
  await expect(trigger).not.toContainText(/Editorial Noir/i);

  expect(patchBodies.some((body) => Object.prototype.hasOwnProperty.call(body, 'designSystemId') && body.designSystemId === null)).toBe(true);

  const input = page.getByTestId('chat-composer-input');
  await input.fill('Generate this without an active design system.');
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);

  expect(runRequestBodies.length).toBeGreaterThan(0);
  expect(runRequestBodies[0]?.designSystemId).toBeNull();
});

test('[P1] project title rename persists after reload and ignores blank titles', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Original rename title');
  await expectWorkspaceReady(page);

  const title = page.getByTestId('project-title');
  await renameProjectTitle(page, title, 'Renamed persistent title');
  await expect(title).toContainText('Renamed persistent title');

  await page.reload();
  await expectWorkspaceReady(page);
  await expect(page.getByTestId('project-title')).toContainText('Renamed persistent title');

  await renameProjectTitle(page, page.getByTestId('project-title'), '   ');
  await page.reload();
  await expectWorkspaceReady(page);
  await expect(page.getByTestId('project-title')).toContainText('Renamed persistent title');

  const project = await fetchCurrentProject(page);
  expect(project.name).toBe('Renamed persistent title');
});


test('[P2] project header keeps the settings, handoff, and avatar controls pinned on compact desktop widths', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto('/');
  await createProject(page, 'Header controls stay pinned');
  await expectWorkspaceReady(page);

  const handoffTrigger = page.getByTestId('handoff-trigger');
  const avatarTrigger = page.locator('.avatar-agent-trigger');
  await expect(page.getByTestId('project-title')).toBeVisible();
  await expect(handoffTrigger).toBeVisible();
  await expect(avatarTrigger).toBeVisible();

  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const handoff = document.querySelector('[data-testid="handoff-trigger"]') as HTMLElement | null;
    const avatar = document.querySelector('.avatar-agent-trigger') as HTMLElement | null;
    const title = document.querySelector('[data-testid="project-title"]') as HTMLElement | null;
    const overflow = Math.max(0, root.scrollWidth - root.clientWidth);
    return {
      overflow,
      handoffRight: handoff?.getBoundingClientRect().right ?? 0,
      avatarRight: avatar?.getBoundingClientRect().right ?? 0,
      titleRight: title?.getBoundingClientRect().right ?? 0,
      viewportWidth: window.innerWidth,
    };
  });

  expect(layout.overflow).toBeLessThanOrEqual(2);
  expect(layout.handoffRight).toBeGreaterThan(layout.titleRight);
  expect(layout.handoffRight).toBeLessThanOrEqual(layout.viewportWidth - 8);
  expect(layout.avatarRight).toBeGreaterThan(0);
  expect(layout.avatarRight).toBeLessThanOrEqual(layout.viewportWidth - 8);
});

test('[P1] project handoff AMR website link carries attribution from the CLI tab', async ({ page }) => {
  await routeHandoffEditors(page);
  await page.goto('/');
  await createProject(page, 'Handoff AMR attribution');
  await expectWorkspaceReady(page);

  const menu = await openHandoffCliTab(page);
  const amrLink = menu.locator('.handoff-amr-link');
  await expect(amrLink).toBeVisible();

  const popupPromise = page.waitForEvent('popup');
  await amrLink.click();
  const popup = await popupPromise;
  const url = new URL(popup.url());
  await popup.close();

  expect(url.searchParams.get('od_origin')).toBe('open_design');
  expect(url.searchParams.get('od_entry_source')).toBe('handoff_amr_website');
  expect(url.searchParams.get('od_entry_id')).toBeTruthy();
});

test('[P1] project handoff CLI prompt copies the project path, framework, id, and target agent', async ({ page }) => {
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
  await routeHandoffEditors(page);
  await page.goto('/');
  await createProject(page, 'Handoff CLI prompt contract');
  await expectWorkspaceReady(page);
  const { projectId } = getProjectContextFromUrl(page);

  const menu = await openHandoffCliTab(page);
  const pathButton = menu.locator('.handoff-path-button');
  await expect(pathButton).toBeEnabled();
  const projectDir = await pathButton.getAttribute('title');
  expect(projectDir).toBeTruthy();

  await menu.getByRole('button', { name: /^Next\.js$/ }).click();
  await menu.getByTestId('handoff-cli-item-codex').click();
  await expect(menu.getByTestId('handoff-cli-item-codex')).toContainText('Copied');

  const copied = await page.evaluate(() => {
    return (window as typeof window & { __copiedTexts?: string[] }).__copiedTexts ?? [];
  });
  const prompt = copied.at(-1) ?? '';
  expect(prompt).toContain(projectDir as string);
  expect(prompt).toContain('cd ');
  expect(prompt).toContain('Target: Next.js / React');
  expect(prompt).toContain('CLI: Codex CLI (codex)');
  expect(prompt).toContain(`Project ID: ${projectId}`);
});

test('[P1] canceling design file deletion keeps the file and open tab', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Design file delete cancel flow');
  await expectWorkspaceReady(page);

  const uploadedName = await uploadTinyPng(page, 'delete-cancel.png');
  const fileTab = tabBySuffix(page, uploadedName);
  await expect(fileTab).toHaveAttribute('aria-selected', 'true');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('delete-cancel.png');
    await dialog.dismiss();
  });
  await openAllProjectFiles(page);
  await rowByFileName(page, uploadedName).hover();
  await menuByFileName(page, uploadedName).click();
  await page.getByTestId(`design-file-delete-${uploadedName}`).click();

  await expect(rowByFileName(page, uploadedName)).toBeVisible();
  await expect(fileTab).toBeVisible();

  const { projectId } = getProjectContextFromUrl(page);
  const files = await listProjectFiles(page, projectId);
  expect(files.map((file) => file.name)).toContain(uploadedName);
});

test('[P1] project detail workspace keeps design file tabs and preview controls visible for uploaded html artifacts', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Workspace preview structure');
  await expectWorkspaceReady(page);

  const uploadedName = await uploadTinyHtml(page, 'workspace-preview.html', '<!doctype html><html><body><main><h1>Workspace Preview Structure</h1><p>Preview stays visible.</p></main></body></html>');

  const fileTab = tabBySuffix(page, uploadedName);
  await expect(fileTab).toBeVisible();
  await expect(fileTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Design Files' })).toBeVisible();

  await openUploadedHtmlArtifactPreview(page, uploadedName);

  await expect(page.getByRole('tablist', { name: 'View mode' })).toHaveCount(0);
  await expect(artifactPreview(page)).toBeVisible();
  await expect(
    artifactPreviewFrame(page).getByRole('heading', { name: 'Workspace Preview Structure' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Preview viewport/i })).toBeVisible();
  await expect(page.locator('pre.viewer-source')).toHaveCount(0);
});

test('[P1] project detail session mode switch carries Ask and Plan semantics into daemon runs', async ({ page }) => {
  const runRequestBodies: Array<Record<string, unknown>> = [];
  await routeSuccessfulRuns(page, runRequestBodies, 'session-mode-run');

  await page.goto('/');
  await createProject(page, 'Project session mode contract');
  await expectWorkspaceReady(page);

  const modeTrigger = page.getByTestId('session-mode-trigger');
  await expect(modeTrigger).toHaveAttribute('aria-label', 'Design mode');
  await expect(modeTrigger).toContainText('Design');

  await modeTrigger.click();
  await page.getByRole('menuitemradio', { name: 'Plan mode' }).click();
  await expect(modeTrigger).toHaveAttribute('aria-label', 'Plan mode');
  await expect(modeTrigger).toContainText('Plan');

  await page.getByTestId('chat-composer-input').fill('Draft the plan before generating files.');
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);
  await expect.poll(() => runRequestBodies.length).toBe(1);
  expect(runRequestBodies[0]?.sessionMode).toBe('plan');
  await expect(page.getByTestId('msg-session-mode-chip').last()).toContainText('Plan');

  await modeTrigger.click();
  await page.getByRole('menuitemradio', { name: 'Ask mode' }).click();
  await expect(modeTrigger).toHaveAttribute('aria-label', 'Ask mode');
  await expect(modeTrigger).toContainText('Ask');

  await page.getByTestId('chat-composer-input').fill('Just answer this without creating files.');
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);
  await expect.poll(() => runRequestBodies.length).toBe(2);
  expect(runRequestBodies[1]?.sessionMode).toBe('chat');
  await expect(page.getByTestId('msg-session-mode-chip').last()).toContainText('Ask');
});

test('[P1] project detail active file context is sent with the run and shown on the user message', async ({ page }) => {
  const runRequestBodies: Array<Record<string, unknown>> = [];
  await routeSuccessfulRuns(page, runRequestBodies, 'workspace-context-run');

  await page.goto('/');
  await createProject(page, 'Workspace context chip contract');
  await expectWorkspaceReady(page);

  const uploadedName = await uploadTinyHtml(
    page,
    'workspace-context.html',
    '<!doctype html><html><body><main><h1>Workspace Context</h1></main></body></html>',
  );
  await expect(tabBySuffix(page, uploadedName)).toHaveAttribute('aria-selected', 'true');

  await page.getByTestId('chat-composer-input').fill('Use the currently open file as context.');
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);

  await expect.poll(() => runRequestBodies.length).toBe(1);
  const context = runRequestBodies[0]?.context as { workspaceItems?: Array<{ label?: string; id?: string }> } | undefined;
  expect(context?.workspaceItems?.some((item) => item.label === uploadedName || item.id?.includes(uploadedName))).toBe(true);
  const chip = page.getByTestId('msg-workspace-context-chip').last();
  await expect(chip).toBeVisible();
  await expect(chip).toContainText(uploadedName);
});

test('[P1] project detail HTML version manager previews and restores an older snapshot', async ({ page }) => {
  const restoredRequests: string[] = [];

  await page.goto('/');
  await createProject(page, 'HTML version manager contract');
  await expectWorkspaceReady(page);

  const uploadedName = await uploadTinyHtml(
    page,
    'version-manager.html',
    '<!doctype html><html><body><main><h1>Current Version</h1></main></body></html>',
  );
  const { projectId } = getProjectContextFromUrl(page);
  const now = Date.now();
  const currentVersion = {
    id: 'v-current',
    fileName: uploadedName,
    version: 2,
    label: 'Current generated HTML',
    createdAt: now,
    source: 'ai',
    prompt: 'Current generated HTML',
    promptSource: 'message',
    size: 82,
    mime: 'text/html',
    kind: 'html',
    current: true,
  };
  const oldVersion = {
    id: 'v-old',
    fileName: uploadedName,
    version: 1,
    label: 'Initial generated HTML',
    createdAt: now - 60_000,
    source: 'manual',
    prompt: 'Initial generated HTML',
    promptSource: 'manual',
    size: 78,
    mime: 'text/html',
    kind: 'html',
    current: false,
  };
  const restoredVersion = {
    ...oldVersion,
    id: 'v-restored',
    version: 3,
    source: 'restore',
    current: true,
    restoreFromVersionId: oldVersion.id,
  };
  const oldVersionContent = '<!doctype html><html><body><main><h1>Initial Version</h1></main></body></html>';
  const restoredContent = '<!doctype html><html><body><main><h1>Restored Version</h1></main></body></html>';

  await page.route(`**/api/projects/${projectId}/files/${uploadedName}/versions`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          file: { name: uploadedName, kind: 'html', mime: 'text/html', size: oldVersionContent.length, mtime: now },
          versions: [currentVersion, oldVersion],
        },
      });
      return;
    }
    await route.continue();
  });
  await page.route(`**/api/projects/${projectId}/files/${uploadedName}/versions/v-old`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { version: oldVersion, content: oldVersionContent } });
      return;
    }
    await route.continue();
  });
  await page.route(`**/api/projects/${projectId}/files/${uploadedName}/versions/v-old/restore`, async (route) => {
    if (route.request().method() === 'POST') {
      restoredRequests.push(route.request().url());
      await route.fulfill({
        json: {
          file: { name: uploadedName, kind: 'html', mime: 'text/html', size: restoredContent.length, mtime: Date.now() },
          version: restoredVersion,
        },
      });
      return;
    }
    await route.continue();
  });

  await openUploadedHtmlArtifactPreview(page, uploadedName);
  await page.getByRole('button', { name: 'Versions' }).click();
  const dialog = page.getByRole('dialog', { name: 'Versions' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('option', { name: /Current generated HTML/i })).toHaveAttribute('aria-selected', 'true');

  await dialog.getByRole('option', { name: /Initial generated HTML/i }).click();
  await expect(dialog.locator('iframe').first().contentFrame().getByRole('heading', { name: 'Initial Version' })).toBeVisible();

  await dialog.getByRole('button', { name: 'Switch to this version' }).click();
  await dialog.getByRole('dialog', { name: 'Switch to this version?' }).getByRole('button', { name: 'Switch' }).click();
  await expect.poll(() => restoredRequests.length).toBe(1);
  await expect(dialog).toHaveCount(0);
});

test('[P1] project detail assistant completion actions support copy, fork, and feedback', async ({ page }) => {
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

  const { projectId, conversationId, assistantMessageId, assistantText } =
    await seedProjectWithAssistantCompletion(page);

  await page.goto(`/projects/${projectId}/conversations/${conversationId}`);
  await expectWorkspaceReady(page);
  await expect(page.getByText('Assistant completion actions fixture')).toBeVisible();

  const copyButton = page.getByTestId('assistant-copy-markdown');
  await expect(copyButton).toBeVisible();
  await copyButton.click();
  await expect(copyButton).toHaveAttribute('data-copied', 'true');
  const copied = await page.evaluate(() => {
    return (window as typeof window & { __copiedTexts?: string[] }).__copiedTexts ?? [];
  });
  expect(copied.at(-1)).toBe(assistantText);

  const positive = page.getByTestId('assistant-feedback-positive');
  const negative = page.getByTestId('assistant-feedback-negative');
  await expect(positive).toBeVisible();
  await expect(negative).toBeVisible();
  await positive.click();
  await expect(positive).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.assistant-feedback-reasons')).toBeVisible();
  await negative.click();
  await expect(negative).toHaveAttribute('aria-pressed', 'true');
  await expect(positive).toHaveAttribute('aria-pressed', 'false');

  const forkRequestPromise = page.waitForRequest((request) => {
    return request.method() === 'POST'
      && request.url().endsWith(`/api/projects/${projectId}/conversations`);
  });
  await page.getByTestId('assistant-fork-button').click();
  const forkRequest = await forkRequestPromise;
  const forkBody = forkRequest.postDataJSON() as {
    forkAfterMessageId?: string;
    seedFromConversationId?: string;
    seedMessages?: Array<{ id?: string; role?: string }>;
  };
  expect(forkBody.seedFromConversationId).toBe(conversationId);
  expect(forkBody.forkAfterMessageId).toBe(assistantMessageId);
  expect(
    forkBody.seedMessages?.some((message) => {
      return message.id === assistantMessageId && message.role === 'assistant';
    }),
  ).toBe(true);
  await expect
    .poll(() => getProjectContextFromUrl(page).conversationId)
    .not.toBe(conversationId);
});

test('[P1] project detail conversations menu supports new chat, search, counts, and run duration metadata', async ({ page }) => {
  const { projectId, conversations } = await seedProjectConversationHistory(page);
  await routeConversationHistoryFixtures(page, projectId, conversations);

  await page.goto(`/projects/${projectId}/conversations/${conversations[0]!.id}`);
  await expectWorkspaceReady(page);

  await page.getByTestId('conversation-history-trigger').click();
  const menu = page.getByTestId('conversation-history-menu');
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('conversation-history-count')).toHaveText('3');

  await expect(page.getByTestId(`conversation-select-${conversations[0]!.id}`)).toContainText('Runway final polish');
  await expect(page.getByTestId(`conversation-meta-${conversations[0]!.id}`)).toHaveText('8 msg · 5m 42s');
  await expect(page.getByTestId(`conversation-meta-${conversations[1]!.id}`)).toHaveText('6 msg · 19m 00s');
  await expect(page.getByTestId(`conversation-meta-${conversations[2]!.id}`)).toContainText('6 msg ·');

  await page.getByTestId('conversation-history-search').fill('font audit');
  await expect(page.getByTestId('conversation-history-count')).toHaveText('1 / 3');
  await expect(page.getByTestId(`conversation-item-${conversations[1]!.id}`)).toBeVisible();
  await expect(page.getByTestId(`conversation-item-${conversations[0]!.id}`)).toHaveCount(0);

  await page.getByTestId('conversation-history-search').fill('');
  const newConversationRequestPromise = page.waitForRequest((request) => {
    return request.method() === 'POST'
      && request.url().endsWith(`/api/projects/${projectId}/conversations`);
  });
  await page.getByTestId('conversation-history-new').click();
  await newConversationRequestPromise;
  await expect(page.getByTestId('conversation-history-menu')).toHaveCount(0);

  await page.getByTestId('conversation-history-trigger').click();
  await expect(page.getByTestId('conversation-history-count')).toHaveText('4');
  await expect(page.getByTestId('conversation-select-conv-new-history')).toContainText('Untitled');
  await expect(page.getByTestId('conversation-meta-conv-new-history')).toHaveText('0 msg · now');
});

test('[P0] project detail share menu copies the current share link for uploaded html artifacts', async ({ page }) => {
  let uploadedName = '';
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
  await page.route('**/api/projects/*/deployments', async (route) => {
    await route.fulfill({
      json: {
        deployments: uploadedName
          ? [{
              id: 'ready-share-link',
              projectId: getProjectIdFromApiPath(route.request().url()),
              fileName: uploadedName,
              providerId: 'vercel-self',
              url: 'https://share-preview.example',
              deploymentCount: 1,
              target: 'preview',
              status: 'ready',
              createdAt: 1,
              updatedAt: 2,
            }]
          : [],
      },
    });
  });

  await page.goto('/');
  await createProject(page, 'Share link copy flow');
  await expectWorkspaceReady(page);

  uploadedName = await uploadTinyHtml(page, 'share-link-copy.html', '<!doctype html><html><body><h1>Share link copy</h1></body></html>');
  await openUploadedHtmlArtifactPreview(page, uploadedName);

  await page.getByRole('button', { name: /^Share$/i }).click();
  await page.getByRole('menuitem', { name: /^Copy share link$/i }).click();
  await expect(page.getByRole('menuitem', { name: /^Copied!$/i })).toBeVisible();

  const copied = await page.evaluate(() => (window as typeof window & { __copiedTexts?: string[] }).__copiedTexts ?? []);
  expect(copied.at(-1)).toBe('https://share-preview.example');
});

test('[P0] project detail share menu opens the current share page for uploaded html artifacts', async ({ page }) => {
  let uploadedName = '';
  await page.addInitScript(() => {
    const opened: string[] = [];
    Object.defineProperty(window, '__openedUrls', {
      value: opened,
      configurable: true,
    });
    const originalOpen = window.open.bind(window);
    window.open = ((...args: Parameters<typeof window.open>) => {
      if (typeof args[0] === 'string') opened.push(args[0]);
      return originalOpen(...args);
    }) as typeof window.open;
  });
  await page.route('**/api/projects/*/deployments', async (route) => {
    await route.fulfill({
      json: {
        deployments: uploadedName
          ? [{
              id: 'protected-share-link',
              projectId: getProjectIdFromApiPath(route.request().url()),
              fileName: uploadedName,
              providerId: 'vercel-self',
              url: 'https://protected-share.example',
              deploymentCount: 1,
              target: 'preview',
              status: 'protected',
              createdAt: 1,
              updatedAt: 2,
            }]
          : [],
      },
    });
  });

  await page.goto('/');
  await createProject(page, 'Open share page flow');
  await expectWorkspaceReady(page);

  uploadedName = await uploadTinyHtml(page, 'share-page-open.html', '<!doctype html><html><body><h1>Open share page</h1></body></html>');
  await openUploadedHtmlArtifactPreview(page, uploadedName);

  await page.getByRole('button', { name: /^Share$/i }).click();
  await page.getByRole('menuitem', { name: /Open share page/i }).click();

  await expect
    .poll(() =>
      page.evaluate(() => (window as typeof window & { __openedUrls?: string[] }).__openedUrls ?? []),
    )
    .toContain('https://protected-share.example');
});

test('[P0] @critical project detail share menu publish action opens the deploy flow for the selected provider', async ({ page }) => {
  let deployConfigUrl: string | null = null;
  await page.route('**/api/projects/*/deployments', async (route) => {
    await route.fulfill({ json: { deployments: [] } });
  });
  await page.route('**/api/deploy/config?providerId=*', async (route) => {
    deployConfigUrl = route.request().url();
    const url = new URL(route.request().url());
    await route.fulfill({
      json: {
        configured: false,
        providerId: url.searchParams.get('providerId'),
        tokenMask: '',
        teamId: '',
        teamSlug: '',
      },
    });
  });

  await page.goto('/');
  await createProject(page, 'Deploy action flow');
  await expectWorkspaceReady(page);

  const uploadedName = await uploadTinyHtml(page, 'deploy-action.html', '<!doctype html><html><body><h1>Deploy action</h1></body></html>');
  await openUploadedHtmlArtifactPreview(page, uploadedName);

  await page.getByRole('button', { name: /^Share$/i }).click();
  await page.getByRole('menuitem', { name: /^Deploy to Vercel$/i }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: /Deploy to Vercel/i })).toBeVisible();
  await expect(dialog.locator('select').first()).toHaveValue('vercel-self');
  await expect
    .poll(() => deployConfigUrl ?? '', { timeout: T.medium })
    .toContain('providerId=vercel-self');
});

test('[P1] home design card deletion supports cancel and confirm flows', async ({ page }) => {
  const projectName = `Home delete design flow ${Date.now()}`;
  await page.goto('/');
  await createProject(page, projectName);
  await expectWorkspaceReady(page);

  const { projectId } = getProjectContextFromUrl(page);
  await page.getByRole('button', { name: /back to projects/i }).click();
  await expectDesignsView(page);

  const designCard = homeDesignCard(page, projectName);
  await expect(designCard).toBeVisible();

  // Cancel flow: open the overflow menu, choose Delete, then dismiss the confirm modal.
  await designCard.hover();
  await designCard.getByRole('button', { name: /more actions/i }).click();
  await page.getByRole('menuitem', { name: /^delete$/i }).click();
  const confirmDialog = page.locator('.modal-confirm');
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog).toContainText(projectName);
  await confirmDialog.getByRole('button', { name: /^cancel$/i }).click();
  await expect(confirmDialog).toHaveCount(0);
  await expect(designCard).toBeVisible();

  // Confirm flow: same trigger, this time accept the confirm modal.
  await designCard.hover();
  await designCard.getByRole('button', { name: /more actions/i }).click();
  await page.getByRole('menuitem', { name: /^delete$/i }).click();
  const confirmDialog2 = page.locator('.modal-confirm');
  await expect(confirmDialog2).toBeVisible();
  await expect(confirmDialog2).toContainText(projectName);
  await confirmDialog2.getByRole('button', { name: /^delete$/i }).click();
  await expect(homeDesignCard(page, projectName)).toHaveCount(0);

  const response = await page.request.get(`/api/projects/${projectId}`);
  expect(response.status()).toBe(404);
});

test('[P2] home designs view toggle switches between grid and kanban and persists', async ({ page }) => {
  const projectName = `Home view toggle flow ${Date.now()}`;
  await page.goto('/');
  await createProject(page, projectName);
  await expectWorkspaceReady(page);
  const { projectId } = getProjectContextFromUrl(page);

  await page.getByRole('button', { name: /back to projects/i }).click();
  await expectDesignsView(page);
  await expect(homeDesignCard(page, projectName)).toBeVisible();
  await expect(page.locator('.design-grid')).toBeVisible();
  await expect(page.locator('.design-kanban-board')).toHaveCount(0);
  await expect(page.getByTestId('designs-view-grid')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('designs-view-kanban').click();
  await expect(page.locator('.design-kanban-board')).toBeVisible();
  await expect(page.locator('.design-grid')).toHaveCount(0);
  await expect(page.getByTestId('designs-view-kanban')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.design-kanban-card', { hasText: projectName })).toBeVisible();

  await page.reload();
  await expectDesignsView(page);
  await expect(page.locator('.design-kanban-board')).toBeVisible();
  await expect(page.getByTestId('designs-view-kanban')).toHaveAttribute('aria-pressed', 'true');
  const projectsAfterReload = await listProjectsFromApi(page);
  expect(projectsAfterReload.some((project) => project.id === projectId && project.name === projectName)).toBe(true);

  await page.getByTestId('designs-view-grid').click();
  await expect(page.locator('.design-grid')).toBeVisible();
  await expect(homeDesignCard(page, projectName)).toBeVisible();
  await expect(page.getByTestId('designs-view-grid')).toHaveAttribute('aria-pressed', 'true');
});

test('[P1] home designs search filters projects and recovers from no results', async ({ page }) => {
  test.setTimeout(60_000);

  const stamp = Date.now();
  const alphaName = `Home search alpha ${stamp}`;
  const betaName = `Home search beta ${stamp}`;
  await page.goto('/');

  await createProject(page, alphaName);
  await expectWorkspaceReady(page);
  const alphaProjectId = getProjectContextFromUrl(page).projectId;
  await page.getByRole('button', { name: /back to projects/i }).click();
  await expectDesignsView(page);

  await createProject(page, betaName);
  await expectWorkspaceReady(page);
  const betaProjectId = getProjectContextFromUrl(page).projectId;
  await page.getByRole('button', { name: /back to projects/i }).click();
  await expectDesignsView(page);
  await expect(homeDesignCard(page, alphaName)).toBeVisible();
  await expect(homeDesignCard(page, betaName)).toBeVisible();

  const search = page.locator('.tab-panel-toolbar .toolbar-search input');
  await search.fill('alpha');
  await expect(homeDesignCard(page, alphaName)).toBeVisible();
  await expect(homeDesignCard(page, betaName)).toHaveCount(0);

  await search.fill(`missing-${stamp}`);
  await expect(homeDesignCard(page, alphaName)).toHaveCount(0);
  await expect(homeDesignCard(page, betaName)).toHaveCount(0);
  await expect(page.locator('.tab-empty')).toBeVisible();

  await search.fill('');
  await expect(homeDesignCard(page, alphaName)).toBeVisible();
  await expect(homeDesignCard(page, betaName)).toBeVisible();
  const projects = await listProjectsFromApi(page);
  expect(projects).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: alphaProjectId, name: alphaName }),
      expect.objectContaining({ id: betaProjectId, name: betaName }),
    ]),
  );
});

test('[P2] projects sub tabs switch between Recent and Your designs ordering', async ({ page }) => {
  const now = Date.now();
  const projects = [
    makeProjectsTabProject({
      id: 'proj-alpha',
      name: 'Sort Alpha',
      createdAt: now - 3 * 60_000,
      updatedAt: now - 1 * 60_000,
    }),
    makeProjectsTabProject({
      id: 'proj-beta',
      name: 'Sort Beta',
      createdAt: now - 1 * 60_000,
      updatedAt: now - 3 * 60_000,
    }),
    makeProjectsTabProject({
      id: 'proj-gamma',
      name: 'Sort Gamma',
      createdAt: now - 2 * 60_000,
      updatedAt: now - 2 * 60_000,
    }),
  ];

  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/live-artifacts?projectId=*', async (route) => {
    await route.fulfill({ json: { liveArtifacts: [] } });
  });

  await stubCatalogsEmpty(page);
  await page.goto('/projects');
  await expectDesignsView(page);

  await expect(page.locator('.design-grid .design-card .design-card-name').nth(0)).toContainText(
    'Sort Alpha',
  );
  await expect(page.locator('.design-grid .design-card .design-card-name').nth(1)).toContainText(
    'Sort Gamma',
  );
  await expect(page.locator('.design-grid .design-card .design-card-name').nth(2)).toContainText(
    'Sort Beta',
  );

  await page.getByRole('button', { name: 'Your designs' }).click();
  await expect(page.locator('.design-grid .design-card .design-card-name').nth(0)).toContainText(
    'Sort Beta',
  );
  await expect(page.locator('.design-grid .design-card .design-card-name').nth(1)).toContainText(
    'Sort Gamma',
  );
  await expect(page.locator('.design-grid .design-card .design-card-name').nth(2)).toContainText(
    'Sort Alpha',
  );
});

test('[P1] projects grid card rename updates the card title and persists after reload', async ({ page }) => {
  const originalName = `Projects rename flow ${Date.now()}`;
  const renamedName = `${originalName} renamed`;
  await page.goto('/');
  await createProject(page, originalName);
  await expectWorkspaceReady(page);
  const { projectId } = getProjectContextFromUrl(page);

  await page.getByRole('button', { name: /back to projects/i }).click();
  await expectDesignsView(page);

  const card = homeDesignCard(page, originalName);
  await card.hover();
  await card.getByRole('button', { name: /more actions/i }).click();
  await page.getByRole('menuitem', { name: /^rename$/i }).click();

  const renameModal = page.locator('.modal-rename');
  await expect(renameModal).toBeVisible();
  const renameInput = renameModal.getByRole('textbox');
  await expect(renameInput).toHaveValue(originalName);
  await renameInput.fill(renamedName);
  await renameModal.locator('button.primary').click();

  await expect(homeDesignCard(page, renamedName)).toBeVisible();
  await expect(homeDesignCard(page, originalName)).toHaveCount(0);

  await page.reload();
  await expectDesignsView(page);
  await expect(homeDesignCard(page, renamedName)).toBeVisible();
  const project = await fetchProjectById(page, projectId);
  expect(project.name).toBe(renamedName);
});

test('[P1] projects select mode supports multi-select delete with cancel and confirm', async ({ page }) => {
  const firstName = `Batch delete A ${Date.now()}`;
  const secondName = `Batch delete B ${Date.now()}`;
  await page.goto('/');

  await createProject(page, firstName);
  await expectWorkspaceReady(page);
  const firstProjectId = getProjectContextFromUrl(page).projectId;
  await page.getByRole('button', { name: /back to projects/i }).click();
  await expectDesignsView(page);

  await createProject(page, secondName);
  await expectWorkspaceReady(page);
  const secondProjectId = getProjectContextFromUrl(page).projectId;
  await page.getByRole('button', { name: /back to projects/i }).click();
  await expectDesignsView(page);

  await page.locator('.designs-select-toggle').click();
  await homeDesignCard(page, firstName).click();
  await homeDesignCard(page, secondName).click();
  await expect(page.locator('.designs-select-bar')).toBeVisible();
  await expect(page.locator('.design-card.is-selected')).toHaveCount(2);

  await page.getByRole('button', { name: /Delete selected/i }).click();
  const confirmDialog = page.locator('.modal-confirm');
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: /^cancel$/i }).click();
  await expect(confirmDialog).toHaveCount(0);
  await expect(homeDesignCard(page, firstName)).toBeVisible();
  await expect(homeDesignCard(page, secondName)).toBeVisible();

  await page.getByRole('button', { name: /Delete selected/i }).click();
  const confirmDialog2 = page.locator('.modal-confirm');
  await expect(confirmDialog2).toBeVisible();
  await confirmDialog2.getByRole('button', { name: /^delete/i }).click();
  await expect(homeDesignCard(page, firstName)).toHaveCount(0);
  await expect(homeDesignCard(page, secondName)).toHaveCount(0);
  await expect(page.locator('.designs-select-bar')).toHaveCount(0);

  const firstResponse = await page.request.get(`/api/projects/${firstProjectId}`);
  const secondResponse = await page.request.get(`/api/projects/${secondProjectId}`);
  expect(firstResponse.status()).toBe(404);
  expect(secondResponse.status()).toBe(404);
});

test('[P1] projects kanban cards open projects and support delete cancel and confirm', async ({ page }) => {
  const projectName = `Kanban flow ${Date.now()}`;
  await page.goto('/');
  await createProject(page, projectName);
  await expectWorkspaceReady(page);

  const { projectId } = getProjectContextFromUrl(page);
  await page.getByRole('button', { name: /back to projects/i }).click();
  await expectDesignsView(page);

  await page.getByTestId('designs-view-kanban').click();
  await expect(page.locator('.design-kanban-board')).toBeVisible();

  const kanbanCard = page.locator('.design-kanban-card', { hasText: projectName });
  await expect(kanbanCard).toBeVisible();

  await kanbanCard.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}(/conversations/[^/]+)?$`));
  await expect(page.getByTestId('project-title')).toContainText(projectName);
  const openedProject = await fetchCurrentProject(page);
  expect(openedProject.name).toBe(projectName);

  await page.getByRole('button', { name: /back to projects/i }).click();
  await expectDesignsView(page);
  await expect(page.locator('.design-kanban-board')).toBeVisible();

  const kanbanCardAgain = page.locator('.design-kanban-card', { hasText: projectName });
  await kanbanCardAgain.locator('.design-card-close').click();
  const confirmDialog = page.locator('.modal-confirm');
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: /^cancel$/i }).click();
  await expect(kanbanCardAgain).toBeVisible();

  await kanbanCardAgain.locator('.design-card-close').click();
  const confirmDialog2 = page.locator('.modal-confirm');
  await expect(confirmDialog2).toBeVisible();
  await confirmDialog2.getByRole('button', { name: /^delete/i }).click();
  await expect(page.locator('.design-kanban-card', { hasText: projectName })).toHaveCount(0);

  const response = await page.request.get(`/api/projects/${projectId}`);
  expect(response.status()).toBe(404);
});

test('[P2] projects page shows the empty state when there are no projects', async ({ page }) => {
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.continue();
  });

  await stubCatalogsEmpty(page);
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.locator('.tab-empty')).toBeVisible();
  await expect(page.locator('.tab-empty')).toContainText('No projects yet');
  await expect(page.locator('.design-grid')).toHaveCount(0);
  await expect(page.locator('.design-kanban-board')).toHaveCount(0);
});

test('[P2] projects page shows the no-results state and recovers when search is cleared', async ({ page }) => {
  const projects = [
    makeProjectsTabProject({
      id: 'proj-search-1',
      name: 'Searchable Prototype',
      createdAt: Date.now() - 10_000,
      updatedAt: Date.now() - 5_000,
    }),
  ];

  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/live-artifacts?projectId=*', async (route) => {
    await route.fulfill({ json: { liveArtifacts: [] } });
  });

  await stubCatalogsEmpty(page);
  await page.goto('/projects');
  await expectDesignsView(page);
  await expect(homeDesignCard(page, 'Searchable Prototype')).toBeVisible();

  const search = page.locator('.tab-panel-toolbar .toolbar-search input');
  await search.fill('does-not-exist');
  await expect(page.locator('.tab-empty')).toBeVisible();
  await expect(page.locator('.tab-empty')).toContainText('No projects match your search');
  await expect(homeDesignCard(page, 'Searchable Prototype')).toHaveCount(0);

  await search.fill('');
  await expect(homeDesignCard(page, 'Searchable Prototype')).toBeVisible();
});

test('[P2] projects grid overflow menu closes on outside click and Escape', async ({ page }) => {
  const projects = [
    makeProjectsTabProject({
      id: 'proj-menu-1',
      name: 'Menu Close Project',
      createdAt: Date.now() - 10_000,
      updatedAt: Date.now() - 5_000,
    }),
  ];

  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/live-artifacts?projectId=*', async (route) => {
    await route.fulfill({ json: { liveArtifacts: [] } });
  });

  await stubCatalogsEmpty(page);
  await page.goto('/projects');
  await expectDesignsView(page);

  const card = homeDesignCard(page, 'Menu Close Project');
  await card.hover();
  await card.getByRole('button', { name: /more actions/i }).click();
  const menu = page.locator('.design-card-menu');
  await expect(menu).toBeVisible();

  await page.mouse.click(20, 20);
  await expect(menu).toHaveCount(0);

  await card.hover();
  await card.getByRole('button', { name: /more actions/i }).click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('[P2] projects kanban view groups cards into status columns', async ({ page }) => {
  const now = Date.now();
  const projects = [
    makeProjectsTabProject({
      id: 'proj-not-started',
      name: 'Not Started Card',
      createdAt: now - 50_000,
      updatedAt: now - 45_000,
      status: { value: 'not_started' },
    }),
    makeProjectsTabProject({
      id: 'proj-running',
      name: 'Running Card',
      createdAt: now - 40_000,
      updatedAt: now - 35_000,
      status: { value: 'running' },
    }),
    makeProjectsTabProject({
      id: 'proj-awaiting',
      name: 'Awaiting Input Card',
      createdAt: now - 30_000,
      updatedAt: now - 25_000,
      status: { value: 'awaiting_input' },
    }),
    makeProjectsTabProject({
      id: 'proj-succeeded',
      name: 'Succeeded Card',
      createdAt: now - 20_000,
      updatedAt: now - 15_000,
      status: { value: 'succeeded' },
    }),
    makeProjectsTabProject({
      id: 'proj-failed',
      name: 'Failed Card',
      createdAt: now - 10_000,
      updatedAt: now - 5_000,
      status: { value: 'failed' },
    }),
  ];

  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/live-artifacts?projectId=*', async (route) => {
    await route.fulfill({ json: { liveArtifacts: [] } });
  });

  await stubCatalogsEmpty(page);
  await page.goto('/projects');
  await expectDesignsView(page);
  await page.getByTestId('designs-view-kanban').click();
  await expect(page.locator('.design-kanban-board')).toBeVisible();

  await expect(page.locator('.design-kanban-card.status-not_started')).toHaveCount(1);
  await expect(page.locator('.design-kanban-card.status-running')).toHaveCount(1);
  await expect(page.locator('.design-kanban-card.status-awaiting_input')).toHaveCount(1);
  await expect(page.locator('.design-kanban-card.status-succeeded')).toHaveCount(1);
  await expect(page.locator('.design-kanban-card.status-failed')).toHaveCount(1);
  await expect(page.locator('.design-kanban-empty')).toHaveCount(1);

  await expect(page.locator('.design-kanban-card.status-running')).toContainText('Running Card');
  await expect(page.locator('.design-kanban-card.status-awaiting_input')).toContainText(
    'Awaiting Input Card',
  );
  await expect(page.locator('.design-kanban-card.status-succeeded')).toContainText(
    'Succeeded Card',
  );
});

test('[P1] projects page shows live artifact cards, supports search, and opens the live artifact project', async ({ page }) => {
  const liveProject = makeProjectsTabProject({
    id: 'proj-live',
    name: 'Orbit Daily Digest',
    createdAt: Date.now() - 60_000,
    updatedAt: Date.now() - 30_000,
    skillId: 'live-artifact',
    metadata: { kind: 'orbit', intent: 'live-artifact' },
    status: { value: 'succeeded' },
  });
  const regularProject = makeProjectsTabProject({
    id: 'proj-regular',
    name: 'Regular Prototype',
    createdAt: Date.now() - 120_000,
    updatedAt: Date.now() - 90_000,
  });
  const liveArtifact = {
    id: 'artifact-1',
    projectId: 'proj-live',
    title: 'Orbit Daily Digest — 2026-05-15',
    slug: 'orbit-daily-digest',
    status: 'ready',
    refreshStatus: 'succeeded',
    pinned: false,
    hasDocument: true,
    updatedAt: new Date(Date.now() - 20_000).toISOString(),
    createdAt: new Date(Date.now() - 50_000).toISOString(),
    preview: {
      kind: 'rendered',
      url: '',
    },
  };

  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [liveProject, regularProject] } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/projects/proj-live', async (route) => {
    await route.fulfill({ json: { project: liveProject } });
  });
  await page.route('**/api/projects/proj-live/files', async (route) => {
    await route.fulfill({ json: { files: [] } });
  });
  await page.route('**/api/live-artifacts?projectId=*', async (route) => {
    const url = new URL(route.request().url());
    const projectId = url.searchParams.get('projectId');
    await route.fulfill({
      json: {
        liveArtifacts: projectId === 'proj-live' ? [liveArtifact] : [],
      },
    });
  });
  await page.route('**/api/live-artifacts/artifact-1', async (route) => {
    await route.fulfill({ json: { liveArtifact } });
  });
  await page.route('**/api/live-artifacts/artifact-1/refreshes?projectId=*', async (route) => {
    await route.fulfill({ json: { refreshes: [] } });
  });
  await page.route('**/api/live-artifacts/artifact-1/preview?projectId=*', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<!doctype html><html><body><h1>Orbit Daily Digest</h1></body></html>',
    });
  });

  await stubCatalogsEmpty(page);
  await page.goto('/projects');
  await expectDesignsView(page);

  const liveCard = page.locator('.live-artifact-card', {
    has: page.locator('.design-card-name', { hasText: 'Orbit Daily Digest' }),
  });
  await expect(liveCard).toBeVisible();
  await expect(liveCard).toContainText(/Live Artifact/i);
  await expect(liveCard).toContainText(/LIVE|Refreshed/i);

  const search = page.locator('.tab-panel-toolbar .toolbar-search input');
  await search.fill('digest');
  await expect(liveCard).toBeVisible();
  await expect(homeDesignCard(page, 'Regular Prototype')).toHaveCount(0);

  await liveCard.click();
  await expect(page).toHaveURL(/\/projects\/proj-live\/files\/live%3Aartifact-1$/);
  await expect(page.getByTestId('project-title')).toContainText('Orbit Daily Digest');
});

test('[P2] change pet opens pet settings and updates the custom companion draft', async ({ page }) => {
  await seedAdoptedPet(page);
  await page.route('**/api/codex-pets', async (route) => {
    await route.fulfill({ json: { pets: [], rootDir: '' } });
  });

  await page.goto('/');
  const dialog = await openEntrySettingsDialog(page, /^Pets\b/);
  await expect(dialog.getByRole('heading', { level: 2, name: 'Pets' })).toBeVisible();

  await dialog.getByRole('tab', { name: 'Custom' }).click();
  const customPanel = dialog.locator('.pet-custom');
  await expect(customPanel).toBeVisible();

  await customPanel.getByLabel('Name').fill('QA Turtle');
  await customPanel.getByLabel('Glyph').fill('🐢');
  await customPanel.getByLabel('Greeting').fill('Shell yeah, tests are green.');
  await expect(customPanel.getByText('QA Turtle')).toBeVisible();
  await expect(customPanel.getByText('Shell yeah, tests are green.')).toBeVisible();

  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

async function createProject(
  page: Page,
  projectName: string,
) {
  const response = await retryProjectCreate(page, projectName);
  const body = (await response.json()) as {
    project: { id: string };
    conversationId: string;
  };
  await page.goto(`/projects/${body.project.id}/conversations/${body.conversationId}`);
}

async function routeSuccessfulRuns(
  page: Page,
  runRequestBodies: Array<Record<string, unknown>>,
  runIdPrefix: string,
) {
  await page.route('**/api/runs', async (route) => {
    const raw = route.request().postData();
    if (raw) runRequestBodies.push(JSON.parse(raw) as Record<string, unknown>);
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: `${runIdPrefix}-${runRequestBodies.length}` }),
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: ['event: end', 'data: {"code":0,"status":"succeeded"}', '', ''].join('\n'),
    });
  });
}

async function retryProjectCreate(
  page: Page,
  projectName: string,
) {
  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await page.request.post('/api/projects', {
        timeout: 15_000,
        data: {
          id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: projectName,
          skillId: null,
          designSystemId: null,
          metadata: {
            kind: 'prototype',
            nameSource: 'user',
          },
        },
      });
      if (response.ok()) return response;
      lastError = await response.text();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    if (attempt < 3) {
      await page.waitForTimeout(500 * attempt);
    }
  }

  throw new Error(`create project "${projectName}" failed after retries: ${lastError}`);
}

async function seedProjectWithAssistantCompletion(
  page: Page,
): Promise<{
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  assistantText: string;
}> {
  const projectId = `assistant-actions-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const projectResponse = await page.request.post('/api/projects', {
    data: {
      id: projectId,
      name: 'Assistant Completion Actions',
      skillId: null,
      designSystemId: null,
      metadata: {
        kind: 'prototype',
        nameSource: 'user',
      },
    },
  });
  expect(projectResponse.ok(), `create project: ${await projectResponse.text()}`).toBeTruthy();
  const { conversationId } = (await projectResponse.json()) as { conversationId: string };

  const fileResponse = await page.request.post(`/api/projects/${projectId}/files`, {
    data: {
      name: 'index.html',
      content: '<!doctype html><html><body><main><h1>Assistant actions preview</h1></main></body></html>',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'index.html',
        entry: 'index.html',
        renderer: 'html',
        exports: ['html'],
      },
    },
  });
  expect(fileResponse.ok(), `seed index.html: ${await fileResponse.text()}`).toBeTruthy();

  const createdAt = Date.now() - 2_000;
  const userMessageId = `u-${projectId}`;
  const userResponse = await page.request.put(
    `/api/projects/${projectId}/conversations/${conversationId}/messages/${userMessageId}`,
    {
      data: {
        id: userMessageId,
        role: 'user',
        content: 'Create a tiny prototype.',
        createdAt,
      },
    },
  );
  expect(userResponse.ok(), `seed user message: ${await userResponse.text()}`).toBeTruthy();

  const assistantMessageId = `a-${projectId}`;
  const assistantText = 'Assistant completion actions fixture.\n\nGenerated `index.html` for this turn.';
  const assistantResponse = await page.request.put(
    `/api/projects/${projectId}/conversations/${conversationId}/messages/${assistantMessageId}`,
    {
      data: {
        id: assistantMessageId,
        role: 'assistant',
        content: assistantText,
        runStatus: 'succeeded',
        startedAt: createdAt + 500,
        endedAt: createdAt + 1_500,
        events: [
          { kind: 'text', text: assistantText },
        ],
        createdAt: createdAt + 1_000,
      },
    },
  );
  expect(assistantResponse.ok(), `seed assistant message: ${await assistantResponse.text()}`).toBeTruthy();

  return { projectId, conversationId, assistantMessageId, assistantText };
}

type ConversationHistoryFixture = {
  id: string;
  projectId: string;
  title: string | null;
  sessionMode: 'design' | 'ask' | 'plan';
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  totalDurationMs?: number;
  latestRun?: {
    status: 'succeeded' | 'failed' | 'canceled';
    durationMs?: number;
  };
};

async function seedProjectConversationHistory(
  page: Page,
): Promise<{
  projectId: string;
  conversations: ConversationHistoryFixture[];
}> {
  const projectId = `conversation-history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const projectResponse = await page.request.post('/api/projects', {
    data: {
      id: projectId,
      name: 'Conversation History Coverage',
      skillId: null,
      designSystemId: null,
      metadata: {
        kind: 'prototype',
        nameSource: 'user',
      },
    },
  });
  expect(projectResponse.ok(), `create project: ${await projectResponse.text()}`).toBeTruthy();
  const { conversationId } = (await projectResponse.json()) as { conversationId: string };

  const now = Date.now();
  return {
    projectId,
    conversations: [
      {
        id: conversationId,
        projectId,
        title: 'Runway final polish',
        sessionMode: 'design',
        messageCount: 8,
        createdAt: now - 90 * 60_000,
        updatedAt: now - 30_000,
        totalDurationMs: 342_000,
        latestRun: {
          status: 'succeeded',
          durationMs: 330_000,
        },
      },
      {
        id: 'conv-font-audit',
        projectId,
        title: 'Font audit and brand pass',
        sessionMode: 'design',
        messageCount: 6,
        createdAt: now - 80 * 60_000,
        updatedAt: now - 2 * 60_000,
        latestRun: {
          status: 'succeeded',
          durationMs: 1_140_000,
        },
      },
      {
        id: 'conv-slide-review',
        projectId,
        title: 'Slide review baseline',
        sessionMode: 'ask',
        messageCount: 6,
        createdAt: now - 70 * 60_000,
        updatedAt: now - 7 * 60_000,
      },
    ],
  };
}

async function routeConversationHistoryFixtures(
  page: Page,
  projectId: string,
  initialConversations: ConversationHistoryFixture[],
) {
  const conversations = [...initialConversations];
  await page.route(`**/api/projects/${projectId}/conversations`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { conversations } });
      return;
    }
    if (route.request().method() === 'POST') {
      const now = Date.now();
      const fresh: ConversationHistoryFixture = {
        id: 'conv-new-history',
        projectId,
        title: null,
        sessionMode: 'design',
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      conversations.unshift(fresh);
      await route.fulfill({ json: { conversation: fresh } });
      return;
    }
    await route.continue();
  });
  await page.route(`**/api/projects/${projectId}/conversations/*/messages`, async (route) => {
    if (route.request().method() === 'GET') {
      const conversationId = conversationIdFromMessagesApiPath(route.request().url());
      const conversation = conversations.find((item) => item.id === conversationId);
      const count = conversation?.messageCount ?? 0;
      await route.fulfill({
        json: {
          messages: Array.from({ length: count }, (_, index) => ({
            id: `${conversationId}-m-${index}`,
            role: index % 2 === 0 ? 'user' : 'assistant',
            content: `Conversation ${conversationId} message ${index + 1}`,
            createdAt: (conversation?.createdAt ?? Date.now()) + index,
          })),
        },
      });
      return;
    }
    await route.continue();
  });
}

function conversationIdFromMessagesApiPath(url: string): string {
  const pathname = new URL(url).pathname;
  const match = pathname.match(/\/conversations\/([^/]+)\/messages$/);
  return match ? decodeURIComponent(match[1]!) : '';
}

async function openNewProjectPanel(page: Page) {
  await openNewProjectModal(page);
}

async function expectDesignsView(page: Page) {
  if (!/\/projects$/.test(new URL(page.url()).pathname)) {
    await ensureRailOpen(page);
    await page.getByTestId('entry-nav-projects').click();
  }
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.locator('.design-grid, .design-kanban-board')).toBeVisible();
}

async function openEntrySettingsDialog(page: Page, sectionName?: RegExp | string): Promise<Locator> {
  const settingsButton = page
    .getByTestId('entry-settings-menu-trigger')
    .or(page.getByRole('button', { name: /open settings/i }))
    .first();
  await settingsButton.click();
  let settingsDialog = page.getByRole('dialog');
  if (!(await settingsDialog.isVisible().catch(() => false))) {
    const settingsMenu = page
      .getByTestId('entry-settings-menu')
      .or(page.locator('.avatar-popover[role="menu"]'))
      .first();
    await expect(settingsMenu).toBeVisible();
    await settingsMenu
      .getByTestId('entry-settings-open-details')
      .or(settingsMenu.getByRole('button', { name: /^Settings$/i }))
      .click();
    settingsDialog = page.getByRole('dialog');
  }
  await expect(settingsDialog).toBeVisible();
  if (sectionName) {
    await settingsDialog.getByRole('button', { name: sectionName }).click();
  }
  return settingsDialog;
}

async function openComposerAgentMenu(page: Page): Promise<{
  menu: Locator;
  claudeButton: Locator;
}> {
  const composer = page.getByTestId('chat-composer');
  await expect(composer).toBeVisible();
  const trigger = composer.locator('.avatar-menu .avatar-agent-trigger');
  await expect(trigger).toBeVisible();
  await trigger.click();
  const menu = page.locator('.avatar-popover[role="dialog"]');
  await expect(menu).toBeVisible();

  const claudeButton = menu
    .locator('[data-testid="avatar-agent-option-claude"], .avatar-item', {
      hasText: /Claude Code/i,
    })
    .first();
  if (!(await claudeButton.isVisible().catch(() => false))) {
    const localCliOption = menu.getByRole('button', {
      name: /Local CLI|本机 CLI|本地 CLI|Use local/i,
    });
    if (await localCliOption.isVisible().catch(() => false)) {
      await localCliOption.click();
    }
  }
  await expect(claudeButton).toBeVisible({ timeout: 20_000 });
  return { menu, claudeButton };
}

async function selectComposerSessionMode(page: Page, modeTitle: 'Ask mode' | 'Plan mode' | 'Design mode') {
  const trigger = page.getByTestId('chat-composer').getByTestId('session-mode-trigger');
  await expect(trigger).toBeVisible();
  await trigger.click();

  const menu = page.locator('.session-mode-toggle__menu[role="menu"]');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitemradio', { name: 'Ask mode' })).toBeVisible();
  await expect(menu.getByRole('menuitemradio', { name: 'Plan mode' })).toBeVisible();
  await expect(menu.getByRole('menuitemradio', { name: 'Design mode' })).toBeVisible();
  await menu.getByRole('menuitemradio', { name: modeTitle }).click();
  await expect(trigger).toHaveAttribute('aria-label', modeTitle);
}

async function routeComposerPlusFixtures(page: Page) {
  await page.route('**/api/connectors', async (route) => {
    await route.fulfill({
      json: {
        connectors: [
          {
            id: 'figma',
            name: 'Figma Connector',
            provider: 'Composio',
            category: 'Design',
            status: 'connected',
            tools: [],
          },
        ],
      },
    });
  });
  await page.route('**/api/connectors/status', async (route) => {
    await route.fulfill({
      json: {
        statuses: {
          figma: { status: 'connected', accountLabel: 'Design Team' },
        },
      },
    });
  });
  await page.route('**/api/connectors/discovery**', async (route) => {
    await route.fulfill({ json: { connectors: [] } });
  });
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({ json: { plugins: [COMPOSER_PLUS_PLUGIN] } });
  });
  await page.route('**/api/mcp/servers', async (route) => {
    await route.fulfill({
      json: {
        servers: [
          {
            id: 'design-docs',
            label: 'Design Docs MCP',
            transport: 'stdio',
            enabled: true,
            command: 'npx',
          },
        ],
        templates: [],
      },
    });
  });
}

async function expectWorkspaceReady(page: Page) {
  await expect(page).toHaveURL(/\/projects\//);
  await dismissPrivacyDialog(page);
  await expect(page.getByTestId('project-title')).toBeVisible();
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.locator('.chat-loading-state')).toHaveCount(0, { timeout: T.medium });
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}

async function routeHandoffEditors(page: Page): Promise<void> {
  await page.route('**/api/editors', async (route) => {
    await route.fulfill({
      json: {
        platform: 'darwin',
        editors: [
          {
            id: 'cursor',
            label: 'Cursor',
            icon: 'cursor',
            available: true,
            resolvedPath: '/Applications/Cursor.app',
            platforms: ['darwin', 'win32', 'linux'],
          },
          {
            id: 'finder',
            label: 'Finder',
            icon: 'finder',
            available: true,
            resolvedPath: '/System/Library/CoreServices/Finder.app',
            platforms: ['darwin'],
          },
        ],
      },
    });
  });
}

async function openHandoffCliTab(page: Page): Promise<Locator> {
  await page.getByTestId('handoff-caret').click();
  const menu = page.getByTestId('handoff-menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('tab', { name: /^Copy for CLI$/ }).click();
  await expect(menu.locator('.handoff-amr-link')).toBeVisible();
  return menu;
}

async function dismissPrivacyDialog(page: Page) {
  const privacyRegion = page.getByRole('region', { name: /Help us improve Open Design/i });
  if (await privacyRegion.isVisible().catch(() => false)) {
    await privacyRegion.getByRole('button', { name: /I get it|not now|got it/i }).click();
    await expect(privacyRegion).toBeHidden();
  }
}

async function renameProjectTitle(
  page: Page,
  title: Locator,
  nextName: string,
) {
  await title.click();
  await page.keyboard.press('Meta+A');
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  if (selected.length === 0) {
    await page.keyboard.press('Control+A');
  }
  await page.keyboard.type(nextName);
  await page.keyboard.press('Enter');
}

async function uploadTinyHtml(
  page: Page,
  name: string,
  content: string,
): Promise<string> {
  await page.getByTestId('design-files-upload-input').setInputFiles({
    name,
    mimeType: 'text/html',
    buffer: Buffer.from(content),
  });
  const { projectId } = getProjectContextFromUrl(page);
  let uploadedName = '';
  await expect
    .poll(async () => {
      const files = await listProjectFiles(page, projectId);
      uploadedName = files.find((file) => file.name.endsWith(name))?.name ?? '';
      return uploadedName;
    })
    .not.toBe('');
  await expect(tabBySuffix(page, uploadedName)).toBeVisible();
  return uploadedName;
}

async function uploadTinyPng(
  page: Page,
  name: string,
): Promise<string> {
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
    'base64',
  );
  await page.getByTestId('design-files-upload-input').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: pngBytes,
  });
  await expect(tabBySuffix(page, name)).toBeVisible();
  const { projectId } = getProjectContextFromUrl(page);
  const files = await listProjectFiles(page, projectId);
  const uploaded = files.find((file) => file.name.endsWith(name));
  expect(uploaded?.name).toBeTruthy();
  return uploaded!.name;
}

async function openUploadedHtmlArtifactPreview(page: Page, uploadedName: string) {
  await openAllProjectFiles(page);
  const fileRow = rowByFileName(page, uploadedName);
  await expect(fileRow).toBeVisible();
  await fileRow.getByRole('button').first().click();
  const previewCard = page.getByTestId('design-file-preview');
  await expect(previewCard).toBeVisible();
  await previewCard.getByRole('button', { name: 'Open' }).click();
}

function tabBySuffix(page: Page, name: string): Locator {
  return page.getByRole('tab', { name: new RegExp(`${escapeRegExp(name)}(?:\\s+Close tab)?$`, 'i') });
}

function rowByFileName(page: Page, name: string): Locator {
  return page.getByTestId(`design-file-row-${name}`);
}

function menuByFileName(page: Page, name: string): Locator {
  return page.getByTestId(`design-file-menu-${name}`);
}

function homeDesignCard(page: Page, name: string): Locator {
  return page.locator('.design-card', {
    has: page.locator('.design-card-name', {
      hasText: new RegExp(`^${escapeRegExp(name)}$`),
    }),
  });
}

async function seedAdoptedPet(page: Page) {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'default',
        agentId: 'codex',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: { codex: { model: 'default' } },
        pet: {
          adopted: true,
          enabled: true,
          petId: 'custom',
          custom: {
            name: 'Original Buddy',
            glyph: '🦄',
            accent: '#c96442',
            greeting: 'Ready to pair.',
          },
        },
      }),
    );
  }, STORAGE_KEY);
}

async function fetchCurrentProject(page: Page) {
  const { projectId } = getProjectContextFromUrl(page);
  return fetchProjectById(page, projectId);
}

async function fetchProjectById(page: Page, projectId: string) {
  const response = await page.request.get(`/api/projects/${projectId}`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    project: {
      id?: string;
      name: string;
      designSystemId: string | null;
      metadata?: {
        inspirationDesignSystemIds?: string[];
      };
    };
  };
  return body.project;
}

async function listProjectsFromApi(page: Page) {
  const response = await page.request.get('/api/projects');
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    projects: Array<{ id: string; name: string }>;
  };
  return body.projects;
}

async function listProjectFiles(page: Page, projectId: string) {
  const response = await page.request.get(`/api/projects/${projectId}/files`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { files: Array<{ name: string }> };
  return body.files;
}

function isCreateProjectRequest(request: Request): boolean {
  const url = new URL(request.url());
  return url.pathname === '/api/projects' && request.method() === 'POST';
}

function getProjectContextFromUrl(page: Page) {
  const url = new URL(page.url());
  const [, projectId, conversationId] = url.pathname.match(
    /\/projects\/([^/]+)(?:\/conversations\/([^/]+))?/,
  ) ?? [];
  if (!projectId) throw new Error(`unexpected project route: ${url.pathname}`);
  return { projectId, conversationId };
}

function getProjectIdFromApiPath(rawUrl: string) {
  const url = new URL(rawUrl);
  const [, projectId] = url.pathname.match(/\/api\/projects\/([^/]+)/) ?? [];
  if (!projectId) throw new Error(`unexpected project api path: ${url.pathname}`);
  return projectId;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeProjectsTabProject({
  id,
  name,
  createdAt,
  updatedAt,
  skillId = null,
  metadata = { kind: 'prototype' as const },
  status = { value: 'succeeded' as const },
}: {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  skillId?: string | null;
  metadata?: Record<string, unknown>;
  status?: { value: string };
}) {
  return {
    id,
    name,
    createdAt,
    updatedAt,
    skillId,
    designSystemId: null,
    pendingPrompt: '',
    customInstructions: null,
    metadata,
    status,
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
    description: `${name} for tab switching coverage.`,
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
