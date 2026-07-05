import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';
import { routeAgents } from '@/playwright/mock-factory';

test.describe.configure({ timeout: 30_000 });

const STORAGE_KEY = 'open-design:config';
const LOCALE_KEY = 'open-design:locale';
const LOCALE_SOURCE_KEY = 'open-design:locale-source';
const OPEN_SETTINGS_LABEL = /Open settings|打开设置|開啟設定/i;

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
  {
    id: 'airbnb',
    title: 'Airbnb',
    category: 'E-Commerce & Retail',
    summary: 'Travel marketplace with warm coral accents.',
    surface: 'web',
    swatches: ['#a3165b', '#ff385c'],
  },
];

const BRAND_DESIGN_SYSTEM = {
  id: 'user:brand-acme',
  title: 'Acme Brand Kit',
  category: 'Brand',
  summary: 'Acme brand kit.',
  source: 'user',
  isEditable: true,
  surface: 'web',
  status: 'published',
  swatches: ['#0b5fff', '#0a0a0a'],
};

const ACME_BRAND = {
  meta: {
    id: 'brand-acme',
    sourceUrl: 'https://acme.example.com',
    createdAt: 0,
    updatedAt: 0,
    status: 'ready',
    designSystemId: BRAND_DESIGN_SYSTEM.id,
    projectId: 'brand-project-acme',
  },
  brand: {
    name: 'Acme',
    tagline: 'Build the future, faster.',
    description: 'Acme is a bold engineering brand for fast-moving teams.',
    sourceUrl: 'https://acme.example.com',
    logo: { primary: 'logos/acme.svg', alternates: [], notes: '' },
    colors: [
      { role: 'accent', hex: '#0b5fff', oklch: '', name: 'Signal Blue', usage: 'Primary actions' },
      { role: 'background', hex: '#0a0a0a', oklch: '', name: 'Ink', usage: 'Surfaces' },
    ],
    typography: {
      display: { family: 'Space Grotesk', fallbacks: ['sans-serif'], weights: [500, 700] },
      body: { family: 'Inter', fallbacks: ['sans-serif'], weights: [400, 600] },
    },
    voice: { adjectives: [], tone: '', messagingPillars: [], vocabulary: { use: [], avoid: [] } },
    imagery: { style: '', subjects: [], treatment: '', avoid: [], samples: [] },
    layout: { radius: '', borderWeight: '', spacing: '', postureRules: [] },
  },
};

const HOME_PLUGINS = [
  {
    id: 'example-web-prototype',
    title: 'Web Prototype',
    version: '0.1.0',
    trust: 'bundled',
    sourceKind: 'bundled',
    source: '/tmp/web-prototype',
    fsPath: '/tmp/web-prototype',
    capabilitiesGranted: ['prompt:inject'],
    installedAt: 0,
    updatedAt: 0,
    manifest: {
      name: 'example-web-prototype',
      title: 'Web Prototype',
      version: '0.1.0',
      description: 'General-purpose desktop web prototype.',
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        preview: { entry: './example.html' },
        useCase: {
          query:
            'Build a {{fidelity}} {{artifactKind}} for {{audience}} using {{designSystem}} from {{template}}.',
        },
        inputs: [
          { name: 'artifactKind', type: 'string', required: true, default: 'web prototype', label: 'Artifact kind' },
          { name: 'fidelity', type: 'select', required: true, options: ['wireframe', 'high-fidelity'], default: 'high-fidelity', label: 'Fidelity' },
          { name: 'audience', type: 'string', required: true, default: 'product evaluators', label: 'Audience' },
          { name: 'designSystem', type: 'string', default: 'the active project design system', label: 'Design system' },
          { name: 'template', type: 'string', default: 'the bundled web prototype seed', label: 'Template' },
        ],
      },
    },
  },
  {
    id: 'example-simple-deck',
    title: 'Simple Deck',
    version: '0.1.0',
    trust: 'bundled',
    sourceKind: 'bundled',
    source: '/tmp/simple-deck',
    fsPath: '/tmp/simple-deck',
    capabilitiesGranted: ['prompt:inject'],
    installedAt: 0,
    updatedAt: 0,
    manifest: {
      name: 'example-simple-deck',
      title: 'Simple Deck',
      version: '0.1.0',
      description: 'Single-file horizontal-swipe HTML deck.',
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        useCase: {
          query:
            'Create a {{deckType}} for {{audience}} about {{topic}} with {{slideCount}}. Speaker notes: {{speakerNotes}}. Use {{designSystem}}.',
        },
        inputs: [
          { name: 'deckType', type: 'select', required: true, options: ['pitch deck', 'product overview', 'study deck'], default: 'pitch deck', label: 'Deck type' },
          { name: 'topic', type: 'string', required: true, default: 'quarterly review', label: 'Topic' },
          { name: 'audience', type: 'string', required: true, default: 'decision makers', label: 'Audience' },
          { name: 'slideCount', type: 'select', required: true, options: ['5-10 pages', '10-15 pages', '15-20 pages'], default: '10-15 pages', label: 'Pages' },
          { name: 'speakerNotes', type: 'select', options: ['include speaker notes', 'no speaker notes'], default: 'include speaker notes', label: 'Speaker notes' },
          { name: 'designSystem', type: 'string', default: 'the active project design system', label: 'Design system' },
        ],
      },
    },
  },
  {
    id: 'example-live-artifact',
    title: 'Live Artifact',
    version: '0.1.0',
    trust: 'bundled',
    sourceKind: 'bundled',
    source: '/tmp/live-artifact',
    fsPath: '/tmp/live-artifact',
    capabilitiesGranted: ['prompt:inject'],
    installedAt: 0,
    updatedAt: 0,
    manifest: {
      name: 'example-live-artifact',
      title: 'Live Artifact',
      version: '0.1.0',
      description: 'Create refreshable, auditable Open Design artifacts.',
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        mode: 'prototype',
        scenario: 'live',
        useCase: {
          query:
            'Create refreshable, auditable Open Design artifacts backed by connector or local data.',
        },
      },
    },
  },
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
        useCase: {
          query: 'Create media.',
        },
        inputs: [],
      },
    },
  },
  {
    id: 'example-hyperframes',
    title: 'HyperFrames',
    version: '0.1.0',
    trust: 'bundled',
    sourceKind: 'bundled',
    source: '/tmp/example-hyperframes',
    fsPath: '/tmp/example-hyperframes',
    capabilitiesGranted: ['prompt:inject'],
    installedAt: 0,
    updatedAt: 0,
    manifest: {
      name: 'example-hyperframes',
      title: 'HyperFrames',
      version: '0.1.0',
      description: 'Create HyperFrames motion content.',
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        useCase: {
          query: 'Create hyperframes media.',
        },
        inputs: [],
      },
    },
  },
  {
    id: 'image-template-notion-team-dashboard-live-artifact',
    title: 'Notion live artifact',
    version: '0.1.0',
    trust: 'bundled',
    sourceKind: 'bundled',
    source: '/tmp/notion-live-artifact',
    fsPath: '/tmp/notion-live-artifact',
    capabilitiesGranted: ['prompt:inject'],
    installedAt: 0,
    updatedAt: 0,
    manifest: {
      name: 'image-template-notion-team-dashboard-live-artifact',
      title: 'Notion live artifact',
      version: '0.1.0',
      description: 'Create a live Notion dashboard artifact.',
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        mode: 'image',
        surface: 'image',
        useCase: {
          query: 'Create a refreshable Notion dashboard live artifact.',
        },
      },
    },
  },
];

