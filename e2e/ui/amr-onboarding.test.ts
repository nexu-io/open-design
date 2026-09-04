import { expect, test } from '@/playwright/suite';
import type { Locator, Page } from '@playwright/test';

import {
  dismissPrivacyDialog,
  mockAmrPersonalWorkspace,
  mockAmrWalletSnapshot,
  STORAGE_KEY,
  waitForLoadingToClear,
} from '@/playwright/amr';
import { expectStableCount } from '@/playwright/assertions';
import { ensureRailOpen } from '@/playwright/rail';
import {
  fulfillAgentsRoute,
  routeSuccessfulRuns,
  successfulRunEventBody,
  suppressWhatsNew,
} from '@/playwright/mock-factory';
import { T } from '@/timeouts';

type OnboardingConfig = {
  mode: 'daemon' | 'api';
  apiKey: string;
  apiProtocol?: string;
  baseUrl: string;
  model: string;
  agentId: string | null;
  skillId: null;
  designSystemId: string | null;
  onboardingCompleted: boolean;
  mediaProviders: Record<string, never>;
  agentModels: Record<string, { model: string; reasoning: string }>;
};

declare global {
  interface Window {
    __amrOnboardingCancelCalls?: number;
    __amrOnboardingCompleteLogin?: boolean;
    __amrOnboardingDelayNextSignedOutStatus?: boolean;
    __amrOnboardingLoginCalls?: number;
    __amrOnboardingSlowStatusResolved?: boolean;
    __amrOnboardingStatusCalls?: number;
    __amrOnboardingStatusResponses?: number;
  }
}

test.describe.configure({ timeout: T.xlong });

test.beforeEach(async ({ page }) => {
  await suppressWhatsNew(page);
});

test('[P0] @critical onboarding lets AMR Cloud sign in and complete setup after the login poll succeeds', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
  });

  await seedOnboardingConfig(page, config);

  await gotoOnboarding(page);

  // Signed-out cloud landing: the primary button reads "Sign in to OpenDesign
  // Cloud" and IS the AMR sign-in trigger (it replaced the old "Sign in to
  // continue" AMR-card CTA).
  const primary = cloudPrimaryButton(page);
  await expect(primary).toBeVisible();
  await expect(primary).toHaveText(/Sign in to OpenDesign|登录 OpenDesign/i);
  const statusCallsBeforeLogin = await page.evaluate(() => window.__amrOnboardingStatusCalls ?? 0);
  await clickCloudPrimary(page);

  await expect.poll(() => page.evaluate(() => window.__amrOnboardingLoginCalls ?? 0)).toBe(1);
  await expect
    .poll(() => page.evaluate(() => window.__amrOnboardingStatusCalls ?? 0))
    .toBeGreaterThan(statusCallsBeforeLogin);
  // Login success lands on the model-source chooser. Hosted is recommended
  // and selected by default; accepting it completes the streamlined flow.
  await expectModelSourceChooser(page);
  await continueWithModelSource(page, /OpenDesign Hosted/i);
  await expectOnboardingFinished(page);
  await pollStoredConfig(page).toMatchObject({
    agentId: 'amr',
    onboardingCompleted: true,
  });
});

test('[P0] signed-out onboarding can open Local CLI setup without Cloud authorization', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
    keepAmrLoginIncomplete: true,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  // Local CLI is independent from Cloud identity. The Cloud sign-in remains
  // the primary action while Local CLI is available as a direct setup path.
  const primary = cloudPrimaryButton(page);
  await expect(primary).toBeVisible();
  await expect(primary).toHaveText(/Sign in to OpenDesign|登录 OpenDesign/i);
  await page.getByRole('button', { name: /Local (coding )?agent/i }).click();
  await expect(page.locator('.onboarding-view__setup-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Local (coding )?agent/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__amrOnboardingLoginCalls ?? 0)).toBe(0);

  await page.getByRole('button', { name: /^Back$|返回/i }).click();
  await expect(cloudPrimaryButton(page)).toHaveText(/Sign in to OpenDesign|登录 OpenDesign/i);
  await expect(page.getByRole('radiogroup')).toHaveCount(0);
});

test('[P0] signed-out onboarding can open BYOK setup without Cloud authorization', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
    keepAmrLoginIncomplete: true,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await page.getByRole('button', { name: /Bring Your Own Key/i }).click();
  await expect(page.locator('.onboarding-view__setup-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Bring Your Own Key/i })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__amrOnboardingLoginCalls ?? 0)).toBe(0);

  await page.getByRole('button', { name: /^Back$|返回/i }).click();
  await expect(cloudPrimaryButton(page)).toHaveText(/Sign in to OpenDesign|登录 OpenDesign/i);
  await expect(page.getByRole('radiogroup')).toHaveCount(0);
});

test('[P0] Cloud status loading does not block signed-out Local CLI or BYOK setup', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
    keepAmrLoginIncomplete: true,
    delayAllStatusMs: 5_000,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await expect(cloudPrimaryButton(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: /Local (coding )?agent/i })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Bring Your Own Key/i })).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => window.__amrOnboardingSlowStatusResolved ?? false))
    .toBe(true);
});

