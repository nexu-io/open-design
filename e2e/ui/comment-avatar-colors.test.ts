import { expect, test } from '@/playwright/suite';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { T } from '@/timeouts';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test.use({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, colorScheme: 'light', locale: 'zh-CN' });

test('[P1] comment avatars use authorKey colors in the restored panel', async ({ page }, testInfo) => {
  test.setTimeout(T.xlong * 2);
  await applyStandardMocks(page);
  await page.addInitScript(() => {
    localStorage.setItem('open-design:locale', 'zh-CN');
    localStorage.setItem('open-design:locale-source', 'manual');
  });
  const projectId = `avatar-colors-${testInfo.workerIndex}-${Date.now()}`;
  const created = await page.request.post('/api/projects', {
    data: { id: projectId, name: '评论头像色彩验收', skillId: null, designSystemId: null, metadata: { kind: 'prototype', nameSource: 'user' } },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { conversationId } = await created.json() as { conversationId: string };
  const content = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body style="font-family:system-ui;padding:28px;color:#202020"><main><h1 style="font-size:24px">评论头像色彩验收</h1><p>本地合成作者数据 · 非线上用户评论</p><p>画布标记与右侧同一作者的首字母和颜色一致。</p>'
    + ['蓝色评论标记', '橙色评论标记', '紫色评论标记', '绿色评论标记', '同一作者的团队评论标记'].map((label, index) => `<h2 data-od-id="color-${index}" style="font-size:18px;margin:28px 0">${label}</h2>`).join('')
    + '</main></body></html>';
  const file = await page.request.post(`/api/projects/${projectId}/files`, {
    data: { name: 'index.html', content, artifactManifest: { version: 1, kind: 'html', title: 'index.html', entry: 'index.html', renderer: 'html', exports: ['html'] } },
  });
  expect(file.ok(), await file.text()).toBeTruthy();

  // Controlled API author snapshots, not DOM/style injection or production data.
  // The 64-character keys cover the first four entries of the shared palette.
  const authors = [
    { name: '林 · 演示作者', suffix: '0019', bg: 'rgb(125, 183, 255)', fg: 'rgb(20, 69, 130)', note: '蓝色头像：请让标题更醒目。' },
    { name: '乔 · 演示作者', suffix: '0029', bg: 'rgb(255, 184, 107)', fg: 'rgb(128, 61, 18)', note: '橙色头像：建议增加正文留白。' },
    { name: '宁 · 演示作者', suffix: '0039', bg: 'rgb(177, 154, 255)', fg: 'rgb(72, 45, 128)', note: '紫色头像：请保持按钮对齐。' },
    { name: '安 · 演示作者', suffix: '0049', bg: 'rgb(109, 221, 177)', fg: 'rgb(21, 92, 64)', note: '绿色头像：这一版层级很清晰。' },
  ];
  const now = Date.now();
  const comments = [...authors, { ...authors[1]!, note: '同一作者的团队评论：应与橙色公开头像一致。' }].map((author, index) => ({
    id: `avatar-${index}`, projectId, conversationId, filePath: 'index.html',
    elementId: `color-${index}`, selector: `[data-od-id="color-${index}"]`, label: '评论标记', text: '评论头像色彩验收',
    htmlHint: `<h2 data-od-id="color-${index}">`,
    position: { x: 36, y: 36, width: 360, height: 48 }, note: author.note, status: 'open',
    authorKind: index === 4 ? 'member' : 'user', authorKey: 'a'.repeat(60) + author.suffix,
    ...(index === 4 ? { authorMemberId: 'synthetic-color-member' } : {}),
    authorDisplayName: author.name, createdAt: now - index * 60_000, updatedAt: now - index * 60_000,
  }));
  await page.route(`**/api/projects/${projectId}/conversations/${conversationId}/comments`, route =>
    route.request().method() === 'GET' ? route.fulfill({ json: { comments } }) : route.fallback());
  await page.goto(`/projects/${projectId}/files/index.html`);
  const entry = page.getByTestId('comment-panel-toggle');
  await expect(entry).toBeVisible();
  await entry.click();
  const panel = page.getByTestId('comment-side-panel');
  await expect(panel.getByTestId('comment-side-item')).toHaveCount(5);
  for (const [index, author] of authors.entries()) {
    const pin = page.getByTestId(`comment-saved-marker-color-${index}`).locator('.comment-saved-pin');
    await expect(pin).toBeVisible();
    await expect(pin).toHaveText(author.name[0]!);
    await expect(pin).toHaveCSS('background-color', author.bg);
    await expect(pin).toHaveCSS('color', author.fg);
    await pin.hover();
    await expect(pin).toHaveCSS('background-color', author.bg);
    const row = panel.getByTestId('comment-side-item').filter({ hasText: author.note });
    const avatar = row.locator('.comment-side-avatar');
    await expect(avatar).toHaveText(author.name[0]!);
    await expect(avatar).toHaveCSS('background-color', author.bg);
    await expect(avatar).toHaveCSS('color', author.fg);
  }
  const memberAvatar = panel.getByTestId('comment-side-item').filter({ hasText: '同一作者的团队评论' }).locator('.comment-side-avatar');
  await expect(memberAvatar).toHaveCSS('background-color', authors[1]!.bg);
  await expect(memberAvatar).toHaveCSS('color', authors[1]!.fg);
  const memberPin = page.getByTestId('comment-saved-marker-color-4').locator('.comment-saved-pin');
  await expect(memberPin).toHaveCSS('background-color', authors[1]!.bg);
  await expect(memberPin).toHaveCSS('color', authors[1]!.fg);
  await expect(memberPin).toHaveText(authors[1]!.name[0]!);
  await expect(memberAvatar).toHaveText(authors[1]!.name[0]!);
  await page.mouse.move(400, 400);
  const output = resolve(process.env.OD_VISUAL_OUTPUT_DIR ?? testInfo.outputPath('avatar-colors'));
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: resolve(output, 'comment-colored-avatars.png'), animations: 'disabled' });
  await panel.screenshot({ path: resolve(output, 'comment-colored-avatar-panel.png'), animations: 'disabled' });
  const firstPin = page.getByTestId('comment-saved-marker-color-0').locator('.comment-saved-pin');
  const savedInitial = await firstPin.textContent();
  await firstPin.click();
  const activePin = page.getByTestId('comment-active-pin');
  await expect(activePin).toHaveText(savedInitial!);
  await expect(activePin).toHaveText(authors[0]!.name[0]!);
  await expect(activePin).toHaveCSS('background-color', authors[0]!.bg);
  await expect(activePin).toHaveCSS('color', authors[0]!.fg);
  await page.mouse.move(400, 400);
  await page.screenshot({ path: resolve(output, 'comment-active-colored-pin.png'), animations: 'disabled' });
  await writeFile(resolve(output, 'comment-colored-avatars.json'), JSON.stringify({
    source: 'local product with synthetic GET comment snapshots; not live production account data',
    colors: authors.map(({ name, bg, fg }) => ({ name, bg, fg })), sameAuthorPublicMemberColor: 'PASS', savedAndActivePinColorParity: 'PASS', pinAndAvatarInitialParity: 'PASS',
  }, null, 2));
});
