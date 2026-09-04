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
const WEB_STARTUP_TIMEOUT_MS = 35_000;
const DESKTOP_STARTUP_TIMEOUT_MS = 15_000;

type ProcessAliveProbe = () => boolean;

function assertSpawnedProcessAlive(appName: string, isProcessAlive: ProcessAliveProbe | undefined): void {
  if (isProcessAlive?.() === false) {
    throw new Error(`${appName} exited before exposing status`);
  }
}

export async function inspectDaemonRuntime(runtime: AppRuntimeLookup, timeoutMs = 800): Promise<DaemonStatusSnapshot | null> {
  try {
    return await getSidecarStatus<DaemonStatusSnapshot>(convergedStamp(runtime, APP_KEYS.DAEMON), { timeoutMs });
  } catch {
    return null;
  }
}

export async function waitForDaemonRuntime(
  runtime: AppRuntimeLookup,
  timeoutMs = DAEMON_STARTUP_TIMEOUT_MS,
  isProcessAlive?: ProcessAliveProbe,
): Promise<DaemonStatusSnapshot> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    assertSpawnedProcessAlive(APP_KEYS.DAEMON, isProcessAlive);
    const snapshot = await inspectDaemonRuntime(runtime, 800);
    if (snapshot?.url != null) return snapshot;
    assertSpawnedProcessAlive(APP_KEYS.DAEMON, isProcessAlive);
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  assertSpawnedProcessAlive(APP_KEYS.DAEMON, isProcessAlive);
  throw new Error("daemon did not expose status in time");
}

export async function inspectWebRuntime(runtime: AppRuntimeLookup, timeoutMs = 800): Promise<WebStatusSnapshot | null> {
  try {
    return await getSidecarStatus<WebStatusSnapshot>(convergedStamp(runtime, APP_KEYS.WEB), { timeoutMs });
  } catch {
    return null;
  }
}

export async function waitForWebRuntime(
  runtime: AppRuntimeLookup,
  timeoutMs = WEB_STARTUP_TIMEOUT_MS,
  isProcessAlive?: ProcessAliveProbe,
): Promise<WebStatusSnapshot> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    assertSpawnedProcessAlive(APP_KEYS.WEB, isProcessAlive);
    const snapshot = await inspectWebRuntime(runtime, 800);
    if (snapshot?.url != null) return snapshot;
    assertSpawnedProcessAlive(APP_KEYS.WEB, isProcessAlive);
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  assertSpawnedProcessAlive(APP_KEYS.WEB, isProcessAlive);
  throw new Error("web did not expose status in time");
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
