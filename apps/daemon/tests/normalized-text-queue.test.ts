import { describe, expect, it } from 'vitest';
import { NormalizedTextQueue } from '../src/critique/normalized-text-queue.js';

describe('NormalizedTextQueue', () => {
  it('delivers queued text before EOF and resolves a waiting consumer on close', async () => {
    const queue = new NormalizedTextQueue();
    expect(queue.push('assistant text')).toBe(true);
    queue.close();
    const iterator = queue[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({ value: 'assistant text', done: false });
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });

    const empty = new NormalizedTextQueue();
    const waiting = empty[Symbol.asyncIterator]().next();
    empty.close();
    await expect(waiting).resolves.toEqual({ value: undefined, done: true });
  });

  it('propagates decoder errors to a waiting consumer and rejects overflow', async () => {
    const queue = new NormalizedTextQueue();
    const waiting = queue[Symbol.asyncIterator]().next();
    queue.fail(new Error('decoder failed'));
    await expect(waiting).rejects.toThrow('decoder failed');

    const bounded = new NormalizedTextQueue();
    expect(bounded.push('x'.repeat(512 * 1024))).toBe(true);
    expect(bounded.push('overflow')).toBe(false);
    await expect(bounded[Symbol.asyncIterator]().next()).resolves.toHaveProperty('value');
    await expect(bounded[Symbol.asyncIterator]().next()).rejects.toThrow('bounded capacity');
  });

  it('closes when the consumer cancels iteration', async () => {
    const queue = new NormalizedTextQueue();
    const iterator = queue[Symbol.asyncIterator]();
    const waiting = iterator.next();
    await iterator.return?.();
    await expect(waiting).resolves.toEqual({ value: undefined, done: true });
    expect(queue.push('after cancel')).toBe(false);
  });
});
