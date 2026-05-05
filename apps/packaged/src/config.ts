import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { app } from "electron";

import { SIDECAR_DEFAULTS, normalizeNamespace } from "@open-design/sidecar-proto";

export const PACKAGED_CONFIG_PATH_ENV = "OD_PACKAGED_CONFIG_PATH";
export const PACKAGED_NAMESPACE_ENV = "OD_PACKAGED_NAMESPACE";
export const PACKAGED_WEB_OUTPUT_MODE_OVERRIDE_ENV = "OD_PACKAGED_ALLOW_WEB_OUTPUT_MODE_OVERRIDE";
export const PACKAGED_WEB_STANDALONE_ROOT_ENV = "OD_WEB_STANDALONE_ROOT";
export const PACKAGED_WEB_OUTPUT_MODE_ENV = "OD_WEB_OUTPUT_MODE";

export type PackagedWebOutputMode = "server" | "standalone";

export type RawPackagedConfig = {
  appVersion?: string;
  namespace?: string;
  namespaceBaseRoot?: string;
  nodeCommandRelative?: string;
  resourceRoot?: string;
  webStandaloneRoot?: string;
  webOutputMode?: string;
};

export type PackagedConfig = {
  appVersion: string | null;
  namespace: string;
  namespaceBaseRoot: string;
  nodeCommand: string | null;
  resourceRoot: string;
  webStandaloneRoot: string | null;
  webOutputMode: PackagedWebOutputMode;
};

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(filePath: string): Promise<RawPackagedConfig | null> {
  if (!(await pathExists(filePath))) return null;
  return JSON.parse(await readFile(filePath, "utf8")) as RawPackagedConfig;
}

function resolveDefaultConfigPath(): string {
  return join(process.resourcesPath, "open-design-config.json");
}

async function readRawPackagedConfig(): Promise<RawPackagedConfig> {
  const explicit = process.env[PACKAGED_CONFIG_PATH_ENV];
  if (explicit != null && explicit.length > 0) {
    const config = await readJsonIfExists(resolve(explicit));
    if (config == null) throw new Error(`packaged config not found at ${explicit}`);
    return config;
  }

  return (
    (await readJsonIfExists(resolveDefaultConfigPath())) ??
    (await readJsonIfExists(join(app.getAppPath(), "open-design-config.json"))) ??
    {}
  );
}

function resolveOptionalPath(value: string | undefined): string | undefined {
  return value == null || value.length === 0 ? undefined : resolve(value);
}

// Config DTOs use null for optional scalar values consumed by runtime options;
// optional paths use undefined so callers can distinguish "no path" from a resolved path string.
function cleanOptionalString(value: string | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function resolvePackagedWebOutputMode(value: string | undefined): PackagedWebOutputMode {
  if (value == null || value.length === 0) return "server";
  if (value === "server" || value === "standalone") return value;
  throw new Error(`unsupported packaged web output mode: ${value}`);
}

function isTruthyEnv(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function resolvePackagedWebStandaloneRoot(
  webOutputMode: PackagedWebOutputMode,
  value: string | undefined,
): string | null {
  const configured = resolveOptionalPath(value);
  if (configured != null) return configured;
  if (webOutputMode !== "standalone") return null;
  return join(process.resourcesPath, "open-design-web-standalone");
}

export async function readPackagedConfig(): Promise<PackagedConfig> {
  const raw = await readRawPackagedConfig();
  const namespace = normalizeNamespace(
    process.env[PACKAGED_NAMESPACE_ENV] ?? raw.namespace ?? SIDECAR_DEFAULTS.namespace,
  );
  const namespaceBaseRoot =
    resolveOptionalPath(raw.namespaceBaseRoot) ?? join(app.getPath("userData"), "namespaces");
  const resourceRoot = resolveOptionalPath(raw.resourceRoot) ?? join(process.resourcesPath, "open-design");
  const relativeNodeCommand =
    raw.nodeCommandRelative == null || raw.nodeCommandRelative.length === 0
      ? join("open-design", "bin", "node")
      : raw.nodeCommandRelative;
  const nodeCommandCandidate = join(process.resourcesPath, relativeNodeCommand);
  const nodeCommand = (await pathExists(nodeCommandCandidate)) ? nodeCommandCandidate : null;
  const allowWebOutputModeOverride = isTruthyEnv(process.env[PACKAGED_WEB_OUTPUT_MODE_OVERRIDE_ENV]);
  const webOutputMode = resolvePackagedWebOutputMode(
    allowWebOutputModeOverride
      ? process.env[PACKAGED_WEB_OUTPUT_MODE_ENV] ?? raw.webOutputMode
      : raw.webOutputMode,
  );
  const webStandaloneRoot = resolvePackagedWebStandaloneRoot(
    webOutputMode,
    allowWebOutputModeOverride
      ? process.env[PACKAGED_WEB_STANDALONE_ROOT_ENV] ?? raw.webStandaloneRoot
      : raw.webStandaloneRoot,
  );

  return {
    appVersion: cleanOptionalString(raw.appVersion),
    namespace,
    namespaceBaseRoot,
    nodeCommand,
    resourceRoot,
    webStandaloneRoot,
    webOutputMode,
  };
}
