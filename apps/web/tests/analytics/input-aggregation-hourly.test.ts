import { afterEach, expect, it, vi } from 'vitest';
import { InputAggregation, type InputTelemetryEvent } from '../../src/analytics/input-aggregation';

const start = Date.parse('2026-11-04T00:00:00Z');
const raw = (patch: Record<string, unknown> = {}) => ({
  event_schema_version: 4, metric_schema_version: 1, event_id: 'tail-1',
  device_id: 'device-1', app_session_id: 'session-1', client_type: 'desktop',
  capture_source: 'web/error-tracking', env: 'test', channel: 'development',
  app_version: '0.25.1', client_version: '0.25.1', platform: 'darwin', os_version: null, arch: 'arm64',
  occurred_at: new Date(Date.now()).toISOString(), reported_at: new Date(Date.now()).toISOString(),
  telemetry_capability: 'supported', area: 'settings', window_ms: 1000,
  input_attempt_count: 2, qualified_sample_count: 0, over_500ms_count: 0,
  max_input_to_presentation_ms: null, max_queue_delay_ms: null, sample_floor_ms: 16, ...patch,
});
const disk = () => {
  let value: unknown;
  return { read: async () => structuredClone(value),
    write: vi.fn(async (next: unknown) => { value = structuredClone(next); }), close: vi.fn() };
};
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('H01 restores a saved sub-30s source tail as one raw fact and both summaries, without new input', async () => {
  vi.useFakeTimers(); vi.setSystemTime(start);
  const store = disk(), send = vi.fn().mockResolvedValue(true);
  const first = new InputAggregation(send, store);
  await first.checkpointSource(raw(), false);
  await first.checkpointSource(raw({ input_attempt_count: 3 }), false);
  expect(send).not.toHaveBeenCalled();
  const restart = new InputAggregation(send, store); await restart.tick();
  const events = send.mock.calls.flatMap(([batch]) => batch);
  expect(events.filter(e => e.event === 'client_input_responsiveness')).toHaveLength(1);
  expect(events).toHaveLength(3);
  expect(events.every(e => e.properties.input_attempt_count === 3)).toBe(true);
  await new InputAggregation(send, store).tick();
  expect(send.mock.calls.flatMap(([batch]) => batch)).toHaveLength(3);
});

it('H02 sends raw immediately, retains completed 5/10m summaries until the real hour deadline', async () => {
  vi.useFakeTimers(); vi.setSystemTime(start);
  const send = vi.fn().mockResolvedValue(true), a = new InputAggregation(send, disk());
  await a.observe(raw()); await a.tick();
  expect(send.mock.calls.flatMap(([batch]) => batch).map(e => e.event)).toEqual(['client_input_responsiveness']);
  vi.setSystemTime(start + 3_599_999); await a.tick();
  expect(send).toHaveBeenCalledTimes(1);
  vi.setSystemTime(start + 3_600_000); await a.tick();
  const last: InputTelemetryEvent[] = send.mock.calls.at(-1)![0];
  expect(last.filter(e => e.event === 'client_input_responsiveness_summary').map(e => e.properties.period_ms)).toEqual([300_000, 600_000]);
});



it('H03 background durability does not block the caller and sends only after commit', async () => {
  vi.useFakeTimers(); vi.setSystemTime(start);
  const store = disk(), send = vi.fn().mockResolvedValue(true);
  let release!: () => void;
  const opening = new Promise<typeof store>(resolve => { release = () => resolve(store); });
  const a = new InputAggregation(send, opening);
  const saved = a.observe(raw());
  expect(send).not.toHaveBeenCalled(); expect(store.write).not.toHaveBeenCalled();
  release(); await saved; await a.tick();
  expect(send).toHaveBeenCalledTimes(1);
});

it('H04 shutdown saves an unfinished tail without waiting for a pending network request; restart recovers once', async () => {
  vi.useFakeTimers(); vi.setSystemTime(start);
  const store = disk(), send = vi.fn().mockResolvedValue(true);
  let acknowledge!: (ok: boolean) => void;
  send.mockImplementation(() => new Promise(resolve => { acknowledge = resolve; }));
  const a = new InputAggregation(send, store);
  await a.observe(raw()); await vi.advanceTimersByTimeAsync(0);
  await a.checkpointSource(raw({ event_id: 'tail-2' }), false);
  await a.prepareShutdown();
  expect(store.close).toHaveBeenCalledTimes(1);
  const saved = await store.read() as { rawPending: unknown[]; pending: unknown[] };
  expect(saved.rawPending).toHaveLength(2); expect(saved.pending).toHaveLength(2);
  acknowledge(false); send.mockResolvedValue(true);
  const restart = new InputAggregation(send, store); await restart.tick();
  const replay = send.mock.calls.at(-1)![0];
  expect(replay).toHaveLength(4);
  expect(replay.filter((e: InputTelemetryEvent) => e.event === 'client_input_responsiveness').map((e: InputTelemetryEvent) => e.properties)).toEqual(saved.rawPending);
  const count = send.mock.calls.length;
  await new InputAggregation(send, store).tick(); expect(send).toHaveBeenCalledTimes(count);
});

it('H05 mode change does not discard a finalized source admitted before the asynchronous save', async () => {
  vi.useFakeTimers(); vi.setSystemTime(start);
  const store = disk(), a = new InputAggregation(async () => false, store);
  const admitted = a.observe(raw());
  await a.setMode('paused'); await admitted;
  expect((await store.read() as { rawPending: unknown[] }).rawPending).toHaveLength(1);
});
