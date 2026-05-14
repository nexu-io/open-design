import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import { __writeLocksSize, withWriteLock } from '../src/write-lock.js';

describe('withWriteLock', () => {
  it('serializes concurrent callers on the same key in arrival order', async () => {
    const order: string[] = [];
    const a = withWriteLock('k', async () => {
      await Promise.resolve();
      order.push('a');
    });
    const b = withWriteLock('k', async () => {
      order.push('b');
    });
    const c = withWriteLock('k', async () => {
      order.push('c');
    });
    await Promise.all([a, b, c]);
    assert.deepEqual(order, ['a', 'b', 'c']);
  });

  it('returns the resolved value from the wrapped function', async () => {
    const result = await withWriteLock('k', async () => 42);
    assert.equal(result, 42);
  });

  it('rejects with the wrapped error and lets the queue continue', async () => {
    const failing = withWriteLock('k', async () => {
      throw new Error('boom');
    });
    await assert.rejects(failing, /boom/);
    // Next caller still runs even after the previous one threw.
    const next = await withWriteLock('k', async () => 'after-error');
    assert.equal(next, 'after-error');
  });

  it('runs unrelated keys in parallel', async () => {
    let bStartedBeforeAFinished = false;
    let aDone = false;
    const a = withWriteLock('a', async () => {
      await new Promise((r) => setTimeout(r, 10));
      aDone = true;
    });
    const b = withWriteLock('b', async () => {
      if (!aDone) bStartedBeforeAFinished = true;
    });
    await Promise.all([a, b]);
    assert.equal(bStartedBeforeAFinished, true);
  });

  it('drops the map entry once the queue for a key has fully drained', async () => {
    // Use a unique key so concurrent tests don't see each other's entries.
    const key = `drains-${Math.random()}`;
    const sizeBefore = __writeLocksSize();
    await withWriteLock(key, async () => {});
    // A microtask gives the chained `.then(() => undefined)` settle a
    // chance to run before we assert.
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(
      __writeLocksSize(),
      sizeBefore,
      'expected the lock map to return to its pre-call size after the queue drains; if this fails, the cleanup branch in withWriteLock is unreachable again',
    );
  });

  it('drops the map entry even when the wrapped function rejects', async () => {
    const key = `drains-reject-${Math.random()}`;
    const sizeBefore = __writeLocksSize();
    await assert.rejects(
      withWriteLock(key, async () => {
        throw new Error('boom');
      }),
      /boom/,
    );
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(__writeLocksSize(), sizeBefore);
  });
});
