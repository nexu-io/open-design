// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const snapshots = vi.hoisted(() => new Map<string, unknown>());
const storageFailure = vi.hoisted(() => ({ next: false, afterCommit: false }));
vi.mock('../../src/analytics/input-aggregation-store', () => ({
  openInputAggregationStore: async (scope: string) => ({
    read: async () => snapshots.get(scope), write: async (next: unknown) => {
      if (storageFailure.next) { storageFailure.next = false; throw new Error('disk unavailable'); }
      snapshots.set(scope, JSON.parse(JSON.stringify(next)));
      if (storageFailure.afterCommit) { storageFailure.afterCommit = false; throw new Error('commit acknowledgement lost'); }
    }, close() {},
  }),
}));
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); snapshots.clear(); storageFailure.next = false; storageFailure.afterCommit = false; });
const input = { metric_schema_version: 1, telemetry_capability: 'supported', area: 'settings', window_ms: 30_000,
  input_attempt_count: 2, qualified_sample_count: 0, over_500ms_count: 0,
  max_input_to_presentation_ms: null, max_queue_delay_ms: null, sample_floor_ms: 16, content: 'private' };
const context = { apiKey: 'phc_local_poc_only', host: 'http://127.0.0.1:43190', distinctId: 'install', clientType: 'desktop' as const,
  osName: 'Mac OS X' as const, appVersion: '0.25.1', appSessionId: 'session', telemetryEnv: 'test', inputAggregation: { trial_id: 'input-01', revision: 'r1', mode: 'shadow' as const, host: 'http://127.0.0.1:43190', project_key: 'phc_local_poc_only' } };
