import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { stockSearch } from '../src/media/stock-search.js';
import { STOCK_TELEMETRY_LIMITS, collectStockTelemetry, createStockRecorder, parseStockJournal, readStockJournal, startStockTelemetryCollector, stockTelemetryDir } from '../src/media/stock-telemetry.js';
import { captureStockAnalyticsBatch } from '../src/analytics.js';
import type { StockJournal } from '../src/media/stock-telemetry.js';

const JPEG = new Uint8Array([255, 216, 255, 192, 0, 17, 8, 3, 32, 4, 176, 3, 1, 34, 0]);
let cwd: string;
beforeEach(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), 'od-stock-telemetry-'));
  await writeFile(path.join(cwd, 'app-config.json'), JSON.stringify({ installationId: 'test-install', telemetry: { metrics: true, content: false } }));
});
afterEach(async () => { await rm(cwd, { recursive: true, force: true }); });

it('records reversed priority and a future fallback channel without assuming Pexels is primary', async () => {
  const recorder = await createStockRecorder({ slotCount: 1, env: { OD_DATA_DIR: cwd } });
  const attempts = [
    { provider: 'company-pixabay', stage: 'search' as const, status: 'error' as const, timestamp: new Date().toISOString(), durationMs: 1, httpStatus: 503, rateLimited: false },
    { provider: 'future-library', stage: 'search' as const, status: 'ok' as const, timestamp: new Date().toISOString(), durationMs: 1, httpStatus: 200, rateLimited: false },
  ];
  attempts.forEach(attempt => recorder.record({ ...attempt, slotIndex: 0 }));
  expect(await recorder.finish({ providers: ['company-pixabay', 'future-library'], slots: [{ id: 'a', query: 'dog', status: 'ok', provider: 'future-library', attempts }] })).toBe('complete');
  const journal = await readStockJournal(cwd, recorder.callId);
  expect(journal?.events.at(-1)?.properties).toMatchObject({ primary_provider: 'company-pixabay', attempted_providers: ['company-pixabay', 'future-library'], fallback_attempted: true, fallback_succeeded: true, fallback_reason: 'http_error' });
});

it('uploads a maximum six-channel batch rather than retrying forever at the legacy event limit', async () => {
  const recorder = await createStockRecorder({ slotCount: 30, env: { OD_DATA_DIR: cwd } });
  const providers = Array.from({ length: 6 }, (_, index) => `channel-${index}`);
  const slots = Array.from({ length: 30 }, (_, slotIndex) => {
    const attempts = providers.map(provider => ({ provider, stage: 'search' as const, status: 'error' as const, timestamp: new Date().toISOString(), durationMs: 1, httpStatus: 503, rateLimited: false }));
    attempts.forEach(attempt => recorder.record({ ...attempt, slotIndex }));
    return { id: `slot-${slotIndex}`, query: 'dog', status: 'error' as const, attempts };
  });
  expect(await recorder.finish({ providers, slots })).toBe('complete');
  const journal = await readStockJournal(cwd, recorder.callId);
  expect(journal?.events).toHaveLength(210);
  const fetcher = vi.fn(async () => Response.json({ status: 1 }));
  expect(await captureStockAnalyticsBatch({ dataDir: cwd, events: journal!.events, sessionId: recorder.callId, appVersion: 'test', env: { POSTHOG_KEY: 'phc_test' }, fetch: fetcher as typeof fetch })).toBe('uploaded');
  expect(fetcher).toHaveBeenCalledOnce();
});

