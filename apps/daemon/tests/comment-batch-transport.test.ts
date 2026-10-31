import { expect, it, vi } from 'vitest';
import { createVelaCliCollabClient } from '../src/collab/vela-cli-collab-client.js';
const request = () => ({ comments: ['a', 'b'].map(key => ({ key, comment: { id: key }, idempotencyKey: `stable-${key}` })) });
it.each([false, true])('keeps keyed partial results on nonzero=%s with exactly one command', async nonzero => {
  const response = { results: [{ key: 'b', ok: false, errorCode: 'RETRY', status: 503 }, { key: 'a', ok: true }] };
  const run = vi.fn(async () => {
    if (nonzero) throw Object.assign(new Error('partial failure'), { stdout: JSON.stringify(response) });
    return JSON.stringify(response);
  });
  const client = createVelaCliCollabClient({ run });
  expect(await client.pushCommentBatch('w', 'p', request())).toEqual(response);
  expect(run).toHaveBeenCalledExactlyOnceWith(['comment', 'push-batch', 'p', '--comment-file', '-', '--mode', 'align', '--json'], 'w', { input: JSON.stringify(request()) });
  await client.pushCommentBatch('w', 'p', request());
  expect(run.mock.calls).toHaveLength(2);
});
it.each([
  'not-json', '{}', JSON.stringify({ results: [{ key: 'a', ok: true }] }),
  JSON.stringify({ results: [{ key: 'a', ok: true }, { key: 'a', ok: true }] }),
  JSON.stringify({ results: [{ key: 'a', ok: true }, { key: 'foreign', ok: true }] }),
  JSON.stringify({ results: [{ key: 'a', ok: 'true' }, { key: 'b', ok: true }] }),
  JSON.stringify({ results: [{ key: 'a', ok: true, status: 503 }, { key: 'b', ok: true }] }),
  JSON.stringify({ results: [{ key: 'a', ok: false, status: 200 }, { key: 'b', ok: true }] }),
])('rejects the entire invalid receipt before it can be acknowledged: %s', async stdout => {
  await expect(createVelaCliCollabClient({ run: async () => stdout }).pushCommentBatch('w', 'p', request())).rejects.toThrow();
});
it('preserves process failure when there is no receipt', async () => {
  const error = new Error('transport unavailable');
  await expect(createVelaCliCollabClient({ run: async () => { throw error; } }).pushCommentBatch('w', 'p', request())).rejects.toBe(error);
});
it.each([0, 501])('rejects size %s without a command', async count => {
  const run = vi.fn(async () => '{}');
  await expect(createVelaCliCollabClient({ run }).pushCommentBatch('w', 'p', { comments: Array.from({ length: count }, (_, i) => ({ key: String(i), comment: {}, idempotencyKey: `i-${i}` })) })).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
});
it('rejects duplicate request keys before execution', async () => {
  const run = vi.fn(async () => '{}'); const value = request(); value.comments[1]!.key = 'a';
  await expect(createVelaCliCollabClient({ run }).pushCommentBatch('w', 'p', value)).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
});
it('correlates against the transmitted snapshot rather than mutated caller input', async () => {
  const value = request();
  const client = createVelaCliCollabClient({ run: async () => {
    value.comments[0]!.key = 'mutated';
    return JSON.stringify({ results: [{ key: 'b', ok: true }, { key: 'a', ok: true }] });
  } });
  expect((await client.pushCommentBatch('w', 'p', value)).results.map(item => item.key)).toEqual(['b', 'a']);
});
