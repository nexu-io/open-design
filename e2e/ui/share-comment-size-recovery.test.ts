import { randomUUID } from 'node:crypto';
import { expect, test } from '@/playwright/suite';
import { T } from '@/timeouts';
import { AMR_PERSONAL_WORKSPACE_CONTEXT, mockAmrPersonalWorkspace } from '@/playwright/amr';

// Real product UI and API-created file; Cloud identity/publication/sync reads are
// controlled. Queue persistence and retry recovery live in daemon HTTP/SQLite tests.
test('[P0] OPEND-3661 explains paused oversized comments in the sharing panel', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('open-design:locale', 'en');
    localStorage.setItem('open-design:locale-source', 'manual');
  });
  await mockAmrPersonalWorkspace(page);
  const id = `comment-size-${randomUUID()}`;
  await page.route('**/api/projects/*/workspace-scope', route => route.fulfill({ json: { scope: {
    kind: 'personal', projectId: id, workspaceId: AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId,
    visibility: 'personal', context: AMR_PERSONAL_WORKSPACE_CONTEXT,
  } } }));
  const created = await page.request.post('/api/projects', { data: {
    id, name: 'Comment sync recovery', skillId: null, designSystemId: null,
    metadata: { kind: 'prototype', nameSource: 'user' },
  } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const file = await page.request.post(`/api/projects/${id}/files`, { data: {
    name: 'index.html', content: '<!doctype html><html><body><h1>Comment sync recovery</h1></body></html>',
    artifactManifest: { version: 1, kind: 'html', title: 'Comment sync recovery', entry: 'index.html', renderer: 'html', exports: ['html'] },
  } });
  expect(file.ok(), await file.text()).toBeTruthy();
  await page.route('**/publish-public', route => route.fulfill({ json: {
    status: 'active', freshness: 'current', publication: {
      fileName: 'index.html', slug: 'synthetic', url: `https://viewer.example.test/artifact/${id}/synthetic`,
    },
  } }));
  await page.route('**/share-plan', route => route.fulfill({ json: {
    fileCount: 1, totalBytes: 123, exceedsSizeLimit: false, exclusions: [],
  } }));
  await page.route('**/share-state', route => route.fulfill({ json: {
    projectId: id, bindingExists: true, hasEverShared: true,
    publications: [{ sourceFilePath: 'index.html', slug: 'synthetic', status: 'active' }],
  } }));
  await page.route('**/comment-sync-state?*', route => route.fulfill({ json: {
    pending: 1, lastError: 'COMMENT_SYNC_DELIVERY_FAILED', payloadTooLarge: true,
    sessionMissing: false, shareStopped: false,
  } }));
  await page.goto(`/projects/${id}/files/index.html`);
  const share = page.locator('.ws-tabs-file-actions').getByRole('button', { name: 'Share', exact: true });
  await expect(share).toBeEnabled({ timeout: T.long });
  await share.click();
  await expect(page.locator('.share-menu-popover').getByRole('alert')).toContainText('Shorten or delete them to resume syncing.');
  await expect(page.getByRole('button', { name: 'Copy share link' })).toBeEnabled();
  await testInfo.attach('comment-size-recovery-share-entry', {
    body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png',
  });
});