test('[P0] delayed active Cloud login stays out of Local setup and resumes after Back', async ({ page }) => {
  let releaseInitialStatus!: () => void;
  const statusGate = new Promise<void>((resolve) => {
    releaseInitialStatus = resolve;
  });
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
    initialLoginInFlight: true,
    keepAmrLoginIncomplete: true,
    statusGate,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await page.getByRole('button', { name: /Local (coding )?agent/i }).click();
  const localPanel = page.locator('.onboarding-view__setup-panel');
  const continueButton = page.getByRole('button', { name: /^Continue$|继续/i });
  await expect(localPanel).toBeVisible();
  await expect(continueButton).toBeEnabled();
  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');

  releaseInitialStatus();
  await expect
    .poll(() => page.evaluate(() => window.__amrOnboardingStatusResponses ?? 0))
    .toBeGreaterThanOrEqual(1);

  await expect(localPanel).toBeVisible();
  await expect(continueButton).toBeEnabled();
  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('radiogroup')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Cancel sign-in/i })).toHaveCount(0);
  await expectStableCount(() => localPanel.count(), 1, {
    timeout: 2_500,
    message: 'a resumed Cloud login must not replace the active Local CLI setup',
  });

  await page.getByRole('button', { name: /^Back$|返回/i }).click();
  await expect(page.getByRole('button', { name: /Cancel sign-in/i })).toBeVisible();
  await page.evaluate(() => {
    window.__amrOnboardingCompleteLogin = true;
  });
  await expectModelSourceChooser(page);
});

test('[P0] @critical onboarding Local CLI card lets the user pick an agent model before continuing', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: false,
    initialLoggedIn: true,
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

  // Choose Local Agent after Cloud identity is resolved. Scanning auto-selects
  // the default agent (codex), so its live model picker is available.
  await openModelSourceSetup(page, /Local Agent/i);
  const localPanel = page.locator('.onboarding-view__setup-panel');
  await expect(localPanel).toBeVisible();
  await selectOnboardingOption(localPanel, 'Model', 'GLM 5');

  await expect(expectOnboardingTrigger(localPanel, 'Model')).toContainText('GLM 5');
  await expect(page.getByRole('button', { name: /^Continue$/i })).not.toHaveAttribute(
    'aria-disabled',
    'true',
  );

  await page.getByRole('button', { name: /^Back$|返回/i }).click();
  await expectModelSourceChooser(page);
});

test('[P0] onboarding Local CLI path completes setup with the selected agent model', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: false,
    initialLoggedIn: true,
    codexModels: [
      { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
      { id: 'glm-5', label: 'GLM 5' },
    ],
  });

  await seedOnboardingConfig(page, config);
  await page.route('**/api/test/connection', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 12,
        model: 'glm-5',
        agentName: 'Codex CLI',
        sample: 'Connected',
      },
    });
  });
  await gotoOnboarding(page);

  await openModelSourceSetup(page, /Local Agent/i);
  const localPanel = page.locator('.onboarding-view__setup-panel');
  await expect(localPanel).toBeVisible();
  await selectOnboardingOption(localPanel, 'Model', 'GLM 5');
  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectConnectionSuccess(page);
  await page.getByRole('button', { name: /^Continue$/i }).click();

  await expectOnboardingFinished(page);
  await pollStoredConfig(page).toMatchObject({
    mode: 'daemon',
    agentId: 'codex',
    agentModels: {
      codex: { model: 'glm-5' },
    },
    onboardingCompleted: true,
  });
});

test('[P0] onboarding Local CLI path stays gated when no local CLI is available', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: false,
    initialLoggedIn: true,
    localAgents: [],
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await openModelSourceSetup(page, /Local Agent/i);
  await expect(page.getByText('Local CLI')).toBeVisible();
  await expect(page.getByText(/No agents detected|No local CLI detected/i)).toBeVisible();

  const continueButton = page.getByRole('button', { name: /^Continue$/i });
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('heading', { name: /Local Agent|本地 Agent/i })).toBeVisible();
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);
});

test('[P0] onboarding Local CLI path stays gated while local agent scan is still running', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: false,
    initialLoggedIn: true,
    agentsDelayMs: 20_000,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await openModelSourceSetup(page, /Local Agent/i);
  await expect(page.getByRole('button', { name: /Scanning|扫描中/i })).toBeVisible();

  const continueButton = page.getByRole('button', { name: /^Continue$/i });
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('heading', { name: /Local Agent|本地 Agent/i })).toBeVisible();
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);
});