function setup() {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(Date.parse('2026-11-04T00:00:00Z'));
  const fetch = vi.fn().mockImplementation(async () => new Response('{"status":1}', { status: 200 })); vi.stubGlobal('fetch', fetch);
  const events = () => fetch.mock.calls.flatMap(([, init]) => { const body = JSON.parse(init.body); return body.batch ?? [body]; }).filter(e => ['client_input_responsiveness', 'client_input_responsiveness_summary'].includes(e.event));
  return { fetch, events };
}
it('T07 online recovery retries raw while preserving the hourly summary deadline', async () => {
  const { fetch, events } = setup();
  const tracking = await import('../../src/analytics/error-tracking');
  tracking.setExceptionTrackingContext(context);
  try {
    tracking.reportSafetyEvent('client_input_responsiveness', input);
    tracking.reportSafetyEvent('client_input_responsiveness', { ...input, area: 'search' });
    await vi.advanceTimersByTimeAsync(600_000);
    const summaries = () => events().filter(e => e.event === 'client_input_responsiveness_summary');
    window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(0);
    expect(summaries()).toHaveLength(0);
    fetch.mockRejectedValueOnce(new Error('offline'));
    tracking.reportSafetyEvent('client_input_responsiveness', input);
    await vi.advanceTimersByTimeAsync(0);
    const failedRaw = events().at(-1)!;
    window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(5000);
    const retries = events().filter(e => e.properties.event_id === failedRaw.properties.event_id);
    expect(retries).toHaveLength(2); expect(retries[1]).toEqual(retries[0]);
    expect(summaries()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2_994_999);
    window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(0);
    expect(summaries()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    for (const period of [300_000, 600_000]) {
      expect(summaries().filter(e => e.properties.period_ms === period).reduce((n, e) => n + e.properties.input_attempt_count, 0)).toBe(6);
    }
  } finally { tracking.clearExceptionTrackingContext(); }
});
it('B08 the public entry retains raw facts and sends validated 5/10m summaries in hourly batches', async () => {
  const { fetch, events } = setup();
  const { reportSafetyEvent, setExceptionTrackingContext, clearExceptionTrackingContext } = await import('../../src/analytics/error-tracking');
  setExceptionTrackingContext(context);
  reportSafetyEvent('client_input_responsiveness', input);
  reportSafetyEvent('client_input_responsiveness', { ...input, area: 'search' });
  await vi.advanceTimersByTimeAsync(0);
  expect(events()).toHaveLength(2);
  expect(events().every(p => p.event === 'client_input_responsiveness' && p.properties.aggregation_page_id)).toBe(true);
  await vi.advanceTimersByTimeAsync(600_000); expect(events()).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(3_000_000);
  const summaries = events().filter(p => p.event === 'client_input_responsiveness_summary');
  expect(summaries).toHaveLength(4);
  expect(fetch.mock.calls.some(([, init]) => JSON.parse(init.body).batch?.length === 4)).toBe(true);
  for (const payload of events()) {
    expect(payload.properties).not.toHaveProperty('content');
    expect(payload.properties.$insert_id).toBe(payload.properties.event_id);
    expect(payload.timestamp).toBe(payload.properties.occurred_at);
  }
  clearExceptionTrackingContext();
});
it('T01 the real shared collector saves trusted sub-30s attempts, flushes on hide and recovers raw without new input', async () => {
  const { fetch, events } = setup();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now() - Date.parse('2026-11-04T00:00:00Z'));
  let visibility: DocumentVisibilityState = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  vi.stubGlobal('PerformanceObserver', class { static supportedEntryTypes = ['event']; observe() {} disconnect() {} });
  const tracking = await import('../../src/analytics/error-tracking'); tracking.setExceptionTrackingContext(context);
  const { installChatInteractionObserver } = await import('../../src/observability/chat-interaction');
  document.body.innerHTML = '<div class="modal-settings"><input></div>';
  let keydown!: (e: KeyboardEvent) => void;
  const add = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, fn, options) => { if (type === 'keydown') keydown = fn as typeof keydown; add(type, fn, options); });
  const stop = installChatInteractionObserver();
  await vi.advanceTimersByTimeAsync(1200);
  keydown({ target: document.querySelector('input'), isTrusted: true } as unknown as KeyboardEvent);
  keydown({ target: document.querySelector('input'), isTrusted: true } as unknown as KeyboardEvent);
  await vi.advanceTimersByTimeAsync(0);
  const tail = [...snapshots.values()][0] as { collecting: { event_id: string; input_attempt_count: number }[] };
  expect(tail.collecting[0]!.input_attempt_count).toBe(2); expect(fetch).not.toHaveBeenCalled();
  fetch.mockRejectedValue(new Error('offline')); visibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0); stop(); tracking.clearExceptionTrackingContext(); await vi.advanceTimersByTimeAsync(0);
  fetch.mockImplementation(async () => new Response('{"status":1}', { status: 200 })); tracking.setExceptionTrackingContext(context);
  await vi.advanceTimersByTimeAsync(0);
  const raw = events().filter(e => e.event === 'client_input_responsiveness');
  expect(new Set(raw.map(e => e.properties.event_id))).toEqual(new Set([tail.collecting[0]!.event_id]));
  expect(raw.every(e => e.properties.input_attempt_count === 2)).toBe(true);
  const summaries = events().filter(e => e.event === 'client_input_responsiveness_summary');
  expect(new Set(summaries.map(e => e.properties.event_id)).size).toBe(2);
  for (const summary of summaries) expect(summaries.filter(e => e.properties.event_id === summary.properties.event_id).every(e => JSON.stringify(e) === JSON.stringify(summary))).toBe(true);
  const accepted = new Map(events().map(e => [e.properties.event_id, JSON.stringify(e)]));
  tracking.clearExceptionTrackingContext(); await vi.advanceTimersByTimeAsync(0); tracking.setExceptionTrackingContext(context); await vi.advanceTimersByTimeAsync(10_000);
  for (const event of events()) expect(JSON.stringify(event)).toBe(accepted.get(event.properties.event_id));
  expect(new Set(events().map(e => e.properties.event_id)).size).toBe(accepted.size); tracking.clearExceptionTrackingContext();
});

