import { afterEach, describe, expect, it } from 'vitest';

import {
  _resetAntigravityModelLockForTests,
  acquireAntigravityModelLock,
  waitForAgyToReadModel,
} from '../../src/runtimes/defs/antigravity.js';

afterEach(() => {
  _resetAntigravityModelLockForTests();
});

describe('acquireAntigravityModelLock', () => {
  // The lock chain is the per-process serialization that protects
  // `~/.gemini/antigravity-cli/settings.json` from concurrent
  // non-default model writes. Two concurrent spawns must not both
  // write the file before the first one's agy has actually read it —
  // otherwise the first run executes on the second run's model.
  // Pin both the ordering (B does not enter until A releases) AND
  // the no-deadlock contract (releasing A unblocks B without manual
  // intervention).
  it('serializes concurrent acquirers — second waits for first release', async () => {
    const events: string[] = [];

    const releaseA = await acquireAntigravityModelLock();
    events.push('A-acquired');

    // Kick off B in parallel — it should NOT acquire until A releases.
    const bPromise = acquireAntigravityModelLock().then((release) => {
      events.push('B-acquired');
      return release;
    });

    // Yield to the event loop several times so B has every chance to
    // resolve early if the serialization were broken.
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(events).toEqual(['A-acquired']);

    releaseA();
    const releaseB = await bPromise;
    expect(events).toEqual(['A-acquired', 'B-acquired']);

    releaseB();
  });

  // Three+ concurrent acquirers should FIFO through the chain. A
  // future refactor that drops the awaited `previous` reference would
  // let later acquirers leapfrog earlier ones, which is exactly the
  // race we're guarding against.
  it('FIFOs three concurrent acquirers', async () => {
    const events: string[] = [];
    const releaseA = await acquireAntigravityModelLock();
    events.push('A-acquired');

    const bPromise = acquireAntigravityModelLock().then((rel) => {
      events.push('B-acquired');
      return rel;
    });
    const cPromise = acquireAntigravityModelLock().then((rel) => {
      events.push('C-acquired');
      return rel;
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual(['A-acquired']);

    releaseA();
    const releaseB = await bPromise;
    expect(events).toEqual(['A-acquired', 'B-acquired']);

    releaseB();
    const releaseC = await cPromise;
    expect(events).toEqual(['A-acquired', 'B-acquired', 'C-acquired']);

    releaseC();
  });
});

describe('waitForAgyToReadModel', () => {
  // The polling helper resolves true when agy's --log-file matches the
  // upstream `Propagating selected model override to backend:
  // label="<X>"` line, which is the signal that settings.json was
  // read. This is the lock-release trigger in the spawn pipeline —
  // breaking the pattern match would either release the lock too
  // early (concurrent races re-emerge) or never release it (queue
  // starvation).
  it('resolves true when the expected propagation line appears', async () => {
    let now = 0;
    const reads: string[] = [];
    let calls = 0;
    const result = await waitForAgyToReadModel(
      '/fake/log/path',
      'Gemini 3.1 Pro (High)',
      {
        timeoutMs: 5_000,
        pollIntervalMs: 10,
        now: () => now,
        readFile: async (path) => {
          reads.push(path);
          calls++;
          if (calls < 3) {
            return 'I0529 boot ...\nE0529 still loading ...\n';
          }
          return (
            'I0529 model_config_manager.go:157] Propagating selected model '
            + 'override to backend: label="Gemini 3.1 Pro (High)"\n'
          );
        },
      },
    );
    expect(result).toBe(true);
    expect(reads.every((p) => p === '/fake/log/path')).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  // Model labels carry parentheses and slashes ("Gemini 3.5 Flash
  // (Medium)", "GPT-OSS 120B (Medium)") — the regex must escape regex
  // metacharacters so the literal label matches. A naive
  // `new RegExp(label)` would interpret the parens as a capture group
  // and silently match the wrong model.
  it('escapes regex metacharacters in the expected model label', async () => {
    const log =
      'I0529 model_config_manager.go] Propagating selected model '
      + 'override to backend: label="GPT-OSS 120B (Medium)"';
    const result = await waitForAgyToReadModel(
      '/fake/log',
      'GPT-OSS 120B (Medium)',
      {
        timeoutMs: 100,
        pollIntervalMs: 5,
        readFile: async () => log,
      },
    );
    expect(result).toBe(true);
  });

  // Must not match a DIFFERENT model just because the prefix overlaps.
  // Concurrent runs A (Gemini Pro) and B (Gemini Pro Low) could
  // otherwise have B's lock released by A's propagation line.
  it('does not match a different model label that shares a prefix', async () => {
    const log =
      'I0529 model_config_manager.go] Propagating selected model '
      + 'override to backend: label="Gemini 3.1 Pro (Low)"';
    const result = await waitForAgyToReadModel(
      '/fake/log',
      'Gemini 3.1 Pro (High)',
      {
        timeoutMs: 30,
        pollIntervalMs: 5,
        readFile: async () => log,
      },
    );
    expect(result).toBe(false);
  });

  // Missing / unreadable log file (agy hasn't created it yet, or a
  // restricted tmpfs) must not throw — the polling loop swallows the
  // error and keeps retrying. Without this, a transient read failure
  // would propagate up and crash the spawn pipeline.
  it('swallows read errors and returns false on timeout', async () => {
    const result = await waitForAgyToReadModel(
      '/nonexistent/log',
      'Gemini 3.1 Pro (High)',
      {
        timeoutMs: 30,
        pollIntervalMs: 5,
        readFile: async () => {
          throw new Error('ENOENT: file not found');
        },
      },
    );
    expect(result).toBe(false);
  });

  // The `false` return must NOT be conflated with "agy definitely did
  // not read the model" — looper review at 263fd2fe7 caught a release-
  // on-timeout regression that re-opened the model-stealing race.
  // server.ts now only releases the lock on a TRUE return; this test
  // pins the helper's contract: "give up polling after timeoutMs and
  // return false" without any side effect that would imply
  // confirmation.
  it('returns false when the propagation line never appears within timeout', async () => {
    // Time-travelling clock: each `now()` call advances by 10ms so
    // the polling loop's deadline check passes naturally without
    // wall-clock sleeps. The simulated log NEVER matches.
    let now = 0;
    const result = await waitForAgyToReadModel(
      '/fake/log',
      'Gemini 3.1 Pro (High)',
      {
        timeoutMs: 50,
        pollIntervalMs: 1,
        now: () => {
          now += 10;
          return now;
        },
        readFile: async () =>
          'I0529 boot ...\nI0529 still waiting on backend ...\n',
      },
    );
    expect(result).toBe(false);
  });

  // The abort signal lets the caller (server.ts spawn pipeline) stop
  // polling when the child process exits — without it, a still-
  // polling watcher would leak past the run's lifetime and could be
  // matched by a later concurrent agy run's log content, releasing
  // the wrong lock.
  it('returns false immediately when the abort signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const result = await waitForAgyToReadModel(
      '/fake/log',
      'Gemini 3.1 Pro (High)',
      {
        timeoutMs: 10_000,
        pollIntervalMs: 1,
        abortSignal: controller.signal,
        readFile: async () => {
          calls++;
          return '';
        },
      },
    );
    expect(result).toBe(false);
    // Never even entered the poll body because the helper short-
    // circuited on the already-aborted signal.
    expect(calls).toBe(0);
  });

  // Aborting MID-POLL must wake the helper from its setTimeout so
  // the caller is not blocked waiting out the rest of pollIntervalMs.
  it('wakes from setTimeout when abort signal fires during polling', async () => {
    const controller = new AbortController();
    // Fire the abort after the first read returns no match.
    let calls = 0;
    const startedAt = Date.now();
    const result = await waitForAgyToReadModel(
      '/fake/log',
      'Gemini 3.1 Pro (High)',
      {
        timeoutMs: 10_000,
        // Long poll interval — if the helper waited it out we'd see
        // ~500ms elapsed in test. Abort should cut that short.
        pollIntervalMs: 500,
        abortSignal: controller.signal,
        readFile: async () => {
          calls++;
          if (calls === 1) {
            setTimeout(() => controller.abort(), 10);
          }
          return '';
        },
      },
    );
    const elapsed = Date.now() - startedAt;
    expect(result).toBe(false);
    expect(elapsed).toBeLessThan(450);
  });
});