async function recordedFallback() {
  const recorder = await createStockRecorder({ slotCount: 2, env: {
    OD_DATA_DIR: cwd, OD_STOCK_RUN_ID: 'run-1', OD_PROJECT_ID: 'project-1',
    OD_STOCK_SOURCE_COMMIT: 'a'.repeat(40), OD_STOCK_EXECUTION_SOURCE: 'validation',
    PEXELS_API_KEY: 'sensitive-pexels-key', PIXABAY_API_KEY: 'sensitive-pixabay-key',
  } });
  const report = await stockSearch({
    cwd,
    slots: [{ id: 'private-slot-0', query: 'private query' }, { id: 'private-slot-1', query: 'private query' }],
    search: async ({ slots }) => ({ providers: ['pexels', 'pixabay'], slots: slots.map(slot => ({
      id: slot.id, status: 'ok', provider: 'pixabay', downloadUrl: 'https://cdn.pixabay.com/1.jpg',
      alt: 'private query', sourceUrl: 'https://pixabay.com/photos/1/', license: 'Pixabay Content License',
      attempts: [
        { provider: 'pexels', stage: 'search', status: 'error', timestamp: new Date().toISOString(), durationMs: 1, httpStatus: 429, rateLimited: true,
          retryAfter: '60', rateLimit: { period: 'month', limit: null, remaining: 0, resetUnix: null }, error: 'provider_http_error' },
        { provider: 'pixabay', stage: 'search', status: 'ok', timestamp: new Date().toISOString(), durationMs: 1, httpStatus: 200, rateLimited: false },
      ],
    })) }),
    fetch: (async input => {
      const url = String(input);
      if (url.startsWith('https://api.pexels.com/')) return new Response('{}', {
        status: 429, headers: { 'x-ratelimit-remaining': '0', 'retry-after': '60' },
      });
      if (url.startsWith('https://pixabay.com/api/')) return Response.json({ hits: [{
        tags: 'private query', pageURL: 'https://pixabay.com/photos/1/', webformatURL: 'https://cdn.pixabay.com/1.jpg',
      }] });
      return new Response(JPEG);
    }) as typeof fetch,
    onAttempt: attempt => recorder.record(attempt),
  });
  expect(await recorder.finish(report)).toBe('complete');
  return { recorder, report };
}

it('persists all attempts and slot outcomes independently of terminal output, keeping slot indices distinct', async () => {
  const { recorder } = await recordedFallback();
  const journal = await readStockJournal(cwd, recorder.callId);
  expect(journal?.complete).toBe(true);
  expect(journal?.events).toHaveLength(8);
  const requests = journal!.events.filter(event => event.event === 'media_stock_request_result');
  expect(requests.filter(event => event.properties.http_status === 429)).toHaveLength(2);
  expect(requests.map(event => event.properties.slot_index)).toEqual(expect.arrayContaining([0, 1]));
  expect(journal!.events.filter(event => event.event === 'media_stock_slot_result')).toEqual([
    expect.objectContaining({ properties: expect.objectContaining({ slot_index: 0, fallback_succeeded: true, fallback_reason: 'rate_limit_429' }) }),
    expect.objectContaining({ properties: expect.objectContaining({ slot_index: 1, fallback_succeeded: true, fallback_reason: 'rate_limit_429' }) }),
  ]);
  const raw = JSON.stringify(journal);
  for (const privateText of ['private query', 'private-slot', 'sensitive-pexels-key', 'sensitive-pixabay-key', 'https://']) expect(raw).not.toContain(privateText);
  expect(requests.every(event => event.properties.duration_ms >= 0)).toBe(true);
});

it('retries a failed batch with stable event ids and does not resend an acknowledged call', async () => {
  const { recorder } = await recordedFallback();
  const send = vi.fn(async (_journal: StockJournal) => 'retry' as 'retry' | 'uploaded');
  expect(await collectStockTelemetry({ dataDir: cwd, send, now: 1_000 })).toMatchObject({ uploaded: 0, pending: 1 });
  await collectStockTelemetry({ dataDir: cwd, send, now: 2_000 });
  expect(send).toHaveBeenCalledTimes(1);
  const firstIds = send.mock.calls[0]?.[0]?.events.map(event => event.id);
  send.mockImplementation(async () => 'uploaded');
  expect(await collectStockTelemetry({ dataDir: cwd, send, now: 62_000 })).toMatchObject({ uploaded: 1, events: 8, pending: 0 });
  expect(send.mock.calls[1]?.[0]?.events.map(event => event.id)).toEqual(firstIds);
  await collectStockTelemetry({ dataDir: cwd, send, now: 63_000 });
  expect(send).toHaveBeenCalledTimes(2);
  expect(JSON.parse(await readFile(path.join(stockTelemetryDir(cwd), `${recorder.callId}.receipt.json`), 'utf8'))).toMatchObject({ status: 'uploaded', eventCount: 8 });
});

