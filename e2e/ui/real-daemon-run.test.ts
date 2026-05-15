import { expect, test } from '@playwright/test';
import type { Page, Response } from '@playwright/test';
import {
  createFakeAgentRuntimes,
  FAKE_AGENT_RUNTIME_IDS,
} from '@/playwright/fake-agents';
import type { FakeAgentId } from '@/playwright/fake-agents';

const STORAGE_KEY = 'open-design:config';
const GENERATED_FILE = 'real-daemon-smoke.html';
const GENERATED_HEADING = 'Real Daemon Smoke';
const CHUNKED_FILE = 'chunked-daemon-smoke.html';
const CHUNKED_HEADING = 'Chunked Daemon Smoke';
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
    if (window.localStorage.getItem(key) != null) return;
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

  await expect(page.getByText(GENERATED_FILE, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('artifact-preview-frame')).toBeVisible();
  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  await expect(frame.getByRole('heading', { name: GENERATED_HEADING })).toBeVisible();

  const { projectId } = currentProject(page);
  await expectProjectFileToContain(page, projectId, GENERATED_FILE, GENERATED_HEADING);
});

test('real daemon run persists an artifact streamed across multiple chunks', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Chunked daemon run smoke');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Create a chunked deterministic smoke artifact');

  await expect(page.getByText(CHUNKED_FILE, { exact: true })).toBeVisible({ timeout: 15_000 });
  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  await expect(frame.getByRole('heading', { name: CHUNKED_HEADING })).toBeVisible();

  const { projectId } = currentProject(page);
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
  await expect(page.getByText(GENERATED_FILE, { exact: true })).toBeVisible({ timeout: 15_000 });

  await sendPrompt(page, 'Create a follow-up deterministic smoke artifact');
  await expect(page.getByText(FOLLOW_UP_FILE, { exact: true })).toBeVisible({ timeout: 15_000 });

  const { projectId } = currentProject(page);
  const response = await page.request.get(`/api/projects/${projectId}/files`);
  expect(response.ok()).toBeTruthy();
  const { files } = (await response.json()) as { files: Array<{ name: string }> };
  expect(files.map((file) => file.name)).toEqual(expect.arrayContaining([GENERATED_FILE, FOLLOW_UP_FILE]));

  await expectProjectFileToContain(page, projectId, FOLLOW_UP_FILE, 'Generated after an earlier daemon turn.');
});

test('real daemon run previews an artifact from a fake OpenCode runtime', async ({ page }) => {
  await configureFakeAgent(page, 'opencode');
  await page.goto('/');
  await setBrowserAgentConfig(page, 'opencode');
  await page.reload();
  await createProject(page, 'Fake OpenCode runtime smoke');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Fake runtime smoke for opencode');

  const fileName = 'fake-agent-runtime-opencode.html';
  const heading = 'Fake Agent Runtime opencode';
  await expect(page.getByText(fileName, { exact: true })).toBeVisible({ timeout: 15_000 });
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

async function createProject(page: Page, name: string) {
  await openNewProjectModal(page);
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
}

async function openNewProjectModal(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /not now/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await page.getByTestId('entry-nav-new-project').click();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}

async function waitForLoadingToClear(page: Page) {
  const loading = page.getByText('Loading Open Design…');
  await loading.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
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
  await page.evaluate(({ key, id, env }) => {
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
  }, { key: STORAGE_KEY, id: agentId, env: fakeRuntimes[agentId].env });
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
    }, { timeout: 20_000 })
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

function isCreateRunResponse(response: Response): boolean {
  const url = new URL(response.url());
  return url.pathname === '/api/runs' && response.request().method() === 'POST';
}

function currentProject(page: Page): { projectId: string } {
  const current = new URL(page.url());
  const [, projects, projectId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) {
    throw new Error(`unexpected project route: ${current.pathname}`);
  }
  return { projectId };
}
