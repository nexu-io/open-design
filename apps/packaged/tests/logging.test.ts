/**
 * Regression coverage for the harmless-socket-option filter the
 * packaged Electron entry uses to swallow `setTypeOfService EINVAL`
 * undici crashes (issue #895). Without the filter, those errors
 * surface as native "JavaScript error in main process" dialogs the
 * moment a renderer fetch hits the affected socket option setter on
 * macOS / VPN configurations that don't allow IP_TOS marking.
 *
 * Match strategy is intentionally narrow — name the syscall AND
 * verify the EINVAL code — so a future regression that broadens the
 * filter to "every EINVAL" (which would silently swallow real bugs)
 * trips a test.
 *
 * @see https://github.com/nexu-io/open-design/issues/895
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createFatalUncaughtExceptionHandler,
  isHarmlessSocketOptionError,
  type PackagedDesktopLogger,
} from '../src/logging.js';

function stubLogger(): PackagedDesktopLogger {
  return {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isHarmlessSocketOptionError (issue #895)', () => {
  it('matches the canonical undici setTypeOfService EINVAL shape', () => {
    const error = new Error('setTypeOfService EINVAL') as NodeJS.ErrnoException;
    error.code = 'EINVAL';
    error.syscall = 'setTypeOfService';
    expect(isHarmlessSocketOptionError(error)).toBe(true);
  });

  it('matches when only the message has both tokens (no code property set)', () => {
    // Some libuv builds surface the error without populating the
    // `code` property — the message string itself is the sole signal.
    const error = new Error('setTypeOfService EINVAL');
    expect(isHarmlessSocketOptionError(error)).toBe(true);
  });

  it('matches when code is EINVAL and message references setTypeOfService', () => {
    const error = new Error('Error: setTypeOfService failed') as NodeJS.ErrnoException;
    error.code = 'EINVAL';
    expect(isHarmlessSocketOptionError(error)).toBe(true);
  });

  it('does NOT match a generic EINVAL — that code is also raised by real bugs', () => {
    // Guard against a future refactor that broadens the filter to
    // "every EINVAL" and silently swallows configuration errors.
    const error = new Error('write EINVAL') as NodeJS.ErrnoException;
    error.code = 'EINVAL';
    expect(isHarmlessSocketOptionError(error)).toBe(false);
  });

  it('does NOT match a setTypeOfService error with a different errno (e.g. EACCES)', () => {
    const error = new Error('setTypeOfService EACCES') as NodeJS.ErrnoException;
    error.code = 'EACCES';
    expect(isHarmlessSocketOptionError(error)).toBe(false);
  });

  // #906 review (lefarcen P2): the structured `code` property must be
  // authoritative when present. Without this guard a contradicting
  // EACCES code paired with a message containing both `setTypeOfService`
  // and `EINVAL` (a stale token, copy-pasted shape, or future libuv
  // formatting change) would slip through and silently swallow a real
  // permissions failure.
  it('does NOT match when code contradicts the message — code is authoritative (#906 review)', () => {
    const error = new Error('setTypeOfService EINVAL') as NodeJS.ErrnoException;
    error.code = 'EACCES';
    expect(isHarmlessSocketOptionError(error)).toBe(false);
  });

  it('does NOT match when code is a different errno but message has both tokens (defence-in-depth)', () => {
    const error = new Error('setTypeOfService EINVAL — extra context') as NodeJS.ErrnoException;
    error.code = 'EPERM';
    expect(isHarmlessSocketOptionError(error)).toBe(false);
  });

  it('does NOT match unrelated errors with similar shape', () => {
    const error = new Error('something happened');
    expect(isHarmlessSocketOptionError(error)).toBe(false);
  });

  it('does NOT match non-Error rejection values (preserves fail-fast for primitives)', () => {
    expect(isHarmlessSocketOptionError('setTypeOfService EINVAL')).toBe(false);
    expect(isHarmlessSocketOptionError(null)).toBe(false);
    expect(isHarmlessSocketOptionError(undefined)).toBe(false);
    expect(isHarmlessSocketOptionError({ message: 'setTypeOfService EINVAL' })).toBe(false);
  });

  it('does NOT match Error with empty message even if code is EINVAL', () => {
    const error = new Error('') as NodeJS.ErrnoException;
    error.code = 'EINVAL';
    expect(isHarmlessSocketOptionError(error)).toBe(false);
  });
});

// Regression coverage for the #906 review (mrcfps + lefarcen):
// the non-harmless branch must NOT re-enter itself when it re-throws.
// Without the explicit `process.removeListener` call, the rethrown
// error landed back in this same listener, scheduled another
// `setImmediate`, and the packaged main process span forever instead
// of terminating. The factory exposes the named handler so we can
// assert the listener-removal step in isolation.
describe('createFatalUncaughtExceptionHandler (issue #906)', () => {
  it('logs harmless socket option errors at warn level and returns silently', () => {
    const logger = stubLogger();
    const handler = createFatalUncaughtExceptionHandler(logger);
    const harmless = new Error('setTypeOfService EINVAL') as NodeJS.ErrnoException;
    harmless.code = 'EINVAL';

    const removeListenerSpy = vi.spyOn(process, 'removeListener');
    const setImmediateSpy = vi.spyOn(globalThis, 'setImmediate');

    handler(harmless);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
    // Critical: the harmless branch must not deregister or schedule
    // anything — the process must keep running normally.
    expect(removeListenerSpy).not.toHaveBeenCalled();
    expect(setImmediateSpy).not.toHaveBeenCalled();
  });

  it('removes itself from uncaughtException listeners before scheduling the rethrow (#906 P1)', () => {
    const logger = stubLogger();
    const handler = createFatalUncaughtExceptionHandler(logger);

    const removeListenerSpy = vi.spyOn(process, 'removeListener');
    // Stub setImmediate to capture the scheduled callback without
    // actually firing it (which would dump the rethrown error onto
    // vitest's own uncaughtException path).
    const scheduled: Array<() => void> = [];
    const setImmediateSpy = vi
      .spyOn(globalThis, 'setImmediate')
      .mockImplementation(((fn: () => void) => {
        scheduled.push(fn);
        return 0 as unknown as NodeJS.Immediate;
      }) as typeof setImmediate);

    const realBug = new Error('something genuinely broke');
    handler(realBug);

    expect(logger.error).toHaveBeenCalledTimes(1);
    // The actual #906 P1 fix: handler unregisters itself BEFORE the
    // rethrow is scheduled. Mirrors mrcfps's reproduction script.
    expect(removeListenerSpy).toHaveBeenCalledWith('uncaughtException', handler);
    const removeListenerOrder = removeListenerSpy.mock.invocationCallOrder[0]!;
    const setImmediateOrder = setImmediateSpy.mock.invocationCallOrder[0]!;
    expect(removeListenerOrder).toBeLessThan(setImmediateOrder);

    // The scheduled callback rethrows the original error so Node's
    // default uncaughtException path picks it up after the listener
    // is gone.
    expect(scheduled).toHaveLength(1);
    expect(() => scheduled[0]!()).toThrow(realBug);
  });

  it('does NOT re-enter itself when invoked twice with non-harmless errors (loop guard)', () => {
    // Belt-and-suspenders: even if a future refactor accidentally
    // forgot the removeListener call, this test would catch the
    // recursion the original review reproduced.
    const logger = stubLogger();
    const handler = createFatalUncaughtExceptionHandler(logger);

    const setImmediateCallCount: number[] = [];
    vi.spyOn(globalThis, 'setImmediate').mockImplementation(((fn: () => void) => {
      setImmediateCallCount.push(setImmediateCallCount.length);
      // Crucially do NOT actually call fn() — that would test the
      // recursion path through Node's process.emit, which is what
      // we're trying to break out of.
      void fn;
      return 0 as unknown as NodeJS.Immediate;
    }) as typeof setImmediate);

    handler(new Error('first'));
    handler(new Error('second'));

    // Each invocation schedules exactly one rethrow. If the handler
    // re-entered itself we'd see runaway scheduling.
    expect(setImmediateCallCount).toHaveLength(2);
    expect(logger.error).toHaveBeenCalledTimes(2);
  });
});
