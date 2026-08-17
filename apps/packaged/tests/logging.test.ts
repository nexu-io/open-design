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

import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  appendDesktopLogLine,
  createPackagedDesktopLogger,
  createFatalUncaughtExceptionHandler,
  createFatalUnhandledRejectionHandler,
  installStdioErrorGuard,
  isHarmlessSocketOptionError,
  isHarmlessStdoutError,
  type PackagedDesktopLogger,
} from '../src/logging.js';
import type { PackagedNamespacePaths } from '../src/paths.js';

const ORIGINAL_CONSOLE = {
  error: console.error,
  info: console.info,
  log: console.log,
  warn: console.warn,
};

function stubLogger(): PackagedDesktopLogger {
  return {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

afterEach(() => {
  console.error = ORIGINAL_CONSOLE.error;
  console.info = ORIGINAL_CONSOLE.info;
  console.log = ORIGINAL_CONSOLE.log;
  console.warn = ORIGINAL_CONSOLE.warn;
  vi.restoreAllMocks();
});

function makePaths(root: string, desktopLogPath = join(root, 'logs', 'desktop', 'latest.log')): PackagedNamespacePaths {
  return {
    cacheRoot: join(root, 'cache'),
    desktopIdentityPath: join(root, 'runtime', 'desktop-root.json'),
    desktopLogPath,
    dataRoot: join(root, 'data'),
    desktopLogsRoot: join(root, 'logs', 'desktop'),
    electronSessionDataRoot: join(root, 'user-data', 'session'),
    electronUserDataRoot: join(root, 'user-data'),
    headlessIdentityPath: join(root, 'runtime', 'headless-root.json'),
    installationRoot: root,
    installerObservationRoot: join(root, 'data', 'observations', 'installer'),
    logsRoot: join(root, 'logs'),
    namespaceRoot: root,
    resourceRoot: join(root, 'resources'),
    runtimeRoot: join(root, 'runtime'),
    updateRoot: join(root, 'updates'),
    webIdentityPath: join(root, 'runtime', 'web-root.json'),
  };
}

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

/**
 * Regression coverage for the packaged main-process EPIPE crash that
 * surfaces the first time a renderer lifecycle handler calls
 * `console.info(...)` in an Electron build with no controlling
 * terminal. The wrapper installed by `createPackagedDesktopLogger`
 * must swallow only the two known-safe stream-closure codes
 * (`EPIPE`, `ERR_STREAM_DESTROYED`) and re-throw anything else, so
 * real I/O failures are not silently dropped.
 */
describe('isHarmlessStdoutError (packaged console echo EPIPE guard)', () => {
  it('matches an Error with code: EPIPE', () => {
    const error = new Error('write EPIPE') as NodeJS.ErrnoException;
    error.code = 'EPIPE';
    expect(isHarmlessStdoutError(error)).toBe(true);
  });

  it('matches an Error with code: ERR_STREAM_DESTROYED', () => {
    const error = new Error('stream destroyed') as NodeJS.ErrnoException;
    error.code = 'ERR_STREAM_DESTROYED';
    expect(isHarmlessStdoutError(error)).toBe(true);
  });

  it('does NOT match a bare Error that mentions "broken pipe" in its message but has no code', () => {
    const error = new Error('broken pipe, write');
    expect(isHarmlessStdoutError(error)).toBe(false);
  });

  it('does NOT match an unrelated errno like EACCES even if the message mentions pipes', () => {
    const error = new Error('broken pipe while writing to log file') as NodeJS.ErrnoException;
    error.code = 'EACCES';
    expect(isHarmlessStdoutError(error)).toBe(false);
  });

  it('does NOT match non-objects (null, undefined, strings)', () => {
    expect(isHarmlessStdoutError(null)).toBe(false);
    expect(isHarmlessStdoutError(undefined)).toBe(false);
    expect(isHarmlessStdoutError('EPIPE')).toBe(false);
  });
});

describe('createPackagedDesktopLogger console echo EPIPE guard', () => {
  it('swallows an EPIPE thrown by the original console.info echo and still records the call to the desktop log file', () => {
    const root = mkdtempSync(join(tmpdir(), 'od-packaged-echo-epipe-'));
    const previousEcho = process.env.OD_DESKTOP_LOG_ECHO;
    // echo must be on (the default) for safeEcho to be in the path.
    delete process.env.OD_DESKTOP_LOG_ECHO;
    // Stub the host's console.info BEFORE constructing the logger so
    // the factory captures the throwing original as `originalConsole.info`
    // (the wrapper then calls safeEcho(originalConsole.info), which is
    // the only place the EPIPE filter is applied — see issue #6964).
    const epipe = new Error('write EPIPE') as NodeJS.ErrnoException;
    epipe.code = 'EPIPE';
    console.info = () => {
      throw epipe;
    };
    const desktopLogPath = join(root, 'desktop.log');
    try {
      createPackagedDesktopLogger(makePaths(root, desktopLogPath));

      // The wrapped call must NOT throw — the unwrapped version
      // crashed the main process via an uncaught exception that
      // propagated out of `Writable.write`.
      expect(() =>
        console.info('main window did-start-loading', { url: 'about:blank' }),
      ).not.toThrow();

      // The wrapper must have actually run (and called the file
      // logger) — not the bare stub. If the wrapper had been
      // bypassed, no record would land in the desktop log file.
      const line = readFileSync(desktopLogPath, 'utf8');
      expect(line).toContain('console.info');
      expect(line).toContain('main window did-start-loading');
    } finally {
      if (previousEcho == null) {
        delete process.env.OD_DESKTOP_LOG_ECHO;
      } else {
        process.env.OD_DESKTOP_LOG_ECHO = previousEcho;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('still re-throws non-harmless errors thrown by the original console.error echo and records the call to the desktop log file', () => {
    const root = mkdtempSync(join(tmpdir(), 'od-packaged-echo-other-'));
    const previousEcho = process.env.OD_DESKTOP_LOG_ECHO;
    delete process.env.OD_DESKTOP_LOG_ECHO;
    // Same before/after ordering as the EPIPE case: stub the host's
    // console.error BEFORE the factory so originalConsole.error
    // captures the throwing stub.
    const eacces = new Error('permission denied writing to log file') as NodeJS.ErrnoException;
    eacces.code = 'EACCES';
    console.error = () => {
      throw eacces;
    };
    const desktopLogPath = join(root, 'desktop.log');
    try {
      createPackagedDesktopLogger(makePaths(root, desktopLogPath));

      // The wrapper must surface non-harmless errors so real I/O
      // failures are not silently dropped.
      expect(() => console.error('fatal write failure')).toThrow(eacces);

      // The wrapper must have actually run (and called the file
      // logger BEFORE the echo) — proving the throw escaped via
      // safeEcho, not via the bare stub.
      const line = readFileSync(desktopLogPath, 'utf8');
      expect(line).toContain('console.error');
      expect(line).toContain('fatal write failure');
    } finally {
      if (previousEcho == null) {
        delete process.env.OD_DESKTOP_LOG_ECHO;
      } else {
        process.env.OD_DESKTOP_LOG_ECHO = previousEcho;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// Regression coverage for the gap `safeEcho`'s try/catch cannot close:
// a detached stdout/stderr pipe fails *asynchronously* (the stream
// emits its own 'error' event, e.g. from `process.nextTick` during
// internal `destroy()`), not as a synchronous throw from `.write()`.
// Reproduced live on a packaged Windows build: the crash's stack trace
// still showed `safeEcho`'s frames (because V8 fixes `.stack` at Error
// *construction* time, not throw time), which made it look like the
// try/catch had been bypassed when in fact it was never reached at all.
describe('installStdioErrorGuard (async stdio pipe-closure guard)', () => {
  function fakeStream(): NodeJS.WritableStream {
    return new EventEmitter() as unknown as NodeJS.WritableStream;
  }

  it('swallows an EPIPE emitted asynchronously on the stream, not thrown synchronously', () => {
    const stream = fakeStream();
    installStdioErrorGuard([stream]);

    const epipe = new Error('write EPIPE') as NodeJS.ErrnoException;
    epipe.code = 'EPIPE';

    // This is exactly what safeEcho's try/catch cannot see: nothing on
    // the call stack, just an 'error' event firing on its own.
    expect(() => (stream as unknown as EventEmitter).emit('error', epipe)).not.toThrow();
  });

  it('swallows an ERR_STREAM_DESTROYED emitted asynchronously on the stream', () => {
    const stream = fakeStream();
    installStdioErrorGuard([stream]);

    const destroyed = new Error('stream destroyed') as NodeJS.ErrnoException;
    destroyed.code = 'ERR_STREAM_DESTROYED';

    expect(() => (stream as unknown as EventEmitter).emit('error', destroyed)).not.toThrow();
  });

  it('re-throws a non-harmless error emitted on the stream instead of silently dropping it', () => {
    const stream = fakeStream();
    installStdioErrorGuard([stream]);

    const eacces = new Error('permission denied') as NodeJS.ErrnoException;
    eacces.code = 'EACCES';

    // EventEmitter re-throws synchronously out of emit() when an
    // 'error' listener itself throws.
    expect(() => (stream as unknown as EventEmitter).emit('error', eacces)).toThrow(eacces);
  });

  it('installs an independent guard per stream (stdout failure does not depend on stderr)', () => {
    const stdout = fakeStream();
    const stderr = fakeStream();
    installStdioErrorGuard([stdout, stderr]);

    const epipe = new Error('write EPIPE') as NodeJS.ErrnoException;
    epipe.code = 'EPIPE';

    expect(() => (stdout as unknown as EventEmitter).emit('error', epipe)).not.toThrow();
    expect(() => (stderr as unknown as EventEmitter).emit('error', epipe)).not.toThrow();
  });
});

describe('createPackagedDesktopLogger log-write failures', () => {
  it('drops descriptor-pressure append failures instead of throwing', () => {
    const emfile = new Error('too many files') as NodeJS.ErrnoException;
    emfile.code = 'EMFILE';
    const append = vi.fn(() => {
      throw emfile;
    });

    expect(appendDesktopLogLine('/tmp/latest.log', '{"level":"error"}\n', append)).toBe(false);
    expect(append).toHaveBeenCalledWith('/tmp/latest.log', '{"level":"error"}\n', 'utf8');
  });

  it('does not let desktop log append failures escape through the logger', () => {
    const root = mkdtempSync(join(tmpdir(), 'od-packaged-log-'));
    const previousEcho = process.env.OD_DESKTOP_LOG_ECHO;
    process.env.OD_DESKTOP_LOG_ECHO = '0';
    try {
      const logger = createPackagedDesktopLogger(makePaths(root, root));

      expect(() => logger.error('packaged desktop fatal uncaught exception')).not.toThrow();
      expect(() => console.error('renderer fetch failed')).not.toThrow();
    } finally {
      if (previousEcho == null) {
        delete process.env.OD_DESKTOP_LOG_ECHO;
      } else {
        process.env.OD_DESKTOP_LOG_ECHO = previousEcho;
      }
      rmSync(root, { recursive: true, force: true });
    }
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

// The parallel `unhandledRejection` listener mirrors the
// uncaughtException policy: harmless EINVAL rejections log at warn
// and return, anything else logs at error, detaches the listener, and
// schedules a re-throw via setImmediate so Node/Electron's default
// fail-fast path takes over. Before this factory landed, the inline
// listener logged non-harmless rejections and returned, which silently
// kept the main process alive after any rejected promise. Siri-Ray
// and the codex P2 thread on PR #1298 flagged the same gap on the
// parallel apps/desktop filter, so the two copies stay in lockstep.
describe('createFatalUnhandledRejectionHandler (issue #647 review follow-up)', () => {
  it('logs harmless socket option rejections at warn level and returns silently', () => {
    const logger = stubLogger();
    const handler = createFatalUnhandledRejectionHandler(logger);
    const harmless = new Error('setTypeOfService EINVAL') as NodeJS.ErrnoException;
    harmless.code = 'EINVAL';

    const removeListenerSpy = vi.spyOn(process, 'removeListener');
    const setImmediateSpy = vi.spyOn(globalThis, 'setImmediate');

    handler(harmless);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
    expect(removeListenerSpy).not.toHaveBeenCalled();
    expect(setImmediateSpy).not.toHaveBeenCalled();
  });

  it('removes itself from unhandledRejection listeners before scheduling the rethrow', () => {
    const logger = stubLogger();
    const handler = createFatalUnhandledRejectionHandler(logger);

    const removeListenerSpy = vi.spyOn(process, 'removeListener');
    const scheduled: Array<() => void> = [];
    const setImmediateSpy = vi
      .spyOn(globalThis, 'setImmediate')
      .mockImplementation(((fn: () => void) => {
        scheduled.push(fn);
        return 0 as unknown as NodeJS.Immediate;
      }) as typeof setImmediate);

    const realBug = new Error('failed ipc registration');
    handler(realBug);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(removeListenerSpy).toHaveBeenCalledWith('unhandledRejection', handler);
    const removeOrder = removeListenerSpy.mock.invocationCallOrder[0]!;
    const setImmediateOrder = setImmediateSpy.mock.invocationCallOrder[0]!;
    expect(removeOrder).toBeLessThan(setImmediateOrder);

    expect(scheduled).toHaveLength(1);
    expect(() => scheduled[0]!()).toThrow(realBug);
  });

  it('falls through for primitive rejection reasons (Promise.reject(42))', () => {
    // A primitive reason is never the undici socket shape, so the
    // handler must reach the fail-fast path. Without this guard a
    // `Promise.reject('boom')` would silently log and disappear.
    const logger = stubLogger();
    const handler = createFatalUnhandledRejectionHandler(logger);

    const removeListenerSpy = vi.spyOn(process, 'removeListener');
    const scheduled: Array<() => void> = [];
    vi
      .spyOn(globalThis, 'setImmediate')
      .mockImplementation(((fn: () => void) => {
        scheduled.push(fn);
        return 0 as unknown as NodeJS.Immediate;
      }) as typeof setImmediate);

    handler(42);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(removeListenerSpy).toHaveBeenCalledWith('unhandledRejection', handler);
    expect(scheduled).toHaveLength(1);
  });
});
