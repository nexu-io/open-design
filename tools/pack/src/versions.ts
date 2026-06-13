import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ToolPackConfig } from "./config.js";

export async function readRuntimeAppVersion(config: ToolPackConfig): Promise<string> {
  if (config.appVersion != null) return config.appVersion;
  const packageJsonPath = join(config.workspaceRoot, "apps", "packaged", "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: unknown };
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error(`missing apps/packaged package version in ${packageJsonPath}`);
  }
  return packageJson.version;
}

export function versionCoreForAppVersion(appVersion: string): string {
  const match = /^(\d+\.\d+\.\d+)(?:[-.].*)?$/.exec(appVersion);
  return match?.[1] ?? appVersion;
}

export function versionFamilyForAppVersion(appVersion: string): string | null {
  const match = /^(\d+\.\d+)\.\d+(?:[-.].*)?$/.exec(appVersion);
  return match?.[1] ?? null;
}

export function electronBuilderVersionForAppVersion(appVersion: string): string {
  const nightly = /^(\d+\.\d+\.\d+)\.nightly\.(\d+)$/i.exec(appVersion);
  if (nightly?.[1] != null && nightly[2] != null) return `${nightly[1]}-nightly.${nightly[2]}`;
  return appVersion;
}
