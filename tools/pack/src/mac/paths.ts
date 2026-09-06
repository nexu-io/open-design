import { join } from "node:path";

import { APP_KEYS } from "@open-design/sidecar-proto";

import type { ToolPackConfig } from "../config/index.js";
export type MacPaths = Readonly<{ installApplicationsRoot: string; mountPoint: string }>;

export function macAppExecutablePath(appPath: string, executableName: string): string {
  return join(appPath, "Contents", "MacOS", executableName);
}

export function resolveMacPaths(config: ToolPackConfig): MacPaths {
  const namespaceRoot = config.roots.output.namespaceRoot;
  const installApplicationsRoot = join(namespaceRoot, "install", "Applications");
  return {
    installApplicationsRoot,
    mountPoint: join(namespaceRoot, "mount"),
  };
}


export function desktopLogPath(config: ToolPackConfig): string {
  return join(config.roots.runtime.namespaceRoot, "logs", APP_KEYS.ELECTRON, "latest.log");
}
