import { test, expect } from '@/playwright/suite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReasoningCodex } from '../lib/codex-reasoning.js';
import { T } from '@/timeouts';

test('live Codex reasoning is discoverable and repairs a persisted selection', async ({ page }, testInfo) => {
  test.setTimeout(T.xlong * 2);
  const root = await mkdtemp(join(tmpdir(), 'od-reasoning-ui-'));
  try {
    const fixture = await createReasoningCodex(root);
    const saved = await page.request.put('/api/app-config', { data: {
      mode: 'daemon', agentId: 'codex', onboardingCompleted: true, locale: 'en',
      agentCliEnv: { codex: fixture.env },
      agentModels: { codex: { model: 'gpt-6-astra', reasoning: 'ultra' } },
    } });
    expect(saved.ok()).toBe(true);
    await page.goto('/');
    const chip = page.getByTestId('inline-model-switcher-chip');
    await expect(chip).toBeVisible({ timeout: T.xlong });
    await chip.click();
    await expect(page.getByTestId('inline-model-switcher-compact-model-gpt-6-astra')).toBeChecked({ timeout: T.long });
    const reasoning = page.getByTestId('inline-model-switcher-reasoning');
    await expect(reasoning).toHaveValue('ultra');
    await expect(reasoning.locator('option')).toHaveText(['Default', 'Low', 'Medium', 'High', 'XHigh', 'Max', 'Ultra', 'deep-v2']);
    await page.screenshot({ path: testInfo.outputPath('astra-reasoning.png'), fullPage: true });
    const persisted = page.waitForResponse((response) => response.request().method() === 'PUT'
      && new URL(response.url()).pathname === '/api/app-config'
      && response.request().postDataJSON()?.agentModels?.codex?.model === 'gpt-5.5');
    await page.getByTestId('inline-model-switcher-compact-model-gpt-5.5').click();
    expect((await persisted).ok()).toBe(true);
    await chip.click();
    await expect(reasoning).toHaveValue('default');
    await expect(reasoning.locator('option')).toHaveText(['Default', 'Low', 'Medium', 'High', 'XHigh']);
    await page.screenshot({ path: testInfo.outputPath('model-switch-default.png'), fullPage: true });
    await page.reload();
    await chip.click();
    await expect(page.getByTestId('inline-model-switcher-compact-model-gpt-5.5')).toBeChecked({ timeout: T.long });
    await expect(reasoning).toHaveValue('default');
  } finally {
    await page.request.put('/api/app-config', { data: { agentCliEnv: {}, agentModels: {} } });
    await page.close();
    await rm(root, { recursive: true, force: true });
  }
});
