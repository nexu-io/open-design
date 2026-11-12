import { afterEach, expect, it, vi } from 'vitest';
import { inputAggregationSender } from '../../src/analytics/input-aggregation-transport';
import { InputAggregation, type InputTelemetryEvent } from '../../src/analytics/input-aggregation';
import { migrateInputAggregationStore } from '../../src/analytics/input-aggregation-store';

const raw = () => ({ event_schema_version: 4, metric_schema_version: 1, event_id: crypto.randomUUID(),
  device_id: 'device', app_session_id: 'session', client_type: 'desktop', capture_source: 'web/error-tracking',
  env: 'test', channel: 'development', app_version: '0.25.1', client_version: '0.25.1', platform: null, os_version: null, arch: null,
  occurred_at: new Date().toISOString(), reported_at: new Date().toISOString(), telemetry_capability: 'supported',
  area: 'settings', window_ms: 1000, input_attempt_count: 3, qualified_sample_count: 0, over_500ms_count: 0,
  max_input_to_presentation_ms: null, max_queue_delay_ms: null, sample_floor_ms: 16 });
function disk(initial?: unknown) {
  let value = structuredClone(initial);
  return { read: vi.fn(async () => structuredClone(value)), write: vi.fn(async (v: unknown) => { value = structuredClone(v); }),
    close: vi.fn(), remove: vi.fn(async () => { value = undefined; }) };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('does not accept quota, invalid JSON, negative status, HTTP failures or ambiguous receipts', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const sender = inputAggregationSender('https://us.i.posthog.com', 'phc_example');
  const event = { event: 'client_input_responsiveness', properties: raw() } as InputTelemetryEvent;
  for (const [status, body] of [[200, '{"status":1,"quota_limited":["events"]}'], [200, ''], [200, '{'],
    [200, '{"status":0}'], [200, '{"status":1,"errors":["partial"]}'], [500, '{"status":1}'], [429, '{}']] as const) {
    fetch.mockResolvedValueOnce(new Response(body, { status }));
    expect(await sender([event])).toBe(false);
  }
  fetch.mockResolvedValue(new Response('{"status":1,"quota_limited":[]}', { status: 200 }));
  expect(await sender([event])).toBe(true);
  const payloads = fetch.mock.calls.map(([, init]) => JSON.parse(init.body));
  expect(payloads.every(p => p.batch[0].uuid === event.properties.event_id && p.batch[0].timestamp === event.properties.occurred_at)).toBe(true);
  expect(new Set(payloads.map(p => JSON.stringify(p))).size).toBe(1);
  expect(fetch.mock.calls[0]![1].redirect).toBe('error');
  fetch.mockResolvedValueOnce(new Response('{"status":"Ok"}', { status: 200 }));
  expect(await sender([event])).toBe(true);
});

it('honors Retry-After without sending early or rewriting event identity', async () => {
  vi.useFakeTimers(); vi.setSystemTime(Date.parse('2026-11-05T00:00:00Z'));
  const fetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '120' } }))
    .mockResolvedValue(new Response('{"status":1}', { status: 200 })); vi.stubGlobal('fetch', fetch);
  const sender = inputAggregationSender('https://us.i.posthog.com', 'phc_example');
  const events = [{ event: 'client_input_responsiveness', properties: raw() }] as InputTelemetryEvent[];
  expect(await sender(events)).toBe(false);
  vi.setSystemTime(Date.now() + 119999); expect(await sender(events)).toBe(false); expect(fetch).toHaveBeenCalledTimes(1);
  vi.setSystemTime(Date.now() + 1); expect(await sender(events)).toBe(true); expect(fetch).toHaveBeenCalledTimes(2);
});

