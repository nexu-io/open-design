import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { writeFakeVelaBin } from '@/amr';
import {
  createProjectViaApi,
  gotoProject,
  openSettingsDialog,
  putAppConfig,
  seedBrowserConfig,
  sendPrompt,
} from '@/playwright/amr';

test('[P0] after local Sign out, AMR runs require re-login and Settings keeps AMR selected', async ({ page }) => {
  const root = join(tmpdir(), `open-design-amr-logout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const successVelaBin = await writeFakeVelaBin(join(root, 'bin-success'), {
    assistantText: 'Hello from the e2e fake vela.',
    requireLoginConfig: false,
  });
  const reloginVelaBin = await writeFakeVelaBin(join(root, 'bin-relogin'), {
    failAuthAtPrompt: true,
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

  const config = {
    mode: 'daemon',
    apiKey: '',
    baseUrl: '',
    model: '',
    agentId: 'amr',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {
      amr: { model: 'default', reasoning: 'default' },
    },
    agentCliEnv: {
      amr: { VELA_BIN: successVelaBin },
    },
  };

  await seedBrowserConfig(page, config);
  await putAppConfig(page, config);

  const projectId = `amr-logout-${Date.now()}`.replace(/[^A-Za-z0-9._-]/g, '-');
  await createProjectViaApi(page, projectId, 'AMR logout requires relogin');
  await gotoProject(page, projectId);

  const settings = await openSettingsDialog(page);
  await expect(settings.getByRole('button', { name: /Open Design AMR/i }).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByRole('button', { name: /^Sign out$/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  await page.evaluate(async () => {
    const response = await fetch('/api/integrations/vela/logout', { method: 'POST' });
    if (!response.ok) throw new Error(`logout failed: ${response.status}`);
  });
  const reopenedSettings = await openSettingsDialog(page);
  await expect(reopenedSettings.getByRole('button', { name: /Open Design AMR/i }).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(reopenedSettings.getByRole('button', { name: /^Authorize$|^Sign in$/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(reopenedSettings).toHaveCount(0);
  const reloginConfig = {
    ...config,
    agentCliEnv: {
      amr: { VELA_BIN: reloginVelaBin },
    },
  };
  await seedBrowserConfig(page, reloginConfig);
  await putAppConfig(page, reloginConfig);
  await sendPrompt(page, 'AMR logout should require relogin');

  await expect(page.locator('.msg.error')).toContainText(/authorize|sign in again|login missing|expired|ACP session exited before completion/i, {
    timeout: 15_000,
  });
  await expect(
    page.getByRole('button', { name: /Authorize & retry|Sign in via terminal|Sign in again/i }).first(),
  ).toBeVisible();

  const configResponse = await page.request.get('/api/app-config');
  expect(configResponse.ok(), await configResponse.text()).toBeTruthy();
  const body = (await configResponse.json()) as { config?: { agentId?: string } };
  expect(body.config?.agentId).toBe('amr');
});
