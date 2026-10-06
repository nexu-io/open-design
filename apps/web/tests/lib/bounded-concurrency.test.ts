import { describe, expect, it } from 'vitest';

import { createBoundedConcurrency } from '../../src/lib/bounded-concurrency';

/** A task whose completion the test controls, recording overlap as it runs. */
function tracker() {
  const state = { active: 0, peak: 0, started: [] as number[], finished: [] as number[] };
  const resolvers: Array<() => void> = [];
  const task = (id: number) => async () => {
    state.active += 1;
    state.peak = Math.max(state.peak, state.active);
    state.started.push(id);
    await new Promise<void>((resolve) => {
      resolvers.push(resolve);
    });
    state.active -= 1;
    state.finished.push(id);
    return id;
  };
  return { state, resolvers, task };
}

const flush = async (times = 40): Promise<void> => {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
};

describe('createBoundedConcurrency', () => {
  it('never runs more than the limit at once', async () => {
    const gate = createBoundedConcurrency(2);
    const { state, resolvers, task } = tracker();

    const all = [0, 1, 2, 3, 4].map((id) => gate.run(task(id)));
    await flush();

    expect(state.peak).toBeLessThanOrEqual(2);
    expect(state.started).toHaveLength(2);

    // Drain: each completion admits exactly one more.
    while (resolvers.length > 0) {
      resolvers.shift()!();
      await flush();
    }
    await Promise.all(all);
    expect(state.peak).toBeLessThanOrEqual(2);
  });

  it('still runs every task — queuing is a delay, not a drop', async () => {
    const gate = createBoundedConcurrency(2);
    const { state, resolvers, task } = tracker();

    const all = [0, 1, 2, 3, 4].map((id) => gate.run(task(id)));
    await flush();
    while (resolvers.length > 0) {
      resolvers.shift()!();
      await flush();
    }

    await expect(Promise.all(all)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(state.started.slice().sort()).toEqual([0, 1, 2, 3, 4]);
    expect(state.finished.slice().sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('starts a task synchronously when a slot is free', () => {
    const gate = createBoundedConcurrency(2);
    let started = false;
    void gate.run(async () => {
      started = true;
      await new Promise(() => {});
    });
    // No await between: an idle gate must not cost the caller a microtask.
    expect(started).toBe(true);
  });

  it('frees the slot when a task rejects', async () => {
    const gate = createBoundedConcurrency(1);
    const first = gate.run(async () => {
      throw new Error('boom');
    });
    await expect(first).rejects.toThrow('boom');

    let secondRan = false;
    await gate.run(async () => {
      secondRan = true;
    });
    expect(secondRan).toBe(true);
  });

  it('frees the slot when a task throws synchronously', async () => {
    const gate = createBoundedConcurrency(1);
    await expect(
      gate.run((() => {
        throw new Error('sync boom');
      }) as () => Promise<void>),
    ).rejects.toThrow('sync boom');

    let secondRan = false;
    await gate.run(async () => {
      secondRan = true;
    });
    expect(secondRan).toBe(true);
  });

  it('rejects a nonsensical limit instead of silently serialising', () => {
    expect(() => createBoundedConcurrency(0)).toThrow();
    expect(() => createBoundedConcurrency(-1)).toThrow();
    expect(() => createBoundedConcurrency(1.5)).toThrow();
  });
});
