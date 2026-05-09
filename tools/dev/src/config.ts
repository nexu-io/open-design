import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_ENV,
  SIDECAR_SOURCES,
} from "@open-design/sidecar-proto";
import {
  resolveAppIpcPath,
  resolveAppRuntimePath,
  resolveLogFilePath,
  resolveNamespace,
  resolveNamespaceRoot,
  resolveSidecarBase,
  resolveSourceRuntimeRoot,
} from "@open-design/sidecar";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY_DIR_NAME = path.basename(__dirname);

export const WORKSPACE_ROOT = path.resolve(__dirname, ENTRY_DIR_NAME === "dist" ? "../../.." : "../../..");

export const ALL_APPS = [APP_KEYS.DAEMON, APP_KEYS.WEB, APP_KEYS.DESKTOP] as const;
export const DEFAULT_START_APPS = [APP_KEYS.DAEMON, APP_KEYS.WEB, APP_KEYS.DESKTOP] as const;
export const DEFAULT_RUN_APPS = [APP_KEYS.DAEMON, APP_KEYS.WEB] as const;
export const DEFAULT_STOP_APPS = [APP_KEYS.DESKTOP, APP_KEYS.WEB, APP_KEYS.DAEMON] as const;

export type ToolDevAppName = (typeof ALL_APPS)[number];

export type ToolDevOptions = {
  daemonPort?: number | string | null;
  json?: boolean;
  namespace?: string;
  prod?: boolean;
  toolsDevRoot?: string;
  webPort?: number | string | null;
};

export type ToolDevAppConfig = {
  app: ToolDevAppName;
  ipcPath: string;
  latestLogPath: string;
  logDir: string;
};

export type ToolDevConfig = {
  apps: {
    daemon: ToolDevAppConfig & {
      sidecarEntryPath: string;
    };
    desktop: ToolDevAppConfig & {
      electronBinaryPath: string;
      mainEntryPath: string;
      packageJsonPath: string;
    };
    web: ToolDevAppConfig & {
      nextDistDir: string;
      nextTsconfigPath: string;
      sidecarEntryPath: string;
    };
  };
  namespace: string;
  namespaceRoot: string;
  toolsDevRoot: string;
  tsxCliPath: string;
  workspaceRoot: string;
};

function resolveTsxCliPath(): string {
  const require = createRequire(import.meta.url);
  return require.resolve("tsx/cli");
}

function resolveElectronBinaryPath(workspaceRoot: string): string {
  const packageJsonPath = path.join(workspaceRoot, "apps/desktop/package.json");
  const require = createRequire(packageJsonPath);
  const electron = require("electron") as unknown;
  if (typeof electron === "string" && electron.length > 0) return electron;
  return require.resolve("electron/cli.js");
}

function resolveAppConfig(options: {
  app: ToolDevAppName;
  namespace: string;
  namespaceRoot: string;
  toolsDevRoot: string;
}): ToolDevAppConfig {
  return {
    app: options.app,
    ipcPath: resolveAppIpcPath({
      app: options.app,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace: options.namespace,
    }),
    latestLogPath: resolveLogFilePath({ runtimeRoot: options.namespaceRoot, app: options.app, contract: OPEN_DESIGN_SIDECAR_CONTRACT }),
    logDir: path.dirname(resolveLogFilePath({ runtimeRoot: options.namespaceRoot, app: options.app, contract: OPEN_DESIGN_SIDECAR_CONTRACT })),
  };
}

export function isToolDevAppName(value: string): value is ToolDevAppName {
  return ALL_APPS.includes(value as ToolDevAppName);
}

function unsupportedAppError(value: string): Error {
  return new Error(`unsupported tools-dev app: ${value} (expected one of: ${ALL_APPS.join(", ")})`);
}

export function resolveTargetApps(appName: string | undefined, defaults: readonly ToolDevAppName[]): ToolDevAppName[] {
  if (appName == null) return [...defaults];
  if (!isToolDevAppName(appName)) throw unsupportedAppError(appName);
  return [appName];
}

