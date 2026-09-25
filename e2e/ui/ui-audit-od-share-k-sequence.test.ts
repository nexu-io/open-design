import { expect, test } from '@/playwright/suite';
import { mockAmrPersonalWorkspace, AMR_PERSONAL_WORKSPACE_CONTEXT } from '../lib/playwright/amr.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';

const output = resolve(import.meta.dirname, '../../.tmp/ui-audit/final-design-review/current');
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', locale: 'zh-CN' });

type CaptureId = 'K1' | 'K3' | 'K4' | 'K5';
const html = '<!doctype html><html lang="zh-CN"><body><main><h1 data-od-id="k-audit-title">评论同步审计</h1><p data-od-id="k-audit-body">已有项目内容</p></main></body></html>';

async function setupProject(page: Page, suffix: string) {
  await mockAmrPersonalWorkspace(page);
  await page.addInitScript(() => {
    localStorage.setItem('open-design:locale', 'zh-CN');
    localStorage.setItem('open-design:locale-source', 'manual');
  });
  await page.route('**/api/projects/*/workspace-scope', async route => {
    const projectId = new URL(route.request().url()).pathname.match(/\/api\/projects\/([^/]+)/)?.[1];
    await route.fulfill({ json: { scope: { kind: 'personal', projectId, workspaceId: AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId, visibility: 'personal', context: AMR_PERSONAL_WORKSPACE_CONTEXT } } });
  });
  const projectId = `ui-audit-owner-k-sequence-${suffix}-${Date.now()}`;
  const project = await page.request.post('/api/projects', { data: { id: projectId, name: `Owner ${suffix} comment-sync capture`, skillId: null, designSystemId: null, metadata: { kind: 'prototype', nameSource: 'user' } } });
  expect(project.ok(), await project.text()).toBeTruthy();
  const { conversationId } = await project.json() as { conversationId: string };
  const file = await page.request.post(`/api/projects/${projectId}/files`, { data: { name: 'index.html', content: html, artifactManifest: { version: 1, kind: 'html', title: 'index.html', entry: 'index.html', renderer: 'html', exports: ['html'] } } });
  expect(file.ok(), await file.text()).toBeTruthy();
  const comment = await page.request.post(`/api/projects/${projectId}/conversations/${conversationId}/comments`, { data: {
    note: '停用分享前已存在的项目评论',
    target: { filePath: 'index.html', elementId: 'k-audit-title', selector: 'main h1', label: '标题', text: '评论同步审计', position: { x: 0.25, y: 0.25, width: 0.5, height: 0.1 }, htmlHint: '<h1 data-od-id="k-audit-title">评论同步审计</h1>' },
  } });
  expect(comment.ok(), await comment.text()).toBeTruthy();
  const commentId = (await comment.json() as { comment: { id: string } }).comment.id;
  const storedComments = await page.request.get(`/api/projects/${projectId}/conversations/${conversationId}/comments`);
  expect(storedComments.ok(), await storedComments.text()).toBeTruthy();
  expect((await storedComments.json() as { comments: unknown[] }).comments).toHaveLength(1);
  await page.route(`**/api/projects/${projectId}/files/index.html/share-plan`, route => route.request().method() === 'POST'
    ? route.fulfill({ json: { fileCount: 1, totalBytes: html.length, exceedsSizeLimit: false, exclusions: [] } })
    : route.fallback());
  return { projectId, conversationId, commentId };
}

async function capture(page: Page, id: CaptureId, projectId: string, detail: Record<string, unknown>) {
  await mkdir(output, { recursive: true });
  const capturedAt = new Date().toISOString();
  const timestamp = capturedAt.replaceAll(':', '-');
  const name = `Owner-${id}-${timestamp}`;
  const screenshot = resolve(output, name + '.png');
  const menu = page.locator('.share-menu-popover[role="menu"]');
  await page.screenshot({ path: screenshot, animations: 'disabled' });
  await writeFile(resolve(output, name + '.json'), JSON.stringify({
    id: name,
    designId: id,
    capturedAt,
    source: 'current-playwright-mocked',
    mockBoundary: 'Real isolated daemon project and persisted comment; real Share menu/toggle/publish UI; mocked publication service response and comment-sync-state projection only. No Vela delivery or production-account state.',
    projectId,
    screenshot,
    viewport: page.viewportSize(),
    menuText: await menu.innerText(),
    bodyText: await page.locator('body').innerText(),
    ...detail,
  }, null, 2) + '\n');
}

