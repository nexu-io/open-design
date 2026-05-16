import { appendFileSync } from "node:fs";

import type { SidecarStamp } from "@open-design/sidecar-proto";

import type { PackagedNamespacePaths } from "./paths.js";

const DESKTOP_LOG_ECHO_ENV = "OD_DESKTOP_LOG_ECHO";

type LogLevel = "error" | "info" | "warn";

export type PackagedDesktopLogger = {
  error(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
};

function normalizeError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  return error;
}

/**
 * Recognise known-harmless socket option errors so the packaged main
 * process can swallow them instead of surfacing Electron's "JavaScript
 * error in main process" dialog (issue #895).
 *
 * The flagship case is undici throwing `setTypeOfService EINVAL` from
 * its socket setup path: certain macOS / VPN configurations refuse to
 * let the kernel set the IP_TOS byte on outbound sockets. The QoS
 * marking failing has no functional impact on the request — the socket
 * still connects and serves traffic — so the right behaviour is to
 * log + ignore, not to crash.
 *
 * Match strategy is intentionally narrow:
 *   1. The error message must name the `setTypeOfService` syscall.
 *   2. The structured `code` property is **authoritative** when
 *      present: it must equal `EINVAL` for the error to qualify.
 *      A `code` of anything else (e.g. `EACCES`) is treated as a
 *      contradicting signal and the filter rejects the match —
 *      otherwise an `EACCES` permission failure with a stale or
 *      copy-pasted `EINVAL` substring in the message would slip
 *      through.
 *   3. Only when `code` is absent (some libuv builds don't populate
 *      it on raw thrown Errors) do we fall back to looking for the
 *      `EINVAL` token in the message.
 *
 * We never swallow every `EINVAL`: that code is raised by plenty of
 * real bugs (bad config values, malformed arguments to other
 * syscalls). Exported so a unit test can pin the exact shape this
 * branch matches.
 */
export function isHarmlessSocketOptionError(value: unknown): boolean {
  if (!(value instanceof Error)) return false;
  const message = typeof value.message === "string" ? value.message : "";
  if (!message) return false;
  if (!message.includes("setTypeOfService")) return false;
  const code = (value as NodeJS.ErrnoException).code;
  if (typeof code === "string" && code.length > 0) {
    // Structured code present — it has to be EINVAL. Anything else
    // (EACCES, EPERM, ECONNRESET, …) is a contradicting signal and
    // we let it crash so real bugs don't get hidden.
    return code === "EINVAL";
  }
  // No structured code: fall back to message-based detection. The
  // libuv error string is `<syscall> <errcode>` so the EINVAL token
  // appears alongside the syscall name.
  return message.includes("EINVAL");
}

/**
 * Build the named `uncaughtException` handler used by
 * `attachPackagedDesktopProcessLogging`. Exposed as its own factory
 * so a unit test can drive it without bringing up the full logging
 * pipeline.
 *
 * Behaviour contract (issue #906 review):
 *   - Harmless `setTypeOfService EINVAL` shapes from undici socket
 *     internals are logged at warn level and the function returns
 *     silently. The process continues running.
 *   - Anything else is logged at error level, then the handler
 *     **removes itself from `process.uncaughtException` listeners**
 *     and re-throws via `setImmediate`. Removing the listener first
 *     is critical: without it, the re-throw re-enters the same
 *     handler, schedules another setImmediate, and the packaged
 *     main process spins forever instead of terminating —
 *     reproduced and called out by mrcfps + lefarcen on the first
 *     #906 review pass. With the listener gone the next throw has
 *     no `uncaughtException` listener to land in, Node's default
 *     crash path takes over, and Electron's native "JavaScript
 *     error in main process" dialog renders as it did before this
 *     code existed.
 */
export function createFatalUncaughtExceptionHandler(
  logger: PackagedDesktopLogger,
): (error: unknown) => void {
  const handler = (error: unknown): void => {
    if (isHarmlessSocketOptionError(error)) {
      logger.warn("packaged desktop swallowed harmless socket option error", { error });
      return;
    }
    logger.error("packaged desktop fatal uncaught exception", { error });
    process.removeListener("uncaughtException", handler);
    setImmediate(() => {
      throw error;
    });
  };
  return handler;
}

/**
 * Parallel factory for the `unhandledRejection` listener installed by
 * `attachPackagedDesktopProcessLogging`. The harmless / fall-through
 * split must match `createFatalUncaughtExceptionHandler`: harmless
 * `setTypeOfService EINVAL` rejections log at warn and return,
 * anything else logs at error, removes the listener, and re-throws
 * via `setImmediate`.
 *
 * Without the detach + rethrow a non-harmless rejection would land in
 * this log line and silently keep the process alive, which would hide
 * real main-process bugs from Node/Electron's default fail-fast path
 * (the exact regression Siri-Ray and the codex P2 thread flagged on
 * the parallel desktop filter in PR #1298). The same matcher feeds
 * both factories, so the apps/desktop sibling stays in lockstep.
 */
