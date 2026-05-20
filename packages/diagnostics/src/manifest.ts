import { arch, hostname, platform, release, totalmem, type } from "node:os";

import type { CollectedFile } from "./sources.js";

export interface DiagnosticsAppInfo {
  name: string;
  version?: string | undefined;
  channel?: string | undefined;
  packaged?: boolean | undefined;
}

export interface DiagnosticsContext {
  app: DiagnosticsAppInfo;
  /** Identifies which surface triggered the export ("daemon-http", "desktop-ipc"). */
  source: string;
  /** Active runtime namespace, when known. */
  namespace?: string | undefined;
  /** Daemon URL or other endpoint that the UI was connected to. */
  endpoint?: string | undefined;
  /** Whether the host process could reach the daemon when triggering. */
  daemonReachable?: boolean | undefined;
  /** Free-form flags or notes. Will be JSON-stringified into the manifest. */
  extra?: Record<string, unknown> | undefined;
  /**
   * Upstream warnings to merge into the manifest's `warnings` array.
   * Useful when the host knows a category of data is unavailable (e.g.
   * file logs in non-sidecar launches) and wants to surface that fact
   * without producing fake "missing file" entries.
   */
  warnings?: string[] | undefined;
}

export interface DiagnosticsManifest {
  exportedAt: string;
  app: DiagnosticsAppInfo;
  source: string;
  namespace?: string | undefined;
  endpoint?: string | undefined;
  daemonReachable?: boolean | undefined;
  files: {
    name: string;
    absolutePath: string;
    bytes: number;
    error?: string | undefined;
  }[];
  warnings: string[];
  extra?: Record<string, unknown> | undefined;
}

export interface MachineInfo {
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  type: string;
  totalMemoryBytes: number;
  nodeVersion: string;
  pid: number;
  ppid: number;
  cwd: string;
  username?: string | undefined;
}

export function buildManifest(context: DiagnosticsContext, files: CollectedFile[]): DiagnosticsManifest {
  const warnings: string[] = [...(context.warnings ?? [])];
  for (const file of files) {
    if (file.error) warnings.push(`${file.name}: ${file.error}`);
  }
  return {
    exportedAt: new Date().toISOString(),
    app: context.app,
    source: context.source,
    namespace: context.namespace,
    endpoint: context.endpoint,
    daemonReachable: context.daemonReachable,
    files: files.map((file) => ({
      name: file.name,
      absolutePath: file.absolutePath,
      bytes: file.bytes,
      error: file.error,
    })),
    warnings,
    extra: context.extra,
  };
}

export function buildMachineInfo(username: string | undefined): MachineInfo {
  return {
    hostname: hostname(),
    platform: platform(),
    release: release(),
    arch: arch(),
    type: type(),
    totalMemoryBytes: totalmem(),
    nodeVersion: process.version,
    pid: process.pid,
    ppid: process.ppid,
    cwd: process.cwd(),
    username,
  };
}

export function diagnosticsFileName(prefix: string, now: Date = new Date()): string {
  const iso = now.toISOString().replace(/[:.]/g, "-").replace(/-\d{3}Z$/, "Z");
  return `${prefix}-${iso}.zip`;
}
