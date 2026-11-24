import { afterEach, expect, it, vi } from 'vitest';
import { InputAggregation, type InputTelemetryEvent } from '../../src/analytics/input-aggregation';
const start = Date.parse('2026-11-04T00:00:00Z');
const raw = (patch: Record<string, unknown> = {}) => ({
  event_schema_version: 4, metric_schema_version: 1, event_id: 'raw-1',
  device_id: 'device-1', app_session_id: 'session-1', client_type: 'desktop',
  capture_source: 'web/error-tracking', env: 'test', channel: 'development',
  app_version: '0.25.1', client_version: '0.25.1', platform: 'darwin', os_version: null, arch: 'arm64',
  occurred_at: new Date(Date.now()).toISOString(), reported_at: new Date(Date.now()).toISOString(),
  telemetry_capability: 'supported', area: 'settings', window_ms: 30_000,
  input_attempt_count: 3, qualified_sample_count: 2, over_500ms_count: 1,
  max_input_to_presentation_ms: 600, max_queue_delay_ms: 20, sample_floor_ms: 16, ...patch,
});
const disk = () => {
  let value: unknown;
  return { read: async () => structuredClone(value), write: vi.fn(async (next: unknown) => { value = structuredClone(next); }), close: vi.fn() };
};
const setup = () => {
  vi.useFakeTimers(); vi.setSystemTime(start);
  const store = disk(), send = vi.fn<(events: InputTelemetryEvent[]) => Promise<boolean>>().mockResolvedValue(true);
  const a = new InputAggregation(send, store);
  const events = () => send.mock.calls.flatMap(([batch]) => batch);
  const summaries = () => events().filter(e => e.event === 'client_input_responsiveness_summary').map(e => e.properties);
  return { a, store, send, events, summaries };
};
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it('B01 sums counts and takes maxima separately for each area and real period; raw facts remain separate', async () => {
  const { a, events, summaries } = setup();
  await a.observe(raw());
  vi.setSystemTime(start + 60_000);
  await a.observe(raw({ event_id: 'raw-2', max_input_to_presentation_ms: 700, max_queue_delay_ms: null }));
  await a.observe(raw({ event_id: 'raw-3', area: 'search' }));
  vi.setSystemTime(start + 600_000); await a.tick(); expect(summaries()).toHaveLength(0);
  vi.setSystemTime(start + 3_600_000); await a.tick();
  expect(events().filter(e => e.event === 'client_input_responsiveness')).toHaveLength(3);
  expect(summaries()).toHaveLength(4);
  for (const s of summaries().filter(s => s.area === 'settings')) expect(s).toMatchObject({ source_event_count: 2,
    input_attempt_count: 6, qualified_sample_count: 4, over_500ms_count: 2, max_input_to_presentation_ms: 700,
    max_queue_delay_ms: 20, source_window_ms: 60_000 });
});
it('B02 keeps different identities and versions out of the same summary', async () => {
  const { a, summaries } = setup();
  await a.observe(raw()); await a.observe(raw({ event_id: 'raw-2', device_id: 'device-2', app_version: '0.25.2', client_version: '0.25.2' }));
  await a.flush('identity_change');
  expect(summaries().map(s => [s.device_id, s.source_event_count])).toEqual([
    ['device-1', 1], ['device-1', 1], ['device-2', 1], ['device-2', 1],
  ]);
});
it('B03 retries immutable raw and summary IDs/bodies after failure and restart', async () => {
  const { a, store, send } = setup(); send.mockResolvedValue(false);
  await a.observe(raw()); await a.flush('pagehide');
  const failed = structuredClone(send.mock.calls.at(-1)![0]);
  send.mockResolvedValue(true); await new InputAggregation(send, store).tick();
  expect(send.mock.calls.at(-1)![0]).toEqual(failed);
  const count = send.mock.calls.length; await new InputAggregation(send, store).tick(); expect(send).toHaveBeenCalledTimes(count);
});
it('B04 preserves null maxima, emits a partial window once and emits no empty windows', async () => {
  const { a, events, summaries } = setup();
  await a.observe(raw({ qualified_sample_count: 0, over_500ms_count: 0, max_input_to_presentation_ms: null, max_queue_delay_ms: null }));
  await a.flush('pagehide'); await a.flush('pagehide');
  expect(events()).toHaveLength(3); expect(summaries().every(s => s.max_input_to_presentation_ms === null && s.source_event_count === 1)).toBe(true);
});
it('B05 projects private fields and rejects invalid, unsupported and untargeted sources', async () => {
  const { a, events } = setup();
  for (const patch of [{ area: 'composer' }, { input_attempt_count: -1 }, { telemetry_capability: 'unsupported' }]) expect(await a.observe(raw(patch))).toBeNull();
  await a.observe(raw({ content: 'private' })); await a.flush('pagehide');
  expect(events().every(e => !('content' in e.properties))).toBe(true);
});
it('B06 clock rollback stops new shadow collection and keeps previously committed facts recoverable', async () => {
  const { a, store, send } = setup(); await a.observe(raw()); await a.tick();
  vi.setSystemTime(start - 1); await a.tick(); expect(a.stopped).toBe('clock_rollback');
  await new InputAggregation(send, store).tick();
  expect(await a.observe(raw({ event_id: 'raw-2' }))).toBeNull();
});
it('D01 restores raw facts and both active summary periods without another user input', async () => {
  const { a, store, send, summaries } = setup(); send.mockResolvedValue(false);
  const tagged = await a.observe(raw()); await a.tick(); send.mockResolvedValue(true);
  await new InputAggregation(send, store).tick();
  expect(summaries()).toHaveLength(2);
  expect(summaries().every(s => s.aggregation_page_id === tagged?.aggregation_page_id && s.source_event_count === 1)).toBe(true);
});
it('D02 an acknowledgement lost after receipt retries one logical fact without reaggregation', async () => {
  const { a, store, send, summaries } = setup();
  const received = new Map<string, string>(); let loseAck = true;
  send.mockImplementation(async batch => {
    for (const e of batch) { const before = received.get(e.properties.event_id); if (before) expect(JSON.stringify(e)).toBe(before); received.set(e.properties.event_id, JSON.stringify(e)); }
    if (loseAck) { loseAck = false; return false; } return true;
  });
  await a.observe(raw()); await a.tick(); await new InputAggregation(send, store).tick();
  expect(received.size).toBe(3); expect(summaries().every(s => s.source_event_count === 1)).toBe(true);
});
it('D03 failed storage does not acknowledge a new fact or overwrite the previous durable state', async () => {
  const { a, store, send, summaries } = setup(); await a.observe(raw()); await a.tick();
  store.write.mockRejectedValueOnce(new DOMException('quota', 'QuotaExceededError'));
  expect(await a.observe(raw({ event_id: 'raw-2' }))).toBeNull(); expect(a.stopped).toBe('storage_error');
  await new InputAggregation(send, store).tick(); expect(summaries().every(s => s.source_event_count === 1)).toBe(true);
});
it('D04 a pending network response does not block saving a newly observed tail', async () => {
  const { a, store, send } = setup(); let acknowledge!: (ok: boolean) => void;
  send.mockImplementation(() => new Promise(resolve => { acknowledge = resolve; }));
  await a.observe(raw()); await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  await a.checkpointSource(raw({ event_id: 'raw-2', window_ms: 5000 }), false);
  expect((await store.read() as { collecting: unknown[] }).collecting).toHaveLength(1);
  acknowledge(false); send.mockResolvedValue(true); await a.tick();
  await new InputAggregation(send, store).tick();
  const unique = new Map(send.mock.calls.flatMap(([b]) => b).map(e => [e.properties.event_id, e]));
  expect([...unique.values()].filter(e => e.event === 'client_input_responsiveness')).toHaveLength(2);
});
it('D05 corrupt snapshots are not sent or automatically cleared', async () => {
  const { store, send } = setup(); await store.write({ version: 999, pending: ['private'] });
  const a = new InputAggregation(send, store); await a.tick();
  expect(a.stopped).toBe('storage_error'); expect(send).not.toHaveBeenCalled(); expect(store.write).toHaveBeenCalledTimes(1);
});
it('D06 failure while saving acknowledged removal retains the original immutable outbox', async () => {
  const { a, store, send } = setup(); let fail = true;
  send.mockImplementation(async () => { if (fail) { fail = false; store.write.mockRejectedValueOnce(new Error('disk unavailable')); } return true; });
  await a.observe(raw()); await a.tick(); expect(a.stopped).toBe('storage_error');
  const original = structuredClone(send.mock.calls[0]![0][0]);
  await new InputAggregation(send, store).tick();
  expect(send.mock.calls[1]![0][0]).toEqual(original);
});
it('D07 migrates the earlier summary-only snapshot without inventing unavailable raw records', async () => {
  const { a, store, send } = setup(); await a.observe(raw()); await a.tick();
  const s = await store.read() as Record<string, unknown>;
  await store.write({ version: 1, active: s.active, pending: s.pending, identity: s.identity, lastTime: s.lastTime, stopped: null });
  send.mockClear(); await new InputAggregation(send, store).tick();
  expect(send.mock.calls.flatMap(([b]) => b).map(e => e.event)).toEqual(['client_input_responsiveness_summary', 'client_input_responsiveness_summary']);
});
it('D08 cumulative checkpoints and repeated finalization create one immutable source fact', async () => {
  const { a, events, summaries } = setup();
  await a.checkpointSource(raw({ input_attempt_count: 1 }), false);
  await a.checkpointSource(raw({ input_attempt_count: 2 }), false);
  await a.observe(raw()); await a.observe(raw()); await a.flush('pagehide');
  expect(events().filter(e => e.event === 'client_input_responsiveness')).toHaveLength(1);
  expect(summaries().every(s => s.input_attempt_count === 3 && s.source_event_count === 1)).toBe(true);
});
it('D09 rejects stale cumulative counters and recovers the last committed tail', async () => {
  const { a, store, send } = setup();
  await a.checkpointSource(raw({ input_attempt_count: 5 }), false);
  expect(await a.checkpointSource(raw({ input_attempt_count: 4 }), false)).toBeNull();
  expect(a.stopped).toBe('invalid_source');
  await new InputAggregation(send, store).tick();
  expect(send.mock.calls.flatMap(([b]) => b).every(e => e.properties.input_attempt_count === 5)).toBe(true);
});
it('H03 splits a large hourly summary queue by serialized bytes while preserving every event', async () => {
  const { a, send, summaries } = setup();
  for (let i = 0; i < 40; i++) await a.observe(raw({ event_id: `raw-${i}`, app_session_id: `session-${i}` }));
  await a.tick(); expect(summaries()).toHaveLength(0);
  vi.setSystemTime(start + 3_600_000); await a.tick();
  expect(summaries()).toHaveLength(80);
  const summaryBatches = send.mock.calls.map(([b]) => b).filter(b => b.some(e => e.event === 'client_input_responsiveness_summary'));
  expect(summaryBatches.length).toBeGreaterThan(1);
  expect(summaryBatches.every(b => new TextEncoder().encode(JSON.stringify(b)).length <= 24 * 1024)).toBe(true);
  expect(new Set(summaries().map(s => s.event_id)).size).toBe(80);
});
it('H04 retains over two offline hours of both areas and periods instead of hitting the old 64-summary limit', async () => {
  const { a, store, send } = setup(); send.mockResolvedValue(false);
  for (let i = 0; i < 26; i++) {
    vi.setSystemTime(start + i * 300_000);
    for (const area of ['settings', 'search']) await a.observe(raw({ event_id: `${area}-${i}`, area }));
    await a.tick();
  }
  expect(a.stopped).toBeNull(); const s = await store.read() as { pending: unknown[]; rawPending: unknown[] };
  expect(s.pending.length).toBeGreaterThan(64); expect(s.rawPending).toHaveLength(52);
  send.mockResolvedValue(true); await new InputAggregation(send, store).tick();
  const delivered = await store.read() as { pending: unknown[]; rawPending: unknown[] };
  expect(delivered.pending).toHaveLength(0); expect(delivered.rawPending).toHaveLength(0);
});
it('H05 bounds a prolonged offline raw outbox without deleting already committed facts', async () => {
  const { a, send } = setup(); send.mockResolvedValue(false);
  for (let i = 0; i < 1025; i++) await a.observe(raw({ event_id: `raw-${i}` }));
  expect(a.stopped).toBe('queue_limit');
});
