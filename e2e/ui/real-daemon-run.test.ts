import { expect, test } from '@playwright/test';
import type { Page, Response } from '@playwright/test';
import {
  createFakeAgentRuntimes,
  FAKE_AGENT_RUNTIME_IDS,
} from '@/playwright/fake-agents';
import type { FakeAgentId } from '@/playwright/fake-agents';
import { T } from '@/timeouts';

const STORAGE_KEY = 'open-design:config';
const GENERATED_FILE = 'real-daemon-smoke.html';
const GENERATED_HEADING = 'Real Daemon Smoke';
const CHUNKED_FILE = 'chunked-daemon-smoke.html';
const CHUNKED_HEADING = 'Chunked Daemon Smoke';
const DELAYED_FILE = 'delayed-daemon-smoke.html';
const DELAYED_HEADING = 'Delayed Daemon Smoke';
const FOLLOW_UP_FILE = 'follow-up-daemon-smoke.html';
let fakeRuntimes: Awaited<ReturnType<typeof createFakeAgentRuntimes>>;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  fakeRuntimes = await createFakeAgentRuntimes();
});

test.beforeEach(async ({ page }) => {
  test.setTimeout(60_000);

  await resetDaemonAppConfig(page);

  await page.addInitScript(({ key, codexEnv }) => {
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'codex',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: { codex: { model: 'default', reasoning: 'default' } },
        agentCliEnv: { codex: codexEnv },
      }),
    );
  }, { key: STORAGE_KEY, codexEnv: fakeRuntimes.codex.env });

  await configureFakeAgent(page, 'codex');
});

test.afterEach(async ({ page }) => {
  await resetDaemonAppConfig(page);
});

test('real daemon run streams, persists, and previews an artifact', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Real daemon run smoke');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Create a deterministic smoke artifact');

  const { projectId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [GENERATED_FILE]);
  await expect(page.getByTestId('artifact-preview-frame')).toBeVisible();
  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  await expect(frame.getByRole('heading', { name: GENERATED_HEADING })).toBeVisible();

  await expectProjectFileToContain(page, projectId, GENERATED_FILE, GENERATED_HEADING);
});

test('real daemon run persists an artifact streamed across multiple chunks', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Chunked daemon run smoke');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Create a chunked deterministic smoke artifact');

  const { projectId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [CHUNKED_FILE]);
  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  await expect(frame.getByRole('heading', { name: CHUNKED_HEADING })).toBeVisible();

  await expectProjectFileToContain(page, projectId, CHUNKED_FILE, CHUNKED_HEADING);
});

test('real daemon run surfaces process/parser errors in chat', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Daemon error smoke');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Return an intentional daemon smoke failure');

  await expect(page.locator('.msg.error')).toContainText('intentional fake codex failure', { timeout: 15_000 });
  await expect(page.locator('.status-pill', { hasText: 'intentional fake codex failure' })).toBeVisible();
});

test('real daemon run supports a follow-up turn in the same project', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Daemon follow-up smoke');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Create a deterministic smoke artifact');
  const { projectId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [GENERATED_FILE]);

  await sendPrompt(page, 'Create a follow-up deterministic smoke artifact');
  await expectProjectFilesToContain(page, projectId, [GENERATED_FILE, FOLLOW_UP_FILE]);

  const response = await page.request.get(`/api/projects/${projectId}/files`);
  expect(response.ok()).toBeTruthy();
  const { files } = (await response.json()) as { files: Array<{ name: string }> };
  expect(files.map((file) => file.name)).toEqual(expect.arrayContaining([GENERATED_FILE, FOLLOW_UP_FILE]));

  await expectProjectFileToContain(page, projectId, FOLLOW_UP_FILE, 'Generated after an earlier daemon turn.');
});

