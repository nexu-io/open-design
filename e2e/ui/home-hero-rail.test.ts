import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';
import {
  openHomeTemplateMenu,
  pickHomeTemplate,
} from '@/playwright/home-hero';
import {
  routeAgents,
  routeSuccessfulRuns,
  successfulRunEventBody,
  suppressWhatsNew,
  trackRunRequests,
} from '@/playwright/mock-factory';
import { CAMPAIGN_DISMISSAL_STORAGE } from '@/playwright/campaign-dismissals';
import { ensureRailOpen } from '@/playwright/rail';
import { T } from '@/timeouts';

test.describe.configure({ timeout: T.xlong });

const STORAGE_KEY = 'open-design:config';
const LOCALE_KEY = 'open-design:locale';
const LOCALE_SOURCE_KEY = 'open-design:locale-source';

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
      description: 'Create refreshable, auditable OpenDesign artifacts.',
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        mode: 'prototype',
        scenario: 'live',
        useCase: {
          query:
            'Create refreshable, auditable OpenDesign artifacts backed by connector or local data.',
        },
      },
    },
  },
  {
    id: 'example-live-dashboard',
    title: 'Live Dashboard',
    version: '0.1.0',
    trust: 'bundled',
    sourceKind: 'bundled',
    source: '/tmp/live-dashboard',
    fsPath: '/tmp/live-dashboard',
    capabilitiesGranted: ['prompt:inject'],
    installedAt: 0,
    updatedAt: 0,
    manifest: {
      name: 'example-live-dashboard',
      title: 'Live Dashboard',
      version: '0.1.0',
      description: 'Notion-style team dashboard rendered as a Live Artifact.',
      tags: ['live-dashboard', 'team-workspace-dashboard'],
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        mode: 'prototype',
        scenario: 'operation',
        surface: 'web',
        useCase: {
          query: 'Build a Notion-style team dashboard with live KPIs.',
        },
        inputs: [
          { name: 'workspace_name', type: 'string', required: true },
          { name: 'page_title', type: 'string', default: 'Team Dashboard' },
        ],
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
  'example-web-prototype': {
    query: 'Build a high-fidelity web prototype for product evaluators.',
    contextItems: [],
    inputs: [],
    assets: [],
    mcpServers: [],
    trust: 'bundled',
    capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    appliedPlugin: {
      snapshotId: 'snap-web-prototype',
      pluginId: 'example-web-prototype',
      pluginVersion: '0.1.0',
      manifestSourceDigest: 'c'.repeat(64),
      inputs: {
        artifactKind: 'web prototype',
        fidelity: 'high-fidelity',
        audience: 'product evaluators',
        designSystem: 'the active project design system',
        template: 'the bundled web prototype seed',
      },
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
  'example-live-dashboard': {
    query: 'Build a Notion-style team dashboard with live KPIs.',
    contextItems: [],
    inputs: [],
    assets: [],
    mcpServers: [],
    trust: 'bundled',
    capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    appliedPlugin: {
      snapshotId: 'snap-live-dashboard',
      pluginId: 'example-live-dashboard',
      pluginVersion: '0.1.0',
      manifestSourceDigest: 'a'.repeat(64),
      inputs: {
        workspace_name: 'QA Team',
        page_title: 'Team Dashboard',
      },
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
  'example-simple-deck': {
    query: 'Draft a quarterly review deck.',
    contextItems: [],
    inputs: [],
    assets: [],
    mcpServers: [],
    trust: 'bundled',
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
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: 15_000 });
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
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve OpenDesign' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
  }
  // #5517 moved the settings entry into the collapsed-by-default nav rail, so it
  // is not in the accessibility tree on load; the hero is the ready signal now.
  await expect(page.getByTestId('home-hero')).toBeVisible();
}

interface HomeExampleGeometry {
  rootTop: number;
  rootHeight: number;
  cardWidth: number;
  cardHeight: number;
  previewHeight: number;
}

async function readHomeExampleGeometry(
  page: Page,
  state: 'loading' | 'settled',
): Promise<HomeExampleGeometry> {
  const root = page.getByTestId(
    state === 'loading' ? 'home-hero-examples-loading' : 'home-hero-plugin-presets',
  );
  return root.evaluate((element, currentState) => {
    const cardSelector = currentState === 'loading'
      ? '.home-hero__plugin-preset-loading'
      : '.home-hero__plugin-preset';
    const previewSelector = currentState === 'loading'
      ? '.home-hero__plugin-preset-loading-preview'
      : '.home-hero__plugin-preset-preview';
    const card = element.querySelector<HTMLElement>(cardSelector);
    const preview = element.querySelector<HTMLElement>(previewSelector);
    if (!card || !preview) {
      throw new Error(`Missing ${currentState} Home example geometry fixture`);
    }
    const rootRect = element.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    return {
      rootTop: rootRect.top,
      rootHeight: rootRect.height,
      cardWidth: cardRect.width,
      cardHeight: cardRect.height,
      previewHeight: previewRect.height,
    };
  }, state);
}

test.beforeEach(async ({ page }) => {
  await suppressWhatsNew(page);
  await page.addInitScript(({ key, value, campaigns }) => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem(key, JSON.stringify(value));
    // Keep time-boxed marketing surfaces out of functional Home scenarios,
    // including tests that later mock an authenticated workspace. This clears
    // storage first, so the suite fixture's seeding is wiped and has to be
    // reapplied here — from the same source, so a new campaign cannot be
    // dismissed in one place and left to interrupt specs in the other.
    for (const [campaignKey, campaignValue] of Object.entries(campaigns)) {
      window.localStorage.setItem(campaignKey, campaignValue);
    }
  }, { key: STORAGE_KEY, value: HOME_CONFIG, campaigns: CAMPAIGN_DISMISSAL_STORAGE });

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

  // These Home composer scenarios exercise the signed-out/local path. Settle
  // workspace bootstrap explicitly so strict workspace write guards do not
  // confuse an unresolved test fixture with an authenticated cloud identity.
  await page.route('**/api/workspace/directory', async (route) => {
    await route.fulfill({ json: { items: [] } });
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

  // Exact local-source selection uses /apply-local; keep /apply covered for
  // old-daemon compatibility. Both paths must stay hermetic instead of
  // falling through to whichever plugins happen to exist in the worker's
  // daemon data root.
  await page.route('**/api/plugins/*/apply*', async (route) => {
    const pluginId = route.request().url().split('/api/plugins/')[1]?.split('/apply')[0];
    const body = pluginId ? APPLY_RESPONSES[pluginId] : null;
    await route.fulfill({
      status: body ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(body ?? { error: 'Unknown plugin apply route' }),
    });
  });
});

test('[P1] cold-start Home examples keep their geometry while plugins settle at every breakpoint', async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 800, height: 900 },
    { width: 540, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.unroute('**/api/plugins');

    let releasePlugins!: () => void;
    const pluginsReady = new Promise<void>((resolve) => {
      releasePlugins = resolve;
    });
    await page.route('**/api/plugins', async (route) => {
      await pluginsReady;
      await route.fulfill({ json: { plugins: HOME_PLUGINS } });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const loadingRoot = page.getByTestId('home-hero-examples-loading');
    let loadingGeometry: HomeExampleGeometry;
    try {
      await expect(loadingRoot).toBeVisible();
      loadingGeometry = await readHomeExampleGeometry(page, 'loading');
    } finally {
      releasePlugins();
    }

    await expect(page.getByTestId('home-hero-plugin-presets')).toBeVisible();
    await waitForLoadingToClear(page);
    const settledGeometry = await readHomeExampleGeometry(page, 'settled');

    for (const key of Object.keys(loadingGeometry) as Array<keyof HomeExampleGeometry>) {
      expect(
        Math.abs(loadingGeometry[key] - settledGeometry[key]),
        `${key} shifted at ${viewport.width}px: loading=${loadingGeometry[key]}, settled=${settledGeometry[key]}`,
      ).toBeLessThanOrEqual(1);
    }
  }
});

test('[P1] last project list row keeps its overflow menu inside the viewport', async ({ page }) => {
  const recentProjects = Array.from({ length: 3 }, (_, index) => ({
    id: `recent-list-menu-${index + 1}`,
    name: `List Project ${index + 1}`,
    skillId: null,
    designSystemId: null,
    createdAt: Date.now() - (index + 1) * 10_000,
    updatedAt: Date.now() - (index + 1) * 5_000,
    metadata: { kind: 'prototype', nameSource: 'user' },
  }));
  const lastProject = recentProjects.at(-1)!;

  await page.setViewportSize({ width: 1280, height: 500 });
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: recentProjects } });
      return;
    }
    await route.continue();
  });
  await gotoEntryHome(page);

  await page.getByRole('button', { name: 'List view' }).click();
  const lastRow = page.locator(`[data-project-id="${lastProject.id}"]`);
  await expect(lastRow).toBeVisible();
  await page.evaluate((projectId) => {
    const scroller = document.querySelector<HTMLElement>('.entry-main--scroll');
    const row = document.querySelector<HTMLElement>(`[data-project-id="${projectId}"]`);
    const trigger = row?.querySelector<HTMLElement>('.recent-projects__card-more');
    if (!scroller || !row || !trigger) {
      throw new Error('Recent project list-menu fixture is missing');
    }

    const desiredTop = scroller.getBoundingClientRect().bottom - 60;
    scroller.scrollTop += trigger.getBoundingClientRect().top - desiredTop;
  }, lastProject.id);

  await lastRow.hover();
  const trigger = lastRow.getByRole('button', { name: /more actions/i });
  await trigger.click();

  const menu = lastRow.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeInViewport();

  const triggerBox = await trigger.boundingBox();
  const menuBox = await menu.boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(menuBox).not.toBeNull();
  expect((menuBox?.y ?? 0) + (menuBox?.height ?? 0)).toBeLessThan(triggerBox?.y ?? 0);
});

