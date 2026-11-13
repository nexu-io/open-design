import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Page, TestInfo } from '@playwright/test';
import { applyStandardMocks, routeSignedOutVelaStatus } from '@/playwright/mock-factory';
import { expect, test } from '@/playwright/suite';
import { T } from '@/timeouts';
import { AMR_PERSONAL_WORKSPACE_CONTEXT, mockAmrPersonalWorkspace } from '@/playwright/amr';

test.use({ viewport: { width: 1440, height: 904 }, deviceScaleFactor: 1, video: 'on' });

test('[P1] OPEND-4633 export stays still when the preview becomes ready', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('open-design:locale', 'en');
    localStorage.setItem('open-design:locale-source', 'manual');
  });
  await mockAmrPersonalWorkspace(page);
  await page.route('**/api/projects/*/workspace-scope', async route => {
    const projectId = new URL(route.request().url()).pathname.match(/\/projects\/([^/]+)/)?.[1];
    await route.fulfill({ json: { scope: {
      kind: 'personal', projectId, workspaceId: AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId,
      visibility: 'personal', context: AMR_PERSONAL_WORKSPACE_CONTEXT,
    } } });
  });
  const projectId = `export-4633-${randomUUID()}`;
  const created = await page.request.post('/api/projects', { data: {
    id: projectId, name: 'Export loading regression', skillId: null, designSystemId: null,
    metadata: { kind: 'prototype', nameSource: 'user' },
  } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const file = await page.request.post(`/api/projects/${projectId}/files`, { data: {
    name: 'index.html', content: '<!doctype html><html><body><h1>Export loading regression</h1></body></html>',
    artifactManifest: { version: 1, kind: 'html', title: 'Export loading regression', entry: 'index.html', renderer: 'html', exports: ['html'] },
  } });
  expect(file.ok(), await file.text()).toBeTruthy();

  // Start before navigation: waiting for actionability can miss the first
  // animation. Real rAF/CSS time is the subject; screenshots must not disable it.
  await page.addInitScript(recordExportMotion, T.short);
  await page.goto(`/projects/${projectId}/files/index.html`);
  await assertExportMotion(page, testInfo, 'initial');
});