test('real daemon run survives a mid-flight reload and restores the delayed artifact turn', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Delayed daemon reload smoke', 'claude');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Create a delayed deterministic smoke artifact');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectWorkspaceReady(page);

  const { projectId, conversationId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [DELAYED_FILE], 20_000);
  await expect(page.getByText('I recovered the delayed reasoning path and will persist the artifact now.')).toBeVisible();
  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  await expect(frame.getByRole('heading', { name: DELAYED_HEADING })).toBeVisible();

  const files = await listProjectFiles(page, projectId);
  expect(files.map((file) => file.name)).toEqual([DELAYED_FILE]);
  await expectProjectFileToContain(page, projectId, DELAYED_FILE, 'Generated after a delayed daemon turn.');

  await expectRestoredDelayedAssistantMessage(page, projectId, conversationId, {
    expectedUserMessages: 1,
  });
});

test('real daemon run survives reload before the create response reaches the browser', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Delayed daemon create-response reload smoke', 'claude');
  await expectWorkspaceReady(page);

  await sendPromptAndReloadBeforeCreateResponse(
    page,
    'Create a delayed deterministic smoke artifact',
  );
  await expectWorkspaceReady(page);

  const { projectId, conversationId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [DELAYED_FILE], 20_000);
  await expect(page.getByText('I recovered the delayed reasoning path and will persist the artifact now.')).toBeVisible();

  await expectRestoredDelayedAssistantMessage(page, projectId, conversationId, {
    requireRunId: true,
  });
});

test('empty daemon output fails cleanly, persists after reload, and does not leave ghost files', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Empty daemon failure smoke');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Return an empty daemon smoke response');

  const expectedError = 'Agent completed without producing any output.';
  await expect(page.getByText(expectedError, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.status-pill', { hasText: expectedError })).toBeVisible();

  const { projectId, conversationId } = await currentProjectContext(page);
  await expect.poll(async () => {
    const messages = await listConversationMessages(page, projectId, conversationId);
    return messages.find((message) => message.role === 'assistant')?.runStatus ?? 'missing';
  }, { timeout: 15_000 }).toBe('failed');
  expect(await listProjectFiles(page, projectId)).toEqual([]);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectWorkspaceReady(page);
  await expect(page.getByText(expectedError, { exact: false }).first()).toBeVisible();
  await expect(page.locator('.status-pill', { hasText: expectedError })).toBeVisible();
  expect(await listProjectFiles(page, projectId)).toEqual([]);
});

test('separate projects keep daemon artifacts isolated across recent-project navigation', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Real daemon isolation alpha');
  await expectWorkspaceReady(page);
  await sendPrompt(page, 'Create a deterministic smoke artifact');
  const alpha = await currentProjectContext(page);
  await expectProjectFilesToContain(page, alpha.projectId, [GENERATED_FILE]);

  await page.getByRole('button', { name: /back to projects/i }).click();
  await expect(page.getByTestId('recent-projects-strip')).toBeVisible();

  await createProject(page, 'Real daemon isolation beta');
  await expectWorkspaceReady(page);
  await sendPrompt(page, 'Create a follow-up deterministic smoke artifact');
  const beta = await currentProjectContext(page);
  await expectProjectFilesToContain(page, beta.projectId, [FOLLOW_UP_FILE]);
  expect(beta.projectId).not.toBe(alpha.projectId);

  await page.getByRole('button', { name: /back to projects/i }).click();
  const recentStrip = page.getByTestId('recent-projects-strip');
  await expect(recentStrip.locator(`[data-project-id="${alpha.projectId}"]`)).toBeVisible();
  await expect(recentStrip.locator(`[data-project-id="${beta.projectId}"]`)).toBeVisible();

  await recentStrip.locator(`[data-project-id="${alpha.projectId}"]`).click();
  await expectWorkspaceReady(page);
  await expect(page.getByTestId('file-workspace').getByText(GENERATED_FILE, { exact: true })).toBeVisible();
  await expect(page.getByText(FOLLOW_UP_FILE, { exact: true })).toHaveCount(0);
  expect((await listProjectFiles(page, alpha.projectId)).map((file) => file.name)).toEqual([GENERATED_FILE]);

  await page.getByRole('button', { name: /back to projects/i }).click();
  await recentStrip.locator(`[data-project-id="${beta.projectId}"]`).click();
  await expectWorkspaceReady(page);
  await expect(page.getByTestId('file-workspace').getByText(FOLLOW_UP_FILE, { exact: true })).toBeVisible();
  await expect(page.getByText(GENERATED_FILE, { exact: true })).toHaveCount(0);
  expect((await listProjectFiles(page, beta.projectId)).map((file) => file.name)).toEqual([FOLLOW_UP_FILE]);
});