test('[P0] onboarding supports Local CLI when the AMR agent is unavailable', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: false,
    initialLoggedIn: true,
  });

  await seedOnboardingConfig(page, config);

  await gotoOnboarding(page);

  // No AMR runtime card exists anymore — the landing cloud button is the only
  // AMR affordance, and there is no "AMR Cloud" named control.
  await expect(page.getByRole('button', { name: /AMR Cloud/i })).toHaveCount(0);
  await openModelSourceSetup(page, /Local Agent/i);
  await expect(page.getByText('Local CLI')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Continue$/i })).toBeVisible();
});

test('[P0] Cloud status failure does not block signed-out Local CLI or BYOK setup', async ({ page }) => {
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
  // The signed-in status never resolves (all polls fail), so the Cloud action
  // stays gated. Independent Local CLI and BYOK setup remain available.
  await expect(page.getByRole('button', { name: /Skip for now/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Continue$/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /About you|了解你/i })).toHaveCount(0);
  const primary = cloudPrimaryButton(page);
  await expect(primary).toBeVisible();
  await expect(primary).toHaveText(/Sign in to OpenDesign|登录 OpenDesign/i);
  await expect(page.getByRole('button', { name: /Local (coding )?agent/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bring Your Own Key/i })).toBeVisible();
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(connectLandingHeading(page)).toBeVisible();
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
  await clickCloudPrimary(page);

  const cancelSignIn = page.getByRole('button', { name: /Cancel sign-in/i });
  await expect(cancelSignIn).toBeVisible();
  await expect(page.getByRole('button', { name: /Local (coding )?agent/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Bring Your Own Key/i })).toHaveCount(0);
  await cancelSignIn.click();

  const primary = cloudPrimaryButton(page);
  await expect(primary).toHaveText(/Sign in to OpenDesign|登录 OpenDesign/i);
  // The status read was canceled before a daemon login attempt was created,
  // so there is no attempt-scoped process for the client to cancel.
  await expect.poll(() => page.evaluate(() => window.__amrOnboardingCancelCalls ?? 0)).toBe(0);
  await expect
    .poll(() => page.evaluate(() => window.__amrOnboardingSlowStatusResolved ?? false))
    .toBe(true);
  await expect(page.getByRole('button', { name: /Cancel sign-in/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Local (coding )?agent/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bring Your Own Key/i })).toBeVisible();
  await expectStableCount(
    () => page.evaluate(() => window.__amrOnboardingLoginCalls ?? 0),
    0,
    {
      timeout: 250,
      message: 'cancelling onboarding should prevent the delayed status continuation from starting login',
    },
  );
});

test('[P0] onboarding reload restores and cancels an active Cloud login', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
    initialLoginInFlight: true,
    keepAmrLoginIncomplete: true,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);
  await expect(page.getByRole('button', { name: /Cancel sign-in/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Local (coding )?agent/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Bring Your Own Key/i })).toHaveCount(0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await expect(page.getByRole('button', { name: /Cancel sign-in/i })).toBeVisible();
  await page.getByRole('button', { name: /Cancel sign-in/i }).click();

  await expect.poll(() => page.evaluate(() => window.__amrOnboardingCancelCalls ?? 0)).toBe(1);
  await expect(page.getByRole('button', { name: /Local (coding )?agent/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bring Your Own Key/i })).toBeVisible();
});

test('[P0] onboarding reload resumes an active Cloud login through completion', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
    initialLoginInFlight: true,
    keepAmrLoginIncomplete: true,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);
  await expect(page.getByRole('button', { name: /Cancel sign-in/i })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await expect(page.getByRole('button', { name: /Cancel sign-in/i })).toBeVisible();
  await page.evaluate(() => {
    window.__amrOnboardingCompleteLogin = true;
  });

  await expectModelSourceChooser(page);
  await expect(page.getByRole('button', { name: /Cancel sign-in/i })).toHaveCount(0);
});

// The AMR card + per-runtime model picker on the connect step were removed.
// A signed-in user now accepts Hosted on the model-source chooser.
test('[P0] @critical onboarding signed-in AMR path finishes setup with the AMR runtime', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  const primary = cloudPrimaryButton(page);
  await expect(primary).toHaveText(/Continue \(signed in\)|继续（已登录）/i);
  await clickCloudPrimary(page);
  await expectModelSourceChooser(page);
  await continueWithModelSource(page, /OpenDesign Hosted/i);
  await expectOnboardingFinished(page);
  await pollStoredConfig(page).toMatchObject({
    agentId: 'amr',
    onboardingCompleted: true,
  });
});

