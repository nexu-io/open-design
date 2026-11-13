import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@/playwright/suite';
import { T } from '@/timeouts';

const FILE = 'image-doubao-seedream-3-0-t2i-250415-muy6ahle.png';

for (const fails of [false, true]) {
  test(`[P1] ${fails ? 'failed' : 'artifact-only'} daemon run keeps its image usable after reload (#8596)`, async ({ page, toolsDev }) => {
    test.setTimeout(T.xlong);
    await page.setViewportSize({ width: 1280, height: 960 });
    const binDir = join(toolsDev.root, 'scratch', `artifact-run-${randomUUID()}`);
    await mkdir(binDir, { recursive: true });
    // A real spawned CLI writes a real file. Only its provider response is
    // deterministic; message persistence and all browser APIs remain real.
    const runner = join(binDir, 'artifact-agent.ts');
    await writeFile(runner, `
import fs from 'node:fs';
import path from 'node:path';
if (process.argv.includes('--version')) { console.log('1.0.0'); process.exit(0); }
if (process.argv.includes('models')) { console.log('fake/default'); process.exit(0); }
fs.writeFileSync(path.join(process.cwd(), '${FILE}'), Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
console.log(JSON.stringify({ type: 'step_start' }));
console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
process.exit(${fails ? 1 : 0});
`);
    const bin = join(binDir, process.platform === 'win32' ? 'opencode.cmd' : 'opencode');
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    await writeFile(bin, process.platform === 'win32'
      ? `@echo off\r\n"${process.execPath}" "${runner}" %*\r\n`
      : `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(runner)} "$@"\n`,
    { mode: 0o755 });
    const config = {
      mode: 'daemon', agentId: 'opencode', onboardingCompleted: true,
      skillId: null, designSystemId: null, agentCliEnv: { opencode: { OPENCODE_BIN: bin } },
    };
    const configured = await page.request.put('/api/app-config', { data: config });
    expect(configured.ok()).toBeTruthy();
    await page.addInitScript((value) => {
      localStorage.setItem('open-design:config', JSON.stringify(value));
      localStorage.setItem('open-design:locale', 'en');
      localStorage.setItem('open-design:locale-source', 'manual');
    }, config);

    const projectId = `artifact-project-${randomUUID()}`;
    const created = await page.request.post('/api/projects', {
      data: { id: projectId, name: fails ? 'Image saved before failure' : 'Image without final summary' },
    });
    expect(created.ok()).toBeTruthy();
    const conversationsResponse = await page.request.get(`/api/projects/${projectId}/conversations`);
    const { conversations } = await conversationsResponse.json();
    const conversationId = conversations[0].id as string;
    const assistantMessageId = `assistant-${randomUUID()}`;
    const turn = await page.request.post('/api/chat', {
      data: { agentId: 'opencode', projectId, conversationId, assistantMessageId, message: 'Generate an image.' },
      timeout: T.medium,
    });
    expect(turn.ok()).toBeTruthy();
    const terminal = await turn.text();
    expect(terminal).toContain(`"status":"${fails ? 'failed' : 'succeeded'}"`);
    const persistedResponse = await page.request.get(
      `/api/projects/${projectId}/conversations/${conversationId}/messages`,
    );
    const { messages } = await persistedResponse.json();
    expect(messages.find((message: { id: string }) => message.id === assistantMessageId)?.producedFiles)
      .toEqual([expect.objectContaining({ name: FILE })]);

    await page.goto(`/projects/${projectId}/conversations/${conversationId}`, { waitUntil: 'domcontentloaded' });
    // Boot is a separate precondition; keep the artifact assertion's shorter
    // budget focused on message rendering rather than development chunk loads.
    await expect(page.getByTestId('file-workspace'), 'project workspace did not finish loading')
      .toBeVisible({ timeout: T.long });
    const card = page.getByTestId(`artifact-card-${FILE}`);
    await expect(card).toBeVisible();
    const download = page.getByTestId(`artifact-card-export-${FILE}`);
    await expect(download).toBeVisible();
    if (fails) {
      await expect(page.getByTestId('chat-run-error-card')).toBeVisible();
      await expect(page.getByTestId('chat-run-error-artifacts')).toContainText(FILE);
    } else {
      await expect(page.getByTestId('chat-run-error-card')).toHaveCount(0);
      await expect(page.getByTestId('chat-artifact-missing-summary')).toContainText('did not provide a final summary');
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('file-workspace')).toBeVisible({ timeout: T.long });
    await expect(card).toBeVisible();
    await page.getByTestId(`artifact-card-open-${FILE}`).click();
    // The same project file key must work at the raw-file boundary too.
    const raw = await page.request.get(`/api/projects/${projectId}/raw/${FILE}`);
    expect(raw.ok()).toBeTruthy();
    expect(raw.headers()['content-type']).toContain('image/png');
    expect((await raw.body()).subarray(1, 4).toString()).toBe('PNG');
    await expect(download).toBeVisible();
    const downloaded = page.waitForEvent('download');
    await download.click();
    expect((await downloaded).suggestedFilename()).toBe(FILE);

    const screenshot = test.info().outputPath(fails ? 'artifact-with-failure.png' : 'artifact-without-summary.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    await test.info().attach('Chat artifact after reload', { path: screenshot, contentType: 'image/png' });
  });
}
