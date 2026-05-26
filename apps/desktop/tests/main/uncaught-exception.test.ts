/**
 * Regression coverage for the desktop main entry's harmless-socket-option
 * filter, added to fix issue #647. The packaged entry has the parallel
 * filter pinned in `apps/packaged/tests/logging.test.ts`; this suite
 * mirrors it so the two copies of the matcher stay in lockstep until the
 * helper is promoted to a shared workspace package.
 *
 * Match strategy is intentionally narrow — name the syscall AND verify
 * the EINVAL code — so a future regression that broadens the filter to
 * "every EINVAL" (which would silently swallow real bugs) trips a test.
 *
 * @see https://github.com/nexu-io/open-design/issues/647
 * @see https://github.com/nexu-io/open-design/issues/895
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDesktopUncaughtExceptionHandler,
  createDesktopUnhandledRejectionHandler,
  isHarmlessSocketOptionError,
  type DesktopErrorFilterLogger,
} from '../../src/main/uncaught-exception.js';

function stubLogger(): DesktopErrorFilterLogger {
  return {
    warn: vi.fn(),
    error: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isHarmlessSocketOptionError (desktop main, issue #647)', () => {
  it('matches the canonical undici setTypeOfService EINVAL shape', () => {
    const error = new Error('setTypeOfService EINVAL') as NodeJS.ErrnoException;
    error.code = 'EINVAL';
    error.syscall = 'setTypeOfService';
    expect(isHarmlessSocketOptionError(error)).toBe(true);
  });

  it('matches when only the message has both tokens (no code property set)', () => {
    const error = new Error('setTypeOfService EINVAL');
    expect(isHarmlessSocketOptionError(error)).toBe(true);
  });

  it('matches when code is EINVAL and message references setTypeOfService', () => {
    const error = new Error('Error: setTypeOfService failed') as NodeJS.ErrnoException;
    error.code = 'EINVAL';
    expect(isHarmlessSocketOptionError(error)).toBe(true);
  });

  it('does NOT match a generic EINVAL', () => {
    // Guard against a future refactor that broadens the filter to
    // "every EINVAL" and silently swallows configuration errors.
    const error = new Error('write EINVAL') as NodeJS.ErrnoException;
    error.code = 'EINVAL';
    expect(isHarmlessSocketOptionError(error)).toBe(false);
  });

  it('does NOT match a setTypeOfService error with a different errno (EACCES)', () => {
    const error = new Error('setTypeOfService EACCES') as NodeJS.ErrnoException;
    error.code = 'EACCES';
    expect(isHarmlessSocketOptionError(error)).toBe(false);
  });

  it('treats the structured code as authoritative when it contradicts the message', () => {
    // A stale `setTypeOfService EINVAL` substring in a message paired
    // with a real EACCES code must NOT swallow the underlying
    // permission failure.
    const error = new Error('setTypeOfService EINVAL') as NodeJS.ErrnoException;
    error.code = 'EACCES';
    expect(isHarmlessSocketOptionError(error)).toBe(false);
  });

  it('rejects non-Error values', () => {
    expect(isHarmlessSocketOptionError('setTypeOfService EINVAL')).toBe(false);
    expect(isHarmlessSocketOptionError(null)).toBe(false);
    expect(isHarmlessSocketOptionError(undefined)).toBe(false);
    expect(isHarmlessSocketOptionError({ message: 'setTypeOfService EINVAL', code: 'EINVAL' })).toBe(false);
  });

  it('rejects an Error with a non-string message', () => {
    const error = new Error();
    (error as { message?: unknown }).message = 42;
    expect(isHarmlessSocketOptionError(error)).toBe(false);
  });
});

describe('createDesktopUncaughtExceptionHandler (desktop main, issue #647)', () => {
  it('logs at warn level and returns silently for the harmless shape', () => {
    const logger = stubLogger();
    const handler = createDesktopUncaughtExceptionHandler(logger);
    const error = new Error('setTypeOfService EINVAL') as NodeJS.ErrnoException;
    error.code = 'EINVAL';
    const removeListener = vi.spyOn(process, 'removeListener');
    const setImmediateSpy = vi.spyOn(global, 'setImmediate');

    handler(error);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
    expect(removeListener).not.toHaveBeenCalled();
    expect(setImmediateSpy).not.toHaveBeenCalled();
  });

  it('logs at error level, detaches itself, and re-throws for any other error', () => {
    const logger = stubLogger();
    const handler = createDesktopUncaughtExceptionHandler(logger);
    const error = new Error('boom');
    const removeListener = vi.spyOn(process, 'removeListener').mockReturnValue(process);
    // Capture the deferred throw without letting it escape into the
    // test runner.
    const setImmediateSpy = vi
      .spyOn(global, 'setImmediate')
      .mockImplementation(((cb: () => void) => {
        // Capture the callback for assertion but don't invoke it
        // synchronously, the real semantics rely on the call
        // happening AFTER the listener has been removed.
        return cb as unknown as NodeJS.Immediate;
      }) as unknown as typeof setImmediate);

    handler(error);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
    // Listener removal MUST happen before the deferred throw so the
    // crash falls through to Node's default handler rather than
    // re-entering this filter.
    expect(removeListener).toHaveBeenCalledWith('uncaughtException', handler);
    expect(setImmediateSpy).toHaveBeenCalledTimes(1);
  });
});

describe('createDesktopUnhandledRejectionHandler (desktop main, issue #647 review follow-up)', () => {
  it('logs at warn level and returns silently for a harmless rejection', () => {
    const logger = stubLogger();
    const handler = createDesktopUnhandledRejectionHandler(logger);
    const reason = new Error('setTypeOfService EINVAL') as NodeJS.ErrnoException;
    reason.code = 'EINVAL';
    const removeListener = vi.spyOn(process, 'removeListener');
    const setImmediateSpy = vi.spyOn(global, 'setImmediate');

    handler(reason);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
    expect(removeListener).not.toHaveBeenCalled();
    expect(setImmediateSpy).not.toHaveBeenCalled();
  });

  it('logs at error level, detaches itself, and re-throws for a non-harmless rejection', () => {
    // Regression guard: a previous revision of this file logged
    // non-harmless rejections and returned, which kept the dev main
    // process alive after arbitrary rejected promises and hid real
    // bugs from Node/Electron's default fail-fast path. The
    // unhandledRejection handler must mirror the uncaughtException
    // fall-through so only the EINVAL shape is swallowed.
    const logger = stubLogger();
    const handler = createDesktopUnhandledRejectionHandler(logger);
    const reason = new Error('real ipc registration failure');
    const removeListener = vi.spyOn(process, 'removeListener').mockReturnValue(process);
    const setImmediateSpy = vi
      .spyOn(global, 'setImmediate')
      .mockImplementation(((cb: () => void) => cb as unknown as NodeJS.Immediate) as unknown as typeof setImmediate);

    handler(reason);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(removeListener).toHaveBeenCalledWith('unhandledRejection', handler);
    expect(setImmediateSpy).toHaveBeenCalledTimes(1);
  });

  it('treats non-Error rejection reasons as non-harmless and falls through', () => {
    // Primitive rejections (e.g. `Promise.reject(42)`) are never the
    // undici socket shape, so the handler must take the fail-fast
    // path rather than silently log them away.
    const logger = stubLogger();
    const handler = createDesktopUnhandledRejectionHandler(logger);
    const removeListener = vi.spyOn(process, 'removeListener').mockReturnValue(process);
    const setImmediateSpy = vi
      .spyOn(global, 'setImmediate')
      .mockImplementation(((cb: () => void) => cb as unknown as NodeJS.Immediate) as unknown as typeof setImmediate);

    handler(42);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith('unhandledRejection', handler);
    expect(setImmediateSpy).toHaveBeenCalledTimes(1);
  });
});
