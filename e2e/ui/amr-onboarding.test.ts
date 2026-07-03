import { expect, test } from '@/playwright/suite';
import type { Locator, Page } from '@playwright/test';

import { dismissPrivacyDialog, STORAGE_KEY, waitForLoadingToClear } from '@/playwright/amr';
import { fulfillAgentsRoute } from '@/playwright/mock-factory';
import { T } from '@/timeouts';

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

test.describe.configure({ timeout: T.xlong });

test('[P0] @critical onboarding lets AMR Cloud sign in and complete setup after the login poll succeeds', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
  });

  await seedOnboardingConfig(page, config);

  await gotoOnboarding(page);

  // Signed-out cloud landing: the primary button reads "Sign in to Open Design
  // Cloud" and IS the AMR sign-in trigger (it replaced the old "Sign in to
  // continue" AMR-card CTA).
  const primary = cloudPrimaryButton(page);
  await expect(primary).toBeVisible();
  await expect(primary).toHaveText(/Sign in to Open Design|登录 Open Design/i);
  const statusCallsBeforeLogin = await page.evaluate(() => window.__amrOnboardingStatusCalls ?? 0);
  await clickCloudPrimary(page);

  await expect.poll(() => page.evaluate(() => window.__amrOnboardingLoginCalls ?? 0)).toBe(1);
  await expect
    .poll(() => page.evaluate(() => window.__amrOnboardingStatusCalls ?? 0))
    .toBeGreaterThan(statusCallsBeforeLogin);
  // Login success lands on the About-you step; advance past newsletter to the
  // final design-system step.
  await expect(page.getByRole('heading', { name: /About you/i })).toBeVisible({ timeout: T.long });
  await advanceFromAboutYouToBrand(page);
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

  // The cloud landing offers no escape hatch: no Skip, no Continue, and no
  // stepper to jump straight into About-you. Sign-in is the only forward path.
  await expect(page.getByRole('button', { name: /Skip for now/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Continue$/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /About you|了解你/i })).toHaveCount(0);

  const primary = cloudPrimaryButton(page);
  await expect(primary).toBeVisible();
  await expect(primary).toHaveText(/Sign in to Open Design|登录 Open Design/i);
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);

  // Trigger sign-in: it stays pending (login never completes), so we remain on
  // the connect step — the About-you fields never appear.
  await clickCloudPrimary(page);
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

  // Expand the Local coding agent panel from the landing. Scanning auto-selects
  // the default agent (codex), so its live model picker is available; pick a
  // model and confirm the trigger reflects it.
  await page.getByRole('button', { name: /Local coding agent/i }).click();
  const localPanel = page.locator('.onboarding-view__setup-panel');
  await expect(localPanel).toBeVisible();
  await selectOnboardingOption(localPanel, 'Model', 'GLM 5');

  await expect(expectOnboardingTrigger(localPanel, 'Model')).toContainText('GLM 5');
  await expect(page.getByRole('button', { name: /^Continue$/i })).toBeVisible();
});

test('[P0] onboarding Local CLI path completes setup with the selected agent model', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: false,
    initialLoggedIn: false,
    codexModels: [
      { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
      { id: 'glm-5', label: 'GLM 5' },
    ],
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await page.getByRole('button', { name: /Local coding agent/i }).click();
  const localPanel = page.locator('.onboarding-view__setup-panel');
  await expect(localPanel).toBeVisible();
  await selectOnboardingOption(localPanel, 'Model', 'GLM 5');
  await page.getByRole('button', { name: /^Continue$/i }).click();

  await expect(page.getByRole('heading', { name: /About you/i })).toBeVisible({ timeout: T.long });
  await advanceFromAboutYouToBrand(page);

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
  // Still on the (expanded) Connect step — the Local panel header is showing
  // and the About-you fields never appeared.
  await expect(page.getByRole('heading', { name: /Local coding agent/i })).toBeVisible();
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);
});

test('[P0] onboarding Local CLI path stays gated while local agent scan is still running', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: false,
    initialLoggedIn: false,
    agentsDelayMs: 20_000,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await page.getByRole('button', { name: /Local coding agent/i }).click();
  await expect(page.getByRole('button', { name: /Scanning|扫描中/i })).toBeVisible();

  const continueButton = page.getByRole('button', { name: /^Continue$/i });
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('heading', { name: /Local coding agent/i })).toBeVisible();
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);
});

