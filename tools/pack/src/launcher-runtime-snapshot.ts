import { readFile, readdir, stat } from "node:fs/promises";

import {
  validateLauncherRuntimeDescriptor,
  type LauncherAttemptDescriptor,
  type LauncherRuntimeDescriptor,
  type LauncherVersionPointer,
} from "@open-design/launcher-proto";

import type { ToolPackConfig } from "./config.js";
import { resolveToolPackLauncherLayout } from "./launcher-layout.js";

export type ToolPackLauncherRuntimeSnapshot = {
  attempt: LauncherAttemptDescriptor | null;
  attemptsPath: string;
  channel: string;
  error?: string;
  exists: boolean;
  lastSuccessful: LauncherVersionPointer | null;
  active: LauncherVersionPointer | null;
  namespace: string;
  root: string;
  runtimePath: string;
  stateRoot: string;
  versionRoots: string[];
  versionsRoot: string;
};

export async function readToolPackLauncherRuntimeSnapshot(
  config: Pick<ToolPackConfig, "appVersion" | "namespace" | "roots">,
): Promise<ToolPackLauncherRuntimeSnapshot> {
  const launcher = resolveToolPackLauncherLayout(config);
  const paths = launcher.paths;
  const base = {
    attemptsPath: paths.attemptsPath,
    channel: launcher.channel,
    namespace: config.namespace,
    root: launcher.root,
    runtimePath: paths.runtimePath,
    stateRoot: paths.stateRoot,
    versionRoots: await listVersionRoots(paths.versionsRoot),
    versionsRoot: paths.versionsRoot,
  };

  const runtimeRaw = await readOptionalJson<LauncherRuntimeDescriptor>(paths.runtimePath);
  const attempt = await readOptionalJson<LauncherAttemptDescriptor>(paths.attemptsPath);
  if (runtimeRaw == null) {
    return {
      ...base,
      active: null,
      attempt,
      exists: false,
      lastSuccessful: null,
    };
  }

  try {
    const runtime = validateLauncherRuntimeDescriptor(runtimeRaw, {
      channel: launcher.channel,
      namespace: config.namespace,
    });
    return {
      ...base,
      active: runtime.active,
      attempt,
      exists: true,
      lastSuccessful: runtime.lastSuccessful,
    };
  } catch (error) {
    return {
      ...base,
      active: null,
      attempt,
      error: error instanceof Error ? error.message : String(error),
      exists: true,
      lastSuccessful: null,
    };
  }
}

async function readOptionalJson<T>(path: string): Promise<T | null> {
  const raw = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (raw == null) return null;
  return JSON.parse(raw) as T;
}

async function listVersionRoots(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const versions: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifest = await stat(`${root}/${entry.name}/manifest.json`).catch(() => null);
    if (manifest?.isFile()) versions.push(entry.name);
  }
  versions.sort();
  return versions;
}
