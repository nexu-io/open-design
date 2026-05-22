import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';
const OPEN_SETTINGS_LABEL = /Open settings|打开设置|開啟設定/i;
const SETTINGS_MENU_LABEL = /^Settings$|^设置$|^設定$/i;
const LOCAL_CLI_LABEL = /Local CLI|本机 CLI|本地 CLI/i;

test.describe.configure({ timeout: 30_000 });

async function waitForLoadingToClear(page: Page) {
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, { timeout: 15_000 });
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /not now/i }).click();
  }
  await expect(page.getByRole('button', { name: OPEN_SETTINGS_LABEL })).toBeVisible();
}

async function openSettingsDialogFromEntry(page: Page) {
  await waitForLoadingToClear(page);
  await page.getByRole('button', { name: OPEN_SETTINGS_LABEL }).click();
  const menu = page.getByRole('menu');
  if (await menu.isVisible().catch(() => false)) {
    await menu.getByRole('button', { name: SETTINGS_MENU_LABEL }).click();
  }
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

test('legacy known OpenAI provider switches to the matching Anthropic preset', async ({ page }) => {
  await openExecutionSettings(page, {
    mode: 'api',
    apiKey: 'sk-test',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    agentId: null,
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {},
  });

  const dialog = page.getByRole('dialog');
  const protocolTabs = dialog.getByRole('tablist', { name: 'API protocol' });
  const openAiTab = protocolTabs.getByRole('tab', { name: 'OpenAI', exact: true });
  const anthropicTab = protocolTabs.getByRole('tab', { name: 'Anthropic', exact: true });
  const baseUrlInput = dialog.getByLabel('Base URL');
  // Use getByRole + exact so we only match the chat "Model" picker and
  // not the inline "Memory model" picker that sits next to it.
  const modelSelect = dialog.getByRole('combobox', { name: 'Model', exact: true });

  await expect(openAiTab).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByRole('heading', { name: 'OpenAI API' })).toBeVisible();
  await expect(baseUrlInput).toHaveValue('https://api.deepseek.com');
  await expect(modelSelect).toHaveValue('deepseek-chat');

  await anthropicTab.click();

  await expect(anthropicTab).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByRole('heading', { name: 'Anthropic API' })).toBeVisible();
  await expect(baseUrlInput).toHaveValue('https://api.deepseek.com/anthropic');
  await expect(modelSelect).toHaveValue('deepseek-chat');
});

test('legacy custom provider preserves custom baseUrl and model when switching protocols', async ({ page }) => {
  await openExecutionSettings(page, {
    mode: 'api',
    apiKey: 'sk-test',
    baseUrl: 'https://my-proxy.example.com/v1',
    model: 'my-custom-model',
    agentId: null,
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {},
  });

  const dialog = page.getByRole('dialog');
  const protocolTabs = dialog.getByRole('tablist', { name: 'API protocol' });
  const openAiTab = protocolTabs.getByRole('tab', { name: 'OpenAI', exact: true });
  const anthropicTab = protocolTabs.getByRole('tab', { name: 'Anthropic', exact: true });
  const baseUrlInput = dialog.getByLabel('Base URL');
  const customModelInput = dialog.getByLabel(/Custom model id/i);

  await expect(openAiTab).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByRole('heading', { name: 'OpenAI API' })).toBeVisible();
  await expect(baseUrlInput).toHaveValue('https://my-proxy.example.com/v1');
  await expect(customModelInput).toHaveValue('my-custom-model');

  await anthropicTab.click();

  await expect(anthropicTab).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByRole('heading', { name: 'Anthropic API' })).toBeVisible();
  await expect(baseUrlInput).toHaveValue('https://my-proxy.example.com/v1');
  await expect(customModelInput).toHaveValue('my-custom-model');
});

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

test('BYOK save stays disabled until required fields are valid', async ({ page }) => {
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
  const closeButton = dialog.getByRole('button', { name: 'Close', exact: true });
  await expect(closeButton).toBeEnabled();

  await dialog.getByLabel('API key').fill('sk-openai-test');
  await expect.poll(async () => readSavedConfig(page)).toMatchObject({ apiKey: 'sk-openai-test' });

  const baseUrlInput = dialog.getByLabel('Base URL');
  await baseUrlInput.fill('http://10.0.0.5:11434/v1');
  await expect(dialog.locator('#settings-base-url-error')).toContainText('valid public');

  await baseUrlInput.fill('http://localhost:11434/v1');
  await expect.poll(async () => readSavedConfig(page)).toMatchObject({
    apiKey: 'sk-openai-test',
    baseUrl: 'http://localhost:11434/v1',
  });
});

test('BYOK auto-loads provider models and reuses cached results for the same config', async ({ page }) => {
  const providerModelRequests: Array<Record<string, unknown>> = [];
  await page.route('**/api/provider/models', async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    providerModelRequests.push(payload);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        kind: 'success',
        latencyMs: 15,
        models: [
          { id: 'aa-nightly-model', label: 'AA Nightly Model' },
          { id: 'mm-nightly-model', label: 'MM Nightly Model' },
          { id: 'zz-nightly-model', label: 'ZZ Nightly Model' },
        ],
      }),
    });
  });

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
  const modelSelect = dialog.getByLabel('Model');
  const apiKeyInput = dialog.getByLabel('API key');

  await expect(dialog.getByRole('button', { name: 'Fetch models' })).toHaveCount(0);
  await expect(modelSelect.getByRole('option', { name: 'AA Nightly Model (aa-nightly-model)' })).toHaveCount(0);

  await apiKeyInput.fill('sk-openai-test');
  await apiKeyInput.blur();
  await expect(dialog.getByText('Loaded 3 models from your account.')).toBeVisible();
  await expect.poll(() => providerModelRequests.length).toBe(1);
  expect(providerModelRequests[0]).toMatchObject({
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-openai-test',
  });

  await expect(modelSelect.getByRole('option', { name: 'AA Nightly Model (aa-nightly-model)' })).toHaveCount(1);
  await expect(modelSelect.getByRole('option', { name: 'MM Nightly Model (mm-nightly-model)' })).toHaveCount(1);
  await expect(modelSelect.getByRole('option', { name: 'ZZ Nightly Model (zz-nightly-model)' })).toHaveCount(1);

  const fetchedValues = await modelSelect.locator('option').evaluateAll((options) =>
    options.slice(0, 3).map((option) => (option as HTMLOptionElement).value),
  );
  expect(fetchedValues).toEqual([
    'aa-nightly-model',
    'mm-nightly-model',
    'zz-nightly-model',
  ]);

  await dialog.getByRole('tab', { name: 'Anthropic', exact: true }).click();
  await dialog.getByRole('tab', { name: 'OpenAI', exact: true }).click();
  await expect(modelSelect.getByRole('option', { name: 'AA Nightly Model (aa-nightly-model)' })).toHaveCount(1);
  await expect.poll(() => providerModelRequests.length).toBe(1);
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