// The connect-step AMR model picker is gone, so the model-selection portion is
// retired. The preserved coverage: the AMR runtime configured during a
// signed-in onboarding carries into the first Home run request (agentId 'amr').
test('[P0] onboarding AMR runtime selection carries into the first Home run request', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });
  await mockAmrPersonalWorkspace(page, undefined, {
    accountBalanceUsd: '20.00',
    accountCredits: 2_000,
    accountPlan: 'free',
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await clickCloudPrimary(page);
  await expectModelSourceChooser(page);
  await continueWithModelSource(page, /OpenDesign Hosted/i);
  await expectOnboardingFinished(page);

  const runBodies: Array<Record<string, unknown>> = [];
  const runRequests = await routeSuccessfulRuns(page, {
    bodies: runBodies,
    runId: 'amr-onboarding-first-run',
    eventBody: successfulRunEventBody([
      'event: start',
      'data: {"bin":"vela"}',
      '',
    ]),
  });

  const input = page.getByTestId('home-hero-input');
  await expect(input).toBeVisible();
  await input.fill('Create an AMR onboarding carryover smoke artifact.');
  await expect(page.getByTestId('home-hero-submit')).toBeEnabled();
  await page.getByTestId('home-hero-submit').click();

  await runRequests.expectCount(1);
  expect(runBodies[0]).toMatchObject({
    agentId: 'amr',
  });
});

test('[P0] completed BYOK setup stays usable while the unrelated Cloud session is signed out', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
  });
  Object.assign(config, {
    mode: 'api',
    apiKey: 'persisted-byok-key',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    agentId: null,
    onboardingCompleted: true,
  } satisfies Partial<OnboardingConfig>);
  await seedOnboardingConfig(page, config);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Choose your model source|选择模型来源/i })).toHaveCount(0);
  // PRODUCT INVARIANT: Cloud identity gates OpenDesign Cloud execution only.
  // A configured BYOK runtime neither redirects to onboarding nor starts a
  // passive Cloud login merely because the independent AMR status is signed out.
  await expect.poll(() => page.evaluate(() => window.__amrOnboardingLoginCalls ?? 0)).toBe(0);
  await pollStoredConfig(page).toMatchObject({
    mode: 'api',
    apiKey: 'persisted-byok-key',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    onboardingCompleted: true,
  });
});

test('[P0] definitively expired Cloud auth returns to the existing sign-in gate without a dismissible modal', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
    sessionState: 'reauth_required',
  });
  Object.assign(config, {
    agentId: 'amr',
    onboardingCompleted: true,
  } satisfies Partial<OnboardingConfig>);
  await mockAmrPersonalWorkspace(page);
  await seedOnboardingConfig(page, config);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);

  await expect(page).toHaveURL(/\/onboarding$/, { timeout: T.long });
  await expect(connectLandingHeading(page)).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await pollStoredConfig(page).toMatchObject({
    agentId: 'amr',
    onboardingCompleted: true,
  });
});

test('[P0] definitively expired Cloud auth also gates project deep links', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
    sessionState: 'reauth_required',
  });
  Object.assign(config, {
    agentId: 'amr',
    onboardingCompleted: true,
  } satisfies Partial<OnboardingConfig>);
  await mockAmrPersonalWorkspace(page);
  await seedOnboardingConfig(page, config);

  await page.goto('/projects/expired-auth-project', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);

  await expect(page).toHaveURL(/\/onboarding$/, { timeout: T.long });
  await expect(connectLandingHeading(page)).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('[P0] active Cloud sign-out preserves BYOK and unrelated preferences while returning to sign-in', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });
  Object.assign(config, {
    mode: 'api',
    apiKey: 'private-key',
    baseUrl: 'https://private.example/v1',
    model: 'private-model',
    agentId: 'amr',
    designSystemId: 'keep-design-system',
    onboardingCompleted: true,
  } satisfies Partial<OnboardingConfig>);
  await mockAmrPersonalWorkspace(page);
  await seedOnboardingConfig(page, config);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
  await expect(page.getByTestId('home-view')).toBeVisible();
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-account').hover();
  await page.getByRole('menuitem', { name: /Sign out|退出登录/i }).click();
  await expect(page.getByTestId('sign-out-confirm-dialog')).toBeVisible();
  await page.getByTestId('sign-out-confirm-accept').click();

  await expect(connectLandingHeading(page)).toBeVisible();
  await expect(cloudPrimaryButton(page)).toHaveText(/Sign in to OpenDesign|登录 OpenDesign/i);
  await expect(page.getByTestId('home-hero-input')).toHaveCount(0);
  await pollStoredConfig(page).toMatchObject({
    mode: 'daemon',
    apiKey: 'private-key',
    baseUrl: 'https://private.example/v1',
    model: 'private-model',
    agentId: null,
    designSystemId: 'keep-design-system',
    onboardingCompleted: false,
  });
});

