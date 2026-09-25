import { expect, test } from '@/playwright/suite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mockAmrPersonalWorkspace, AMR_PERSONAL_WORKSPACE_CONTEXT } from '../lib/playwright/amr.js';

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', locale: 'zh-CN' });

test('Owner-K2 keeps failed published-comment status and retry unboxed in the Share popup', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('open-design:locale', 'zh-CN');
    localStorage.setItem('open-design:locale-source', 'manual');
  });
  await mockAmrPersonalWorkspace(page);
  await page.route('**/api/projects/*/workspace-scope', async route => {
    const projectId = new URL(route.request().url()).pathname.match(/\/api\/projects\/([^/]+)/)?.[1];
    await route.fulfill({ json: { scope: { kind: 'personal', projectId, workspaceId: AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId, visibility: 'personal', context: AMR_PERSONAL_WORKSPACE_CONTEXT } } });
  });

  const projectId = `ui-audit-owner-k2-${Date.now()}`;
  const project = await page.request.post('/api/projects', { data: { id: projectId, name: 'Owner K2 retry fixture', skillId: null, designSystemId: null, metadata: { kind: 'prototype', nameSource: 'user' } } });
  expect(project.ok(), await project.text()).toBeTruthy();
  const content = '<!doctype html><html lang="zh-CN"><body><main><h1>审计产物</h1></main></body></html>';
  const file = await page.request.post(`/api/projects/${projectId}/files`, { data: { name: 'index.html', content, artifactManifest: { version: 1, kind: 'html', title: 'index.html', entry: 'index.html', renderer: 'html', exports: ['html'] } } });
  expect(file.ok(), await file.text()).toBeTruthy();

  await page.route(`**/api/projects/${projectId}/share-state`, route => route.request().method() === 'GET'
    ? route.fulfill({ json: { projectId, bindingExists: true, hasEverShared: true, publications: [{ sourceFilePath: 'index.html', slug: 'k2-published', status: 'active' }] } })
    : route.fallback());
  await page.route(`**/api/projects/${projectId}/files/index.html/publish-public`, route => route.request().method() === 'GET'
    ? route.fulfill({ json: { status: 'active', freshness: 'fresh', publication: { slug: 'k2-published', url: 'https://viewer.example.test/cloud/artifact/project/k2-published', fileName: 'index.html' } } })
    : route.fallback());

  let projection: Record<string, unknown> = {
    pending: 0,
    lastError: 'COMMENT_BACKFILL_PUSH_FAILED',
    sessionMissing: false,
    shareStopped: false,
    backfill: { state: 'failed', filePath: 'index.html', publicationRevision: 'k2-r1', retryable: true },
  };
  await page.route(`**/api/projects/${projectId}/comment-sync-state*`, route => route.fulfill({ json: projection }));
  await page.goto(`/projects/${projectId}/files/index.html`);
  await page.getByTestId('file-workspace').getByRole('button', { name: '分享', exact: true }).click();
  const menu = page.locator('.share-menu-popover[role="menu"]');
  await expect(menu).toBeVisible();
  const status = menu.getByRole('status');
  await expect(status).toContainText('分享已发布');
  await expect(status).toContainText('已有评论暂未同步');
  const retry = status.getByRole('button', { name: '重试' });
  await expect(retry).toBeVisible();
  const statusStyle = await status.evaluate(element => ({ border: getComputedStyle(element).borderTopWidth, background: getComputedStyle(element).backgroundColor }));
  expect(statusStyle).toEqual({ border: '0px', background: 'rgba(0, 0, 0, 0)' });
  await expect(menu.getByText('https://viewer.example.test/cloud/artifact/project/k2-published')).toBeVisible();
  await expect(menu.getByRole('button', { name: '复制链接' })).toBeVisible();
  const output = resolve(import.meta.dirname, '../../.tmp/ui-audit/final-design-review/current');
  await mkdir(output, { recursive: true });
  const captureId = `Owner-K2-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const screenshot = resolve(output, `${captureId}.png`);
  await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
  await writeFile(resolve(output, `${captureId}.json`), JSON.stringify({
    id: captureId,
    capturedAt: new Date().toISOString(),
    source: 'current-playwright-mocked',
    mockBoundary: 'GET comment-sync-state returns a persisted failed/retryable backfill projection; the popup preserves status and retry in an unboxed presentation.',
    projectId,
    backfill: projection.backfill,
    screenshot,
    viewport: page.viewportSize(),
    text: await menu.innerText(),
  }, null, 2) + '\n');

});
