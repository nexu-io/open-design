import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { dismissPrivacyDialog, STORAGE_KEY, waitForLoadingToClear } from '@/playwright/amr';
import { fulfillAgentsRoute } from '@/playwright/mock-factory';

type OnboardingConfig = {
  mode: 'daemon';
  apiKey: string;
  baseUrl: string;
  model: string;
  agentId: string | null;
  skillId: null;
  designSystemId: null;
  onboardingCompleted: boolean;
  mediaProviders: Record<string, never>;
  agentModels: Record<string, { model: string; reasoning: string }>;
};

declare global {
  interface Window {
    __amrOnboardingCancelCalls?: number;
    __amrOnboardingDelayNextSignedOutStatus?: boolean;
    __amrOnboardingLoginCalls?: number;
    __amrOnboardingSlowStatusResolved?: boolean;
    __amrOnboardingStatusCalls?: number;
  }
}

test.describe.configure({ timeout: 30_000 });

test('[P0] @critical onboarding lets AMR Cloud sign in and complete setup after the login poll succeeds', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
  });

  await seedOnboardingConfig(page, config);

  await gotoOnboarding(page);

  const continueButton = page.getByRole('button', { name: /sign in to continue/i });
  await expect(continueButton).toBeVisible();
  await continueButton.click();

  await expect(page.getByRole('button', { name: /Continue/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Continue/i }).click();

  await expectOnboardingFinished(page);
  await pollStoredConfig(page).toMatchObject({
    agentId: 'amr',
    onboardingCompleted: true,
  });
});

test('[P0] @critical onboarding Local CLI card lets the user pick an agent model before continuing', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: false,
    initialLoggedIn: false,
    codexModels: [
      { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
      { id: 'gpt-5.5', label: 'gpt-5.5' },
      { id: 'o3', label: 'o3' },
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      { id: 'glm-5', label: 'GLM 5' },
      { id: 'qwen3-235b', label: 'Qwen3 235B' },
      { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'kimi-k2.6', label: 'Kimi K2.6' },
    ],
  });

  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: config },
  );

  await gotoOnboarding(page);

  await page.getByRole('button', { name: /Local coding agent/i }).click();
  await selectOnboardingOption(page, 'Model', 'GLM 5');

  await expect(expectOnboardingTrigger(page, 'Model')).toContainText('GLM 5');
  await expect(page.getByRole('button', { name: /Continue/i })).toBeVisible();
});

test('[P0] onboarding falls back to Local CLI when AMR is unavailable', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: false,
    initialLoggedIn: false,
  });

  await seedOnboardingConfig(page, config);

  await gotoOnboarding(page);

  await expect(page.getByRole('button', { name: /AMR Cloud/i })).toHaveCount(0);
  await page.getByRole('button', { name: /Local coding agent/i }).click();
  await expect(page.getByText('Local CLI')).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue/i })).toBeVisible();
});

test('[P0] onboarding recovers from a transient AMR status failure and still continues after login completes', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
    failFirstStatusPollAfterLogin: true,
  });

  await seedOnboardingConfig(page, config);

  await gotoOnboarding(page);

  await page.getByRole('button', { name: /sign in to continue/i }).click();

  await expect(page.getByRole('button', { name: /Continue/i })).toBeVisible({ timeout: 12_000 });
});

test('[P0] onboarding lets the user cancel an incomplete AMR sign-in and retry', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
    keepAmrLoginIncomplete: true,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await page.getByRole('button', { name: /sign in to continue/i }).click();

  await expect(page.getByRole('button', { name: /Signing in/i })).toBeVisible();
  const cancelSignIn = page.getByRole('button', { name: /Cancel sign-in/i });
  await expect(cancelSignIn).toBeVisible();
  await cancelSignIn.click();

  await expect(page.getByRole('button', { name: /sign in to continue/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Signing in/i })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__amrOnboardingCancelCalls ?? 0)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__amrOnboardingLoginCalls ?? 0)).toBe(1);

  await page.getByRole('button', { name: /sign in to continue/i }).click();

  await expect.poll(() => page.evaluate(() => window.__amrOnboardingLoginCalls ?? 0)).toBe(2);
  await expect(page.getByRole('button', { name: /Cancel sign-in/i })).toBeVisible();
});