function recordExportMotion(observationMs: number) {
  const samples: { time: number; x: number; y: number; width: number; height: number; transform: string }[] = [];
  const witness = { samples, done: false };
  Object.assign(window, { exportMotionWitness: witness });
  let start: number | null = null;
  const sample = (now: number) => {
    const buttons = document.querySelectorAll<HTMLButtonElement>('.ws-tabs-file-actions button.chrome-action-unified');
    const button = Array.from(buttons).find(item => item.getAttribute('aria-label') === 'Export' && item.checkVisibility());
    const share = Array.from(buttons).find(item => item.getAttribute('aria-label') === 'Share' && item.checkVisibility());
    if (button && share) {
      start ??= now;
      const rect = button.getBoundingClientRect();
      const anchor = share.getBoundingClientRect();
      samples.push({ time: now - start, x: rect.x - anchor.x, y: rect.y - anchor.y,
        width: rect.width, height: rect.height, transform: getComputedStyle(button).transform });
    }
    if (start !== null && now - start >= observationMs) witness.done = true;
    else requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}

async function assertExportMotion(page: Page, testInfo: TestInfo, phase: string) {
  await page.waitForFunction(() => (window as unknown as { exportMotionWitness: { done: boolean } }).exportMotionWitness.done, undefined, { timeout: T.long });
  const witness = await page.evaluate(() => (window as unknown as {
    exportMotionWitness: { samples: { time: number; x: number; y: number; width: number; height: number; transform: string }[] };
  }).exportMotionWitness);
  await testInfo.attach(`${phase}-motion`, { body: JSON.stringify(witness, null, 2), contentType: 'application/json' });
  await testInfo.attach(`${phase}-preview`, { body: await page.screenshot(), contentType: 'image/png' });
  expect(witness.samples.length).toBeGreaterThan(10);
  // Subpixel rounding is allowed; the old 1px nudge must fail this check.
  for (const axis of ['x', 'y', 'width', 'height'] as const) {
    const values = witness.samples.map(sample => sample[axis]);
    expect(Math.max(...values) - Math.min(...values), `${axis} changed during preview loading`).toBeLessThanOrEqual(0.5);
  }
  expect(witness.samples.every(sample => sample.transform === 'none')).toBe(true);
}

// Real bundled template duplication, project files, preview and exports. Only
// account/agent discovery is simulated; no generation or remote publication.
test('[P1] OPEND-4633 Remix, delayed preview, switching and real HTML downloads', async ({ page }, testInfo) => {
  test.setTimeout(T.xlong * 2);
  await applyStandardMocks(page);
  await routeSignedOutVelaStatus(page);
  await page.addInitScript(recordExportMotion, T.short);
  await page.goto('/community');
  const card = page.locator('article.community-template-card').filter({ hasText: 'Saas Landing' });
  await expect(card).toHaveCount(1, { timeout: T.long });
  await card.hover();
  const [response] = await Promise.all([
    page.waitForResponse(response => response.url().includes('/duplicate-project') && response.request().method() === 'POST', { timeout: T.long }),
    card.getByRole('button', { name: 'Remix', exact: true }).click({ timeout: T.medium }),
  ]);
  expect(response.ok(), await response.text()).toBe(true);
  const { projectId, relPath } = await response.json() as { projectId: string; relPath: string };
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}`));
  const exportButton = page.locator('.ws-tabs-file-actions').getByRole('button', { name: 'Export', exact: true });
  await expect(exportButton).toBeEnabled();
  await assertExportMotion(page, testInfo, 'remix');

  const downloadHtml = async (expectedMarker: string) => {
    await exportButton.click();
    const pending = page.waitForEvent('download', { timeout: T.long });
    await page.getByRole('menuitem', { name: 'Export as standalone HTML' }).click();
    const download = await pending;
    expect(await download.failure()).toBeNull();
    const path = await download.path();
    expect(path).not.toBeNull();
    const html = await readFile(path!, 'utf8');
    expect(html).toContain(expectedMarker);
    await testInfo.attach(download.suggestedFilename(), { path: path!, contentType: 'text/html' });
    return html;
  };
  await downloadHtml('Filebase');

  const secondName = 'second.html';
  const second = await page.request.post(`/api/projects/${projectId}/files`, { data: {
    name: secondName, content: '<!doctype html><html><body><h1>Second export target</h1></body></html>',
  } });
  expect(second.ok(), await second.text()).toBe(true);
  // Hold only the parent viewer's source fetch. The real iframe still loads
  // through its normal URL, reproducing preview-ready/source-pending ordering.
  let releaseSource!: () => void;
  const heldSource = new Promise<void>(resolve => { releaseSource = resolve; });
  let sourceRequested = false;
  await page.route(`**/api/projects/${projectId}/raw/${secondName}*`, async route => {
    if (route.request().resourceType() === 'fetch') {
      sourceRequested = true;
      await heldSource;
    }
    await route.continue();
  });
  await page.getByTestId('design-files-tab').click();
  const secondEntry = page.getByRole('button', { name: `Open ${secondName}`, exact: true });
  await expect(secondEntry).toBeVisible();
  await page.evaluate(recordExportMotion, T.short);
  try {
    await secondEntry.click();
    await expect(page.getByRole('tab', { name: /second.html/ })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => sourceRequested).toBe(true);
    await expect(exportButton).toBeEnabled();
    await assertExportMotion(page, testInfo, 'source-pending');
  } finally {
    releaseSource();
  }
  await downloadHtml('Second export target');

  await page.getByRole('tab', { name: new RegExp(relPath.replace(/\./g, '\\.')) }).click();
  await page.evaluate(recordExportMotion, T.short);
  await assertExportMotion(page, testInfo, 'switch-back');
  const original = await downloadHtml('Filebase');
  expect(original).not.toContain('Second export target');
  await page.reload();
  await expect(exportButton).toBeEnabled();
  await assertExportMotion(page, testInfo, 'reload');

  const largeName = 'large.html';
  const largeContent = `<!doctype html><html><body><h1>Large original start</h1><!--${'x'.repeat(3 * 1024 * 1024)}--><p>Large original end</p></body></html>`;
  const large = await page.request.post(`/api/projects/${projectId}/files`, { data: {
    name: largeName, content: largeContent,
  } });
  expect(large.ok(), await large.text()).toBe(true);
  await page.goto(`/projects/${projectId}/files/${largeName}`);
  await expect(exportButton).toBeEnabled();
  await assertExportMotion(page, testInfo, 'large-file');
  // The daemon independently caps standalone HTML entry bytes at 2 MiB.
  // Preserve that policy: the entry stays stable and the rejection is visible.
  await exportButton.click();
  const rejectedHtml = page.waitForResponse(response => response.url().endsWith('/export/html') && response.request().method() === 'POST');
  await page.getByRole('menuitem', { name: 'Export as standalone HTML' }).click();
  expect((await rejectedHtml).status()).toBe(413);
  await expect(page.getByText('This export did not complete. Please try again.', { exact: true })).toBeVisible();

  const archivePattern = `**/api/projects/${projectId}/archive`;
  const rawPattern = `**/api/projects/${projectId}/raw/${largeName}*`;
  await page.route(archivePattern, route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.route(rawPattern, route => route.request().resourceType() === 'fetch'
    ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue());
  await exportButton.click();
  const failedFallback = page.waitForResponse(response => response.url().includes(`/raw/${largeName}`)
    && response.request().resourceType() === 'fetch' && response.status() === 503, { timeout: T.long });
  await page.getByRole('menuitem', { name: 'Download as .zip' }).click();
  await failedFallback;
  await expect(page.getByText('This export did not complete. Please try again.', { exact: true })).toBeVisible();
  await page.unroute(archivePattern);
  await page.unroute(rawPattern);
  await exportButton.click();
  const zipPending = page.waitForEvent('download', { timeout: T.long });
  await page.getByRole('menuitem', { name: 'Download as .zip' }).click();
  const zip = await zipPending;
  expect(await zip.failure()).toBeNull();
  const zipPath = await zip.path();
  expect((await readFile(zipPath!)).subarray(0, 2).toString()).toBe('PK');
  const { stdout: archivedHtml } = await promisify(execFile)('unzip', ['-p', zipPath!, largeName], { maxBuffer: 4 * 1024 * 1024 });
  expect(archivedHtml).toBe(largeContent);
  await testInfo.attach('project.zip', { path: zipPath!, contentType: 'application/zip' });
});
