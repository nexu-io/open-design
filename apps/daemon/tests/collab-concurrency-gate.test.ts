import { describe, expect, it } from 'vitest';
import { ConcurrencyGate, mapWithGate } from '../src/collab/concurrency-gate.js';

/** A promise with its resolvers exposed, so a test can park an operation. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('ConcurrencyGate', () => {
  it('rejects a capacity that cannot admit anything', () => {
    expect(() => new ConcurrencyGate(0)).toThrow(/positive integer/);
    expect(() => new ConcurrencyGate(-1)).toThrow(/positive integer/);
    expect(() => new ConcurrencyGate(1.5)).toThrow(/positive integer/);
  });

  it('starts an uncontended operation synchronously', () => {
    const gate = new ConcurrencyGate(2);
    let started = false;
    void gate.run(async () => {
      started = true;
    });
    // No await: callers that relied on the pre-gate synchronous call still see it.
    expect(started).toBe(true);
  });

  it('holds the extra operations at the cap and admits them as slots free', async () => {
    const gate = new ConcurrencyGate(2);
    const gates = [deferred(), deferred(), deferred()];
    const started: number[] = [];

    const runs = gates.map((parked, index) =>
      gate.run(async () => {
        started.push(index);
        await parked.promise;
      }),
    );

    expect(started).toEqual([0, 1]);
    expect(gate.active).toBe(2);
    expect(gate.pending).toBe(1);

    gates[0]!.resolve();
    await runs[0];
    expect(started).toEqual([0, 1, 2]);

    gates[1]!.resolve();
    gates[2]!.resolve();
    await Promise.all(runs);
    expect(gate.active).toBe(0);
    expect(gate.pending).toBe(0);
  });

  it('admits waiters in arrival order', async () => {
    const gate = new ConcurrencyGate(1);
    const blocker = deferred();
    const order: string[] = [];

    const first = gate.run(async () => {
      order.push('first');
      await blocker.promise;
    });
    const queued = ['a', 'b', 'c'].map((label) =>
      gate.run(async () => {
        order.push(label);
      }),
    );

    blocker.resolve();
    await Promise.all([first, ...queued]);
    expect(order).toEqual(['first', 'a', 'b', 'c']);
  });

  it('releases the slot when an operation rejects, and re-throws unchanged', async () => {
    const gate = new ConcurrencyGate(1);
    const boom = new Error('transfer failed');

    await expect(gate.run(async () => { throw boom; })).rejects.toBe(boom);
    expect(gate.active).toBe(0);

    // A failed operation must not permanently shrink the gate.
    await expect(gate.run(async () => 'ok')).resolves.toBe('ok');
  });

  it('releases the slot when an operation throws synchronously', async () => {
    const gate = new ConcurrencyGate(1);
    expect(() => gate.run((() => { throw new Error('sync boom'); }) as never)).toThrow('sync boom');
    expect(gate.active).toBe(0);
    await expect(gate.run(async () => 'ok')).resolves.toBe('ok');
  });
});

describe('mapWithGate', () => {
  it('keeps input order regardless of completion order', async () => {
    const gate = new ConcurrencyGate(3);
    const delays = [30, 0, 10, 20, 5];
    const results = await mapWithGate(delays, gate, async (delay, index) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return index;
    });
    expect(results).toEqual([0, 1, 2, 3, 4]);
  });

  it('propagates the first rejection like Promise.all does', async () => {
    const gate = new ConcurrencyGate(2);
    await expect(
      mapWithGate([1, 2, 3], gate, async (value) => {
        if (value === 2) throw new Error('item 2 failed');
        return value;
      }),
    ).rejects.toThrow('item 2 failed');
    // Every admitted operation still released its slot.
    await expect(gate.run(async () => 'ok')).resolves.toBe('ok');
  });

  it('runs an empty fan-out without touching the gate', async () => {
    const gate = new ConcurrencyGate(1);
    await expect(mapWithGate([], gate, async () => 1)).resolves.toEqual([]);
    expect(gate.active).toBe(0);
  });
});