test('[P1] Cloud sign-out restores usable install-local BYOK after daemon reset and cold reload', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });
  Object.assign(config, {
    mode: 'api',
    apiProtocol: 'openai',
    apiKey: 'persisted-private-key',
    baseUrl: 'https://persisted.example/v1',
    model: 'persisted-private-model',
    agentId: 'amr',
    onboardingCompleted: true,
  } satisfies Partial<OnboardingConfig>);
  await mockAmrPersonalWorkspace(page);
  await page.route('**/api/provider/models', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 11,
        models: [{ id: 'persisted-private-model', label: 'Persisted Private Model' }],
      },
    });
  });
  let connectionBody: Record<string, unknown> | null = null;
  await page.route('**/api/test/connection', async (route) => {
    connectionBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 13,
        model: 'persisted-private-model',
        sample: 'Connected',
      },
    });
  });

  // Seed only this first document. BYOK belongs to the local installation;
  // unlike Cloud-owned execution prefs, its secrets never cross the daemon
  // app-config boundary.
  await page.goto('/api/health');
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: config },
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
  await expect(page.getByTestId('home-view')).toBeVisible();
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-account').hover();
  await page.getByRole('menuitem', { name: /Sign out|退出登录/i }).click();
  await expect(page.getByTestId('sign-out-confirm-dialog')).toBeVisible();

  const daemonReset = page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === 'PUT'
      && new URL(request.url()).pathname === '/api/app-config';
  });
  await page.getByTestId('sign-out-confirm-accept').click();
  const resetResponse = await daemonReset;
  expect(resetResponse.ok()).toBe(true);
  const daemonResetBody = resetResponse.request().postDataJSON() as Record<string, unknown>;
  expect(daemonResetBody).toMatchObject({
    onboardingCompleted: false,
    agentId: null,
    agentModels: {},
  });
  expect(daemonResetBody).not.toHaveProperty('apiKey');
  await expect(connectLandingHeading(page)).toBeVisible();

  // The shared onboarding fixture records status counters through page JS.
  // Replace it before navigation so an in-flight polling response cannot try
  // to write into the document while reload destroys that execution context.
  await page.unroute('**/api/integrations/vela/status');
  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({
      json: {
        loggedIn: false,
        loginInFlight: false,
        sessionState: 'signed_out',
        credentialRevision: 'signed-out',
        profile: 'local',
        configPath: '/tmp/.amr/config.json',
        user: null,
      },
    });
  });

  // Make the daemon GET realistic for the cold boot: it owns only the Cloud
  // reset prefs and cannot hand the BYOK secret back to the browser.
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        config: {
          onboardingCompleted: false,
          agentId: null,
          agentModels: {},
          agentCliEnv: {},
          agentCliEnvIntent: {},
        },
      },
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
  await expect(connectLandingHeading(page)).toBeVisible();

  await page.getByRole('button', { name: /Bring Your Own Key/i }).click();
  const byokPanel = onboardingByokPanel(page);
  await expect(byokPanel).toBeVisible();
  await expect(page.getByRole('tab', { name: /^OpenAI$/i })).toHaveAttribute('aria-selected', 'true');
  await expect(onboardingField(byokPanel, 'API key').locator('input'))
    .toHaveValue('persisted-private-key');
  await expect(onboardingField(byokPanel, 'Base URL').locator('input'))
    .toHaveValue('https://persisted.example/v1');
  await expect(expectOnboardingTrigger(byokPanel, 'Model'))
    .toContainText(/Persisted Private Model|persisted-private-model/i);

  await expectConnectionSuccess(page);
  await expect.poll(() => connectionBody).toMatchObject({
    mode: 'provider',
    protocol: 'openai',
    apiKey: 'persisted-private-key',
    baseUrl: 'https://persisted.example/v1',
    model: 'persisted-private-model',
  });
  const continueButton = page.getByRole('button', { name: /^Continue$/i });
  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');
  await continueButton.click();
  await expectOnboardingFinished(page);
  await pollStoredConfig(page).toMatchObject({
    mode: 'api',
    apiProtocol: 'openai',
    apiKey: 'persisted-private-key',
    baseUrl: 'https://persisted.example/v1',
    model: 'persisted-private-model',
    onboardingCompleted: true,
  });
});

test('[P0] signed-out users are redirected from Home to Cloud sign-in', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
    keepAmrLoginIncomplete: true,
  });

  await seedOnboardingConfig(page, config);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(connectLandingHeading(page)).toBeVisible();
  await expect(cloudPrimaryButton(page)).toHaveText(/Sign in to OpenDesign|登录 OpenDesign/i);
  await expect(page.getByTestId('home-hero-input')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__amrOnboardingLoginCalls ?? 0)).toBe(0);
});

