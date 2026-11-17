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
  await page.getByTestId('board-mode-toggle').click();
  const preview = page.getByTestId('artifact-preview-frame');
  await expect(preview).toHaveAttribute('data-od-render-mode', 'srcdoc');
  await page.frameLocator('[data-testid="artifact-preview-frame"]').locator('h1').click();
  const input = page.getByTestId('comment-popover-input');
  await input.fill('Keep this heading portable');
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