it('keeps new shadow raw facts out of the outbox and drains saved summaries after collection stops', async () => {
  vi.useFakeTimers(); vi.setSystemTime(Date.parse('2026-11-05T00:00:00Z'));
  const store = disk(), send = vi.fn().mockResolvedValue(false);
  const engine = new InputAggregation(send, store, { rawPassthrough: true });
  await engine.observe(raw()); await engine.flush('hidden');
  expect((await store.read() as { rawPending: unknown[] }).rawPending).toEqual([]);
  expect(engine.pendingCount).toBe(2);
  expect(send.mock.calls.flatMap(([b]) => b).every(e => e.event === 'client_input_responsiveness_summary')).toBe(true);
  const before = send.mock.calls.length; await engine.tick(); expect(send).toHaveBeenCalledTimes(before);
  await engine.setMode('paused'); await engine.tick(); expect(send).toHaveBeenCalledTimes(before);
  send.mockResolvedValue(true); vi.setSystemTime(Date.now() + 5000); await engine.setMode('drain');
  expect(engine.pendingCount).toBe(0); expect(await engine.observe(raw())).toBeNull();
  await engine.close();
  const restarted = new InputAggregation(send, store, { rawPassthrough: true, mode: 'drain' });
  await restarted.tick(); expect(engine.diagnostics().accepted_events).toBe(2); expect(send).toHaveBeenCalledTimes(before + 1);
  await restarted.close();
});

it('a paused restart retains all facts and does not send until explicitly drained', async () => {
  const store = disk(), send = vi.fn().mockResolvedValue(false);
  const first = new InputAggregation(send, store); await first.checkpointSource(raw(), false); await first.close();
  send.mockResolvedValue(true);
  const resumed = new InputAggregation(send, store, { mode: 'paused', rawPassthrough: true });
  await resumed.tick(); expect(send).not.toHaveBeenCalled();
  await resumed.setMode('drain');
  const events = send.mock.calls.flatMap(([b]) => b);
  expect(events.map(e => e.event).sort()).toEqual(['client_input_responsiveness', 'client_input_responsiveness_summary', 'client_input_responsiveness_summary']);
  await resumed.close();
});

it('migration retries a committed copy after interrupted source removal, without losing nested counters', async () => {
  const old = disk({ version: 2, collecting: [raw()], rawPending: [], completed: [], active: [], pending: [],
    identity: 'device', lastTime: 1, nextSendAt: 2, stopped: null });
  const target = disk(); old.remove.mockRejectedValueOnce(new Error('interrupted'));
  await expect(migrateInputAggregationStore(old, target)).rejects.toThrow('interrupted');
  expect(await old.read()).toEqual(await target.read());
  const copy = await target.read() as { collecting: { input_attempt_count: number }[] };
  copy.collecting[0]!.input_attempt_count++;
  await target.write(copy);
  await expect(migrateInputAggregationStore(old, target)).rejects.toThrow('conflicting');
  expect(await old.read()).toBeDefined();
  await target.write(await old.read()); await migrateInputAggregationStore(old, target);
  expect(await old.read()).toBeUndefined(); expect(target.write).toHaveBeenCalledTimes(3);
});

it('migration leaves the original untouched after a failed native write', async () => {
  const source = disk({ version: 2, pending: [{ input_attempt_count: 3 }] }), target = disk();
  target.write.mockRejectedValueOnce(new Error('disk full'));
  await expect(migrateInputAggregationStore(source, target)).rejects.toThrow('disk full');
  expect(source.remove).not.toHaveBeenCalled(); expect(await source.read()).toBeDefined();
});

it('uses the same immutable event envelope for original single capture and batch replay', async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response('{"status":"Ok"}')); vi.stubGlobal('fetch', fetch);
  const events = [{ event: 'client_input_responsiveness', properties: raw() }] as InputTelemetryEvent[];
  expect(await inputAggregationSender('https://us.i.posthog.com', 'phc_example', true)(events)).toBe(true);
  expect(await inputAggregationSender('https://us.i.posthog.com', 'phc_example')(events)).toBe(true);
  const original = JSON.parse(fetch.mock.calls[0]![1].body), batch = JSON.parse(fetch.mock.calls[1]![1].body);
  delete original.api_key;
  expect(original).toEqual(batch.batch[0]);
  expect(fetch.mock.calls[0]![0]).toBe('https://us.i.posthog.com/i/v0/e/');
});
