import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { writeFakeVelaBin, seedVelaLoginConfig } from '@/amr';
import { createFakeAgentRuntimes } from '@/playwright/fake-agents';
import {
  createProjectViaApi,
  gotoProject,
  openSettingsDialog,
  putAppConfig,
  seedBrowserConfig,
  sendPrompt,
  STORAGE_KEY,
} from '@/playwright/amr';

let codexRuntime: Awaited<ReturnType<typeof createFakeAgentRuntimes>>['codex'];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  codexRuntime = (await createFakeAgentRuntimes(['codex'])).codex;
});

test('AMR auth failures surface a clear error and return the composer to a usable idle state', async ({ page }) => {
  const amr = await setupAmrWorkspace(page, { failAuthAtPrompt: true, selectedAgentId: 'amr' });

  await gotoProject(page, amr.projectId);
  await sendPrompt(page, 'AMR auth failure smoke');

  await expect(page.locator('.msg.error')).toContainText(/sign in again|expired|ACP session exited before completion/i, { timeout: 15_000 });
  const input = page.getByTestId('chat-composer-input');
  await expect(input).toBeVisible();
  await input.fill('Retry after AMR auth failure');
  await expect(page.getByTestId('chat-send')).toBeEnabled();
});

test('after an AMR failure the user can switch to Codex and complete a fresh run', async ({ page }) => {
  const amr = await setupAmrWorkspace(page, { failAuthAtPrompt: true, selectedAgentId: 'amr' });

  await gotoProject(page, amr.projectId);
  await sendPrompt(page, 'AMR auth failure before switch smoke');
  await expect(page.locator('.msg.error')).toContainText(/sign in again|expired|ACP session exited before completion/i, { timeout: 15_000 });

  const settings = await openSettingsDialog(page);
  await settings.getByRole('tab', { name: /Local CLI/i }).click();
  await settings.getByRole('button', { name: /Codex CLI/i }).click();
  await expect
    .poll(async () => {
      const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
      return raw ? JSON.parse(raw).agentId : null;
    })
    .toBe('codex');
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);

  await sendPrompt(page, 'Create a deterministic smoke artifact');
  await expect(page.getByTestId('artifact-preview-frame')).toBeVisible({ timeout: 20_000 });
  await expect(
    page.frameLocator('[data-testid="artifact-preview-frame"]').getByRole('heading', {
      name: 'Real Daemon Smoke',
    }),
  ).toBeVisible();
});

async function setupAmrWorkspace(
  page: Page,
  options: {
    failAuthAtPrompt: boolean;
    selectedAgentId: 'amr' | 'codex';
  },
) {
  const root = join(tmpdir(), `open-design-amr-ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const homeDir = join(root, 'home');
  const velaBin = await writeFakeVelaBin(join(root, 'bin'), {
    failAuthAtPrompt: options.failAuthAtPrompt,
  });
  await mkdir(homeDir, { recursive: true });
  await seedVelaLoginConfig(homeDir, { email: 'ui-amr@example.com', profile: 'local' });

  const config = {
    mode: 'daemon',
    apiKey: '',
    baseUrl: '',
    model: '',
    agentId: options.selectedAgentId,
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {
      amr: { model: 'default', reasoning: 'default' },
      codex: { model: 'default', reasoning: 'default' },
    },
    agentCliEnv: {
      amr: { VELA_BIN: velaBin, HOME: homeDir },
      codex: codexRuntime.env,
    },
  };

  await seedBrowserConfig(page, config);
  await putAppConfig(page, config);

  const projectId = `amr-ui-${Date.now()}`.replace(/[^A-Za-z0-9._-]/g, '-');
  await createProjectViaApi(page, projectId, 'AMR UI failure smoke');
  return { projectId, homeDir, velaBin };
}