test('[P0] onboarding falls back to Local CLI when AMR is unavailable', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: false,
    initialLoggedIn: false,
  });

  await seedOnboardingConfig(page, config);

  await gotoOnboarding(page);

  // No AMR runtime card exists anymore — the landing cloud button is the only
  // AMR affordance, and there is no "AMR Cloud" named control.
  await expect(page.getByRole('button', { name: /AMR Cloud/i })).toHaveCount(0);
  await page.getByRole('button', { name: /Local coding agent/i }).click();
  await expect(page.getByText('Local CLI')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Continue$/i })).toBeVisible();
});

test('[P0] onboarding recovers from a transient AMR status failure and still continues after login completes', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
    failFirstStatusPollAfterLogin: true,
  });

  await seedOnboardingConfig(page, config);

  await gotoOnboarding(page);

  await clickCloudPrimary(page);

  // Recovery lands on About you; step through newsletter to the final brand step.
  await expect(page.getByRole('button', { name: /^Continue$/i })).toBeVisible({ timeout: 12_000 });
  await advanceFromAboutYouToBrand(page);
  await expectFinalDesignSystemStep(page);
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
  // The signed-in status never resolves (all polls fail), so the cloud landing
  // can't show "Continue (signed in)" and falls back to the sign-in CTA. There
  // is no Skip, no Continue, and no stepper to bypass the gate.
  await expect(page.getByRole('button', { name: /Skip for now/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Continue$/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /About you|了解你/i })).toHaveCount(0);
  const primary = cloudPrimaryButton(page);
  await expect(primary).toBeVisible();
  await expect(primary).toHaveText(/Sign in to Open Design|登录 Open Design/i);
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(connectLandingHeading(page)).toBeVisible();
});

test('[P0] onboarding lets the user cancel an incomplete AMR sign-in and retry', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: false,
    keepAmrLoginIncomplete: true,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await clickCloudPrimary(page);

  // Pending sign-in: the primary reflects "Signing in…" and a dedicated
  // "Cancel sign-in" button appears.
  const primary = cloudPrimaryButton(page);
  await expect(primary).toHaveText(/Signing in|登录中/i);
  const cancelSignIn = page.getByRole('button', { name: /Cancel sign-in/i });
  await expect(cancelSignIn).toBeVisible();
  await cancelSignIn.click();

  await expect(primary).toHaveText(/Sign in to Open Design|登录 Open Design/i);
  await expect(page.getByRole('button', { name: /Cancel sign-in/i })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__amrOnboardingCancelCalls ?? 0)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__amrOnboardingLoginCalls ?? 0)).toBe(1);

  await clickCloudPrimary(page);

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
  await clickCloudPrimary(page);

  const cancelSignIn = page.getByRole('button', { name: /Cancel sign-in/i });
  await expect(cancelSignIn).toBeVisible();
  await cancelSignIn.click();

  const primary = cloudPrimaryButton(page);
  await expect(primary).toHaveText(/Sign in to Open Design|登录 Open Design/i);
  await expect.poll(() => page.evaluate(() => window.__amrOnboardingCancelCalls ?? 0)).toBe(1);
  await expect
    .poll(() => page.evaluate(() => window.__amrOnboardingSlowStatusResolved ?? false))
    .toBe(true);
  await page.waitForTimeout(250);
  await expect(page.getByRole('button', { name: /Cancel sign-in/i })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__amrOnboardingLoginCalls ?? 0)).toBe(0);
});

// The AMR runtime card and its per-runtime model picker on the connect step
// were removed in the redesign — AMR now signs in straight from the cloud
// landing and exposes no model picker there. This test preserves the still-valid
// slice of the old coverage: a signed-in user advancing from the cloud landing
// pins the AMR runtime (agentId: 'amr') as the connect selection.
test('[P0] onboarding signed-in cloud landing pins the AMR runtime when continuing', async ({ page }) => {
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

  const primary = cloudPrimaryButton(page);
  await expect(primary).toHaveText(/Continue \(signed in\)|继续（已登录）/i);
  await clickCloudPrimary(page);

  // Advancing to About-you confirms the connect gate cleared, and the runtime
  // selection persisted as AMR.
  await expect(page.getByText(/Optional details for better defaults/i)).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || '{}'), STORAGE_KEY))
    .toMatchObject({
      agentId: 'amr',
    });
});