test('[P1] home left rail expands and collapses from the shell controls', async ({ page }) => {
  await gotoEntryHome(page);

  const shell = page.locator('.entry');
  const rail = page.locator('.entry-nav-rail');
  const expand = page.getByTestId('workspace-home-rail-toggle');

  await expect(shell).not.toHaveClass(/entry--rail-open/);
  await expect(rail).toHaveAttribute('aria-hidden', 'true');
  await expect(expand).toHaveAttribute('aria-expanded', 'false');

  await expand.click();
  await expect(shell).toHaveClass(/entry--rail-open/);
  await expect(rail).not.toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByTestId('entry-nav-home')).toBeVisible();
  // #5517's rail dropped the single "Projects" destination; Design systems is
  // the stable second destination in both the signed-out and team rails.
  await expect(page.getByTestId('entry-nav-design-systems')).toBeVisible();

  // The rail has no in-rail collapse control (the header is chrome-free);
  // the pinned Home tab's toggle folds it back.
  await expect(expand).toHaveAttribute('aria-expanded', 'true');
  await expand.click();
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

test('[P1] home composer plus menu opens project, local code, Figma help, and design system context actions', async ({ page }) => {
  const referenceProject = {
    id: 'ref-home-project',
    name: 'Reference Home Project',
    skillId: null,
    designSystemId: null,
    createdAt: Date.now() - 1_000,
    updatedAt: Date.now(),
    metadata: {
      kind: 'prototype',
      nameSource: 'user',
    },
  };

  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [referenceProject] } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/projects/ref-home-project**', async (route) => {
    await route.fulfill({
      json: {
        project: referenceProject,
        resolvedDir: '/tmp/open-design/reference-home-project',
      },
    });
  });
  await page.route('**/api/dialog/open-folder', async (route) => {
    await route.fulfill({ json: { path: '/tmp/open-design/local-code-home' } });
  });
  await page.route('**/api/dir-exists', async (route) => {
    await route.fulfill({ json: { exists: true } });
  });

  await gotoEntryHome(page);
  const input = page.getByTestId('home-hero-input');

  await page.getByTestId('home-hero-plus-trigger').click();
  // The plus menu is a flat list of actions — it carries no Files/Code/Designs
  // group headings, and design systems are chosen from the composer footer
  // picker rather than from this menu.
  await expect(page.getByTestId('composer-plus-attach')).toBeVisible();
  await expect(page.getByTestId('composer-plus-reference-project')).toBeVisible();
  await expect(page.getByTestId('composer-plus-local-code')).toBeVisible();
  await expect(page.getByTestId('composer-plus-figma')).toBeVisible();
  // …and it does NOT carry the "查看方法" (.fig download guide) row: the menu
  // lists things to ATTACH to the message, and a help article is not one.
  await expect(page.getByTestId('composer-plus-figma-help')).toHaveCount(0);
  await page.getByTestId('composer-plus-reference-project').click();
  const referenceDialog = page.getByRole('dialog', { name: 'Reference another project' });
  await expect(referenceDialog).toBeVisible();
  await expect(referenceDialog.getByRole('option', { name: /Reference Home Project/i })).toHaveAttribute('aria-selected', 'true');
  await referenceDialog.getByRole('button', { name: 'Reference project' }).click();
  await expect(referenceDialog).toHaveCount(0);
  await expect(input).toContainText('Reference Home Project');
  await expect(page.locator('[data-testid^="home-hero-context-workspace-"]', { hasText: 'Reference Home Project' })).toBeVisible();

  await page.getByTestId('home-hero-plus-trigger').click();
  await page.getByTestId('composer-plus-local-code').click();
  await expect(input).toContainText('local-code-home');
  await expect(page.locator('[data-testid^="home-hero-context-workspace-"]', { hasText: 'local-code-home' })).toBeVisible();

  await page.getByTestId('home-hero-plus-trigger').click();
  await page.getByTestId('composer-plus-figma').click();
  const figmaImport = page.getByRole('dialog', { name: 'Import from Figma' });
  await expect(figmaImport).toBeVisible();
  await expect(figmaImport.getByRole('tab', { name: 'Upload .fig' })).toHaveAttribute('aria-selected', 'true');
  await expect(figmaImport.getByRole('tab', { name: 'Figma URL' })).toBeVisible();
  await figmaImport.getByRole('button', { name: 'Close' }).click();
  await expect(figmaImport).toHaveCount(0);

  await page.getByTestId('home-hero-design-system-trigger').click();
  await expect(page.getByTestId('project-ds-picker-popover')).toBeVisible();
});

