import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

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

  await page.goto('/');
  await page.getByTitle('Configure execution mode').click();
  await expect(page.getByRole('dialog')).toBeVisible();
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

  await page.goto('/');
  await page.getByTitle('Configure execution mode').click();
  await expect(page.getByRole('dialog')).toBeVisible();
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

  const protocolTabs = page.getByRole('tablist', { name: 'API protocol' });
  const openAiTab = protocolTabs.getByRole('tab', { name: 'OpenAI', exact: true });
  const anthropicTab = protocolTabs.getByRole('tab', { name: 'Anthropic', exact: true });
  const baseUrlInput = page.getByLabel('Base URL');
  const modelSelect = page.getByLabel('Model');

  await expect(openAiTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'OpenAI API' })).toBeVisible();
  await expect(baseUrlInput).toHaveValue('https://api.deepseek.com');
  await expect(modelSelect).toHaveValue('deepseek-chat');

  await anthropicTab.click();

  await expect(anthropicTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Anthropic API' })).toBeVisible();
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

  const protocolTabs = page.getByRole('tablist', { name: 'API protocol' });
  const openAiTab = protocolTabs.getByRole('tab', { name: 'OpenAI', exact: true });
  const anthropicTab = protocolTabs.getByRole('tab', { name: 'Anthropic', exact: true });
  const baseUrlInput = page.getByLabel('Base URL');
  const customModelInput = page.getByLabel(/Custom model id/i);

  await expect(openAiTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'OpenAI API' })).toBeVisible();
  await expect(baseUrlInput).toHaveValue('https://my-proxy.example.com/v1');
  await expect(customModelInput).toHaveValue('my-custom-model');

  await anthropicTab.click();

  await expect(anthropicTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Anthropic API' })).toBeVisible();
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

  await page.getByRole('tab', { name: 'OpenAI', exact: true }).click();
  await page.getByLabel('Quick fill provider').selectOption('1');
  await expect(page.getByLabel('Model')).toHaveValue('deepseek-chat');
  await expect(page.getByLabel('Base URL')).toHaveValue('https://api.deepseek.com');

  await page.getByRole('button', { name: 'Show' }).click();
  const apiKeyInput = page.getByLabel('API key');
  await expect(apiKeyInput).toHaveAttribute('type', 'text');
  await apiKeyInput.fill('sk-openai-test');

  const saveButton = page.getByRole('button', { name: 'Save', exact: true });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const savedConfig = await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);
  expect(savedConfig).toMatchObject({
    mode: 'api',
    apiProtocol: 'openai',
    apiKey: 'sk-openai-test',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    apiProviderBaseUrl: 'https://api.deepseek.com',
  });

  await page.getByTitle('Configure execution mode').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'OpenAI', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Quick fill provider')).toHaveValue('1');
  await expect(page.getByLabel('Model')).toHaveValue('deepseek-chat');
  await expect(page.getByLabel('Base URL')).toHaveValue('https://api.deepseek.com');
  await expect(page.getByLabel('API key')).toHaveValue('sk-openai-test');
});

test('BYOK save stays disabled until required fields are valid', async ({ page }) => {
  await openExecutionSettings(page, {
    mode: 'api',
    apiKey: '',
    apiProtocol: 'anthropic',
    apiVersion: '',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    apiProviderBaseUrl: 'https://api.anthropic.com',
    agentId: null,
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {},
    agentCliEnv: {},
  });

  const saveButton = page.getByRole('button', { name: 'Save', exact: true });
  await expect(saveButton).toBeDisabled();

  await page.getByLabel('API key').fill('sk-ant-test');
  await expect(saveButton).toBeEnabled();

  await page.getByLabel('Base URL').fill('http://10.0.0.5:11434/v1');
  await expect(saveButton).toBeDisabled();
  await expect(page.locator('#settings-base-url-error')).toContainText('valid public');

  await page.getByLabel('Base URL').fill('http://localhost:11434/v1');
  await expect(saveButton).toBeEnabled();
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

  await page.getByRole('tab', { name: /Local CLI.*1 installed/i }).click();
  await page.getByRole('button', { name: /Codex CLI/i }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const executionPill = page.getByTitle('Configure execution mode');
  await expect(executionPill).toContainText('Local CLI');
  await expect(executionPill).toContainText('Codex CLI');
  await expect(executionPill).toContainText('0.80.0');
});
