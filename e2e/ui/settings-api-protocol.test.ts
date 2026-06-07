import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';
const OPEN_SETTINGS_LABEL = /Open settings|打开设置|開啟設定|Account & settings/i;
const SETTINGS_MENU_LABEL = /Settings|设置|設定/i;
const LOCAL_CLI_LABEL = /Local CLI|本机 CLI|本地 CLI/i;
const MODEL_POPOVER_SELECTOR = '.model-select-searchable__popover';

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
  await page.getByRole('button', { name: OPEN_SETTINGS_LABEL }).first().click();
  const dialog = page.getByRole('dialog');
  const menu = page.getByRole('menu');
  await expect
    .poll(async () => {
      if (await dialog.isVisible().catch(() => false)) return 'dialog';
      if (await menu.isVisible().catch(() => false)) return 'menu';
      return 'pending';
    })
    .not.toBe('pending');
  if (await menu.isVisible().catch(() => false)) {
    await menu.getByRole('menuitem', { name: SETTINGS_MENU_LABEL }).click();
  }
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

function modelCombobox(scope: Page | Locator) {
  return scope.getByRole('combobox', { name: 'Model', exact: true });
}

function providerPresetCombobox(scope: Page | Locator) {
  return scope.getByLabel(/Gateway preset|Quick fill provider/i);
}

async function selectComboboxOption(
  page: Page,
  combobox: Locator,
  optionName: RegExp | string,
  popoverSelector: string,
) {
  await combobox.click();
  const popover = page.locator(popoverSelector).last();
  await expect(popover).toBeVisible();
  await popover.getByRole('option', { name: optionName }).click();
}

async function expectModelComboboxText(
  scope: Page | Locator,
  pattern: RegExp | string,
) {
  await expect(modelCombobox(scope)).toContainText(pattern);
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

test('[P1] legacy known OpenAI provider switches to the matching Anthropic preset', async ({ page }) => {
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
  const modelSelect = modelCombobox(dialog);

  await expect(openAiTab).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByRole('heading', { name: 'OpenAI API' })).toBeVisible();
  await expect(baseUrlInput).toHaveValue('https://api.deepseek.com');
  await expect(modelSelect).toContainText(/deepseek-chat/i);

  await anthropicTab.click();

  await expect(anthropicTab).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByRole('heading', { name: 'Anthropic API' })).toBeVisible();
  await expect(baseUrlInput).toHaveValue('https://api.deepseek.com/anthropic');
  await expect(modelSelect).toContainText(/deepseek-chat/i);
});

test('[P1] legacy custom provider preserves custom baseUrl and model when switching protocols', async ({ page }) => {
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

test('[P0] BYOK quick fill provider updates fields and saved settings persist after closing and reopening', async ({ page }) => {
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
  const providerPicker = providerPresetCombobox(dialog);
  await selectComboboxOption(page, providerPicker, /DeepSeek — OpenAI/i, '[data-testid="settings-byok-provider-preset-popover"]');
  await expectModelComboboxText(dialog, /deepseek-chat/i);
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
  await expect(providerPresetCombobox(reopenedDialog)).toContainText(/DeepSeek — OpenAI/i);
  await expectModelComboboxText(reopenedDialog, /deepseek-chat/i);
  await expect(reopenedDialog.getByLabel('Base URL')).toHaveValue('https://api.deepseek.com');
  await expect(reopenedDialog.getByLabel('API key')).toHaveValue('sk-openai-test');
});

test('[P0] BYOK save stays disabled until required fields are valid', async ({ page }) => {
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
  await expect(dialog.locator('#settings-base-url-error')).toContainText(/public http:\/\/ or https:\/\//i);

  await baseUrlInput.fill('http://localhost:11434/v1');
  await expect.poll(async () => readSavedConfig(page)).toMatchObject({
    apiKey: 'sk-openai-test',
    baseUrl: 'http://localhost:11434/v1',
  });
});

test('[P0] BYOK auto-loads provider models and reuses cached results for the same config', async ({ page }) => {
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
  const modelSelect = modelCombobox(dialog);
  const apiKeyInput = dialog.getByLabel('API key');

  await expect(dialog.getByRole('button', { name: 'Fetch models' })).toHaveCount(0);
  await expect(page.locator(MODEL_POPOVER_SELECTOR).getByRole('option', { name: 'AA Nightly Model (aa-nightly-model)' })).toHaveCount(0);

  await apiKeyInput.fill('sk-openai-test');
  await apiKeyInput.blur();
  await expect(dialog.getByText('Loaded 3 models from your account.')).toBeVisible();
  await expect.poll(() => providerModelRequests.length).toBe(1);
  expect(providerModelRequests[0]).toMatchObject({
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-openai-test',
  });

  await modelSelect.click();
  const modelPopover = page.locator(MODEL_POPOVER_SELECTOR).last();
  await expect(modelPopover.getByRole('option', { name: 'AA Nightly Model (aa-nightly-model)' })).toHaveCount(1);
  await expect(modelPopover.getByRole('option', { name: 'MM Nightly Model (mm-nightly-model)' })).toHaveCount(1);
  await expect(modelPopover.getByRole('option', { name: 'ZZ Nightly Model (zz-nightly-model)' })).toHaveCount(1);
  await page.keyboard.press('Escape');

  if ((await page.getByRole('dialog').count()) > 0) {
    const closeButton = page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true });
    if ((await closeButton.count()) > 0) {
      await closeButton.click({ force: true });
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }

  await openSettingsDialogFromEntry(page);
  const reopenedDialog = page.getByRole('dialog');
  await expect(reopenedDialog.getByRole('tab', { name: 'OpenAI', exact: true })).toHaveAttribute('aria-selected', 'true');
  await modelCombobox(reopenedDialog).click();
  await expect(page.locator(MODEL_POPOVER_SELECTOR).last().getByRole('option', { name: 'AA Nightly Model (aa-nightly-model)' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect.poll(() => providerModelRequests.length).toBe(1);
});


test('[P0] BYOK fetched models are searchable inside the Settings model dropdown', async ({ page }) => {
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
          { id: 'bb-nightly-model', label: 'BB Nightly Model' },
          { id: 'cc-nightly-model', label: 'CC Nightly Model' },
          { id: 'dd-nightly-model', label: 'DD Nightly Model' },
          { id: 'ee-nightly-model', label: 'EE Nightly Model' },
          { id: 'ff-nightly-model', label: 'FF Nightly Model' },
          { id: 'gg-nightly-model', label: 'GG Nightly Model' },
          { id: 'hh-nightly-model', label: 'HH Nightly Model' },
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
  await dialog.getByLabel('API key').fill('sk-openai-test');
  await dialog.getByLabel('API key').blur();
  await expect(dialog.getByText('Loaded 10 models from your account.')).toBeVisible();
  await expect.poll(() => providerModelRequests.length).toBe(1);

  await modelCombobox(dialog).click();
  const popover = page.getByTestId('settings-byok-model-popover');
  const search = page.getByTestId('settings-byok-model-search');
  await expect(popover).toBeVisible();
  await expect(search).toBeVisible();
  await search.fill('mm-nightly');
  await expect(popover.getByRole('option', { name: 'MM Nightly Model (mm-nightly-model)' })).toBeVisible();
  await expect(popover.getByRole('option', { name: 'BB Nightly Model (bb-nightly-model)' })).toHaveCount(0);
});

test('[P0] saving Local CLI updates the entry status pill with the selected agent', async ({ page }) => {
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
