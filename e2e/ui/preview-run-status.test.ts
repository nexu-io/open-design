import { expect, test } from '@/playwright/suite';
import { createFakeAgentRuntimes } from '@/playwright/fake-agents';
import {
  createProjectViaApi,
  gotoEntryHome,
  gotoProject,
  putAppConfig,
  seedBrowserConfig,
} from '@/playwright/amr';
import { T } from '@/timeouts';

let codexEnv: Record<string, string>;

test.beforeAll(async () => {
  const runtimes = await createFakeAgentRuntimes(['codex']);
  codexEnv = runtimes.codex.env;
});

test('[P1] preview delivery status keeps persisted delivery-failure recovery in Chat', async ({ page }) => {
  test.setTimeout(T.xlong);
  const projectId = `preview-run-status-${Date.now()}`;
  const now = Date.now();

  const browserConfig = {
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
  };
  await seedBrowserConfig(page, browserConfig);
  await putAppConfig(page, browserConfig);

  const { conversationId } = await createProjectViaApi(page, projectId, 'Preview status recovery');
  const existingFileResponse = await page.request.post(`/api/projects/${projectId}/files`, {
    data: {
      name: 'existing-design.html',
      content: '<!doctype html><html><body style="min-height:100vh;margin:0;background:#121212;color:#fff"><p>Existing design</p></body></html>',
    },
  });
  expect(existingFileResponse.ok(), await existingFileResponse.text()).toBeTruthy();
  const userResponse = await page.request.put(
    `/api/projects/${projectId}/conversations/${conversationId}/messages/user-preview-status`,
    {
      data: {
        role: 'user',
        content: 'Create an editorial landing page',
        createdAt: now - 50_000,
      },
    },
  );
  expect(userResponse.ok(), await userResponse.text()).toBeTruthy();

  const failedResponse = await page.request.put(
    `/api/projects/${projectId}/conversations/${conversationId}/messages/assistant-preview-status`,
    {
      data: {
        role: 'assistant',
        content: 'The design result was not delivered.',
        agentId: 'codex',
        sessionMode: 'design',
        runId: 'run-preview-status',
        runStatus: 'succeeded',
        resultDeliveryState: 'delivery_failed',
        createdAt: now - 50_000,
        startedAt: now - 45_000,
        endedAt: now - 3_000,
        preTurnFileNames: ['existing-design.html'],
        events: [{ kind: 'status', label: 'error', detail: 'The design result was not delivered.' }],
      },
    },
  );
  expect(failedResponse.ok(), await failedResponse.text()).toBeTruthy();

  await gotoProject(page, projectId);
  const status = page.getByTestId('preview-run-status');
  await expect(status).toContainText('Delivery needs attention');
  await expect(status.locator('xpath=ancestor::*[contains(@class, "ws-preview-run-status-slot")]')).toHaveCount(1);
  await expect(status.locator('xpath=ancestor::*[@data-testid="design-files-empty"]')).toHaveCount(0);
  await expect(status).not.toContainText('Elapsed');
  await expect(page.getByTestId('preview-run-status-retry')).toHaveCount(0);
  await expect(status).toContainText('Retry in Chat');
  await expect(page.getByTestId('preview-run-status-view-details')).toHaveCount(0);
  const chatRetry = page.locator('.chat-error-retry');
  await expect(chatRetry).toBeVisible();

  // The persisted preview hint stays passive after navigation; the Chat
  // failure card remains the sole retry entry point.
  await gotoEntryHome(page);
  await gotoProject(page, projectId);
  await expect(page.getByTestId('preview-run-status')).toContainText('Delivery needs attention');
  await expect(page.getByTestId('preview-run-status')).not.toContainText('Elapsed');
  await expect(page.locator('.chat-error-retry')).toBeVisible();

  await page.locator('.chat-error-retry').click();
  await expect
    .poll(async () => {
      const response = await page.request.get(
        `/api/projects/${projectId}/conversations/${conversationId}/messages`,
      );
      if (!response.ok()) return [];
      const body = (await response.json()) as { messages?: Array<{ role: string; runStatus?: string }> };
      return body.messages?.filter((message) => message.role === 'assistant') ?? [];
    }, { timeout: T.long })
    .toHaveLength(2);

  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/projects/${projectId}/files`);
      if (!response.ok()) return [];
      const body = (await response.json()) as { files?: Array<{ name: string }> };
      return body.files?.map((file) => file.name) ?? [];
    }, { timeout: T.long })
    .toContain('fake-agent-runtime-codex.html');

  await expect(page.getByTestId('preview-run-status')).toContainText('Design ready');
  await expect(
    page.getByTestId('preview-run-status').locator('xpath=ancestor::*[contains(@class, "ws-preview-run-status-slot")]'),
  ).toHaveCount(1);
});
