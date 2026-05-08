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
 * Match strategy is intentionally narrow: name the syscall (the
 * `setTypeOfService` literal), and verify the error code is the
 * expected `EINVAL`. We avoid swallowing every `EINVAL` because that
 * code is also raised by genuine bugs (bad config values, malformed
 * arguments to other syscalls). Exported so a unit test can pin the
 * exact shape this branch matches.
 */
export function isHarmlessSocketOptionError(value: unknown): boolean {
  if (!(value instanceof Error)) return false;
  const message = typeof value.message === "string" ? value.message : "";
  if (!message) return false;
  const code =
    typeof (value as NodeJS.ErrnoException).code === "string"
      ? (value as NodeJS.ErrnoException).code
      : "";
  // Primary shape: undici / Node socket initialiser. The error message
  // string is constructed by libuv as `<syscall> <errcode>`.
  if (message.includes("setTypeOfService") && (code === "EINVAL" || message.includes("EINVAL"))) {
    return true;
  }
  return false;
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
  // For unknown errors we re-throw via `setImmediate` so Node's
  // default uncaughtException behaviour (process death + crash dialog)
  // is preserved end-to-end. Adding the handler at all does not
  // suppress that path — it only short-circuits the specific harmless
  // shapes we recognise.
  process.on("uncaughtException", (error) => {
    if (isHarmlessSocketOptionError(error)) {
      logger.warn("packaged desktop swallowed harmless socket option error", { error });
      return;
    }
    setImmediate(() => {
      throw error;
    });
  });
  process.on("unhandledRejection", (reason) => {
    if (isHarmlessSocketOptionError(reason)) {
      logger.warn("packaged desktop swallowed harmless socket option rejection", { reason });
      return;
    }
    logger.error("packaged desktop unhandled rejection", { reason });
  });
  process.on("beforeExit", (code) => {
    logger.warn("packaged desktop beforeExit", { code });
  });
  process.on("exit", (code) => {
    logger.warn("packaged desktop exit", { code });
  });
}
