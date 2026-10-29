import { randomUUID } from 'node:crypto';
import { expect, test } from '@/playwright/suite';
import { T } from '@/timeouts';
import { AMR_PERSONAL_WORKSPACE_CONTEXT, mockAmrPersonalWorkspace } from '@/playwright/amr';

// Actual client selection/save and daemon persistence. Cloud workspace discovery
// is controlled; the separate cross-client runtime probe owns Vela locating.
test('[P1] OPEND-3887 saved srcdoc anchors resolve in the original file bytes', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('open-design:locale', 'en');
    localStorage.setItem('open-design:locale-source', 'manual');
  });
  await mockAmrPersonalWorkspace(page);
  const id = `portable-comment-${randomUUID()}`;
  await page.route('**/api/projects/*/workspace-scope', route => route.fulfill({ json: { scope: {
    kind: 'personal', projectId: id, workspaceId: AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId,
    visibility: 'personal', context: AMR_PERSONAL_WORKSPACE_CONTEXT,
  } } }));
  const created = await page.request.post('/api/projects', { data: {
    id, name: 'Portable comment anchor', skillId: null, designSystemId: null,
    metadata: { kind: 'prototype', nameSource: 'user' },
  } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { conversationId } = await created.json();
  const content = '<!doctype html><html><body><img src="/marker.svg" style="display:none"><header style="padding:80px"><h1>Published heading without an authored ID</h1><p>The saved comment must locate this heading in the original file.</p></header></body></html>';
  for (const [name, source] of [['marker.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'], ['index.html', content]]) {
    const response = await page.request.post(`/api/projects/${id}/files`, { data: { name, content: source,
      ...(name === 'index.html' ? { artifactManifest: { version: 1, kind: 'html', title: 'Portable comment anchor', entry: 'index.html', renderer: 'html', exports: ['html'] } } : {}),
    } });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  await page.goto(`/projects/${id}/files/index.html?forceInline=1`);
  await expect(page.getByTestId('board-mode-toggle')).toBeEnabled({ timeout: T.long });
  // Keyboard events originating inside the preview must reach the existing entry.
  await page.frameLocator('[data-testid="artifact-preview-frame"]').locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('c');
  await expect(page.getByTestId('board-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
  const preview = page.getByTestId('artifact-preview-frame');
  await expect(preview).toHaveAttribute('data-od-render-mode', 'srcdoc');
  await page.frameLocator('[data-testid="artifact-preview-frame"]').locator('h1').click({ position: { x: 30.5, y: 12.25 } });
  const input = page.getByTestId('comment-popover-input');
  await input.fill('Keep this heading portable');
  const saveUrl = `**/api/projects/${id}/conversations/${conversationId}/comments`;
  await page.route(saveUrl, route => route.request().method() === 'POST'
    ? route.fulfill({ status: 503, json: { error: 'controlled save outage' } })
    : route.fallback());
  const failedSave = page.waitForResponse(response => response.request().method() === 'POST'
    && response.url().endsWith(`/conversations/${conversationId}/comments`));
  await input.press('Enter');
  expect((await failedSave).status()).toBe(503);
  await expect(input).toHaveValue('Keep this heading portable');
  await page.unroute(saveUrl);
  await expect(page.getByTestId('comment-popover-save')).toBeEnabled();
  const savedResponse = page.waitForResponse(response => response.request().method() === 'POST'
    && response.url().endsWith(`/conversations/${conversationId}/comments`));
  await input.press('Enter');
  const response = await savedResponse;
  expect(response.ok(), await response.text()).toBeTruthy();
  const comment = (await response.json()).comment;
  expect(comment.elementId).toMatch(/^dom:/);
  expect(comment.selector).toMatch(/^body > /);
  const persisted = await page.request.get(`/api/projects/${id}/conversations/${conversationId}/comments`);
  expect((await persisted.json()).comments).toContainEqual(expect.objectContaining({ id: comment.id, selector: comment.selector }));
  expect(comment.position.anchor.u).toBeGreaterThan(0);
  expect(comment.position.anchor.u).toBeLessThan(1);
  await expect(input).toHaveCount(0);
  await expect(page.getByTestId('board-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await page.getByTestId('comment-panel-toggle').click();
  const row = page.getByTestId('comment-side-item').filter({ hasText: 'Keep this heading portable' });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByTestId('comment-popover-detail')).toHaveText('Keep this heading portable');
  await expect(page.getByTestId('comment-popover-input')).toHaveCount(0);
  await expect(page.getByTestId('comment-popover-save')).toHaveCount(0);
  const pin = page.locator('.comment-saved-pin').first();
  await expect(pin).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('3887-client-saved.png') });
  const original = await page.request.get(`/api/projects/${id}/raw/index.html`);
  const bytes = await original.text();
  expect(bytes).not.toContain('data-od-runtime-id');
  expect(bytes).not.toContain('data-od-id');
  const published = await page.context().newPage();
  await published.setContent(bytes);
  await expect(published.locator(comment.selector)).toHaveText('Published heading without an authored ID');
  await published.screenshot({ path: testInfo.outputPath('3887-original-published-bytes.png') });
  await published.close();
});
