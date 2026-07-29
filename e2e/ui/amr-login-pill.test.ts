// Playwright UI coverage for the AMR Settings login pill (apps/web/src/
// components/AmrLoginPill.tsx). The pill is a sibling of the Test button
// inside the installed-agent card and drives the
// `/api/integrations/vela/{status,login,logout}` endpoints.
//
// This test mocks those endpoints directly via `page.route` instead of
// booting a real daemon — the daemon-side wiring is covered separately by
// `apps/daemon/tests/integrations/vela.routes.test.ts` (HTTP routes) and
// `e2e/tests/amr/turn.test.ts` (full tools-dev chat run). Here we focus
// on the front-end transitions a regression would otherwise only surface
// during manual demos: "Sign in" → "Signed in" → hover-only "Sign out"
// label flip → "Sign in" again on logout.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openSettingsDialog as openEntrySettingsDialog } from '../lib/playwright/amr.js';
import { routeAgents } from '../lib/playwright/mock-factory.js';

const STORAGE_KEY = 'open-design:config';
const OPEN_SETTINGS_LABEL = /Open settings|打开设置|開啟設定/i;

test.describe.configure({ timeout: 30_000 });

async function waitForLoadingToClear(page: Page) {
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, { timeout: 15_000 });
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
  }
  await expect(page.getByRole('button', { name: OPEN_SETTINGS_LABEL })).toBeVisible();
}

async function openSettingsDialog(page: Page) {
  return openEntrySettingsDialog(page);
}

interface VelaMockState {
  loggedIn: boolean;
  loginRequests: number;
  logoutRequests: number;
  statusRequests: number;
}

async function wireDaemonMocks(page: Page, state: VelaMockState) {
  await page.route('**/api/health', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  // Only AMR present — keeps the card layout deterministic regardless
  // of whatever else `runtimes/registry.ts` later adds.
  await routeAgents(page, [
    {
      id: 'amr',
      name: 'AMR (vela)',
      bin: 'vela',
      versionArgs: ['--version'],
      available: true,
      authStatus: null,
      modelsSource: 'fallback',
      models: [
        { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini (openrouter · default)' },
      ],
      path: '/usr/local/bin/vela',
      version: null,
    },
  ]);

  await page.route('**/api/integrations/vela/status', async (route) => {
    state.statusRequests += 1;
    const body = state.loggedIn
      ? {
          loggedIn: true,
          profile: 'local',
          configPath: '/tmp/.amr/config.json',
          user: {
            id: 'fake-user',
            email: 'pill-test@example.com',
            name: 'Pill Test',
            plan: 'free',
          },
        }
      : {
          loggedIn: false,
          profile: 'local',
          user: null,
          configPath: '/tmp/.amr/config.json',
        };
    await route.fulfill({ json: body });
  });

  await page.route('**/api/integrations/vela/login', async (route) => {
    // Real daemon spawns `vela login` async and returns 202; we mirror
    // that shape and flip the in-memory state so the next status poll
    // sees a logged-in user — equivalent to vela CLI completing the
    // device-auth flow and writing ~/.amr/config.json.
    state.loginRequests += 1;
    state.loggedIn = true;
    await route.fulfill({ status: 202, json: { pid: 4242, startedAt: new Date().toISOString(), profile: 'local' } });
  });

  await page.route('**/api/integrations/vela/logout', async (route) => {
    state.logoutRequests += 1;
    state.loggedIn = false;
    await route.fulfill({ json: { ok: true } });
  });
}

function baseStorageConfig() {
  return {
    mode: 'daemon',
    apiKey: '',
    baseUrl: '',
    model: '',
    agentId: 'amr',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: { amr: { model: 'gpt-5.4-mini', reasoning: 'default' } },
  };
}

test('[P1] AMR card authorizes through daemon login status and returns to authorize on Sign out', async ({ page }) => {
  const state: VelaMockState = { loggedIn: false, loginRequests: 0, logoutRequests: 0, statusRequests: 0 };
  await wireDaemonMocks(page, state);

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: baseStorageConfig() },
  );

  await gotoEntryHome(page);
  const dialog = await openSettingsDialog(page);

  const amrCard = dialog
    .locator('.amr-agent-card, .agent-card-installed')
    .filter({ hasText: /Open Design AMR|AMR \(vela\)/i })
    .first();
  await expect(amrCard).toBeVisible();

  // Initial state: logged out -> the authorization button is visible on the pill.
  await expect.poll(() => state.statusRequests).toBeGreaterThan(0);
  const signInBtn = amrCard.getByRole('button', { name: /^(Authorize|Sign in)$/ });
  await expect(signInBtn).toBeVisible();

  // Click Sign in -> daemon returns 202 and status starts reporting loggedIn=true.
  await signInBtn.click();
  await expect.poll(() => state.loginRequests).toBe(1);

  // The pill polls /status every 2s; allow up to 10s for the flip. The
  // pill button gets aria-label="Sign out" once logged in regardless of
  // the hover state, so we can target it by accessible name.
  const signedInPill = amrCard.getByRole('button', { name: /^Sign out$/ });
  await expect(signedInPill).toBeVisible({ timeout: 10_000 });
  await expect(amrCard).toContainText('pill-test@example.com');

  // Click Sign out -> status flips back to loggedIn=false.
  await signedInPill.click();
  await expect.poll(() => state.logoutRequests).toBe(1);
  await expect(amrCard.getByRole('button', { name: /^(Authorize|Sign in)$/ })).toBeVisible({ timeout: 10_000 });
});
