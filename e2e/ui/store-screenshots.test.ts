import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import JSZip from 'jszip';
import { expect, test } from '@/playwright/suite';
import { T } from '@/timeouts';
import type { Page, Response } from '@playwright/test';
import { storeScreenshotDocument as documentFixture } from '../resources/store-screenshot-document.ts';

const STORAGE_KEY = 'open-design:config';
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
  'base64',
);

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, JSON.stringify({
      mode: 'daemon',
      apiKey: '',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
      agentId: null,
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      agentModels: {},
      privacyDecisionAt: 1,
      telemetry: { metrics: false, content: false, artifactManifest: false },
    }));
  }, STORAGE_KEY);
});

test('[P1] no-provider workspace switches platforms, reviews a real edit, restores a version, and validates the two-platform export', async ({ page }) => {
  const projectId = await createStoreScreenshotProject(page);
  await page.goto(`/projects/${projectId}`, { waitUntil: 'domcontentloaded' });

  const workspace = page.getByTestId('store-screenshot-workspace');
  await expect(workspace).toBeVisible({ timeout: T.medium });
  await expect(page.getByTestId('store-screenshot-card')).toHaveCount(4);
  await expect(page.getByText('Connect a Provider to generate with AI. You can keep editing manually.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate with AI' })).toBeDisabled();

  await page.getByRole('tab', { name: 'Google Play' }).click();
  await expect(page.getByRole('tab', { name: 'Google Play' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('store-screenshot-canvas').first()).toHaveCSS('aspect-ratio', '1080 / 1920');

  await page.getByRole('button', { name: 'Fine edit' }).click();
  await expect(page.getByTestId('store-screenshot-editor-canvas')).toBeVisible();
  await page.getByRole('textbox', { name: 'Headline' }).fill('A focused Google Play story');
  const preview = waitForStoreResponse(page, 'POST', '/changes/preview');
  await page.getByRole('textbox', { name: 'Headline' }).press('Tab');
  expect((await preview).ok()).toBe(true);
  const review = page.getByRole('dialog', { name: 'Review changes' });
  await expect(review).toBeVisible();
  await expect(review.getByTestId(/change-preview-.*-googlePlay/)).toHaveCount(2);
  const apply = waitForStoreResponse(page, 'POST', '/changes/apply');
  await review.getByRole('button', { name: 'Apply changes' }).click();
  expect((await apply).ok()).toBe(true);
  await expect(review).toHaveCount(0);

  await page.getByRole('button', { name: 'Close editor' }).click();
  await page.getByRole('button', { name: 'Version history' }).click();
  await expect(page.getByRole('heading', { name: 'Version history' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore version 1' }).click();
  const restore = waitForStoreResponse(page, 'POST', '/versions/1/restore');
  await page.getByRole('alertdialog', { name: 'Restore this version?' })
    .getByRole('button', { name: 'Restore version' }).click();
  expect((await restore).ok()).toBe(true);
  await expect(page.getByTestId('store-screenshot-card')).toHaveCount(4);

  const exportStarted = waitForStoreResponse(page, 'POST', '/export');
  await page.getByRole('button', { name: 'Export' }).click();
  expect((await exportStarted).ok()).toBe(true);
  await expect(page.getByText('Export complete.')).toBeVisible({ timeout: T.long });
  const downloadLink = page.getByRole('link', { name: 'Download ZIP' });
  await expect(downloadLink).toBeVisible();
  await expect(page.getByText('8 files validated')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await downloadLink.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('store-screenshots.zip');
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const zip = await JSZip.loadAsync(await readFile(downloadPath!));
  expect(zip.file('manifest.json')).not.toBeNull();
  expect(Object.keys(zip.files).filter((name) => name.endsWith('.png'))).toHaveLength(8);
});

async function createStoreScreenshotProject(page: Page): Promise<string> {
  const projectId = `store-ui-${randomUUID()}`;
  const project = await page.request.post('/api/projects', {
    data: {
      id: projectId,
      name: 'Store screenshot UI smoke',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'image', intent: 'store-screenshot' },
    },
  });
  expect(project.ok(), await project.text()).toBe(true);

  const document = await page.request.post(`/api/projects/${projectId}/store-screenshots`, {
    data: {
      ...documentFixture,
    },
  });
  expect(document.ok(), await document.text()).toBe(true);

  const uploaded = await page.request.post(`/api/projects/${projectId}/store-screenshots/assets`, {
    multipart: {
      file: { name: 'focus-atlas.png', mimeType: 'image/png', buffer: TINY_PNG },
    },
  });
  expect(uploaded.ok(), await uploaded.text()).toBe(true);
  return projectId;
}

function waitForStoreResponse(page: Page, method: string, suffix: string): Promise<Response> {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === method
      && url.pathname.includes('/store-screenshots')
      && url.pathname.endsWith(suffix);
  }, { timeout: T.long });
}
