import { expect, test } from '@playwright/test';
import type { Locator, Page, Response } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';
const CHAT_PANEL_WIDTH_STORAGE_KEY = 'open-design.project.chatPanelWidth';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'mock',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: {},
      }),
    );
  }, STORAGE_KEY);

  await page.route('**/api/agents', async (route) => {
    await route.fulfill({
      json: {
        agents: [
          {
            id: 'mock',
            name: 'Mock Agent',
            bin: 'mock-agent',
            available: true,
            version: 'test',
            models: [{ id: 'default', label: 'Default' }],
          },
        ],
      },
    });
  });
});

test('quick switcher opens from keyboard and activates the selected file', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Quick switcher keyboard flow');
  await expectWorkspaceReady(page);

  await uploadTinyPng(page, 'alpha-file.png');
  await uploadTinyPng(page, 'beta-file.png');

  const alphaTab = tabBySuffix(page, 'alpha-file.png');
  const betaTab = tabBySuffix(page, 'beta-file.png');
  await expect(alphaTab).toBeVisible();
  await expect(betaTab).toBeVisible();
  await alphaTab.click();
  await expect(alphaTab).toHaveAttribute('aria-selected', 'true');

  await openQuickSwitcher(page);
  const quickSwitcher = page.locator('.qs-overlay');
  const quickSwitcherInput = page.locator('.qs-input');
  await expect(quickSwitcher).toBeVisible();
  await expect(quickSwitcherInput).toBeVisible();

  await quickSwitcherInput.fill('beta');
  await expect(page.getByRole('option', { name: /beta-file\.png/i })).toBeVisible();
  await quickSwitcherInput.press('Enter');

  await expect(quickSwitcher).toBeHidden();
  await expect(betaTab).toHaveAttribute('aria-selected', 'true');
  await expect(alphaTab).toHaveAttribute('aria-selected', 'false');

  await openQuickSwitcher(page);
  await expect(quickSwitcher).toBeVisible();
  await quickSwitcherInput.press('Escape');
  await expect(quickSwitcher).toBeHidden();
});

test('quick switcher keeps the current file when search has no matches', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Quick switcher empty search flow');
  await expectWorkspaceReady(page);

  await uploadTinyPng(page, 'alpha-empty-search.png');
  await uploadTinyPng(page, 'beta-empty-search.png');

  const alphaTab = tabBySuffix(page, 'alpha-empty-search.png');
  await expect(alphaTab).toBeVisible();
  await alphaTab.click();
  await expect(alphaTab).toHaveAttribute('aria-selected', 'true');

  await openQuickSwitcher(page);
  const quickSwitcher = page.locator('.qs-overlay');
  const quickSwitcherInput = page.locator('.qs-input');
  await expect(quickSwitcher).toBeVisible();

  await quickSwitcherInput.fill('no-file-with-this-name');
  await expect(page.locator('.qs-empty')).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(0);

  await quickSwitcherInput.press('Enter');
  await expect(quickSwitcher).toBeVisible();
  await quickSwitcherInput.press('Escape');
  await expect(quickSwitcher).toBeHidden();
  await expect(alphaTab).toHaveAttribute('aria-selected', 'true');
});

test('quick switcher arrow keys move selection before opening a file', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Quick switcher arrow navigation flow');
  await expectWorkspaceReady(page);

  await uploadTinyPng(page, 'arrow-alpha.png');
  await uploadTinyPng(page, 'arrow-beta.png');
  await uploadTinyPng(page, 'arrow-gamma.png');

  await openQuickSwitcher(page);
  const quickSwitcher = page.locator('.qs-overlay');
  const quickSwitcherInput = page.locator('.qs-input');
  const selectedOption = page.getByRole('option', { selected: true });
  await expect(quickSwitcher).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(3);

  const initialSelection = await selectedOption.textContent();
  await quickSwitcherInput.press('ArrowDown');
  const nextSelection = await selectedOption.textContent();
  expect(nextSelection).not.toBe(initialSelection);

  await quickSwitcherInput.press('Enter');
  await expect(quickSwitcher).toBeHidden();

  const selectedFileName = selectedBaseName(nextSelection);
  await expect(tabBySuffix(page, selectedFileName)).toHaveAttribute('aria-selected', 'true');
});

