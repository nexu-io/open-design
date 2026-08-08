import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ToolPackConfig } from "./config.js";
import { toolPackShellDefinition } from "./shells.js";

export async function readRuntimeAppVersion(config: ToolPackConfig): Promise<string> {
  if (config.appVersion != null) return config.appVersion;
  const shellDirectory = toolPackShellDefinition(config.shell).directory;
  const packageJsonPath = join(config.workspaceRoot, shellDirectory, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: unknown };
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error(`missing ${shellDirectory} package version in ${packageJsonPath}`);
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
  return appVersion;
}
