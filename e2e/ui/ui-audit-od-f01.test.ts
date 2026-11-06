import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@/playwright/suite';
import { T } from '@/timeouts';
import { mockAmrPersonalWorkspace, AMR_PERSONAL_WORKSPACE_CONTEXT } from '../lib/playwright/amr.js';

const output = resolve(import.meta.dirname, '../../.tmp/ui-audit/final-design-review/phase-B-f01');
test.use({ viewport: { width: 1440, height: 904 }, deviceScaleFactor: 2, colorScheme: 'light', locale: 'zh-CN' });

test('F01 long comments fold independently in real OD file viewer', async ({ page }) => {
  test.setTimeout(T.xlong);
  await page.addInitScript(() => {
    localStorage.setItem('open-design:locale', 'zh-CN');
    localStorage.setItem('open-design:locale-source', 'manual');
  });
  await mockAmrPersonalWorkspace(page);
  await page.route('**/api/projects/*/workspace-scope', async route => {
    const projectId = new URL(route.request().url()).pathname.match(/\/api\/projects\/([^/]+)/)?.[1];
    await route.fulfill({ json: { scope: { kind: 'personal', projectId,
      workspaceId: AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId,
      visibility: 'personal', context: AMR_PERSONAL_WORKSPACE_CONTEXT } } });
  });
  const projectId = `ui-audit-f01-${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: {
    id: projectId, name: 'F01 comment folding fixture', skillId: null, designSystemId: null,
    metadata: { kind: 'prototype', nameSource: 'user' },
  } });
  expect(created.ok(), await created.text()).toBe(true);
  const { conversationId } = await created.json() as { conversationId: string };
  const content = '<!doctype html><html><body><h1 data-od-id="audit-target">审计产物</h1></body></html>';
  const file = await page.request.post(`/api/projects/${projectId}/files`, { data: {
    name: 'index.html', content,
    artifactManifest: { version: 1, kind: 'html', title: 'index.html', entry: 'index.html', renderer: 'html', exports: ['html'] },
  } });
  expect(file.ok(), await file.text()).toBe(true);
  const target = { filePath: 'index.html', elementId: 'audit-target', selector: '[data-od-id="audit-target"]',
    label: '标题', text: '审计产物', htmlHint: '<h1 data-od-id="audit-target">',
    position: { x: 0.1, y: 0.1, width: 0.5, height: 0.1 } };
  const notes = [
    Array.from({ length: 7 }, (_, index) => `第一条很长的评论 第${index + 1}行需要独立展开。`).join('\n'),
    '短评论。',
    Array.from({ length: 6 }, (_, index) => `第二条很长的评论 第${index + 1}行不会跟着展开。`).join('\n'),
  ];
  for (const note of notes) {
    const saved = await page.request.post(`/api/projects/${projectId}/conversations/${conversationId}/comments`, {
      data: { target, note },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
  }
  await page.goto(`/projects/${projectId}/files/index.html`);
  await page.getByTestId('comment-panel-toggle').click();
  const panel = page.getByTestId('comment-side-panel');
  await expect(panel).toBeVisible();
  const first = panel.getByTestId('comment-side-item').filter({ hasText: '第一条很长的评论' });
  const brief = panel.getByTestId('comment-side-item').filter({ hasText: '短评论。' });
  const second = panel.getByTestId('comment-side-item').filter({ hasText: '第二条很长的评论' });
  await expect(panel.getByTestId('comment-side-item')).toHaveCount(3);
  const expandFirst = first.getByRole('button', { name: '展开', exact: true });
  await expect(expandFirst).toHaveAttribute('aria-expanded', 'false');
  await expect(second.getByRole('button', { name: '展开', exact: true })).toBeVisible();
  await expect(brief.getByRole('button', { name: '展开', exact: true })).toHaveCount(0);
  const folded = await first.locator('.comment-side-body').evaluate(element => ({
    scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
    lineHeight: getComputedStyle(element).lineHeight,
    width: element.getBoundingClientRect().width,
  }));
  expect(folded.scrollHeight).toBeGreaterThan(folded.clientHeight);
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: resolve(output, 'OD-F01-folded.png'), animations: 'disabled' });
  await expandFirst.click();
  await expect(first.getByRole('button', { name: '收起', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(second.getByRole('button', { name: '展开', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({ path: resolve(output, 'OD-F01-first-expanded.png'), animations: 'disabled' });
  await first.getByRole('button', { name: '收起', exact: true }).click();
  await expect(first.getByRole('button', { name: '展开', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({ path: resolve(output, 'OD-F01-restored.png'), animations: 'disabled' });
  await writeFile(resolve(output, 'metrics.json'), JSON.stringify({ viewport: page.viewportSize(), folded,
    capture: ['folded', 'first-expanded', 'restored'], source: 'actual-real-local-OD' }, null, 2));
});
