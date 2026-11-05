import { expect, it, vi } from 'vitest';
import { daemonInputAggregationStore, inputRecordStore, openInputAggregationStore } from '../../src/analytics/input-aggregation-store';

const state = () => ({ version: 2, identity: 'local', lastTime: 1, nextSendAt: 3600001, stopped: null,
  completed: Array.from({ length: 1000 }, (_, i) => `old-${i}`), rawPending: [], active: [], pending: [],
  collecting: [{ event_id: 'source-1', input_attempt_count: 1 }] });

it('N01 writes only changed records, and reconstructs the complete state after reopening', async () => {
  const disk = new Map<string, string>();
  const bridge = { read: vi.fn(async () => [...disk.entries()]), write: vi.fn(async (_scope: string, put: [string, string][], drop: string[]) => {
    drop.forEach(k => disk.delete(k)); put.forEach(([k, v]) => disk.set(k, v));
  }) };
  const store = inputRecordStore('scope', bridge, () => {});
  expect(await store.read()).toBeUndefined();
  const first = state(); await store.write(first);
  const next = structuredClone(first); next.lastTime++; next.collecting[0]!.input_attempt_count++;
  await store.write(next);
  const patch = bridge.write.mock.calls[1]!;
  expect(patch[1].map(([k]) => k).sort()).toEqual(['collecting:source-1', 'meta']);
  expect(JSON.stringify(patch).length).toBeLessThan(400);
  const reopened = inputRecordStore('scope', bridge, () => {});
  expect(await reopened.read()).toEqual(next);
  await store.write({ ...next, rawPending: next.collecting, collecting: [] });
  expect((await reopened.read() as any).collecting).toEqual([]);
  expect((await reopened.read() as any).rawPending).toHaveLength(1);
});

it('does not create a second IndexedDB store on a fresh installation', async () => {
  const abort = vi.fn(); const request: any = { transaction: { abort }, error: new Error('aborted probe') };
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, _options: unknown, callback: (lock: object) => Promise<void>) => callback({}) } });
  vi.stubGlobal('indexedDB', { open: () => {
    queueMicrotask(() => { request.onupgradeneeded(); request.onerror(); }); return request;
  } });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true,"records":[],"revision":0}')));
  try {
    const store = await openInputAggregationStore('scope');
    expect(abort).toHaveBeenCalledTimes(1);
    expect(await store.read()).toBeUndefined(); store.close();
  } finally { vi.unstubAllGlobals(); }
});

it('N02 failed commits preserve the previous diff baseline, so the same patch retries', async () => {
  const bridge = { read: async () => [] as [string, string][], write: vi.fn().mockResolvedValue(undefined) };
  const store = inputRecordStore('scope', bridge, () => {});
  await store.read(); await store.write(state());
  bridge.write.mockRejectedValueOnce(new Error('disk full'));
  const next = state(); next.collecting[0]!.input_attempt_count++;
  await expect(store.write(next)).rejects.toThrow('disk full');
  await store.write(next);
  expect(bridge.write.mock.calls[1]).toEqual(bridge.write.mock.calls[2]);
});

it('uses the daemon route, rejects invalid receipts and retries the same small patch after a lost acknowledgement', async () => {
  const disk = new Map<string, string>();
  let loseAck = false; let revision = 0; let previousBody = "";
  const request = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe('/api/analytics/input-checkpoint');
    const body = JSON.parse(String(init.body)); expect(body.scope).toBe('scope');
    if (body.op === 'read') return new Response(JSON.stringify({ ok: true, records: [...disk], revision }));
    if (init.body !== previousBody) { revision++; previousBody = String(init.body); }
    for (const key of body.drop) disk.delete(key);
    for (const [key, value] of body.put) disk.set(key, value);
    if (loseAck) { loseAck = false; throw new Error('response lost'); }
    return new Response(JSON.stringify({ ok: true, revision }));
  });
  vi.stubGlobal('fetch', request);
  try {
    const release = vi.fn(); const store = daemonInputAggregationStore('scope', release);
    expect(await store.read()).toBeUndefined(); await store.write(state());
    const next = state(); next.collecting[0]!.input_attempt_count++;
    loseAck = true; await expect(store.write(next)).rejects.toThrow('response lost'); await store.write(next);
    expect(request.mock.calls[2]![1].body).toBe(request.mock.calls[3]![1].body);
    expect(await daemonInputAggregationStore('scope', () => {}).read()).toEqual(next);
    for (const response of [new Response('{"ok":true}', { status: 503 }), new Response(''),
      new Response('{"ok":false}'), new Response('{"ok":true,"records":[[1,"bad"]]}')]) {
      request.mockResolvedValueOnce(response); await expect(store.read()).rejects.toThrow();
    }
    store.close(); expect(release).toHaveBeenCalledTimes(1);
  } finally { vi.unstubAllGlobals(); }
});