async function openShareMenu(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/files/index.html`);
  const share = page.getByTestId('file-workspace').getByRole('button', { name: '分享', exact: true });
  await expect(share).toBeVisible();
  await share.click();
  const menu = page.locator('.share-menu-popover[role="menu"]');
  await expect(menu).toBeVisible();
  return menu;
}

async function setPublicationProjection(page: Page, projectId: string, state: 'none' | 'active' | 'stopped', slug: string) {
  let publicationState = state;
  const url = `https://viewer.example.test/cloud/artifact/project/${slug}`;
  await page.route(`**/api/projects/${projectId}/share-state`, route => route.request().method() === 'GET'
    ? route.fulfill({ json: { projectId, bindingExists: publicationState !== 'none', hasEverShared: publicationState !== 'none', publications: publicationState === 'none' ? [] : [{ sourceFilePath: 'index.html', slug, status: publicationState }] } })
    : route.fallback());
  await page.route(`**/api/projects/${projectId}/files/index.html/public-share-state`, route => route.request().method() === 'GET'
    ? route.fulfill({ json: publicationState === 'none' ? { status: 'none' } : { status: publicationState, slug } })
    : route.fallback());
  await page.route(`**/api/projects/${projectId}/files/index.html/publish-public`, route => route.request().method() === 'GET'
    ? route.fulfill({ json: publicationState === 'active' ? { status: 'active', freshness: 'fresh', publication: { slug, url, fileName: 'index.html' } } : { status: publicationState } })
    : route.fallback());
  return { url, slug, setState: (next: 'none' | 'active' | 'stopped') => { publicationState = next; } };
}

test('Owner-K1 first publication syncs existing comments', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } }); });

  // K1: an actual local comment exists before publish; hold the external
  // publication response to capture the real upload/sync progress UI.
  const k1 = await setupProject(page, 'k1');
  const k1Pub = await setPublicationProjection(page, k1.projectId, 'none', 'k1-existing-comment');
  await page.route(`**/api/projects/${k1.projectId}/comment-sync-state*`, route => route.request().method() === 'GET'
    ? route.fulfill({ json: { pending: 1, sessionMissing: false, lastError: null, shareStopped: false, backfill: { state: 'pending', filePath: 'index.html', publicationRevision: 'k1-revision', retryable: true, reopened: false } } })
    : route.fallback());
  let finishK1!: () => void;
  let startedK1!: () => void;
  const k1Gate = new Promise<void>(resolve => { finishK1 = resolve; });
  const k1Started = new Promise<void>(resolve => { startedK1 = resolve; });
  await page.route(`**/api/projects/${k1.projectId}/files/index.html/publish-public`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    startedK1();
    await k1Gate;
    k1Pub.setState('active');
    await route.fulfill({ json: { url: k1Pub.url, slug: k1Pub.slug, fileName: 'index.html' } });
  });
  const k1Menu = await openShareMenu(page, k1.projectId);
  await k1Menu.getByRole('menuitem').filter({ hasText: /生成并复制链接|Generate and copy/ }).click();
  try {
    await k1Started;
    await expect(k1Menu.getByRole('progressbar')).toBeVisible();
  } finally {
    finishK1();
  }
  await expect(k1Menu.locator('.chrome-publish-url')).toHaveText(k1Pub.url);
  const k1Banner = k1Menu.getByRole('status').filter({ hasText: /已有评论|同步/ }).first();
  await expect(k1Banner).toBeVisible();
  await expect(k1Banner).toContainText('正在同步已有评论');
  await expect(k1Banner.locator('.icon-spin, [aria-hidden="true"]')).toHaveCount(1);
  await capture(page, 'K1', k1.projectId, { state: 'publication-complete-existing-comments-syncing', existingLocalCommentCount: 1, commentText: '停用分享前已存在的项目评论', publicationUrl: k1Pub.url, commentSyncProjection: { pending: 1, backfill: { state: 'pending', reopened: false, retryable: true } }, renderedSyncStatus: await k1Banner.innerText(), visualGap: 'The first-publication branch now has a dark spinner/status treatment and syncs the persisted historical comment, matching the target progress affordance. The design shows “12条”; this isolated project has one persisted comment, and the production label has no count.' });

});

