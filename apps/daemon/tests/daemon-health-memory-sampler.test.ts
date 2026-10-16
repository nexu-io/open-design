import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createDaemonHealth, type DaemonHealthEventSink, type HeapSample } from '../src/services/daemon-health.js';

// Keep real GC callbacks out of the fake-time sample/read accounting.
vi.mock('node:perf_hooks', async (original) => ({
  ...await original<typeof import('node:perf_hooks')>(),
  PerformanceObserver: class {
    observe() {}
    disconnect() {}
  },
}));

const roots: string[] = [];
const sessions: ReturnType<typeof createDaemonHealth>[] = [];
const readHeap = (): HeapSample => ({ at: Date.now(), heapUsed: 10, heapLimit: 1000, totalAvailable: 990, largeObject: 0, oldSpace: 10, external: 5, arrayBuffers: 0, malloced: 0, rss: 100 });
function start(extra = {}) {
  const dataRoot = mkdtempSync(join(tmpdir(), 'od-cs04-')); roots.push(dataRoot);
  const health = createDaemonHealth({ dataRoot, readHeap, memorySampling: { app_session_id: 'desktop-session', environment: 'test', app_version: '1.0', platform: 'linux', arch: 'x64', os_version: 'test-os' }, sampleIntervalMs: 60_000, ...extra });
  sessions.push(health); return health;
}
afterEach(() => { sessions.splice(0).forEach((health) => health.stop()); roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })); vi.useRealTimers(); });

it('reuses the heap read to emit daemon curve points for >2h, then stops all sampling', async () => {
  vi.useFakeTimers();
  const read = vi.fn(readHeap);
  const health = start({ readHeap: read });
  const events: Parameters<DaemonHealthEventSink>[0][] = [];
  health.attachSink(async (event) => { events.push(event); });
  await vi.advanceTimersByTimeAsync(121 * 60_000);
  const points = events.filter((event) => event.eventName === 'client_process_memory_sample');
  expect(points).toHaveLength(121);
  expect(read).toHaveBeenCalledTimes(122);
  expect(points[0]!.properties).toMatchObject({ process_role: 'daemon', app_session_id: 'desktop-session', rss_bytes: 100, heap_used_bytes: 10, external_bytes: 5, sampling_interval_ms: 60_000, app_version: '1.0' });
  expect(points.at(-1)!.properties.uptime_ms).toBe(121 * 60_000);
  expect(new Set(points.map((event) => event.insertId)).size).toBe(121);
  expect(new Set(points.map((event) => event.properties.process_instance_id)).size).toBe(1);
  health.stop(); health.stop(); health.sampleNow();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(read).toHaveBeenCalledTimes(122);
});

it('survives failed reads and rejected sinks and recovers at the next interval', async () => {
  vi.useFakeTimers();
  const read = vi.fn(readHeap);
  const health = start({ readHeap: read, sampleIntervalMs: 1000 });
  const sink = vi.fn(async () => { throw new Error('offline'); });
  health.attachSink(sink);
  read.mockImplementationOnce(() => { throw new Error('unavailable'); });
  await vi.advanceTimersByTimeAsync(1000);
  expect(sink).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2000);
  expect(sink).toHaveBeenCalledTimes(2);
});

it('does not retain memory samples behind an unresolved sink', async () => {
  vi.useFakeTimers();
  const health = start({ sampleIntervalMs: 1000 });
  const sink = vi.fn(() => new Promise<void>(() => {}));
  health.attachSink(sink);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(sink).toHaveBeenCalledTimes(1);
});

it('uses a new process identity after restart and emits null for unavailable metrics', async () => {
  vi.useFakeTimers();
  const first = start({ instrumentProcess: false, pid: 111 });
  const events: Parameters<DaemonHealthEventSink>[0][] = [];
  const sink: DaemonHealthEventSink = async (event) => {
    if (event.eventName === 'client_process_memory_sample') events.push(event);
  };
  first.attachSink(sink);
  first.sampleNow();
  await vi.advanceTimersByTimeAsync(0);
  // Simulate abnormal termination: stop instrumentation without marking clean.
  first.stop();
  const second = start({
    dataRoot: roots[0],
    pid: 222,
    isProcessAlive: () => false,
    instrumentProcess: false,
    readHeap: () => ({ ...readHeap(), rss: NaN, heapUsed: Infinity, external: -1 }),
  });
  expect(second.snapshotForTests().pendingReports).toEqual(expect.arrayContaining([
    expect.objectContaining({ eventName: 'daemon_unclean_exit' }),
  ]));
  second.attachSink(sink);
  second.sampleNow();
  await vi.advanceTimersByTimeAsync(0);
  expect(events).toHaveLength(2);
  expect(events[0]!.properties.process_instance_id).not.toBe(events[1]!.properties.process_instance_id);
  expect(events[1]!.properties).toMatchObject({ rss_bytes: null, heap_used_bytes: null, external_bytes: null });
});

it('does not emit a queued point after stop or enable the new event without context', async () => {
  vi.useFakeTimers();
  const health = start({ instrumentProcess: false });
  const sink = vi.fn(async () => {});
  health.attachSink(sink);
  health.sampleNow();
  health.stop();
  await vi.advanceTimersByTimeAsync(0);
  expect(sink).not.toHaveBeenCalled();
  const disabled = start({ memorySampling: undefined, instrumentProcess: false });
  disabled.attachSink(sink);
  disabled.sampleNow();
  await vi.advanceTimersByTimeAsync(0);
  expect(sink).not.toHaveBeenCalled();
});

it('rejects intervals that Node would silently clamp to a hot loop', () => {
  for (const sampleIntervalMs of [0, -1, NaN, Infinity, 0.5, 2 ** 31]) {
    expect(() => start({ sampleIntervalMs })).toThrow(RangeError);
  }
});

it('the optional daemon producer also emits an admissible shared metric', async () => {
  const { buildClientTelemetryParams, parseClientMetricEvent } = await import('@open-design/contracts/analytics');
  vi.useFakeTimers();
  const health = start({ instrumentProcess: false });
  const events: Parameters<DaemonHealthEventSink>[0][] = [];
  health.attachSink(async event => { events.push(event); });
  health.sampleNow();
  await vi.advanceTimersByTimeAsync(0);
  const point = events.find(event => event.eventName === 'client_process_memory_sample')!;
  expect(point).toBeDefined();
  const common = buildClientTelemetryParams(point.properties, { eventId: point.insertId!, deviceId: 'install',
    clientType: 'daemon', captureSource: 'daemon/health', env: 'test', reportedAt: new Date().toISOString() });
  expect(parseClientMetricEvent(point.eventName, { ...point.properties, ...common })).not.toBeNull();
});
