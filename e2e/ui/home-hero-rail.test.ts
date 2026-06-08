import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.describe.configure({ timeout: 30_000 });

const STORAGE_KEY = 'open-design:config';
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

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /not now/i }).click();
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

  await page.route('**/api/agents', async (route) => {
    await route.fulfill({
      json: {
        agents: [
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

test('[P2] home hero rail shows the current creation chips and More shortcuts', async ({ page }) => {
  await gotoEntryHome(page);

  await expect(page.getByTestId('entry-star-badge')).toContainText('51.6K');
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