test('Owner-K3 stopped link retains comments and pauses sync', async ({ page }) => {
  test.setTimeout(90_000);

  // K3: the stopped service projection drives the real Share menu's disabled-link
  // state; a persisted daemon comment proves stopping does not erase project data.
  const k3 = await setupProject(page, 'k3');
  const k3Pub = await setPublicationProjection(page, k3.projectId, 'stopped', 'k3-retained-comments');
  await page.route(`**/api/projects/${k3.projectId}/comment-sync-state*`, route => route.request().method() === 'GET'
    ? route.fulfill({ json: { pending: 0, sessionMissing: false, lastError: null, shareStopped: true } })
    : route.fallback());
  const k3Menu = await openShareMenu(page, k3.projectId);
  await expect(k3Menu.getByRole('switch', { name: '链接访问' })).toHaveAttribute('aria-checked', 'false');
  await expect(k3Menu.getByText('链接已停用，评论暂停同步到分享页。')).toBeVisible();
  await expect(k3Menu.getByRole('switch', { name: '链接访问' })).toBeEnabled();
  await expect(k3Menu.getByRole('menuitem').filter({ hasText: /生成并复制链接|Generate and copy/ })).toHaveCount(0);
  const k3Comments = await page.request.get(`/api/projects/${k3.projectId}/conversations/${k3.conversationId}/comments`);
  expect(k3Comments.ok(), await k3Comments.text()).toBeTruthy();
  expect((await k3Comments.json() as { comments: unknown[] }).comments).toHaveLength(1);
  await capture(page, 'K3', k3.projectId, { state: 'stopped-publication-state-projection', publicationUrlHidden: await k3Menu.locator('.chrome-publish-url').count() === 0, persistedCommentCountAfterStop: 1, commentSyncProjection: { shareStopped: true, pending: 0 }, projectedExistingUrl: k3Pub.url, visualGap: 'Stopped-state action now matches the target: no duplicate generate-and-copy action is shown, while the link-access switch remains enabled for resume.' });

});

