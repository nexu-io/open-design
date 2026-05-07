import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { app } from "electron";

import { SIDECAR_DEFAULTS, normalizeNamespace } from "@open-design/sidecar-proto";

export const PACKAGED_CONFIG_PATH_ENV = "OD_PACKAGED_CONFIG_PATH";
export const PACKAGED_NAMESPACE_ENV = "OD_PACKAGED_NAMESPACE";

export type RawPackagedConfig = {
  namespace?: string;
  namespaceBaseRoot?: string;
  nodeCommandRelative?: string;
  resourceRoot?: string;
};

export type PackagedConfig = {
  namespace: string;
  namespaceBaseRoot: string;
  nodeCommand: string | null;
  resourceRoot: string;
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

  return {
    namespace,
    namespaceBaseRoot,
    nodeCommand,
    resourceRoot,
  };
}
