import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@/playwright/suite';
import { applyStandardMocks, routeSuccessfulRuns } from '@/playwright/mock-factory';
import { T } from '@/timeouts';

test.use({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', locale: 'zh-CN' });

test('[P1] comment handoff recovery and sync retry preserve the working comments', async ({ page }, testInfo) => {
  test.setTimeout(T.xlong * 2);
  await applyStandardMocks(page);
  await page.addInitScript(() => {
    localStorage.setItem('open-design:locale', 'zh-CN');
    localStorage.setItem('open-design:locale-source', 'manual');
  });
  const projectId = `comment-recovery-${randomUUID()}`;
  const created = await page.request.post('/api/projects', { data: {
    id: projectId, name: '协作评论恢复验收', skillId: null, designSystemId: null,
    metadata: { kind: 'prototype', nameSource: 'user' },
  } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { conversationId } = await created.json() as { conversationId: string };
  const syntheticContent = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body style="font-family:system-ui;padding:48px;color:#262626"><h1>协作 2.0</h1><p>本地合成评论 · 验证批量提交和恢复</p><section style="margin-top:60px"><h2 data-od-id="heading-a">让反馈成为下一步行动</h2><p data-od-id="heading-b" style="margin-top:80px">保留每一条还没处理的建议</p></section></body></html>';
  // Optional local visual evidence input; the committed regression stays hermetic.
  const content = process.env.OD_COMMENT_PREVIEW_FIXTURE
    ? (await readFile(process.env.OD_COMMENT_PREVIEW_FIXTURE, 'utf8'))
      .replace('id="hero-headline"', 'id="hero-headline" data-od-id="heading-a"')
      .replace('id="hero-description"', 'id="hero-description" data-od-id="heading-b"')
    : syntheticContent;
  const written = await page.request.post(`/api/projects/${projectId}/files`, { data: {
    name: 'index.html', content,
    artifactManifest: { version: 1, kind: 'html', title: '协作 2.0', entry: 'index.html', renderer: 'html', exports: ['html'] },
  } });
  expect(written.ok(), await written.text()).toBeTruthy();
  const comments: { id: string; note: string }[] = [];
  for (const [elementId, note] of [['heading-a', '标题更醒目一些'], ['heading-b', '正文保留充足留白']]) {
    const saved = await page.request.post(`/api/projects/${projectId}/conversations/${conversationId}/comments`, { data: {
      target: { filePath: 'index.html', elementId, selector: `[data-od-id="${elementId}"]`, label: '文本', text: '', htmlHint: '', position: { x: 20, y: 20, width: 200, height: 32 } }, note,
    } });
    expect(saved.ok(), await saved.text()).toBeTruthy();
    comments.push((await saved.json()).comment as { id: string; note: string });
  }
  const output = resolve(process.env.OD_VISUAL_OUTPUT_DIR ?? testInfo.outputPath('comment-recovery'));
  await mkdir(output, { recursive: true });
  const runs = await routeSuccessfulRuns(page, { events: 'pending' });
  await page.route('**/api/runs/*/cancel', route => route.fulfill({ json: { ok: true } }));
  let aligned = false;
  let reply!: (outcome: 'failed' | 'aligned') => void;
  await page.route(`**/api/projects/${projectId}/comment-sync-state?*`, route => route.fulfill({ json: {
    pending: 0, lastError: null, sessionMissing: false, shareStopped: false,
    align: { state: aligned ? 'aligned' : 'diverged', latestSeq: 1 },
  } }));
  await page.route(`**/api/projects/${projectId}/comments/align`, async route => {
    const outcome = await new Promise<'failed' | 'aligned'>(done => { reply = done; });
    aligned = outcome === 'aligned';
    await route.fulfill(aligned ? { json: { state: 'aligned', latestSeq: 1 } } : { status: 503, json: { error: 'controlled outage' } });
  });
  await page.goto(`/projects/${projectId}/files/index.html`);
  await page.getByTestId('comment-panel-toggle').click();
  const panel = page.getByTestId('comment-side-panel');
  await expect(panel.getByTestId('comment-side-item')).toHaveCount(2);
  const sync = panel.getByRole('status').filter({ hasText: '评论对齐未完成' });
  await expect(sync).toBeVisible();
  await page.screenshot({ path: resolve(output, 'E06-diverged.png') });
  await panel.getByRole('button', { name: '重试', exact: true }).click();
  await expect(panel.getByRole('button', { name: '重试中…' })).toBeDisabled();
  await expect(panel.getByRole('button', { name: '重试中…' })).toHaveCSS('color', 'rgb(153, 153, 153)');
  await expect(panel.getByRole('button', { name: '重试中…' })).toHaveCSS('border-top-color', 'rgb(222, 222, 222)');
  await expect(panel.getByText('正在同步评论…')).toBeVisible();
  const pendingNotice = panel.getByRole('status').filter({ hasText: '正在同步评论…' });
  await pendingNotice.screenshot({ path: resolve(output, 'E07-pending-notice.png') });
  await writeFile(resolve(output, 'notice-styles.json'), JSON.stringify(await pendingNotice.evaluate(element => {
    const button = element.querySelector('button')!;
    const copy = element.querySelector('p')!;
    return { notice: { width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height },
      copy: { weight: getComputedStyle(copy).fontWeight, color: getComputedStyle(copy).color },
      button: { weight: getComputedStyle(button).fontWeight, opacity: getComputedStyle(button).opacity,
        color: getComputedStyle(button).color, background: getComputedStyle(button).backgroundColor, borderColor: getComputedStyle(button).borderTopColor,
        height: button.getBoundingClientRect().height, width: button.getBoundingClientRect().width } };
  }), null, 2));
  await page.screenshot({ path: resolve(output, 'E07-pending.png') });
  reply('failed');
  await expect(panel.getByRole('alert')).toHaveText('同步失败，请重试。重试');
  await expect(panel.getByRole('alert')).toHaveCSS('color', 'rgb(132, 132, 132)');
  await expect(panel.getByTestId('comment-side-item')).toHaveCount(2);
  await panel.getByRole('alert').screenshot({ path: resolve(output, 'E06-retry-failed-notice.png') });
  await page.screenshot({ path: resolve(output, 'E06-retry-failed.png') });
  await panel.getByRole('button', { name: '重试', exact: true }).click();
  await expect(panel.getByRole('button', { name: '重试中…' })).toBeDisabled();
  reply('aligned');
  await expect(panel.getByText('评论已同步')).toBeVisible();
  await page.screenshot({ path: resolve(output, 'E06-confirmed.png') });
  await expect(panel.getByText('评论已同步')).toHaveCount(0);
  await expect(panel.getByTestId('comment-side-item')).toHaveCount(2);
  // A real client subset handoff: only the selected comment is acknowledged.
  // The component receipt test covers a rejected second item in a batch.
  const first = panel.getByTestId('comment-side-item').filter({ hasText: comments[0]!.note });
  const second = panel.getByTestId('comment-side-item').filter({ hasText: comments[1]!.note });
  await first.getByRole('button', { name: '选择', exact: true }).click();
  await panel.getByTestId('comment-side-send-claude').click();
  await runs.expectCount(1, { timeout: T.long });
  await expect(first).toHaveCount(0);
  await expect(second).toBeVisible();
  await expect(page.getByTestId('comment-saved-marker-heading-a')).toHaveCount(0);
  await page.screenshot({ path: resolve(output, 'C05-subset-enqueued.png') });
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await expect.poll(async () => {
    const persisted = await page.request.get(`/api/projects/${projectId}/conversations/${conversationId}/comments`);
    return (await persisted.json()).comments.find((comment: { id: string }) => comment.id === comments[0]!.id)?.status;
  }).toBe('open');
  await page.mouse.move(500, 400);
  await page.screenshot({ path: resolve(output, 'C08-cancel-restored.png') });
  await page.reload();
  await page.getByTestId('comment-panel-toggle').click();
  await expect(page.getByTestId('comment-side-item')).toHaveCount(2);
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify({
    fixture: 'isolated real product; HTTP-created project, file and comments; controlled sync and run responses',
    sync: ['diverged', 'pending', 'http-503', 'confirmed-aligned', 'success-auto-hidden'],
    handoff: 'selected subset acknowledged; partial rejection covered by FileViewer.comment-observation unit test',
    recovery: 'client stop restores open status through real comment API and survives reload',
  }, null, 2));
});