const APPLY_RESPONSES: Record<string, unknown> = {
  'example-simple-deck': {
    query: 'Draft a quarterly review deck.',
    contextItems: [],
    inputs: [],
    assets: [],
    mcpServers: [],
    trust: 'trusted',
    capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    appliedPlugin: {
      snapshotId: 'snap-simple-deck',
      pluginId: 'example-simple-deck',
      pluginVersion: '0.1.0',
      manifestSourceDigest: 'b'.repeat(64),
      inputs: { topic: 'quarterly review' },
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
  },
};

const PROMPT_TEMPLATES = [
  {
    id: 'image-product',
    surface: 'image',
    title: 'Image product concept',
    summary: 'A polished product image prompt.',
    category: 'product',
    model: 'gpt-image-2',
    aspect: '16:9',
    source: { repo: 'open-design/image-prompts', license: 'MIT' },
  },
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
  {
    id: 'hyperframes-caption',
    surface: 'video',
    title: 'HyperFrames captions',
    summary: 'A caption-led HyperFrames prompt.',
    category: 'motion',
    model: 'hyperframes-html',
    aspect: '16:9',
    source: { repo: 'heygen-com/hyperframes', license: 'MIT' },
  },
];

async function waitForLoadingToClear(page: Page) {
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, { timeout: 15_000 });
}

async function seedBrowserConfig(page: Page, config: Record<string, unknown>) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: config },
  );
}

async function seedBrowserLocale(page: Page, locale: string) {
  await page.addInitScript(
    ({ localeKey, sourceKey, value }) => {
      window.localStorage.setItem(localeKey, value);
      window.localStorage.setItem(sourceKey, 'manual');
    },
    { localeKey: LOCALE_KEY, sourceKey: LOCALE_SOURCE_KEY, value: locale },
  );
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
  }
  await expect(page.getByRole('button', { name: OPEN_SETTINGS_LABEL })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ key, value }) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem(key, JSON.stringify(value));
  }, { key: STORAGE_KEY, value: HOME_CONFIG });

  await page.route('**/api/github/open-design', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stargazers_count: 51600 }),
    });
  });

  await routeAgents(page, [
    {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      available: true,
      version: '0.80.0',
      path: '/usr/local/bin/codex',
      models: [{ id: 'default', label: 'Default' }],
    },
    {
      id: 'mock',
      name: 'Mock Agent',
      bin: 'mock-agent',
      available: true,
      version: 'test',
      models: [{ id: 'default', label: 'Default' }],
    },
  ]);

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        config: HOME_CONFIG,
      },
    });
  });

  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
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
      body: JSON.stringify({
        servers: [
          {
            id: 'docs',
            label: 'Docs MCP',
            transport: 'stdio',
            enabled: true,
            command: 'npx',
          },
        ],
        templates: [],
      }),
    });
  });

  await page.route('**/api/plugins/*/apply', async (route) => {
    const pluginId = route.request().url().split('/api/plugins/')[1]?.split('/apply')[0];
    const body = pluginId ? APPLY_RESPONSES[pluginId] : null;
    await route.fulfill({
      status: body ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(body ?? { error: 'Unknown plugin apply route' }),
    });
  });
});

