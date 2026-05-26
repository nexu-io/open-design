import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';
const OPEN_SETTINGS_LABEL = /Open settings|打开设置|開啟設定/i;
const LOCAL_CLI_LABEL = /Local CLI|本机 CLI|本地 CLI/i;

test.describe.configure({ timeout: 30_000 });

async function waitForLoadingToClear(page: Page) {
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, { timeout: 15_000 });
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /not now/i }).click();
  }
  await expect(page.getByRole('button', { name: OPEN_SETTINGS_LABEL })).toBeVisible();
}

async function openSettingsDialogFromEntry(page: Page) {
  await waitForLoadingToClear(page);
  await page.getByRole('button', { name: OPEN_SETTINGS_LABEL }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openExecutionSettings(
  page: Page,
  config: Record<string, unknown>,
) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: config },
  );

  await page.route('**/api/health', async (route) => {
    await route.fulfill({ status: 503, body: 'offline' });
  });

  await gotoEntryHome(page);
  await openSettingsDialogFromEntry(page);
}

async function readSavedConfig(page: Page) {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);
}

async function openExecutionSettingsWithAgents(
  page: Page,
  config: Record<string, unknown>,
  agents: Array<{
    id: string;
    name: string;
    bin: string;
    available: boolean;
    version?: string | null;
    models?: Array<{ id: string; label: string }>;
  }>,
) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: config },
  );

  await page.route('**/api/health', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.route('**/api/agents', async (route) => {
    await route.fulfill({ json: { agents } });
  });

  await gotoEntryHome(page);
  await openSettingsDialogFromEntry(page);
}

test('BYOK quick fill provider updates fields and saved settings persist after closing and reopening', async ({ page }) => {
  await openExecutionSettings(page, {
    mode: 'api',
    apiKey: '',
    apiProtocol: 'openai',
    apiVersion: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    apiProviderBaseUrl: 'https://api.openai.com/v1',
    agentId: null,
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {},
    agentCliEnv: {},
  });

  const dialog = page.getByRole('dialog');

  await dialog.getByRole('tab', { name: 'OpenAI', exact: true }).click();
  await dialog.getByLabel('Quick fill provider').selectOption('1');
  await expect(dialog.getByRole('combobox', { name: 'Model', exact: true })).toHaveValue('deepseek-chat');
  await expect(dialog.getByLabel('Base URL')).toHaveValue('https://api.deepseek.com');

  await dialog.getByRole('button', { name: 'Show' }).click();
  const apiKeyInput = dialog.getByLabel('API key');
  await expect(apiKeyInput).toHaveAttribute('type', 'text');
  await apiKeyInput.fill('sk-openai-test');

  await expect
    .poll(async () => readSavedConfig(page))
    .toMatchObject({
      mode: 'api',
      apiProtocol: 'openai',
      apiKey: 'sk-openai-test',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      apiProviderBaseUrl: 'https://api.deepseek.com',
    });

  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const savedConfig = await readSavedConfig(page);
  expect(savedConfig).toMatchObject({
    mode: 'api',
    apiProtocol: 'openai',
    apiKey: 'sk-openai-test',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    apiProviderBaseUrl: 'https://api.deepseek.com',
  });

  await openSettingsDialogFromEntry(page);
  const reopenedDialog = page.getByRole('dialog');
  await expect(reopenedDialog.getByRole('tab', { name: 'OpenAI', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(reopenedDialog.getByLabel('Quick fill provider')).toHaveValue('1');
  await expect(reopenedDialog.getByRole('combobox', { name: 'Model', exact: true })).toHaveValue('deepseek-chat');
  await expect(reopenedDialog.getByLabel('Base URL')).toHaveValue('https://api.deepseek.com');
  await expect(reopenedDialog.getByLabel('API key')).toHaveValue('sk-openai-test');
});

test('saving Local CLI updates the entry status pill with the selected agent', async ({ page }) => {
  await openExecutionSettingsWithAgents(
    page,
    {
      mode: 'api',
      apiKey: 'sk-openai-test',
      apiProtocol: 'openai',
      apiVersion: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
      agentId: null,
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      mediaProviders: {},
      agentModels: {},
      agentCliEnv: {},
    },
    [
      {
        id: 'codex',
        name: 'Codex CLI',
        bin: 'codex',
        available: true,
        version: '0.80.0',
        models: [{ id: 'default', label: 'Default' }],
      },
      {
        id: 'gemini',
        name: 'Gemini CLI',
        bin: 'gemini',
        available: false,
        version: null,
        models: [],
      },
    ],
  );

  const dialog = page.getByRole('dialog');

  await dialog.getByRole('tab', { name: LOCAL_CLI_LABEL }).click();
  await dialog.getByRole('button', { name: /Codex CLI/i }).click();
  await expect.poll(async () => readSavedConfig(page)).toMatchObject({
    mode: 'daemon',
    agentId: 'codex',
  });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const executionPill = page.getByTestId('inline-model-switcher-chip');
  await expect(executionPill).toContainText(LOCAL_CLI_LABEL);
  await expect(executionPill).toContainText('Codex CLI');
  await expect(executionPill).toContainText('default');
});
