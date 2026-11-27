import {
  APP_KEYS,
  type DaemonStatusSnapshot,
  type DesktopStatusSnapshot,
  type WebStatusSnapshot,
} from "@open-design/sidecar-proto";
import { getSidecarStatus, type SidecarStamp } from "@open-design/sidecar";

export type AppRuntimeLookup = {
  base: string;
  namespace: string;
};

function convergedStamp(runtime: AppRuntimeLookup, app: (typeof APP_KEYS)[keyof typeof APP_KEYS]): SidecarStamp {
  return {
    app,
    channel: "local",
    mode: "dev",
    namespace: runtime.namespace,
    source: "tools-dev",
  };
}

export const DAEMON_STARTUP_TIMEOUT_MS = 120_000;
// Concurrent CI workers can need longer for Next dev cold initialization.
const WEB_STARTUP_TIMEOUT_MS = process.env.CI === "true" ? 120_000 : 35_000;
const DESKTOP_STARTUP_TIMEOUT_MS = 15_000;
const DAEMON_STARTUP_TIMEOUT_ENV = "OD_TOOLS_DEV_DAEMON_STARTUP_TIMEOUT_MS";
const WEB_STARTUP_TIMEOUT_ENV = "OD_TOOLS_DEV_WEB_STARTUP_TIMEOUT_MS";
const STATUS_PROBE_TIMEOUT_MS = 800;

function readStartupTimeoutMs(key: string, fallbackMs: number): number {
  const value = process.env[key];
  if (value == null) return fallbackMs;
  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`${key} must be a positive integer in milliseconds`);
  }
  return timeoutMs;
}

export function validateStartupTimeouts(): void {
  readStartupTimeoutMs(DAEMON_STARTUP_TIMEOUT_ENV, DAEMON_STARTUP_TIMEOUT_MS);
  readStartupTimeoutMs(WEB_STARTUP_TIMEOUT_ENV, WEB_STARTUP_TIMEOUT_MS);
}

type ProcessAliveProbe = () => boolean;

function assertSpawnedProcessAlive(appName: string, isProcessAlive: ProcessAliveProbe | undefined): void {
  if (isProcessAlive?.() === false) {
    throw new Error(`${appName} exited before exposing status`);
  }
}

async function waitForHttpRuntime<T extends { url: string | null }>(
  appName: string,
  inspect: (timeoutMs: number) => Promise<T | null>,
  timeoutMs: number,
  isProcessAlive?: ProcessAliveProbe,
): Promise<T> {
  const startedAt = performance.now();
  const remainingMs = () => Math.ceil(timeoutMs - (performance.now() - startedAt));
  for (;;) {
    assertSpawnedProcessAlive(appName, isProcessAlive);
    const probeBudgetMs = remainingMs();
    if (probeBudgetMs <= 0) break;
    const snapshot = await inspect(Math.min(STATUS_PROBE_TIMEOUT_MS, probeBudgetMs));
    if (snapshot?.url != null && remainingMs() > 0) return snapshot;

    assertSpawnedProcessAlive(appName, isProcessAlive);
    const pollBudgetMs = remainingMs();
    if (pollBudgetMs <= 0) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(150, pollBudgetMs)));
  }
  throw new Error(`${appName} did not expose status in time (${timeoutMs} ms)`);
}

export async function inspectDaemonRuntime(runtime: AppRuntimeLookup, timeoutMs = STATUS_PROBE_TIMEOUT_MS): Promise<DaemonStatusSnapshot | null> {
  try {
    return await getSidecarStatus<DaemonStatusSnapshot>(convergedStamp(runtime, APP_KEYS.DAEMON), { timeoutMs });
  } catch {
    return null;
  }
}

export async function waitForDaemonRuntime(
  runtime: AppRuntimeLookup,
  timeoutMs = readStartupTimeoutMs(DAEMON_STARTUP_TIMEOUT_ENV, DAEMON_STARTUP_TIMEOUT_MS),
  isProcessAlive?: ProcessAliveProbe,
): Promise<DaemonStatusSnapshot> {
  return waitForHttpRuntime(APP_KEYS.DAEMON, (probeMs) => inspectDaemonRuntime(runtime, probeMs), timeoutMs, isProcessAlive);
}

export async function inspectWebRuntime(runtime: AppRuntimeLookup, timeoutMs = STATUS_PROBE_TIMEOUT_MS): Promise<WebStatusSnapshot | null> {
  try {
    return await getSidecarStatus<WebStatusSnapshot>(convergedStamp(runtime, APP_KEYS.WEB), { timeoutMs });
  } catch {
    return null;
  }
}

export async function waitForWebRuntime(
  runtime: AppRuntimeLookup,
  timeoutMs = readStartupTimeoutMs(WEB_STARTUP_TIMEOUT_ENV, WEB_STARTUP_TIMEOUT_MS),
  isProcessAlive?: ProcessAliveProbe,
): Promise<WebStatusSnapshot> {
  return waitForHttpRuntime(APP_KEYS.WEB, (probeMs) => inspectWebRuntime(runtime, probeMs), timeoutMs, isProcessAlive);
}

export async function inspectDesktopRuntime(runtime: AppRuntimeLookup, timeoutMs = 800): Promise<DesktopStatusSnapshot | null> {
  try {
    return await getSidecarStatus<DesktopStatusSnapshot>(convergedStamp(runtime, APP_KEYS.DESKTOP), { timeoutMs });
  } catch {
    return null;
  }
}

export async function waitForDesktopRuntime(
  runtime: AppRuntimeLookup,
  timeoutMs = DESKTOP_STARTUP_TIMEOUT_MS,
  isProcessAlive?: ProcessAliveProbe,
): Promise<DesktopStatusSnapshot> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    assertSpawnedProcessAlive(APP_KEYS.DESKTOP, isProcessAlive);
    const snapshot = await inspectDesktopRuntime(runtime, 800);
    if (snapshot != null) return snapshot;
    assertSpawnedProcessAlive(APP_KEYS.DESKTOP, isProcessAlive);
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  assertSpawnedProcessAlive(APP_KEYS.DESKTOP, isProcessAlive);
  throw new Error("desktop did not expose status in time");
}
