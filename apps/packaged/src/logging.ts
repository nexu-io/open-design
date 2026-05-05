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
  process.on("unhandledRejection", (reason) => {
    logger.error("packaged desktop unhandled rejection", { reason });
  });
  process.on("beforeExit", (code) => {
    logger.warn("packaged desktop beforeExit", { code });
  });
  process.on("exit", (code) => {
    logger.warn("packaged desktop exit", { code });
  });
}
