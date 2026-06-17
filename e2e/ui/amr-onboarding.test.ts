import { expect, test } from '@/playwright/suite';
import type { Locator, Page } from '@playwright/test';

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
  const statusCallsBeforeLogin = await page.evaluate(() => window.__amrOnboardingStatusCalls ?? 0);
  await continueButton.click();

  await expect.poll(() => page.evaluate(() => window.__amrOnboardingLoginCalls ?? 0)).toBe(1);
  await expect
    .poll(() => page.evaluate(() => window.__amrOnboardingStatusCalls ?? 0))
    .toBeGreaterThan(statusCallsBeforeLogin);
  // Login success lands on the About-you step; advance past it to the
  // newsletter step, which is now the final step that hosts Finish setup.
  await expect(page.getByRole('button', { name: /^Continue$/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expect(page.getByRole('button', { name: /Finish setup/i })).toBeVisible({ timeout: 10_000 });
  await expectOnboardingFinished(page);
  await pollStoredConfig(page).toMatchObject({
    agentId: 'amr',
    onboardingCompleted: true,
  });
});

test('[P0] onboarding signed-out AMR authorization cannot be skipped or bypassed', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
    keepAmrLoginIncomplete: true,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await expect(page.getByRole('button', { name: /Skip for now/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Continue$/i })).toHaveCount(0);

  const signIn = page.getByRole('button', { name: /sign in to continue/i });
  await expect(signIn).toBeVisible();

  const aboutYouStep = page.getByRole('button', { name: /About you|了解你/i });
  await expect(aboutYouStep).toBeDisabled();
  await aboutYouStep.click({ force: true });
  await expect(page.getByRole('heading', { name: /Choose a runtime|选择运行方式/i })).toBeVisible();
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);

  await signIn.click();
  await expect.poll(() => page.evaluate(() => window.__amrOnboardingLoginCalls ?? 0)).toBe(1);
  await expect(page.getByRole('button', { name: /Cancel sign-in/i })).toBeVisible();
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);
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

test('[P0] onboarding Local CLI path stays gated when no local CLI is available', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: false,
    initialLoggedIn: false,
    localAgents: [],
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await page.getByRole('button', { name: /Local coding agent/i }).click();
  await expect(page.getByText('Local CLI')).toBeVisible();
  await expect(page.getByText(/No agents detected|No local CLI detected/i)).toBeVisible();

  const continueButton = page.getByRole('button', { name: /^Continue$/i });
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('heading', { name: /Choose a runtime|选择运行方式/i })).toBeVisible();
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);
});

test('[P0] onboarding Local CLI path stays gated while local agent scan is still running', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: false,
    initialLoggedIn: false,
    agentsDelayMs: 600,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await page.getByRole('button', { name: /Local coding agent/i }).click();
  await expect(page.getByRole('button', { name: /Scanning|扫描中/i })).toBeVisible();

  const continueButton = page.getByRole('button', { name: /^Continue$/i });
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('heading', { name: /Choose a runtime|选择运行方式/i })).toBeVisible();
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);
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

  // Recovery lands on About you; step through to the newsletter step where
  // Finish setup now lives.
  await expect(page.getByRole('button', { name: /^Continue$/i })).toBeVisible({ timeout: 12_000 });
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expect(page.getByRole('button', { name: /Finish setup/i })).toBeVisible({ timeout: 12_000 });
});

test('[P0] onboarding signed-in AMR status failure stays gated instead of bypassing Connect', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
    failAllStatusPolls: true,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await expect
    .poll(() => page.evaluate(() => window.__amrOnboardingStatusCalls ?? 0))
    .toBeGreaterThanOrEqual(1);
  await expect(page.getByRole('button', { name: /Skip for now/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Continue$/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /sign in to continue/i })).toBeVisible();

  const aboutYouStep = page.getByRole('button', { name: /About you|了解你/i });
  await expect(aboutYouStep).toBeDisabled();
  await aboutYouStep.click({ force: true });
  await expect(page.getByRole('heading', { name: /Choose a runtime|选择运行方式/i })).toBeVisible();
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole('heading', { name: /Choose a runtime|选择运行方式/i })).toBeVisible();
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
  const selectedModel = 'deepseek-v4-flash';
  await selectOnboardingOption(amrCard, 'Model', 'DeepSeek V4 Flash');
  await expect(expectOnboardingTrigger(amrCard, 'Model')).toContainText('DeepSeek V4 Flash');
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

