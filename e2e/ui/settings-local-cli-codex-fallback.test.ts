import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';
const LOCALE_KEY = 'open-design:locale';

type AppConfigSeed = Record<string, unknown>;

type AgentFixture = {
  id: string;
  name: string;
  bin: string;
  available: boolean;
  version?: string | null;
  models?: Array<{ id: string; label: string }>;
};

type ConnectionTestFixture = {
  ok: boolean;
  kind: string;
  latencyMs: number;
  agentName?: string;
  sample?: string;
  detail?: string;
  configuredExecutablePath?: string;
  detectedExecutablePath?: string;
  usedExecutablePath?: string;
  usedExecutableSource?: 'configured' | 'path' | 'fallback_invalid' | 'fallback_failed';
};

const CODEX_AGENT: AgentFixture = {
  id: 'codex',
  name: 'Codex CLI',
  bin: 'codex',
  available: true,
  version: '0.130.0',
  models: [{ id: 'default', label: 'Default' }],
};

function baseConfig(overrides: Partial<AppConfigSeed> = {}): AppConfigSeed {
  return {
    mode: 'daemon',
    apiKey: '',
    apiProtocol: 'openai',
    apiVersion: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    apiProviderBaseUrl: 'https://api.openai.com/v1',
    agentId: 'codex',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {},
    agentCliEnv: {},
    ...overrides,
  };
}

async function readSavedConfig(page: Page) {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);
}

async function openLocalCliSettings(
  page: Page,
  {
    config,
    locale = 'en',
    agents = [CODEX_AGENT],
    onConnectionTest,
  }: {
    config: AppConfigSeed;
    locale?: string;
    agents?: AgentFixture[];
    onConnectionTest: (payload: Record<string, unknown>) => ConnectionTestFixture;
  },
) {
  await page.addInitScript(
    ({ key, value, localeKey, localeValue }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
      window.localStorage.setItem(localeKey, localeValue);
    },
    { key: STORAGE_KEY, value: config, localeKey: LOCALE_KEY, localeValue: locale },
  );

  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"ok":true}',
    });
  });

  await page.route('**/api/agents', async (route) => {
    await route.fulfill({ json: { agents } });
  });

  await page.route('**/api/test/connection', async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(onConnectionTest(payload)),
    });
  });

  await page.goto('/');
  await page.getByTitle('Configure execution mode').click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('tab', { name: /Local CLI.*1 installed/i }).click();
  await expect(dialog.getByRole('button', { name: /Codex CLI/i })).toBeVisible();
  return dialog;
}

