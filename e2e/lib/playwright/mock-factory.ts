import type { Page } from '@playwright/test';

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
  await page.route('**/api/agents', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({ json: { agents: [STANDARD_MOCK_AGENT] } });
  });
}
