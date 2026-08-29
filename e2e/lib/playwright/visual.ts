import { expect } from '@playwright/test';
import type { Locator, Page, Route } from '@playwright/test';
import type { Project } from '@open-design/contracts';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fulfillAgentsRoute } from './mock-factory.js';
import { openSettingsDialog } from './amr.js';
import { T } from '@/timeouts';

const STORAGE_KEY = 'open-design:config';
const GITHUB_STARS_STORAGE_KEY = 'open-design:gh-stars';
const VISUAL_STABILITY_STORAGE_KEY = 'open-design:visual-stability';
const VISUAL_STYLE_ID = 'od-visual-stability-style';
// Keep this exact-route mock narrow so unrelated GitHub UI still behaves normally.
const VISUAL_GITHUB_REPO_API = 'https://api.github.com/repos/nexu-io/open-design';
const VISUAL_GITHUB_STARS = 40_000;

type VisualConfig = {
  mode: 'daemon' | 'api';
  apiKey: string;
  baseUrl: string;
  model: string;
  apiProtocol?: 'anthropic' | 'openai' | 'azure' | 'google' | 'ollama' | 'senseaudio' | 'aihubmix';
  agentId: string | null;
  skillId: string | null;
  designSystemId: string | null;
  onboardingCompleted: boolean;
  agentModels: Record<string, { model?: string; reasoning?: string }>;
  agentCliEnv?: Record<string, Record<string, string>>;
  privacyDecisionAt: number | null;
  telemetry: { metrics?: boolean; content?: boolean; artifactManifest?: boolean };
};

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
} satisfies VisualConfig;

const visualStableTimeoutMs = 10_000;
const visualStableFrameCount = 3;

function waitForVisualTimeout(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, visualStableTimeoutMs);
  });
}

const MOCK_AGENT = {
  id: 'mock',
  name: 'Mock Agent',
  bin: 'mock-agent',
  available: true,
  version: 'test',
  models: [{ id: 'default', label: 'Default' }],
} as const;

