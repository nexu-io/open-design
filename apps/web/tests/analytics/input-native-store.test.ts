import { expect, it, vi } from 'vitest';
import { nativeInputAggregationStore } from '../../src/analytics/input-aggregation-store';

const state = () => ({ version: 2, identity: 'local', lastTime: 1, nextSendAt: 3600001, stopped: null,
  completed: Array.from({ length: 1000 }, (_, i) => `old-${i}`), rawPending: [], active: [], pending: [],
  collecting: [{ event_id: 'source-1', input_attempt_count: 1 }] });

it('N01 writes only changed records, and reconstructs the complete state after reopening', async () => {
  const disk = new Map<string, string>();
  const bridge = { read: vi.fn(async () => [...disk.entries()]), write: vi.fn(async (_scope: string, put: [string, string][], drop: string[]) => {
    drop.forEach(k => disk.delete(k)); put.forEach(([k, v]) => disk.set(k, v));
  }) };
  const store = nativeInputAggregationStore('scope', bridge, () => {});
  expect(await store.read()).toBeUndefined();
  const first = state(); await store.write(first);
  const next = structuredClone(first); next.lastTime++; next.collecting[0]!.input_attempt_count++;
  await store.write(next);
  const patch = bridge.write.mock.calls[1]!;
  expect(patch[1].map(([k]) => k).sort()).toEqual(['collecting:source-1', 'meta']);
  expect(JSON.stringify(patch).length).toBeLessThan(400);
  const reopened = nativeInputAggregationStore('scope', bridge, () => {});
  expect(await reopened.read()).toEqual(next);
  await store.write({ ...next, rawPending: next.collecting, collecting: [] });
  expect((await reopened.read() as any).collecting).toEqual([]);
  expect((await reopened.read() as any).rawPending).toHaveLength(1);
});

it('N02 failed commits preserve the previous diff baseline, so the same patch retries', async () => {
  const bridge = { read: async () => [] as [string, string][], write: vi.fn().mockResolvedValue(undefined) };
  const store = nativeInputAggregationStore('scope', bridge, () => {});
  await store.read(); await store.write(state());
  bridge.write.mockRejectedValueOnce(new Error('disk full'));
  const next = state(); next.collecting[0]!.input_attempt_count++;
  await expect(store.write(next)).rejects.toThrow('disk full');
  await store.write(next);
  expect(bridge.write.mock.calls[1]).toEqual(bridge.write.mock.calls[2]);
});