test('keyboard chat panel resize persists after reload', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Chat panel resize persistence');
  await expectWorkspaceReady(page);

  await page.evaluate((key) => {
    window.localStorage.removeItem(key);
  }, CHAT_PANEL_WIDTH_STORAGE_KEY);
  await page.reload();
  await expectWorkspaceReady(page);

  const handle = page.locator('.split-resize-handle');
  await expect(handle).toBeVisible();

  const initialWidth = await readChatPanelWidth(handle);
  await handle.focus();
  await page.keyboard.press('End');
  let resizedWidth = await readChatPanelWidth(handle);
  if (resizedWidth === initialWidth) {
    await page.keyboard.press('Home');
    resizedWidth = await readChatPanelWidth(handle);
  }
  expect(resizedWidth).not.toBe(initialWidth);

  const savedWidth = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    CHAT_PANEL_WIDTH_STORAGE_KEY,
  );
  expect(savedWidth).toBe(String(resizedWidth));

  await page.reload();
  await expectWorkspaceReady(page);
  const restoredWidth = await readChatPanelWidth(handle);
  expect(restoredWidth).toBe(resizedWidth);
});

test('quick switcher still activates another file after the project reloads', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Quick switcher after reload');
  await expectWorkspaceReady(page);

  await uploadTinyPng(page, 'reload-alpha.png');
  await uploadTinyPng(page, 'reload-beta.png');

  const alphaTab = tabBySuffix(page, 'reload-alpha.png');
  const betaTab = tabBySuffix(page, 'reload-beta.png');
  await alphaTab.click();
  await expect(alphaTab).toHaveAttribute('aria-selected', 'true');
  await expect(betaTab).toHaveAttribute('aria-selected', 'false');

  await page.reload();
  await expectWorkspaceReady(page);
  await expect(alphaTab).toHaveAttribute('aria-selected', 'true');

  await openQuickSwitcher(page);
  const quickSwitcher = page.locator('.qs-overlay');
  const quickSwitcherInput = page.locator('.qs-input');
  await expect(quickSwitcher).toBeVisible();

  await quickSwitcherInput.fill('reload-beta');
  await expect(page.getByRole('option', { name: /reload-beta\.png/i })).toBeVisible();
  await quickSwitcherInput.press('Enter');

  await expect(quickSwitcher).toBeHidden();
  await expect(betaTab).toHaveAttribute('aria-selected', 'true');
  await expect(alphaTab).toHaveAttribute('aria-selected', 'false');
});

test('quick switcher only lists files from the active project after switching projects', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Quick switcher Project Alpha');
  await expectWorkspaceReady(page);

  await uploadTinyPng(page, 'alpha-project-file.png');
  await uploadTinyPng(page, 'alpha-project-secondary.png');
  await page.getByRole('button', { name: /back to projects/i }).click();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();

  await createProject(page, 'Quick switcher Project Beta');
  await expectWorkspaceReady(page);

  await uploadTinyPng(page, 'beta-project-file.png');
  await uploadTinyPng(page, 'beta-project-secondary.png');

  await openQuickSwitcher(page);
  const quickSwitcher = page.locator('.qs-overlay');
  const quickSwitcherInput = page.locator('.qs-input');
  await expect(quickSwitcher).toBeVisible();

  await quickSwitcherInput.fill('project');
  await expect(page.getByRole('option', { name: /beta-project-file\.png/i })).toBeVisible();
  await expect(page.getByRole('option', { name: /beta-project-secondary\.png/i })).toBeVisible();
  await expect(page.getByRole('option', { name: /alpha-project-file\.png/i })).toHaveCount(0);
  await expect(page.getByRole('option', { name: /alpha-project-secondary\.png/i })).toHaveCount(0);

  await quickSwitcherInput.press('Escape');
  await expect(quickSwitcher).toBeHidden();
});

