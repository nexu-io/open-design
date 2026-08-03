import { expect, type Page, type Request, type Route } from '@playwright/test';
import { expectStableCount } from './assertions.js';

export const STORAGE_KEY = 'open-design:config';

const STANDARD_CONFIG = {
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
};

const STANDARD_APP_CONFIG = {
  onboardingCompleted: true,
  agentId: 'mock',
  skillId: null,
  designSystemId: null,
  agentModels: {},
  privacyDecisionAt: 1,
  telemetry: { metrics: false, content: false, artifactManifest: false },
};

const STANDARD_MOCK_AGENT = {
  id: 'mock',
  name: 'Mock Agent',
  bin: 'mock-agent',
  available: true,
  version: 'test',
  models: [{ id: 'default', label: 'Default' }],
};

export type RunRequestBody = Record<string, unknown>;

export type RunRequestTracker = {
  bodies: RunRequestBody[];
  expectCount: (count: number, options?: { timeout?: number; message?: string }) => Promise<void>;
  expectNone: (options?: { timeout?: number; message?: string }) => Promise<void>;
  dispose?: () => void;
};

type RunEventBodyFactory = (
  requestIndex: number,
  body: RunRequestBody | null,
) => string | Promise<string>;

/**
 * Seed localStorage with the standard daemon/mock-agent config and intercept
 * /api/agents and /api/app-config GET with deterministic fixtures.
 *
 * Call this from beforeEach for tests that don't need a custom agent or
 * protocol setup. Tests that need custom agents/config should call the
 * individual helpers below instead.
 */
export async function applyStandardMocks(page: Page): Promise<void> {
  await applyStorageConfig(page);
  await routeMockAgents(page);
  await routeAppConfig(page);
  await suppressWhatsNew(page);
}

/** Keep unrelated release announcements from covering the surface under test. */
export async function suppressWhatsNew(page: Page): Promise<void> {
  await page.route('**/api/whats-new', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({ json: { version: 'e2e', id: null, content: null } });
  });
}

/** Seed localStorage with the standard config only (no route interception). */
export async function applyStorageConfig(page: Page): Promise<void> {
  const configJson = JSON.stringify(STANDARD_CONFIG);
  await page.addInitScript(
    ({ key, value }: { key: string; value: string }) => window.localStorage.setItem(key, value),
    { key: STORAGE_KEY, value: configJson },
  );
}

/** Intercept GET /api/app-config with the standard fixture. */
export async function routeAppConfig(page: Page): Promise<void> {
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({ json: { config: STANDARD_APP_CONFIG } });
  });
}

/** Intercept GET /api/agents with a single standard mock agent. */
export async function routeMockAgents(page: Page): Promise<void> {
  await routeAgents(page, [STANDARD_MOCK_AGENT]);
}

/** Intercept /api/agents for both JSON and streaming callers. */
export async function routeAgents(
  page: Page,
  agents: readonly unknown[],
): Promise<void> {
  await page.route('**/api/agents**', async (route) => {
    await fulfillAgentsRoute(route, agents);
  });
}

export async function fulfillAgentsRoute(
  route: Route,
  agents: readonly unknown[],
): Promise<void> {
  if (route.request().method() !== 'GET') {
    await route.continue();
    return;
  }

  const url = new URL(route.request().url());
  if (url.pathname !== '/api/agents') {
    await route.fallback();
    return;
  }

  if (url.searchParams.get('stream') !== '1') {
    await route.fulfill({ json: { agents } });
    return;
  }

  const agentEvents = agents
    .map((agent) => `event: agent\ndata: ${JSON.stringify(agent)}\n\n`)
    .join('');
  await route.fulfill({
    status: 200,
    contentType: 'text/event-stream; charset=utf-8',
    body: `${agentEvents}event: done\ndata: {}\n\n`,
  });
}

