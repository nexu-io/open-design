import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ToolPackConfig } from "./config.js";
import { toolPackShellDefinition } from "./shells.js";

export async function readRuntimeShellVersion(config: ToolPackConfig): Promise<string> {
  if (config.shellVersion != null) return config.shellVersion;
  if (config.releaseVersion != null) return config.releaseVersion;
  const shellDirectory = toolPackShellDefinition(config.shell).directory;
  const packageJsonPath = join(config.workspaceRoot, shellDirectory, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: unknown };
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error(`missing ${shellDirectory} package version in ${packageJsonPath}`);
  }
  return packageJson.version;
}

export function versionCoreForShellVersion(shellVersion: string): string {
  const match = /^(\d+\.\d+\.\d+)(?:[-.].*)?$/.exec(shellVersion);
  return match?.[1] ?? shellVersion;
}

export function versionFamilyForShellVersion(shellVersion: string): string | null {
  const match = /^(\d+\.\d+)\.\d+(?:[-.].*)?$/.exec(shellVersion);
  return match?.[1] ?? null;
}

export function electronBuilderVersionForShellVersion(shellVersion: string): string {
  return shellVersion;
}