export const VISUAL_CLI_AGENTS = [
  {
    id: 'claude',
    name: 'Claude Code',
    bin: 'claude',
    available: true,
    version: '2.1.31',
    models: [
      { id: 'default', label: 'Default (CLI config)' },
      { id: 'sonnet-alias', label: 'Sonnet (alias)' },
      { id: 'opus-alias', label: 'Opus (alias)' },
      { id: 'haiku-alias', label: 'Haiku (alias)' },
      { id: 'sonnet-nightly', label: 'Sonnet Nightly' },
      { id: 'opus-nightly', label: 'Opus Nightly' },
      { id: 'sonnet-4.5', label: 'Sonnet 4.5' },
      { id: 'opus-4.5', label: 'Opus 4.5' },
    ],
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    bin: 'codex',
    available: true,
    version: '0.134.0',
    models: [
      { id: 'default', label: 'Default (CLI config)' },
      { id: 'gpt-5.4', label: 'GPT-5.4' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4-Mini' },
      { id: 'gpt-5.3-codex-spark', label: 'GPT-5.3-Codex-Spark' },
      { id: 'gpt-5.3', label: 'GPT-5.3' },
      { id: 'gpt-5.2', label: 'GPT-5.2' },
    ],
  },
] as const;

export const VISUAL_AMR_AGENT = {
  id: 'amr',
  name: 'OpenDesign',
  bin: 'vela',
  available: true,
  version: '0.1.0',
  models: [
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    { id: 'deepseek-v3.2', label: 'DeepSeek V3.2' },
    { id: 'glm-5.1', label: 'GLM 5.1' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
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
    status: { value: 'succeeded' },
  },
  {
    id: 'visual-project-brand-kit',
    name: 'Brand kit refresh',
    skillId: null,
    designSystemId: 'airbnb',
    createdAt: 1_700_000_100_000,
    updatedAt: 1_700_000_150_000,
    metadata: { kind: 'image' },
    status: { value: 'awaiting_input' },
  },
] as const;

export type VisualProject = Project;

/** The single conversation every workspace capture opens into. */
const VISUAL_CONVERSATION = {
  id: 'visual-conversation-launchpad',
  projectId: 'visual-project-launchpad',
  title: null,
  messageCount: 0,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_050_000,
} as const;

const VISUAL_PROJECT_FILE_HTML =
  '<!doctype html><html><body><main><h1>Visual CSS Smoke</h1><p>Workspace preview remains framed.</p></main></body></html>';

const VISUAL_PROJECT_FILES = [
  {
    name: 'index.html',
    path: 'index.html',
    type: 'file',
    size: VISUAL_PROJECT_FILE_HTML.length,
    mtime: 1_700_000_200_000,
    kind: 'html',
    mime: 'text/html; charset=utf-8',
    artifactKind: 'html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Visual CSS Smoke',
      entry: 'index.html',
      renderer: 'html',
      status: 'complete',
      exports: ['html', 'pdf', 'zip'],
      primary: true,
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:00.000Z',
      metadata: { identifier: 'visual-css-smoke', artifactType: 'text/html', inferred: false },
    },
  },
] as const;

type VisualPageOptions = {
  projects?: readonly VisualProject[];
  config?: Partial<VisualConfig>;
  agents?: readonly unknown[];
  /** Signed-in by default so non-auth visual surfaces can reach Home. */
  velaLoggedIn?: boolean;
};

type VisualVelaAccountOptions = {
  profile?: string;
  plan?: string;
  balanceUsd?: string;
  email?: string;
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
    description: 'Migrate a Figma frame into an editable OpenDesign project.',
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
  const config = { ...VISUAL_CONFIG, ...(options.config ?? {}) };
  const agents = options.agents ?? [MOCK_AGENT];

  // Screenshot-level `animations: 'disabled'` only fast-forwards CSS motion.
  // The home wordmark and placeholder carousel are driven by requestAnimationFrame
  // and timers, so make them take the product's deterministic static fallback too.
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // Visual coverage is a web rendering contract, not a daemon behavior lane.
  // Register these first so the narrower fixtures below win; every other
  // daemon-owned request terminates at a deterministic browser-side boundary.
  for (const pattern of ['**/api/**', '**/artifacts/**', '**/frames/**', '**/powered/**']) {
    await page.route(pattern, async (route) => {
      await route.fulfill({ status: 404, json: { error: 'not mocked by visual coverage' } });
    });
  }

  await page.addInitScript(([key, config, githubStarsKey, githubStarsCount, visualStabilityKey]) => {
    window.localStorage.setItem(key, JSON.stringify(config));
    window.localStorage.setItem(
      githubStarsKey,
      JSON.stringify({ count: githubStarsCount, ts: Date.now() }),
    );
    window.localStorage.setItem(visualStabilityKey, '1');
  }, [STORAGE_KEY, config, GITHUB_STARS_STORAGE_KEY, VISUAL_GITHUB_STARS, VISUAL_STABILITY_STORAGE_KEY] as const);

  await page.route('**/api/app-config', async (route) => {
    await fulfillGet(route, { config });
  });

  await page.route('**/api/agents**', async (route) => {
    await fulfillAgentsRoute(route, agents);
  });

  await page.route('**/api/test/connection', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }

    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 1,
        model: config.model,
        sample: 'Visual connection check.',
      },
    });
  });

  await page.route('**/api/provider/models', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }

    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 1,
        models: [
          { id: 'gpt-4o', label: 'GPT-4o' },
          { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
          { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
        ],
      },
    });
  });

  await page.route('**/api/health', async (route) => {
    await fulfillGet(route, { ok: true });
  });

  await page.route('**/api/community/discord', async (route) => {
    await fulfillGet(route, {
      onlineCount: 0,
      memberCount: 0,
    });
  });

  await page.route('**/api/integrations/vela/status', async (route) => {
    const loggedIn = options.velaLoggedIn ?? true;
    await fulfillGet(
      route,
      loggedIn
        ? {
            loggedIn: true,
            loginInFlight: false,
            profile: 'visual',
            configPath: '/tmp/.amr/config.json',
            user: { id: 'visual-user', email: 'visual@example.com' },
          }
        : {
            loggedIn: false,
            profile: 'local',
            configPath: '/tmp/.amr/config.json',
            user: null,
          },
    );
  });

  await page.route('**/api/media/providers/aihubmix/models**', async (route) => {
    await fulfillGet(route, { models: [] });
  });

  await page.route(VISUAL_GITHUB_REPO_API, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }

    await route.fulfill({
      json: { stargazers_count: VISUAL_GITHUB_STARS },
    });
  });

  await page.route('**/api/projects', async (route) => {
    await fulfillGet(route, { projects });
  });

  // A project deep link no longer borrows the shell's ambient Workspace. If
  // the project list has not settled first, App bootstraps the route through
  // an authoritative scope witness followed by the matching project detail.
  // Keep those reads inside the visual fixture instead of letting the generic
  // API catch-all turn normal list/bootstrap scheduling into a 404 race.
  await page.route('**/api/projects/*/workspace-scope', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const projectId = decodeURIComponent(
      new URL(route.request().url()).pathname.split('/').at(-2) ?? '',
    );
    const project = projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      await route.fulfill({ status: 404, json: { error: `unknown project ${projectId}` } });
      return;
    }
    await route.fulfill({
      json: {
        scope: {
          kind: 'unbound',
          projectId,
          workspaceId: null,
          context: null,
        },
      },
    });
  });

  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const projectId = decodeURIComponent(
      new URL(route.request().url()).pathname.split('/').at(-1) ?? '',
    );
    const project = projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      await route.fulfill({ status: 404, json: { error: `unknown project ${projectId}` } });
      return;
    }
    await route.fulfill({ json: { project: { ...project, workspaceId: null } } });
  });

  // The conversation boundary. `ProjectView` renders `ChatPane` — and therefore
  // the composer every workspace capture waits for — only once a conversation
  // resolves (`activeConversationId || conversationLoadError`), and both
  // `listConversations` and `createConversation` swallow a non-ok response
  // (`[]` / `null`) rather than surfacing an error. So while the catch-all above
  // answered `/conversations` with 404, the project opened with no conversation
  // AND no load error, ChatPane never mounted, and every capture that navigates
  // into the workspace died on `chat-composer` not existing. The catch-all's own
  // contract is that "every other daemon-owned request terminates at a
  // deterministic browser-side boundary" — this is that boundary for
  // conversations, which the catch-all closed without supplying.
  await page.route('**/api/projects/*/conversations', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { conversations: [VISUAL_CONVERSATION] } });
      return;
    }
    if (method === 'POST') {
      await route.fulfill({ json: { conversation: VISUAL_CONVERSATION } });
      return;
    }
    await route.fallback();
  });

  await page.route('**/api/projects/*/conversations/*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ json: { conversation: VISUAL_CONVERSATION } });
      return;
    }
    await fulfillGet(route, { conversation: VISUAL_CONVERSATION });
  });

  await page.route('**/api/projects/*/conversations/*/messages', async (route) => {
    await fulfillGet(route, { messages: [] });
  });

  await page.route('**/api/projects/*/files', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await fulfillGet(route, { files: VISUAL_PROJECT_FILES });
  });

  await page.route('**/api/projects/*/raw/*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: VISUAL_PROJECT_FILE_HTML,
    });
  });

  await page.route('**/api/projects/*/upload', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        files: [
          {
            name: 'visual-reference.txt',
            originalName: 'visual-reference.txt',
            path: 'visual-reference.txt',
            size: 55,
          },
        ],
      },
    });
  });

  await page.route('**/api/plugins', async (route) => {
    await fulfillGet(route, { plugins: VISUAL_PLUGINS });
  });

  // Single-plugin GET. #5517 turned plugin details into the `/marketplace/<id>`
  // route, and `PluginDetailView` refetches the record by id instead of reusing
  // the list payload the catalog already holds — so a fixture that mocks only
  // the list renders the detail surface's "Failed to load plugin: HTTP 404"
  // branch. The route returns the record unwrapped, matching the daemon.
  // `*` never spans `/`, so this cannot shadow `*/preview` or `*/apply`.
  await page.route('**/api/plugins/*', async (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) ?? '');
    const plugin = VISUAL_PLUGINS.find((candidate) => candidate.id === id);
    if (!plugin) {
      await route.fulfill({ status: 404, json: { error: `unknown plugin ${id}` } });
      return;
    }
    await fulfillGet(route, plugin);
  });

  await page.route('**/api/plugins/*/preview', async (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2) ?? 'plugin');
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body><main><h1>${escapeHtml(id)} preview</h1></main></body></html>`,
    });
  });

  await page.route('**/api/plugins/*/apply', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2) ?? 'plugin');
    await route.fulfill({
      json: {
        ok: true,
        query: `Design a ${id} concept.`,
        contextItems: [],
        inputs: [],
        assets: [],
        mcpServers: [],
        projectMetadata: {},
        trust: 'trusted',
        capabilitiesGranted: ['prompt:inject'],
        capabilitiesRequired: ['prompt:inject'],
        appliedPlugin: {
          snapshotId: `visual-snapshot-${id}`,
          pluginId: id,
          pluginVersion: '1.0.0',
          manifestSourceDigest: 'a'.repeat(64),
          inputs: {},
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
      },
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
      await route.fallback();
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
    const installStabilityStyle = () => {
      if (document.getElementById(styleId) != null) return;
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
        overflow-anchor: none !important;
      }
    `;
      (document.head ?? document.documentElement).appendChild(style);
    };

    installStabilityStyle();
    document.addEventListener('DOMContentLoaded', installStabilityStyle, { once: true });
  }, [VISUAL_STYLE_ID] as const);
}