// The AMR card + per-runtime model picker on the connect step were removed,
// so the model-selection portion of the old test is retired. The still-valid
// coverage — a signed-in AMR user advances from the landing through both steps
// and completes setup with agentId 'amr' — is preserved.
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

  await expect(page.getByText(/Optional details for better defaults/i)).toBeVisible();
  await advanceFromAboutYouToBrand(page);
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

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  await clickCloudPrimary(page);
  await advanceFromAboutYouToBrand(page);
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
  await expect(connectLandingHeading(page)).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding$/);

  const newTabButton = page.getByTestId('workspace-tabs-new-tab');
  await expect(newTabButton).toBeDisabled();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+T' : 'Control+T');
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(connectLandingHeading(page)).toBeVisible();
});

test('[P0] onboarding visited steps become locked again when the Connect runtime becomes invalid', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  // Signed in: the cloud landing advances to About-you, proving the connect
  // gate was satisfied by the AMR sign-in.
  await clickCloudPrimary(page);
  await expect(page.getByText(/Optional details for better defaults/i)).toBeVisible();

  // Step back to the connect landing, then switch the runtime to an unverified
  // BYOK provider. The connect gate must re-lock: Continue goes aria-disabled
  // and About-you is no longer reachable.
  await page.getByRole('button', { name: /^Back$/i }).click();
  await expect(connectLandingHeading(page)).toBeVisible();

  await page.getByRole('button', { name: /Bring your own key/i }).click();
  await expect(page.getByText('BYOK')).toBeVisible();

  const continueButton = page.getByRole('button', { name: /^Continue$/i });
  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('heading', { name: /Bring your own key|自己的模型 Key/i })).toBeVisible();
  await expect(page.getByText(/Optional details for better defaults/i)).toHaveCount(0);
});

test('[P0] onboarding about-you step accepts profile selections and completes setup', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);

  // Signed-in cloud landing advances straight to About-you.
  await clickCloudPrimary(page);
  await expect(page.getByText(/Optional details for better defaults/i)).toBeVisible();

  // Profile fields are now chip rows, not dropdowns: each pick is a single
  // chip click, and the chosen chip reports aria-pressed.
  await selectOnboardingChip(page, 'Your role', 'Engineer');
  await selectOnboardingChip(page, 'Organization size', 'Growth company');
  await selectOnboardingChip(page, 'Use case', 'Product design');
  await selectOnboardingChip(page, 'Use case', 'Prototype / app UI');
  await selectOnboardingChip(page, 'Where did you hear about us?', 'Search');

  await expect(expectOnboardingChip(page, 'Your role', 'Engineer')).toHaveAttribute('aria-pressed', 'true');
  await expect(expectOnboardingChip(page, 'Organization size', 'Growth company')).toHaveAttribute('aria-pressed', 'true');
  await expect(expectOnboardingChip(page, 'Use case', 'Product design')).toHaveAttribute('aria-pressed', 'true');
  await expect(expectOnboardingChip(page, 'Use case', 'Prototype / app UI')).toHaveAttribute('aria-pressed', 'true');
  await expect(expectOnboardingChip(page, 'Where did you hear about us?', 'Search')).toHaveAttribute('aria-pressed', 'true');

  // About you is no longer the final step; advance through newsletter before finishing.
  await advanceFromAboutYouToBrand(page);

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
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expectFinalDesignSystemStep(page);

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
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expectFinalDesignSystemStep(page);

  await expectOnboardingFinished(page);
  await expect.poll(() => newsletterCalls).toBe(0);
  await pollStoredConfig(page).toMatchObject({
    onboardingCompleted: true,
  });
});

test('[P0] onboarding newsletter submits a valid email only when setup finishes', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });
  const newsletterBodies: Array<Record<string, unknown>> = [];
  await page.route('https://open-design.ai/subscribe', async (route) => {
    newsletterBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: { ok: true } });
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);
  await advanceToNewsletterStep(page);

  await page.getByPlaceholder('you@studio.com').fill('Designer@Example.COM ');
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expect(page.getByRole('heading', { name: /Create once, build everywhere/i })).toBeVisible();
  await expect.poll(() => newsletterBodies.length).toBe(0);

  await expectOnboardingFinished(page);
  await expect.poll(() => newsletterBodies).toEqual([
    { email: 'designer@example.com', source: 'client' },
  ]);
  await pollStoredConfig(page).toMatchObject({
    onboardingCompleted: true,
  });
});

