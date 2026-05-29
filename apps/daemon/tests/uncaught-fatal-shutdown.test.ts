// The daemon's `uncaughtException` / `unhandledRejection` handlers must
// preserve Node's fatal-exit semantics. Installing a listener silences
// Node's default crash path, so we have to call `process.exit(1)`
// explicitly after a bounded posthog-node flush. Without this guarantee
// the process would log telemetry and then keep serving requests with a
// corrupted state — the codex-reviewed regression on PR #2527.
//
// This file pins the contract that's hard to assert from the server.ts
// integration suite (which has no way to throw inside Express handlers
// without crashing vitest). We re-implement the relevant shutdown helper
// shape here and verify:
//
//   - captureSafety is invoked exactly once even on repeated faults
//   - shutdown() is invoked and either resolves or times out
//   - process.exit(1) is called after the race resolves
//   - the bounded timeout fires when shutdown hangs

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FATAL_FLUSH_TIMEOUT_MS = 1000;

type CaptureSafetyArgs = {
  eventName: string;
  appVersion: string;
  properties: Record<string, unknown>;
};

interface FakeAnalyticsService {
  captureSafety: (args: CaptureSafetyArgs) => Promise<void>;
  shutdown: () => Promise<void>;
}

function buildFatalShutdown(
  analyticsService: FakeAnalyticsService,
  exitFn: (code: number) => void,
): (eventName: string, properties: Record<string, unknown>) => void {
  // Mirrors `triggerFatalShutdown` in apps/daemon/src/server.ts. Kept in
  // sync with that helper by structure — the unit assertions below
  // verify each invariant the server-side path also relies on.
  let fatalShuttingDown = false;
  return (eventName, properties) => {
    if (fatalShuttingDown) return;
    fatalShuttingDown = true;
    // Await captureSafety BEFORE shutdown — the real captureSafety does
    // an internal `await readInstallationIdSafe()`, so a sync
    // fire-and-forget here would let shutdown() drain an empty queue.
    const flushSequence = (async () => {
      try {
        await analyticsService.captureSafety({
          eventName,
          appVersion: '1.0.0',
          properties,
        });
      } catch {
        // capture must never block the exit path
      }
      await analyticsService.shutdown();
    })();
    void Promise.race([
      flushSequence,
      new Promise<void>((resolve) => setTimeout(resolve, FATAL_FLUSH_TIMEOUT_MS)),
    ]).finally(() => {
      exitFn(1);
    });
  };
}

let captureSafetyMock: ReturnType<typeof vi.fn<(args: CaptureSafetyArgs) => Promise<void>>>;
let shutdownMock: ReturnType<typeof vi.fn<() => Promise<void>>>;
let exitMock: ReturnType<typeof vi.fn<(code: number) => void>>;
let analytics: FakeAnalyticsService;
let exit: (code: number) => void;