test('Owner-K4/K5 distinct comment-sync capture sequences', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } }); });

  // K4: start from a stopped publication and resume via the switch. The local
  // publication API returns the existing URL; external service projection says
  // reconciliation is underway for comments changed while stopped.
  const k4 = await setupProject(page, 'k4');
  const k4Resolved = await page.request.patch(`/api/projects/${k4.projectId}/conversations/${k4.conversationId}/comments/${k4.commentId}`, { data: { status: 'resolved' } });
  expect(k4Resolved.ok(), await k4Resolved.text()).toBeTruthy();
  expect((await k4Resolved.json() as { comment: { status: string } }).comment.status).toBe('resolved');
  const k4Pub = await setPublicationProjection(page, k4.projectId, 'stopped', 'k4-existing-link');
  await page.route(`**/api/projects/${k4.projectId}/files/index.html/publish-public`, route => {
    if (route.request().method() !== 'POST') return route.fallback();
    k4Pub.setState('active');
    return route.fulfill({ json: { url: k4Pub.url, slug: k4Pub.slug, fileName: 'index.html' } });
  });
  await page.route(`**/api/projects/${k4.projectId}/comment-sync-state*`, route => route.request().method() === 'GET'
    ? route.fulfill({ json: { pending: 1, sessionMissing: false, lastError: null, shareStopped: false, backfill: { state: 'pending', filePath: 'index.html', publicationRevision: 'k4-revision', retryable: true, reopened: true } } })
    : route.fallback());
  const k4Menu = await openShareMenu(page, k4.projectId);
  await expect(k4Menu.getByRole('switch', { name: '链接访问' })).toHaveAttribute('aria-checked', 'false');
  await k4Menu.getByRole('switch', { name: '链接访问' }).click();
  await expect(k4Menu.getByRole('switch', { name: '链接访问' })).toHaveAttribute('aria-checked', 'true');
  await expect(k4Menu.locator('.chrome-publish-url')).toHaveText(k4Pub.url);
  await page.reload();
  await openShareMenu(page, k4.projectId);
  await expect(k4Menu.getByRole('switch', { name: '链接访问' })).toHaveAttribute('aria-checked', 'true');
  await expect(k4Menu.locator('.chrome-publish-url')).toHaveText(k4Pub.url);
  const k4Banner = k4Menu.getByRole('status').filter({ hasText: '正在同步重新开启的分享链接' });
  await expect(k4Banner).toBeVisible();
  await capture(page, 'K4', k4.projectId, { state: 'resumed-existing-publication-with-reconciliation-pending', publicationUrl: k4Pub.url, persistedCommentCount: 1, stoppedPeriodCommentChange: { commentId: k4.commentId, status: 'resolved' }, commentSyncProjection: { shareStopped: false, pending: 1, backfill: { state: 'pending', reopened: true, retryable: true } }, renderedSyncStatus: await k4Banner.innerText(), visualGap: 'Current reopened state uses the normal URL/copy controls plus a reconciliation banner. Target K4 shows “正在同步评论…” in the primary action control and no exposed completed link/copy row.' });

  // K5: actual stopped → resume UI action; service reports failed, retryable
  // reconciliation. The existing link stays visible and copy remains enabled.
  const k5 = await setupProject(page, 'k5');
  const k5Resolved = await page.request.patch(`/api/projects/${k5.projectId}/conversations/${k5.conversationId}/comments/${k5.commentId}`, { data: { status: 'resolved' } });
  expect(k5Resolved.ok(), await k5Resolved.text()).toBeTruthy();
  expect((await k5Resolved.json() as { comment: { status: string } }).comment.status).toBe('resolved');
  const k5Pub = await setPublicationProjection(page, k5.projectId, 'stopped', 'k5-existing-link');
  await page.route(`**/api/projects/${k5.projectId}/files/index.html/publish-public`, route => {
    if (route.request().method() !== 'POST') return route.fallback();
    k5Pub.setState('active');
    return route.fulfill({ json: { url: k5Pub.url, slug: k5Pub.slug, fileName: 'index.html' } });
  });
  await page.route(`**/api/projects/${k5.projectId}/comment-sync-state*`, route => route.request().method() === 'GET'
    ? route.fulfill({ json: { pending: 0, sessionMissing: false, lastError: 'backfill_failed', shareStopped: false, backfill: { state: 'failed', filePath: 'index.html', publicationRevision: 'k5-revision', retryable: true, reopened: true } } })
    : route.fallback());
  const k5Menu = await openShareMenu(page, k5.projectId);
  await k5Menu.getByRole('switch', { name: '链接访问' }).click();
  await expect(k5Menu.getByRole('switch', { name: '链接访问' })).toHaveAttribute('aria-checked', 'true');
  await expect(k5Menu.locator('.chrome-publish-url')).toHaveText(k5Pub.url);
  await page.reload();
  await openShareMenu(page, k5.projectId);
  await expect(k5Menu.getByRole('switch', { name: '链接访问' })).toHaveAttribute('aria-checked', 'true');
  await expect(k5Menu.locator('.chrome-publish-url')).toHaveText(k5Pub.url);
  const k5Banner = k5Menu.getByRole('status').filter({ hasText: '评论同步尚未完成' });
  await expect(k5Banner).toContainText('评论同步尚未完成');
  await expect(k5Banner.getByRole('button', { name: '重试' })).toBeVisible();
  await expect(k5Menu.getByRole('button', { name: '复制链接' })).toBeEnabled();
  await capture(page, 'K5', k5.projectId, { state: 'reopened-link-with-retryable-comment-backfill-failure', publicationUrl: k5Pub.url, linkUsable: true, persistedCommentCount: 1, stoppedPeriodCommentChange: { commentId: k5.commentId, status: 'resolved' }, commentSyncProjection: { shareStopped: false, backfill: { state: 'failed', reopened: true, retryable: true } }, renderedSyncStatus: await k5Banner.innerText(), visualGap: 'State semantics align (usable reopened URL, retryable unfinished reconciliation); copy differs from target: current UI adds “分享已发布” and “正在后台自动重试” text around its retry control.' });
});