test('[P0] onboarding cancel during a slow AMR status check does not start login', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
    keepAmrLoginIncomplete: true,
    delaySignedOutStatusMs: 350,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);
  await expect
    .poll(() => page.evaluate(() => window.__amrOnboardingStatusCalls ?? 0))
    .toBeGreaterThanOrEqual(1);

  await page.evaluate(() => {
    window.__amrOnboardingDelayNextSignedOutStatus = true;
    window.__amrOnboardingSlowStatusResolved = false;
  });
  await page.getByRole('button', { name: /sign in to continue/i }).click();

  const cancelSignIn = page.getByRole('button', { name: /Cancel sign-in/i });
  await expect(cancelSignIn).toBeVisible();
  await cancelSignIn.click();

  await expect(page.getByRole('button', { name: /sign in to continue/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__amrOnboardingCancelCalls ?? 0)).toBe(1);
  await expect
    .poll(() => page.evaluate(() => window.__amrOnboardingSlowStatusResolved ?? false))
    .toBe(true);
  await page.waitForTimeout(250);
  await expect(page.getByRole('button', { name: /Signing in/i })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__amrOnboardingLoginCalls ?? 0)).toBe(0);
});

test('[P0] onboarding AMR card lets the user pick a live runtime model before continuing', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
    amrModels: [
      { id: 'claude-opus-4.8', label: 'Claude Opus 4.8' },
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      { id: 'glm-5.1', label: 'GLM 5.1' },
    ],
  });

  await seedOnboardingConfig(page, config);

  await gotoOnboarding(page);

  const amrCard = page.locator('.onboarding-view__amr-cloud-card');
  await expect(amrCard.getByRole('button', { name: /Open Design AMR/i })).toBeVisible();
  let selectedModel = 'deepseek-v4-flash';
  const modelSelect = page.locator('.onboarding-view__model-picker select');
  if ((await modelSelect.count()) > 0) {
    const optionValues = await modelSelect.locator('option').evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
    );
    expect(optionValues.length).toBeGreaterThan(0);
    selectedModel = optionValues.includes(selectedModel)
      ? selectedModel
      : optionValues[0]!;
    await modelSelect.selectOption(selectedModel);
    await expect(modelSelect).toHaveValue(selectedModel);
  } else {
    selectedModel = 'glm-5.1';
    const modelPicker = amrCard.getByRole('combobox', { name: /Model.*AMR CLI/i });
    await modelPicker.click();
    const popover = page.getByTestId('onboarding-amr-model-popover');
    await expect(popover).toBeVisible();
    const search = page.getByTestId('onboarding-amr-model-search');
    if ((await search.count()) > 0) {
      await expect(search).toBeVisible();
      await search.fill('glm');
    }
    await popover.getByRole('option', { name: 'GLM 5.1' }).click();
  }
  await expect
    .poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || '{}'), STORAGE_KEY))
    .toMatchObject({
      agentModels: {
        amr: {
          model: selectedModel,
        },
      },
    });
  await page.getByRole('button', { name: /Continue/i }).click();

  await expect
    .poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || '{}'), STORAGE_KEY))
    .toMatchObject({
      agentId: 'amr',
      agentModels: {
        amr: {
          model: selectedModel,
        },
      },
    });
});

test('[P0] onboarding skip exits to home and marks onboarding completed', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await page.getByRole('button', { name: /Skip for now/i }).click();

  await expectOnboardingFinished(page);
  await pollStoredConfig(page).toMatchObject({
    onboardingCompleted: true,
  });
});