export function resolveStartApps(appName: string | undefined): ToolDevAppName[] {
  if (appName == null) return [...DEFAULT_START_APPS];
  if (!isToolDevAppName(appName)) throw unsupportedAppError(appName);
  if (appName === APP_KEYS.WEB) return [APP_KEYS.DAEMON, APP_KEYS.WEB];
  if (appName === APP_KEYS.DESKTOP) return [APP_KEYS.DAEMON, APP_KEYS.WEB, APP_KEYS.DESKTOP];
  return [APP_KEYS.DAEMON];
}

export function resolveRunApps(appName: string | undefined): ToolDevAppName[] {
  if (appName == null) return [...DEFAULT_RUN_APPS];
  return resolveStartApps(appName);
}

export function resolveStopApps(appName: string | undefined): ToolDevAppName[] {
  if (appName == null) return [...DEFAULT_STOP_APPS];
  if (!isToolDevAppName(appName)) throw unsupportedAppError(appName);
  if (appName === APP_KEYS.WEB) return [APP_KEYS.WEB, APP_KEYS.DAEMON];
  if (appName === APP_KEYS.DESKTOP) return [APP_KEYS.DESKTOP];
  return [APP_KEYS.DAEMON];
}

export function parsePortOption(value: number | string | null | undefined, optionName: string): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`${optionName} must be an integer between 1 and 65535`);
  }
  return parsed;
}

export function resolveToolDevConfig(options: ToolDevOptions = {}): ToolDevConfig {
  const namespace = resolveNamespace({ namespace: options.namespace, env: process.env, contract: OPEN_DESIGN_SIDECAR_CONTRACT });
  const toolsDevRoot = resolveSidecarBase({
    base: options.toolsDevRoot ?? process.env[SIDECAR_ENV.BASE] ?? resolveSourceRuntimeRoot({
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      projectRoot: WORKSPACE_ROOT,
      source: SIDECAR_SOURCES.TOOLS_DEV,
    }),
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    env: process.env,
    projectRoot: WORKSPACE_ROOT,
    source: SIDECAR_SOURCES.TOOLS_DEV,
  });
  const namespaceRoot = resolveNamespaceRoot({ base: toolsDevRoot, namespace, contract: OPEN_DESIGN_SIDECAR_CONTRACT });
  const daemon = resolveAppConfig({ app: APP_KEYS.DAEMON, namespace, namespaceRoot, toolsDevRoot });
  const desktop = resolveAppConfig({ app: APP_KEYS.DESKTOP, namespace, namespaceRoot, toolsDevRoot });
  const web = resolveAppConfig({ app: APP_KEYS.WEB, namespace, namespaceRoot, toolsDevRoot });
  const desktopPackageJsonPath = path.join(WORKSPACE_ROOT, "apps/desktop/package.json");
  let cachedElectronBinaryPath: string | undefined;

  return {
    apps: {
      daemon: {
        ...daemon,
        sidecarEntryPath: path.join(WORKSPACE_ROOT, "apps/daemon/src/sidecar/index.ts"),
      },
      desktop: {
        ...desktop,
        get electronBinaryPath() {
          if (cachedElectronBinaryPath == null) cachedElectronBinaryPath = resolveElectronBinaryPath(WORKSPACE_ROOT);
          return cachedElectronBinaryPath;
        },
        mainEntryPath: path.join(WORKSPACE_ROOT, "apps/desktop/dist/main/index.js"),
        packageJsonPath: desktopPackageJsonPath,
      },
      web: {
        ...web,
        nextDistDir: resolveAppRuntimePath({ app: APP_KEYS.WEB, namespaceRoot, fileName: "next", contract: OPEN_DESIGN_SIDECAR_CONTRACT }),
        nextTsconfigPath: resolveAppRuntimePath({ app: APP_KEYS.WEB, namespaceRoot, fileName: "tsconfig.json", contract: OPEN_DESIGN_SIDECAR_CONTRACT }),
        sidecarEntryPath: path.join(WORKSPACE_ROOT, "apps/web/sidecar/index.ts"),
      },
    },
    namespace,
    namespaceRoot,
    toolsDevRoot,
    tsxCliPath: resolveTsxCliPath(),
    workspaceRoot: WORKSPACE_ROOT,
  };
}
