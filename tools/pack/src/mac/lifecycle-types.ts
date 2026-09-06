import type { DesktopStatusSnapshot } from "@open-design/sidecar-proto";

export type MacStartSource = "built" | "installed" | "system-applications" | "user-applications";
export type MacStartResult = { appPath: string; executablePath: string; logPath: string; namespace: string; pid: number; source: MacStartSource; status: DesktopStatusSnapshot | null };
export type MacInspectResult = { cdp: unknown; status: DesktopStatusSnapshot | null };
export type MacStopResult = { gracefulRequested: boolean; namespace: string; remainingPids: number[]; status: "not-running" | "partial" | "stopped"; stoppedPids: number[] };
export type MacInstallResult = { detached: boolean; dmgPath: string; installedAppPath: string; mountPoint: string; namespace: string };
export type MacUninstallResult = { installedAppPath: string; namespace: string; removed: boolean; stop: MacStopResult };
export type MacCleanupResult = { detachedMount: boolean; namespace: string; outputRoot: string; removedOutputRoot: boolean; removedRuntimeNamespaceRoot: boolean; runtimeNamespaceRoot: string; stop: MacStopResult };
