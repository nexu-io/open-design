import { describe, expect, it, vi } from 'vitest';

import { createSilentUpdatePreferenceWriter } from '../../src/state/silent-update-preference';

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = () => res();
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createSilentUpdatePreferenceWriter', () => {
  it('ends at the latest value when two writes are queued before either settles', async () => {
    const commits: boolean[] = [];
    const writeOrder: boolean[] = [];
    const gates: Array<ReturnType<typeof deferred>> = [];

    let base: { allowSilentUpdates?: boolean; other: string } = {
      allowSilentUpdates: false,
      other: 'x',
    };

    const writer = createSilentUpdatePreferenceWriter({
      readBase: () => base,
      writeDaemon: async (next) => {
        const gate = deferred();
        gates.push(gate);
        writeOrder.push(Boolean(next.allowSilentUpdates));
        await gate.promise;
      },
      commit: (allowSilentUpdates) => {
        commits.push(allowSilentUpdates);
        base = { ...base, allowSilentUpdates };
      },
    });

    // Queue true then false without awaiting — the classic Settings double-toggle.
    const first = writer.write(true);
    const second = writer.write(false);

    // Drain the serialized chain: each job parks on its gate after the previous
    // job finishes (or is skipped as superseded).
    for (let i = 0; i < 5 && gates.length < 1; i += 1) {
      await Promise.resolve();
    }
    // First job may be skipped entirely if second was queued before it entered
    // writeDaemon (seq already advanced). Resolve whatever gates appear.
    while (gates.length > 0) {
      const gate = gates.shift()!;
      gate.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }

    await Promise.all([first, second]);

    expect(commits[commits.length - 1] ?? base.allowSilentUpdates).toBe(false);
    expect(base.allowSilentUpdates).toBe(false);
    // Never commit true after false.
    const lastTrue = commits.lastIndexOf(true);
    const lastFalse = commits.lastIndexOf(false);
    if (lastTrue >= 0 && lastFalse >= 0) {
      expect(lastFalse).toBeGreaterThan(lastTrue);
    }
  });

  it('does not leave true committed when false is requested while true is in flight', async () => {
    const commits: boolean[] = [];
    const gate = deferred();
    let enteredFirstWrite = false;

    let base: { allowSilentUpdates?: boolean } = { allowSilentUpdates: false };
    const writer = createSilentUpdatePreferenceWriter({
      readBase: () => base,
      writeDaemon: async (next) => {
        if (next.allowSilentUpdates === true) {
          enteredFirstWrite = true;
          await gate.promise;
          return;
        }
      },
      commit: (allowSilentUpdates) => {
        commits.push(allowSilentUpdates);
        base = { allowSilentUpdates };
      },
    });

    const first = writer.write(true);
    // Wait until the true write is on the network.
    for (let i = 0; i < 10 && !enteredFirstWrite; i += 1) {
      await Promise.resolve();
    }
    expect(enteredFirstWrite).toBe(true);

    const second = writer.write(false);
    // True's network finishes after false was already queued.
    gate.resolve();
    await Promise.all([first, second]);

    expect(base.allowSilentUpdates).toBe(false);
    expect(commits[commits.length - 1]).toBe(false);
  });

  it('does not commit local state when the daemon write fails', async () => {
    const commits: boolean[] = [];
    const writer = createSilentUpdatePreferenceWriter({
      readBase: () => ({ allowSilentUpdates: false }),
      writeDaemon: async () => {
        throw new Error('offline');
      },
      commit: (allowSilentUpdates) => {
        commits.push(allowSilentUpdates);
      },
    });

    await expect(writer.write(true)).rejects.toThrow('offline');
    expect(commits).toEqual([]);
  });

  it('preserves call-order serialization even when the first write rejects', async () => {
    const writes: boolean[] = [];
    const commits: boolean[] = [];
    let failOnce = true;
    const writer = createSilentUpdatePreferenceWriter({
      readBase: () => ({ allowSilentUpdates: false }),
      writeDaemon: async (next) => {
        writes.push(Boolean(next.allowSilentUpdates));
        if (failOnce) {
          failOnce = false;
          throw new Error('offline');
        }
      },
      commit: (allowSilentUpdates) => {
        commits.push(allowSilentUpdates);
      },
    });

    await expect(writer.write(true)).rejects.toThrow('offline');
    await writer.write(false);
    expect(writes).toEqual([true, false]);
    expect(commits).toEqual([false]);
  });
});
