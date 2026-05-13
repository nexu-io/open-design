import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { ToolPackConfig } from "../config.js";
import { pathExists } from "./fs.js";
import type { WinBuiltAppManifest, WinPaths } from "./types.js";

export async function readPackagedVersion(config: ToolPackConfig): Promise<string> {
  if (config.appVersion != null) return config.appVersion;
  const packageJsonPath = join(config.workspaceRoot, "apps", "packaged", "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: unknown };
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error(`missing apps/packaged package version in ${packageJsonPath}`);
  }
  return packageJson.version;
}

type PackagedConfigEntrypoints = {
  daemonCliEntryRelative?: string;
  daemonSidecarEntryRelative?: string;
  webSidecarEntryRelative?: string;
};

function createPackagedConfig(
  config: ToolPackConfig,
  packagedVersion: string,
  entrypoints: PackagedConfigEntrypoints = {},
): Record<string, unknown> {
  return {
    appVersion: packagedVersion,
    ...entrypoints,
    namespace: config.namespace,
    ...(config.telemetryRelayUrl == null ? {} : { telemetryRelayUrl: config.telemetryRelayUrl }),
    ...(config.posthogKey == null ? {} : { posthogKey: config.posthogKey }),
    ...(config.posthogHost == null ? {} : { posthogHost: config.posthogHost }),
    webOutputMode: config.webOutputMode,
    ...(config.portable ? {} : { namespaceBaseRoot: config.roots.runtime.namespaceBaseRoot }),
  };
}

export async function writePackagedConfigFile(
  filePath: string,
  config: ToolPackConfig,
  packagedVersion: string,
  entrypoints: PackagedConfigEntrypoints = {},
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
      `${JSON.stringify(createPackagedConfig(config, packagedVersion, entrypoints), null, 2)}\n`,
    "utf8",
  );
}

export async function writePackagedConfig(
  config: ToolPackConfig,
  paths: WinPaths,
  packagedVersion: string,
  entrypoints: PackagedConfigEntrypoints = {},
): Promise<void> {
  await writePackagedConfigFile(paths.packagedConfigPath, config, packagedVersion, entrypoints);
}

export async function writeBuiltAppManifest(
  paths: WinPaths,
  manifest: Omit<WinBuiltAppManifest, "version">,
): Promise<void> {
  await mkdir(dirname(paths.builtManifestPath), { recursive: true });
  await writeFile(paths.builtManifestPath, `${JSON.stringify({ version: 1, ...manifest }, null, 2)}\n`, "utf8");
}

export async function readBuiltAppManifest(
  paths: WinPaths,
  options: { requireExecutable?: boolean } = {},
): Promise<WinBuiltAppManifest | null> {
  try {
    const manifest = JSON.parse(await readFile(paths.builtManifestPath, "utf8")) as WinBuiltAppManifest;
    if (manifest.version !== 1) return null;
    if (options.requireExecutable === true && !(await pathExists(manifest.executablePath))) return null;
    return manifest;
  } catch {
    return null;
  }
}