test('[P0] @critical onboarding signed-in AMR path finishes setup with the selected runtime model', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
    amrModels: [
      { id: 'claude-opus-4.8', label: 'Claude Opus 4.8' },
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    ],
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  const amrCard = page.locator('.onboarding-view__amr-cloud-card');
  await expect(amrCard.getByRole('button', { name: /Open Design AMR/i })).toBeVisible();
  await expect(amrCard).toContainText('Officially recommended');
  await expect(amrCard).toContainText('No deploy needed');
  await selectOnboardingOption(amrCard, 'Model', 'DeepSeek V4 Flash');
  await expect(expectOnboardingTrigger(amrCard, 'Model')).toContainText('DeepSeek V4 Flash');

  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expect(page.getByText(/Optional details for better defaults/i)).toBeVisible();
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await page.getByRole('button', { name: /Finish setup/i }).click();

  await expect(page).not.toHaveURL(/\/onboarding$/);
  await pollStoredConfig(page).toMatchObject({
    agentId: 'amr',
    onboardingCompleted: true,
    agentModels: {
      amr: {
        model: 'deepseek-v4-flash',
      },
    },
  });
});

test('[P0] onboarding AMR model selection carries into the first Home run request', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
    amrModels: [
      { id: 'claude-opus-4.8', label: 'Claude Opus 4.8' },
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    ],
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  const amrCard = page.locator('.onboarding-view__amr-cloud-card');
  await selectOnboardingOption(amrCard, 'Model', 'DeepSeek V4 Flash');
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await page.getByRole('button', { name: /Finish setup/i }).click();
  await expectOnboardingFinished(page);

  let runBody: Record<string, unknown> | null = null;
  await page.route('**/api/runs', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    runBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: 'amr-onboarding-first-run' }),
    });
  });
  await page.route('**/api/runs/amr-onboarding-first-run/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: [
        'event: start',
        'data: {"bin":"vela"}',
        '',
        'event: end',
        'data: {"code":0,"status":"succeeded"}',
        '',
        '',
      ].join('\n'),
    });
  });

  const input = page.getByTestId('home-hero-input');
  await expect(input).toBeVisible();
  await input.fill('Create an AMR onboarding carryover smoke artifact.');
  await expect(page.getByTestId('home-hero-submit')).toBeEnabled();
  await page.getByTestId('home-hero-submit').click();

  await expect.poll(() => runBody, { timeout: 10_000 }).toMatchObject({
    agentId: 'amr',
    model: 'deepseek-v4-flash',
  });
});

test('[P0] onboarding gate cannot be bypassed by direct Home navigation or new-tab shortcuts', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
    keepAmrLoginIncomplete: true,
  });

  await seedOnboardingConfig(page, config);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
  await expect(page.getByRole('heading', { name: /Choose a runtime|选择运行方式/i })).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding$/);

  const newTabButton = page.getByTestId('workspace-tabs-new-tab');
  await expect(newTabButton).toBeDisabled();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+T' : 'Control+T');
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole('heading', { name: /Choose a runtime|选择运行方式/i })).toBeVisible();
});

test('[P0] onboarding Connect step exposes no Skip affordance', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  // "Skip for now" was removed — Connect is now a required step, so there is
  // no way to exit onboarding from here without connecting a runtime.
  await expect(page.getByRole('button', { name: /Skip for now/i })).toHaveCount(0);
});

test('[P0] onboarding visited steps become locked again when the Connect runtime becomes invalid', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expect(page.getByText(/Optional details for better defaults/i)).toBeVisible();
  await page.getByRole('button', { name: /^Back$/i }).click();
  await expect(page.getByRole('heading', { name: /Choose a runtime|选择运行方式/i })).toBeVisible();

  await page.getByRole('button', { name: /Bring your own key/i }).click();
  const aboutYouStep = page.getByRole('button', { name: /About you|了解你/i });
  await expect(aboutYouStep).toBeDisabled();
  await aboutYouStep.click({ force: true });

  const continueButton = page.getByRole('button', { name: /^Continue$/i });
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('heading', { name: /Choose a runtime|选择运行方式/i })).toBeVisible();
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);
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

  // About you is no longer the final step; advance to the newsletter step
  // before finishing.
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await page.getByRole('button', { name: /Finish setup/i }).click();

  await expectOnboardingFinished(page);
  await pollStoredConfig(page).toMatchObject({
    onboardingCompleted: true,
  });
});

