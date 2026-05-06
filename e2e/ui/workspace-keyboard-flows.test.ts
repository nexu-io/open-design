import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

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
  await expect(page.getByTestId('file-workspace')).toBeVisible();
  await expect(page.getByText('Start a conversation')).toBeVisible();
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
