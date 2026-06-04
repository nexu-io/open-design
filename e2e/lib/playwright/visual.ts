import { expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fulfillAgentsRoute } from './mock-factory.js';

const STORAGE_KEY = 'open-design:config';
const GITHUB_STARS_STORAGE_KEY = 'open-design:gh-stars';
const VISUAL_STYLE_ID = 'od-visual-stability-style';
// Keep this exact-route mock narrow so unrelated GitHub UI still behaves normally.
const VISUAL_GITHUB_REPO_API = 'https://api.github.com/repos/nexu-io/open-design';
const VISUAL_GITHUB_STARS = 40_000;

const VISUAL_CONFIG = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  agentId: 'mock',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  agentModels: {},
  privacyDecisionAt: 1,
  telemetry: { metrics: false, content: false, artifactManifest: false },
} as const;

const MOCK_AGENT = {
  id: 'mock',
  name: 'Mock Agent',
  bin: 'mock-agent',
  available: true,
  version: 'test',
  models: [{ id: 'default', label: 'Default' }],
} as const;

const VISUAL_PROJECTS = [
  {
    id: 'visual-project-launchpad',
    name: 'Launchpad dashboard',
    skillId: null,
    designSystemId: 'agentic',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_050_000,
    metadata: { kind: 'prototype' },
    status: { label: 'Ready', tone: 'success' },
  },
  {
    id: 'visual-project-brand-kit',
    name: 'Brand kit refresh',
    skillId: null,
    designSystemId: 'airbnb',
    createdAt: 1_700_000_100_000,
    updatedAt: 1_700_000_150_000,
    metadata: { kind: 'image' },
    status: { label: 'Needs input', tone: 'warning' },
  },
] as const;

type VisualProject = (typeof VISUAL_PROJECTS)[number];

type VisualPageOptions = {
  projects?: readonly VisualProject[];
};

const VISUAL_PLUGINS = [
  makeVisualPlugin({
    id: 'visual-prototype-starter',
    title: 'Prototype Starter',
    description: 'Create polished product prototypes from a short brief.',
    mode: 'prototype',
    taskKind: 'new-generation',
    featured: true,
    tags: ['web', 'prototype'],
    query: 'Design a {{topic}} prototype.',
  }),
  makeVisualPlugin({
    id: 'visual-deck-writer',
    title: 'Deck Writer',
    description: 'Turn strategy notes into a presentation deck.',
    mode: 'deck',
    taskKind: 'new-generation',
    tags: ['slides'],
    query: 'Draft a {{topic}} deck.',
    previewEntry: 'preview.html',
  }),
  makeVisualPlugin({
    id: 'visual-video-storyboard',
    title: 'Video Storyboard',
    description: 'Storyboard a video concept with scenes and voiceover beats.',
    mode: 'video',
    taskKind: 'new-generation',
    featured: true,
    tags: ['video'],
    query: 'Create a {{topic}} video storyboard.',
  }),
  makeVisualPlugin({
    id: 'visual-figma-importer',
    title: 'Figma Importer',
    description: 'Migrate a Figma frame into an editable Open Design project.',
    mode: 'prototype',
    taskKind: 'figma-migration',
    tags: ['migration'],
  }),
] as const;