test('real daemon run previews an artifact from a fake OpenCode runtime', async ({ page }) => {
  await createProject(page, 'Fake OpenCode runtime smoke', 'opencode');
  await expectWorkspaceReady(page);

  const runResponse = await sendPrompt(page, 'Fake runtime smoke for opencode');
  expectCreateRunAgentId(runResponse, 'opencode');

  const fileName = 'fake-agent-runtime-opencode.html';
  const heading = 'Fake Agent Runtime opencode';
  await expect(page.getByTestId('file-workspace').getByText(fileName, { exact: true })).toBeVisible({ timeout: 15_000 });
  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  await expect(frame.getByRole('heading', { name: heading })).toBeVisible();

  const { projectId } = currentProject(page);
  await expectProjectFileToContain(page, projectId, fileName, heading);
});

test('real daemon run supports fake non-Codex runtime protocols', async ({ page }) => {
  test.setTimeout(180_000);

  for (const agentId of FAKE_AGENT_RUNTIME_IDS) {
    await test.step(agentId, async () => {
      await configureFakeAgent(page, agentId);
      const projectId = `fake-runtime-${agentId}-${Date.now()}`.replace(/[^A-Za-z0-9._-]/g, '-');
      const { conversationId } = await createProjectViaApi(page, projectId, `Fake ${agentId} runtime smoke`);
      const expectedArtifact = `fake-agent-runtime-${agentId}`;

      expect(conversationId).toBeTruthy();
      await startRunAndWaitForSuccess(page, {
        agentId,
        projectId,
        conversationId,
        message: `Fake runtime smoke for ${agentId}`,
        expectedOutput: expectedArtifact,
      });
    });
  }
});

async function createProject(page: Page, name: string, agentId: FakeAgentId = 'codex') {
  await configureFakeAgent(page, agentId);
  await installBrowserAgentConfig(page, agentId);
  await gotoEntryHome(page);
  await setBrowserAgentConfig(page, agentId);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await setBrowserAgentConfig(page, agentId);
  await configureFakeAgent(page, agentId);
  await expectBrowserAgentConfig(page, agentId);
  await dismissPrivacyDialog(page);
  await page.getByTestId('entry-nav-new-project').click();
  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill(name);
  await page.getByTestId('create-project').click();
}

async function createProjectViaApi(page: Page, projectId: string, name: string) {
  const response = await page.request.post('/api/projects', {
    data: {
      id: projectId,
      name,
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'prototype' },
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { conversationId: string };
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /not now/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
}

async function expectWorkspaceReady(page: Page) {
  await waitForLoadingToClear(page);
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}

async function sendPrompt(page: Page, prompt: string) {
  const input = page.getByTestId('chat-composer-input');
  const sendButton = page.getByTestId('chat-send');
  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.click();
  await input.fill(prompt);
  await expect(input).toHaveValue(prompt);
  await expect(sendButton).toBeEnabled();
  const response = await Promise.race([
    page.waitForResponse(isCreateRunResponse, { timeout: 10_000 }),
    (async () => {
      await sendButton.click();
      return page.waitForResponse(isCreateRunResponse, { timeout: 10_000 });
    })(),
  ]);
  expect(response.ok()).toBeTruthy();
  return response;
}

async function sendPromptAndReloadBeforeCreateResponse(page: Page, prompt: string) {
  const input = page.getByTestId('chat-composer-input');
  const sendButton = page.getByTestId('chat-send');
  let releaseResponse!: () => void;
  const releaseResponsePromise = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let createResponseReady = false;
  const runRoute = '**/api/runs';

  await page.route(runRoute, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    createResponseReady = true;
    await releaseResponsePromise;
    await route.fulfill({ response }).catch(() => {});
  });

  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.click();
  await input.fill(prompt);
  await expect(input).toHaveValue(prompt);
  await expect(sendButton).toBeEnabled();
  await sendButton.click();
  await expect.poll(() => createResponseReady, { timeout: 10_000 }).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  releaseResponse();
  await page.unroute(runRoute).catch(() => {});
}

async function openNewProjectModal(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
  await page.getByTestId('entry-nav-new-project').click();
  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}

async function dismissPrivacyDialog(page: Page) {
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /not now/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
}

async function waitForLoadingToClear(page: Page) {
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.medium });
}

