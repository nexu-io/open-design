import { expect, test } from '@/playwright/suite';
import { mockAmrPersonalWorkspace, AMR_PERSONAL_WORKSPACE_CONTEXT } from '../lib/playwright/amr.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', locale: 'zh-CN' });

test('capture Owner-S9-R while resume-only request is pending', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('open-design:locale', 'zh-CN');
    localStorage.setItem('open-design:locale-source', 'manual');
  });
  await mockAmrPersonalWorkspace(page);
  await page.route('**/api/projects/*/workspace-scope', async route => {
    const projectId = new URL(route.request().url()).pathname.match(/\/api\/projects\/([^/]+)/)?.[1];
    await route.fulfill({ json: { scope: { kind: 'personal', projectId, workspaceId: AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId, visibility: 'personal', context: AMR_PERSONAL_WORKSPACE_CONTEXT } } });
  });
  const projectId = `ui-audit-reopen-${Date.now()}`;
  const project = await page.request.post('/api/projects', { data: { id: projectId, name: 'S9-R isolated capture', skillId: null, designSystemId: null, metadata: { kind: 'prototype', nameSource: 'user' } } });
  expect(project.ok(), await project.text()).toBeTruthy();
  const { conversationId } = await project.json() as { conversationId: string };
  const content = '<!doctype html><html lang="zh-CN"><body><main><h1>审计产物</h1></main></body></html>';
  const file = await page.request.post(`/api/projects/${projectId}/files`, { data: { name: 'index.html', content, artifactManifest: { version: 1, kind: 'html', title: 'index.html', entry: 'index.html', renderer: 'html', exports: ['html'] } } });
  expect(file.ok(), await file.text()).toBeTruthy();
  await page.route(`**/api/projects/${projectId}/files/index.html/share-plan`, route => route.fulfill({ json: { fileCount: 1, totalBytes: content.length, exceedsSizeLimit: false, exclusions: [] } }));
  const now = Date.now();
  await page.request.put(`/api/projects/${projectId}/conversations/${conversationId}/messages/s9r-fixture`, { data: { id: 's9r-fixture', role: 'assistant', content: '已生成产物。', runStatus: 'succeeded', startedAt: now - 2000, endedAt: now - 1000, createdAt: now - 1500, events: [{ kind: 'tool_use', id: 'write-index', name: 'Write', input: { file_path: `/project/${projectId}/index.html`, content } }, { kind: 'tool_result', toolUseId: 'write-index', content: 'ok', isError: false }, { kind: 'text', text: '已生成产物。' }, { kind: 'artifact_focus', show: ['index.html'] }], producedFiles: [{ name: 'index.html', path: 'index.html', localPath: `/project/${projectId}/index.html`, type: 'file', size: content.length, mtime: now - 1000, kind: 'html', mime: 'text/html' }] } });
  await page.route(`**/api/projects/${projectId}/share-state`, route => route.fulfill({ json: { projectId, bindingExists: true, hasEverShared: true, publications: [{ sourceFilePath: 'index.html', slug: 's9r-original', status: 'stopped' }] } }));
  await page.route(`**/api/projects/${projectId}/files/index.html/public-share-state`, route => route.fulfill({ json: { status: 'stopped', slug: 's9r-original' } }));
  await page.goto(`/projects/${projectId}/files/index.html`);
  const share = page.getByTestId('file-workspace').getByRole('button', { name: '分享', exact: true });
  await share.click();
  const menu = page.locator('.share-menu-popover[role="menu"]');
  await expect(menu).toBeVisible();
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const requestStarted = new Promise<void>(resolve => { started = resolve; });
  await page.route(`**/api/projects/${projectId}/files/index.html/publish-public`, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    expect(route.request().postDataJSON()).toEqual({ mode: 'resume' });
    started();
    await gate;
    await route.fulfill({ json: { url: 'https://viewer.example.test/cloud/artifact/project/s9r-original', slug: 's9r-original', fileName: 'index.html' } });
  });
  await menu.getByRole('switch', { name: '链接访问' }).click();
  try {
    await requestStarted;
    await expect(menu.getByRole('menuitem', { name: '正在开启…' })).toBeDisabled();
    await expect(menu.getByRole('menuitem', { name: '正在开启…' })).toBeVisible();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(menu.getByRole('progressbar')).toHaveCount(0);
    await expect(menu.getByText('上传中 0%')).toHaveCount(0);
    await expect(menu.getByText('关闭面板不会中断上传。')).toHaveCount(0);
    const output = resolve(import.meta.dirname, '../../.tmp/ui-audit/final-design-review/current');
    await mkdir(output, { recursive: true });
    const capturedAt = new Date().toISOString();
    const timestamp = capturedAt.replaceAll(':', '-');
    const screenshotName = 'Owner-S9-R-' + timestamp;
    const screenshotPath = resolve(output, screenshotName + '.png');
    await page.screenshot({ path: screenshotPath });
    await expect(menu.getByRole('menuitem', { name: '正在开启…' })).toBeVisible();
    const busyBackground = await menu.getByRole('menuitem', { name: '正在开启…' }).evaluate(element => getComputedStyle(element).backgroundColor);
    expect(busyBackground).toMatch(/^rgb\(/);
    await writeFile(resolve(output, screenshotName + '.json'), JSON.stringify({
      capturedAt,
      source: 'current-playwright-mocked',
      mockBoundary: 'Real daemon project and UI; stopped publication GET and resume POST service response are Playwright routes. Pending resume request remains gated during capture.',
      projectId,
      publicationStatus: 'stopped',
      resumeMode: 'resume',
      screenshot: screenshotPath,
      menuText: await menu.innerText(),
      publicUrl: 'https://viewer.example.test/cloud/artifact/project/s9r-original',
    }, null, 2) + '\n');
  } finally {
    release();
  }
  await expect(menu.locator('.chrome-publish-url')).toHaveText('https://viewer.example.test/cloud/artifact/project/s9r-original');
});
