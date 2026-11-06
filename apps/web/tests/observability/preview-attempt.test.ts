// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createPreviewAttempt, trackVisiblePreview } from '../../src/observability/iframe-error';
vi.mock('../../src/analytics/error-tracking', () => ({ reportSafetyEvent: vi.fn(), reportClientMetricEvent: vi.fn((_event: string, _props: Record<string, unknown>) => true) }));

describe('visible preview denominator', () => {
  it.each(['srcdoc', 'url_load', 'live_artifact'] as const)('finishes %s only once, with a real attempt', (renderMode) => {
    const emit = vi.fn((_event: string, _props: Record<string, unknown>) => true);
    const attempt = createPreviewAttempt({ renderMode, artifactKind: null, emit, now: () => 42, id: () => 'attempt' });
    attempt.start(false); attempt.finish('white_screen');
    expect(emit).not.toHaveBeenCalled();
    attempt.start(true); attempt.finish('success'); attempt.finish('white_screen'); attempt.finish('cancelled');
    expect(emit.mock.calls.map(c => c[0])).toEqual(['client_preview_attempt', 'client_preview_result']);
    expect(emit.mock.calls[1]?.[1]).toMatchObject({ preview_attempt_id: 'attempt', result: 'success', render_mode: renderMode });
  });
  it.each(['success', 'white_screen', 'error', 'cancelled'] as const)('records %s as one terminal result', result => {
    const emit = vi.fn((_event: string, _props: Record<string, unknown>) => true);
    const attempt = createPreviewAttempt({ renderMode: 'srcdoc', artifactKind: 'html', emit, now: () => 1, id: () => 'a' });
    attempt.start(true); attempt.finish(result); attempt.finish('error');
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[1]?.[1]).toMatchObject({ result });
  });
  it('does not emit orphan results if consent/context rejected the attempt', () => {
    const emit = vi.fn((_event: string, _props: Record<string, unknown>) => false);
    const attempt = createPreviewAttempt({ renderMode: 'srcdoc', artifactKind: null, emit, now: () => 1, id: () => 'a' });
    attempt.start(true); attempt.finish('white_screen');
    expect(emit).toHaveBeenCalledTimes(1);
  });
  it('cancels on hidden and ignores stale or foreign paint responses', async () => {
    const { reportClientMetricEvent } = await import('../../src/analytics/error-tracking');
    vi.mocked(reportClientMetricEvent).mockClear();
    let visible = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible as DocumentVisibilityState);
    const frame = document.createElement('iframe'); document.body.append(frame);
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 100, top: 0, left: 0, bottom: 100, right: 100 } as DOMRect);
    const stop = trackVisiblePreview({ iframe: frame, renderMode: 'srcdoc', artifactKind: null });
    const calls = vi.mocked(reportClientMetricEvent).mock.calls;
    expect(calls[0]?.[0]).toBe('client_preview_attempt');
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { type: 'od:preview-metric-result', attemptId: 'stale', result: 'success' } }));
    expect(calls).toHaveLength(1);
    visible = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
    stop();
    expect(calls).toHaveLength(2); expect(calls[1]?.[1]).toMatchObject({ result: 'cancelled' });
    frame.remove(); vi.restoreAllMocks();
  });
});

it.each(['aria-hidden', 'data-od-active', 'data-od-motion-active'])('excludes initially inactive frames (%s)', async attribute => {
  const { reportClientMetricEvent } = await import('../../src/analytics/error-tracking');
  vi.mocked(reportClientMetricEvent).mockClear();
  const frame = document.createElement('iframe'); document.body.append(frame);
  frame.setAttribute(attribute, attribute === 'aria-hidden' ? 'true' : 'false');
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 100, top: 0, left: 0, bottom: 100, right: 100 } as DOMRect);
  const stop = trackVisiblePreview({ iframe: frame, renderMode: 'url_load', artifactKind: null });
  expect(reportClientMetricEvent).not.toHaveBeenCalled(); stop(); frame.remove(); vi.restoreAllMocks();
});

it('accepts only a current-frame/current-attempt terminal and ignores duplicate results', async () => {
  const { reportClientMetricEvent } = await import('../../src/analytics/error-tracking');
  vi.mocked(reportClientMetricEvent).mockClear();
  const frame = document.createElement('iframe'); document.body.append(frame);
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 100, top: 0, left: 0, bottom: 100, right: 100 } as DOMRect);
  const stop = trackVisiblePreview({ iframe: frame, renderMode: 'live_artifact', artifactKind: 'live_artifact' });
  const id = vi.mocked(reportClientMetricEvent).mock.calls[0]![1].preview_attempt_id;
  const data = { type: 'od:preview-metric-result', attemptId: id, result: 'success' };
  window.dispatchEvent(new MessageEvent('message', { source: null, data }));
  expect(reportClientMetricEvent).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data }));
  window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { ...data, result: 'white_screen' } }));
  stop();
  expect(reportClientMetricEvent).toHaveBeenCalledTimes(2);
  expect(vi.mocked(reportClientMetricEvent).mock.calls[1]![1]).toMatchObject({ result: 'success' });
  frame.remove(); vi.restoreAllMocks();
});

it('excludes visible url_load previews from the denominator instead of timing them out as errors', async () => {
  const { reportClientMetricEvent } = await import('../../src/analytics/error-tracking');
  vi.mocked(reportClientMetricEvent).mockClear(); vi.useFakeTimers();
  const frame = document.createElement('iframe'); document.body.append(frame);
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 100, top: 0, left: 0, bottom: 100, right: 100 } as DOMRect);
  const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});
  const stop = trackVisiblePreview({ iframe: frame, renderMode: 'url_load', artifactKind: 'html' });
  frame.dispatchEvent(new Event('load'));
  vi.advanceTimersByTime(60_000);
  stop();
  expect(reportClientMetricEvent).not.toHaveBeenCalled();
  expect(post.mock.calls.filter(([d]) => d.type === 'od:preview-metric-probe')).toHaveLength(0);
  frame.remove(); vi.useRealTimers(); vi.restoreAllMocks();
});

it('bounds probes and classifies missing transport evidence as error, not white screen', async () => {
  const { reportClientMetricEvent } = await import('../../src/analytics/error-tracking');
  vi.mocked(reportClientMetricEvent).mockClear(); vi.useFakeTimers();
  const frame = document.createElement('iframe'); document.body.append(frame);
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 100, top: 0, left: 0, bottom: 100, right: 100 } as DOMRect);
  const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});
  const stop = trackVisiblePreview({ iframe: frame, renderMode: 'srcdoc', artifactKind: null });
  for (let i = 0; i < 20; i++) frame.dispatchEvent(new Event('load'));
  vi.advanceTimersByTime(60_000);
  expect(post.mock.calls.filter(([d]) => d.type === 'od:preview-metric-probe').length).toBeLessThanOrEqual(8);
  expect(vi.mocked(reportClientMetricEvent).mock.calls[1]![1]).toMatchObject({ result: 'error', monitoring_kind: 'srcdoc_transport_unverified' });
  stop(); frame.remove(); vi.useRealTimers(); vi.restoreAllMocks();
});
