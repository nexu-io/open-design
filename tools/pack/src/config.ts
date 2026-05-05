import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_DEFAULTS,
} from "@open-design/sidecar-proto";
import { resolveNamespace } from "@open-design/sidecar";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY_DIR_NAME = path.basename(__dirname);

export const WORKSPACE_ROOT = resolve(__dirname, ENTRY_DIR_NAME === "dist" ? "../../.." : "../../..");

export type ToolPackPlatform = "mac" | "win" | "linux";
export type ToolPackBuildOutput = "all" | "app" | "appimage" | "dir" | "dmg" | "nsis" | "zip";
export type ToolPackMacCompression = "store" | "normal" | "maximum";
export type ToolPackWebOutputMode = "server" | "standalone";

export type ToolPackCliOptions = {
  containerized?: boolean;
  dir?: string;
  expr?: string;
  json?: boolean;
  macCompression?: string;
  namespace?: string;
  path?: string;
  portable?: boolean;
  removeData?: boolean;
  removeLogs?: boolean;
  removeProductUserData?: boolean;
  removeSidecars?: boolean;
  signed?: boolean;
  silent?: boolean;
  to?: string;
};

export type ToolPackRoots = {
  output: {
    appBuilderRoot: string;
    namespaceRoot: string;
    platformRoot: string;
    root: string;
  };
  runtime: {
    namespaceBaseRoot: string;
    namespaceRoot: string;
  };
  toolPackRoot: string;
};

export type ToolPackConfig = {
  containerized: boolean;
  electronBuilderCliPath: string;
  electronDistPath: string;
  electronVersion: string;
  macCompression: ToolPackMacCompression;
  namespace: string;
  platform: ToolPackPlatform;
  portable: boolean;
  removeData: boolean;
  removeLogs: boolean;
  removeProductUserData: boolean;
  removeSidecars: boolean;
  roots: ToolPackRoots;
  silent: boolean;
  signed: boolean;
  to: ToolPackBuildOutput;
  webOutputMode: ToolPackWebOutputMode;
  workspaceRoot: string;
};

function resolveToolPackBuildOutput(platform: ToolPackPlatform, value: string | undefined): ToolPackBuildOutput {
  if (value == null || value.length === 0) return platform === "win" ? "nsis" : "all";
  if (platform === "mac" && (value === "all" || value === "app" || value === "dmg" || value === "zip")) return value;
  if (platform === "win" && (value === "all" || value === "dir" || value === "nsis")) return value;
  if (platform === "linux" && (value === "all" || value === "appimage" || value === "dir")) return value;
  throw new Error(`unsupported ${platform} --to target: ${value}`);
}

function resolveToolPackMacCompression(value: string | undefined): ToolPackMacCompression {
  if (value == null || value.length === 0) return "normal";
  if (value === "store" || value === "normal" || value === "maximum") return value;
  throw new Error(`unsupported mac --mac-compression value: ${value}`);
}

function resolveToolPackWebOutputMode(platform: ToolPackPlatform, value: string | undefined): ToolPackWebOutputMode {
  // Standalone web output is wired for mac first; other platforms fall back to server mode until their paths are enabled.
  if (platform !== "mac") return "server";
  if (value == null || value.length === 0) return "standalone";
  if (value === "server" || value === "standalone") return value;
  throw new Error(`unsupported OD_WEB_OUTPUT_MODE value: ${value}`);
}

function resolveElectronVersion(workspaceRoot: string): string {
  const require = createRequire(join(workspaceRoot, "apps/desktop/package.json"));
  const desktopPackage = require(join(workspaceRoot, "apps/desktop/package.json")) as {
    devDependencies?: Record<string, string>;
  };
  const version = desktopPackage.devDependencies?.electron;
  if (version == null || version.length === 0) {
    throw new Error("apps/desktop/package.json must declare electron");
  }
  return version;
}

function resolveElectronDistPath(workspaceRoot: string): string {
  const require = createRequire(join(workspaceRoot, "apps/desktop/package.json"));
  const electronEntry = require.resolve("electron");
  return join(path.dirname(electronEntry), "dist");
}

function resolveElectronBuilderCliPath(): string {
  const require = createRequire(import.meta.url);
  return require.resolve("electron-builder/out/cli/cli.js");
}

export function resolveToolPackConfig(
  platform: ToolPackPlatform,
  options: ToolPackCliOptions = {},
): ToolPackConfig {
  const namespace = resolveNamespace({
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    env: process.env,
    namespace: options.namespace ?? SIDECAR_DEFAULTS.namespace,
  });
  const toolPackRoot = resolve(options.dir ?? join(WORKSPACE_ROOT, ".tmp", "tools-pack"));
  const outputRoot = join(toolPackRoot, "out");
  const outputPlatformRoot = join(outputRoot, platform);
  const outputNamespaceRoot = join(outputPlatformRoot, "namespaces", namespace);
  const runtimeNamespaceBaseRoot = join(toolPackRoot, "runtime", platform, "namespaces");

  return {
    containerized: options.containerized === true,
    electronBuilderCliPath: resolveElectronBuilderCliPath(),
    electronDistPath: resolveElectronDistPath(WORKSPACE_ROOT),
    electronVersion: resolveElectronVersion(WORKSPACE_ROOT),
    macCompression: resolveToolPackMacCompression(options.macCompression),
    namespace,
    platform,
    portable: options.portable === true,
    roots: {
      output: {
        appBuilderRoot: join(outputNamespaceRoot, "builder"),
        namespaceRoot: outputNamespaceRoot,
        platformRoot: outputPlatformRoot,
        root: outputRoot,
      },
      runtime: {
        namespaceBaseRoot: runtimeNamespaceBaseRoot,
        namespaceRoot: join(runtimeNamespaceBaseRoot, namespace),
      },
      toolPackRoot,
    },
    removeData: options.removeData === true,
    removeLogs: options.removeLogs === true,
    removeProductUserData: options.removeProductUserData === true,
    removeSidecars: options.removeSidecars === true,
    silent: options.silent !== false,
    signed: options.signed === true,
    to: resolveToolPackBuildOutput(platform, options.to),
    webOutputMode: resolveToolPackWebOutputMode(platform, process.env.OD_WEB_OUTPUT_MODE),
    workspaceRoot: WORKSPACE_ROOT,
  };
}
