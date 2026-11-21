// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const tracking = vi.hoisted(() => ({ patch: vi.fn(), set: vi.fn() }));
vi.mock('../../src/analytics/error-tracking', () => ({
  patchInputAggregationTrial: tracking.patch, setExceptionTrackingContext: tracking.set,
  clearExceptionTrackingContext: vi.fn(), detectBrowserOsName: () => 'Mac OS X',
}));
vi.mock('posthog-js', () => {
  const client = { init: (_key: string, cfg: { loaded(i: unknown): void }) => { cfg.loaded(client); return client; },
    register() {}, setPersonProperties() {}, opt_in_capturing() {}, opt_out_capturing() {}, reset() {}, identify() {} };
  return { default: client };
});
const trial = { trial_id: 'input-01', revision: 'r1', mode: 'shadow', host: 'https://us.i.posthog.com', project_key: 'phc_example' };
const config = { enabled: true, key: trial.project_key, host: trial.host, env: 'test', installationId: 'device', inputAggregation: trial };
const context = { anonymousId: 'device', sessionId: 'session', clientType: 'desktop' as const, locale: 'en', appVersion: '0.25.1' };
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); vi.clearAllMocks(); });

it('polls only opted-in clients, pauses on refresh failure and refuses target changes', async () => {
  vi.useFakeTimers(); vi.resetModules();
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => config }); vi.stubGlobal('fetch', fetch);
  const { bootstrapExceptionTracking } = await import('../../src/analytics/client');
  await bootstrapExceptionTracking(context); expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(29999); expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ...config, inputAggregation: { ...trial, mode: 'drain' } }) });
  await vi.advanceTimersByTimeAsync(1); expect(tracking.patch).toHaveBeenLastCalledWith({ ...trial, mode: 'drain' });
  expect(fetch.mock.calls.at(-1)![1]).toMatchObject({ cache: 'no-store', signal: expect.any(AbortSignal) });
  fetch.mockRejectedValueOnce(new Error('offline')); await vi.advanceTimersByTimeAsync(30000);
  expect(tracking.patch).toHaveBeenLastCalledWith(null);
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ...config, key: 'phc_wrong' }) });
  await vi.advanceTimersByTimeAsync(30000); expect(tracking.patch).toHaveBeenLastCalledWith(null);
});

it('starts refresh after a later consented init discovers the trial, and ordinary clients do not poll', async () => {
  vi.useFakeTimers(); vi.resetModules();
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...config, inputAggregation: null }) }); vi.stubGlobal('fetch', fetch);
  const { bootstrapExceptionTracking, getAnalyticsClient } = await import('../../src/analytics/client');
  await bootstrapExceptionTracking(context); await vi.advanceTimersByTimeAsync(30000);
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValue({ ok: true, json: async () => config });
  expect(await getAnalyticsClient(context)).not.toBeNull();
  expect(tracking.set).toHaveBeenLastCalledWith(expect.objectContaining({ inputAggregation: trial }));
  const before = fetch.mock.calls.length; await vi.advanceTimersByTimeAsync(30000);
  expect(fetch).toHaveBeenCalledTimes(before + 1);
});
