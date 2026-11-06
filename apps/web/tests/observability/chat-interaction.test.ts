// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { installChatInteractionObserver, __resetChatInteractionForTest } from '../../src/observability/chat-interaction';
import { clearExceptionTrackingContext, setExceptionTrackingContext } from '../../src/analytics/error-tracking';
let callback: PerformanceObserverCallback;
let stop: () => void;
let keydown: (event: KeyboardEvent) => void;
const fetchMock = vi.fn();
const observe = vi.fn();
const named = (name: string) => fetchMock.mock.calls.map((c) => JSON.parse(c[1].body as string)).filter((e) => e.event === name).map((e) => e.properties);
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1_700_000_000_000);
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now() - 1_700_000_000_000);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('fetch', fetchMock.mockReset().mockResolvedValue(new Response('')));
  observe.mockReset();
  vi.stubGlobal('PerformanceObserver', class {
    static supportedEntryTypes = ['event'];
    constructor(cb: PerformanceObserverCallback) { callback = cb; }
    observe = observe;
    disconnect() {}
  });
  setExceptionTrackingContext({ apiKey: 'test', host: 'https://example.test', distinctId: 'test-install', clientType: 'web', osName: 'Mac OS X' });
  __resetChatInteractionForTest();
  document.body.innerHTML = '<div data-testid="chat-composer"><textarea></textarea></div><input type="search"><div class="modal-settings"><input></div><input type="password">';
  const add = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'keydown') keydown = listener as (event: KeyboardEvent) => void;
    add(type, listener, options);
  });
  stop = installChatInteractionObserver();
});
afterEach(() => { stop(); __resetChatInteractionForTest(); clearExceptionTrackingContext(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function emit(duration: number, target: Element = document.querySelector('textarea')!, name = 'keydown', startTime = performance.now()) {
  callback({ getEntries: () => [{ duration, name, target, startTime, processingStart: startTime + 40 }] } as unknown as PerformanceObserverEntryList, {} as PerformanceObserver);
}
it('separates sample counts, strict >500ms count, presentation maximum and queue maximum', () => {
  expect(observe).toHaveBeenCalledWith({ type: 'event', durationThreshold: 16 });
  emit(24, undefined, 'keydown', 1); emit(500, undefined, 'keydown', 2); emit(504, undefined, 'keydown', 3);
  emit(800, undefined, 'keyup', 4);
  vi.advanceTimersByTime(30_000);
  expect(named('client_input_responsiveness')[0]).toMatchObject({ area: 'composer', qualified_sample_count: 3, over_500ms_count: 1, max_input_to_presentation_ms: 504, max_queue_delay_ms: 40, sample_floor_ms: 16 });
});
it('continues the denominator after the legacy 20-report cap', () => {
  for (let i = 0; i < 25; i++) { emit(600, undefined, 'keydown', performance.now() + 1); vi.advanceTimersByTime(30_000); }
  expect(named('client_chat_interaction_latency')).toHaveLength(20);
  expect(named('client_input_responsiveness')).toHaveLength(25);
});
it('covers search/settings and excludes password fields and synthetic attempts', () => {
  emit(600, document.querySelector('[type="search"]')!, 'keydown', 1);
  emit(600, document.querySelector('.modal-settings input')!, 'keydown', 2);
  emit(600, document.querySelector('[type="password"]')!, 'keydown', 3);
  document.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
  vi.advanceTimersByTime(30_000);
  expect(named('client_input_responsiveness').map((e) => e.area)).toEqual(['search', 'settings']);
  expect(named('client_input_responsiveness').every((e) => e.input_attempt_count === 0)).toBe(true);
});
it('rejects pre-observation and duplicate timing records and keeps sampling after opt-out', async () => {
  const { applyConsent } = await import('../../src/analytics/client');
  applyConsent(false);
  emit(600, undefined, 'keydown', -1); emit(600, undefined, 'keydown', 1); emit(600, undefined, 'keydown', 1);
  vi.advanceTimersByTime(30_000);
  expect(named('client_input_responsiveness')[0].qualified_sample_count).toBe(1);
  emit(700); vi.advanceTimersByTime(30_000);
  expect(named('client_input_responsiveness')).toHaveLength(2);
});

it('counts trusted fast input attempts without inventing an Event Timing duration', () => {
  keydown({ target: document.querySelector('textarea'), isTrusted: true } as unknown as KeyboardEvent);
  keydown({ target: document.querySelector('textarea'), isTrusted: true } as unknown as KeyboardEvent);
  vi.advanceTimersByTime(30_000);
  expect(named('client_input_responsiveness')[0]).toMatchObject({ input_attempt_count: 2, qualified_sample_count: 0, over_500ms_count: 0, max_input_to_presentation_ms: null, max_queue_delay_ms: null });
});
