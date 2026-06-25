import { expect, test } from '@/playwright/suite';
import type { Locator, Page } from '@playwright/test';
import { openSettingsDialog } from '../lib/playwright/amr.js';
import { routeAgents } from '../lib/playwright/mock-factory.js';
import { T } from '@/timeouts';

const STORAGE_KEY = 'open-design:config';
const OPEN_SETTINGS_LABEL = /Open settings|打开设置|開啟設定|Account & settings/i;
const LOCAL_CLI_LABEL = /Local CLI|本机 CLI|本地 CLI/i;
const MODEL_POPOVER_SELECTOR = '.model-select-searchable__popover';

test.describe.configure({ timeout: T.xlong });

async function waitForLoadingToClear(page: Page) {
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, { timeout: T.long });
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
  }
  await expect(page.getByRole('button', { name: OPEN_SETTINGS_LABEL })).toBeVisible();
}

async function openSettingsDialogFromEntry(page: Page) {
  return openSettingsDialog(page);
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
  await routeAgents(page, agents);

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

test('[P0] @critical BYOK quick fill provider updates fields and saved settings persist after closing and reopening', async ({ page }) => {
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
          { id: 'aa-prerelease-model', label: 'AA Prerelease Model' },
          { id: 'mm-prerelease-model', label: 'MM Prerelease Model' },
          { id: 'zz-prerelease-model', label: 'ZZ Prerelease Model' },
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
  await expect(page.locator(MODEL_POPOVER_SELECTOR).getByRole('option', { name: 'AA Prerelease Model (aa-prerelease-model)' })).toHaveCount(0);

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
  await expect(modelPopover.getByRole('option', { name: 'AA Prerelease Model (aa-prerelease-model)' })).toHaveCount(1);
  await expect(modelPopover.getByRole('option', { name: 'MM Prerelease Model (mm-prerelease-model)' })).toHaveCount(1);
  await expect(modelPopover.getByRole('option', { name: 'ZZ Prerelease Model (zz-prerelease-model)' })).toHaveCount(1);
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
  await expect(page.locator(MODEL_POPOVER_SELECTOR).last().getByRole('option', { name: 'AA Prerelease Model (aa-prerelease-model)' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect.poll(() => providerModelRequests.length).toBe(1);
});

test('[P0] @critical BYOK clearing the API key restores the suggested OpenAI model list', async ({ page }) => {
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
          { id: 'account-only-model', label: 'Account Only Model' },
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
  const apiKeyInput = dialog.getByLabel('API key');
  const modelSelect = modelCombobox(dialog);

  await apiKeyInput.fill('sk-openai-test');
  await apiKeyInput.blur();
  await expect.poll(() => providerModelRequests.length).toBe(1);

  await modelSelect.click();
  await expect(page.locator(MODEL_POPOVER_SELECTOR).last().getByRole('option', {
    name: 'Account Only Model (account-only-model)',
  })).toBeVisible();
  await dialog.getByRole('heading', { name: 'OpenAI API' }).click();
  await expect(page.locator(MODEL_POPOVER_SELECTOR)).toHaveCount(0);

  await expect(apiKeyInput).toBeVisible();
  await apiKeyInput.fill('');
  await apiKeyInput.blur();
  await expect.poll(async () => readSavedConfig(page)).toMatchObject({
    apiKey: '',
    model: 'gpt-4o',
  });

  await modelSelect.click();
  const popover = page.locator(MODEL_POPOVER_SELECTOR).last();
  await expect(popover.getByText('gpt-4o', { exact: true })).toBeVisible();
  await expect(popover.getByText('gpt-4o-mini', { exact: true })).toBeVisible();
  await expect(popover.getByRole('option', { name: 'Account Only Model (account-only-model)' })).toHaveCount(0);
});


test('[P0] @critical BYOK fetched models are searchable inside the Settings model dropdown', async ({ page }) => {
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
          { id: 'aa-prerelease-model', label: 'AA Prerelease Model' },
          { id: 'bb-prerelease-model', label: 'BB Prerelease Model' },
          { id: 'cc-prerelease-model', label: 'CC Prerelease Model' },
          { id: 'dd-prerelease-model', label: 'DD Prerelease Model' },
          { id: 'ee-prerelease-model', label: 'EE Prerelease Model' },
          { id: 'ff-prerelease-model', label: 'FF Prerelease Model' },
          { id: 'gg-prerelease-model', label: 'GG Prerelease Model' },
          { id: 'hh-prerelease-model', label: 'HH Prerelease Model' },
          { id: 'mm-prerelease-model', label: 'MM Prerelease Model' },
          { id: 'zz-prerelease-model', label: 'ZZ Prerelease Model' },
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
  await search.fill('mm-prerelease');
  await expect(popover.getByRole('option', { name: 'MM Prerelease Model (mm-prerelease-model)' })).toBeVisible();
  await expect(popover.getByRole('option', { name: 'BB Prerelease Model (bb-prerelease-model)' })).toHaveCount(0);
});

test('[P1] BYOK model fetch failure keeps the current model and recovers after key update', async ({ page }) => {
  const providerModelRequests: Array<Record<string, unknown>> = [];
  await page.route('**/api/provider/models', async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    providerModelRequests.push(payload);
    if (providerModelRequests.length === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'provider temporarily unavailable' } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        kind: 'success',
        latencyMs: 12,
        models: [
          { id: 'retry-nightly-model', label: 'Retry Nightly Model' },
          { id: 'stable-nightly-model', label: 'Stable Nightly Model' },
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
  await dialog.getByLabel('API key').fill('sk-openai-test');
  await dialog.getByLabel('API key').blur();

  await expect(dialog.getByText(/Could not fetch models: provider temporarily unavailable/i)).toBeVisible();
  await expectModelComboboxText(dialog, /gpt-4o/i);
  await expect.poll(() => providerModelRequests.length).toBe(1);

  await dialog.getByLabel('API key').fill('sk-openai-retry');
  await dialog.getByLabel('API key').blur();
  await expect(dialog.getByText('Loaded 2 models from your account.')).toBeVisible();
  await expect.poll(() => providerModelRequests.length).toBe(2);

  await modelSelect.click();
  await page.locator(MODEL_POPOVER_SELECTOR).last().getByRole('option', { name: 'Retry Nightly Model (retry-nightly-model)' }).click();
  await expect.poll(async () => readSavedConfig(page)).toMatchObject({
    model: 'retry-nightly-model',
  });
});

test('[P1] Settings autosave failure surfaces an error instead of reporting saved changes', async ({ page }) => {
  const config = {
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
  };
  const putBodies: Array<Record<string, unknown>> = [];

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: config },
  );

  await page.route('**/api/health', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { config } });
      return;
    }
    if (route.request().method() === 'PUT') {
      putBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'daemon unavailable' }),
      });
      return;
    }
    await route.continue();
  });

  await gotoEntryHome(page);
  await openSettingsDialogFromEntry(page);

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Base URL').fill('https://proxy.example.com/v1');
  await dialog.getByLabel('Base URL').blur();

  await expect.poll(() => putBodies.length).toBeGreaterThan(0);
  await expect(dialog.getByText("Couldn’t save changes. The local daemon may be offline.")).toBeVisible();
  await expect(dialog.getByText('All changes saved')).toHaveCount(0);
});

