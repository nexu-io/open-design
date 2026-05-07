/**
 * Regression coverage for the OD_LEGACY_DATA_DIR migration-aware
 * daemon status timeout in apps/packaged/src/sidecars.ts.
 *
 * Background: when the user is recovering 0.3.x `.od/` data via
 * OD_LEGACY_DATA_DIR, apps/daemon/src/legacy-data-migrator.ts runs a
 * synchronous payload copy at module import time, before the daemon
 * sidecar can answer status. With the default 35-second status budget
 * a multi-GB legacy `.od/projects` or `.od/artifacts` tree can hit the
 * timeout while staging is still copying, after which the parent tears
 * the child down mid-promotion and can leave dataDir half-promoted
 * even with the in-process rollback.
 *
 * @see apps/packaged/src/sidecars.ts
 * @see apps/daemon/src/legacy-data-migrator.ts
 * @see https://github.com/nexu-io/open-design/issues/710
 */
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

import { resolveDaemonStatusTimeoutMs, waitForStatus } from '../src/sidecars.js';

describe('resolveDaemonStatusTimeoutMs', () => {
  it('uses the default 35-second budget for normal cold boots', () => {
    expect(resolveDaemonStatusTimeoutMs({})).toBe(35_000);
  });

  it('treats an empty OD_LEGACY_DATA_DIR as unset', () => {
    expect(resolveDaemonStatusTimeoutMs({ OD_LEGACY_DATA_DIR: '' })).toBe(35_000);
  });

  it('extends the budget to 30 minutes when OD_LEGACY_DATA_DIR is set', () => {
    // The packaged sidecar must give the daemon a long-enough window to
    // sync-copy a multi-GB legacy `.od/` payload. Anything below ~10
    // minutes was historically observed to time out on real installs.
    const value = resolveDaemonStatusTimeoutMs({
      OD_LEGACY_DATA_DIR: '/path/to/old/.od',
    });
    expect(value).toBeGreaterThanOrEqual(10 * 60 * 1000);
    expect(value).toBe(30 * 60 * 1000);
  });

  it('falls back to process.env when called with no argument', () => {
    const original = process.env.OD_LEGACY_DATA_DIR;
    try {
      delete process.env.OD_LEGACY_DATA_DIR;
      expect(resolveDaemonStatusTimeoutMs()).toBe(35_000);
      process.env.OD_LEGACY_DATA_DIR = '/some/legacy/path';
      expect(resolveDaemonStatusTimeoutMs()).toBe(30 * 60 * 1000);
    } finally {
      if (original == null) delete process.env.OD_LEGACY_DATA_DIR;
      else process.env.OD_LEGACY_DATA_DIR = original;
    }
  });
});

/**
 * Build a child-process stand-in that satisfies the `watch.child`
 * shape `waitForStatus` consumes. We only use `once('exit')`,
 * `off('exit')`, and the synchronous `exitCode` / `signalCode`
 * fields, so an EventEmitter plus those two properties is enough.
 */
function fakeChild(): EventEmitter & {
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  fireExit: (code: number | null, signal: NodeJS.Signals | null) => void;
} {
  const emitter = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    fireExit: (code: number | null, signal: NodeJS.Signals | null) => void;
  };
  emitter.exitCode = null;
  emitter.signalCode = null;
  emitter.fireExit = (code, signal) => {
    emitter.exitCode = code;
    emitter.signalCode = signal;
    emitter.emit('exit', code, signal);
  };
  return emitter;
}

describe('waitForStatus child-exit fast-fail', () => {
  // mrcfps round-7: when OD_LEGACY_DATA_DIR is set the daemon status
  // budget extends to 30 minutes for legitimate large-payload migrations.
  // But a daemon that throws LegacyMigrationError at startup (invalid
  // legacy dir, existing target payload, symlink, marker write failure)
  // exits before reporting status, and waiting the full 30 minutes makes
  // the packaged app look hung. Racing the IPC polling against the
  // child's exit event surfaces the failure promptly with a pointer to
  // the daemon log.

  it('rejects within milliseconds when the child exits before status is ready', async () => {
    const child = fakeChild();
    const ipcPath = '/tmp/od-test-no-such-ipc-' + Date.now();
    const logPath = '/tmp/od-test-daemon.log';

    const startedAt = Date.now();
    const promise = waitForStatus<{ url: string | null }>(
      ipcPath,
      (status) => status.url != null,
      30 * 60 * 1000,
      { child, logPath },
    );

    // Simulate the daemon throwing in its startup migrator and exiting
    // immediately. With the old code, the wait would have blocked for
    // the full 30-minute budget; with the fix it must reject fast.
    setTimeout(() => child.fireExit(1, null), 50);

    let captured: unknown;
    try {
      await promise;
    } catch (err) {
      captured = err;
    }
    const elapsed = Date.now() - startedAt;

    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).message).toMatch(/daemon exited before reporting status/);
    expect((captured as Error).message).toContain('code=1');
    expect((captured as Error).message).toContain(logPath);

    // The whole point: don't sit through DAEMON_MIGRATION_STATUS_TIMEOUT_MS.
    // Allow generous slack for slow CI runners; the fix should bound this
    // to roughly the IPC poll cadence (150ms) plus a couple of timer ticks.
    expect(elapsed).toBeLessThan(2_000);
  });

  it('detects a child that exited synchronously before waitForStatus was entered', async () => {
    const child = fakeChild();
    // Pretend the daemon process already exited before we got here. The
    // 'exit' event has already fired and would not re-fire for a late
    // listener, so waitForStatus must read the synchronous exitCode /
    // signalCode fields to see the bad state.
    child.exitCode = 2;
    child.signalCode = null;

    const startedAt = Date.now();
    let captured: unknown;
    try {
      await waitForStatus<{ url: string | null }>(
        '/tmp/od-test-no-such-ipc-pre-' + Date.now(),
        (status) => status.url != null,
        30 * 60 * 1000,
        { child, logPath: '/tmp/od-test-daemon.log' },
      );
    } catch (err) {
      captured = err;
    }
    const elapsed = Date.now() - startedAt;

    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).message).toMatch(/daemon exited before reporting status/);
    expect((captured as Error).message).toContain('code=2');
    expect(elapsed).toBeLessThan(2_000);
  });
});
