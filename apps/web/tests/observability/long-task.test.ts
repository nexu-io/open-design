// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installLongTaskObserver } from '../../src/observability/long-task';
import { clearExceptionTrackingContext, setExceptionTrackingContext } from '../../src/analytics/error-tracking';

let callback: PerformanceObserverCallback;
const observe = vi.fn();
let stop: (() => void) | undefined;
const fetchMock = vi.fn();
class Observer {
  static supportedEntryTypes = ['longtask'];
  constructor(cb: PerformanceObserverCallback) { callback = cb; }
  observe = observe;
  disconnect() {}
}
const events = (name: string) => fetchMock.mock.calls
  .map((call) => JSON.parse(call[1].body as string))
  .filter((item) => item.event === name).map((item) => item.properties);
function emit(...durations: number[]) {
  callback({ getEntries: () => durations.map((duration) => ({ duration, startTime: performance.now() })) } as PerformanceObserverEntryList, {} as PerformanceObserver);
}
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('PerformanceObserver', Observer);
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now() - 1_700_000_000_000);
  vi.setSystemTime(1_700_000_000_000);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('fetch', fetchMock.mockReset().mockResolvedValue(new Response('')));
  observe.mockReset(); Observer.supportedEntryTypes = ['longtask'];
  localStorage.clear();
  setExceptionTrackingContext({ apiKey: 'phc_test', host: 'https://example.test', distinctId: 'install-test', clientType: 'web', osName: 'Mac OS X' });
});
afterEach(() => { stop?.(); stop = undefined; clearExceptionTrackingContext(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('long task responsiveness', () => {
  it('starts without a metrics grant and reports through product analytics opt-out', async () => {
    const { applyConsent } = await import('../../src/analytics/client');
    applyConsent(false);
    stop = installLongTaskObserver();
    expect(observe).toHaveBeenCalledWith({ type: 'longtask' });
    emit(5_000);
    vi.advanceTimersByTime(30_000);
    expect(events('client_long_task')).toHaveLength(1);
    expect(events('client_responsiveness_window')).toHaveLength(1);
  });
  it('aggregates small tasks but preserves every >=5s event without URL/name attribution', () => { stop = installLongTaskObserver();
    emit(...Array(100).fill(100), 4_999);
    expect(events('client_long_task')).toHaveLength(0);
    emit(5_000, 6_000);
    expect(events('client_long_task').map((e) => e.duration_ms)).toEqual([5_000, 6_000]);
    expect(events('client_long_task')[0]).not.toHaveProperty('container_src_origin');
    vi.advanceTimersByTime(30_000);
    expect(events('client_responsiveness_window')[0]).toMatchObject({ measurable: true, window_ms: 30_000, long_task_count: 103, severe_task_count: 2, max_duration_ms: 6_000 });
  });
  it('reports clean supported windows as the denominator; unsupported windows have null counts', () => {
    Observer.supportedEntryTypes = []; stop = installLongTaskObserver();
    vi.advanceTimersByTime(30_000);
    expect(events('client_responsiveness_window')[0]).toMatchObject({ telemetry_capability: 'unsupported', measurable: false, long_task_count: null });
  });
  it('excludes any window interrupted by backgrounding, including hide and reveal between ticks', () => { stop = installLongTaskObserver(); emit(100);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(30_000);
    expect(events('client_responsiveness_window')[0]).toMatchObject({ measurable: false, long_task_count: null });
    vi.advanceTimersByTime(30_000);
    expect(events('client_responsiveness_window')[1]).toMatchObject({ measurable: true, long_task_count: 0 });
  });
  it('does not manufacture a 5-second block from an unclean-exit marker', () => {
    localStorage.setItem('open-design:responsiveness-recovery-v1', JSON.stringify({ id: 'old-session', at: '2026-10-18T00:00:00.000Z', duration: null, count: 0 })); stop = installLongTaskObserver();
    expect(events('client_responsiveness_recovery')[0]).toMatchObject({ recovery_id: 'old-session', duration_ms: null, reason: 'unclean_exit_unknown' });
    expect(events('client_long_task')).toHaveLength(0);
  });
  it('recovers a bounded checkpoint of an observed severe block on next start', () => { stop = installLongTaskObserver(); emit(5_500);
    const saved = localStorage.getItem('open-design:responsiveness-recovery-v1')!;
    stop(); stop = undefined; fetchMock.mockClear(); localStorage.setItem('open-design:responsiveness-recovery-v1', saved);
    stop = installLongTaskObserver();
    expect(events('client_responsiveness_recovery')[0]).toMatchObject({ reason: 'observed_severe_task', duration_ms: 5_500, severe_task_count: 1 });
  });
  it('retains an observed severe checkpoint on page exit after product analytics opt-out', async () => {
    const { applyConsent } = await import('../../src/analytics/client');
    applyConsent(false); stop = installLongTaskObserver(); emit(5_500);
    window.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(localStorage.getItem('open-design:responsiveness-recovery-v1')!).duration).toBe(5_500);
    expect(JSON.parse(localStorage.getItem('open-design:responsiveness-recovery-v1')!).duration).toBe(5_500);
  });
  it('excludes wall-clock sleep even if the monotonic clock pauses', () => { stop = installLongTaskObserver();
    vi.spyOn(performance, 'now').mockReturnValue(1);
    vi.advanceTimersByTime(30_000);
    expect(events('client_responsiveness_window')[0]).toMatchObject({ measurable: false, window_ms: null });
  });
});