test.describe('Settings Local CLI Codex fallback UX', () => {
  test('shows fallback repair actions and can replace the saved path with the detected Codex binary', async ({ page }) => {
    const configuredPath = '/bad/codex';
    const detectedPath = '/usr/local/bin/codex';
    let lastRequest: Record<string, unknown> | null = null;

    const dialog = await openLocalCliSettings(page, {
      config: baseConfig({
        agentCliEnv: { codex: { CODEX_BIN: configuredPath } },
      }),
      onConnectionTest: (payload) => {
        lastRequest = payload;
        return {
          ok: true,
          kind: 'success',
          latencyMs: 18,
          agentName: 'Codex CLI',
          sample: 'ready',
          configuredExecutablePath: configuredPath,
          detectedExecutablePath: detectedPath,
          usedExecutablePath: detectedPath,
          usedExecutableSource: 'fallback_invalid',
        };
      },
    });

    await expect(dialog.getByLabel('Codex executable path')).toHaveValue(configuredPath);
    await dialog.getByRole('button', { name: 'Test' }).click();

    const status = dialog.locator('.settings-test-status');
    await expect(dialog.getByText('Use detected Codex')).toBeVisible();
    await expect(dialog.getByText('Clear custom path')).toBeVisible();
    await expect(dialog.getByText('The saved Codex path is not the binary this test should keep using.')).toBeVisible();
    await expect(status).toContainText(configuredPath);
    await expect(status).toContainText(detectedPath);

    expect(lastRequest).toMatchObject({
      mode: 'agent',
      agentId: 'codex',
      agentCliEnv: {
        codex: {
          CODEX_BIN: configuredPath,
        },
      },
    });

    await dialog.getByRole('button', { name: 'Use detected Codex' }).click();
    await expect.poll(async () => readSavedConfig(page)).toMatchObject({
      agentCliEnv: {
        codex: {
          CODEX_BIN: detectedPath,
        },
      },
    });
    await expect(dialog.getByLabel('Codex executable path')).toHaveValue(detectedPath);
    await expect(dialog.getByRole('button', { name: 'Use detected Codex' })).toHaveCount(0);
  });

  test('can clear an unusable custom Codex path after a fallback_failed test result', async ({ page }) => {
    const configuredPath = '/Applications/Codex.app/Contents/Resources/codex';
    const detectedPath = '/opt/homebrew/bin/codex';

    const dialog = await openLocalCliSettings(page, {
      config: baseConfig({
        agentCliEnv: { codex: { CODEX_BIN: configuredPath } },
      }),
      onConnectionTest: () => ({
        ok: true,
        kind: 'success',
        latencyMs: 33,
        agentName: 'Codex CLI',
        sample: 'fallback ok',
        configuredExecutablePath: configuredPath,
        detectedExecutablePath: detectedPath,
        usedExecutablePath: detectedPath,
        usedExecutableSource: 'fallback_failed',
      }),
    });

    await dialog.getByRole('button', { name: 'Test' }).click();
    const status = dialog.locator('.settings-test-status');
    await expect(dialog.getByRole('button', { name: 'Clear custom path' })).toBeVisible();
    await expect(status).toContainText(configuredPath);
    await expect(status).toContainText(detectedPath);

    await dialog.getByRole('button', { name: 'Clear custom path' }).click();

    await expect.poll(async () => readSavedConfig(page)).toMatchObject({
      agentCliEnv: {},
    });
    await expect(dialog.getByLabel('Codex executable path')).toHaveValue('');
    await expect(dialog.getByRole('button', { name: 'Clear custom path' })).toHaveCount(0);
  });

  test('reports when the configured Codex path itself succeeds and does not show repair actions', async ({ page }) => {
    const configuredPath = '/Users/test/.nvm/versions/node/v24.14.1/bin/codex';

    const dialog = await openLocalCliSettings(page, {
      config: baseConfig({
        agentCliEnv: { codex: { CODEX_BIN: configuredPath } },
      }),
      onConnectionTest: () => ({
        ok: true,
        kind: 'success',
        latencyMs: 12,
        agentName: 'Codex CLI',
        sample: 'ok',
        configuredExecutablePath: configuredPath,
        usedExecutablePath: configuredPath,
        usedExecutableSource: 'configured',
      }),
    });

    await dialog.getByRole('button', { name: 'Test' }).click();

    await expect(dialog.locator('.settings-test-status')).toContainText(
      `This test used the configured Codex path: ${configuredPath}.`,
    );
    await expect(dialog.getByRole('button', { name: 'Use detected Codex' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Clear custom path' })).toHaveCount(0);
  });

  test('shows localized zh-CN fallback messaging and repair actions', async ({ page }) => {
    const configuredPath = '/bad/codex';
    const detectedPath = '/usr/local/bin/codex';

    const dialog = await openLocalCliSettings(page, {
      locale: 'zh-CN',
      config: baseConfig({
        agentCliEnv: { codex: { CODEX_BIN: configuredPath } },
      }),
      onConnectionTest: () => ({
        ok: true,
        kind: 'success',
        latencyMs: 21,
        agentName: 'Codex CLI',
        sample: 'ready',
        configuredExecutablePath: configuredPath,
        detectedExecutablePath: detectedPath,
        usedExecutablePath: detectedPath,
        usedExecutableSource: 'fallback_invalid',
      }),
    });

    await dialog.getByRole('button', { name: '测试' }).click();

    const status = dialog.locator('.settings-test-status');
    await expect(status).toContainText('当前配置的 Codex 路径无效');
    await expect(status).toContainText(configuredPath);
    await expect(status).toContainText(detectedPath);
    await expect(dialog.getByText('当前保存的 Codex 路径不适合继续使用。')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '使用检测到的 Codex' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '清空自定义路径' })).toBeVisible();
  });
});