test('[P0] onboarding newsletter submit failure does not block finishing setup', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });
  let newsletterCalls = 0;
  await page.route('https://open-design.ai/subscribe', async (route) => {
    newsletterCalls += 1;
    await route.fulfill({
      status: 500,
      json: { ok: false },
    });
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);
  await advanceToNewsletterStep(page);

  await page.getByPlaceholder('you@studio.com').fill('designer@example.com');
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expect(page.getByRole('heading', { name: /Create once, build everywhere/i })).toBeVisible();

  await expectOnboardingFinished(page);
  await expect.poll(() => newsletterCalls).toBe(1);
  await pollStoredConfig(page).toMatchObject({
    onboardingCompleted: true,
  });
});

test('[P0] onboarding build CTA opens design-system creation and completes onboarding', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);
  await clickCloudPrimary(page);
  await advanceFromAboutYouToBrand(page);

  await page.getByRole('button', { name: /Build a design system/i }).click();

  await expect(page).toHaveURL(/\/design-systems\/create$/);
  await expect(
    page.getByRole('heading', { name: /Extract from GitHub, websites, or source material/i }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue to generation/i })).toBeDisabled();
  await pollStoredConfig(page).toMatchObject({
    onboardingCompleted: true,
  });
});

test('[P0] onboarding build step still allows finishing directly to home', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);
  await clickCloudPrimary(page);
  await advanceFromAboutYouToBrand(page);

  await expect(page.getByRole('heading', { name: /Create once, build everywhere/i })).toBeVisible();

  await expectOnboardingFinished(page);
  await pollStoredConfig(page).toMatchObject({
    onboardingCompleted: true,
  });
});

