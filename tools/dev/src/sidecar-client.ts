import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MESSAGES,
  type DaemonStatusSnapshot,
  type DesktopStatusSnapshot,
  type WebStatusSnapshot,
} from "@open-design/sidecar-proto";
import { requestJsonIpc, resolveAppIpcPath } from "@open-design/sidecar";

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
