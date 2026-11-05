// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { installChatScrollJankObserver } from '../../src/observability/chat-scroll-jank';
import { setExceptionTrackingContext, clearExceptionTrackingContext } from '../../src/analytics/error-tracking';
let stop: () => void;
let frame: FrameRequestCallback | undefined;
let wheel: (event: Event) => void;
const fetchMock = vi.fn();
const raf = vi.fn();
const named = () => fetchMock.mock.calls.map((c) => JSON.parse(c[1].body as string)).filter((e) => e.event === 'client_chat_scroll_frames').map((e) => e.properties);
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1_700_000_000_000);
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now() - 1_700_000_000_000);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const add = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'wheel') wheel = listener as (event: Event) => void;
    add(type, listener, options);
  });
  vi.stubGlobal('fetch', fetchMock.mockReset().mockResolvedValue(new Response('')));
  raf.mockReset().mockImplementation((cb) => { frame = cb; return 1; });
  vi.stubGlobal('requestAnimationFrame', raf); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  setExceptionTrackingContext({ apiKey: 'test', host: 'https://example.test', distinctId: 'test-install', clientType: 'web', osName: 'Mac OS X' });
  document.body.innerHTML = '<div data-testid="chat-log"></div>'; stop = installChatScrollJankObserver();
});
afterEach(() => { stop(); clearExceptionTrackingContext(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function activity() { wheel({ target: document.querySelector('div'), isTrusted: true } as unknown as Event); }
it('does no idle frame work and reports cadence separately from freeze', () => {
  expect(raf).not.toHaveBeenCalled(); activity();
  frame!(0); frame!(16); frame!(96); frame!(112);
  vi.advanceTimersByTime(30_000);
  expect(named()[0]).toMatchObject({ frame_count: 4, interval_count: 3, over_50ms_count: 1, max_frame_interval_ms: 80, measurable: true });
  expect(fetchMock.mock.calls.map((c) => JSON.parse(c[1].body as string).event)).not.toContain('client_chat_scroll_frozen');
});
it('bounds continuous scrolling at 120 frame callbacks per window and cancels on teardown', () => {
  activity();
  for (let i = 0; i < 120; i++) { activity(); frame!(i * 5); }
  const calls = raf.mock.calls.length; activity();
  expect(raf.mock.calls.length).toBe(calls);
  vi.advanceTimersByTime(30_000);
  expect(named()[0]).toMatchObject({ frame_count: 120, sampling_truncated: true });
  activity(); stop();
  expect(cancelAnimationFrame).toHaveBeenCalled();
});
it('discards suspended frame callbacks rather than labelling sleep as jank', () => {
  activity(); frame!(0); frame!(10_000); vi.advanceTimersByTime(30_000);
  expect(named()).toHaveLength(0);
});