test('[P0] onboarding newsletter email is optional and blank email can finish setup', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });
  let newsletterCalls = 0;
  await page.route('https://open-design.ai/subscribe', async (route) => {
    newsletterCalls += 1;
    await route.fulfill({ json: { ok: true } });
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);
  await advanceToNewsletterStep(page);

  await expect(page.getByPlaceholder('you@studio.com')).toHaveValue('');
  await page.getByRole('button', { name: /Finish setup/i }).click();

  await expectOnboardingFinished(page);
  await expect.poll(() => newsletterCalls).toBe(0);
  await pollStoredConfig(page).toMatchObject({
    onboardingCompleted: true,
  });
});

test('[P0] onboarding newsletter malformed email does not block finishing setup', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });
  let newsletterCalls = 0;
  await page.route('https://open-design.ai/subscribe', async (route) => {
    newsletterCalls += 1;
    await route.fulfill({ json: { ok: true } });
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);
  await advanceToNewsletterStep(page);

  await page.getByPlaceholder('you@studio.com').fill('not-an-email');
  await page.getByRole('button', { name: /Finish setup/i }).click();

  await expectOnboardingFinished(page);
  await expect.poll(() => newsletterCalls).toBe(0);
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
  const byokPanel = page.locator('.onboarding-view__setup-panel').filter({ hasText: /BYOK/ });

  await fillInlineField(page, 'API key', 'test-api-key');
  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  await page.getByRole('button', { name: /Fetch models/i }).click();
  await expect(page.getByRole('status')).toContainText('Fetched 2 models.');
  await selectOnboardingOption(byokPanel, 'Model', 'claude-opus-4-8');

  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectProviderConnectionSuccess(page);

  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expect(page.getByText(/Optional details for better defaults/i)).toBeVisible();
  // Advance from About you to the newsletter step, then finish.
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await page.getByRole('button', { name: /Finish setup/i }).click();

  await expectOnboardingFinished(page);
  await pollStoredConfig(page).toMatchObject({
    mode: 'api',
    apiKey: 'test-api-key',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-opus-4-8',
    onboardingCompleted: true,
  });
});

test('[P0] onboarding BYOK path cannot continue before a successful connection test', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });

  let connectionOk = false;
  await page.route('**/api/provider/models', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 14,
        models: [{ id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' }],
      },
    });
  });
  await page.route('**/api/test/connection', async (route) => {
    await route.fulfill({
      json: connectionOk
        ? {
            ok: true,
            kind: 'success',
            latencyMs: 18,
            model: 'claude-sonnet-4-5',
            sample: 'Connected',
          }
        : {
            ok: false,
            kind: 'error',
            latencyMs: 18,
            error: 'Invalid API key',
          },
    });
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await page.getByRole('button', { name: /Bring your own key/i }).click();
  await expect(page.getByText('BYOK')).toBeVisible();
  const byokPanel = page.locator('.onboarding-view__setup-panel').filter({ hasText: /BYOK/ });

  const continueButton = page.getByRole('button', { name: /^Continue$/i });
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('heading', { name: /Choose a runtime|选择运行方式/i })).toBeVisible();

  await fillInlineField(page, 'API key', 'bad-api-key');
  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  await page.getByRole('button', { name: /Fetch models/i }).click();
  await expect(page.getByRole('status')).toContainText('Fetched 1 model');
  await selectOnboardingOption(byokPanel, 'Model', 'Claude Sonnet 4.5');
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');

  await page.getByRole('button', { name: /^Test$/i }).click();
  await expect(page.getByText(/Invalid API key|Connection failed|failed/i)).toBeVisible();
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');

  connectionOk = true;
  await fillInlineField(page, 'API key', 'good-api-key');
  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectProviderConnectionSuccess(page);
  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');
});

test('[P0] onboarding BYOK successful test is invalidated when connection settings change', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });

  await page.route('**/api/provider/models', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 11,
        models: [{ id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' }],
      },
    });
  });
  await page.route('**/api/test/connection', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 16,
        model: 'claude-sonnet-4-5',
        sample: 'Connected',
      },
    });
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await page.getByRole('button', { name: /Bring your own key/i }).click();
  const byokPanel = page.locator('.onboarding-view__setup-panel').filter({ hasText: /BYOK/ });
  const continueButton = page.getByRole('button', { name: /^Continue$/i });

  await fillInlineField(page, 'API key', 'valid-api-key');
  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  await page.getByRole('button', { name: /Fetch models/i }).click();
  await expect(page.getByRole('status')).toContainText('Fetched 1 model');
  await selectOnboardingOption(byokPanel, 'Model', 'Claude Sonnet 4.5');
  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectProviderConnectionSuccess(page);
  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');

  await fillInlineField(page, 'API key', 'changed-api-key');

  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('heading', { name: /Choose a runtime|选择运行方式/i })).toBeVisible();
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);
});