export async function mockSignedInVelaAccount(
  page: Page,
  options: VisualVelaAccountOptions = {},
): Promise<void> {
  const profile = options.profile ?? 'test';
  const plan = options.plan ?? 'plus';
  const balanceUsd = options.balanceUsd ?? '247.51';
  const email = options.email ?? 'leaf@example.com';
  const fetchedAt = '2026-06-25T03:59:00.000Z';

  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        loggedIn: true,
        loginInFlight: false,
        profile,
        user: { id: 'u1', email },
        account: { plan, balanceUsd },
        configPath: '/home/test/.amr/config.json',
      }),
    });
  });

  await page.route('**/api/integrations/vela/wallet**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'available',
        profile,
        user: { id: 'u1', email, plan },
        balanceUsd,
        updatedAt: fetchedAt,
        fetchedAt,
        stale: false,
        source: 'vela_api',
      }),
    });
  });
}

export async function waitForVisualReady(page: Page): Promise<void> {
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.xlong });
  await expect(page.getByTestId('home-hero')).toBeVisible({ timeout: T.medium });
  await expect(page.getByTestId('home-hero-input')).toBeVisible({ timeout: T.medium });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

export async function waitForVisualProjects(page: Page, projects: readonly VisualProject[]): Promise<void> {
  if (projects.length === 0) {
    await expect(page.getByTestId('recent-projects-strip')).toHaveCount(0);
    return;
  }

  await expect(
    page.getByTestId('recent-projects-strip').getByText(projects[0]?.name ?? '', { exact: true }),
  ).toBeVisible();
}

