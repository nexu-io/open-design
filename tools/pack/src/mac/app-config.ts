import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

import type { ToolPackConfig } from "../config.js";
import { pathExists } from "./fs.js";
import type { SeededAppConfigPaths } from "./types.js";

export const PACKAGED_CONFIG_PATH_ENV = "OD_PACKAGED_CONFIG_PATH";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

export function resolveSeededAppConfigPaths(config: ToolPackConfig): SeededAppConfigPaths {
  const configuredDataDir = process.env.OD_DATA_DIR?.trim();
  const sourceDataDir = configuredDataDir
    ? resolveProjectRelativePath(configuredDataDir, config.workspaceRoot)
    : join(config.workspaceRoot, ".od");
  return {
    sourcePath: join(sourceDataDir, "app-config.json"),
    targetPath: join(config.roots.runtime.namespaceRoot, "data", "app-config.json"),
  };
}

export async function seedPackagedAppConfig(config: ToolPackConfig): Promise<void> {
  if (config.portable) return;

  const { sourcePath, targetPath } = resolveSeededAppConfigPaths(config);
  if (!(await pathExists(sourcePath))) return;

  const raw = await readFile(sourcePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
    throw new Error(`packaged app-config seed must be a JSON object: ${sourcePath}`);
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

export async function writeLaunchPackagedConfig(config: ToolPackConfig, appPath: string): Promise<string> {
  const embeddedConfigPath = join(appPath, "Contents", "Resources", "open-design-config.json");
  const raw = (await pathExists(embeddedConfigPath))
    ? JSON.parse(await readFile(embeddedConfigPath, "utf8")) as unknown
    : {};
  if (!isRecord(raw)) {
    throw new Error(`packaged launch config source must be a JSON object: ${embeddedConfigPath}`);
  }

  const launchConfigPath = join(config.roots.runtime.namespaceRoot, "runtime", "open-design-config.json");
  await mkdir(dirname(launchConfigPath), { recursive: true });
  await writeFile(
    launchConfigPath,
    `${JSON.stringify(
      {
        ...raw,
        namespace: config.namespace,
        namespaceBaseRoot: config.roots.runtime.namespaceBaseRoot,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return launchConfigPath;
}

function expandHomePrefix(raw: string): string {
  const home = homedir();
  if (raw === "~" || raw === "$HOME" || raw === "${HOME}") return home;
  const match = /^(~|\$\{HOME\}|\$HOME)[/\\](.*)$/.exec(raw);
  return match ? join(home, match[2] ?? "") : raw;
}

function resolveProjectRelativePath(raw: string, projectRoot: string): string {
  const expanded = expandHomePrefix(raw);
  return isAbsolute(expanded) ? expanded : resolve(projectRoot, expanded);
}