it('T02 preserves the installation-identity hold when the first identity arrives mid-input-window', async () => {
  const { events } = setup();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now() - Date.parse('2026-11-04T00:00:00Z'));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('PerformanceObserver', class { static supportedEntryTypes = ['event']; observe() {} disconnect() {} });
  const tracking = await import('../../src/analytics/error-tracking');
  tracking.setExceptionTrackingContext({ ...context, distinctId: 'bootstrap', identityPending: true });
  const { installChatInteractionObserver } = await import('../../src/observability/chat-interaction');
  document.body.innerHTML = '<div class="modal-settings"><input></div>';
  let keydown!: (e: KeyboardEvent) => void;
  const add = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, fn, options) => { if (type === 'keydown') keydown = fn as typeof keydown; add(type, fn, options); });
  const stop = installChatInteractionObserver();
  keydown({ target: document.querySelector('input'), isTrusted: true } as unknown as KeyboardEvent);
  await vi.advanceTimersByTimeAsync(0); expect(events()).toHaveLength(0);
  tracking.patchExceptionTrackingDistinctId('install'); await vi.advanceTimersByTimeAsync(0);
  stop(); await vi.advanceTimersByTimeAsync(0);
  const raw = events().filter(e => e.event === 'client_input_responsiveness');
  expect(raw).toHaveLength(1); expect(raw[0].properties.device_id).toBe('install');
  expect(raw[0].properties.input_attempt_count).toBe(1);
  tracking.clearExceptionTrackingContext();
});

it('T03 retains a committed prefix and avoids a second fallback fact after a disk-write failure', async () => {
  const { events } = setup();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now() - Date.parse('2026-11-04T00:00:00Z'));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('PerformanceObserver', class { static supportedEntryTypes = ['event']; observe() {} disconnect() {} });
  const tracking = await import('../../src/analytics/error-tracking'); tracking.setExceptionTrackingContext(context);
  const { installChatInteractionObserver } = await import('../../src/observability/chat-interaction');
  document.body.innerHTML = '<div class="modal-settings"><input></div>';
  let keydown!: (e: KeyboardEvent) => void;
  const add = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, fn, options) => { if (type === 'keydown') keydown = fn as typeof keydown; add(type, fn, options); });
  const stop = installChatInteractionObserver();
  const key = () => keydown({ target: document.querySelector('input'), isTrusted: true } as unknown as KeyboardEvent);
  key(); key(); await vi.advanceTimersByTimeAsync(0);
  storageFailure.next = true; key(); await vi.advanceTimersByTimeAsync(30_000);
  stop(); tracking.clearExceptionTrackingContext(); await vi.advanceTimersByTimeAsync(0);
  tracking.setExceptionTrackingContext(context); await vi.advanceTimersByTimeAsync(0);
  const raw = events().filter(e => e.event === 'client_input_responsiveness');
  expect(raw).toHaveLength(1); expect(raw[0].properties.input_attempt_count).toBe(2);
  expect(new Set(raw.map(e => e.properties.event_id)).size).toBe(1);
  tracking.clearExceptionTrackingContext();
});

it('T04 shadow storage failure falls back to original raw without waiting for summaries', async () => {
  const { fetch, events } = setup();
  fetch.mockImplementation(async () => new Response('{"status":1}', { status: 200 }));
  const tracking = await import('../../src/analytics/error-tracking');
  const trial = { trial_id: 'input-01', revision: 'r1', mode: 'shadow' as const, host: context.host, project_key: 'phc_local_poc_only' };
  tracking.setExceptionTrackingContext({ ...context, apiKey: trial.project_key, inputAggregation: trial });
  storageFailure.next = true;
  tracking.reportSafetyEvent('client_input_responsiveness', input);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]![0]).toBe(context.host + '/i/v0/e/');
  tracking.reportSafetyEvent('client_input_responsiveness', { ...input, area: 'search' });
  await vi.advanceTimersByTimeAsync(0);
  expect(events().filter(e => e.event === 'client_input_responsiveness')).toHaveLength(2);
  expect(events().filter(e => e.event === 'client_input_responsiveness_summary')).toHaveLength(0);
  expect(events().filter(e => e.event === 'client_input_responsiveness').every(e => e.properties.input_trial_id === trial.trial_id)).toBe(true);
  tracking.clearExceptionTrackingContext(); await vi.advanceTimersByTimeAsync(0);
});