test('[P1] home left rail expands and collapses from the shell controls', async ({ page }) => {
  await gotoEntryHome(page);

  const shell = page.locator('.entry');
  const rail = page.locator('.entry-nav-rail');
  const expand = page.getByTestId('entry-rail-toggle');

  await expect(shell).not.toHaveClass(/entry--rail-open/);
  await expect(rail).toHaveAttribute('aria-hidden', 'true');
  await expect(expand).toHaveAttribute('aria-expanded', 'false');

  await expand.click();
  await expect(shell).toHaveClass(/entry--rail-open/);
  await expect(rail).not.toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByTestId('entry-nav-home')).toBeVisible();
  await expect(page.getByTestId('entry-nav-projects')).toBeVisible();

  await page.getByTestId('entry-nav-collapse').click();
  await expect(shell).not.toHaveClass(/entry--rail-open/);
  await expect(rail).toHaveAttribute('aria-hidden', 'true');
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
});

test('[P1] home composer plus menu exposes attachment, connector, plugin, and MCP entries', async ({ page }) => {
  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');

  await page.getByTestId('home-hero-plus-trigger').click();
  await expect(page.getByTestId('composer-plus-attach')).toBeVisible();
  await expect(page.getByTestId('composer-plus-connectors')).toBeVisible();
  await expect(page.getByTestId('composer-plus-plugins')).toBeVisible();
  await expect(page.getByTestId('composer-plus-mcp')).toBeVisible();

  await page.getByTestId('composer-plus-connectors').click();
  await expect(page.getByText(/No connected connectors/i)).toBeVisible();

  await page.getByTestId('composer-plus-plugins').click();
  await page.getByRole('menuitem', { name: /Web Prototype/i }).click();
  await expect(input).toContainText(/Web Prototype/i);

  await page.getByTestId('home-hero-plus-trigger').click();
  await page.getByTestId('composer-plus-mcp').click();
  await page.getByRole('menuitem', { name: /Docs MCP/i }).click();
  await expect(input).toContainText(/Docs MCP/i);

  await page.getByTestId('home-hero-file-input').setInputFiles('../package.json');
  await expect(page.getByTestId('home-hero-staged-files')).toContainText('package.json');
});