test('[P1] home Figma import uploads a .fig file into a new project and opens it with the suggested prompt', async ({ page }) => {
  const projectId = 'home-figma-file-project';
  const conversationId = 'conv-home-figma-file';
  const createBodies: Array<Record<string, unknown>> = [];
  const patchBodies: Array<Record<string, unknown>> = [];
  const importBodies: string[] = [];
  const suggestedPrompt = 'Build a responsive page from figma/DESIGN-context.md.';

  await page.route('**/api/projects', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      createBodies.push(body);
      await route.fulfill({
        json: {
          project: {
            id: projectId,
            name: body.name ?? 'Imported from Figma',
            skillId: null,
            designSystemId: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: { kind: 'prototype', nameSource: 'user' },
          },
          conversationId,
        },
      });
      return;
    }
    await route.fallback();
  });
  await routeMinimalProjectWorkspace(page, projectId, conversationId, {
    name: 'Imported from Figma',
    metadata: { kind: 'prototype', nameSource: 'user' },
  });
  await page.route(`**/api/projects/${projectId}/figma/import`, async (route) => {
    importBodies.push(route.request().postData() ?? '');
    await route.fulfill({
      json: {
        snapshotDir: 'figma',
        files: ['figma/tree.json', 'figma/DESIGN-context.md', 'figma/thumbnail.png'],
        inventory: {
          decoded: true,
          source: 'fig-file',
          nodeCount: 12,
          pageCount: 1,
          frameCount: 2,
          componentCount: 3,
          colors: ['#FF5500'],
          fonts: [{ family: 'Inter', styles: ['Regular'] }],
          assetCount: 1,
          hasThumbnail: true,
          warnings: [],
        },
        thumbnailPath: 'figma/thumbnail.png',
        contextPath: 'figma/DESIGN-context.md',
        suggestedPrompt,
        label: 'marketing-home.fig',
      },
    });
  });
  await page.route(`**/api/projects/${projectId}`, async (route) => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>;
      patchBodies.push(body);
      await route.fulfill({
        json: {
          project: {
            id: projectId,
            name: 'Imported from Figma',
            skillId: null,
            designSystemId: null,
            pendingPrompt: body.pendingPrompt ?? null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: { kind: 'prototype', nameSource: 'user' },
          },
        },
      });
      return;
    }
    await route.fallback();
  });

  await gotoEntryHome(page);
  await page.getByTestId('home-hero-plus-trigger').click();
  await page.getByTestId('composer-plus-figma').click();
  const figmaImport = page.getByRole('dialog', { name: 'Import from Figma' });
  await expect(figmaImport).toBeVisible();

  await figmaImport.locator('input[type="file"]').setInputFiles({
    name: 'marketing-home.fig',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('fake fig payload for home import e2e', 'utf8'),
  });
  await expect(figmaImport).toContainText('marketing-home.fig');
  await figmaImport.getByPlaceholder(/Optional: notes/i).fill('Use bold sections.');
  await figmaImport.getByRole('button', { name: 'Import & build' }).click();

  await expect.poll(() => importBodies.length, { timeout: 10_000 }).toBe(1);
  expect(importBodies[0]).toContain('marketing-home.fig');
  expect(importBodies[0]).toContain('Use bold sections.');
  await expect.poll(() => patchBodies.length, { timeout: 10_000 }).toBe(1);
  expect(createBodies[0]?.name).toBe('Imported from Figma');
  expect(createBodies[0]?.pendingPrompt ?? null).toBeNull();
  expect(patchBodies[0]?.pendingPrompt).toBe(suggestedPrompt);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}`));
});

test('[P1] home Figma URL import creates a project with the migration prompt', async ({ page }) => {
  const projectId = 'home-figma-url-project';
  const conversationId = 'conv-home-figma-url';
  const createBodies: Array<Record<string, unknown>> = [];
  const figmaUrl = 'https://figma.com/design/AbCdEf12345/Home-Mockup';
  const notes = 'Keep the hero compact.';

  await page.route('**/api/projects', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      createBodies.push(body);
      await route.fulfill({
        json: {
          project: {
            id: projectId,
            name: body.name ?? 'Imported from Figma',
            skillId: null,
            designSystemId: null,
            pendingPrompt: body.pendingPrompt ?? null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: { kind: 'prototype', nameSource: 'user' },
          },
          conversationId,
        },
      });
      return;
    }
    await route.fallback();
  });
  await routeMinimalProjectWorkspace(page, projectId, conversationId, {
    name: 'Imported from Figma',
    metadata: { kind: 'prototype', nameSource: 'user' },
  });

  await gotoEntryHome(page);
  await page.getByTestId('home-hero-plus-trigger').click();
  await page.getByTestId('composer-plus-figma').click();
  const figmaImport = page.getByRole('dialog', { name: 'Import from Figma' });
  await figmaImport.getByRole('tab', { name: 'Figma URL' }).click();
  await figmaImport.locator('input[type="url"]').fill(figmaUrl);
  await figmaImport.getByPlaceholder(/Optional: notes/i).fill(notes);
  await figmaImport.getByRole('button', { name: 'Import & build' }).click();

  await expect.poll(() => createBodies.length, { timeout: 10_000 }).toBe(1);
  expect(createBodies[0]?.name).toBe('Imported from Figma');
  expect(createBodies[0]?.pendingPrompt).toBe(
    `Migrate the Figma file at ${figmaUrl} into a responsive webpage using its design system. ${notes}`,
  );
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}`));
});

