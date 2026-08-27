import { expect, test } from '@/playwright/suite';
import { openNewProjectModal as openNewProjectModalFromProjects } from '@/playwright/rail';
import type { Page, Response } from '@playwright/test';
import { createFakeAgentRuntimes } from '@/playwright/fake-agents';
import type { FakeAgentId } from '@/playwright/fake-agents';
import { T } from '@/timeouts';

const STORAGE_KEY = 'open-design:config';
const SLOW_RELOAD_FILE = 'slow-reload-daemon-smoke.html';
const SLOW_RELOAD_HEADING = 'Slow Reload Daemon Smoke';

let fakeRuntimes: Awaited<ReturnType<typeof createFakeAgentRuntimes>>;

test.beforeAll(async () => {
  fakeRuntimes = await createFakeAgentRuntimes();
});

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000);

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

// Regression coverage for #4607. The client now self-heals status and content
// after the page transport drops, so the old failed-message precondition is no
// longer reachable. The produced-file list still needs reload reconciliation;
// lock that remaining mismatch and recovery without manufacturing persisted
// message state in the test.
test('[P1] reload restores produced files after dropped run transport', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Spurious failed reload smoke');
  await expectWorkspaceReady(page);

  // Abort the page's status/SSE transport without affecting the daemon or
  // Playwright's out-of-band APIRequestContext.
  await page.route('**/api/runs/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isRunStatusOrEvents = request.method() === 'GET' && /^\/api\/runs\/[^/]+(?:\/events)?$/.test(url.pathname);
    if (!isRunStatusOrEvents) {
      await route.continue();
      return;
    }
    await route.abort('connectionreset');
  });

  const runResponse = await sendPrompt(page, 'Create a slow reload deterministic smoke artifact');
  const { runId } = (await runResponse.json()) as { runId: string };

  const { projectId, conversationId } = await currentProjectContext(page);

  // Even while those page requests remain blocked, daemon-side result
  // delivery reconciles status and content. The browser has not received the
  // produced-file list yet, which is the real pre-reload condition here.
  await expect
    .poll(async () => {
      const assistant = await findAssistantMessage(page, projectId, conversationId);
      const daemonStatusResponse = await page.request.get(`/api/runs/${runId}`);
      const daemonStatus = daemonStatusResponse.ok()
        ? ((await daemonStatusResponse.json()) as { status: string }).status
        : `http-${daemonStatusResponse.status()}`;
      return {
        runId: assistant?.runId ?? null,
        runStatus: assistant?.runStatus ?? null,
        hasContent: Boolean(assistant?.content?.trim()),
        producedFiles: assistant?.producedFiles?.map((file) => file.name) ?? [],
        daemonStatus,
      };
    }, { timeout: 90_000, intervals: [200] })
    .toEqual({
      runId,
      runStatus: 'succeeded',
      hasContent: true,
      producedFiles: [],
      daemonStatus: 'succeeded',
    });

  await page.unrouteAll({ behavior: 'ignoreErrors' });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectWorkspaceReady(page);

  // Reload must preserve the same successful message rather than duplicate
  // the run or conversation.
  await expect
    .poll(async () => {
      const messages = await listConversationMessages(page, projectId, conversationId);
      const assistant = messages.find((message) => message.role === 'assistant');
      return {
        assistantMessages: messages.filter((message) => message.role === 'assistant').length,
        runId: assistant?.runId ?? null,
        runStatus: assistant?.runStatus ?? null,
        hasContent: Boolean(assistant?.content && assistant.content.trim().length > 0),
        producedFiles: assistant?.producedFiles?.map((file) => file.name) ?? [],
      };
    }, { timeout: 30_000 })
    .toEqual({
      assistantMessages: 1,
      runId,
      runStatus: 'succeeded',
      hasContent: true,
      producedFiles: [SLOW_RELOAD_FILE],
    });

  // Same project + conversation after reload, not a recreated one.
  const postReload = await currentProjectContext(page);
  expect(postReload.projectId).toBe(projectId);
  expect(postReload.conversationId).toBe(conversationId);

  // The run's artifact project file exists in project storage.
  await expectProjectFileToContain(page, projectId, SLOW_RELOAD_FILE, SLOW_RELOAD_HEADING);
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
  await dismissPrivacyDialog(page);
  await openNewProjectModalFromProjects(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill(name);
  await page.getByTestId('create-project').click();
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve OpenDesign' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
}

async function dismissPrivacyDialog(page: Page) {
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve OpenDesign' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
}

async function expectWorkspaceReady(page: Page) {
  await waitForLoadingToClear(page);
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}

async function waitForLoadingToClear(page: Page) {
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });
}

async function sendPrompt(page: Page, prompt: string) {
  const input = page.getByTestId('chat-composer-input');
  const sendButton = page.getByTestId('chat-send');
  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.click();
  await input.fill(prompt);
  await expect(input).toHaveText(prompt);
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

function isCreateRunResponse(response: Response): boolean {
  const url = new URL(response.url());
  return url.pathname === '/api/runs' && response.request().method() === 'POST';
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
  await installBrowserAgentConfig(page, agentId);
  await page.evaluate(installConfig, { key: STORAGE_KEY, id: agentId, env: fakeRuntimes[agentId].env });
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

async function currentProjectContext(
  page: Page,
): Promise<{ conversationId: string; projectId: string }> {
  const current = new URL(page.url());
  const [, projects, projectId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) {
    throw new Error(`unexpected project route: ${current.pathname}`);
  }
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

async function findAssistantMessage(page: Page, projectId: string, conversationId: string) {
  const messages = await listConversationMessages(page, projectId, conversationId);
  return messages.find((message) => message.role === 'assistant');
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
      content?: string;
      runId?: string;
      runStatus?: string;
      producedFiles?: Array<{ name: string }>;
    }>;
  };
  return body.messages;
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