test('[P2] home hero exposes the template picker, starter cards, blank project, and More shortcuts', async ({ page }) => {
  await gotoEntryHome(page);

  await expect(page.getByTestId('entry-star-badge')).toContainText('51.6K');
  await expect(page.getByTestId('home-hero-template-picker')).toBeVisible();
  await expect(page.getByTestId('home-hero-design-system-picker')).toBeVisible();
  await expect(page.getByTestId('working-dir-picker')).toBeVisible();
  await expect(page.getByTestId('home-hero-template-section')).toBeVisible();
  await expect(page.getByTestId('home-hero-blank-project')).toBeVisible();
  await expect(page.getByTestId('home-hero-type-tabs')).toBeVisible();
  for (const id of ['prototype', 'live-artifact', 'deck', 'image', 'video', 'hyperframes', 'audio']) {
    await expect(page.getByTestId(`home-hero-rail-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId('home-hero-shortcuts-trigger')).toBeVisible();

  await page.getByTestId('home-hero-shortcuts-trigger').click();
  const menu = page.getByTestId('home-hero-shortcuts-menu');
  await expect(menu).toBeVisible();
  for (const id of ['create-plugin', 'figma', 'template']) {
    await expect(menu.getByTestId(`home-hero-rail-${id}`)).toBeVisible();
  }
});

test('[P0] empty home composer submits the active placeholder suggestion with template routing', async ({ page }) => {
  await routeProjectCreates(page);
  await routeRunsAccepted(page);
  await gotoEntryHome(page);

  await expect(page.getByTestId('home-hero-submit')).toBeEnabled();
  const createRequestPromise = page.waitForRequest((request) =>
    request.method() === 'POST' && new URL(request.url()).pathname === '/api/projects',
  );
  await page.getByTestId('home-hero-submit').click();
  const createRequest = await createRequestPromise;
  const body = createRequest.postDataJSON() as {
    pendingPrompt?: string;
    pluginId?: string | null;
    metadata?: { kind?: string };
  };

  expect(body.pendingPrompt?.trim()).toBeTruthy();
  expect(typeof body.pluginId).toBe('string');
  expect(typeof body.metadata?.kind).toBe('string');
  await expect(page).toHaveURL(/\/projects\//);
});

test('[P0] home design-system picker carries explicit and cleared selections into project creation', async ({ page }) => {
  await routeHomeDesignSystems(page);
  await routeProjectCreates(page);
  await routeRunsAccepted(page);
  await gotoEntryHome(page);

  await selectHomeDesignSystem(page, 'agentic');
  await page.getByTestId('home-hero-template-trigger').click();
  await page.getByTestId('home-hero-template-card-deck').click();
  await page.getByTestId('home-hero-input').fill('Create a design-system aware deck.');

  const selectedRequestPromise = page.waitForRequest((request) =>
    request.method() === 'POST' && new URL(request.url()).pathname === '/api/projects',
  );
  await page.getByTestId('home-hero-submit').click();
  const selectedBody = selectedRequestPromise.then((request) => request.postDataJSON() as { designSystemId?: string | null });
  await expect.poll(async () => (await selectedBody).designSystemId).toBe('agentic');

  await gotoEntryHome(page);
  await selectHomeDesignSystem(page, 'agentic');
  await selectHomeDesignSystem(page, null);
  await page.getByTestId('home-hero-input').fill('Create without a design system.');

  const clearedRequestPromise = page.waitForRequest((request) =>
    request.method() === 'POST' && new URL(request.url()).pathname === '/api/projects',
  );
  await page.getByTestId('home-hero-submit').click();
  const clearedBody = await clearedRequestPromise.then((request) => request.postDataJSON() as { designSystemId?: string | null });
  expect(clearedBody.designSystemId ?? null).toBeNull();
});

test('[P1] home Brand Kit chip opens design-system creation and starts brand extraction', async ({ page }) => {
  const brandRequests: Array<{ url?: string; locale?: string }> = [];
  await routeHomeDesignSystems(page);
  await routeProjectCreates(page);
  await routeRunsAccepted(page);
  await routeBrandExtraction(page, brandRequests);

  await gotoEntryHome(page);
  await page.getByTestId('home-hero-rail-create-brand-kit').click();

  await expect(page).toHaveURL(/\/design-systems\/create$/);
  await expect(page.getByRole('heading', { name: /Design a system, in minutes/i })).toBeVisible();

  await page.getByPlaceholder('https://github.com/org/repo').fill('https://acme.example.com');
  await page.getByRole('button', { name: 'Add' }).first().click();
  await page.getByRole('button', { name: /continue to generation/i }).click();

  await expect
    .poll(() => brandRequests.at(-1)?.url)
    .toBe('https://acme.example.com');
  await expect(page).toHaveURL(/\/projects\/brand-project-acme$/);
  await expect(page.getByTestId('file-workspace')).toBeVisible();
  await expect(page.getByTestId('design-system-project-tab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('design-system-project-tab-panel')).toBeVisible();
  await expect(page.getByTestId('design-system-extraction-status')).toContainText(/Extracting design system|正在提取|正在擷取/i);
});

test('[P1] brand-backed design system previews as a Brand Kit and carries into project creation', async ({ page }) => {
  await routeHomeDesignSystems(page, { includeBrandKit: true });
  await routeProjectCreates(page);
  await routeRunsAccepted(page);
  await gotoEntryHome(page);

  await page.getByTestId('home-hero-design-system-trigger').click();
  const popover = page.getByTestId('project-ds-picker-popover');
  await expect(popover).toBeVisible();
  await expect(popover.getByTestId(`project-ds-picker-option-${BRAND_DESIGN_SYSTEM.id}`)).toBeVisible();
  await popover.getByTestId(`project-ds-picker-option-${BRAND_DESIGN_SYSTEM.id}`).hover();

  const brandPreview = page.getByTestId('project-ds-picker-preview-brand');
  await expect(brandPreview).toBeVisible();
  await expect(brandPreview.getByTestId('brand-preview-card')).toBeVisible();
  await expect(brandPreview).toContainText('Acme is a bold engineering brand for fast-moving teams.');
  await expect(brandPreview).toContainText('Space Grotesk');

  await popover.getByTestId(`project-ds-picker-option-${BRAND_DESIGN_SYSTEM.id}`).click();
  await expect(popover).toHaveCount(0);

  await page.getByTestId('home-hero-input').fill('Create a landing page with the Acme brand kit.');
  const createRequestPromise = page.waitForRequest((request) =>
    request.method() === 'POST' && new URL(request.url()).pathname === '/api/projects',
  );
  await page.getByTestId('home-hero-submit').click();
  const body = await createRequestPromise.then((request) => request.postDataJSON() as { designSystemId?: string | null });
  expect(body.designSystemId).toBe(BRAND_DESIGN_SYSTEM.id);
});

test('[P1] home template carousel scrolls horizontally without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 920, height: 820 });
  await gotoEntryHome(page);

  const rail = page.locator('.home-hero__scenario-cards').first();
  await expect(rail).toBeVisible();
  const initial = await rail.evaluate((el) => ({
    scrollLeft: el.scrollLeft,
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    pageOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  }));
  expect(initial.scrollWidth).toBeGreaterThan(initial.clientWidth);
  expect(initial.pageOverflow).toBeLessThanOrEqual(2);

  await page.locator('.home-hero__rail-edge--right').first().click({ force: true });
  await expect
    .poll(() => rail.evaluate((el) => el.scrollLeft), { timeout: 3_000 })
    .toBeGreaterThan(initial.scrollLeft);
});

test('[P1] first-run home template reveal opens from wheel gesture', async ({ page }) => {
  await gotoEntryHome(page);

  const revealBody = page.locator('.home-templates-reveal__body');
  await expect(page.getByTestId('home-templates-hint')).toBeVisible();
  await expect(revealBody).toHaveAttribute('aria-hidden', 'true');

  await page.mouse.wheel(0, 500);

  await expect(revealBody).toHaveAttribute('aria-hidden', 'false');
  await expect(page.getByTestId('entry-view-home').getByTestId('plugins-home-section')).toBeVisible();
});

test('[P1] blank project entry surfaces create failures and remains retryable', async ({ page }) => {
  await routeProjectCreates(page, { failFirstCreate: true });
  await gotoEntryHome(page);

  await page.getByTestId('home-hero-blank-project').click();
  await expect(page.locator('.home-hero__error')).toContainText(/blank project|空白项目|空白專案|create/i);

  const retryRequestPromise = page.waitForRequest((request) =>
    request.method() === 'POST' && new URL(request.url()).pathname === '/api/projects',
  );
  await page.getByTestId('home-hero-blank-project').click();
  await retryRequestPromise;
  await expect(page.locator('.home-hero__error')).toHaveCount(0);
});

test('[P2] home template picker supports no-results, clear, Escape, and outside dismissal', async ({ page }) => {
  await gotoEntryHome(page);

  await page.getByTestId('home-hero-template-trigger').click();
  await page.getByTestId('home-hero-template-card-deck').click();
  await expect(page.getByTestId('home-hero-template-reset')).toBeVisible();

  await page.getByTestId('home-hero-template-trigger').click();
  await page.getByTestId('home-hero-template-search').fill('zzzz-no-template');
  await expect(page.getByTestId('home-hero-template-menu')).toContainText(/No matches|没有匹配|沒有相符/i);
  await page.getByTestId('home-hero-template-clear').click();
  await expect(page.getByTestId('home-hero-active-type-chip')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('home-hero-template-menu')).toHaveCount(0);

  await page.getByTestId('home-hero-template-trigger').click();
  await expect(page.getByTestId('home-hero-template-menu')).toBeVisible();
  await page.getByTestId('home-hero-input').click();
  await expect(page.getByTestId('home-hero-template-menu')).toHaveCount(0);
});

test('[P2] zh-CN home smoke exposes the localized template, design system, working directory, and send entries', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('open-design:locale', 'zh-CN');
    window.localStorage.setItem('open-design:locale-source', 'manual');
  });
  await seedBrowserLocale(page, 'zh-CN');
  await routeHomeDesignSystems(page);
  await gotoEntryHome(page);

  await expect(page.getByRole('heading', { name: '你今天要设计什么？' })).toBeVisible();
  await expect(page.getByText('从模板开始…')).toBeVisible();
  await expect(page.getByText('…或创建一个空白项目')).toBeVisible();
  await expect(page.getByText('不指定设计系统')).toBeVisible();
  await expect(page.getByTestId('working-dir-picker')).toContainText(/本地存储|选择工作目录/);
  await expect(page.getByTestId('home-hero-submit')).toContainText('发送');
});

test('[P1] home template picker selects a starter template and can clear it', async ({ page }) => {
  await gotoEntryHome(page);

  await page.getByTestId('home-hero-template-trigger').click();
  const menu = page.getByTestId('home-hero-template-menu');
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('home-hero-template-card-prototype')).toBeVisible();
  await expect(page.getByTestId('home-hero-template-card-deck')).toBeVisible();

  await page.getByTestId('home-hero-template-search').fill('deck');
  await expect(page.getByTestId('home-hero-template-card-deck')).toBeVisible();
  await page.getByTestId('home-hero-template-card-deck').click();

  await expect(page.getByTestId('home-hero-template-trigger')).toContainText(/Slide deck|幻灯片|投影片/i);

  await page.getByTestId('home-hero-template-reset').click();
  await expect(page.getByTestId('home-hero-footer-option-speakerNotes')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-template-trigger')).toContainText(/None|无|無/i);
});

test('[P1] first-run home keeps community templates collapsed until the hint is used', async ({ page }) => {
  await gotoEntryHome(page);

  const home = page.getByTestId('entry-view-home');
  const revealBody = page.locator('.home-templates-reveal__body');
  await expect(page.getByTestId('recent-projects-strip')).toHaveCount(0);
  await expect(page.getByTestId('home-templates-hint')).toBeVisible();
  await expect(home.getByTestId('plugins-home-section')).toBeAttached();
  await expect(revealBody).toHaveAttribute('aria-hidden', 'true');

  await page.getByTestId('home-templates-hint').click();

  await expect(revealBody).toHaveAttribute('aria-hidden', 'false');
  await expect(home.getByTestId('plugins-home-section')).toBeVisible();
  await expect(home.getByTestId('plugins-home-browse-registry')).toBeVisible();
  await expect(home.getByTestId('plugins-home-pill-category-all')).toHaveAttribute('aria-selected', 'true');
  await expect(home.locator('article.plugins-home__card[data-plugin-id="example-web-prototype"]')).toBeVisible();
});

test('[P1] blank project entry creates an empty project without prompt or template metadata', async ({ page }) => {
  await page.route('**/api/projects', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as { id?: string; name?: string };
      await route.fulfill({
        json: {
          project: {
            id: body.id ?? 'blank-project-entry',
            name: body.name ?? 'Untitled project',
            path: `/tmp/open-design/${body.id ?? 'blank-project-entry'}`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: {},
          },
          conversationId: `conv-${body.id ?? 'blank-project-entry'}`,
        },
      });
      return;
    }
    await route.continue();
  });

  await gotoEntryHome(page);

  const createRequestPromise = page.waitForRequest((request) =>
    request.method() === 'POST' && new URL(request.url()).pathname === '/api/projects',
  );
  await page.getByTestId('home-hero-blank-project').click();
  const createRequest = await createRequestPromise;
  const body = createRequest.postDataJSON() as {
    pendingPrompt?: string;
    pluginId?: string | null;
    skillId?: string | null;
    metadata?: { kind?: string };
  };

  expect(body.pendingPrompt).toBeUndefined();
  expect(body.pluginId ?? null).toBeNull();
  expect(body.skillId ?? null).toBeNull();
  expect(body.metadata?.kind ?? null).toBeNull();
});

test('[P1] home hero rail switches non-media modes without surfacing media-only footer options', async ({ page }) => {
  await gotoEntryHome(page);

  await expect(page.getByTestId('home-hero-type-tabs')).toBeVisible();
  await expect(page.getByTestId('home-hero-footer-option-duration')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-option-audioType')).toHaveCount(0);

  await expectChipSelection(page, 'prototype', 'Prototype');
  await expect(page.getByTestId('home-hero-footer-option-designSystem')).toBeVisible();
  await expect(page.getByTestId('home-hero-footer-option-duration')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-option-audioType')).toHaveCount(0);
  await clearActiveChip(page);

  await expectChipSelection(page, 'live-artifact', 'Live artifact');
  await expect(page.getByTestId('home-hero-footer-option-duration')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-option-audioType')).toHaveCount(0);
  await clearActiveChip(page);

  await expectChipSelection(page, 'deck', 'Slide deck');
  await expect(page.getByTestId('home-hero-footer-option-designSystem')).toBeVisible();
  await expect(page.getByTestId('home-hero-footer-option-duration')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-option-audioType')).toHaveCount(0);
  await clearActiveChip(page);
});

test('[P1] home hero rail exposes media footer options for image, video, hyperframes, and audio', async ({ page }) => {
  await gotoEntryHome(page);

  await expectChipSelection(page, 'image', 'Image');
  await expect(page.getByTestId('home-hero-footer-option-ratio')).toBeVisible();
  await expect(page.getByTestId('home-hero-footer-option-resolution')).toBeVisible();
  await expect(page.getByTestId('home-hero-footer-option-duration')).toHaveCount(0);
  await clearActiveChip(page);

  await expectChipSelection(page, 'video', 'Video');
  await expect(page.getByTestId('home-hero-footer-option-ratio')).toBeVisible();
  await expect(page.getByTestId('home-hero-footer-option-resolution')).toBeVisible();
  await expect(page.getByTestId('home-hero-footer-option-duration')).toBeVisible();
  await clearActiveChip(page);

  await expectChipSelection(page, 'hyperframes', 'HyperFrames');
  await expect(page.getByTestId('home-hero-footer-option-ratio')).toBeVisible();
  await expect(page.getByTestId('home-hero-footer-option-duration')).toBeVisible();
  await clearActiveChip(page);

  await expectChipSelection(page, 'audio', 'Audio');
  await expect(page.getByTestId('home-hero-footer-option-audioType')).toBeVisible();
  await expect(page.getByTestId('home-hero-footer-option-duration')).toBeVisible();
});

test('[P1] home hero example presets update the composer input for prototype and live artifact', async ({ page }) => {
  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');
  await expect(input).toHaveText('');

  await page.getByTestId('home-hero-rail-prototype').click();
  await expect(page.getByTestId('home-hero-plugin-presets')).toBeVisible();
  await page
    .locator('[data-testid="home-hero-plugin-preset"][data-plugin-id="example-web-prototype"]')
    .click();
  await expect(input).toHaveText(
    'Build a high-fidelity web prototype for product evaluators using the active project design system from the bundled web prototype seed.',
  );

  await clearActiveChip(page);
  await page.getByTestId('home-hero-rail-live-artifact').click();
  await expect(page.getByTestId('home-hero-plugin-presets')).toBeVisible();
  await page
    .locator('[data-testid="home-hero-plugin-preset"][data-plugin-id="image-template-notion-team-dashboard-live-artifact"]')
    .click();
  await expect(input).toHaveText('Create a refreshable Notion dashboard live artifact.');
});

test('[P1] home hero preset inline Use and Duplicate actions work from the template card', async ({ page }) => {
  const duplicateRequests: Array<{ name?: string }> = [];
  await page.route('**/api/plugins/example-web-prototype/duplicate-project', async (route) => {
    duplicateRequests.push(route.request().postDataJSON() as { name?: string });
    await route.fulfill({
      json: {
        ok: true,
        sourcePluginId: 'example-web-prototype',
        projectId: 'web-prototype-template-project',
        conversationId: 'web-prototype-template-conversation',
        relPath: 'index.html',
      },
    });
  });
  await page.route('**/api/projects/web-prototype-template-project', async (route) => {
    await route.fulfill({
      json: {
        project: {
          id: 'web-prototype-template-project',
          name: 'Web Prototype',
          path: '/tmp/open-design/web-prototype-template-project',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metadata: { kind: 'prototype', duplicatedFromPluginId: 'example-web-prototype' },
        },
      },
    });
  });
  await page.route('**/api/projects/web-prototype-template-project/conversations', async (route) => {
    await route.fulfill({
      json: {
        conversations: [
          {
            id: 'web-prototype-template-conversation',
            title: 'Web Prototype',
            projectId: 'web-prototype-template-project',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            sessionMode: 'design',
          },
        ],
      },
    });
  });
  await page.route('**/api/projects/web-prototype-template-project/conversations/*/messages**', async (route) => {
    await route.fulfill({ json: { messages: [] } });
  });

  await gotoEntryHome(page);
  await page.getByTestId('home-hero-rail-prototype').click();
  const card = page.locator('[data-testid="home-hero-plugin-preset"][data-plugin-id="example-web-prototype"]');
  await card.hover();

  await page.getByTestId('home-hero-plugin-preset-use-example-web-prototype').click();
  await expect(page.getByTestId('home-hero-input')).toHaveText(
    'Build a high-fidelity web prototype for product evaluators using the active project design system from the bundled web prototype seed.',
  );

  await card.hover();
  await page.getByTestId('home-hero-plugin-preset-duplicate-example-web-prototype').click();
  await expect
    .poll(() => duplicateRequests.at(-1)?.name)
    .toBe('Web Prototype');
  await expect(page).toHaveURL(/\/projects\/web-prototype-template-project/);
});

test('[P1] home hero deck example preset updates the composer input', async ({ page }) => {
  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');
  await expect(input).toHaveText('');

  await page.getByTestId('home-hero-rail-deck').click();
  await expect(page.getByTestId('home-hero-plugin-presets')).toBeVisible();
  await page
    .locator('[data-testid="home-hero-plugin-preset"][data-plugin-id="example-simple-deck"]')
    .click();
  await expect(input).toHaveText(
    'Create a pitch deck for decision makers about quarterly review with 10-15 pages. Speaker notes: include speaker notes. Use the active project design system.',
  );
});

test('[P1] home hero prompt example cards fill the composer for fallback modes', async ({ page }) => {
  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');
  await page.getByTestId('home-hero-rail-audio').click();
  await expect(page.getByTestId('home-hero-prompt-examples')).toBeVisible();
  await expect(page.getByTestId('home-hero-plugin-presets')).toHaveCount(0);

  const firstExample = page.getByTestId('home-hero-prompt-example').first();
  const exampleText = (await firstExample.textContent())?.trim();
  expect(exampleText).toBeTruthy();
  await firstExample.click();

  await expect(input).toHaveText(exampleText ?? '');
});

test('[P2] clearing the active hero chip restores the rail and clears preset chrome', async ({ page }) => {
  await gotoEntryHome(page);

  await page.getByTestId('home-hero-rail-prototype').click();
  await expect(page.getByTestId('home-hero-active-type-chip')).toBeVisible();
  await expect(page.getByTestId('home-hero-plugin-presets')).toBeVisible();
  await expect(page.getByTestId('home-hero-footer-option-designSystem')).toBeVisible();

  await clearActiveChip(page);

  await expect(page.getByTestId('home-hero-plugin-presets')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-option-designSystem')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-option-ratio')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-option-duration')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-type-tabs')).toBeVisible();
  await expect(page.getByTestId('home-hero-rail-live-artifact')).toBeVisible();
});

test('[P1] after clearing one mode, selecting another example updates the composer without leaking prior mode state', async ({ page }) => {
  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');

  await page.getByTestId('home-hero-rail-prototype').click();
  await expect(page.getByTestId('home-hero-plugin-presets')).toBeVisible();
  await page
    .locator('[data-testid="home-hero-plugin-preset"][data-plugin-id="example-web-prototype"]')
    .click();
  await expect(input).toHaveText(
    'Build a high-fidelity web prototype for product evaluators using the active project design system from the bundled web prototype seed.',
  );

  await clearActiveChip(page);

  await page.getByTestId('home-hero-rail-live-artifact').click();
  await expect(page.getByTestId('home-hero-active-type-chip')).toBeVisible();
  await expect(page.getByTestId('home-hero-plugin-presets')).toBeVisible();
  await expect(page.getByTestId('home-hero-footer-option-designSystem')).toHaveCount(0);
  await page
    .locator('[data-testid="home-hero-plugin-preset"][data-plugin-id="image-template-notion-team-dashboard-live-artifact"]')
    .click();
  await expect(input).toHaveText('Create a refreshable Notion dashboard live artifact.');
});

test('[P1] selecting another example updates the composer input', async ({ page }) => {
  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');

  await page.getByTestId('home-hero-rail-live-artifact').click();
  await expect(page.getByTestId('home-hero-plugin-presets')).toBeVisible();
  await page
    .locator('[data-testid="home-hero-plugin-preset"][data-plugin-id="image-template-notion-team-dashboard-live-artifact"]')
    .click();
  await expect(input).toHaveText('Create a refreshable Notion dashboard live artifact.');

  await page
    .locator('[data-testid="home-hero-plugin-preset"][data-plugin-id="example-live-artifact"]')
    .click();
  await expect(input).toHaveText('Create refreshable, auditable Open Design artifacts backed by connector or local data.');
});

async function expectChipSelection(page: Page, chipId: string, _label: string) {
  const chip = page.getByTestId(`home-hero-rail-${chipId}`);
  await expect(chip).toBeEnabled();
  await chip.click();
  await expect(page.getByTestId('home-hero-active-type-chip')).toBeVisible();
}

async function clearActiveChip(page: Page) {
  await page.getByTestId('home-hero-active-type-chip').click();
  await expect(page.getByTestId('home-hero-active-type-chip')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-type-tabs')).toBeVisible();
}

async function routeRunsAccepted(page: Page) {
  await page.route('**/api/runs', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"home-run-smoke"}',
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

async function routeProjectCreates(page: Page, options: { failFirstCreate?: boolean } = {}) {
  let createCount = 0;
  await page.route('**/api/projects', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    if (request.method() === 'POST') {
      createCount += 1;
      if (options.failFirstCreate && createCount === 1) {
        await route.fulfill({ status: 500, body: 'create failed' });
        return;
      }
      const body = request.postDataJSON() as { id?: string; name?: string; metadata?: Record<string, unknown> };
      const id = body.id ?? `home-created-${createCount}`;
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
}

async function routeHomeDesignSystems(page: Page, options: { includeBrandKit?: boolean } = {}) {
  const systems = options.includeBrandKit
    ? [BRAND_DESIGN_SYSTEM, ...HOME_DESIGN_SYSTEMS]
    : HOME_DESIGN_SYSTEMS;
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { config: HOME_CONFIG } });
      return;
    }
    if (route.request().method() === 'PUT') {
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/design-systems', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { designSystems: systems } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/brands', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          brands: options.includeBrandKit ? [ACME_BRAND] : [],
        },
      });
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
}

async function routeBrandExtraction(
  page: Page,
  requests: Array<{ url?: string; locale?: string }>,
) {
  let started = false;
  await page.route('**/api/brands', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ json: { brands: started ? [{ ...ACME_BRAND, meta: { ...ACME_BRAND.meta, status: 'extracting' } }] : [] } });
      return;
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as { url?: string; locale?: string };
      requests.push(body);
      started = true;
      await route.fulfill({
        json: {
          id: 'brand-acme',
          projectId: 'brand-project-acme',
          conversationId: 'conv-brand-acme',
          sourceUrl: body.url ?? 'https://acme.example.com',
          status: 'extracting',
          designSystemId: BRAND_DESIGN_SYSTEM.id,
          brandName: 'Acme',
        },
      });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/projects/brand-project-acme', async (route) => {
    await route.fulfill({
      json: {
        project: {
          id: 'brand-project-acme',
          name: 'Acme Brand Kit',
          skillId: 'brand-extract',
          designSystemId: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metadata: {
            kind: 'brand',
            importedFrom: 'brand-extraction',
            brandId: 'brand-acme',
            brandSourceUrl: 'https://acme.example.com',
            brandDesignSystemId: BRAND_DESIGN_SYSTEM.id,
          },
        },
      },
    });
  });
  await page.route('**/api/projects/brand-project-acme/conversations', async (route) => {
    const conversation = {
      id: 'conv-brand-acme',
      title: 'Acme Brand Kit',
      projectId: 'brand-project-acme',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sessionMode: 'design',
    };
    if (route.request().method() === 'POST') {
      await route.fulfill({ json: { conversation } });
      return;
    }
    await route.fulfill({ json: { conversations: [conversation] } });
  });
  await page.route('**/api/projects/brand-project-acme/conversations/*/messages**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { messages: [] } });
      return;
    }
    await route.fulfill({ json: { ok: true } });
  });
}

async function selectHomeDesignSystem(page: Page, id: string | null) {
  await page.getByTestId('home-hero-design-system-trigger').click();
  const popover = page.getByTestId('project-ds-picker-popover');
  await expect(popover).toBeVisible();
  if (id === null) {
    await popover.getByRole('option', { name: /No design system|不指定设计系统|不指定設計系統/i }).click();
  } else {
    await popover.getByTestId(`project-ds-picker-option-${id}`).click();
  }
  await expect(popover).toHaveCount(0);
}