it('T05 pause and drain keep original events flowing, stop new aggregation and clear old pending facts', async () => {
  const { fetch, events } = setup();
  fetch.mockImplementation(async () => new Response('{"status":1}', { status: 200 }));
  const tracking = await import('../../src/analytics/error-tracking');
  const trial = { trial_id: 'input-01', revision: 'r1', mode: 'shadow' as const, host: context.host, project_key: 'phc_local_poc_only' };
  tracking.setExceptionTrackingContext({ ...context, apiKey: trial.project_key, inputAggregation: trial });
  tracking.reportSafetyEvent('client_input_responsiveness', input);
  await vi.advanceTimersByTimeAsync(0);
  tracking.patchInputAggregationTrial({ ...trial, mode: 'paused', revision: 'r2' });
  tracking.reportSafetyEvent('client_input_responsiveness', { ...input, area: 'search' });
  await vi.advanceTimersByTimeAsync(600_000);
  expect(events().filter(e => e.event === 'client_input_responsiveness')).toHaveLength(2);
  expect(events().filter(e => e.event === 'client_input_responsiveness_summary')).toHaveLength(0);
  tracking.patchInputAggregationTrial({ ...trial, mode: 'drain', revision: 'r3' });
  await vi.advanceTimersByTimeAsync(0);
  const summaries = events().filter(e => e.event === 'client_input_responsiveness_summary');
  expect(summaries).toHaveLength(2); expect(summaries.every(e => e.properties.area === 'settings' && e.properties.input_attempt_count === 2)).toBe(true);
  tracking.reportSafetyEvent('client_input_responsiveness', input); await vi.advanceTimersByTimeAsync(10_000);
  expect(events().filter(e => e.event === 'client_input_responsiveness')).toHaveLength(3);
  expect(events().filter(e => e.event === 'client_input_responsiveness_summary')).toHaveLength(2);
  const status = events().filter(e => e.event === 'client_input_aggregation_status');
  expect(status.length).toBeLessThanOrEqual(2);
  tracking.clearExceptionTrackingContext(); await vi.advanceTimersByTimeAsync(0);
});


it('T06 an ambiguous storage acknowledgement keeps fallback and recovered raw the same UUID and body', async () => {
  const { fetch, events } = setup();
  fetch.mockImplementation(async () => new Response('{"status":1}', { status: 200 }));
  const tracking = await import('../../src/analytics/error-tracking');
  const trial = { trial_id: 'input-01', revision: 'r1', mode: 'shadow' as const, host: context.host, project_key: 'phc_local_poc_only' };
  const ctx = { ...context, apiKey: trial.project_key, inputAggregation: trial };
  tracking.setExceptionTrackingContext(ctx); await vi.advanceTimersByTimeAsync(0); storageFailure.afterCommit = true;
  tracking.reportSafetyEvent('client_input_responsiveness', input);
  await vi.advanceTimersByTimeAsync(0);
  tracking.clearExceptionTrackingContext(); await vi.advanceTimersByTimeAsync(0);
  tracking.setExceptionTrackingContext(ctx); await vi.advanceTimersByTimeAsync(0);
  const raws = events().filter(e => e.event === 'client_input_responsiveness').map(({ api_key, ...event }) => event);
  expect(raws).toHaveLength(2);
  expect(raws[0].uuid).toBe(raws[0].properties.event_id);
  expect(raws[0]).toEqual(raws[1]);
  tracking.clearExceptionTrackingContext(); await vi.advanceTimersByTimeAsync(0);
});

it('retired build flags do not enable collection without a runtime trial', async () => {
  const { events } = setup();
  vi.stubEnv('NEXT_PUBLIC_OD_INPUT_AGGREGATION_POC', '1');
  vi.stubEnv('NEXT_PUBLIC_OD_INPUT_QA_BUNDLE', 'local-only');
  const tracking = await import('../../src/analytics/error-tracking');
  tracking.setExceptionTrackingContext({ ...context, inputAggregation: undefined });
  tracking.reportSafetyEvent('client_input_responsiveness', input);
  await vi.advanceTimersByTimeAsync(3_600_000);
  expect(events()).toHaveLength(1);
  expect(events()[0].event).toBe('client_input_responsiveness');
  expect(snapshots.size).toBe(0);
  tracking.clearExceptionTrackingContext();
});
