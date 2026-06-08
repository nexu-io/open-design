import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { writeFakeVelaBin, seedVelaLoginConfig } from '@/amr';
import { createFakeAgentRuntimes } from '@/playwright/fake-agents';
import {
  createProjectViaApi,
  gotoProject,
  openSettingsDialog,
  putAppConfig,
  seedBrowserConfig,
  sendPrompt,
  STORAGE_KEY,
} from '@/playwright/amr';

let codexRuntime: Awaited<ReturnType<typeof createFakeAgentRuntimes>>['codex'];
const ACTIVE_ARTIFACT_PREVIEW_SELECTOR = '[data-testid="artifact-preview-frame"]:visible, [data-testid="artifact-preview-frame-url-load"]:visible, [data-testid="artifact-preview-frame-srcdoc"]:visible, [data-testid="live-artifact-preview-frame"]:visible';

test.describe.configure({ mode: 'serial' });

function artifactPreview(page: Page) {
  return page.locator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR).first();
}

function artifactPreviewFrame(page: Page) {
  return page.frameLocator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR);
}

test.beforeAll(async () => {
  const runtimes = await createFakeAgentRuntimes(['codex', 'claude']);
  codexRuntime = runtimes.codex;
});

test('[P0] AMR insufficient-balance failures surface Top up AMR and keep Retry available', async ({ page }) => {
  const profile = `balance-${Date.now()}`;
  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        loggedIn: true,
        profile,
        configPath: '/tmp/.amr/config.json',
        user: { id: 'balance-user', email: 'balance-ui@example.com', plan: 'free' },
      }),
    });
  });

  await page.addInitScript(() => {
    const opened: string[] = [];
    (window as Window & { __openedUrls?: string[] }).__openedUrls = opened;
    const originalOpen = window.open.bind(window);
    window.open = ((...args: Parameters<typeof window.open>) => {
      if (typeof args[0] === 'string') opened.push(args[0]);
      return originalOpen(...args);
    }) as typeof window.open;
  });

  const amr = await setupAmrWorkspace(page, {
    failBalanceAtPrompt: true,
    profile,
    requireLoginConfig: false,
    selectedAgentId: 'amr',
  });

  await gotoProject(page, amr.projectId);
  await sendPrompt(page, 'AMR insufficient balance recovery smoke');

  const topUp = page.getByRole('button', { name: /Top up AMR|前往充值|前往儲值/i }).first();
  const retry = page.getByRole('button', { name: /^Retry$|^重试$|^重試$/i }).first();
  await expect(topUp).toBeVisible({ timeout: 15_000 });
  await expect(retry).toBeVisible();

  await topUp.click();

  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { __openedUrls?: string[] }).__openedUrls ?? [],
      ),
    )
    .toContainEqual(expect.stringMatching(/^https:\/\/open-design\.ai\/amr\/wallet(?:\?|$)/));
});

test('[P0] AMR auth failures offer Authorize & retry and open AMR authorization controls', async ({ page }) => {
  let loggedIn = false;
  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        loggedIn
          ? {
              loggedIn: true,
              profile: 'local',
              configPath: '/tmp/.amr/config.json',
              user: { id: 'user-1', email: 'ui-amr@example.com', plan: 'free' },
            }
          : {
              loggedIn: false,
              profile: 'local',
              configPath: '/tmp/.amr/config.json',
              user: null,
            },
      ),
    });
  });
  await page.route('**/api/integrations/vela/login', async (route) => {
    loggedIn = true;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ pid: 4242, startedAt: new Date().toISOString(), profile: 'local' }),
    });
  });

  const amr = await setupAmrWorkspace(page, {
    failAuthAtPrompt: true,
    selectedAgentId: 'amr',
  });

  await gotoProject(page, amr.projectId);
  await sendPrompt(page, 'AMR auth failure recovery smoke');

  const authorizeAndRetry = page.getByRole('button', { name: /Authorize.*retry|授权并重试/i }).first();
  await expect(authorizeAndRetry).toBeVisible({ timeout: 15_000 });
  await authorizeAndRetry.click();

  const settings = page.getByRole('dialog');
  await expect(settings).toBeVisible({ timeout: 10_000 });
  const authorize = settings.getByRole('button', { name: /^Authorize$|^授权$/i });
  await expect(authorize).toBeVisible();
  await authorize.click();

  await expect(settings.getByRole('button', { name: /^Sign out$|^退出登录$/i })).toBeVisible({
    timeout: 10_000,
  });
});