async function configureFakeAgent(page: Page, agentId: FakeAgentId) {
  const runtime = fakeRuntimes[agentId];
  const response = await page.request.put('/api/app-config', {
    data: {
      onboardingCompleted: true,
      agentId,
      agentModels: { [agentId]: { model: 'default', reasoning: 'default' } },
      agentCliEnv: { [agentId]: runtime.env },
      skillId: null,
      designSystemId: null,
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function setBrowserAgentConfig(page: Page, agentId: FakeAgentId) {
  const payload = { key: STORAGE_KEY, id: agentId, env: fakeRuntimes[agentId].env };
  await installBrowserAgentConfig(page, agentId);
  await page.evaluate(installConfig, payload);
}

async function installBrowserAgentConfig(page: Page, agentId: FakeAgentId) {
  await page.addInitScript(installConfig, {
    key: STORAGE_KEY,
    id: agentId,
    env: fakeRuntimes[agentId].env,
  });
}

function installConfig({ key, id, env }: { key: string; id: FakeAgentId; env: Record<string, string> }) {
  window.localStorage.setItem(
    key,
    JSON.stringify({
      mode: 'daemon',
      apiKey: '',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
      agentId: id,
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      agentModels: { [id]: { model: 'default', reasoning: 'default' } },
      agentCliEnv: { [id]: env },
    }),
  );
}

async function expectBrowserAgentConfig(page: Page, agentId: FakeAgentId) {
  await expect
    .poll(async () => page.evaluate(({ key }) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw).agentId ?? null;
      } catch {
        return null;
      }
    }, { key: STORAGE_KEY }), { timeout: 10_000 })
    .toBe(agentId);
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/app-config');
      if (!response.ok()) return null;
      const body = (await response.json()) as { config?: { agentId?: string } };
      return body.config?.agentId ?? null;
    }, { timeout: 10_000 })
    .toBe(agentId);
}