test('[P0] onboarding about-you step accepts profile selections and completes setup', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expect(page.getByText(/Optional details for better defaults/i)).toBeVisible();

  await selectOnboardingOption(page, 'Your role', 'Engineer');
  await selectOnboardingOption(page, 'Organization size', 'Growth company');
  await selectOnboardingOption(page, 'Use case', 'Product design');
  await selectOnboardingOption(page, 'Use case', 'Prototype / app UI');
  await page.keyboard.press('Escape');
  await selectOnboardingOption(page, 'Where did you hear about us?', 'Search');

  await expect(expectOnboardingTrigger(page, 'Your role')).toContainText('Engineer');
  await expect(expectOnboardingTrigger(page, 'Organization size')).toContainText('Growth company');
  await expect(expectOnboardingTrigger(page, 'Use case')).toContainText('Product design');
  await expect(expectOnboardingTrigger(page, 'Use case')).toContainText('Prototype / app UI');
  await expect(expectOnboardingTrigger(page, 'Where did you hear about us?')).toContainText('Search');

  await page.getByRole('button', { name: /^Continue$/i }).click();

  await expectOnboardingFinished(page);
  await pollStoredConfig(page).toMatchObject({
    onboardingCompleted: true,
  });
});

test('[P0] @critical onboarding BYOK path can fetch models, test the provider, and complete setup', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });

  await page.route('**/api/provider/models', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 14,
        models: [
          { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
          { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
        ],
      },
    });
  });
  await page.route('**/api/test/connection', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 27,
        model: 'claude-opus-4-8',
        sample: 'Connected',
      },
    });
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await page.getByRole('button', { name: /Bring your own key/i }).click();
  await expect(page.getByText('BYOK')).toBeVisible();

  await fillInlineField(page, 'API key', 'test-api-key');
  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  await page.getByRole('button', { name: /Fetch models/i }).click();
  await expect(page.getByRole('status')).toContainText('Fetched 2 models.');
  await selectOnboardingOption(page, 'Model', 'claude-opus-4-8');

  await page.getByRole('button', { name: /^Test$/i }).click();
  await expect(page.getByText('Connected. Replied in 27 ms')).toBeVisible();

  await page.getByRole('button', { name: /^Continue$/i }).click();
  await page.getByRole('button', { name: /^Continue$/i }).click();

  await expectOnboardingFinished(page);
  await pollStoredConfig(page).toMatchObject({
    mode: 'api',
    apiKey: 'test-api-key',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-opus-4-8',
    onboardingCompleted: true,
  });
});

