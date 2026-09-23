import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@/playwright/suite';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { ensureRailOpen } from '@/playwright/rail';
import { cleanupSkillFixture } from '@/playwright/skill-fixture-cleanup';

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
});

test('[P1] imports a valid local Skill folder through the running product', async ({
  page,
}, testInfo) => {
  const skillName = `folder-import-${testInfo.workerIndex}-${Date.now()}`;
  const skillDir = testInfo.outputPath(skillName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    [
      '---',
      `name: ${skillName}`,
      'description: Browser regression fixture for local folder import.',
      '---',
      '',
      '# Folder import fixture',
      '',
      'Return `folder-import-ok` when invoked.',
      '',
    ].join('\n'),
    'utf8',
  );
  let importCompleted = false;
  let importedSkillId: string | null = null;
  let cleanupHeaders: Record<string, string> | undefined;

  try {
    await page.goto('/');
    await ensureRailOpen(page);
    await page.getByTestId('entry-nav-plugins').click();
    await expect(page).toHaveURL(/\/plugins$/);

    const plugins = page.getByTestId('entry-view-plugins');
    await plugins.getByRole('button', { name: /Skills|技能/, exact: true }).click();
    await plugins.getByRole('button', { name: /^(Add|新增)$/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const folderInput = dialog.locator('input[webkitdirectory]');
    await folderInput.setInputFiles(skillDir);
    await expect(dialog.getByRole('button', { name: /1 file|1 个文件/ })).toBeVisible();

    const imported = page.waitForResponse((response) =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/skills/import',
    );
    await dialog.getByTestId('plugin-create-upload-folder').click();
    const importResponse = await imported;
    expect(importResponse.ok()).toBe(true);
    importCompleted = true;
    const importedPayload = await importResponse.json() as { skill?: { id?: unknown } };
    const responseSkillId = importedPayload.skill?.id;
    expect(typeof responseSkillId).toBe('string');
    if (typeof responseSkillId !== 'string') throw new Error('Skill import response omitted skill.id');
    importedSkillId = responseSkillId;
    const importHeaders = await importResponse.request().allHeaders();
    cleanupHeaders = Object.fromEntries(
      Object.entries(importHeaders).filter(([name]) => name.startsWith('x-od-workspace-')),
    );

    await expect(page.getByRole('status')).toContainText(skillName);
    await expect(plugins.getByText(skillName, { exact: true }).first()).toBeVisible();
  } finally {
    // The worker-scoped daemon/data root survives across UI files. Remove the
    // fixture even when an assertion fails so this browser witness cannot leak
    // state into a later test that happens to reuse the same worker.
    const cleanupSkillId = importedSkillId ?? skillName;
    await cleanupSkillFixture(
      () => page.request.delete(
        `/api/skills/${encodeURIComponent(cleanupSkillId)}`,
        cleanupHeaders ? { headers: cleanupHeaders } : undefined,
      ),
      { importCompleted, skillName: cleanupSkillId },
    );
  }
});