export function createFatalUnhandledRejectionHandler(
  logger: PackagedDesktopLogger,
): (reason: unknown) => void {
  const handler = (reason: unknown): void => {
    if (isHarmlessSocketOptionError(reason)) {
      logger.warn("packaged desktop swallowed harmless socket option rejection", { reason });
      return;
    }
    logger.error("packaged desktop unhandled rejection", { reason });
    process.removeListener("unhandledRejection", handler);
    setImmediate(() => {
      throw reason;
    });
  };
  return handler;
}

function normalizeMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (meta == null) return undefined;
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [key, key === "error" || key === "reason" ? normalizeError(value) : value]),
  );
}

function serializeMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  try {
    return `${JSON.stringify({
      level,
      message,
      timestamp,
      ...(meta == null ? {} : { meta: normalizeMeta(meta) }),
    })}\n`;
  } catch (error) {
    return `${JSON.stringify({
      level,
      message,
      timestamp,
      meta: {
        serializationError: error instanceof Error ? error.message : String(error),
      },
    })}\n`;
  }
}

export function createPackagedDesktopLogger(paths: PackagedNamespacePaths): PackagedDesktopLogger {
  const echo = process.env[DESKTOP_LOG_ECHO_ENV] !== "0";

  const write = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    appendFileSync(paths.desktopLogPath, serializeMessage(level, message, meta), "utf8");
  };

  const logger: PackagedDesktopLogger = {
    error(message, meta) {
      write("error", message, meta);
    },
    info(message, meta) {
      write("info", message, meta);
    },
    warn(message, meta) {
      write("warn", message, meta);
    },
  };

  const originalConsole = {
    error: console.error.bind(console),
    info: console.info.bind(console),
    log: console.log.bind(console),
    warn: console.warn.bind(console),
  };

  console.log = (...args: unknown[]) => {
    logger.info("console.log", { args });
    if (echo) originalConsole.log(...args);
  };
  console.info = (...args: unknown[]) => {
    logger.info("console.info", { args });
    if (echo) originalConsole.info(...args);
  };
  console.warn = (...args: unknown[]) => {
    logger.warn("console.warn", { args });
    if (echo) originalConsole.warn(...args);
  };
  console.error = (...args: unknown[]) => {
    logger.error("console.error", { args });
    if (echo) originalConsole.error(...args);
  };

  return logger;
}

export function attachPackagedDesktopProcessLogging(options: {
  logger: PackagedDesktopLogger;
  paths: PackagedNamespacePaths;
  stamp: SidecarStamp;
}): void {
  const { logger, paths, stamp } = options;

  logger.info("packaged desktop starting", {
    daemonDataRoot: paths.dataRoot,
    electronUserDataRoot: paths.electronUserDataRoot,
    executablePath: process.execPath,
    logPath: paths.desktopLogPath,
    namespace: stamp.namespace,
    pid: process.pid,
    ppid: process.ppid,
    resourceRoot: paths.resourceRoot,
    runtimeRoot: paths.runtimeRoot,
    source: stamp.source,
  });

  process.on("uncaughtExceptionMonitor", (error) => {
    logger.error("packaged desktop uncaught exception", { error });
  });
  // Defensive filter for known-harmless network errors. undici can throw
  // `setTypeOfService EINVAL` from socket internals on certain macOS /
  // VPN configurations (issue #895): the kernel rejects setting the
  // IP_TOS byte on the outbound socket, but the connection itself is
  // healthy — we just don't get the QoS / DSCP marking, which the app
  // doesn't depend on. Without this filter the rejection bubbles to
  // Electron's default handler and surfaces as a native "JavaScript
  // error in main process" dialog the next time anything in the
  // renderer does a fetch (e.g. opening Settings → Pets → Community).
  //
  // For non-harmless errors the handler restores Node's default
  // uncaughtException behaviour: it removes itself from the listener
  // list and re-throws via `setImmediate`. With no `uncaughtException`
  // handlers registered, Node's default crash path takes over (stack
  // trace + non-zero exit) and Electron's own "JavaScript error in
  // main process" dialog renders as it would have before this code
  // existed. See `createFatalUncaughtExceptionHandler` for the
  // unit-tested factory.
  process.on("uncaughtException", createFatalUncaughtExceptionHandler(logger));
  // The unhandledRejection handler must mirror the uncaughtException
  // policy: harmless EINVAL shapes are swallowed, every other reason
  // takes the fail-fast path so a real main-process bug surfaces
  // through Node/Electron's default crash semantics instead of being
  // hidden as a log line. See `createFatalUnhandledRejectionHandler`.
  process.on("unhandledRejection", createFatalUnhandledRejectionHandler(logger));
  process.on("beforeExit", (code) => {
    logger.warn("packaged desktop beforeExit", { code });
  });
  process.on("exit", (code) => {
    logger.warn("packaged desktop exit", { code });
  });
}