test('[P1] home composer sends referenced workspace context into project creation', async ({ page }) => {
  const createBodies: Array<Record<string, any>> = [];
  const referenceProject = {
    id: 'ref-home-payload',
    name: 'Reference Home Payload',
    skillId: null,
    designSystemId: null,
    createdAt: Date.now() - 1_000,
    updatedAt: Date.now(),
    metadata: {
      kind: 'prototype',
      nameSource: 'user',
    },
  };

  await page.route('**/api/projects', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ json: { projects: [referenceProject] } });
      return;
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, any>;
      createBodies.push(body);
      const id = body.id ?? 'home-context-project';
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
  await page.route('**/api/projects/ref-home-payload**', async (route) => {
    await route.fulfill({
      json: {
        project: referenceProject,
        resolvedDir: '/tmp/open-design/reference-home-payload',
      },
    });
  });
  await page.route('**/api/dialog/open-folder', async (route) => {
    await route.fulfill({ json: { path: '/tmp/open-design/local-code-home-payload' } });
  });
  await page.route('**/api/dir-exists', async (route) => {
    await route.fulfill({ json: { exists: true } });
  });
  await routeRunsAccepted(page);

  await gotoEntryHome(page);
  const input = page.getByTestId('home-hero-input');

  await page.getByTestId('home-hero-plus-trigger').click();
  await page.getByTestId('composer-plus-reference-project').click();
  const referenceDialog = page.getByRole('dialog', { name: 'Reference another project' });
  await expect(referenceDialog.getByRole('option', { name: /Reference Home Payload/i })).toHaveAttribute('aria-selected', 'true');
  await referenceDialog.getByRole('button', { name: 'Reference project' }).click();
  await expect(input).toContainText('Reference Home Payload');

  await page.getByTestId('home-hero-plus-trigger').click();
  await page.getByTestId('composer-plus-local-code').click();
  await expect(input).toContainText('local-code-home-payload');

  await input.fill('Create a project using the referenced workspace context.');
  await Promise.all([
    page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/projects'),
    page.getByTestId('home-hero-submit').click(),
  ]);

  await expect.poll(() => createBodies.length).toBe(1);
  const metadata = createBodies[0]?.metadata as { linkedDirs?: string[] } | undefined;
  expect(metadata?.linkedDirs ?? []).toEqual([
    '/tmp/open-design/reference-home-payload',
    '/tmp/open-design/local-code-home-payload',
  ]);
});

