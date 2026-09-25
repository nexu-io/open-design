import { expect, test } from '@/playwright/suite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { mockAmrPersonalWorkspace, AMR_PERSONAL_WORKSPACE_CONTEXT } from '../lib/playwright/amr.js';

const output = resolve(import.meta.dirname, '../../.tmp/ui-audit/final-design-review/current');
const captureTime = new Date().toISOString().replace(/[:.]/g, '-');
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', locale: 'zh-CN' });

async function capture(page: Page, id: 'G3' | 'S13', detail: Record<string, unknown>) {
  const name = 'Owner-' + id + '-' + captureTime;
  await mkdir(output, { recursive: true });
  const screenshot = resolve(output, name + '.png');
  const capturedAt = new Date().toISOString();
  await page.screenshot({ path: screenshot, animations: 'disabled' });
  await writeFile(resolve(output, name + '.json'), JSON.stringify({ id: name, capturedAt, source: 'current-playwright-mocked', mockBoundary: 'Local daemon project/files and controlled publication, workspace-scope, and login-status projections. No production-account or real Vela delivery.', screenshot, viewport: page.viewportSize(), text: await page.locator('body').innerText(), ...detail }, null, 2) + String.fromCharCode(10));
}

async function personalProject(page: Page, projectId: string, name: string) {
  await mockAmrPersonalWorkspace(page);
  await page.addInitScript(() => { localStorage.setItem('open-design:locale', 'zh-CN'); localStorage.setItem('open-design:locale-source', 'manual'); });
  await page.route('**/api/projects/*/workspace-scope', async route => {
    const id = new URL(route.request().url()).pathname.match(/\/api\/projects\/([^/]+)/)?.[1];
    await route.fulfill({ json: { scope: { kind: 'personal', projectId: id, workspaceId: AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId, visibility: 'personal', context: AMR_PERSONAL_WORKSPACE_CONTEXT } } });
  });
  const response = await page.request.post('/api/projects', { data: { id: projectId, name, skillId: null, designSystemId: null, metadata: { kind: 'prototype', nameSource: 'user' } } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json() as { conversationId: string }).conversationId;
}

test('Owner-G3 multi-file React module disables Share with its reason in the real viewer', async ({ page }) => {
  const projectId = 'ui-audit-owner-g3-' + Date.now();
  const conversationId = await personalProject(page, projectId, 'Owner G3 multi-file React fixture');
  const files = [
    { name: 'src/App.jsx', content: "import Badge from './Badge.jsx';\nexport default function App(){ return <main><h1>React module fixture</h1><Badge /></main>; }", artifactManifest: { version: 1, kind: 'react-component', title: 'App.jsx', entry: 'src/App.jsx', renderer: 'react-component', exports: ['jsx', 'html', 'zip'] } },
    { name: 'src/Badge.jsx', content: 'export default function Badge(){ return <p>Support module</p>; }', artifactManifest: { version: 1, kind: 'react-component', title: 'Badge.jsx', entry: 'src/Badge.jsx', renderer: 'react-component', exports: ['jsx', 'html', 'zip'] } },
    { name: 'index.html', content: '<!doctype html><html><body><div id=\"root\"></div><script type=\"text/babel\" data-type=\"module\" src=\"./src/App.jsx\"></script></body></html>', artifactManifest: { version: 1, kind: 'html', title: 'index.html', entry: 'index.html', renderer: 'html', exports: ['html'] } },
  ];
  for (const fileData of files) {
    const response = await page.request.post('/api/projects/' + projectId + '/files', { data: fileData });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  await page.goto('/projects/' + projectId + '/files/src/App.jsx');
  const viewer = page.locator('.react-component-viewer');
  await expect(viewer).toBeVisible();
  const share = viewer.getByRole('button', { name: '分享', exact: true });
  const exportButton = viewer.getByRole('button', { name: '导出', exact: true });
  await expect(exportButton).toBeEnabled();
  await expect(share).toBeDisabled();
  const disabledReason = await share.getAttribute('title');
  expect(disabledReason).toBeTruthy();
  await capture(page, 'G3', { projectId, conversationId, fileNames: files.map(file => file.name), viewer: 'react-component-viewer', exportEnabled: await exportButton.isEnabled(), disabledShareReason: disabledReason });
});

test('Owner-S13 keeps the old published link readable and copyable without a signed-in workspace', async ({ page }) => {
  const projectId = 'ui-audit-owner-s13-' + Date.now();
  const conversationId = await personalProject(page, projectId, 'Owner S13 published link fixture');
  let signedOut = false;
  let scopeReadsAfterSignOut = 0;
  let loginStatusReadsAfterSignOut = 0;
  await page.route('**/api/workspace/directory', route => signedOut && route.request().method() === 'GET' ? route.fulfill({ json: { items: [], activeWorkspaceId: null } }) : route.fallback());
  await page.route('**/api/workspace/context', route => signedOut && route.request().method() === 'GET' ? route.fulfill({ json: { context: null } }) : route.fallback());
  await page.route('**/api/projects/' + projectId + '/workspace-scope*', route => {
    if (signedOut) { scopeReadsAfterSignOut += 1; return route.fulfill({ status: 503, json: { error: { code: 'WORKSPACE_UNAVAILABLE' } } }); }
    return route.fulfill({ json: { scope: { kind: 'personal', projectId, workspaceId: AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId, visibility: 'personal', context: AMR_PERSONAL_WORKSPACE_CONTEXT } } });
  });
  await page.route('**/api/integrations/vela/status*', route => {
    if (signedOut) loginStatusReadsAfterSignOut += 1;
    return route.fulfill({ json: { loggedIn: !signedOut, profile: signedOut ? null : 'default', configPath: '', user: signedOut ? null : { id: AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceMemberId, email: 'fixture@example.invalid' } } });
  });
  const html = '<!doctype html><html lang=\"zh-CN\"><body><main><h1>Previously published review</h1></main></body></html>';
  const file = await page.request.post('/api/projects/' + projectId + '/files', { data: { name: 'index.html', content: html, artifactManifest: { version: 1, kind: 'html', title: 'index.html', entry: 'index.html', renderer: 'html', exports: ['html'] } } });
  expect(file.ok(), await file.text()).toBeTruthy();
  // A published project is Workspace-bound: the daemon fixture owns its file,
  // while these catalog projections model the already-established binding.
  const projectResponse = await page.request.get('/api/projects/' + projectId);
  expect(projectResponse.ok(), await projectResponse.text()).toBeTruthy();
  const localProject = (await projectResponse.json() as { project: Record<string, unknown> }).project;
  const workspaceId = AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId;
  const memberId = AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceMemberId;
  const boundProject = { ...localProject, workspaceId, workspaceVisibility: 'private' };
  await page.route('**/api/projects', route => route.request().method() === 'GET'
    ? route.fulfill({ json: { projects: [] } }) : route.fallback());
  await page.route('**/api/workspaces/' + workspaceId + '/projects?*', route => route.request().method() === 'GET'
    ? route.fulfill({ json: { projects: [{ project: boundProject, workspaceId,
      visibility: 'private', resourceState: 'active', createdByWorkspaceMemberId: memberId,
      updatedByWorkspaceMemberId: memberId, currentUserAccess: {
        canOpen: true, canRename: true, canDelete: true, canDuplicate: true,
        canMoveToTeam: false, canMoveToPersonal: true, canExport: true,
        canSendTo: true, canRestoreVersion: true,
      } }] } }) : route.fallback());
  await page.route('**/api/projects/' + projectId, route => route.request().method() === 'GET'
    ? route.fulfill({ json: { project: boundProject } }) : route.fallback());
  const slug = 's13-prior-' + projectId;
  const publicUrl = 'https://viewer.example.test/cloud/artifact/project/' + slug;
  await page.route('**/api/projects/' + projectId + '/share-state', route => route.request().method() === 'GET' ? route.fulfill({ json: { projectId, bindingExists: true, hasEverShared: true, publications: [{ sourceFilePath: 'index.html', slug, status: 'active' }] } }) : route.fallback());
  await page.route('**/api/projects/' + projectId + '/files/index.html/publish-public', route => route.request().method() === 'GET' ? route.fulfill({ json: { status: 'active', freshness: 'outdated', publication: { slug, url: publicUrl, fileName: 'index.html' } } }) : route.fallback());
  await page.goto('/projects/' + projectId + '/files/index.html');
  const fileWorkspace = page.getByTestId('file-workspace');
  await expect(fileWorkspace).toBeVisible();
  const share = fileWorkspace.getByRole('button', { name: '分享', exact: true });
  await expect(share).toBeEnabled();
  await share.click();
  const menu = page.locator('.share-menu-popover[role=\"menu\"]');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.chrome-publish-url')).toHaveText(publicUrl);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text: string) => { document.body.dataset.copiedUrl = text; return Promise.resolve(); } } }));
  const copy = menu.getByRole('button', { name: /复制链接|复制分享链接/ });
  await expect(copy).toBeVisible();
  await copy.click();
  await expect.poll(() => page.locator('body').getAttribute('data-copied-url')).toBe(publicUrl);
  signedOut = true;
  await page.evaluate(() => {
    window.dispatchEvent(new Event('od:amr-login-status-change'));
    window.dispatchEvent(new Event('od:workspace-context-refresh'));
  });
  await expect.poll(() => loginStatusReadsAfterSignOut).toBeGreaterThan(0);
  await expect(fileWorkspace).toHaveCount(0);
  const oldLink = page.locator('code').filter({ hasText: publicUrl });
  await expect(oldLink).toHaveText(publicUrl);
  await expect(page.getByRole('switch', { name: /链接访问/ })).toBeDisabled();
  const loginToUpdate = page.getByRole('button', { name: /登录后更新/ });
  await expect(loginToUpdate).toBeEnabled();
  await page.evaluate(() => { delete document.body.dataset.copiedUrl; });
  await page.getByRole('button', { name: /复制链接|复制分享链接/ }).click();
  await expect.poll(() => page.locator('body').getAttribute('data-copied-url')).toBe(publicUrl);
  await capture(page, 'S13', { projectId, conversationId, publication: { slug, status: 'active', url: publicUrl },
    signedOutProject: 'unlisted after auth refresh', workspaceScopeReadsAfterSignOut: scopeReadsAfterSignOut,
    interaction: 'Old authenticated link copied before and after real sign-out; file source unmounted; login-to-update visible, auth recovery not exercised',
    fallbackText: await page.locator('body').innerText() });
});