for (const destination of [
  { name: 'Community', path: '/community' },
  { name: 'Projects', path: '/projects' },
  { name: 'Design Systems', path: '/design-systems' },
  { name: 'Plugins', path: '/plugins' },
  { name: 'Integrations', path: '/integrations' },
  { name: 'Settings', path: '/settings' },
] as const) {
  test(`[P0] signed-out users are redirected from ${destination.name} to Cloud sign-in`, async ({ page }) => {
    const config = await wireOnboardingMocks(page, {
      amrAvailable: true,
      initialLoggedIn: false,
      keepAmrLoginIncomplete: true,
    });
    await seedOnboardingConfig(page, config);

    await page.goto(destination.path, { waitUntil: 'domcontentloaded' });
    await waitForLoadingToClear(page);
    await dismissPrivacyDialog(page);

    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(connectLandingHeading(page)).toBeVisible();
    await expect(cloudPrimaryButton(page)).toHaveText(/Sign in to OpenDesign|登录 OpenDesign/i);
    await expect.poll(() => page.evaluate(() => window.__amrOnboardingLoginCalls ?? 0)).toBe(0);
  });
}

test('[P0] onboarding configuration Back returns to the source chooser with the test gate locked', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await clickCloudPrimary(page);
  await expectModelSourceChooser(page);
  await continueWithModelSource(page, /Bring Your Own Key/i);
  await expect(onboardingByokPanel(page)).toBeVisible();

  const continueButton = page.getByRole('button', { name: /^Continue$/i });
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('heading', { name: /Bring your own key|自己的模型 Key/i })).toBeVisible();
  await page.getByRole('button', { name: /^Back$/i }).click();
  await expectModelSourceChooser(page);
  await expect(page.getByRole('radio', { name: /Bring Your Own Key/i })).toHaveAttribute(
    'aria-checked',
    'true',
  );
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

  await openModelSourceSetup(page, /Bring Your Own Key/i);
  const byokPanel = onboardingByokPanel(page);
  await expect(byokPanel).toBeVisible();

  await fillInlineField(page, 'API key', 'test-api-key');
  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  await page.getByRole('button', { name: /Fetch models/i }).click();
  await expect(page.getByText(/Fetched 2 models\./)).toBeVisible();
  await selectOnboardingOption(byokPanel, 'Model', 'claude-opus-4-8');

  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectConnectionSuccess(page);

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

test('[P0] onboarding BYOK Continue tests the configuration and retries after failure', async ({ page }) => {
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

  await openModelSourceSetup(page, /Bring Your Own Key/i);
  const byokPanel = onboardingByokPanel(page);
  await expect(byokPanel).toBeVisible();

  const continueButton = page.getByRole('button', { name: /^Continue$/i });
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');

  await fillInlineField(page, 'API key', 'bad-api-key');
  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  await page.getByRole('button', { name: /Fetch models/i }).click();
  await expect(page.getByText(/Fetched 1 model/)).toBeVisible();
  await selectOnboardingOption(byokPanel, 'Model', 'Claude Sonnet 4.5');
  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');

  await continueButton.click();
  await expect(page.getByText(/Invalid API key|Connection failed|failed/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Bring your own key|自己的模型 Key/i })).toBeVisible();
  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');

  connectionOk = true;
  await fillInlineField(page, 'API key', 'good-api-key');
  await continueButton.click();
  await expectOnboardingFinished(page);
});

test('[P0] onboarding BYOK path supports Anthropic model selection and API key visibility before completing', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });
  let connectionBody: Record<string, unknown> | null = null;
  await page.route('**/api/test/connection', async (route) => {
    connectionBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 19,
        model: 'claude-custom-onboarding',
        sample: 'Connected',
      },
    });
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await openModelSourceSetup(page, /Bring Your Own Key/i);
  await expect(page.getByRole('tab', { name: /^Anthropic$/i })).toHaveAttribute('aria-selected', 'true');

  const apiKeyField = onboardingField(page, 'API key');
  const apiKeyInput = apiKeyField.locator('input');
  await expect(apiKeyInput).toHaveAttribute('type', 'password');
  await fillInlineField(page, 'API key', 'anthropic-test-key');
  await apiKeyField.getByRole('button', { name: /^Show$/i }).click();
  await expect(apiKeyInput).toHaveAttribute('type', 'text');

  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  const byokPanel = onboardingByokPanel(page);
  await selectOnboardingOption(byokPanel, 'Model', 'claude-sonnet-4-5');
  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectConnectionSuccess(page);

  await expect.poll(() => connectionBody).toMatchObject({
    mode: 'provider',
    protocol: 'anthropic',
    apiKey: 'anthropic-test-key',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
  });

  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expectOnboardingFinished(page);
  await pollStoredConfig(page).toMatchObject({
    mode: 'api',
    apiProtocol: 'anthropic',
    apiKey: 'anthropic-test-key',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    onboardingCompleted: true,
  });
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

  await openModelSourceSetup(page, /Bring Your Own Key/i);
  const byokPanel = onboardingByokPanel(page);
  const continueButton = page.getByRole('button', { name: /^Continue$/i });

  await fillInlineField(page, 'API key', 'valid-api-key');
  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  await page.getByRole('button', { name: /Fetch models/i }).click();
  await expect(page.getByText(/Fetched 1 model/)).toBeVisible();
  await selectOnboardingOption(byokPanel, 'Model', 'Claude Sonnet 4.5');
  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectConnectionSuccess(page);
  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');

  await fillInlineField(page, 'API key', 'changed-api-key');

  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText(/Connected\. Replied/i)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Bring your own key|自己的模型 Key/i })).toBeVisible();
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

  await openModelSourceSetup(page, /Bring Your Own Key/i);
  const byokPanel = onboardingByokPanel(page);
  const continueButton = page.getByRole('button', { name: /^Continue$/i });

  await fillInlineField(page, 'API key', 'valid-api-key');
  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  await page.getByRole('button', { name: /Fetch models/i }).click();
  // Scope to the models-status text rather than role=status: both the models
  // status and (after the test below) the connection status share role=status,
  // so a bare getByRole('status') would be ambiguous on later assertions.
  await expect(page.getByText(/Fetched 2 models/)).toBeVisible();
  await selectOnboardingOption(byokPanel, 'Model', 'Claude Sonnet 4.5');
  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectConnectionSuccess(page);
  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');

  await fillInlineField(page, 'Base URL', 'https://api.changed.example');
  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText(/Connected\. Replied/i)).toHaveCount(0);

  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectConnectionSuccess(page);
  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');

  await selectOnboardingOption(byokPanel, 'Model', 'Claude Opus 4.8');
  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText(/Connected\. Replied/i)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Bring your own key|自己的模型 Key/i })).toBeVisible();
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);
});

