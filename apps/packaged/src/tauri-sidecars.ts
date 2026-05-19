import { access, mkdir, readFile, realpath } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_DEFAULTS,
  SIDECAR_MODES,
  normalizeNamespace,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import { bootstrapSidecarRuntime, resolveAppIpcPath } from "@open-design/sidecar";
import { readProcessStamp } from "@open-design/platform";

import type { PackagedConfig, PackagedWebOutputMode, RawPackagedConfig } from "./config.js";
import { writePackagedWebIdentity } from "./identity.js";
import { resolvePackagedNamespacePaths } from "./paths.js";
import { startPackagedSidecars, type PackagedSidecarHandle } from "./sidecars.js";

const PACKAGED_CONFIG_PATH_ENV = "OD_PACKAGED_CONFIG_PATH";
const TAURI_RESOURCE_DIR_ENV = "OD_TAURI_RESOURCE_DIR";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function defaultNamespaceBaseRoot(): string {
  const odDataDir = process.env.OD_DATA_DIR;
  if (odDataDir != null && odDataDir.length > 0) {
    return join(resolve(odDataDir.replace(/^~/, homedir())), "namespaces");
  }

  switch (platform()) {
    case "darwin":
      return join(homedir(), "Library", "Application Support", "Open Design", "namespaces");
    case "win32":
      return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Open Design", "namespaces");
    default: {
      const xdgDataHome = process.env.XDG_DATA_HOME;
      const dataBase =
        xdgDataHome != null && xdgDataHome.length > 0
          ? xdgDataHome
          : join(homedir(), ".local", "share");
      return join(dataBase, "open-design", "namespaces");
    }
  }
}

function cleanOptionalString(value: string | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function resolveWebOutputMode(value: string | undefined): PackagedWebOutputMode {
  if (value == null || value.length === 0) return "server";
  if (value === "server" || value === "standalone") return value;
  throw new Error(`unsupported packaged web output mode: ${value}`);
}

async function resolveOptionalResourcePath(
  resourceDir: string,
  value: string | undefined,
): Promise<string | null> {
  const cleaned = cleanOptionalString(value);
  if (cleaned == null) return null;
  const resolved = resolve(resourceDir, cleaned);
  if (!(await pathExists(resolved))) {
    throw new Error(`configured packaged resource entry not found at ${resolved}`);
  }
  return resolved;
}

async function readRawConfig(resourceDir: string): Promise<RawPackagedConfig> {
  const configured = process.env[PACKAGED_CONFIG_PATH_ENV];
  const configPath =
    configured != null && configured.length > 0
      ? resolve(configured)
      : join(resourceDir, "open-design-config.json");
  return JSON.parse(await readFile(configPath, "utf8")) as RawPackagedConfig;
}

async function resolvePackagedConfig(resourceDir: string): Promise<PackagedConfig> {
  const physicalResourceDir = await realpath(resourceDir).catch(() => resourceDir);
  const raw = await readRawConfig(resourceDir);
  const namespace = normalizeNamespace(
    process.env.OD_PACKAGED_NAMESPACE ??
      process.env.OD_SIDECAR_NAMESPACE ??
      raw.namespace ??
      SIDECAR_DEFAULTS.namespace,
  );
  const webOutputMode = resolveWebOutputMode(raw.webOutputMode);
  const resourceRoot =
    raw.resourceRoot == null ? join(physicalResourceDir, "open-design") : resolve(raw.resourceRoot);
  const nodeRelative =
    raw.nodeCommandRelative == null || raw.nodeCommandRelative.length === 0
      ? join("open-design", "bin", platform() === "win32" ? "node.exe" : "node")
      : raw.nodeCommandRelative;
  const nodeCandidate = resolve(physicalResourceDir, nodeRelative);
  const webStandaloneRoot =
    raw.webStandaloneRoot == null || raw.webStandaloneRoot.length === 0
      ? webOutputMode === "standalone"
        ? join(physicalResourceDir, "open-design-web-standalone")
        : null
      : resolve(raw.webStandaloneRoot);

  return {
    appVersion: cleanOptionalString(raw.appVersion),
    daemonCliEntry: await resolveOptionalResourcePath(resourceDir, raw.daemonCliEntryRelative),
    daemonSidecarEntry: await resolveOptionalResourcePath(resourceDir, raw.daemonSidecarEntryRelative),
    namespace,
    namespaceBaseRoot: raw.namespaceBaseRoot == null ? defaultNamespaceBaseRoot() : resolve(raw.namespaceBaseRoot),
    nodeCommand: (await pathExists(nodeCandidate)) ? nodeCandidate : null,
    resourceRoot,
    telemetryRelayUrl: cleanOptionalString(raw.telemetryRelayUrl),
    posthogKey: cleanOptionalString(raw.posthogKey),
    posthogHost: cleanOptionalString(raw.posthogHost),
    webSidecarEntry: await resolveOptionalResourcePath(resourceDir, raw.webSidecarEntryRelative),
    webStandaloneRoot,
    webOutputMode,
  };
}

function createFallbackStamp(namespace: string): SidecarStamp {
  return {
    app: APP_KEYS.DESKTOP,
    ipc: resolveAppIpcPath({
      app: APP_KEYS.DESKTOP,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace,
    }),
    mode: SIDECAR_MODES.RUNTIME,
    namespace,
    source: "tools-pack",
  };
}

async function main(): Promise<void> {
  const resourceDir = process.env[TAURI_RESOURCE_DIR_ENV];
  if (resourceDir == null || resourceDir.length === 0) {
    throw new Error(`missing ${TAURI_RESOURCE_DIR_ENV}`);
  }
  const config = await resolvePackagedConfig(resourceDir);
  const stamp =
    readProcessStamp(process.argv.slice(2), OPEN_DESIGN_SIDECAR_CONTRACT) ??
    createFallbackStamp(config.namespace);
  const paths = resolvePackagedNamespacePaths(config, stamp.namespace);
  await mkdir(paths.runtimeRoot, { recursive: true });

  const runtime = bootstrapSidecarRuntime(stamp, process.env, {
    app: APP_KEYS.DESKTOP,
    base: paths.runtimeRoot,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
  });

  let sidecars: PackagedSidecarHandle | null = await startPackagedSidecars(runtime, paths, {
    appVersion: config.appVersion,
    daemonCliEntry: config.daemonCliEntry,
    daemonSidecarEntry: config.daemonSidecarEntry,
    nodeCommand: config.nodeCommand,
    telemetryRelayUrl: config.telemetryRelayUrl,
    posthogKey: config.posthogKey,
    posthogHost: config.posthogHost,
    requireDesktopAuth: true,
    webSidecarEntry: config.webSidecarEntry,
    webStandaloneRoot: config.webStandaloneRoot,
    webOutputMode: config.webOutputMode,
  });
  if (sidecars.web.url == null) {
    await sidecars.close().catch(() => undefined);
    throw new Error("Tauri packaged web sidecar did not report a URL");
  }
  await writePackagedWebIdentity({
    paths,
    pid: process.pid,
    url: sidecars.web.url,
  });

  const shutdown = async (): Promise<void> => {
    const current = sidecars;
    sidecars = null;
    await current?.close().catch((error: unknown) => {
      console.error("failed to close Tauri packaged sidecars", error);
    });
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  process.stdout.write(`${JSON.stringify({ daemon: sidecars.daemon, web: sidecars.web })}\n`);
  await new Promise<never>(() => undefined);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
