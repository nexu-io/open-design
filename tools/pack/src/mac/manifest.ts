import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ToolPackConfig } from "../config.js";

export async function readPackagedVersion(config: ToolPackConfig): Promise<string> {
  if (config.appVersion != null) return config.appVersion;
  const packageJsonPath = join(config.workspaceRoot, "apps", "packaged", "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: unknown };
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error(`missing apps/packaged package version in ${packageJsonPath}`);
  }
  return packageJson.version;
}
