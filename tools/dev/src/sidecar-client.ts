import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MESSAGES,
  type DaemonStatusSnapshot,
  type DesktopStatusSnapshot,
  type WebStatusSnapshot,
} from "@open-design/sidecar-proto";
import { isWindowsNamedPipePath, resolveAppIpcPath } from "@open-design/sidecar";
import { requestJsonIpc } from "@open-design/sidecar";
import { readdir, rm } from "node:fs/promises";

export type AppRuntimeLookup = {
  base: string;
  namespace: string;
};

export function resolveDaemonIpcPath(runtime: AppRuntimeLookup): string {
  return resolveAppIpcPath({ app: APP_KEYS.DAEMON, contract: OPEN_DESIGN_SIDECAR_CONTRACT, namespace: runtime.namespace });
}

export function resolveWebIpcPath(runtime: AppRuntimeLookup): string {
  return resolveAppIpcPath({ app: APP_KEYS.WEB, contract: OPEN_DESIGN_SIDECAR_CONTRACT, namespace: runtime.namespace });
}

export function resolveDesktopIpcPath(runtime: AppRuntimeLookup): string {
  return resolveAppIpcPath({ app: APP_KEYS.DESKTOP, contract: OPEN_DESIGN_SIDECAR_CONTRACT, namespace: runtime.namespace });
}

export async function inspectDaemonRuntime(runtime: AppRuntimeLookup, timeoutMs = 800): Promise<DaemonStatusSnapshot | null> {
  try {
    return await requestJsonIpc<DaemonStatusSnapshot>(resolveDaemonIpcPath(runtime), { type: SIDECAR_MESSAGES.STATUS }, { timeoutMs });
  } catch {
    return null;
  }
}

export async function waitForDaemonRuntime(runtime: AppRuntimeLookup, timeoutMs = 35000): Promise<DaemonStatusSnapshot> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await inspectDaemonRuntime(runtime, 800);
    if (snapshot?.url != null) return snapshot;
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error("daemon did not expose status in time");
}

export async function inspectWebRuntime(runtime: AppRuntimeLookup, timeoutMs = 800): Promise<WebStatusSnapshot | null> {
  try {
    return await requestJsonIpc<WebStatusSnapshot>(resolveWebIpcPath(runtime), { type: SIDECAR_MESSAGES.STATUS }, { timeoutMs });
  } catch {
    return null;
  }
}

export async function waitForWebRuntime(runtime: AppRuntimeLookup, timeoutMs = 35000): Promise<WebStatusSnapshot> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await inspectWebRuntime(runtime, 800);
    if (snapshot?.url != null) return snapshot;
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error("web did not expose status in time");
}

export async function inspectDesktopRuntime(runtime: AppRuntimeLookup, timeoutMs = 800): Promise<DesktopStatusSnapshot | null> {
  try {
    return await requestJsonIpc<DesktopStatusSnapshot>(resolveDesktopIpcPath(runtime), { type: SIDECAR_MESSAGES.STATUS }, { timeoutMs });
  } catch {
    return null;
  }
}

export async function waitForDesktopRuntime(runtime: AppRuntimeLookup, timeoutMs = 15000): Promise<DesktopStatusSnapshot> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await inspectDesktopRuntime(runtime, 800);
    if (snapshot != null) return snapshot;
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error("desktop did not expose status in time");
}

export type TrayStatusSnapshot = {
  isRunning: boolean;
  port: number;
  url: string | null;
  autoStart: boolean;
  version: string;
};

export function resolveTrayIpcPath(runtime: AppRuntimeLookup): string {
  return resolveAppIpcPath({ app: APP_KEYS.TRAY, contract: OPEN_DESIGN_SIDECAR_CONTRACT, namespace: runtime.namespace });
}

export async function inspectTrayRuntime(runtime: AppRuntimeLookup, timeoutMs = 800): Promise<TrayStatusSnapshot | null> {
  try {
    return await requestJsonIpc<TrayStatusSnapshot>(resolveTrayIpcPath(runtime), { type: SIDECAR_MESSAGES.STATUS }, { timeoutMs });
  } catch {
    return null;
  }
}

export async function waitForTrayRuntime(runtime: AppRuntimeLookup, timeoutMs = 15000): Promise<TrayStatusSnapshot> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await inspectTrayRuntime(runtime, 800);
    if (snapshot != null) return snapshot;
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error("tray did not expose status in time");
}

/** Generate a unique namespace suffix to avoid pipe/socket conflicts after daemon restart */
export function uniqueNamespace(baseNamespace: string): string {
  return `${baseNamespace}-${Date.now()}`;
}

/**
 * Try to clean up any stale IPC pipe/socket from a previous run.
 * On Windows, named pipes may linger after a crash; on Unix, stale sockets may remain.
 * Returns the cleaned-up path if any, otherwise null.
 */
export async function cleanupStaleIpc(runtime: AppRuntimeLookup): Promise<string | null> {
  const ipcPath = resolveDaemonIpcPath(runtime);

  if (!isWindowsNamedPipePath(ipcPath)) {
    try {
      await rm(ipcPath, { force: true });
      return ipcPath;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Retry a function up to `maxRetries` times, sleeping `delayMs` between attempts.
 * Useful for recovering from EACCES/EPIPE on Windows named pipe bind.
 */
export async function retryWithIpcRecovery<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable = msg.includes("EACCES") ||
        msg.includes("EPERM") ||
        msg.includes("pipe") ||
        msg.includes("binding") ||
        msg.includes("ACCESS");
      if (isRetryable) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * List all historical namespace directories under toolsDevRoot that don't match the current namespace.
 */
export async function listStaleNamespaces(
  toolsDevRoot: string,
  currentNamespace: string,
): Promise<string[]> {
  const baseNamespace = currentNamespace.split("-").slice(0, -1).join("-");
  try {
    const entries = await readdir(toolsDevRoot);
    return entries.filter((entry) => {
      const isHistorical = entry.startsWith(`${baseNamespace}-`) && entry !== currentNamespace;
      return isHistorical;
    });
  } catch {
    return [];
  }
}
