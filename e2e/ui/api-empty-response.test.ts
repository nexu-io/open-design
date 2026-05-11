import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'api',
        apiProtocol: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        agentId: null,
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: {},
      }),
    );
  }, STORAGE_KEY);
});

test('API empty stream shows No output instead of Done', async ({ page }) => {
  await page.route('**/api/proxy/openai/stream', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: ['event: end', 'data: {}', '', ''].join('\n'),
    });
  });

  await page.goto('/');
  await createProject(page, 'API empty response smoke');
  await expectWorkspaceReady(page);
  await sendPrompt(page, 'Create a login page');

  await expect(page.locator('.assistant-label', { hasText: 'No output' })).toBeVisible();
  await expect(page.getByText(/provider ended the request/i)).toBeVisible();
  await expect(page.locator('.assistant-label', { hasText: 'Done' })).toHaveCount(0);
});

async function createProject(page: Page, name: string) {
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill(name);
  await page.getByTestId('create-project').click();
}

async function expectWorkspaceReady(page: Page) {
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}

async function sendPrompt(page: Page, prompt: string) {
  const input = page.getByTestId('chat-composer-input');
  const sendButton = page.getByTestId('chat-send');
  const streamResponse = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/proxy/openai/stream' && response.request().method() === 'POST';
    },
    { timeout: 5_000 },
  );

  await input.fill(prompt);
  await expect(sendButton).toBeEnabled();
  await sendButton.click();
  await streamResponse;
}