const VISUAL_DESIGN_SYSTEMS = [
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

export async function configureVisualPage(page: Page, options: VisualPageOptions = {}): Promise<void> {
  const projects = options.projects ?? VISUAL_PROJECTS;

  await page.addInitScript(([key, config, githubStarsKey, githubStarsCount]) => {
    window.localStorage.setItem(key, JSON.stringify(config));
    window.localStorage.setItem(
      githubStarsKey,
      JSON.stringify({ count: githubStarsCount, ts: Date.now() }),
    );
  }, [STORAGE_KEY, VISUAL_CONFIG, GITHUB_STARS_STORAGE_KEY, VISUAL_GITHUB_STARS] as const);

  await page.route('**/api/app-config', async (route) => {
    await fulfillGet(route, { config: VISUAL_CONFIG });
  });

  await page.route('**/api/agents**', async (route) => {
    await fulfillAgentsRoute(route, [MOCK_AGENT]);
  });

  await page.route(VISUAL_GITHUB_REPO_API, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    await route.fulfill({
      json: { stargazers_count: VISUAL_GITHUB_STARS },
    });
  });

  await page.route('**/api/projects', async (route) => {
    await fulfillGet(route, { projects });
  });

  await page.route('**/api/routines', async (route) => {
    await fulfillGet(route, { routines: [] });
  });

  await page.route('**/api/automation-templates', async (route) => {
    await fulfillGet(route, { templates: [] });
  });

  await page.route('**/api/automation-proposals?status=pending-review', async (route) => {
    await fulfillGet(route, { proposals: [] });
  });

  await page.route('**/api/automation-source-packets?limit=3', async (route) => {
    await fulfillGet(route, { packets: [] });
  });

  await page.route('**/api/plugins', async (route) => {
    await fulfillGet(route, { plugins: VISUAL_PLUGINS });
  });

  await page.route('**/api/plugins/*/preview', async (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2) ?? 'plugin');
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body><main><h1>${escapeHtml(id)} preview</h1></main></body></html>`,
    });
  });

  await page.route('**/api/marketplaces', async (route) => {
    await fulfillGet(route, { marketplaces: [] });
  });

  await page.route('**/api/design-systems', async (route) => {
    await fulfillGet(route, { designSystems: VISUAL_DESIGN_SYSTEMS });
  });

  await page.route('**/api/design-systems/*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) ?? 'agentic');
    const system = VISUAL_DESIGN_SYSTEMS.find((item) => item.id === id) ?? VISUAL_DESIGN_SYSTEMS[0];
    await route.fulfill({
      json: {
        designSystem: {
          ...system,
          body: `# ${system.title}\n\nDesign guidance for ${system.title}.`,
        },
      },
    });
  });

  await page.route('**/api/design-systems/*/showcase', async (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2) ?? 'design-system');
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body><main><h1>${escapeHtml(id)} showcase</h1></main></body></html>`,
    });
  });

  await page.route('**/api/design-systems/*/preview', async (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2) ?? 'design-system');
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body><main><h1>${escapeHtml(id)} tokens</h1></main></body></html>`,
    });
  });

  await page.route('**/api/skills', async (route) => {
    await fulfillGet(route, { skills: [] });
  });

  await page.route('**/api/design-templates', async (route) => {
    await fulfillGet(route, { designTemplates: [] });
  });

  await page.route('**/api/prompt-templates', async (route) => {
    await fulfillGet(route, { promptTemplates: [] });
  });

  await page.route('**/api/connectors', async (route) => {
    await fulfillGet(route, { connectors: [] });
  });

  await page.route('**/api/mcp/servers', async (route) => {
    await fulfillGet(route, { servers: [], templates: [] });
  });

  await page.addInitScript(([styleId]) => {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
      }
    `;
    document.head.appendChild(style);
  }, [VISUAL_STYLE_ID] as const);
}

export async function waitForVisualReady(page: Page): Promise<void> {
  await page.getByText('Loading Open Design…').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

export async function waitForVisualProjects(page: Page, projects: readonly VisualProject[]): Promise<void> {
  if (projects.length === 0) {
    await expect(page.getByTestId('recent-projects-strip')).toHaveCount(0);
    return;
  }

  await expect(page.getByText(projects[0]?.name ?? '')).toBeVisible();
}

export async function gotoVisualHome(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForVisualReady(page);
}

export async function waitForVisualFonts(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

export async function captureVisual(page: Page, name: string): Promise<string> {
  const outputDir = path.resolve(process.env.OD_VISUAL_OUTPUT_DIR || 'ui/reports/visual-screenshots');
  const safeName = sanitizeVisualName(name);
  const outputPath = path.join(outputDir, `${safeName}.png`);
  await mkdir(outputDir, { recursive: true });
  await page.screenshot({ path: outputPath, animations: 'disabled', caret: 'hide' });
  return outputPath;
}

function sanitizeVisualName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'visual';
}

async function fulfillGet(route: Route, json: unknown): Promise<void> {
  if (route.request().method() !== 'GET') {
    await route.continue();
    return;
  }

  await route.fulfill({ json });
}

function makeVisualPlugin(input: {
  id: string;
  title: string;
  description: string;
  mode: string;
  taskKind: string;
  featured?: boolean;
  tags?: string[];
  query?: string;
  previewEntry?: string;
}) {
  return {
    id: input.id,
    title: input.title,
    version: '1.0.0',
    trust: 'trusted',
    sourceKind: 'local',
    source: `/tmp/${input.id}`,
    capabilitiesGranted: ['prompt:inject'],
    fsPath: `/tmp/${input.id}`,
    installedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    manifest: {
      name: input.id,
      title: input.title,
      version: '1.0.0',
      description: input.description,
      tags: input.tags ?? [],
      od: {
        kind: 'scenario',
        taskKind: input.taskKind,
        mode: input.mode,
        ...(input.featured ? { featured: true } : {}),
        ...(input.query
          ? {
              useCase: {
                query: { en: input.query },
              },
            }
          : {}),
        ...(input.previewEntry
          ? {
              preview: {
                type: 'html',
                entry: input.previewEntry,
              },
            }
          : {}),
      },
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
