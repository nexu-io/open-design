// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createExposureClock, reportResponsiveness } from '../../src/observability/responsiveness';
import { clearExceptionTrackingContext, setExceptionTrackingContext } from '../../src/analytics/error-tracking';
afterEach(() => { clearExceptionTrackingContext(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('drops a timer gap longer than the foreground exposure budget', () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const clock = createExposureClock(); now = 90_000;
  expect(clock.tick()).toEqual({ qualified: false, elapsed: null });
  now += 30_000;
  expect(clock.tick()).toEqual({ qualified: true, elapsed: 30_000 });
  clock.stop();
});

it('sends buffered responsiveness metrics after product analytics opt-out', async () => {
  const { applyConsent } = await import('../../src/analytics/client');
  applyConsent(false);
  const fetcher = vi.fn().mockResolvedValue(new Response(''));
  vi.stubGlobal('fetch', fetcher);
  clearExceptionTrackingContext();
  reportResponsiveness('client_long_task', { duration_ms: 5_000 });
  setExceptionTrackingContext({ apiKey: 'test', host: 'https://example.test', distinctId: 'test-install', clientType: 'web', osName: 'Mac OS X' });
  expect(fetcher).toHaveBeenCalledOnce();
  clearExceptionTrackingContext();
});

it('keeps early safety samples through product analytics consent changes', async () => {
  const { applyConsent } = await import('../../src/analytics/client');
  applyConsent(true);
  const fetcher = vi.fn().mockResolvedValue(new Response(''));
  vi.stubGlobal('fetch', fetcher);
  clearExceptionTrackingContext();
  reportResponsiveness('client_long_task', { duration_ms: 5_000 });
  applyConsent(false);
  applyConsent(true);
  reportResponsiveness('client_long_task', { duration_ms: 6_000 });
  setExceptionTrackingContext({ apiKey: 'test', host: 'https://example.test', distinctId: 'test-install', clientType: 'web', osName: 'Mac OS X' });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetcher.mock.calls[0]![1].body).properties.duration_ms).toBe(5_000);
  expect(JSON.parse(fetcher.mock.calls[1]![1].body).properties.duration_ms).toBe(6_000);
  clearExceptionTrackingContext();
});

it('validates new metrics through the buffered transport and preserves occurrence time', () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(''));
  vi.stubGlobal('fetch', fetcher);
  clearExceptionTrackingContext();
  const occurredAt = '2026-10-18T01:02:03.000Z';
  const fields = {
    telemetry_capability: 'supported', occurred_at: occurredAt,
    area: 'composer', window_ms: 30_000, input_attempt_count: 3,
    qualified_sample_count: 2, over_500ms_count: 1,
    max_input_to_presentation_ms: 600, max_queue_delay_ms: null, sample_floor_ms: 16,
    prompt: 'private', url: 'https://private.test', pid: 123,
  };
  reportResponsiveness('client_input_responsiveness', fields);
  reportResponsiveness('client_input_responsiveness', { ...fields, over_500ms_count: 3 });
  setExceptionTrackingContext({ apiKey: 'test', host: 'https://example.test', distinctId: 'test-install', appSessionId: 'session-test', clientType: 'web', osName: 'Mac OS X' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const payload = JSON.parse(fetcher.mock.calls[0]![1].body);
  expect(payload.timestamp).toBe(occurredAt);
  expect(payload.properties).toMatchObject({
    event_schema_version: 4, metric_schema_version: 1, occurred_at: occurredAt,
    device_id: 'test-install', app_session_id: 'session-test',
    max_queue_delay_ms: null, qualified_sample_count: 2,
  });
  for (const key of ['prompt', 'url', 'pid', '$current_url']) {
    expect(payload.properties).not.toHaveProperty(key);
  }
  clearExceptionTrackingContext();
});
