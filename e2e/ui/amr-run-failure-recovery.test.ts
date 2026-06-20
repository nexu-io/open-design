import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';

import { writeFakeVelaBin, seedVelaLoginConfig } from '@/amr';
import { createFakeAgentRuntimes } from '@/playwright/fake-agents';
import {
  createProjectViaApi,
  gotoEntryHome,
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

test('[P0] @critical AMR insufficient-balance failures surface Top up AMR and keep Retry available', async ({ page }) => {
  const profile = 'local';
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
    .poll(async () =>
      page.evaluate(() => {
        const opened = (window as Window & { __openedUrls?: string[] }).__openedUrls ?? [];
        return opened.find((href) => {
          const url = new URL(href, window.location.href);
          return (
            url.pathname.endsWith('/wallet') &&
            url.searchParams.get('source') === 'open_design' &&
            url.searchParams.get('od_origin') === 'open_design' &&
            url.searchParams.get('od_entry_source') === 'chat_error_recharge'
          );
        }) ?? null;
      }),
    )
    .toBeTruthy();
});

test('[P0] @critical AMR auth failures offer inline Authorize & retry sign-in', async ({ page }) => {
  let loggedIn = false;
  let loginRequested = false;
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
    loginRequested = true;
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

  // New inline flow: clicking Authorize & retry starts vela login in place (it
  // POSTs /login directly) instead of bouncing the user out to the Settings
  // dialog. The run then auto-retries once /status reports signed in.
  await expect.poll(() => loginRequested, { timeout: 10_000 }).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('[P0] @critical AMR model catalog invalid-key failures route to authorization recovery', async ({ page }) => {
  let loggedIn = false;
  let loginRequested = false;
  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        loggedIn
          ? {
              loggedIn: true,
              profile: 'prod',
              configPath: '/tmp/.amr/config.json',
              user: { id: 'user-1', email: 'ui-amr@example.com', plan: 'free' },
            }
          : {
              loggedIn: false,
              profile: 'prod',
              configPath: '/tmp/.amr/config.json',
              user: null,
            },
      ),
    });
  });
  await page.route('**/api/integrations/vela/login', async (route) => {
    loginRequested = true;
    loggedIn = true;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ pid: 4243, startedAt: new Date().toISOString(), profile: 'prod' }),
    });
  });

  const amr = await setupAmrWorkspace(page, {
    failModelListInvalidApiKey: true,
    profile: 'prod',
    requireLoginConfig: false,
    selectedAgentId: 'amr',
  });
  const { conversationId, projectId } = amr;

  const userMsgId = `u-${projectId}`;
  const userMsgRes = await page.request.put(
    `/api/projects/${projectId}/conversations/${conversationId}/messages/${userMsgId}`,
    {
      data: {
        role: 'user',
        content: 'please build with AMR',
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
        agentId: 'amr',
        runId: `run-${projectId}`,
        runStatus: 'failed',
        createdAt: Date.now() - 1_000,
        startedAt: Date.now() - 1_000,
        preTurnFileNames: [],
        events: [
          {
            kind: 'status',
            label: 'error',
            detail: [
              'json-rpc id 2: AMR model catalog is unavailable.',
              'Error: list Link models: API request failed with status 401: invalid_api_key',
            ].join('\n'),
            code: 'AMR_AUTH_REQUIRED',
          },
        ],
      },
    },
  );
  expect(assistantMsgRes.ok(), `upsert assistant msg: ${await assistantMsgRes.text()}`).toBeTruthy();

  await gotoProject(page, projectId);

  const authorizeAndRetry = page.getByRole('button', { name: /Authorize.*retry|授权并重试/i }).first();
  await expect(authorizeAndRetry).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /^Retry$|^重试$|^重試$/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Switch to AMR & retry/i })).toHaveCount(0);

  await authorizeAndRetry.click();
  await expect.poll(() => loginRequested, { timeout: 10_000 }).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('[P0] @critical Settings reopens AMR with the configured profile, account badge, and model catalog', async ({ page }) => {
  const profile = 'test';
  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        loggedIn: true,
        profile,
        configPath: '/tmp/.amr/config.json',
        user: { id: 'settings-amr-user', email: 'settings-amr@example.com', plan: 'free' },
      }),
    });
  });

  await setupAmrWorkspace(page, {
    profile,
    selectedAgentId: 'amr',
    assistantText: 'AMR settings profile smoke',
  });

  await gotoEntryHome(page);
  const settings = await openSettingsDialog(page);
  await settings.getByTestId('settings-agent-select-amr').click();
  await expect(settings.getByTestId('settings-agent-select-amr')).toContainText('settings-amr@example.com');
  await expect(settings.locator('.agent-card-amr-profile-badge')).toContainText(/test/i);

  await settings.getByRole('combobox', { name: 'Model', exact: true }).click();
  const modelPopover = page.getByTestId('settings-agent-model-popover-amr');
  await expect(modelPopover).toBeVisible();
  await expect(modelPopover.getByRole('option', { name: /glm-5/i })).toBeVisible();
  await settings.getByRole('heading', { name: /Execution/i }).click();
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const reopened = await openSettingsDialog(page);
  await expect(reopened.getByTestId('settings-agent-select-amr')).toHaveAttribute('aria-pressed', 'true');
  await expect(reopened.getByTestId('settings-agent-select-amr')).toContainText('settings-amr@example.com');
  await expect(reopened.locator('.agent-card-amr-profile-badge')).toContainText(/test/i);
});