test('[P0] after an AMR failure the user can switch to Codex and complete a fresh run', async ({ page }) => {
  const amr = await setupAmrWorkspace(page, { failAuthAtPrompt: true, selectedAgentId: 'amr' });

  await gotoProject(page, amr.projectId);
  await sendPrompt(page, 'AMR auth failure before switch smoke');
  await expect(page.locator('.msg.error')).toContainText(
    /isn't authorized yet|Authorize it and this run retries automatically/i,
    { timeout: 15_000 },
  );
  await expect(page.getByRole('button', { name: /Authorize.*retry|授权并重试/i }).first()).toBeVisible();

  const settings = await openSettingsDialog(page);
  await settings.getByRole('button', { name: /Codex CLI/i }).click();
  await expect
    .poll(async () => {
      const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
      return raw ? JSON.parse(raw).agentId : null;
    })
    .toBe('codex');
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);

  await sendPrompt(page, 'Create a deterministic smoke artifact');
  await expect(artifactPreview(page)).toBeVisible({ timeout: 20_000 });
  await expect(
    artifactPreviewFrame(page).getByRole('heading', {
      name: 'Real Daemon Smoke',
    }),
  ).toBeVisible();
});

test('[P0] upstream outages keep Retry available without promoting AMR', async ({ page }) => {
  const root = join(tmpdir(), `open-design-upstream-ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const runtimes = await createFakeAgentRuntimes({ root: join(root, 'agents'), runtimeIds: ['claude'] });
  const config = {
    mode: 'daemon',
    apiKey: '',
    baseUrl: '',
    model: '',
    agentId: 'claude',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {
      claude: { model: 'default', reasoning: 'default' },
    },
    agentCliEnv: {
      claude: runtimes.claude.env,
    },
  };

  await seedBrowserConfig(page, config);
  await putAppConfig(page, config);

  const projectId = `upstream-ui-${Date.now()}`.replace(/[^A-Za-z0-9._-]/g, '-');
  const { conversationId } = await createProjectViaApi(page, projectId, 'Upstream outage recovery');

  const userMsgId = `u-${projectId}`;
  const userMsgRes = await page.request.put(
    `/api/projects/${projectId}/conversations/${conversationId}/messages/${userMsgId}`,
    {
      data: {
        role: 'user',
        content: 'please build something',
        createdAt: Date.now() - 2_000,
      },
    },
  );
  expect(userMsgRes.ok(), `upsert user msg: ${await userMsgRes.text()}`).toBeTruthy();

  const assistantMsgId = `a-${projectId}`;
  const assistantMsgRes = await page.request.put(
    `/api/projects/${projectId}/conversations/${conversationId}/messages/${assistantMsgId}`,
    {
      data: {
        role: 'assistant',
        content: '',
        agentId: 'claude',
        runId: `run-${projectId}`,
        runStatus: 'failed',
        createdAt: Date.now() - 1_000,
        startedAt: Date.now() - 1_000,
        preTurnFileNames: [],
        events: [
          {
            kind: 'status',
            label: 'error',
            detail: 'The model provider is temporarily unavailable.',
            code: 'UPSTREAM_UNAVAILABLE',
          },
        ],
      },
    },
  );
  expect(assistantMsgRes.ok(), `upsert assistant msg: ${await assistantMsgRes.text()}`).toBeTruthy();

  await gotoProject(page, projectId);

  await expect(page.getByRole('button', { name: /^Retry$|^重试$|^重試$/i }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Generation service unavailable|model provider is temporarily unavailable/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Switch to AMR & retry/i })).toHaveCount(0);
  await expect(page.getByText(/Model call failed/i)).toHaveCount(0);
});

test('[P0] antigravity rate limits offer terminal model switching without promoting AMR', async ({ page }) => {
  let oauthLaunchCalls = 0;
  await page.route('**/api/agents/antigravity/oauth-launch', async (route) => {
    oauthLaunchCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  const config = {
    mode: 'daemon',
    apiKey: '',
    baseUrl: '',
    model: '',
    agentId: 'antigravity',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {
      antigravity: { model: 'default', reasoning: 'default' },
    },
  };

  await seedBrowserConfig(page, config);
  await putAppConfig(page, config);

  const projectId = `antigravity-ui-${Date.now()}`.replace(/[^A-Za-z0-9._-]/g, '-');
  const { conversationId } = await createProjectViaApi(page, projectId, 'Antigravity rate limit recovery');

  const userMsgId = `u-${projectId}`;
  const userMsgRes = await page.request.put(
    `/api/projects/${projectId}/conversations/${conversationId}/messages/${userMsgId}`,
    {
      data: {
        role: 'user',
        content: 'please build something',
        createdAt: Date.now() - 2_000,
      },
    },
  );
  expect(userMsgRes.ok(), `upsert user msg: ${await userMsgRes.text()}`).toBeTruthy();

  const assistantMsgId = `a-${projectId}`;
  const assistantMsgRes = await page.request.put(
    `/api/projects/${projectId}/conversations/${conversationId}/messages/${assistantMsgId}`,
    {
      data: {
        role: 'assistant',
        content: '',
        agentId: 'antigravity',
        runId: `run-${projectId}`,
        runStatus: 'failed',
        createdAt: Date.now() - 1_000,
        startedAt: Date.now() - 1_000,
        preTurnFileNames: [],
        events: [
          {
            kind: 'status',
            label: 'error',
            detail: 'Switch to another Antigravity model before retrying this run.',
            code: 'RATE_LIMITED',
          },
        ],
      },
    },
  );
  expect(assistantMsgRes.ok(), `upsert assistant msg: ${await assistantMsgRes.text()}`).toBeTruthy();

  await gotoProject(page, projectId);

  const launchTerminal = page.getByRole('button', { name: /Switch model in terminal/i }).first();
  await expect(launchTerminal).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /^Retry$|^重试$|^重試$/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Switch to AMR & retry/i })).toHaveCount(0);

  await launchTerminal.click();

  await expect.poll(() => oauthLaunchCalls).toBe(1);
});

async function setupAmrWorkspace(
  page: Page,
  options: {
    failAuthAtPrompt?: boolean;
    failBalanceAtPrompt?: boolean;
    profile?: string;
    requireLoginConfig?: boolean;
    selectedAgentId: 'amr' | 'codex';
    seedLoginConfig?: boolean;
    assistantText?: string;
  },
) {
  const root = join(tmpdir(), `open-design-amr-ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const homeDir = join(root, 'home');
  const velaBin = await writeFakeVelaBin(join(root, 'bin'), {
    ...(options.assistantText !== undefined ? { assistantText: options.assistantText } : {}),
    ...(options.failAuthAtPrompt !== undefined ? { failAuthAtPrompt: options.failAuthAtPrompt } : {}),
    ...(options.failBalanceAtPrompt !== undefined ? { failBalanceAtPrompt: options.failBalanceAtPrompt } : {}),
    ...(options.requireLoginConfig !== undefined ? { requireLoginConfig: options.requireLoginConfig } : {}),
  });
  await mkdir(homeDir, { recursive: true });
  if (options.seedLoginConfig !== false) {
    await seedVelaLoginConfig(homeDir, { email: 'ui-amr@example.com', profile: options.profile ?? 'local' });
  }

  const config = {
    mode: 'daemon',
    apiKey: '',
    baseUrl: '',
    model: '',
    agentId: options.selectedAgentId,
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {
      amr: { model: 'default', reasoning: 'default' },
      codex: { model: 'default', reasoning: 'default' },
    },
    agentCliEnv: {
      amr: {
        VELA_BIN: velaBin,
        HOME: homeDir,
        VELA_LINK_URL: 'http://localhost:18081',
        VELA_RUNTIME_KEY: 'fake-runtime-key',
        ...(options.profile ? { OPEN_DESIGN_AMR_PROFILE: options.profile } : {}),
      },
      codex: codexRuntime.env,
    },
  };

  await seedBrowserConfig(page, config);
  await putAppConfig(page, config);

  const projectId = `amr-ui-${Date.now()}`.replace(/[^A-Za-z0-9._-]/g, '-');
  await createProjectViaApi(page, projectId, 'AMR UI failure smoke');
  return { projectId, homeDir, root, velaBin };
}
