import { writeFile } from 'node:fs/promises';

import type { Route } from '@playwright/test';
import { expect, test } from '@/playwright/suite';
import { routeSuccessfulRuns, type RunRequestBody } from '@/playwright/mock-factory';
import {
  configureVisualPage,
  gotoVisualHome,
  gotoVisualWorkspace,
} from '@/playwright/visual';

test('[P1] upload cancellation unlocks send without admitting a late partial attachment', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const runBodies: RunRequestBody[] = [];
  let releaseSlowUpload: (() => void) | undefined;
  let markSlowUploadFinished: (() => void) | undefined;
  const slowUploadGate = new Promise<void>((resolve) => {
    releaseSlowUpload = resolve;
  });
  const slowUploadFinished = new Promise<void>((resolve) => {
    markSlowUploadFinished = resolve;
  });

  await configureVisualPage(page);
  const runs = await routeSuccessfulRuns(page, { bodies: runBodies });
  await page.route('**/api/projects/*/upload', async (route: Route) => {
    const body = route.request().postDataBuffer()?.toString('utf8') ?? '';
    const name = body.includes('slow.png') ? 'slow.png' : 'fast.png';
    if (name === 'slow.png') await slowUploadGate;
    await route.fulfill({
      json: {
        files: [{ name, originalName: name, path: `uploads/${name}`, size: 1 }],
      },
    });
    if (name === 'slow.png') markSlowUploadFinished?.();
  });

  await gotoVisualHome(page);
  await gotoVisualWorkspace(page);
  const input = page.getByTestId('chat-composer-input');
  const send = page.getByTestId('chat-send');
  await input.fill('Use the selected upload');
  await page.getByTestId('chat-file-input').setInputFiles([
    { name: 'fast.png', mimeType: 'image/png', buffer: Buffer.from('fast') },
    { name: 'slow.png', mimeType: 'image/png', buffer: Buffer.from('slow') },
  ]);

  await expect(page.getByRole('button', { name: 'Remove fast.png' })).toBeVisible();
  const cancelSlow = page.getByRole('button', { name: 'Cancel upload of slow.png' });
  await expect(cancelSlow).toBeVisible();
  await expect(send).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('blocked-before-cancel.png'), fullPage: true });

  await input.press('Enter');
  await runs.expectNone({ message: 'Enter must not submit while the slow attachment is still intended' });

  await cancelSlow.click();
  await expect(send).toBeEnabled();
  await input.press('Enter');
  await runs.expectCount(1);
  const runBody = runBodies[0] ?? {};
  const serializedRunBody = JSON.stringify(runBody);
  expect(serializedRunBody).toContain('uploads/fast.png');
  expect(serializedRunBody).not.toContain('slow.png');

  releaseSlowUpload?.();
  await slowUploadFinished;
  await expect(page.getByRole('button', { name: /slow\.png/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('after-late-response.png'), fullPage: true });

  await writeFile(
    testInfo.outputPath('assertions.json'),
    JSON.stringify({
      browserVersion: page.context().browser()?.version() ?? null,
      blockedBeforeCancel: true,
      runCountBeforeCancel: 0,
      enabledImmediatelyAfterCancel: true,
      submittedRunBody: runBody,
      lateSlowAttachmentRestaged: false,
    }, null, 2),
    'utf8',
  );
});