test('quick switcher leaves the Design Files panel and opens the selected file tab', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Quick switcher from Design Files');
  await expectWorkspaceReady(page);

  await uploadTinyPng(page, 'design-files-alpha.png');
  await uploadTinyPng(page, 'design-files-beta.png');

  await page.getByTestId('design-files-tab').click();
  await expect(page.getByTestId('design-files-tab')).toHaveAttribute('aria-selected', 'true');

  const betaRow = page.locator('[data-testid^="design-file-row-"]', {
    hasText: 'design-files-beta.png',
  });
  await expect(betaRow).toBeVisible();
  await betaRow.getByRole('button').first().click();
  await expect(page.getByTestId('design-file-preview')).toBeVisible();
  await expect(page.getByTestId('design-file-preview').getByText(/design-files-beta\.png/i)).toBeVisible();

  await openQuickSwitcher(page);
  const quickSwitcher = page.locator('.qs-overlay');
  const quickSwitcherInput = page.locator('.qs-input');
  await expect(quickSwitcher).toBeVisible();

  await quickSwitcherInput.fill('design-files-alpha');
  await expect(page.getByRole('option', { name: /design-files-alpha\.png/i })).toBeVisible();
  await quickSwitcherInput.press('Enter');

  await expect(quickSwitcher).toBeHidden();
  await expect(page.getByTestId('design-files-tab')).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByRole('tab', { name: /design-files-alpha\.png/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('design-file-preview')).toHaveCount(0);
});

test('quick switcher can switch from a design file tab back to a generated artifact tab', async ({ page }) => {
  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"mock-run"}',
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    const artifact =
      '<artifact identifier="quick-switcher-artifact" type="text/html" title="Quick Switcher Artifact">' +
      '<!doctype html><html><body><main><h1>Quick Switcher Artifact</h1></main></body></html>' +
      '</artifact>';
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: stdout',
      `data: ${JSON.stringify({ chunk: artifact })}`,
      '',
      'event: end',
      'data: {"code":0,"status":"succeeded"}',
      '',
      '',
    ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await page.goto('/');
  await createProject(page, 'Quick switcher artifact mix');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Create a quick switcher artifact');
  const artifactTab = page.getByRole('tab', { name: /quick-switcher-artifact\.html/i });
  await expect(artifactTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('artifact-preview-frame')).toBeVisible();

  await uploadTinyPng(page, 'artifact-mix-file.png');
  const fileTab = tabBySuffix(page, 'artifact-mix-file.png');
  await fileTab.click();
  await expect(fileTab).toHaveAttribute('aria-selected', 'true');
  await expect(artifactTab).toHaveAttribute('aria-selected', 'false');

  await openQuickSwitcher(page);
  const quickSwitcher = page.locator('.qs-overlay');
  const quickSwitcherInput = page.locator('.qs-input');
  await expect(quickSwitcher).toBeVisible();

  await quickSwitcherInput.fill('quick-switcher-artifact');
  await expect(page.getByRole('option', { name: /quick-switcher-artifact\.html/i })).toBeVisible();
  await quickSwitcherInput.press('Enter');

  await expect(quickSwitcher).toBeHidden();
  await expect(artifactTab).toHaveAttribute('aria-selected', 'true');
  await expect(fileTab).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByTestId('artifact-preview-frame')).toBeVisible();
  await expect(
    page.frameLocator('[data-testid="artifact-preview-frame"]').getByRole('heading', {
      name: 'Quick Switcher Artifact',
    }),
  ).toBeVisible();
});

