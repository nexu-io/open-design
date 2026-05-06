import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

async function bootstrapWithLegacyConfig(
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

test('legacy known OpenAI provider switches to the matching Anthropic preset', async ({ page }) => {
  await bootstrapWithLegacyConfig(page, {
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
  await bootstrapWithLegacyConfig(page, {
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