export async function gotoVisualHome(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForVisualReady(page);
}

export async function gotoVisualWorkspace(page: Page): Promise<void> {
  // Project workspace captures navigate immediately after Home becomes
  // visible. Wait on the catalog they consume so slower CI scheduling cannot
  // leave the route guard and deep-link bootstrap racing the mocked list.
  await waitForVisualProjects(page, VISUAL_PROJECTS);
  await page.goto('/projects/visual-project-launchpad', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });
  await expect(page).toHaveURL(/\/projects\/visual-project-launchpad/, { timeout: T.medium });
  await expect(page.getByTestId('chat-composer')).toBeVisible({ timeout: T.medium });
  await expect(page.getByTestId('chat-composer-input')).toBeVisible({ timeout: T.medium });
  await expect(page.getByTestId('file-workspace')).toBeVisible({ timeout: T.medium });
  await prepareVisualWorkspaceFileList(page);
}

/**
 * Drive the workspace onto its Design Files tab, converging on that state
 * instead of deciding once whether to click.
 *
 * `aria-selected` and the design-file rows both come off FileWorkspace's single
 * `activeTab === DESIGN_FILES_TAB` expression, so probing the rows to decide
 * whether to click was never asking the wrong question — the problem is that the
 * answer can still change after the probe. The tab is *persisted*
 * (`setPersistedActive`) and restored asynchronously, so a restore that lands
 * after this helper's one click puts another tab back, and a one-shot helper has
 * nothing left to re-click. Under the visual lane — fully parallel, `retries: 0`
 * — that surfaced as a single capture timing out for 10s on `aria-selected`
 * while its siblings, running this identical prelude, all passed.
 *
 * Clicking is safe to repeat: the tab's handler just sets the same active id.
 */