it('re-projects only allowed fields and marks an interrupted journal partial', async () => {
  const { recorder } = await recordedFallback();
  const file = path.join(stockTelemetryDir(cwd), `${recorder.callId}.jsonl`);
  const lines = (await readFile(file, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  lines[0].context.prompt = 'must-not-upload';
  lines[1].properties.authorization = 'must-not-upload';
  const complete = parseStockJournal(lines.map(line => JSON.stringify(line)).join('\n') + '\n', recorder.callId);
  expect(JSON.stringify(complete)).not.toContain('authorization');
  expect(JSON.stringify(complete?.events)).not.toContain('must-not-upload');
  const partial = parseStockJournal(lines.slice(0, 3).map(line => JSON.stringify(line)).join('\n') + '\n{"truncated":', recorder.callId);
  expect(partial?.complete).toBe(false);
  expect(partial?.events).toHaveLength(2);
  expect(partial?.events.every(event => event.properties.collection_status === 'partial')).toBe(true);
});

it('honors collection-time opt-out even if metrics are enabled before recovery', async () => {
  await writeFile(path.join(cwd, 'app-config.json'), JSON.stringify({ installationId: 'test-install', telemetry: { metrics: false } }));
  const { recorder } = await recordedFallback();
  await writeFile(path.join(cwd, 'app-config.json'), JSON.stringify({ installationId: 'test-install', telemetry: { metrics: true } }));
  const send = vi.fn(async () => 'uploaded' as const);
  await collectStockTelemetry({ dataDir: cwd, send });
  expect(send).not.toHaveBeenCalled();
  expect((await readStockJournal(cwd, recorder.callId))?.header.uploadAllowed).toBe(false);
});

it('fails only collection when the resolved data root is not writable', async () => {
  await writeFile(path.join(cwd, 'blocked'), 'not a directory');
  const recorder = await createStockRecorder({ env: { OD_DATA_DIR: path.join(cwd, 'blocked') }, slotCount: 1 });
  expect(await recorder.finish({ providers: [], slots: [] })).toBe('failed');
  expect(await readdir(cwd)).toContain('blocked');
});

it('does not replay calls disabled before upload after consent is re-enabled', async () => {
  await recordedFallback();
  const send = vi.fn(async (_journal: StockJournal) => 'disabled' as 'disabled' | 'uploaded');
  await collectStockTelemetry({ dataDir: cwd, send, now: 1_000 });
  send.mockImplementation(async () => 'uploaded');
  expect(await collectStockTelemetry({ dataDir: cwd, send, now: 100_000 })).toMatchObject({ pending: 0 });
  expect(send).toHaveBeenCalledTimes(1);
});

it('sends one HTTP batch with the original timestamps and treats PostHog quota limiting as retryable', async () => {
  const { recorder } = await recordedFallback();
  const journal = (await readStockJournal(cwd, recorder.callId))!;
  const bodies: any[] = [];
  const fetchImpl = (async (url, init) => {
    expect(String(url)).toBe('https://us.i.posthog.com/batch/');
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json(bodies.length === 1 ? { status: 1, quota_limited: ['events'] } : { status: 1 });
  }) as typeof fetch;
  const args = { dataDir: cwd, events: journal.events, context: journal.header.identity, appVersion: '0.23.1', sessionId: recorder.callId,
    env: { POSTHOG_KEY: 'phc_test', OD_TELEMETRY_ENV: 'evaluation' }, fetch: fetchImpl };
  expect(await captureStockAnalyticsBatch(args)).toBe('retry');
  expect(await captureStockAnalyticsBatch(args)).toBe('uploaded');
  expect(bodies[0].batch).toHaveLength(8);
  expect(bodies[0].batch[0]).toMatchObject({ timestamp: journal.events[0]?.timestamp, properties: { distinct_id: 'test-install', env: 'evaluation' } });
  expect(bodies[0].batch.map((row: any) => row.properties.$insert_id)).toEqual(bodies[1].batch.map((row: any) => row.properties.$insert_id));
  await writeFile(path.join(cwd, 'app-config.json'), JSON.stringify({ telemetry: { metrics: false } }));
  expect(await captureStockAnalyticsBatch(args)).toBe('disabled');
  expect(bodies).toHaveLength(2);
});

it('keeps the collected upload identity after installation/run identity changes', async () => {
  const { recorder } = await recordedFallback();
  const journal = (await readStockJournal(cwd, recorder.callId))!;
  const rows: any[] = [];
  const fetchImpl = (async (_url, init) => {
    rows.push(JSON.parse(String(init?.body)).batch);
    return Response.json(rows.length === 1 ? { error: 'temporarily unavailable' } : { status: 1 }, { status: rows.length === 1 ? 503 : 200 });
  }) as typeof fetch;
  const args = { dataDir: cwd, events: journal.events, context: journal.header.identity, appVersion: '0.23.1', sessionId: recorder.callId,
    env: { POSTHOG_KEY: 'phc_test' }, fetch: fetchImpl };
  expect(await captureStockAnalyticsBatch(args)).toBe('retry');
  await writeFile(path.join(cwd, 'app-config.json'), JSON.stringify({ installationId: 'replacement-install', telemetry: { metrics: true } }));
  expect(await captureStockAnalyticsBatch(args)).toBe('uploaded');
  expect(rows[0]).toEqual(rows[1]);
  expect(rows[1][0].properties.distinct_id).toBe('test-install');
});

it('reserves active-call capacity atomically under concurrent admission', async () => {
  const setup = await createStockRecorder({ env: { OD_DATA_DIR: cwd }, slotCount: 1 });
  await setup.finish({ providers: [], slots: [{ id: 'a', query: 'x', status: 'budget_exceeded' }] });
  const dir = stockTelemetryDir(cwd);
  for (const name of await readdir(dir)) await rm(path.join(dir, name));
  await Promise.all(Array.from({ length: Math.floor(STOCK_TELEMETRY_LIMITS.spoolBytes / STOCK_TELEMETRY_LIMITS.callBytes) - 1 }, () => writeFile(path.join(dir, `${randomUUID()}.active.jsonl`), '')));
  const recorders = await Promise.all([0, 1].map(() => createStockRecorder({ env: { OD_DATA_DIR: cwd }, slotCount: 1 })));
  const outcomes = await Promise.all(recorders.map(recorder => recorder.finish({ providers: [], slots: [{ id: 'a', query: 'x', status: 'budget_exceeded' }] })));
  expect(outcomes.sort()).toEqual(['complete', 'failed']);
  expect((await readdir(dir)).filter(name => name.endsWith('.jsonl'))).toHaveLength(Math.floor(STOCK_TELEMETRY_LIMITS.spoolBytes / STOCK_TELEMETRY_LIMITS.callBytes));
});

it('flushes a newly completed call before the next periodic pass on graceful shutdown', async () => {
  const send = vi.fn(async (_journal: StockJournal) => 'uploaded' as const);
  const collector = startStockTelemetryCollector({ dataDir: cwd, send });
  try {
    const { recorder } = await recordedFallback();
    collector.dispose();
    await collector.flush();
    expect(send.mock.calls.some(([journal]) => journal.header.callId === recorder.callId && journal.events.length === 8)).toBe(true);
  } finally { collector.dispose(); }
});

it('rechecks a dead admission owner exclusively when two writers recover together', async () => {
  const dir = stockTelemetryDir(cwd);
  await mkdir(path.join(dir, '.admission'), { recursive: true });
  await writeFile(path.join(dir, '.admission', 'owner'), '2147483647');
  await Promise.all(Array.from({ length: Math.floor(STOCK_TELEMETRY_LIMITS.spoolBytes / STOCK_TELEMETRY_LIMITS.callBytes) - 1 }, () => writeFile(path.join(dir, `${randomUUID()}.active.jsonl`), '')));
  const originalKill = process.kill;
  const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
    if (pid === 2147483647) throw Object.assign(new Error('dead owner'), { code: 'ESRCH' });
    return originalKill(pid, signal);
  });
  try {
    const recorders = await Promise.all([0, 1].map(() => createStockRecorder({ env: { OD_DATA_DIR: cwd }, slotCount: 1 })));
    const outcomes = await Promise.all(recorders.map(recorder => recorder.finish({ providers: [], slots: [{ id: 'a', query: 'x', status: 'budget_exceeded' }] })));
    expect(outcomes.sort()).toEqual(['complete', 'failed']);
    expect((await readdir(dir)).filter(name => name.endsWith('.jsonl'))).toHaveLength(Math.floor(STOCK_TELEMETRY_LIMITS.spoolBytes / STOCK_TELEMETRY_LIMITS.callBytes));
    expect(kill.mock.calls.filter(([pid]) => pid === 2147483647).length).toBeGreaterThanOrEqual(2);
    expect(await readdir(dir)).not.toContain('.admission-recovery');
  } finally { kill.mockRestore(); }
});

it('runs a fresh shutdown pass for calls completed after an in-flight directory scan', async () => {
  await recordedFallback();
  let began!: () => void;
  let release!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const send = vi.fn(async (_journal: StockJournal) => {
    if (send.mock.calls.length === 1) { began(); await blocked; }
    return 'uploaded' as const;
  });
  const collector = startStockTelemetryCollector({ dataDir: cwd, send });
  try {
    await started;
    const { recorder } = await recordedFallback();
    collector.dispose();
    const flushing = collector.flush();
    release();
    await flushing;
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0].header.callId).toBe(recorder.callId);
  } finally { release(); collector.dispose(); }
});
