import { expect, test } from '@/playwright/suite';
import {
  AMR_PERSONAL_WORKSPACE_CONTEXT,
  mockAmrPersonalWorkspace,
  seedBrowserConfig,
} from '@/playwright/amr';
import { fulfillAgentsRoute, suppressWhatsNew } from '@/playwright/mock-factory';
import { mockSignedInVelaAccount } from '@/playwright/visual';
import { T } from '@/timeouts';
import type { Page } from '@playwright/test';

async function mockModelSettings(page: Page, previouslyFailed = false) {
  const config = {
    mode: 'daemon',
    agentId: 'amr',
    onboardingCompleted: true,
    privacyDecisionAt: 1,
    agentModels: {},
    agentCliEnv: {},
    telemetry: { metrics: false, content: false, artifactManifest: false },
  };
  await seedBrowserConfig(page, config);
  await page.addInitScript(() => localStorage.setItem('open-design:locale', 'en'));
  await suppressWhatsNew(page);
  await page.route('**/api/app-config', async (route) => {
    await route.fulfill({ json: { config } });
  });
  await mockSignedInVelaAccount(page);
  await mockAmrPersonalWorkspace(page);
  await page.route('**/api/agents**', async (route) => {
    await fulfillAgentsRoute(route, [{
      id: 'amr', name: 'OpenDesign', bin: 'vela', available: true,
      models: [{ id: 'ambient-model', label: 'Ambient model' }],
    }]);
  });
  let refreshes = 0;
  let recovered = !previouslyFailed;
  await page.route('**/api/amr/models*', async (route) => {
    const headers = route.request().headers();
    const scoped = headers['x-od-workspace-id'] === AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId
      && headers['x-od-workspace-member-id'] === AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceMemberId;
    if (scoped && new URL(route.request().url()).searchParams.get('refresh') === '1') {
      refreshes += 1;
      recovered = true;
      await route.fulfill({ json: {
        source: 'preset', models: [{ id: 'preset-model', label: 'Preset model' }], refreshing: true,
      } });
      return;
    }
    if (scoped && !recovered) {
      await route.fulfill({ json: {
        source: 'preset', models: [{ id: 'preset-model', label: 'Preset model' }],
        refreshing: false, remoteError: 'Previous model query failed',
      } });
      return;
    }
    await route.fulfill({ json: {
      source: scoped ? 'remote' : 'preset',
      models: [{ id: scoped ? 'scoped-model' : 'ambient-model', label: scoped ? 'Workspace model' : 'Ambient model' }],
      refreshing: false,
    } });
  });
  return { refreshCount: () => refreshes };
}

test('[P1] same-environment Rescan keeps the verified workspace model after scan completion @merge-extra', async ({ page }, testInfo) => {
  await mockModelSettings(page);
  await page.goto('/settings', { waitUntil: 'domcontentloaded' });
  const model = page.getByRole('combobox', { name: 'Model', exact: true });
  await expect(model).toHaveText('Workspace model', { timeout: T.medium });
  const scanned = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'GET' && url.pathname === '/api/agents'
      && url.searchParams.get('stream') === '1';
  });
  await page.getByRole('button', { name: /Rescan/, exact: false }).click();
  expect((await scanned).ok()).toBe(true);
  // The bug appears after the scan finishes, not in its first render.
  await expect(page.getByText('Scan complete. 1 available.', { exact: true })).toBeVisible();
  await expect(model).toHaveText('Workspace model');
  await expect(page.getByTestId('settings-agent-model-loading-amr')).toHaveCount(0);
  await expect(page.getByText('Ambient model', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('settings-rescan-model-ready.png') });
});

test('[P1] Rescan recovers a stopped workspace model query through one scoped refresh @merge-extra', async ({ page }) => {
  const models = await mockModelSettings(page, true);
  await page.goto('/settings', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('settings-agent-model-loading-amr')).toBeVisible({ timeout: T.medium });
  await page.getByRole('button', { name: /Rescan/, exact: false }).click();
  await expect(page.getByText('Scan complete. 1 available.', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toHaveText('Workspace model');
  await expect(page.getByTestId('settings-agent-model-loading-amr')).toHaveCount(0);
  expect(models.refreshCount()).toBe(1);
  await expect(page.getByText('Ambient model', { exact: true })).toHaveCount(0);
});