export async function activateVisualDesignFilesTab(page: Page): Promise<void> {
  const tab = page.getByTestId('design-files-tab');
  await expect(tab).toBeVisible({ timeout: T.medium });
  await expect(async () => {
    if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: T.short });
  }).toPass({ timeout: T.long });
}

export async function prepareVisualWorkspaceFileList(page: Page): Promise<void> {
  await activateVisualDesignFilesTab(page);
  // No pages dropdown to drive: 023937ef4 replaced the tab strip's pages
  // menu with a plain Design Files tab (#5517), deleting
  // `workspace-pages-menu-trigger` from the app and this helper alike. The
  // main sync resurrected the driving code here; the trigger stays deleted.
  await expect(page.getByTestId('design-file-row-index.html')).toBeVisible();
  await expect(page.getByTestId('design-file-preview')).toHaveCount(0);
  await resetVisualScroll(page);
  await waitForVisualStable(page);
}

export async function prepareVisualWorkspacePreview(page: Page): Promise<void> {
  await prepareVisualWorkspaceFileList(page);
  // #5517 (023937ef4) deleted the design-file preview pane: the card grid IS
  // the preview surface now, so a single click on the row's primary open
  // target lands straight on the rendered artifact — there is no intermediate
  // preview card with an "Open" button to click through.
  const fileRow = page.getByTestId('design-file-row-index.html');
  await fileRow.getByRole('button').first().click();
  await expect(
    page.frameLocator('[data-testid="artifact-preview-frame"]').getByRole('heading', {
      name: 'Visual CSS Smoke',
    }),
  ).toBeVisible();
  await resetVisualScroll(page);
  await waitForVisualStable(page);
}

export async function prepareVisualAvatarMenu(page: Page): Promise<Locator> {
  await prepareVisualWorkspaceFileList(page);
  const menu = await openAvatarMenu(page);
  // The composer popover is a model picker: the OpenDesign account card is
  // conditional (OpenDesign has to be installed), so gate on the model list.
  await expect(menu.locator('.avatar-model-section').first()).toBeVisible();
  await expect(page.getByTestId('design-files-tab')).toHaveAttribute('aria-selected', 'true');
  await expect(menu.locator('.avatar-item').first()).toBeVisible();
  await expect(page.getByTestId('design-file-row-index.html')).toBeVisible();
  await waitForVisualStable(page);
  return menu;
}