beforeEach(() => {
  captureSafetyMock = vi.fn<(args: CaptureSafetyArgs) => Promise<void>>().mockResolvedValue(undefined);
  shutdownMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  exitMock = vi.fn<(code: number) => void>();
  analytics = {
    captureSafety: captureSafetyMock,
    shutdown: shutdownMock,
  };
  exit = exitMock;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('daemon fatal-shutdown helper', () => {
  it('flushes posthog-node and exits with code 1 on uncaughtException', async () => {
    const fatal = buildFatalShutdown(analytics, exit);

    fatal('daemon_uncaught_exception', { error_message: 'boom' });

    expect(captureSafetyMock).toHaveBeenCalledTimes(1);
    expect(captureSafetyMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'daemon_uncaught_exception' }),
    );

    // shutdown() resolved synchronously — let the microtask queue drain.
    await vi.runAllTimersAsync();
    expect(shutdownMock).toHaveBeenCalledTimes(1);
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('still exits even when shutdown() hangs past the timeout (bounded flush)', async () => {
    // Simulate posthog-node never resolving — network hang during exit.
    shutdownMock.mockReturnValue(new Promise<void>(() => undefined));

    const fatal = buildFatalShutdown(analytics, exit);
    fatal('daemon_uncaught_exception', { error_message: 'stuck-flush' });

    // Advance just past the bounded timeout.
    await vi.advanceTimersByTimeAsync(FATAL_FLUSH_TIMEOUT_MS + 1);

    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('captures only once even when multiple faults fire before exit completes', async () => {
    const fatal = buildFatalShutdown(analytics, exit);

    fatal('daemon_uncaught_exception', { error_message: 'first' });
    fatal('daemon_unhandled_rejection', { error_message: 'second' });
    fatal('daemon_uncaught_exception', { error_message: 'third' });

    expect(captureSafetyMock).toHaveBeenCalledTimes(1);
    expect(captureSafetyMock).toHaveBeenCalledWith(
      expect.objectContaining({ properties: { error_message: 'first' } }),
    );

    await vi.runAllTimersAsync();
    // Single exit call too — re-entry must not produce a second process.exit.
    expect(exitMock).toHaveBeenCalledTimes(1);
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('still tries to exit when captureSafety itself throws', async () => {
    captureSafetyMock.mockRejectedValue(new Error('posthog client died'));

    const fatal = buildFatalShutdown(analytics, exit);
    fatal('daemon_uncaught_exception', { error_message: 'capture-explodes' });

    await vi.runAllTimersAsync();
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  // Regression test for the codex review on PR #2527 (second pass):
  // captureSafety must complete (event enqueued in posthog-node) BEFORE
  // shutdown() drains the queue. A previous fire-and-forget shape let
  // shutdown race ahead of the internal `await readInstallationIdSafe()`
  // inside captureSafety, so the crash event was lost during exit.
  it('waits for the captureSafety promise to settle before invoking shutdown', async () => {
    const events: string[] = [];
    captureSafetyMock.mockImplementation(async () => {
      // Simulate the real captureSafety: an async distinct-id read
      // happens before client.capture() can run. Give it a tangible
      // delay so the ordering assertion below has a real gap to observe.
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      events.push('capture-enqueued');
    });
    shutdownMock.mockImplementation(async () => {
      // Give shutdown its own delay too. Without this, capture's resolve
      // microtask synchronously schedules shutdown's resolve in the same
      // tick and we can't observe the intermediate "capture done /
      // shutdown not yet" state that proves the ordering contract.
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      events.push('shutdown-flush');
    });

    const fatal = buildFatalShutdown(analytics, exit);
    fatal('daemon_uncaught_exception', { error_message: 'order-check' });

    // After 50ms only capture has run — shutdown is waiting on its own timer.
    await vi.advanceTimersByTimeAsync(50);
    expect(events).toEqual(['capture-enqueued']);
    expect(shutdownMock).toHaveBeenCalledTimes(1);
    expect(exitMock).not.toHaveBeenCalled();

    // After another 50ms shutdown completes too, then exit fires.
    await vi.advanceTimersByTimeAsync(50);
    expect(events).toEqual(['capture-enqueued', 'shutdown-flush']);
    await vi.runAllTimersAsync();
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  it('still aborts and exits if captureSafety hangs past the bounded timeout', async () => {
    // Capture hangs forever (e.g. installationId read stuck on FS).
    captureSafetyMock.mockImplementation(() => new Promise<void>(() => undefined));

    const fatal = buildFatalShutdown(analytics, exit);
    fatal('daemon_uncaught_exception', { error_message: 'capture-hangs' });

    // shutdown must NOT run while capture is still pending — that was
    // the original race the previous round of review identified.
    await vi.advanceTimersByTimeAsync(500);
    expect(shutdownMock).not.toHaveBeenCalled();
    expect(exitMock).not.toHaveBeenCalled();

    // The outer bounded timeout still kicks in and forces exit.
    await vi.advanceTimersByTimeAsync(FATAL_FLUSH_TIMEOUT_MS);
    expect(exitMock).toHaveBeenCalledWith(1);
  });
});