export async function routeSuccessfulRuns(
  page: Page,
  options: {
    bodies?: RunRequestBody[];
    runId?: string;
    runIdPrefix?: string;
    events?: boolean | 'pending';
    eventBody?: string | RunEventBodyFactory;
  } = {},
): Promise<RunRequestTracker> {
  const bodies = options.bodies ?? [];
  const runIdPrefix = options.runIdPrefix ?? 'mock-run';
  let requestCount = 0;

  await page.route('**/api/runs', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    const raw = route.request().postData();
    const body = raw ? JSON.parse(raw) as RunRequestBody : null;
    if (body) bodies.push(body);
    requestCount += 1;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: options.runId ?? `${runIdPrefix}-${requestCount}` }),
    });
  });

  if (options.events === 'pending') {
    await page.route('**/api/runs/*/events', async () => {
      await new Promise(() => undefined);
    });
  } else if (options.events !== false) {
    await page.route('**/api/runs/*/events', async (route) => {
      const eventBody = typeof options.eventBody === 'function'
        ? await options.eventBody(bodies.length, bodies.at(-1) ?? null)
        : options.eventBody ?? successfulRunEventBody();
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        body: eventBody,
      });
    });
  }

  return makeRunRequestTracker(bodies);
}

export async function routeRunSequence(
  page: Page,
  options: {
    bodies?: RunRequestBody[];
    runIdPrefix?: string;
    eventBodies: Array<string | RunEventBodyFactory>;
  },
): Promise<RunRequestTracker> {
  const bodies = options.bodies ?? [];
  const runIdPrefix = options.runIdPrefix ?? 'mock-run';
  let requestCount = 0;
  let eventCount = 0;

  await page.route('**/api/runs', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }

    const raw = route.request().postData();
    const body = raw ? JSON.parse(raw) as RunRequestBody : null;
    if (body) bodies.push(body);
    requestCount += 1;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: `${runIdPrefix}-${requestCount}` }),
    });
  });

  await page.route('**/api/runs/*/events', async (route) => {
    eventCount += 1;
    const index = Math.min(eventCount - 1, options.eventBodies.length - 1);
    const selected = options.eventBodies[index] ?? successfulRunEventBody();
    const eventBody = typeof selected === 'function'
      ? await selected(eventCount, bodies.at(-1) ?? null)
      : selected;
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: eventBody,
    });
  });

  return makeRunRequestTracker(bodies);
}

export function successfulRunEventBody(events: string[] = []): string {
  return [...events, 'event: end', 'data: {"code":0,"status":"succeeded"}', '', ''].join('\n');
}

export function failedRunEventBody(message: string): string {
  return [
    'event: start',
    'data: {"bin":"mock-agent"}',
    '',
    'event: error',
    `data: ${JSON.stringify({ message })}`,
    '',
    '',
  ].join('\n');
}

export function trackRunRequests(page: Page): RunRequestTracker {
  const bodies: RunRequestBody[] = [];
  const listener = (request: Request) => {
    if (!isCreateRunRequest(request)) return;
    const raw = request.postData();
    bodies.push(raw ? JSON.parse(raw) as RunRequestBody : {});
  };
  page.on('request', listener);
  return {
    ...makeRunRequestTracker(bodies),
    dispose: () => page.off('request', listener),
  };
}

function isCreateRunRequest(request: Request): boolean {
  const url = new URL(request.url());
  return url.pathname === '/api/runs' && request.method() === 'POST';
}

function makeRunRequestTracker(bodies: RunRequestBody[]): RunRequestTracker {
  const expectCount = async (count: number, options: { timeout?: number; message?: string } = {}) => {
    const pollOptions: { timeout: number; message?: string } = {
      timeout: options.timeout ?? 10_000,
    };
    if (options.message) pollOptions.message = options.message;
    await expect.poll(() => bodies.length, pollOptions).toBe(count);
  };

  return {
    bodies,
    expectCount,
    async expectNone(options = {}) {
      await expectStableCount(() => bodies.length, 0, {
        timeout: options.timeout ?? 750,
        message: options.message ?? 'expected no POST /api/runs requests during the settled observation window',
      });
    },
  };
}