test('[P1] Settings autosave recovers after a later successful daemon sync', async ({ page }) => {
  const config = {
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
  };
  const putBodies: Array<Record<string, unknown>> = [];
  let daemonSyncRecovered = false;

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: config },
  );

  await page.route('**/api/health', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { config } });
      return;
    }
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      putBodies.push(payload);
      if (!daemonSyncRecovered) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'daemon unavailable' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ config: payload }),
      });
      return;
    }
    await route.continue();
  });

  await gotoEntryHome(page);
  await openSettingsDialogFromEntry(page);

  const dialog = page.getByRole('dialog');
  const baseUrl = dialog.getByLabel('Base URL');
  await baseUrl.fill('https://proxy.example.com/v1');
  await baseUrl.blur();

  await expect.poll(() => putBodies.length).toBeGreaterThan(0);
  await expect(dialog.getByText("Couldn’t save changes. The local daemon may be offline.")).toBeVisible();
  const failureRequestCount = putBodies.length;

  daemonSyncRecovered = true;
  await baseUrl.fill('https://proxy-recovered.example.com/v1');
  await baseUrl.blur();

  await expect.poll(() => putBodies.length).toBeGreaterThan(failureRequestCount);
  await expect(dialog.getByText('All changes saved')).toBeVisible();
  await expect(dialog.getByText("Couldn’t save changes. The local daemon may be offline.")).toHaveCount(0);
});

test('[P0] @critical saving Local CLI updates the entry status pill with the selected agent', async ({ page }) => {
  test.setTimeout(60_000);
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
  const codexAgent = dialog.getByTestId('settings-agent-select-codex');
  await expect(codexAgent).toBeVisible();
  await codexAgent.click();
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

test('[P0] @critical Settings keeps Local CLI and BYOK model choices isolated after reopening', async ({ page }) => {
  test.setTimeout(60_000);
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
        models: [
          { id: 'default', label: 'Default' },
          { id: 'gpt-5.5', label: 'GPT 5.5' },
        ],
      },
    ],
  );

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: LOCAL_CLI_LABEL }).click();
  await dialog.getByTestId('settings-agent-select-codex').click();
  await dialog.getByRole('combobox', { name: 'Model', exact: true }).click();
  await page.getByTestId('settings-agent-model-popover-codex').getByRole('option', { name: /GPT 5\.5/i }).click();
  await expect.poll(async () => readSavedConfig(page)).toMatchObject({
    mode: 'daemon',
    agentId: 'codex',
    agentModels: {
      codex: { model: 'gpt-5.5' },
    },
  });

  await dialog.getByRole('tab', { name: 'BYOK' }).click();
  await dialog.getByRole('tab', { name: 'OpenAI', exact: true }).click();
  await modelCombobox(dialog).click();
  await page.getByTestId('settings-byok-model-popover').getByRole('option', { name: /^gpt-4o-mini$/i }).click();
  await expect.poll(async () => readSavedConfig(page)).toMatchObject({
    mode: 'api',
    model: 'gpt-4o-mini',
    agentModels: {
      codex: { model: 'gpt-5.5' },
    },
  });

  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await openSettingsDialogFromEntry(page);
  const reopened = page.getByRole('dialog');
  await expect(reopened.getByRole('tab', { name: 'OpenAI', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expectModelComboboxText(reopened, /gpt-4o-mini/i);

  await reopened.getByRole('tab', { name: LOCAL_CLI_LABEL }).click();
  await reopened.getByTestId('settings-agent-select-codex').click();
  await expect(reopened.getByRole('combobox', { name: 'Model', exact: true })).toContainText(/GPT 5\.5/i);
});
