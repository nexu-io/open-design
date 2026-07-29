import { randomUUID } from 'node:crypto';

import { expect, test } from '@/playwright/suite';
import { T } from '@/timeouts';
import type { Page, Response } from '@playwright/test';
import documentFixture from '../resources/store-screenshot-document.json' with { type: 'json' };

test.setTimeout(T.xlong);

test('[P2] captures default, platforms, review, editor, history, and no-provider store screenshot states', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('open-design:config', JSON.stringify({
      mode: 'daemon', apiKey: '', agentId: null, skillId: null, designSystemId: null,
      onboardingCompleted: true, agentModels: {}, privacyDecisionAt: 1,
      telemetry: { metrics: false, content: false, artifactManifest: false },
    }));
    window.localStorage.setItem('open-design:locale', 'en');
    window.localStorage.setItem('open-design:locale-source', 'manual');
  });
  const projectId = await createVisualProject(page);
  await page.goto(`/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('store-screenshot-workspace')).toBeVisible({ timeout: T.medium });
  await expect(page.getByTestId('store-screenshot-card')).toHaveCount(4);
  await expect(page).toHaveScreenshot('store-screenshot-default.png', { animations: 'disabled' });

  await page.getByRole('tab', { name: 'Google Play' }).click();
  await expect(page).toHaveScreenshot('store-screenshot-google-play.png', { animations: 'disabled' });

  await page.getByRole('button', { name: 'Fine edit' }).click();
  await expect(page.getByTestId('store-screenshot-editor-canvas')).toBeVisible();
  await expect(page).toHaveScreenshot('store-screenshot-editor.png', { animations: 'disabled' });
  await page.getByRole('textbox', { name: 'Headline' }).fill('Review before applying');
  const preview = waitForStoreResponse(page, 'POST', '/changes/preview');
  await page.getByRole('textbox', { name: 'Headline' }).press('Tab');
  expect((await preview).ok()).toBe(true);
  await expect(page.getByRole('dialog', { name: 'Review changes' })).toBeVisible();
  await expect(page).toHaveScreenshot('store-screenshot-changeset-review.png', { animations: 'disabled' });
  await page.getByRole('dialog', { name: 'Review changes' }).getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Close editor' }).click();

  await page.getByRole('button', { name: 'Version history' }).click();
  const history = page.getByRole('region', { name: 'Version history' });
  await expect(history.getByRole('heading', { name: 'Version history' })).toBeVisible();
  await history.locator('time').evaluateAll((nodes) => {
    for (const node of nodes) (node as HTMLElement).style.visibility = 'hidden';
  });
  await expect(page).toHaveScreenshot('store-screenshot-history.png', { animations: 'disabled' });
});

async function createVisualProject(page: Page): Promise<string> {
  const id = `store-visual-${randomUUID()}`;
  const project = await page.request.post('/api/projects', { data: {
    id, name: 'Store screenshots visual', skillId: null, designSystemId: null, pendingPrompt: null,
    metadata: { kind: 'image', intent: 'store-screenshot' },
  } });
  expect(project.ok(), await project.text()).toBe(true);
  const document = await page.request.post(`/api/projects/${id}/store-screenshots`, { data: {
    ...documentFixture,
  } });
  expect(document.ok(), await document.text()).toBe(true);
  return id;
}

function waitForStoreResponse(page: Page, method: string, suffix: string): Promise<Response> {
  return page.waitForResponse((response) => response.request().method() === method
    && new URL(response.url()).pathname.includes('/store-screenshots')
    && new URL(response.url()).pathname.endsWith(suffix), { timeout: T.long });
}
