import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@/playwright/suite';

import { writeFakeVelaBin } from '@/amr';
import { routeAgents } from '@/playwright/mock-factory';
import { T } from '@/timeouts';
import {
  createProjectViaApi,
  gotoProject,
  mockAmrWalletSnapshot,
  openSettingsDialog,
  putAppConfig,
  seedBrowserConfig,
  sendPrompt,
} from '@/playwright/amr';

test.describe.configure({ timeout: T.xlong });

async function stubCatalogsEmpty(page: import('@playwright/test').Page) {
  await page.route('**/api/skills', async (route) => {
    await route.fulfill({ json: { skills: [] } });
  });
  await page.route('**/api/design-templates', async (route) => {
    await route.fulfill({ json: { designTemplates: [] } });
  });
  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: [] } });
  });
  await routeAgents(page, [
    {
      id: 'amr',
      name: 'Open Design AMR',
      bin: 'vela',
      available: true,
      version: 'test',
      models: [{ id: 'glm-5', label: 'glm-5' }],
    },
  ]);
}

test('[P0] after local Sign out, AMR runs require re-login and Settings keeps AMR selected', async ({ page }) => {
  await stubCatalogsEmpty(page);
  const root = join(tmpdir(), `open-design-amr-logout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const reloginVelaBin = await writeFakeVelaBin(join(root, 'bin-relogin'), {
    failAuthAtPrompt: true,
    requireLoginConfig: false,
    requireSetModel: false,
  });
  await mkdir(root, { recursive: true });
  let loggedIn = true;

  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({
      json: loggedIn
        ? {
            loggedIn: true,
            profile: 'local',
            configPath: '/tmp/.amr/config.json',
            user: { id: 'logout-ui', email: 'logout-ui@example.com' },
          }
        : {
            loggedIn: false,
            profile: 'local',
            configPath: '/tmp/.amr/config.json',
            user: null,
          },
    });
  });

  await page.route('**/api/integrations/vela/logout', async (route) => {
    loggedIn = false;
    await route.fulfill({ json: { ok: true } });
  });
  await mockAmrWalletSnapshot(page, {
    email: 'logout-ui@example.com',
    loggedIn: () => loggedIn,
    plan: 'free',
    profile: 'local',
  });

  const config = {
    mode: 'daemon',
    apiKey: '',
    baseUrl: '',
    model: '',
    agentId: 'amr',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    privacyDecisionAt: 1,
    mediaProviders: {},
    agentModels: {
      amr: { model: 'default', reasoning: 'default' },
    },
    agentCliEnv: {
      amr: { VELA_BIN: reloginVelaBin },
    },
  };

  await seedBrowserConfig(page, config);
  await putAppConfig(page, config);

  const projectId = `amr-logout-${Date.now()}`.replace(/[^A-Za-z0-9._-]/g, '-');
  await createProjectViaApi(page, projectId, 'AMR logout requires relogin');
  await gotoProject(page, projectId);

  const settings = await openSettingsDialog(page);
  await expect(settings.getByRole('button', { name: /Open Design/i }).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByRole('button', { name: /^Sign out$/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  await page.evaluate(async () => {
    const response = await fetch('/api/integrations/vela/logout', { method: 'POST' });
    if (!response.ok) throw new Error(`logout failed: ${response.status}`);
  });
  const reopenedSettings = await openSettingsDialog(page);
  await expect(reopenedSettings.getByRole('button', { name: /Open Design/i }).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(reopenedSettings.getByRole('button', { name: /^Authorize$|^Sign in$/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(reopenedSettings).toHaveCount(0);
  const reloginConfig = {
    ...config,
    agentCliEnv: {
      amr: { VELA_BIN: reloginVelaBin },
    },
  };
  await putAppConfig(page, reloginConfig);
  await page.evaluate((next) => {
    window.localStorage.setItem('open-design:config', JSON.stringify(next));
  }, reloginConfig);
  await gotoProject(page, projectId);
  await sendPrompt(page, 'AMR logout should require relogin');

  const balanceGate = page.getByTestId('amr-balance-dialog');
  await expect(balanceGate).toBeVisible({ timeout: 15_000 });
  await expect(balanceGate).toContainText(/Sign in to start creating/i);
  await expect(balanceGate).toContainText(/sign in and this task can start right away/i);
  await expect(balanceGate.getByRole('button', { name: /^Sign in$/i })).toBeVisible();

  const configResponse = await page.request.get('/api/app-config');
  expect(configResponse.ok(), await configResponse.text()).toBeTruthy();
  const body = (await configResponse.json()) as { config?: { agentId?: string } };
  expect(body.config?.agentId).toBe('amr');
});