test('quick switcher can restore a generated artifact tab after reload in a mixed workspace', async ({ page }) => {
  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"mock-run"}',
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    const artifact =
      '<artifact identifier="reload-mixed-artifact" type="text/html" title="Reload Mixed Artifact">' +
      '<!doctype html><html><body><main><h1>Reload Mixed Artifact</h1></main></body></html>' +
      '</artifact>';
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: stdout',
      `data: ${JSON.stringify({ chunk: artifact })}`,
      '',
      'event: end',
      'data: {"code":0,"status":"succeeded"}',
      '',
      '',
    ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await page.goto('/');
  await createProject(page, 'Quick switcher mixed reload');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Create a reload-mixed artifact');
  const artifactTab = page.getByRole('tab', { name: /reload-mixed-artifact\.html/i });
  await expect(artifactTab).toHaveAttribute('aria-selected', 'true');

  await uploadTinyPng(page, 'reload-mixed-file.png');
  const fileTab = tabBySuffix(page, 'reload-mixed-file.png');
  await fileTab.click();
  await expect(fileTab).toHaveAttribute('aria-selected', 'true');

  await page.reload();
  await expectWorkspaceReady(page);
  await expect(fileTab).toHaveAttribute('aria-selected', 'true');
  await expect(artifactTab).toHaveAttribute('aria-selected', 'false');

  await openQuickSwitcher(page);
  const quickSwitcher = page.locator('.qs-overlay');
  const quickSwitcherInput = page.locator('.qs-input');
  await expect(quickSwitcher).toBeVisible();

  await quickSwitcherInput.fill('reload-mixed-artifact');
  await expect(page.getByRole('option', { name: /reload-mixed-artifact\.html/i })).toBeVisible();
  await quickSwitcherInput.press('Enter');

  await expect(quickSwitcher).toBeHidden();
  await expect(artifactTab).toHaveAttribute('aria-selected', 'true');
  await expect(fileTab).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByTestId('artifact-preview-frame')).toBeVisible();
  await expect(
    page.frameLocator('[data-testid="artifact-preview-frame"]').getByRole('heading', {
      name: 'Reload Mixed Artifact',
    }),
  ).toBeVisible();
});

async function createProject(
  page: Page,
  projectName: string,
) {
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill(projectName);
  await page.getByTestId('create-project').click();
}

async function expectWorkspaceReady(page: Page) {
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}

async function uploadTinyPng(
  page: Page,
  name: string,
) {
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
    'base64',
  );
  await page.getByTestId('design-files-upload-input').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: pngBytes,
  });
  await expect(tabBySuffix(page, name)).toBeVisible();
}

async function readChatPanelWidth(handle: Locator): Promise<number> {
  const raw = await handle.getAttribute('aria-valuenow');
  const parsed = Number.parseInt(raw ?? '', 10);
  expect(Number.isFinite(parsed)).toBeTruthy();
  return parsed;
}

async function openQuickSwitcher(page: Page) {
  const quickSwitcher = page.locator('.qs-overlay');
  await page.keyboard.press('Meta+P');
  if (await quickSwitcher.isVisible()) return;
  await page.keyboard.press('Control+P');
  await expect(quickSwitcher).toBeVisible();
}

async function sendPrompt(
  page: Page,
  prompt: string,
) {
  const input = page.getByTestId('chat-composer-input');
  const sendButton = page.getByTestId('chat-send');
  for (let attempt = 0; attempt < 3; attempt++) {
    await input.click();
    await input.fill(prompt);
    try {
      await expect(input).toHaveValue(prompt, { timeout: 1500 });
      await expect(sendButton).toBeEnabled({ timeout: 1500 });
      const chatResponse = page.waitForResponse(isCreateRunResponse, { timeout: 2000 });
      await sendButton.evaluate((button: HTMLButtonElement) => button.click());
      await chatResponse;
      return;
    } catch (error) {
      await input.click();
      await input.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+A`);
      await input.press('Backspace');
      await input.pressSequentially(prompt);
      try {
        await expect(input).toHaveValue(prompt, { timeout: 1500 });
        await expect(sendButton).toBeEnabled({ timeout: 1500 });
        const chatResponse = page.waitForResponse(isCreateRunResponse, { timeout: 2000 });
        await sendButton.evaluate((button: HTMLButtonElement) => button.click());
        await chatResponse;
        return;
      } catch (retryError) {
        if (attempt === 2) throw retryError;
      }
    }
  }
}

function tabBySuffix(page: Page, name: string): Locator {
  return page.getByRole('tab', { name: new RegExp(`${escapeRegExp(name)}$`, 'i') });
}

function selectedBaseName(selectionText: string | null): string {
  const normalized = selectionText?.replace(/\s+/g, ' ').trim() ?? '';
  const match = normalized.match(/arrow-(alpha|beta|gamma)\.png/i);
  expect(match?.[0]).toBeTruthy();
  return match![0];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isCreateRunResponse(resp: Response): boolean {
  const url = new URL(resp.url());
  return url.pathname === '/api/runs' && resp.request().method() === 'POST';
}
