import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '@/playwright/suite';
import { mockAmrPersonalWorkspace, AMR_PERSONAL_WORKSPACE_CONTEXT } from '../lib/playwright/amr.js';

const output = resolve(import.meta.dirname, '../../.tmp/ui-audit/final-design-review/current');
const captureTime = new Date().toISOString().replace(/[:.]/g, '-');
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', locale: 'zh-CN' });

async function capture(page: Page, id: string, detail: Record<string, unknown> = {}) {
  const name = `Owner-${id}-${captureTime}`;
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: resolve(output, `${name}.png`), animations: 'disabled' });
  await writeFile(resolve(output, `${name}.json`), JSON.stringify({
    id: name, capturedAt: new Date().toISOString(), source: 'current-playwright-mocked', mocked: true,
    observedState: id, viewport: page.viewportSize(), text: await page.locator('body').innerText(),
    feedback: await page.locator('[role="status"], [role="alert"]').evaluateAll(elements => elements
      .filter(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; })
      .map(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { role: element.getAttribute('role'), text: element.textContent?.trim(),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          backgroundColor: style.backgroundColor, color: style.color, borderRadius: style.borderRadius, boxShadow: style.boxShadow };
      })),
    ...detail,
  }, null, 2));
}

async function createHtmlProject(page: Page, projectId: string) {
  await mockAmrPersonalWorkspace(page);
  await page.addInitScript(() => {
    localStorage.setItem('open-design:locale', 'zh-CN');
    localStorage.setItem('open-design:locale-source', 'manual');
  });
  await page.route('**/api/projects/*/workspace-scope', async route => {
    const id = new URL(route.request().url()).pathname.match(/\/api\/projects\/([^/]+)/)?.[1];
    await route.fulfill({ json: { scope: { kind: 'personal', projectId: id,
      workspaceId: AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId, visibility: 'personal', context: AMR_PERSONAL_WORKSPACE_CONTEXT } } });
  });
  const created = await page.request.post('/api/projects', { data: {
    id: projectId, name: 'Share audit isolated project', skillId: null, designSystemId: null,
    metadata: { kind: 'prototype', nameSource: 'user' },
  } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { conversationId } = await created.json() as { conversationId: string };
  const html = '<!doctype html><html><body><main><h1 data-od-id="audit-title">Share audit</h1><p>Existing review comment target</p></main></body></html>';
  const file = await page.request.post(`/api/projects/${projectId}/files`, { data: {
    name: 'index.html', content: html,
    artifactManifest: { version: 1, kind: 'html', title: 'index.html', entry: 'index.html', renderer: 'html', exports: ['html'] },
  } });
  expect(file.ok(), await file.text()).toBeTruthy();
  const now = Date.now();
  const messageId = `ui-audit-share-${projectId}`;
  const message = await page.request.put(`/api/projects/${projectId}/conversations/${conversationId}/messages/${messageId}`, { data: {
    id: messageId, role: 'assistant', content: '已生成审计产物。', runStatus: 'succeeded',
    startedAt: now - 2000, endedAt: now - 1000, createdAt: now - 1500,
    events: [{ kind: 'tool_use', id: 'write-audit', name: 'Write', input: { file_path: `/project/${projectId}/index.html`, content: html } },
      { kind: 'tool_result', toolUseId: 'write-audit', content: 'ok', isError: false },
      { kind: 'text', text: '已生成审计产物。' }, { kind: 'artifact_focus', show: ['index.html'] }],
    producedFiles: [{ name: 'index.html', path: 'index.html', localPath: `/project/${projectId}/index.html`, type: 'file', size: html.length, mtime: now - 1000, kind: 'html', mime: 'text/html' }],
  } });
  expect(message.ok(), await message.text()).toBeTruthy();
  await page.goto(`/projects/${projectId}/conversations/${conversationId}`);
  const card = page.getByTestId('artifact-card-publish-index.html');
  await expect(card).toBeVisible();
  await card.click();
  const share = page.locator('.share-menu-popover[role="menu"]');
  await expect(share).toBeVisible();
  return { projectId, conversationId, share };
}

test('capture remaining OD share audit states from visible product UI', async ({ page }) => {
  test.setTimeout(120_000);
  const projectId = `ui-audit-share-remaining-${Date.now()}`;
  const { share } = await createHtmlProject(page, projectId);

  // G4 is a negative assertion on the real shared entry, not a synthetic screen.
  await expect(share.getByText(/快速分享|Quick share|Social share/)).toHaveCount(0);
  await capture(page, 'G4');

  // S5/S6 are captured only if the authoritative read actually offers an update
  // action. A made-up stale button/state would not establish the UI contract.
  const publishPath = `**/api/projects/${projectId}/files/index.html/publish-public`;
  const shareStatePath = publishPath;
  const oldUrl = `https://example.test/artifact/${projectId}/prior-link`;
  await page.route(shareStatePath, route => route.request().method() === 'GET'
    ? route.fulfill({ json: { status: 'active', freshness: 'outdated', publication: { url: oldUrl, slug: 'prior-link', fileName: 'index.html' } } })
    : route.fallback());
  await page.reload();
  await expect(page.getByTestId('artifact-card-publish-index.html')).toBeVisible();
  await page.getByTestId('artifact-card-publish-index.html').click();
  const updatedShare = page.locator('.share-menu-popover[role="menu"]');
  const update = updatedShare.getByRole('button', { name: /更新链接|Update link/ });
  await expect(update).toBeVisible();
  await expect(updatedShare.locator('.chrome-publish-url')).toContainText(oldUrl);
  await expect(updatedShare.getByRole('button', { name: /复制链接|Copy share link/ })).toBeVisible();
  await capture(page, 'S5', { priorUrl: oldUrl });

  let finish!: () => void;
  const gate = new Promise<void>(resolveGate => { finish = resolveGate; });
  await page.route(publishPath, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    await gate;
    await route.fulfill({ json: { url: oldUrl, slug: 'prior-link', fileName: 'index.html' } });
  });
  const request = page.waitForRequest(req => req.method() === 'POST' && req.url().includes('/publish-public'));
  await update.click();
  await request;
  await expect(update).toHaveAttribute('aria-busy', 'true');
  await capture(page, 'S6');
  finish();
  await expect(page.getByRole('status').filter({ hasText: /已更新|updated/i })).toBeVisible();
  await capture(page, 'S6-OK');

  // Re-arm the real update affordance and fail that user action (not a
  // synthetic toast injection) to capture the product's error feedback.
  await page.route(publishPath, route => route.request().method() === 'GET'
    ? route.fulfill({ json: { status: 'active', freshness: 'outdated', publication: { url: oldUrl, slug: 'prior-link', fileName: 'index.html' } } })
    : route.request().method() === 'POST'
      ? route.fulfill({ status: 500, json: { error: { code: 'ui_audit_update_failed', message: 'Audit update failure' } } })
      : route.fallback());
  await page.reload();
  await page.getByTestId('artifact-card-publish-index.html').click();
  const retryShare = page.locator('.share-menu-popover[role="menu"]');
  const retryUpdate = retryShare.getByRole('button', { name: /更新链接|Update link/ });
  await expect(retryUpdate).toBeVisible();
  await retryUpdate.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await capture(page, 'S6-ERR');
});

async function openDeleteConfirmation(page: Page, projectId: string) {
  await page.getByTestId('workspace-tabs-dropdown-trigger').click();
  const row = page.getByTestId('workspace-tabs-dropdown').locator('.workspace-tabs-dropdown__row')
    .filter({ hasText: 'Share audit isolated project' }).first();
  await expect(row).toBeVisible();
  await row.getByTestId('workspace-tabs-dropdown-row-more').click();
  await page.getByTestId('workspace-tabs-dropdown-row-menu').getByRole('menuitem', { name: /删除|Delete/ }).click();
  const confirm = page.getByTestId('project-delete-confirm-dialog');
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText(/分享链接将失效|分享链接.*无法再打开/);
  return confirm;
}

test('capture S14 historical share deletion warning from workspace menu', async ({ page }) => {
  const projectId = `ui-audit-s14-${Date.now()}`;
  await page.route(`**/api/projects/${projectId}/share-state`, route => route.request().method() === 'GET'
    ? route.fulfill({ json: { projectId, hasEverShared: true, bindingExists: true,
      publications: [{ sourceFilePath: 'index.html', slug: 'ui-audit-old-link', status: 'active' }] } })
    : route.fallback());
  await createHtmlProject(page, projectId);
  const historyRead = page.waitForResponse(response => response.url().includes(`/api/projects/${projectId}/share-state`)
    && response.request().method() === 'GET' && response.ok());
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await historyRead;
  const confirm = await openDeleteConfirmation(page, projectId);
  await capture(page, 'S14', { projectId, historicalSlug: 'ui-audit-old-link' });
  await page.getByTestId('project-delete-confirm-cancel').click();
  await expect(confirm).toHaveCount(0);
});

test('capture S14-ERR residual unshare failure after real delete confirmation', async ({ page }) => {
  const projectId = `ui-audit-s14-error-${Date.now()}`;
  await page.route(`**/api/projects/${projectId}/share-state`, route => route.request().method() === 'GET'
    ? route.fulfill({ json: { projectId, hasEverShared: true, bindingExists: true,
      publications: [{ sourceFilePath: 'index.html', slug: 'ui-audit-old-link', status: 'active' }] } })
    : route.fallback());
  await createHtmlProject(page, projectId);
  const historyRead = page.waitForResponse(response => response.url().includes(`/api/projects/${projectId}/share-state`)
    && response.request().method() === 'GET' && response.ok());
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await historyRead;
  await page.route(`**/api/projects/${projectId}`, route => route.request().method() === 'DELETE'
    ? route.fulfill({ json: { shareResiduals: [{ filePath: 'index.html', slug: 'ui-audit-old-link', retrying: false }] } })
    : route.fallback());
  const confirm = await openDeleteConfirmation(page, projectId);
  const deletion = page.waitForResponse(response => response.url().includes(`/api/projects/${projectId}`)
    && response.request().method() === 'DELETE');
  await page.getByTestId('project-delete-confirm-accept').click();
  expect((await deletion).ok()).toBeTruthy();
  await expect(page.getByRole('alert').filter({ hasText: /index\.html.*链接停用失败/ })).toBeVisible();
  await capture(page, 'S14-ERR', { projectId, residualSlug: 'ui-audit-old-link' });
  await page.route('**/api/public-file-stops/retry', route => route.fulfill({ json: { status: 'stopped', projectId, filePath: 'index.html', slug: 'ui-audit-old-link' } }));
  const retryRequest = page.waitForRequest(request => request.url().endsWith('/api/public-file-stops/retry') && request.method() === 'POST');
  await page.getByRole('button', { name: '重试停用' }).click();
  expect((await retryRequest).postDataJSON()).toEqual({ projectId, filePath: 'index.html', slug: 'ui-audit-old-link' });
  await expect(page.getByRole('alert').filter({ hasText: /index\.html.*链接停用失败/ })).toHaveCount(0);
  await expect(confirm).toHaveCount(0);
});
