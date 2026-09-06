import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { OPEN_DESIGN_SIDECAR_CONTRACT, SIDECAR_DEFAULTS } from "@open-design/sidecar-proto";
import { resolveNamespace } from "@open-design/sidecar";
import { releaseChannelFromVersion, releaseNamespace } from "@open-design/release";

function resolveToolPackRoot(start: string): string {
  let candidate = start;
  while (true) {
    const manifest = join(candidate, "package.json");
    if (existsSync(manifest) && (createRequire(manifest)(manifest) as { name?: string }).name === "@open-design/tools-pack") return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) throw new Error(`could not locate @open-design/tools-pack package from ${start}`);
    candidate = parent;
  }
}

export const WORKSPACE_ROOT = resolve(resolveToolPackRoot(dirname(fileURLToPath(import.meta.url))), "../..");
export type ToolPackPlatform = "mac";
export type ToolPackCliOptions = {
  appVersion?: string;
  cacheDir?: string;
  dir?: string;
  json?: boolean;
  namespace?: string;
  standaloneBootstrapUrl?: string;
};
export type ToolPackRoots = Readonly<{
  cacheRoot: string;
  output: Readonly<{ namespaceRoot: string }>;
  runtime: Readonly<{ namespaceRoot: string }>;
  toolPackRoot: string;
}>;
export type ToolPackConfig = Readonly<{
  appVersion?: string;
  namespace: string;
  platform: ToolPackPlatform;
  roots: ToolPackRoots;
  standaloneBootstrapUrl?: string;
  workspaceRoot: string;
}>;

function appVersion(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0 || /\s/u.test(normalized)) throw new Error("--app-version must be a non-empty version without whitespace");
  return normalized;
}

function bootstrapUrl(value: string | undefined): string | undefined {
  if (value == null || value.length === 0) return undefined;
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("standalone bootstrap URL must use http(s)");
  return parsed.href;
}

export function resolveToolPackConfig(platform: ToolPackPlatform, options: ToolPackCliOptions = {}): ToolPackConfig {
  const version = appVersion(options.appVersion);
  const channel = releaseChannelFromVersion(version);
  const namespace = resolveNamespace({ contract: OPEN_DESIGN_SIDECAR_CONTRACT, namespace: options.namespace ?? (channel == null ? SIDECAR_DEFAULTS.namespace : releaseNamespace(channel, platform)) });
  const defaultRoot = join(WORKSPACE_ROOT, ".tmp", "tools-pack"), toolPackRoot = resolve(options.dir ?? defaultRoot);
  return Object.freeze({
    appVersion: version,
    namespace,
    platform,
    roots: Object.freeze({
      cacheRoot: resolve(options.cacheDir ?? join(defaultRoot, "cache")),
      output: Object.freeze({ namespaceRoot: join(toolPackRoot, "out", platform, "namespaces", namespace) }),
      runtime: Object.freeze({ namespaceRoot: join(toolPackRoot, "runtime", platform, "namespaces", namespace) }),
      toolPackRoot,
    }),
    standaloneBootstrapUrl: bootstrapUrl(options.standaloneBootstrapUrl ?? process.env.OD_ELECTRON_STANDALONE_BOOTSTRAP_URL),
    workspaceRoot: WORKSPACE_ROOT,
  });
}