async function resetDaemonAppConfig(page: Page) {
  const response = await page.request.put('/api/app-config', {
    data: {
      onboardingCompleted: true,
      agentId: 'mock',
      agentModels: {},
      agentCliEnv: {},
      skillId: null,
      designSystemId: null,
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function startRunAndWaitForSuccess(
  page: Page,
  options: {
    agentId: FakeAgentId;
    projectId: string;
    conversationId: string;
    message: string;
    expectedOutput?: string;
  },
) {
  const requestId = `fake-${options.agentId}-${Date.now()}`;
  const response = await page.request.post('/api/runs', {
    data: {
      agentId: options.agentId,
      message: options.message,
      projectId: options.projectId,
      conversationId: options.conversationId,
      assistantMessageId: `assistant-${requestId}`,
      clientRequestId: requestId,
      skillId: null,
      designSystemId: null,
      model: 'default',
      reasoning: 'default',
    },
  });
  expect(response.ok()).toBeTruthy();
  const { runId } = (await response.json()) as { runId: string };

  await expect
    .poll(async () => {
      const status = await page.request.get(`/api/runs/${runId}`);
      if (!status.ok()) return `http-${status.status()}`;
      const body = (await status.json()) as { status: string };
      return body.status;
    }, { timeout: 60_000 })
    .toBe('succeeded');

  if (options.expectedOutput) {
    const events = await page.request.get(`/api/runs/${runId}/events`);
    expect(events.ok()).toBeTruthy();
    await expect(events.text()).resolves.toContain(options.expectedOutput);
  }
}

async function expectProjectFileToContain(
  page: Page,
  projectId: string,
  fileName: string,
  expected: string,
) {
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/projects/${projectId}/files/${fileName}`);
      if (!response.ok()) return '';
      return response.text();
    }, { timeout: 15_000 })
    .toContain(expected);
}

async function expectProjectFilesToContain(
  page: Page,
  projectId: string,
  expectedNames: string[],
  timeout = 15_000,
) {
  await expect
    .poll(async () => {
      try {
        const files = await listProjectFiles(page, projectId);
        return files.map((file) => file.name);
      } catch {
        return [];
      }
    }, { timeout })
    .toEqual(expect.arrayContaining(expectedNames));
}

async function listProjectFiles(
  page: Page,
  projectId: string,
) {
  const response = await page.request.get(`/api/projects/${projectId}/files`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { files: Array<{ kind: string; name: string }> };
  return body.files;
}

async function currentProjectContext(
  page: Page,
): Promise<{ conversationId: string; projectId: string }> {
  const { projectId } = currentProject(page);
  const response = await page.request.get(`/api/projects/${projectId}/conversations`);
  expect(response.ok()).toBeTruthy();
  const { conversations } = (await response.json()) as {
    conversations: Array<{ id: string; updatedAt: number }>;
  };
  const active = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!active) {
    throw new Error(`no conversations found for project ${projectId}`);
  }
  return { projectId, conversationId: active.id };
}

async function expectRestoredDelayedAssistantMessage(
  page: Page,
  projectId: string,
  conversationId: string,
  options: { expectedUserMessages?: number; requireRunId?: boolean } = {},
) {
  await expect
    .poll(async () => {
      const messages = await listConversationMessages(page, projectId, conversationId);
      const assistant = messages.find((message) => message.role === 'assistant');
      return {
        userMessages: messages.filter((message) => message.role === 'user').length,
        assistantMessages: messages.filter((message) => message.role === 'assistant').length,
        hasRunId: Boolean(assistant?.runId),
        runStatus: assistant?.runStatus ?? null,
        producedFiles: assistant?.producedFiles?.map((file) => file.name) ?? [],
        hasThinking: Boolean(assistant?.events?.some((event) => event.kind === 'thinking')),
      };
    }, { timeout: 15_000 })
    .toEqual({
      userMessages: options.expectedUserMessages ?? expect.any(Number),
      assistantMessages: 1,
      hasRunId: options.requireRunId ? true : expect.any(Boolean),
      runStatus: 'succeeded',
      producedFiles: [DELAYED_FILE],
      hasThinking: true,
    });
}

async function listConversationMessages(
  page: Page,
  projectId: string,
  conversationId: string,
) {
  const response = await page.request.get(
    `/api/projects/${projectId}/conversations/${conversationId}/messages`,
  );
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    messages: Array<{
      id: string;
      role: string;
      runId?: string;
      runStatus?: string;
      events?: Array<{ kind: string }>;
      producedFiles?: Array<{ name: string }>;
    }>;
  };
  return body.messages;
}

function isCreateRunResponse(response: Response): boolean {
  const url = new URL(response.url());
  return url.pathname === '/api/runs' && response.request().method() === 'POST';
}

function expectCreateRunAgentId(response: Response, agentId: FakeAgentId) {
  expect(response.request().postDataJSON()).toMatchObject({ agentId });
}

function currentProject(page: Page): { projectId: string } {
  const current = new URL(page.url());
  const [, projects, projectId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) {
    throw new Error(`unexpected project route: ${current.pathname}`);
  }
  return { projectId };
}