test('[P0] @critical Settings preserves AMR account, recharge shortcut, and model catalog after switching runtimes', async ({ page }) => {
  const profile = 'test';
  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        loggedIn: true,
        profile,
        configPath: '/tmp/.amr/config.json',
        user: { id: 'settings-amr-user', email: 'settings-amr-switch@example.com', plan: 'free' },
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

  await setupAmrWorkspace(page, {
    profile,
    selectedAgentId: 'amr',
    assistantText: 'AMR settings switch smoke',
  });

  await gotoEntryHome(page);
  const settings = await openSettingsDialog(page);
  await settings.getByTestId('settings-agent-select-amr').click();
  await expect(settings.getByTestId('settings-agent-select-amr')).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByTestId('settings-agent-select-amr')).toContainText('settings-amr-switch@example.com');
  await expect(settings.locator('.agent-card-amr-profile-badge')).toContainText(/test/i);
  await expect(settings.getByRole('link', { name: /AMR Console|控制台/i })).toBeVisible();

  await settings.getByRole('combobox', { name: 'Model', exact: true }).click();
  let modelPopover = page.getByTestId('settings-agent-model-popover-amr');
  await expect(modelPopover).toBeVisible();
  await expect(modelPopover.getByRole('option', { name: /glm-5/i })).toBeVisible();
  await settings.getByRole('heading', { name: /Execution/i }).click();
  await expect(modelPopover).toHaveCount(0);

  await settings.getByTestId('settings-agent-select-codex').click();
  await expect(settings.getByTestId('settings-agent-select-codex')).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByTestId('settings-agent-select-amr')).toContainText('Open Design AMR');

  await settings.getByTestId('settings-agent-select-amr').click();
  await expect(settings.getByTestId('settings-agent-select-amr')).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByTestId('settings-agent-select-amr')).toContainText('settings-amr-switch@example.com');
  await expect(settings.locator('.agent-card-amr-profile-badge')).toContainText(/test/i);
  const amrConsole = settings.getByRole('link', { name: /AMR Console|控制台/i });
  await expect(amrConsole).toBeVisible();
  await expect(amrConsole).toHaveAttribute('href', /source=open_design/);

  await settings.getByRole('combobox', { name: 'Model', exact: true }).click();
  modelPopover = page.getByTestId('settings-agent-model-popover-amr');
  await expect(modelPopover).toBeVisible();
  await modelPopover.getByRole('option', { name: /glm-5/i }).click();

  await expect
    .poll(async () => {
      const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    })
    .toMatchObject({
      agentId: 'amr',
      agentModels: {
        amr: {
          model: expect.stringMatching(/glm-5/i),
        },
      },
    });
});

test('[P0] after an AMR failure the user can switch to Codex and complete a fresh run', async ({ page }) => {
  // AMR_AUTH_REQUIRED means the AMR session is invalid, so /status reports
  // signed-out — the inline auth card then offers the Authorize & retry action.
  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        loggedIn: false,
        profile: 'local',
        configPath: '/tmp/.amr/config.json',
        user: null,
      }),
    });
  });

  const amr = await setupAmrWorkspace(page, { failAuthAtPrompt: true, selectedAgentId: 'amr' });

  await gotoProject(page, amr.projectId);
  await sendPrompt(page, 'AMR auth failure before switch smoke');
  await expect(page.locator('.msg.error')).toContainText(
    /isn't authorized yet|Authorize it and this run retries automatically/i,
    { timeout: 15_000 },
  );
  await expect(page.getByRole('button', { name: /Authorize.*retry|授权并重试/i }).first()).toBeVisible();

  const settings = await openSettingsDialog(page);
  await settings.getByTestId('settings-agent-select-codex').click();
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
    failModelListInvalidApiKey?: boolean;
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
    ...(options.failModelListInvalidApiKey !== undefined
      ? { failModelListInvalidApiKey: options.failModelListInvalidApiKey }
      : {}),
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
  const { conversationId } = await createProjectViaApi(page, projectId, 'AMR UI failure smoke');
  return { projectId, conversationId, homeDir, root, velaBin };
}
