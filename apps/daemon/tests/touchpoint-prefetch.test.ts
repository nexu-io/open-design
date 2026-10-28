import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { createTouchpointPrefetch, PREFETCH_PLACEMENTS, TOUCHPOINT_PREFETCH_BACKOFF_MS, type TouchpointProxyResponse } from '../src/routes/touchpoint-prefetch.js';
const request = (locale = 'en-US', placement = 'opend.home.campaign-modal') => Object.assign(new EventEmitter(), { method: 'GET', path: '/api/touchpoints/production-runtime', url: `/api/touchpoints/production-runtime?placementKey=${placement}&locale=${locale}&emptyResponse=200`, headers: {}, body: undefined, query: {} });
afterEach(() => vi.useRealTimers());
it('makes one attempt, with no automatic retries, and permits a later observation only after backoff', async () => {
  vi.useFakeTimers();
  const run = vi.fn((_req, res: TouchpointProxyResponse) => res.status(503).json({ error: 'down' }));
  const prefetch = createTouchpointPrefetch(run);
  prefetch.warm('a', 'en-US');
  await vi.runAllTimersAsync();
  prefetch.warm('a', 'en-US'); expect(run).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(TOUCHPOINT_PREFETCH_BACKOFF_MS - 1);
  prefetch.warm('a', 'en-US'); expect(run).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(1);
  expect(run).toHaveBeenCalledTimes(3); // Backoff is passive, not a retry timer.
  prefetch.warm('a', 'en-US'); expect(run).toHaveBeenCalledTimes(6);
  await vi.runAllTimersAsync(); prefetch.close();
});
it('discards a stale flight even for a UI consumer already waiting on it', async () => {
  let response!: TouchpointProxyResponse;
  const prefetch = createTouchpointPrefetch((req, res) => { if (new URL(req.url, 'http://daemon').searchParams.get('placementKey') === 'opend.home.campaign-modal') response = res; });
  prefetch.warm('a', 'en-US');
  const joined = prefetch.join('a', request());
  prefetch.reset(null);
  response.status(200).end('{"stale":true}');
  expect(await joined).toBeNull();
  prefetch.close();
});
it('does not join another locale or retain a completed authorization for later replay', async () => {
  let response!: TouchpointProxyResponse;
  const prefetch = createTouchpointPrefetch((req, res) => { if (new URL(req.url, 'http://daemon').searchParams.get('placementKey') === 'opend.home.campaign-modal') response = res; });
  prefetch.warm('a', 'en-US');
  expect(await prefetch.join('a', request('zh-CN'))).toBeNull();
  const joined = prefetch.join('a', request());
  response.status(404).end('{}');
  expect((await joined)?.status).toBe(404);
  expect(await prefetch.join('a', request())).toBeNull();
  prefetch.close();
});
it('limits a completed warm result to one handoff within ten seconds', async () => {
  vi.useFakeTimers();
  const prefetch = createTouchpointPrefetch((_req, res) => res.status(200).json({ decision: true }));
  prefetch.warm('a', 'en-US'); await vi.runAllTimersAsync();
  expect(prefetch.consumeReady('a', request())?.status).toBe(200);
  expect(prefetch.consumeReady('a', request())).toBeNull();
  prefetch.warm('b', 'en-US'); await vi.runAllTimersAsync();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(prefetch.consumeReady('b', request())).toBeNull();
  prefetch.close();
});

it('warms only the three fixed placements and keeps their handoffs and retries independent', async () => {
  vi.useFakeTimers();
  const responses = new Map<string, TouchpointProxyResponse>();
  const run = vi.fn((req, res: TouchpointProxyResponse) => {
    responses.set(new URL(req.url, 'http://daemon').searchParams.get('placementKey')!, res);
    expect(req.method).toBe('GET');
    expect(req.path).toBe('/api/touchpoints/production-runtime');
  });
  const prefetch = createTouchpointPrefetch(run);
  prefetch.warm('a', 'en-US');
  prefetch.warm('a', 'en-US');
  expect([...responses.keys()]).toEqual([...PREFETCH_PLACEMENTS]);
  expect(run).toHaveBeenCalledTimes(3);
  const entry = prefetch.join('a', request('en-US', 'opend.home.hover-entry'));
  responses.get('opend.home.hover-entry')!.status(404).json({ placement: 'entry' });
  responses.get('opend.home.hover-layer')!.status(200).json({ placement: 'layer' });
  responses.get('opend.home.campaign-modal')!.status(503).json({ error: 'down' });
  await vi.runAllTimersAsync();
  expect((await entry)?.status).toBe(404);
  expect(prefetch.consumeReady('a', request('en-US', 'opend.home.hover-entry'))).toBeNull();
  const layer = prefetch.consumeReady('a', request('en-US', 'opend.home.hover-layer'))!;
  expect(JSON.parse(layer.body.toString())).toEqual({ placement: 'layer' });
  expect(prefetch.backingOff('a', request())).toBe(true);
  expect(prefetch.backingOff('a', request('en-US', 'opend.home.hover-layer'))).toBe(false);
  await vi.advanceTimersByTimeAsync(TOUCHPOINT_PREFETCH_BACKOFF_MS);
  prefetch.warm('a', 'en-US');
  expect(run).toHaveBeenCalledTimes(4); // Only the failed modal retries.
  expect(await prefetch.join('a', request('en-US', 'opend.home.account-badge'))).toBeNull();
  prefetch.close();
});

it('cleans up every placement on an identity or locale change', async () => {
  const responses: TouchpointProxyResponse[] = [];
  const prefetch = createTouchpointPrefetch((_req, res) => { responses.push(res); });
  prefetch.warm('a', 'en-US');
  const old = PREFETCH_PLACEMENTS.map(placement => prefetch.join('a', request('en-US', placement)));
  prefetch.warm('b', 'zh-CN');
  expect(await Promise.all(old)).toEqual([null, null, null]);
  expect(responses.slice(0, 3).every(res => res.destroyed)).toBe(true);
  prefetch.close();
  expect(responses.every(res => res.destroyed)).toBe(true);
});
