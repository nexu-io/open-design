/**
 * Defensive uncaught-exception filter for the dev / source-built desktop
 * Electron main process.
 *
 * The packaged Electron entry (`apps/packaged/src/logging.ts`) already
 * carries the same filter, where it was added for issue #895 (the
 * `setTypeOfService EINVAL` crash from undici socket internals on certain
 * macOS / VPN configurations). The same crash reproduces on the dev
 * entry when users switch settings tabs because the renderer fires a
 * fresh `fetch` and undici tries to set the IP_TOS byte on the outbound
 * socket; on a kernel that refuses, the rejection bubbles to Electron's
 * default handler and surfaces as the "JavaScript error in main process"
 * dialog reported in issue #647.
 *
 * Why this file isn't a direct import from `apps/packaged`: AGENTS.md
 * forbids one app package from importing another app's private `src/`.
 * The honest fix is to promote the helper to a shared workspace package
 * (e.g. `@open-design/platform`); doing that as part of this bug-fix
 * sprint would balloon the PR. Until that promotion lands, this module
 * is the source of truth for the desktop entry's filter and the two
 * copies should stay in sync. Any change to the matching rules here
 * should land in `apps/packaged/src/logging.ts` in the same PR.
 *
 * Behaviour contract (mirrors the packaged version):
 *
 *  1. `isHarmlessSocketOptionError(value)` recognises the canonical
 *     undici `setTypeOfService EINVAL` shape and nothing else. A
 *     contradicting `code` (e.g. `EACCES`) explicitly fails the match
 *     so real bugs don't get hidden.
 *
 *  2. The installed `uncaughtException` handler logs harmless errors
 *     and returns silently. For anything else it removes itself from
 *     the listener list and re-throws via `setImmediate`, restoring
 *     Node's default crash path so Electron's native error dialog
 *     renders exactly as it would without this filter.
 *
 *  3. `unhandledRejection` mirrors the same harmless / fall-through
 *     split.
 */

/**
 * Recognise the known-harmless `setTypeOfService EINVAL` shape thrown by
 * undici socket internals when the kernel refuses to set the IP_TOS byte
 * on an outbound socket. Exported so a unit test can pin the exact
 * surface this filter matches.
 */
export function isHarmlessSocketOptionError(value: unknown): boolean {
  if (!(value instanceof Error)) return false;
  const message = typeof value.message === 'string' ? value.message : '';
  if (!message) return false;
  if (!message.includes('setTypeOfService')) return false;
  const code = (value as NodeJS.ErrnoException).code;
  if (typeof code === 'string' && code.length > 0) {
    // Structured code is authoritative when present. Only EINVAL
    // qualifies; anything else (EACCES, EPERM, ECONNRESET, …) is a
    // contradicting signal and the filter rejects the match so a real
    // bug carrying a stale `setTypeOfService` substring in its message
    // doesn't slip through.
    return code === 'EINVAL';
  }
  // No structured code: fall back to message-based detection. libuv's
  // error string is `<syscall> <errcode>` so the EINVAL token sits
  // alongside the syscall name.
  return message.includes('EINVAL');
}

/** Minimal logger surface the desktop entry already has by way of
 *  `console.*`. Exposed as an injectable parameter so tests can capture
 *  log calls without mocking the console. */
export interface DesktopErrorFilterLogger {
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

/** Build the named handler so a unit test can drive it without
 *  installing it on the live `process` object. */
export function createDesktopUncaughtExceptionHandler(
  logger: DesktopErrorFilterLogger,
): (error: unknown) => void {
  const handler = (error: unknown): void => {
    if (isHarmlessSocketOptionError(error)) {
      logger.warn('desktop main swallowed harmless socket option error', { error });
      return;
    }
    logger.error('desktop main fatal uncaught exception', { error });
    process.removeListener('uncaughtException', handler);
    setImmediate(() => {
      throw error;
    });
  };
  return handler;
}

/** Install the filter on `process`. Idempotent across the dev entry's
 *  hot-reload paths because Node's listener registry deduplicates
 *  identical function references; we capture the once-built handler
 *  inside this module so repeated calls don't pile up. */
let installedHandler: ((error: unknown) => void) | null = null;

export function attachDesktopProcessErrorFilter(
  logger: DesktopErrorFilterLogger = consoleLogger(),
): void {
  if (installedHandler !== null) return;
  const handler = createDesktopUncaughtExceptionHandler(logger);
  installedHandler = handler;
  process.on('uncaughtException', handler);
  process.on('unhandledRejection', (reason) => {
    if (isHarmlessSocketOptionError(reason)) {
      logger.warn('desktop main swallowed harmless socket option rejection', { reason });
      return;
    }
    logger.error('desktop main unhandled rejection', { reason });
  });
}

function consoleLogger(): DesktopErrorFilterLogger {
  return {
    warn: (message, meta) => {
      if (meta === undefined) console.warn(message);
      else console.warn(message, meta);
    },
    error: (message, meta) => {
      if (meta === undefined) console.error(message);
      else console.error(message, meta);
    },
  };
}