test('[P0] onboarding Back keeps newsletter email and brand URL draft intact', async ({ page }) => {
  const config = await wireOnboardingMocks(page, {
    amrAvailable: true,
    initialLoggedIn: true,
  });

  await seedOnboardingConfig(page, config);
  await gotoOnboarding(page);
  await advanceToNewsletterStep(page);

  await page.getByPlaceholder('you@studio.com').fill('designer@example.com');
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expect(page.getByRole('heading', { name: /Create once, build everywhere/i })).toBeVisible();

  await page.getByRole('button', { name: /^Back$/i }).click();
  await expect(page.getByRole('heading', { name: /Stay in the loop/i })).toBeVisible();
  await expect(page.getByPlaceholder('you@studio.com')).toHaveValue('designer@example.com');

  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expect(page.getByRole('heading', { name: /Create once, build everywhere/i })).toBeVisible();
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
  await expect(page.getByText(/Fetched 2 models\./)).toBeVisible();
  await selectOnboardingOption(byokPanel, 'Model', 'claude-opus-4-8');

  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectProviderConnectionSuccess(page);

  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expect(page.getByText(/Optional details for better defaults/i)).toBeVisible();
  // Advance from About you through newsletter to the brand step, then finish.
  await advanceFromAboutYouToBrand(page);

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
  await expect(page.getByRole('heading', { name: /Bring your own key|自己的模型 Key/i })).toBeVisible();

  await fillInlineField(page, 'API key', 'bad-api-key');
  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  await page.getByRole('button', { name: /Fetch models/i }).click();
  await expect(page.getByText(/Fetched 1 model/)).toBeVisible();
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

  await page.getByRole('button', { name: /Bring your own key/i }).click();
  await expect(page.getByRole('tab', { name: /^Anthropic$/i })).toHaveAttribute('aria-selected', 'true');

  const apiKeyField = onboardingField(page, 'API key');
  const apiKeyInput = apiKeyField.locator('input');
  await expect(apiKeyInput).toHaveAttribute('type', 'password');
  await fillInlineField(page, 'API key', 'anthropic-test-key');
  await apiKeyField.getByRole('button', { name: /^Show$/i }).click();
  await expect(apiKeyInput).toHaveAttribute('type', 'text');

  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  const byokPanel = page.locator('.onboarding-view__setup-panel').filter({ hasText: /BYOK/ });
  await selectOnboardingOption(byokPanel, 'Model', 'claude-sonnet-4-5');
  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectProviderConnectionSuccess(page);

  await expect.poll(() => connectionBody).toMatchObject({
    mode: 'provider',
    protocol: 'anthropic',
    apiKey: 'anthropic-test-key',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
  });

  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expect(page.getByRole('heading', { name: /About you/i })).toBeVisible();
  await advanceFromAboutYouToBrand(page);

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

  await page.getByRole('button', { name: /Bring your own key/i }).click();
  const byokPanel = page.locator('.onboarding-view__setup-panel').filter({ hasText: /BYOK/ });
  const continueButton = page.getByRole('button', { name: /^Continue$/i });

  await fillInlineField(page, 'API key', 'valid-api-key');
  await fillInlineField(page, 'Base URL', 'https://api.anthropic.com');
  await page.getByRole('button', { name: /Fetch models/i }).click();
  await expect(page.getByText(/Fetched 1 model/)).toBeVisible();
  await selectOnboardingOption(byokPanel, 'Model', 'Claude Sonnet 4.5');
  await page.getByRole('button', { name: /^Test$/i }).click();
  await expectProviderConnectionSuccess(page);
  await expect(continueButton).not.toHaveAttribute('aria-disabled', 'true');

  await fillInlineField(page, 'API key', 'changed-api-key');

  await expect(continueButton).toHaveAttribute('aria-disabled', 'true');
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

  await page.getByRole('button', { name: /Bring your own key/i }).click();
  const byokPanel = page.locator('.onboarding-view__setup-panel').filter({ hasText: /BYOK/ });
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
  await expect(page.getByRole('heading', { name: /Bring your own key|自己的模型 Key/i })).toBeVisible();
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
  // The runtime-picker "Choose a runtime" heading was removed. The Connect
  // step now opens on a centered Open Design Cloud sign-in landing whose
  // heading is the stable marker that onboarding has rendered.
  await expect(
    page.getByRole('heading', { name: /Sign in to Open Design|登录 Open Design/i }),
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
  return page.getByRole('heading', { name: /Sign in to Open Design|登录 Open Design/i });
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
  await expect(page.getByRole('heading', { name: /What will you design today/i })).toBeVisible();
}

async function expectFinalDesignSystemStep(page: Page) {
  await expect(page.getByRole('heading', { name: /Create once, build everywhere/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Go to home/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Build a design system/i })).toBeVisible();
}

async function advanceFromAboutYouToBrand(page: Page) {
  await expect(page.getByRole('heading', { name: /About you/i })).toBeVisible({ timeout: T.long });
  const continueButton = page.getByRole('button', { name: /^Continue$/i });
  await continueButton.scrollIntoViewIfNeeded();
  await continueButton.click();
  await expect(page.getByRole('heading', { name: /Stay in the loop/i })).toBeVisible();
  await continueButton.scrollIntoViewIfNeeded();
  await continueButton.click();
  await expectFinalDesignSystemStep(page);
}

// Drive from the signed-in cloud landing through About-you to the Newsletter
// step. The landing primary advances a signed-in user to About-you; the first
// bottom Continue then advances to the Newsletter.
async function advanceToNewsletterStep(page: Page) {
  await clickCloudPrimary(page);
  await expect(page.getByText(/Optional details for better defaults/i)).toBeVisible();
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await expect(page.getByRole('heading', { name: /Stay in the loop/i })).toBeVisible();
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

// About-you profile fields render as flat chip rows (`OnboardingChipField`),
// not dropdowns: each `.onboarding-chip-field` carries its label text plus a
// row of `button.onboarding-chip` options. Scope to the field by its label,
// then click the chip whose text matches the option.
function onboardingChipField(page: Page, label: string): Locator {
  return page
    .locator('.onboarding-chip-field')
    .filter({ hasText: new RegExp(label, 'i') })
    .first();
}

async function selectOnboardingChip(page: Page, label: string, option: string) {
  await onboardingChipField(page, label)
    .locator('button.onboarding-chip')
    .filter({ hasText: new RegExp(option, 'i') })
    .first()
    .click();
}

function expectOnboardingChip(page: Page, label: string, option: string): Locator {
  return onboardingChipField(page, label)
    .locator('button.onboarding-chip')
    .filter({ hasText: new RegExp(option, 'i') })
    .first();
}