test('[P1] home staged workspace context auto-sends into the first project run', async ({ page }) => {
  const prompt = 'Create a project and immediately use the Home-staged context.';
  const projectId = 'home-autosend-context-project';
  const conversationId = 'conv-home-autosend-context';
  const runBodies: Array<Record<string, unknown>> = [];
  let createdProjectMetadata: Record<string, unknown> = {};
  const referenceProject = {
    id: 'ref-home-autosend',
    name: 'Reference Home Autosend',
    skillId: null,
    designSystemId: null,
    createdAt: Date.now() - 1_000,
    updatedAt: Date.now(),
    metadata: {
      kind: 'prototype',
      nameSource: 'user',
    },
  };

  await page.route('**/api/projects', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({ json: { projects: [referenceProject] } });
      return;
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as { metadata?: Record<string, unknown>; name?: string; pendingPrompt?: string };
      createdProjectMetadata = body.metadata ?? {};
      await route.fulfill({
        json: {
          project: {
            id: projectId,
            name: body.name ?? 'Home autosend context project',
            skillId: null,
            designSystemId: null,
            pendingPrompt: body.pendingPrompt ?? prompt,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: createdProjectMetadata,
          },
          conversationId,
        },
      });
      return;
    }
    await route.fallback();
  });
  await page.route(`**/api/projects/${referenceProject.id}**`, async (route) => {
    await route.fulfill({
      json: {
        project: referenceProject,
        resolvedDir: '/tmp/open-design/reference-home-autosend',
      },
    });
  });
  await page.route(`**/api/projects/${projectId}`, async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        json: {
          project: {
            id: projectId,
            name: 'Home autosend context project',
            skillId: null,
            designSystemId: null,
            pendingPrompt: prompt,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: createdProjectMetadata,
          },
        },
      });
      return;
    }
    if (request.method() === 'PATCH') {
      await route.fulfill({
        json: {
          project: {
            id: projectId,
            name: 'Home autosend context project',
            skillId: null,
            designSystemId: null,
            pendingPrompt: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: createdProjectMetadata,
          },
        },
      });
      return;
    }
    await route.fallback();
  });
  await page.route(`**/api/projects/${projectId}/conversations`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        conversations: [
          {
            id: conversationId,
            projectId,
            title: null,
            sessionMode: 'design',
            messageCount: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      },
    });
  });
  await page.route(`**/api/projects/${projectId}/conversations/${conversationId}/messages`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: { messages: [] } });
  });
  await page.route(`**/api/projects/${projectId}/conversations/${conversationId}/messages/*`, async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: { ok: true } });
  });
  await page.route(`**/api/projects/${projectId}/conversations/${conversationId}/comments`, async (route) => {
    await route.fulfill({ json: { comments: [] } });
  });
  await page.route(`**/api/projects/${projectId}/files`, async (route) => {
    await route.fulfill({ json: { files: [] } });
  });
  await page.route('**/api/live-artifacts**', async (route) => {
    await route.fulfill({ json: { liveArtifacts: [] } });
  });
  const runRequests = await routeSuccessfulRuns(page, {
    bodies: runBodies,
    runId: 'home-autosend-context-run',
  });
  await page.route('**/api/dialog/open-folder', async (route) => {
    await route.fulfill({ json: { path: '/tmp/open-design/local-code-home-autosend' } });
  });
  await page.route('**/api/dir-exists', async (route) => {
    await route.fulfill({ json: { exists: true } });
  });

  await gotoEntryHome(page);
  const input = page.getByTestId('home-hero-input');

  await page.getByTestId('home-hero-plus-trigger').click();
  await page.getByTestId('composer-plus-reference-project').click();
  const referenceDialog = page.getByRole('dialog', { name: 'Reference another project' });
  await expect(referenceDialog.getByRole('option', { name: /Reference Home Autosend/i })).toHaveAttribute('aria-selected', 'true');
  await referenceDialog.getByRole('button', { name: 'Reference project' }).click();
  await expect(input).toContainText('Reference Home Autosend');

  await page.getByTestId('home-hero-plus-trigger').click();
  await page.getByTestId('composer-plus-local-code').click();
  await expect(input).toContainText('local-code-home-autosend');

  await input.fill(prompt);
  await Promise.all([
    page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/projects'),
    page.getByTestId('home-hero-submit').click(),
  ]);

  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}`));
  await runRequests.expectCount(1, { timeout: 15_000 });
  expect(runBodies[0]?.message).toContain(prompt);
  expect(runBodies[0]?.projectId).toBe(projectId);
  expect(runBodies[0]?.conversationId).toBe(conversationId);
  const context = runBodies[0]?.context as { workspaceItems?: Array<{ id?: string; label?: string; absolutePath?: string }> } | undefined;
  expect(context?.workspaceItems ?? []).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'project:ref-home-autosend',
        label: 'Reference Home Autosend',
        absolutePath: '/tmp/open-design/reference-home-autosend',
      }),
      expect.objectContaining({
        id: 'local-code:/tmp/open-design/local-code-home-autosend',
        label: 'local-code-home-autosend',
        absolutePath: '/tmp/open-design/local-code-home-autosend',
      }),
    ]),
  );
  await expect
    .poll(() => page.evaluate((id) => window.sessionStorage.getItem(`od:auto-send-context:${id}`), projectId))
    .toBeNull();
});

test('[P2] home hero exposes the composer footer pickers and the full template set', async ({ page }) => {
  await gotoEntryHome(page);

  await expect(page.getByTestId('home-hero-template-picker')).toBeVisible();
  await expect(page.getByTestId('home-hero-design-system-picker')).toBeVisible();
  await expect(page.getByTestId('working-dir-picker')).toBeVisible();

  // #5517 removed Home's inline scenario rail ("Start from a template… / …or
  // create a blank project") together with its More-shortcuts menu. Every
  // project-type template now lives on the composer footer picker's radial
  // menu, so that ring is the entry point this smoke has to see.
  await expect(page.getByTestId('home-hero-type-tabs')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-shortcuts-trigger')).toHaveCount(0);

  const menu = await openHomeTemplateMenu(page);
  for (const id of ['prototype', 'live-artifact', 'deck', 'image', 'video', 'hyperframes', 'audio']) {
    await expect(menu.getByTestId(`home-hero-template-wedge-${id}`)).toBeVisible();
  }
});

test('[P0] empty home composer submits the active prototype suggestion without explicit plugin authority', async ({ page }) => {
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
  expect(body.pluginId).toBeUndefined();
  expect(body.metadata?.kind).toBe('prototype');
  await expect(page).toHaveURL(/\/projects\//);
});

test('[P1] home session mode toggle switches Ask planning prompts away from design routing', async ({ page }) => {
  await routeProjectCreates(page);
  await routeRunsAccepted(page);
  await gotoEntryHome(page);

  const modeTrigger = page.getByTestId('composer-mode-trigger');
  // Design is the app default and is now represented as an explicit selection.
  await expect(modeTrigger).toHaveAttribute('aria-label', 'Mode: Design');
  await modeTrigger.click();
  // Every mode description is always visible in the open menu (no hover card).
  await expect(page.getByText(/planning, and discussion/i)).toBeVisible();

  await page.getByTestId('composer-mode-menu-chat').click();
  await expect(modeTrigger).toContainText('Ask');
  await page.getByTestId('home-hero-input').fill('Help me plan the IA before designing screens.');

  const askRequestPromise = page.waitForRequest((request) =>
    request.method() === 'POST' && new URL(request.url()).pathname === '/api/projects',
  );
  await page.getByTestId('home-hero-submit').click();
  const askBody = await askRequestPromise.then((request) => request.postDataJSON() as {
    conversationMode?: string;
    pluginId?: string | null;
  });

  expect(askBody.conversationMode).toBe('chat');
  expect(askBody.pluginId ?? null).toBeNull();

  await gotoEntryHome(page);
  await expect(page.getByTestId('composer-mode-trigger')).toHaveAttribute('aria-label', 'Mode: Design');
  await page.getByTestId('home-hero-input').fill('Design the screens from this brief.');

  const designRequestPromise = page.waitForRequest((request) =>
    request.method() === 'POST' && new URL(request.url()).pathname === '/api/projects',
  );
  await page.getByTestId('home-hero-submit').click();
  const designBody = await designRequestPromise.then((request) => request.postDataJSON() as {
    conversationMode?: string;
    pluginId?: string | null;
  });

  expect(designBody.conversationMode).toBe('design');
  expect(typeof designBody.pluginId).toBe('string');
});

test('[P0] home design-system picker carries explicit and cleared selections into project creation', async ({ page }) => {
  await routeHomeDesignSystems(page);
  await routeProjectCreates(page);
  await routeRunsAccepted(page);
  await gotoEntryHome(page);

  await selectHomeDesignSystem(page, 'agentic');
  await pickHomeTemplate(page, 'deck');
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

test('[P1] home design-system picker Create opens design-system creation and starts brand extraction', async ({ page }) => {
  const brandRequests: Array<{ url?: string; locale?: string }> = [];
  await routeHomeDesignSystems(page);
  await routeProjectCreates(page);
  await routeRunsAccepted(page);
  await routeBrandExtraction(page, brandRequests);

  await gotoEntryHome(page);
  // The Brand Kit rail chip went away with the scenario rail (#5517) and it is
  // not one of the template picker's wedges — those are `apply-scenario` chips
  // only. Brand extraction is now reached through the composer design-system
  // picker's Create action, which is the surviving entry to /design-systems/create.
  await page.getByTestId('home-hero-design-system-trigger').click();
  await page.getByTestId('project-ds-picker-create').click();

  await expect(page).toHaveURL(/\/design-systems\/create$/);
  await expect(page.getByRole('heading', { name: /Design a system, in minutes/i })).toBeVisible();

  await page.getByPlaceholder('https://github.com/org/repo').fill('https://acme.example.com');
  await page.getByRole('button', { name: 'Add' }).first().click();
  await page.getByRole('button', { name: /continue to generation/i }).click();

  await expect
    .poll(() => brandRequests.at(-1)?.url)
    .toBe('https://acme.example.com');
  await expect(page).toHaveURL(
    /\/projects\/brand-project-acme\/conversations\/conv-brand-acme$/,
  );
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

  const brandPreview = page.getByTestId('project-ds-picker-preview');
  await expect(brandPreview).toBeVisible();
  await expect(brandPreview.getByTestId('project-ds-picker-preview-kit')).toBeVisible();
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

// The horizontally-scrolling scenario-card rail this used to drive
// (`.home-hero__scenario-cards` + `.home-hero__rail-edge`) was deleted with the
// rest of the inline template rail in #5517; the radial picker is a fixed-size
// ring with no scroll axis, so there is no overflow behaviour left to pin.
//
// The first-run "scroll up to reveal community templates" affordance
// (`home-templates-hint` / `.home-templates-reveal__body` / the Home
// `plugins-home-section`) went with it — `HomeTemplatesReveal` is no longer
// rendered anywhere — so its two specs are gone too.

test('[P2] home template picker offers no clear control and dismisses on Escape or outside click', async ({ page }) => {
  await gotoEntryHome(page);

  await pickHomeTemplate(page, 'deck');

  // Clearing the creation type was removed: no inline × on the pill, no
  // leading Clear row in the menu — a type is only ever swapped for another.
  await expect(page.getByTestId('home-hero-template-reset')).toHaveCount(0);
  await openHomeTemplateMenu(page);
  await expect(page.getByTestId('home-hero-template-radial-clear')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('home-hero-template-menu')).toHaveCount(0);

  await openHomeTemplateMenu(page);
  await page.getByTestId('home-hero-input').click();
  await expect(page.getByTestId('home-hero-template-menu')).toHaveCount(0);
});

test('[P1] home suggestion entry remains retryable after create failures', async ({ page }) => {
  const projectCreateCount = await routeProjectCreates(page, { failFirstCreate: true });
  await routeRunsAccepted(page);
  const runRequests = trackRunRequests(page);
  await gotoEntryHome(page);

  await page.getByTestId('home-hero-submit').click();
  await expect.poll(projectCreateCount).toBe(1);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('home-hero-submit')).toBeEnabled();
  await expect(page.getByRole('alert').filter({ hasText: /Failed to start the run/i })).toBeVisible();
  await runRequests.expectNone({ message: 'failed blank project create should not start a run' });

  await page.getByTestId('home-hero-submit').click();
  await expect.poll(projectCreateCount).toBe(2);
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
});

test('[P2] zh-CN home smoke exposes the localized creation type, design system, working directory, and run entries', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('open-design:locale', 'zh-CN');
    window.localStorage.setItem('open-design:locale-source', 'manual');
  });
  await seedBrowserLocale(page, 'zh-CN');
  await routeHomeDesignSystems(page);
  await gotoEntryHome(page);

  await expect(page.getByTestId('home-hero-input')).toHaveAttribute(
    'title',
    '上传文件、关联设计系统，或描述你想创作的内容',
  );
  await expect(page.getByTestId('home-hero-template-trigger')).toContainText('创作类型');
  await expect(page.getByTestId('home-hero-design-system-trigger')).toContainText('设计体系');
  await expect(page.getByTestId('working-dir-picker')).toContainText('工作目录');
  await expect(page.getByTestId('home-hero-submit')).toHaveAccessibleName('运行');
});

test('[P1] home template picker switches the seeded prototype to another type without a clear action', async ({ page }) => {
  await gotoEntryHome(page);
  // Wait for the fresh-home default binding before opening its menu. Otherwise
  // the binding's reconciliation legitimately replaces the open menu tree
  // while Playwright is trying to act on one of its rows.
  await expect(page.getByTestId('home-hero-template-trigger')).toContainText(
    /UI Mockup|原型/i,
  );

  const menu = await openHomeTemplateMenu(page);
  await expect(menu.getByTestId('home-hero-template-wedge-prototype')).toBeVisible();
  await expect(menu.getByTestId('home-hero-template-wedge-deck')).toBeVisible();

  // Prototype is already the fresh-Home default. Switch to a different item so the
  // test exercises a real selection instead of racing the async default binding
  // by clicking the active menu row while it is being reconciled.
  await menu.getByTestId('home-hero-template-wedge-deck').click();
  await expect(page.getByTestId('home-hero-template-trigger')).toContainText(/Slide deck|幻灯片|投影片/i);

  // Clearing was removed, so switching is the only exit from a chosen type:
  // the pill follows the new one while deferred artifact settings stay out of
  // the footer for both prototype and deck.
  await expect(page.getByTestId('home-hero-footer-option-speakerNotes')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-template-trigger')).toContainText(/Slide deck|幻灯片|投影片/i);
});

// "Blank project" no longer has a Home entry: the "…or create a blank project"
// link went with the scenario rail, and `HomeHero`'s `onStartBlankProject` prop
// is now threaded through but never rendered. The only surviving direct-create
// entry is the Drafts / All projects empty state (`EntryBlankState`), which
// requires a team workspace context this suite does not sign into — so the two
// blank-project specs that drove `home-hero-blank-project` are gone. Creating a
// project from Home without a template is still covered by the empty-composer
// submit spec above and by the new-project modal specs in
// `project-management-flows.test.ts`.

test('[P1] home creation picker switches non-media modes without surfacing media-only footer options', async ({ page }) => {
  await gotoEntryHome(page);

  await expect(page.getByTestId('home-hero-template-picker')).toBeVisible();
  await expect(page.getByTestId('home-hero-footer-option-duration')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-option-audioType')).toHaveCount(0);

  await pickHomeTemplate(page, 'prototype');
  await expect(page.getByTestId('home-hero-design-system-trigger')).toBeVisible();
  await expect(page.getByTestId('home-hero-footer-option-duration')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-option-audioType')).toHaveCount(0);

  await pickHomeTemplate(page, 'live-artifact');
  await expect(page.getByTestId('home-hero-footer-option-duration')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-option-audioType')).toHaveCount(0);

  await pickHomeTemplate(page, 'deck');
  await expect(page.getByTestId('home-hero-design-system-trigger')).toBeVisible();
  await expect(page.getByTestId('home-hero-footer-option-duration')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-option-audioType')).toHaveCount(0);
});

test('[P1] home template picker defers media settings for image, video, hyperframes, and audio', async ({ page }) => {
  await gotoEntryHome(page);

  await pickHomeTemplate(page, 'image');
  await expect(page.getByTestId('home-hero-design-system-trigger')).toBeVisible();
  await expect(page.getByTestId('home-hero-footer-option-ratio')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-option-resolution')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-option-duration')).toHaveCount(0);

  await pickHomeTemplate(page, 'video');
  await expect(page.getByTestId('home-hero-design-system-trigger')).toBeVisible();
  await expect(page.getByTestId('home-hero-footer-option-ratio')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-option-resolution')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-option-duration')).toHaveCount(0);

  await pickHomeTemplate(page, 'hyperframes');
  await expect(page.getByTestId('home-hero-footer-option-ratio')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-option-duration')).toHaveCount(0);

  await pickHomeTemplate(page, 'audio');
  await expect(page.getByTestId('home-hero-footer-option-audioType')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-option-duration')).toHaveCount(0);
});

test('[P1] expired plugin refresh keeps known Home creation types actionable after a real remount', async ({
  page,
}) => {
  await gotoEntryHome(page);
  const initialMenu = await openHomeTemplateMenu(page);
  await expect(initialMenu.getByTestId('home-hero-template-wedge-prototype')).not.toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.keyboard.press('Escape');

  // Age the module-level catalog past its 10-second TTL, then leave Home
  // through an in-app route so HomeView really unmounts while the JS module and
  // its last successful snapshot remain alive.
  await page.evaluate(() => {
    const expiredNow = Date.now() + 11_000;
    Date.now = () => expiredNow;
  });
  let releaseRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let refreshRequests = 0;
  await page.route('**/api/plugins', async (route) => {
    refreshRequests += 1;
    await refreshGate;
    await route.fulfill({ json: { plugins: HOME_PLUGINS } });
  });

  try {
    await ensureRailOpen(page);
    await page.getByTestId('entry-settings-button').click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.goBack();
    await expect(page.getByTestId('home-hero')).toBeVisible();
    await expect.poll(() => refreshRequests).toBeGreaterThan(0);

    // The revalidation is deliberately unresolved. The latest successful
    // catalog must seed the remount synchronously instead of greying every
    // creation type until this request finishes.
    const remountedMenu = await openHomeTemplateMenu(page);
    await expect(
      remountedMenu.getByTestId('home-hero-template-wedge-prototype'),
    ).not.toHaveAttribute('aria-disabled', 'true');
    await expect(
      remountedMenu.getByTestId('home-hero-template-wedge-deck'),
    ).not.toHaveAttribute('aria-disabled', 'true');
  } finally {
    releaseRefresh();
  }
});

test('[P1] home hero example presets update the composer input for prototype and live artifact', async ({ page }) => {
  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');
  await expect(input).toHaveText('');

  await pickHomeTemplate(page, 'prototype');
  await expect(page.getByTestId('home-hero-plugin-presets')).toBeVisible();
  await usePreset(page, 'example-web-prototype');
  await useExamplePreset(page, 'example-web-prototype');
  await expect(input).toHaveText(
    'Build a high-fidelity web prototype for product evaluators using the active project design system from the bundled web prototype seed.',
  );

  await pickHomeTemplate(page, 'live-artifact');
  await expect(page.getByTestId('home-hero-plugin-presets')).toBeVisible();
  await usePreset(page, 'image-template-notion-team-dashboard-live-artifact');
  await useExamplePreset(page, 'image-template-notion-team-dashboard-live-artifact');
  await expect(input).toHaveText('Create a live Notion dashboard artifact.');
});

test('[P1] live dashboard preset sends the active workspace name to plugin apply', async ({ page }) => {
  const personalWorkspace = {
    workspaceId: 'ws-personal',
    workspaceName: 'Personal Workspace',
    workspaceType: 'personal',
    workspaceMemberId: 'wm-personal',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
  } as const;
  const teamWorkspace = {
    workspaceId: 'ws-qa',
    workspaceName: 'QA Team',
    workspaceType: 'team',
    workspaceMemberId: 'wm-qa',
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
  } as const;
  const workspaceContext = (
    selected: typeof personalWorkspace | typeof teamWorkspace,
    includeWorkspaceName = false,
  ) => ({
    workspaceId: selected.workspaceId,
    workspaceType: selected.workspaceType,
    workspaceMemberId: selected.workspaceMemberId,
    role: selected.role,
    memberStatus: 'active' as const,
    lifecycleState: 'active' as const,
    billingState: 'active' as const,
    planId: selected.workspaceType === 'team' ? 'team' : null,
    providerMode: 'platform_credits' as const,
    seatSummary: {
      seatLimit: 10,
      usedSeats: 1,
      availableSeats: 9,
      isSeatFull: false,
    },
    permissions: {
      canInviteMembers: false,
      canManageMembers: false,
      canManageBilling: false,
      canManageAutoRecharge: false,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true,
      canManageSharedResources: false,
    },
    ...(includeWorkspaceName ? { workspaceName: selected.workspaceName } : {}),
  });
  await page.route('**/api/workspace/directory', async (route) => {
    await route.fulfill({
      json: {
        items: [personalWorkspace, teamWorkspace],
        activeWorkspaceId: null,
      },
    });
  });
  await page.route('**/api/workspace/context', async (route) => {
    const workspaceId = route.request().headers()['x-od-workspace-id'];
    const selected = workspaceId === teamWorkspace.workspaceId
      ? teamWorkspace
      : personalWorkspace;
    await route.fulfill({
      json: {
        context: workspaceContext(selected),
      },
    });
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
    const selected = [personalWorkspace, teamWorkspace].find(
      (item) =>
        item.workspaceId === body.workspaceId
        && item.workspaceMemberId === body.workspaceMemberId,
    );
    if (!selected) {
      await route.fulfill({ status: 400, json: { error: 'exact_workspace_scope_required' } });
      return;
    }
    await route.fulfill({
      json: {
        activeWorkspaceId: selected.workspaceId,
        context: workspaceContext(selected, true),
      },
    });
  });

  await gotoEntryHome(page);
  await page.getByTestId('workspace-home-rail-toggle').click();
  await expect(page.getByTestId('workspace-switcher')).toContainText('Personal Workspace');

  await pickHomeTemplate(page, 'live-artifact');
  await usePreset(page, 'example-live-dashboard');
  await expect(page.getByTestId('home-hero-submit')).toBeEnabled();

  // The preset is already bound to Personal. Switching the request-local tab
  // context must replace that context-owned input and invalidate the old apply
  // snapshot before Send — no account-level active Workspace participates.
  await page.getByTestId('workspace-switcher').click();
  await page.getByRole('menuitem', { name: 'QA Team' }).click();
  await expect(page.getByTestId('workspace-switcher')).toContainText('QA Team');

  const applyRequestPromise = page.waitForRequest((request) =>
    request.method() === 'POST'
      && request.url().includes('/api/plugins/example-live-dashboard/apply'),
  );
  await page.getByTestId('home-hero-submit').click();

  const applyRequest = await applyRequestPromise;
  const body = applyRequest.postDataJSON() as {
    inputs?: Record<string, unknown>;
  };
  expect(body.inputs).toMatchObject({
    workspace_name: 'QA Team',
    page_title: 'Team Dashboard',
  });
});

test('[P1] home hero example preset card has no hover overlay and applies the template directly', async ({ page }) => {
  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');
  await expect(input).toHaveText('');

  await pickHomeTemplate(page, 'prototype');
  await expect(page.getByTestId('home-hero-plugin-presets')).toBeVisible();

  const card = page.locator(
    '[data-testid="home-hero-plugin-preset"][data-plugin-id="example-web-prototype"]',
  );
  await card.hover();
  // 2026-07 product decision: drop the hover-revealed Use/Remix overlay
  // (#4861) and restore the #5517 baseline where the whole card is the
  // single click-to-use affordance — no separate button, no preview modal.
  await expect(
    page.getByTestId('home-hero-plugin-preset-use-example-web-prototype'),
  ).toHaveCount(0);
  await expect(page.locator('.home-hero__plugin-preset-actions')).toHaveCount(0);

  await card.click();

  await expect(page.getByTestId('home-hero-active-plugin')).toBeVisible();
  await expect(input).toHaveText(
    'Build a high-fidelity web prototype for product evaluators using the active project design system from the bundled web prototype seed.',
  );
});

test('[P1] home hero deck example preset updates the composer input', async ({ page }) => {
  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');
  await expect(input).toHaveText('');

  await pickHomeTemplate(page, 'deck');
  await expect(page.getByTestId('home-hero-plugin-presets')).toBeVisible();
  await usePreset(page, 'example-simple-deck');
  await useExamplePreset(page, 'example-simple-deck');
  await expect(input).toHaveText(
    'Create a pitch deck for decision makers about quarterly review with 10-15 pages. Speaker notes: include speaker notes. Use the active project design system.',
  );
});

test('[P1] home hero prompt example cards fill the composer for fallback modes', async ({ page }) => {
  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');
  await pickHomeTemplate(page, 'audio');
  await expect(page.getByTestId('home-hero-prompt-examples')).toBeVisible();
  await expect(page.getByTestId('home-hero-plugin-presets')).toHaveCount(0);

  const firstExample = page.getByTestId('home-hero-prompt-example').first();
  const exampleText = (await firstExample.textContent())?.trim();
  expect(exampleText).toBeTruthy();
  await firstExample.click();

  await expect(input).toHaveText(exampleText ?? '');
});

test('[P2] switching the selected hero template swaps preset chrome and keeps the full menu', async ({ page }) => {
  await gotoEntryHome(page);

  await pickHomeTemplate(page, 'prototype');
  await expect(page.getByTestId('home-hero-plugin-presets')).toBeVisible();
  await expect(page.getByTestId('home-hero-design-system-trigger')).toBeVisible();

  // Clearing was removed, so switching is what drops the previous type's
  // footer chrome — audio carries none of prototype's options.
  await pickHomeTemplate(page, 'audio');
  await expect(page.getByTestId('home-hero-footer-option-designSystem')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-option-ratio')).toHaveCount(0);
  await expect(page.getByTestId('home-hero-footer-option-duration')).toHaveCount(0);
  // Every template stays on offer whatever is selected.
  const menu = await openHomeTemplateMenu(page);
  await expect(menu.getByTestId('home-hero-template-wedge-live-artifact')).toBeVisible();
  await expect(menu.getByTestId('home-hero-template-wedge-prototype')).toBeVisible();
});

test('[P1] after clearing one mode, selecting another example updates the composer without leaking prior mode state', async ({ page }) => {
  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');

  await pickHomeTemplate(page, 'prototype');
  await expect(page.getByTestId('home-hero-plugin-presets')).toBeVisible();
  await usePreset(page, 'example-web-prototype');
  await useExamplePreset(page, 'example-web-prototype');
  await expect(input).toHaveText(
    'Build a high-fidelity web prototype for product evaluators using the active project design system from the bundled web prototype seed.',
  );


  await pickHomeTemplate(page, 'live-artifact');
  await expect(page.getByTestId('home-hero-plugin-presets')).toBeVisible();
  await expect(page.getByTestId('home-hero-footer-option-designSystem')).toHaveCount(0);
  await usePreset(page, 'image-template-notion-team-dashboard-live-artifact');
  await useExamplePreset(page, 'image-template-notion-team-dashboard-live-artifact');
  await expect(input).toHaveText('Create a live Notion dashboard artifact.');
});

test('[P1] selecting another example updates the composer input', async ({ page }) => {
  await gotoEntryHome(page);

  const input = page.getByTestId('home-hero-input');

  await pickHomeTemplate(page, 'live-artifact');
  await expect(page.getByTestId('home-hero-plugin-presets')).toBeVisible();
  await usePreset(page, 'image-template-notion-team-dashboard-live-artifact');
  await expect(input).toHaveText('Create a live Notion dashboard artifact.');

  await usePreset(page, 'example-live-artifact');
  await useExamplePreset(page, 'image-template-notion-team-dashboard-live-artifact');
  await expect(input).toHaveText('Create a live Notion dashboard artifact.');

  await useExamplePreset(page, 'example-live-artifact');
  await expect(input).toHaveText('Create refreshable, auditable OpenDesign artifacts.');
});

/**
 * Apply an example preset to the composer. The preset card itself is the
 * single click-to-use affordance (2026-07 removed the separate
 * hover-revealed "Use"/"Remix" overlay buttons and restored the #5517
 * baseline), so this is just a plain click on the card.
 */
async function usePreset(page: Page, pluginId: string) {
  const card = page.locator(
    `[data-testid="home-hero-plugin-preset"][data-plugin-id="${pluginId}"]`,
  );
  await expect(card).toBeVisible();
  await card.click();
}

// Template selection / clearing now lives in `@/playwright/home-hero`
// (`pickHomeTemplate` / `clearHomeTemplate`): both used to be local helpers
// built on the deleted `home-hero-rail-*` cards and `home-hero-active-type-chip`.
//
// Historical alias from when picking a preset was a two-step hover + Use
// button flow (`usePreset` hovered/asserted, `useExamplePreset` clicked);
// kept so existing call-site pairs still resolve without churning every
// caller now that both steps collapse into one click.
async function useExamplePreset(page: Page, pluginId: string) {
  const card = page.locator(
    `[data-testid="home-hero-plugin-preset"][data-plugin-id="${pluginId}"]`,
  );
  await card.click();
}

function activeHeroChip(page: Page) {
  return page.getByTestId('home-hero-active-type-chip').or(page.getByTestId('home-hero-active-plugin'));
}

async function clearActiveChip(page: Page) {
  const activeChip = activeHeroChip(page);
  if ((await activeChip.count()) > 0) {
    const clearPlugin = page.getByRole('button', { name: /Clear active plugin|清除/i });
    if ((await clearPlugin.count()) > 0) {
      await clearPlugin.click();
    } else {
      await activeChip.click();
    }
    await expect(activeHeroChip(page)).toHaveCount(0);
  }
  // The creation type itself has no clear affordance any more (per product);
  // only the active example plugin above is droppable.
  await expect(page.getByTestId('home-hero-type-tabs')).toBeVisible();
}

async function routeMinimalProjectWorkspace(
  page: Page,
  projectId: string,
  conversationId: string,
  options: { name: string; metadata?: Record<string, unknown> },
) {
  const project = {
    id: projectId,
    name: options.name,
    skillId: null,
    designSystemId: null,
    pendingPrompt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: options.metadata ?? { kind: 'prototype', nameSource: 'user' },
  };
  await page.route(`**/api/projects/${projectId}`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { project } });
      return;
    }
    await route.fallback();
  });
  await page.route(`**/api/projects/${projectId}/conversations`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        conversations: [
          {
            id: conversationId,
            projectId,
            title: null,
            sessionMode: 'design',
            messageCount: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      },
    });
  });
  await page.route(`**/api/projects/${projectId}/conversations/${conversationId}/messages`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: { messages: [] } });
  });
  await page.route(`**/api/projects/${projectId}/conversations/${conversationId}/comments`, async (route) => {
    await route.fulfill({ json: { comments: [] } });
  });
  await page.route(`**/api/projects/${projectId}/files`, async (route) => {
    await route.fulfill({ json: { files: [] } });
  });
  await page.route('**/api/live-artifacts**', async (route) => {
    await route.fulfill({ json: { liveArtifacts: [] } });
  });
}

async function routeRunsAccepted(page: Page) {
  await routeSuccessfulRuns(page, {
    runId: 'home-run-smoke',
    eventBody: successfulRunEventBody(),
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
  return () => createCount;
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