async function wireOnboardingMocks(
  page: Page,
  options: {
    amrAvailable: boolean;
    initialLoggedIn: boolean;
    initialLoginInFlight?: boolean;
    failAllStatusPolls?: boolean;
    keepAmrLoginIncomplete?: boolean;
    sessionState?: 'signed_out' | 'authenticated' | 'reauth_required';
    delayAllStatusMs?: number;
    delaySignedOutStatusMs?: number;
    statusGate?: Promise<void>;
    agentsDelayMs?: number;
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
  let loginInFlight = options.initialLoginInFlight ?? false;
  let statusCalls = 0;
  let statusResponses = 0;
  let loginCalls = 0;
  let cancelCalls = 0;
  let authAttemptId: string | null = loginInFlight
    ? '11111111-1111-4111-8111-111111111111'
    : null;

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
          models: [{ id: 'default', label: 'Default' }],
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

  // Onboarding validates a settled runtime selection on its own, before
  // Continue is ever pressed. Without a default handler that background pass
  // reaches the live daemon and spawns whichever agent CLI the box happens to
  // have. Cases that care about the verdict register their own handler after
  // this one, which Playwright matches first.
  await page.route('**/api/test/connection', async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        kind: 'success',
        latencyMs: 12,
        model: 'default',
        agentName: 'Codex CLI',
        sample: 'Connected',
      },
    });
  });

  await page.route('**/api/integrations/vela/status', async (route) => {
    statusCalls += 1;
    await page.evaluate((calls) => {
      window.__amrOnboardingStatusCalls = calls;
    }, statusCalls);
    if (options.statusGate) {
      await options.statusGate;
    }
    if (options.failAllStatusPolls) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'status unavailable' }),
      });
      statusResponses += 1;
      await page.evaluate((responses) => {
        window.__amrOnboardingStatusResponses = responses;
      }, statusResponses);
      return;
    }
    if (loginInFlight && await page.evaluate(() => (
      window.__amrOnboardingCompleteLogin === true
    ))) {
      loggedIn = true;
      loginInFlight = false;
    }
    const delayAllStatusMs = options.delayAllStatusMs ?? 0;
    const shouldDelayAllStatuses = delayAllStatusMs > 0;
    const shouldDelaySignedOutStatus =
      shouldDelayAllStatuses ||
      (!loggedIn &&
        typeof options.delaySignedOutStatusMs === 'number' &&
        options.delaySignedOutStatusMs > 0 &&
        (await page.evaluate(() => {
          if (!window.__amrOnboardingDelayNextSignedOutStatus) return false;
          window.__amrOnboardingDelayNextSignedOutStatus = false;
          return true;
        })));
    if (shouldDelaySignedOutStatus) {
      const delayMs = shouldDelayAllStatuses
        ? delayAllStatusMs
        : options.delaySignedOutStatusMs ?? 0;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await route.fulfill({
      json: loggedIn
        ? {
            loggedIn: true,
            loginInFlight: false,
            sessionState: options.sessionState ?? 'authenticated',
            credentialRevision: 'onboarding-test-credential',
            profile: 'local',
            configPath: '/tmp/.amr/config.json',
            user: { id: 'user-1', email: 'onboarding@example.com', plan: 'free' },
          }
        : {
            loggedIn: false,
            loginInFlight,
            authAttemptId,
            sessionState: 'signed_out',
            credentialRevision: 'signed-out',
            profile: 'local',
            configPath: '/tmp/.amr/config.json',
            user: null,
          },
    });
    statusResponses += 1;
    await page.evaluate((responses) => {
      window.__amrOnboardingStatusResponses = responses;
    }, statusResponses);
    if (shouldDelaySignedOutStatus) {
      await page.evaluate(() => {
        window.__amrOnboardingSlowStatusResolved = true;
      });
    }
  });

  if (options.amrAvailable) {
    await mockAmrWalletSnapshot(page, {
      email: 'onboarding@example.com',
      loggedIn: () => loggedIn,
      plan: 'free',
      profile: 'local',
    });
  }

  await page.route('**/api/integrations/vela/login', async (route) => {
    const body = route.request().postDataJSON() as { authAttemptId?: string };
    authAttemptId = body.authAttemptId ?? null;
    expect(authAttemptId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
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
      json: {
        pid: 4242,
        startedAt: new Date().toISOString(),
        profile: 'local',
        authAttemptId,
      },
    });
  });

  await page.route('**/api/integrations/vela/login/cancel', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ authAttemptId });
    cancelCalls += 1;
    loginInFlight = false;
    await page.evaluate((calls) => {
      window.__amrOnboardingCancelCalls = calls;
    }, cancelCalls);
    await route.fulfill({ json: { canceled: true, pids: [4242] } });
  });

  await page.route('**/api/integrations/vela/logout', async (route) => {
    loggedIn = false;
    loginInFlight = false;
    await route.fulfill({ json: { ok: true } });
  });

  return config;
}