export async function prepareVisualSettingsDialog(page: Page): Promise<Locator> {
  await prepareVisualWorkspaceFileList(page);
  const dialog = await openSettingsDetailsFromHeader(page);
  // Assert the section nav, not a heading: the surface's own <h2> is consumed as
  // its accessible name via aria-labelledby, and opening from a project lands on
  // the execution section whose heading reads "Models & providers" — neither
  // matches a /Settings|General|Execution mode/ probe. The nav is what proves
  // Settings opened, in either presentation. (Same check critical-smoke uses.)
  await expect(dialog.getByTestId('settings-nav-execution')).toBeVisible();
  await waitForVisualStable(page);
  return dialog;
}

export async function openAvatarMenu(page: Page): Promise<Locator> {
  await page.locator('.avatar-menu .avatar-agent-trigger').click();
  const menu = page.locator('.avatar-popover[role="dialog"]');
  await expect(menu).toBeVisible();
  return menu;
}

export async function openSettingsDetailsFromHeader(page: Page): Promise<Locator> {
  // Delegates to amr.ts's `openSettingsDialog`, which already encodes
  // everything this local copy was missing and getting wrong:
  //
  //   - It expands the nav rail first. #5517 moved the entry settings chip into
  //     the rail footer, and a collapsed rail is `inert` + `aria-hidden`, so the
  //     chip is present but invisible to `getByRole` and even a programmatic
  //     `element.click()` is a no-op. This copy never opened the rail, so none
  //     of its triggers was ever visible and every capture died on the same
  //     `.settings-icon-btn` line.
  //   - It matches the surface with bare `.modal-settings`, the one class both
  //     the modal and the #5517 `presentation="page"` route share, instead of
  //     pinning `[role="dialog"]` which the page presentation never sets.
  //   - It ends the trigger chain on the settings aria-label rather than
  //     `.settings-icon-btn`, which the entry surface does not carry.
  //
  // It also clicks `entry-settings-open-details`, so it is a superset of what
  // this helper did. Kept as a named re-export so visual-workspace.test.ts
  // keeps reading in terms of the header, and so there is exactly one settings
  // opener rather than a third variant.
  return openSettingsDialog(page);
}
export async function waitForVisualFonts(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

export async function resetVisualScroll(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    for (const element of document.querySelectorAll<HTMLElement>(
      '.entry-main--scroll, .workspace, .file-workspace, [data-testid="file-workspace"]',
    )) {
      element.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  });
}

export async function captureVisual(page: Page, name: string): Promise<string> {
  const outputDir = path.resolve(process.env.OD_VISUAL_OUTPUT_DIR || 'ui/reports/visual-screenshots');
  const safeName = sanitizeVisualName(name);
  const outputPath = path.join(outputDir, `${safeName}.png`);
  await mkdir(outputDir, { recursive: true });
  await waitForVisualStable(page);
  await page.screenshot({ path: outputPath, animations: 'disabled', caret: 'hide' });
  return outputPath;
}

export async function captureVisualTarget(
  page: Page,
  name: string,
  target: Locator | readonly Locator[],
  options: { padding?: number } = {},
): Promise<string> {
  const outputDir = path.resolve(process.env.OD_VISUAL_OUTPUT_DIR || 'ui/reports/visual-screenshots');
  const safeName = sanitizeVisualName(name);
  const outputPath = path.join(outputDir, `${safeName}.png`);
  const targets = Array.isArray(target) ? target : [target];
  await mkdir(outputDir, { recursive: true });
  await waitForVisualStable(page);

  const viewport = page.viewportSize();
  if (viewport == null) {
    throw new Error(`Cannot capture visual target ${name}: page has no viewport`);
  }

  const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (const locator of targets) {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    if (box == null || box.width <= 0 || box.height <= 0) {
      throw new Error(`Cannot capture visual target ${name}: locator has no visible bounding box`);
    }
    boxes.push(box);
  }

  const padding = options.padding ?? 12;
  const minX = Math.max(0, Math.floor(Math.min(...boxes.map((box) => box.x)) - padding));
  const minY = Math.max(0, Math.floor(Math.min(...boxes.map((box) => box.y)) - padding));
  const maxX = Math.min(viewport.width, Math.ceil(Math.max(...boxes.map((box) => box.x + box.width)) + padding));
  const maxY = Math.min(viewport.height, Math.ceil(Math.max(...boxes.map((box) => box.y + box.height)) + padding));
  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 0 || height <= 0) {
    throw new Error(`Cannot capture visual target ${name}: clipped target is outside the viewport`);
  }

  await page.screenshot({
    path: outputPath,
    animations: 'disabled',
    caret: 'hide',
    clip: { x: minX, y: minY, width, height },
  });
  return outputPath;
}

