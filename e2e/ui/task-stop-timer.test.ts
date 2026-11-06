import { expect, test } from '@/playwright/suite';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { T } from '@/timeouts';

// Real browser Stop -> local finalization -> aggregated record transition.
// The active Run transport is mocked; no model is invoked.
test('[P1] stopping an automatic task freezes its thinking and elapsed clocks', async ({ page }, testInfo) => {
  await applyStandardMocks(page);
  const projectId = `stop-clock-${Date.now()}`;
  const created = await page.request.post('/api/projects', { data: { id: projectId, name: 'Stop task timer', skillId: null } });
  expect(created.ok()).toBeTruthy();
  const { conversationId } = await created.json() as { conversationId: string };
  const runId = `run-${projectId}`;
  const assistantId = `assistant-${projectId}`;
  const startedAt = Date.now() - 20_000;
  const display = { id: `task-${projectId}`, revision: 4, currentRunId: runId,
    runIds: ['planning', runId], state: 'running', elapsedMs: 20_000,
    observedAt: Date.now(), ticking: true };
  const message = { id: assistantId, role: 'assistant', content: '', agentId: 'mock',
    runId, runStatus: 'running', createdAt: startedAt, startedAt,
    strategyTaskExecutionId: display.id, strategyTaskRunIndex: 1,
    events: [
      { kind: 'done_key', key: 'aaaaaaaaaaaaaaaa' },
      { kind: 'tool_use', id: 'write', name: 'Write', input: { file_path: 'index.html' }, startedAt },
      { kind: 'tool_result', toolUseId: 'write', content: 'Written', completedAt: startedAt + 1000 },
      { kind: 'thinking', text: 'Checking the final layout before delivery.' },
    ], taskDisplay: display };
  const messagesUrl = `/api/projects/${projectId}/conversations/${conversationId}/messages`;
  const saved = await page.request.put(`${messagesUrl}/${assistantId}`, { data: message });
  expect(saved.ok()).toBeTruthy();
  // taskDisplay is a daemon read projection, not a client-writable DB field.
  await page.route(`**${messagesUrl}`, async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    const withDisplay = (row: { id: string }) => row.id === assistantId
      ? { ...row, taskDisplay: display, strategyTaskExecutionId: display.id, strategyTaskRunIndex: 1 } : row;
    if (response.headers()['content-type']?.includes('application/x-ndjson')) {
      const records = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
      await route.fulfill({ response, body: records.map(record => JSON.stringify(record.type === 'message'
        ? { ...record, message: withDisplay(record.message) } : record)).join('\n') + '\n' });
    } else {
      const body = await response.json();
      await route.fulfill({ json: { ...body, messages: body.messages.map(withDisplay) } });
    }
  });
  await page.route(`**/api/runs/${runId}`, route => route.fulfill({ json: {
    id: runId, projectId, conversationId, assistantMessageId: assistantId,
    status: 'running', createdAt: startedAt, updatedAt: Date.now(), agentId: 'mock',
  } }));
  await page.addInitScript(({ targetRunId, since }) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes(`/api/runs/${targetRunId}/events`)) return originalFetch(input, init);
      const frames = [
        ['start', { runId: targetRunId, bin: 'mock-agent' }],
        ['agent', { type: 'done_key', key: 'aaaaaaaaaaaaaaaa' }],
        ['agent', { type: 'tool_use', id: 'write', name: 'Write', input: { file_path: 'index.html' }, startedAt: since }],
        ['agent', { type: 'tool_result', toolUseId: 'write', content: 'Written', completedAt: since + 1000 }],
        ['agent', { type: 'thinking_delta', delta: 'Checking the final layout before delivery.' }],
      ];
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode(frames.map(([event, data]) =>
          `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')));
        init?.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
    };
  }, { targetRunId: runId, since: startedAt });
  await page.route(`**/api/runs/${runId}/cancel`, route => route.fulfill({ json: { ok: true } }));
  await page.goto(`/projects/${projectId}/conversations/${conversationId}`, { waitUntil: 'domcontentloaded' });
  const stop = page.getByTestId('chat-composer').getByRole('button', { name: 'Stop', exact: true });
  await expect(stop).toBeVisible({ timeout: T.long });
  const flow = page.getByTestId('assistant-flow');
  await expect(flow.getByText('Thinking', { exact: true })).toBeVisible();
  const header = flow.locator(':scope > details > summary');
  const before = await header.innerText();
  await expect.poll(() => header.innerText()).not.toBe(before);
  await page.screenshot({ path: testInfo.outputPath('before-stop.png'), fullPage: true });
  await stop.click();
  await expect(stop).toHaveCount(0);
  await expect(flow.getByText('Thinking', { exact: true })).toHaveCount(0);
  await expect(header).toContainText('Stopped');
  const stopped = await flow.innerText();
  // Observe multiple real one-second UI clock ticks after Stop.
  await page.waitForTimeout(15_000);
  await expect(flow).toHaveText(stopped, { useInnerText: true });
  await page.screenshot({ path: testInfo.outputPath('after-stop.png'), fullPage: true });
});