async function wireOnboardingMocks(
  page: Page,
  options: {
    amrAvailable: boolean;
    initialLoggedIn: boolean;
    failFirstStatusPollAfterLogin?: boolean;
    keepAmrLoginIncomplete?: boolean;
    delaySignedOutStatusMs?: number;
    amrModels?: Array<{ id: string; label: string }>;
    codexModels?: Array<{ id: string; label: string }>;
  },
): Promise<OnboardingConfig> {
  const config: OnboardingConfig = {
    mode: 'daemon',
    apiKey: '',
    baseUrl: '',
    model: '',
    agentId: options.amrAvailable ? 'amr' : 'codex',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: false,
    mediaProviders: {},
    agentModels: options.amrAvailable
      ? { amr: { model: 'default', reasoning: 'default' } }
      : { codex: { model: 'default', reasoning: 'default' } },
  };

  let loggedIn = options.initialLoggedIn;
  let loginInFlight = false;
  let statusCalls = 0;
  let statusCallsAfterLogin = 0;
  let loginCalls = 0;
  let cancelCalls = 0;

  await page.route('**/api/health', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { config } });
      return;
    }
    if (route.request().method() === 'PUT') {
      Object.assign(config, route.request().postDataJSON() as Partial<OnboardingConfig>);
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.continue();
  });

  const agents = [
    ...(options.amrAvailable
      ? [{
          id: 'amr',
          name: 'AMR (vela)',
          bin: 'vela',
          available: true,
          version: '1.0.0',
          models: options.amrModels ?? [{ id: 'default', label: 'Default' }],
        }]
      : []),
    {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      available: true,
      version: 'test',
      models: options.codexModels ?? [{ id: 'default', label: 'Default' }],
    },
  ];

  await page.route('**/api/agents**', async (route) => {
    await fulfillAgentsRoute(route, agents);
  });

  await page.route('**/api/integrations/vela/status', async (route) => {
    statusCalls += 1;
    await page.evaluate((calls) => {
      window.__amrOnboardingStatusCalls = calls;
    }, statusCalls);
    const shouldDelaySignedOutStatus =
      !loggedIn
      && typeof options.delaySignedOutStatusMs === 'number'
      && options.delaySignedOutStatusMs > 0
      && await page.evaluate(() => {
        if (!window.__amrOnboardingDelayNextSignedOutStatus) return false;
        window.__amrOnboardingDelayNextSignedOutStatus = false;
        return true;
      });
    if (shouldDelaySignedOutStatus) {
      await new Promise((resolve) =>
        setTimeout(resolve, options.delaySignedOutStatusMs),
      );
    }
    if (loggedIn) {
      statusCallsAfterLogin += 1;
      if (options.failFirstStatusPollAfterLogin && statusCallsAfterLogin === 1) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'temporary status failure' }),
        });
        return;
      }
    }
    await route.fulfill({
      json: loggedIn
        ? {
            loggedIn: true,
            loginInFlight: false,
            profile: 'local',
            configPath: '/tmp/.amr/config.json',
            user: { id: 'user-1', email: 'onboarding@example.com', plan: 'free' },
          }
        : {
            loggedIn: false,
            loginInFlight,
            profile: 'local',
            configPath: '/tmp/.amr/config.json',
            user: null,
          },
    });
    if (shouldDelaySignedOutStatus) {
      await page.evaluate(() => {
        window.__amrOnboardingSlowStatusResolved = true;
      });
    }
  });

  await page.route('**/api/integrations/vela/login', async (route) => {
    loginCalls += 1;
    loginInFlight = true;
    if (!options.keepAmrLoginIncomplete) {
      loggedIn = true;
      loginInFlight = false;
    }
    await page.evaluate((calls) => {
      window.__amrOnboardingLoginCalls = calls;
    }, loginCalls);
    await route.fulfill({
      status: 202,
      json: { pid: 4242, startedAt: new Date().toISOString(), profile: 'local' },
    });
  });

  await page.route('**/api/integrations/vela/login/cancel', async (route) => {
    cancelCalls += 1;
    loginInFlight = false;
    await page.evaluate((calls) => {
      window.__amrOnboardingCancelCalls = calls;
    }, cancelCalls);
    await route.fulfill({ json: { canceled: true, pids: [4242] } });
  });

  return config;
}

async function gotoOnboarding(page: Page) {
  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
  await expect(page.getByRole('heading', { name: /Welcome|欢迎/i })).toBeVisible();
}

async function seedOnboardingConfig(page: Page, config: OnboardingConfig) {
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: config },
  );
}

async function expectOnboardingFinished(page: Page) {
  await dismissPrivacyDialog(page);
  const finishSetup = page.getByRole('button', { name: /Finish setup/i });
  if (await finishSetup.isVisible().catch(() => false)) {
    await finishSetup.click();
  }
  await expect(page).not.toHaveURL(/\/onboarding$/);
  await expect(page.getByText('What do you want to design?')).toBeVisible();
}

function pollStoredConfig(page: Page) {
  return expect.poll(() =>
    page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || '{}'), STORAGE_KEY),
  );
}

function onboardingField(page: Page, label: string) {
  return page.locator('.onboarding-view__select-field, .onboarding-view__inline-field').filter({
    hasText: new RegExp(label, 'i'),
  }).first();
}

function expectOnboardingTrigger(page: Page, label: string) {
  return onboardingField(page, label).getByRole('button');
}

async function selectOnboardingOption(page: Page, label: string, option: string) {
  const field = onboardingField(page, label);
  const listbox = field.getByRole('listbox', { name: new RegExp(label, 'i') });
  if (!(await listbox.isVisible().catch(() => false))) {
    await field.getByRole('button').click();
  }
  await listbox.getByRole('option').filter({ hasText: new RegExp(option, 'i') }).first().click();
}

async function fillInlineField(page: Page, label: string, value: string) {
  await onboardingField(page, label).locator('input').fill(value);
}
