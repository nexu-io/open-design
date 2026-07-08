import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';
import { applyStandardMocks } from '@/playwright/mock-factory';

test.describe.configure({ timeout: 30_000 });

const STORAGE_KEY = 'open-design:config';

const HOME_CONFIG = {
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
  telemetry: { metrics: false, content: false, artifactManifest: false },
};

const HOME_DESIGN_SYSTEMS = [
  {
    id: 'agentic',
    title: 'Agentic',
    category: 'Productivity & SaaS',
    summary: 'Conversational AI-first interface with minimal controls.',
    surface: 'web',
    swatches: ['#ff5a1f', '#111827'],
  },
];

const HOME_PLUGINS = [
  {
    id: 'od-media-generation',
    title: 'Media generation',
    version: '0.1.0',
    trust: 'bundled',
    sourceKind: 'bundled',
    source: '/tmp/media-generation',
    fsPath: '/tmp/media-generation',
    capabilitiesGranted: ['prompt:inject'],
    installedAt: 0,
    updatedAt: 0,
    manifest: {
      name: 'od-media-generation',
      title: 'Media generation',
      version: '0.1.0',
      description: 'Create image, video, and audio assets.',
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        useCase: { query: 'Create media.' },
        inputs: [],
      },
    },
  },
];

const PROMPT_TEMPLATES = [
  {
    id: 'video-reveal',
    surface: 'video',
    title: 'Video reveal',
    summary: 'A short reveal video prompt.',
    category: 'product',
    model: 'doubao-seedance-2-0-260128',
    aspect: '16:9',
    source: { repo: 'open-design/video-prompts', license: 'MIT' },
  },
];

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
  await seedBrowserConfig(page, HOME_CONFIG);

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { config: HOME_CONFIG } });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/github/open-design', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stargazers_count: 51600 }),
    });
  });

  let projectCreateCount = 0;
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    if (route.request().method() === 'POST') {
      projectCreateCount += 1;
      const body = route.request().postDataJSON() as {
        id?: string;
        name?: string;
        metadata?: Record<string, unknown>;
      };
      const id = body.id ?? `production-workflow-${projectCreateCount}`;
      await route.fulfill({
        json: {
          project: {
            id,
            name: body.name ?? 'Untitled project',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: body.metadata ?? {},
          },
          conversationId: `conv-${id}`,
        },
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/design-systems', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { designSystems: HOME_DESIGN_SYSTEMS } });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/brands', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { brands: [] } });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/prompt-templates', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ promptTemplates: PROMPT_TEMPLATES }),
    });
  });

  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ plugins: HOME_PLUGINS }),
    });
  });

  await page.route('**/api/mcp/servers', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ servers: [], templates: [] }),
    });
  });

  await page.route('**/api/runs', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"production-workflow-smoke"}',
    });
  });

  await page.route('**/api/runs/*/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: ['event: end', 'data: {"code":0,"status":"succeeded"}', '', ''].join('\n'),
    });
  });
});

test('production chip keeps the beginner video path connected end to end', async ({ page }) => {
  await gotoEntryHome(page);

  await expect(page.getByTestId('home-hero-rail-production')).toBeVisible();
  await page.getByTestId('home-hero-rail-production').click();

  await expect(page.getByTestId('home-hero-footer-option-taskCardId')).toContainText(/Science explainer/i);
  await expect(page.getByTestId('home-hero-footer-option-voiceTone')).toContainText(/Professional/i);

  await page.getByTestId('home-hero-input').fill('Explain one product feature as a narrated short video.');

  const createRequestPromise = page.waitForRequest((request) =>
    request.method() === 'POST' && new URL(request.url()).pathname === '/api/projects',
  );
  await page.getByTestId('home-hero-submit').click();
  const createRequest = await createRequestPromise;
  const body = createRequest.postDataJSON() as {
    pluginId?: string | null;
    pendingPrompt?: string;
    metadata?: {
      kind?: string;
      workflowMode?: string;
      taskCardId?: string;
      voiceTone?: string;
    };
  };

  expect(body.pluginId).toBe('od-media-generation');
  expect(body.pendingPrompt?.trim()).toBeTruthy();
  expect(body.metadata?.kind).toBe('video');
  expect(body.metadata?.workflowMode).toBe('production');
  expect(body.metadata?.taskCardId).toBe('science-explainer');
  expect(body.metadata?.voiceTone).toBe('professional');

  await expect(page).toHaveURL(/\/projects\//);
  const productionWorkspace = page.getByTestId('production-workspace');
  await expect(productionWorkspace).toBeVisible();
  await expect(productionWorkspace.getByRole('heading', { name: 'Script' })).toBeVisible();
  await expect(productionWorkspace.getByRole('heading', { name: 'Voice' })).toBeVisible();
  await expect(productionWorkspace.getByRole('heading', { name: 'Storyboard' })).toBeVisible();
  await expect(productionWorkspace.getByRole('heading', { name: 'Assets' })).toBeVisible();
  await expect(productionWorkspace.getByRole('heading', { name: 'Output' })).toBeVisible();
  await expect(productionWorkspace.getByRole('button', { name: 'Export draft video' })).toBeVisible();
  await expect(productionWorkspace.getByRole('list', { name: 'Production workflow' })).toBeVisible();
});

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
}

async function seedBrowserConfig(page: Page, config: Record<string, unknown>) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: config },
  );
}

async function waitForLoadingToClear(page: Page) {
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, { timeout: 15_000 });
}
