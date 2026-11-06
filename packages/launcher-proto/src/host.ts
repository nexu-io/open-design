import type { LauncherRuntimeDescriptor, LauncherVersionPointer } from "./index.js";

/** Main-process-only contract. Its absence preserves the historical entry path. */
export const LAUNCHER_HOST_CONTRACT_VERSION = 1 as const;
export const LAUNCHER_HOST_KEY = Symbol.for("open-design.launcher-host");
export type LauncherHostSelection = Readonly<{
  pointer: LauncherVersionPointer;
  reason: "active" | "active-delegated" | "last-successful";
}>;
export type LauncherHostRunningCode = Readonly<{
  source: "bundled" | "payload";
  version: string;
  appRoot: string;
  resourcesPath: string;
  executablePath: string;
}>;
export type LauncherHostIdentity = Readonly<{
  contractVersion: typeof LAUNCHER_HOST_CONTRACT_VERSION;
  installedAppPath: string;
  namespaceBaseRoot: string;
  running: LauncherHostRunningCode;
  selection: LauncherHostSelection | null;
  rolledBackFromVersion: string | null;
}>;

/** Application-facing intentions; journal and OS operations stay private to the host. */
export interface LauncherLifecycle {
  snapshot(): LauncherRuntimeDescriptor;
  reportReady(): Promise<void>;
  /** Validate prepared bytes without changing the next-start pointer. */
  validateCandidate(version: string, artifactRoot?: string): Promise<void>;
  /** Select a validated candidate for the next start; does not restart this process. */
  activateCandidate(version: string): Promise<LauncherRuntimeDescriptor>;
  /** Explicit user recovery action; normal readiness must never erase failure evidence. */
  resetFailedLaunch(): Promise<void>;
  protectsResource(path: string): Promise<boolean>;
  onSecondInstance(listener: (argv: readonly string[]) => void): void;
  requestRelaunch(): Promise<void>;
}
export type LauncherHost = LauncherHostIdentity & Readonly<LauncherLifecycle>;

export function readLauncherHost(): LauncherHost | null {
  const value = (globalThis as Record<symbol, unknown>)[LAUNCHER_HOST_KEY];
  if (value == null || typeof value !== "object") return null;
  const host = value as LauncherHost;
  return host.contractVersion === LAUNCHER_HOST_CONTRACT_VERSION ? host : null;
}
/** Publish once, without environment/argv propagation to children. */
export function publishLauncherHost(host: LauncherHost): void {
  Object.defineProperty(globalThis, LAUNCHER_HOST_KEY, {
    configurable: false, enumerable: false, writable: false,
    value: Object.freeze({ ...host, running: Object.freeze({ ...host.running }),
      selection: host.selection == null ? null : Object.freeze({ ...host.selection, pointer: Object.freeze({ ...host.selection.pointer }) }) }),
  });
}