test('[P0] onboarding BYOK successful test is invalidated when Base URL or model changes', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });

  await page.route('**/api/provider/models', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 12,
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
        latencyMs: 17,
        model: 'claude-sonnet-4-5',
        sample: 'Connected',
      },
    });
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await page.getByRole('button', { name: /Bring your own key/i }).click();
  const byokPanel = page.locator('.onboarding-view__setup-panel').filter({ hasText: /BYOK/ });
  const continueButton = page.getByRole('button', { name: /^Continue$/i });

  await fillInlineField(page, 'API key', 'valid-api-key');
  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  await page.getByRole('button', { name: /Fetch models/i }).click();
  await expect(page.getByRole('status')).toContainText('Fetched 2 models');
  await selectOnboardingOption(byokPanel, 'Model', 'Claude Sonnet 4.5');
  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectProviderConnectionSuccess(page);
  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');

  await fillInlineField(page, 'Base URL', 'https://api.changed.example');
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');

  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectProviderConnectionSuccess(page);
  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');

  await selectOnboardingOption(byokPanel, 'Model', 'Claude Opus 4.8');
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('heading', { name: /Choose a runtime|选择运行方式/i })).toBeVisible();
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);
});

async function wireOnboardingMocks(
  page: Page,
  options: {
    amrAvailable: boolean;
    initialLoggedIn: boolean;
    failAllStatusPolls?: boolean;
    failFirstStatusPollAfterLogin?: boolean;
    keepAmrLoginIncomplete?: boolean;
    delaySignedOutStatusMs?: number;
    agentsDelayMs?: number;
    amrModels?: Array<{ id: string; label: string }>;
    codexModels?: Array<{ id: string; label: string }>;
    localAgents?: Array<{
      id: string;
      name: string;
      bin: string;
      available: boolean;
      version: string;
      models: Array<{ id: string; label: string }>;
    }>;
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

  const localAgents = options.localAgents ?? [{
    id: 'codex',
    name: 'Codex CLI',
    bin: 'codex',
    available: true,
    version: 'test',
    models: options.codexModels ?? [{ id: 'default', label: 'Default' }],
  }];

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
    ...localAgents,
  ];

  await page.route('**/api/agents**', async (route) => {
    if (options.agentsDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.agentsDelayMs));
    }
    await fulfillAgentsRoute(route, agents);
  });

  await page.route('**/api/integrations/vela/status', async (route) => {
    statusCalls += 1;
    await page.evaluate((calls) => {
      window.__amrOnboardingStatusCalls = calls;
    }, statusCalls);
    if (options.failAllStatusPolls) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'status unavailable' }),
      });
      return;
    }
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
  // The "Welcome" hero title was removed; the Connect step's "Choose a
  // runtime" heading is the stable marker that onboarding has rendered.
  await expect(
    page.getByRole('heading', { name: /Choose a runtime|选择运行方式/i }),
  ).toBeVisible();
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

async function advanceToNewsletterStep(page: Page) {
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expect(page.getByText(/Optional details for better defaults/i)).toBeVisible();
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expect(page.getByRole('button', { name: /Finish setup/i })).toBeVisible();
}

async function expectProviderConnectionSuccess(page: Page) {
  await expect(page.getByText(/Connected\. Replied in \d+ ms/)).toBeVisible();
}

function pollStoredConfig(page: Page) {
  return expect.poll(() =>
    page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || '{}'), STORAGE_KEY),
  );
}

type OnboardingLocatorRoot = Page | Locator;

function onboardingField(root: OnboardingLocatorRoot, label: string) {
  return root.locator('.onboarding-view__select-field, .onboarding-view__inline-field').filter({
    hasText: new RegExp(label, 'i'),
  }).first();
}

function expectOnboardingTrigger(root: OnboardingLocatorRoot, label: string) {
  return onboardingField(root, label).getByRole('button');
}

async function selectOnboardingOption(root: OnboardingLocatorRoot, label: string, option: string) {
  const field = onboardingField(root, label);
  const listbox = field.getByRole('listbox', { name: new RegExp(label, 'i') });
  if (!(await listbox.isVisible().catch(() => false))) {
    await field.getByRole('button').click();
  }
  await listbox.getByRole('option').filter({ hasText: new RegExp(option, 'i') }).first().click();
}

async function fillInlineField(page: Page, label: string, value: string) {
  await onboardingField(page, label).locator('input').fill(value);
}