async function gotoOnboarding(page: Page) {
  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
  // The runtime-picker "Choose a runtime" heading was removed. The Connect
  // step now opens on a centered OpenDesign Cloud sign-in landing whose
  // heading is the stable marker that onboarding has rendered.
  await expect(
    page.getByRole('heading', { name: /Sign in to OpenDesign|登录 OpenDesign/i }),
  ).toBeVisible();
}

// The landing's primary cloud button is the AMR/cloud sign-in trigger. Its
// accessible name varies by state (sign-in / continue / signing-in / loading),
// so target it by class and wait for it to settle out of the mount-time
// "Loading…" state before interacting.
function cloudPrimaryButton(page: Page): Locator {
  return page.locator('.onboarding-cloud__primary');
}

async function clickCloudPrimary(page: Page) {
  const primary = cloudPrimaryButton(page);
  await expect(primary).toBeEnabled();
  await primary.click();
}

// The connect landing heading — the stable "we're still on the cloud sign-in
// landing" marker that replaced the old "Choose a runtime" heading.
function connectLandingHeading(page: Page): Locator {
  return page.getByRole('heading', { name: /Sign in to OpenDesign|登录 OpenDesign/i });
}

async function expectModelSourceChooser(page: Page) {
  await expect(
    page.getByRole('heading', { name: /Choose your model source|选择模型来源/i }),
  ).toBeVisible({ timeout: T.long });
  await expect(page.getByRole('radiogroup')).toBeVisible();
}

async function continueWithModelSource(page: Page, sourceName: RegExp) {
  const source = page.getByRole('radio', { name: sourceName });
  await expect(source).toBeVisible();
  await source.click();
  await page.getByRole('button', { name: /^Continue$/i }).click();
}

async function openModelSourceSetup(page: Page, sourceName: RegExp) {
  await clickCloudPrimary(page);
  await expectModelSourceChooser(page);
  await continueWithModelSource(page, sourceName);
}

async function seedOnboardingConfig(page: Page, config: OnboardingConfig) {
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: config },
  );
}

async function expectOnboardingFinished(page: Page) {
  await dismissPrivacyDialog(page);
  const goHome = page.getByRole('button', { name: /Go to home/i });
  if (await goHome.isVisible().catch(() => false)) {
    await goHome.click();
  } else {
    const finishSetup = page.getByRole('button', { name: /Finish setup/i });
    if (await finishSetup.isVisible().catch(() => false)) {
      await finishSetup.click();
    }
  }
  await expect(page).not.toHaveURL(/\/onboarding$/);
  await dismissPrivacyDialog(page);
  await expect(page.getByTestId('home-view')).toBeVisible();
}

function onboardingByokPanel(page: Page) {
  return page.locator('.onboarding-view__setup-panel').filter({
    has: page.getByText('API providers', { exact: true }),
  });
}

async function expectConnectionSuccess(page: Page) {
  await expect(
    page.getByText(/Connected\. Replied in \d+ ms|.+ replied in \d+ ms/),
  ).toBeVisible();
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
