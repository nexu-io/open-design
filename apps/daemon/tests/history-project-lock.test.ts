import { afterEach, describe, expect, it } from 'vitest';
import { withProjectLock, __resetProjectLocksForTests } from '../src/history/project-lock.js';

describe('withProjectLock', () => {
  afterEach(() => {
    __resetProjectLocksForTests();
  });

  it('serializes operations on the same project', async () => {
    const order: string[] = [];

    const a = withProjectLock('p1', async () => {
      order.push('a-start');
      await new Promise((r) => setTimeout(r, 20));
      order.push('a-end');
      return 'A';
    });
    const b = withProjectLock('p1', async () => {
      order.push('b-start');
      await new Promise((r) => setTimeout(r, 5));
      order.push('b-end');
      return 'B';
    });

    const [resA, resB] = await Promise.all([a, b]);
    expect(resA).toBe('A');
    expect(resB).toBe('B');
    // b's start must follow a's end — not interleave
    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
  });

  it('runs operations on different projects concurrently', async () => {
    const order: string[] = [];

    const a = withProjectLock('p1', async () => {
      order.push('a-start');
      await new Promise((r) => setTimeout(r, 20));
      order.push('a-end');
    });
    const b = withProjectLock('p2', async () => {
      order.push('b-start');
      await new Promise((r) => setTimeout(r, 5));
      order.push('b-end');
    });

    await Promise.all([a, b]);
    // p2's faster work finishes before p1's slower work
    expect(order).toEqual(['a-start', 'b-start', 'b-end', 'a-end']);
  });

  it('releases the lock when the wrapped fn throws (next caller can proceed)', async () => {
    const failing = withProjectLock('p1', async () => {
      throw new Error('boom');
    });
    // The failing call's rejection must not poison the queue
    await expect(failing).rejects.toThrow('boom');

    // A subsequent call on the same project should still work
    const ok = await withProjectLock('p1', async () => 'ok');
    expect(ok).toBe('ok');
  });

  it('does not deadlock when many calls queue on the same project', async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        withProjectLock('p1', async () => {
          await new Promise((r) => setTimeout(r, 1));
          return i;
        }),
      ),
    );
    expect(results).toEqual(Array.from({ length: 25 }, (_, i) => i));
  });

  it('propagates the return value from the wrapped fn', async () => {
    const obj = { ok: true, n: 42 };
    const result = await withProjectLock('p1', async () => obj);
    expect(result).toBe(obj); // identity, not just deep-equal
  });
});