export async function scrollVisualLocatorIntoStableView(
  page: Page,
  locator: Locator,
  options: { containerSelector?: string; topOffset?: number } = {},
): Promise<void> {
  await locator.evaluate(
    (element, { containerSelector, topOffset }) => {
      const target = element as HTMLElement;
      const container = target.closest(containerSelector) as HTMLElement | null;
      if (container != null) {
        const targetRect = target.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        container.scrollTop = Math.max(
          0,
          container.scrollTop + targetRect.top - containerRect.top - topOffset,
        );
        return;
      }

      const scrollRoot = document.scrollingElement;
      if (scrollRoot == null) return;
      window.scrollTo({
        top: Math.max(0, window.scrollY + target.getBoundingClientRect().top - topOffset),
        behavior: 'instant',
      });
    },
    {
      containerSelector: options.containerSelector ?? '.entry-main--scroll',
      topOffset: options.topOffset ?? 56,
    },
  );
  await waitForVisualStable(page);
}

export async function waitForVisualStable(page: Page): Promise<void> {
  // The app shell owns long-lived SSE channels such as /api/memory/events, so
  // Playwright's networkidle state never represents visual readiness here.
  await waitForVisualFrameAssets(page);
  await waitForVisualLayoutStable(page);
}

async function waitForVisualFrameAssets(page: Page): Promise<void> {
  await Promise.all(
    page.frames().map((frame) =>
      Promise.race([
        frame.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(
            Array.from(document.images, async (image) => {
              if (image.complete && image.naturalWidth > 0) return;
              await image.decode().catch(() => {});
            }),
          );
        }),
        waitForVisualTimeout(),
      ]).catch(() => {}),
    ),
  );
}

async function waitForVisualLayoutStable(page: Page): Promise<void> {
  await page.waitForFunction(
    (requiredStableFrames) => new Promise<boolean>((resolve) => {
      let previousSignature = '';
      let stableFrames = 0;

      const sample = () => {
        const body = document.body;
        const root = document.documentElement;
        const visibleRects = Array.from(document.querySelectorAll('body *'))
          .filter((element) => {
            const style = window.getComputedStyle(element);
            if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) {
              return false;
            }
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
          .slice(0, 600)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return [
              element.tagName,
              Math.round(rect.x * 10) / 10,
              Math.round(rect.y * 10) / 10,
              Math.round(rect.width * 10) / 10,
              Math.round(rect.height * 10) / 10,
            ].join(':');
          })
          .join('|');

        const signature = [
          root.clientWidth,
          root.clientHeight,
          root.scrollWidth,
          root.scrollHeight,
          body?.scrollWidth ?? 0,
          body?.scrollHeight ?? 0,
          window.scrollX,
          window.scrollY,
          visibleRects,
        ].join('~');

        if (signature === previousSignature) {
          stableFrames += 1;
        } else {
          previousSignature = signature;
          stableFrames = 0;
        }

        if (stableFrames >= requiredStableFrames) {
          resolve(true);
          return;
        }

        window.requestAnimationFrame(sample);
      };

      window.requestAnimationFrame(sample);
    }),
    visualStableFrameCount,
    { timeout: visualStableTimeoutMs },
  ).catch(() => {});
}

function sanitizeVisualName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'visual';
}

async function fulfillGet(route: Route, json: unknown): Promise<void> {
  if (route.request().method() !== 'GET') {
    await route.fallback();
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
