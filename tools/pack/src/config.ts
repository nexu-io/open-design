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
  appVersion?: string;
  cacheDir?: string;
  containerized?: boolean;
  dir?: string;
  expr?: string;
  headless?: boolean;
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
  cacheRoot: string;
  toolPackRoot: string;
};

export type ToolPackConfig = {
  appVersion?: string;
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
  sentryAuthToken?: string;
  sentryDsn?: string;
  sentryEnvironment?: string;
  sentryOrg?: string;
  sentryProject?: string;
  sentryRelease?: string;
  sentryTracesSampleRate?: string;
  telemetryRelayUrl?: string;
  to: ToolPackBuildOutput;
  webSentryDsn?: string;
  webSentryPublicDsn?: string;
  webSentryTracesSampleRate?: string;
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

function resolveToolPackAppVersion(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error("--app-version must not be empty");
  if (/\s/.test(normalized)) throw new Error(`--app-version must not contain whitespace: ${value}`);
  return normalized;
}

function resolveToolPackWebOutputMode(platform: ToolPackPlatform, value: string | undefined): ToolPackWebOutputMode {
  // Standalone web output is wired for desktop packaged platforms; Linux stays on
  // the existing server output until its AppImage resource path is optimized.
  if (platform === "linux") return "server";
  if (value == null || value.length === 0) return "standalone";
  if (value === "server" || value === "standalone") return value;
  throw new Error(`unsupported OD_WEB_OUTPUT_MODE value: ${value}`);
}

function resolveToolPackTelemetryRelayUrl(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`OPEN_DESIGN_TELEMETRY_RELAY_URL must be an absolute https URL: ${value}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`OPEN_DESIGN_TELEMETRY_RELAY_URL must use https: ${value}`);
  }
  return normalized.replace(/\/+$/, "");
}

function resolveToolPackDaemonSentryDsn(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`OPEN_DESIGN_DAEMON_SENTRY_DSN must be an absolute https URL: ${value}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`OPEN_DESIGN_DAEMON_SENTRY_DSN must use https: ${value}`);
  }
  return normalized;
}

function resolveToolPackDaemonSentryEnvironment(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function resolveToolPackDaemonSentryTracesSampleRate(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error("OPEN_DESIGN_DAEMON_SENTRY_TRACES_SAMPLE_RATE must be between 0 and 1");
  }
  return normalized;
}

function resolveToolPackSentryDsn(value: string | undefined, envName: string): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${envName} must be an absolute https URL: ${value}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${envName} must use https: ${value}`);
  }
  return normalized;
}

function resolveOptionalEnvValue(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function resolveToolPackSentrySampleRate(value: string | undefined, envName: string): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${envName} must be between 0 and 1`);
  }
  return normalized;
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
  const sentryDsn = resolveToolPackDaemonSentryDsn(process.env.OPEN_DESIGN_DAEMON_SENTRY_DSN);
  const webSentryDsn = resolveToolPackSentryDsn(process.env.SENTRY_DSN, "SENTRY_DSN");
  const webSentryPublicDsn = resolveToolPackSentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN, "NEXT_PUBLIC_SENTRY_DSN");
  const sentryEnvironment =
    resolveOptionalEnvValue(process.env.SENTRY_ENVIRONMENT) ??
    resolveToolPackDaemonSentryEnvironment(process.env.OPEN_DESIGN_DAEMON_SENTRY_ENVIRONMENT);
  const sentryTracesSampleRate =
    resolveToolPackSentrySampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, "SENTRY_TRACES_SAMPLE_RATE") ??
    resolveToolPackDaemonSentryTracesSampleRate(process.env.OPEN_DESIGN_DAEMON_SENTRY_TRACES_SAMPLE_RATE);
  const webSentryTracesSampleRate =
    resolveToolPackSentrySampleRate(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
      "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
    ) ?? sentryTracesSampleRate;
  const namespace = resolveNamespace({
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    env: process.env,
    namespace: options.namespace ?? SIDECAR_DEFAULTS.namespace,
  });
  const toolPackRoot = resolve(options.dir ?? join(WORKSPACE_ROOT, ".tmp", "tools-pack"));
  const cacheRoot = resolve(options.cacheDir ?? join(toolPackRoot, "cache"));
  const outputRoot = join(toolPackRoot, "out");
  const outputPlatformRoot = join(outputRoot, platform);
  const outputNamespaceRoot = join(outputPlatformRoot, "namespaces", namespace);
  const runtimeNamespaceBaseRoot = join(toolPackRoot, "runtime", platform, "namespaces");

  return {
    appVersion: resolveToolPackAppVersion(options.appVersion),
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
      cacheRoot,
      toolPackRoot,
    },
    removeData: options.removeData === true,
    removeLogs: options.removeLogs === true,
    removeProductUserData: options.removeProductUserData === true,
    removeSidecars: options.removeSidecars === true,
    silent: options.silent !== false,
    signed: options.signed === true,
    ...(sentryDsn == null
      ? {}
      : {
          sentryDsn,
          sentryEnvironment: sentryEnvironment ?? "production",
          sentryTracesSampleRate: sentryTracesSampleRate ?? "0.1",
        }),
    ...(webSentryDsn == null && webSentryPublicDsn == null
      ? {}
      : {
          ...(resolveOptionalEnvValue(process.env.SENTRY_AUTH_TOKEN) == null
            ? {}
            : { sentryAuthToken: resolveOptionalEnvValue(process.env.SENTRY_AUTH_TOKEN) }),
          ...(webSentryDsn == null ? {} : { webSentryDsn }),
          ...(webSentryPublicDsn == null
            ? {}
            : { webSentryPublicDsn }),
          ...(sentryEnvironment == null ? { sentryEnvironment: "production" } : { sentryEnvironment }),
          ...(resolveOptionalEnvValue(process.env.SENTRY_ORG) == null
            ? {}
            : { sentryOrg: resolveOptionalEnvValue(process.env.SENTRY_ORG) }),
          ...(resolveOptionalEnvValue(process.env.SENTRY_PROJECT) == null
            ? {}
            : { sentryProject: resolveOptionalEnvValue(process.env.SENTRY_PROJECT) }),
          ...(resolveOptionalEnvValue(process.env.SENTRY_RELEASE) == null
            ? {}
            : { sentryRelease: resolveOptionalEnvValue(process.env.SENTRY_RELEASE) }),
          ...(webSentryTracesSampleRate == null ? {} : { webSentryTracesSampleRate }),
        }),
    telemetryRelayUrl: resolveToolPackTelemetryRelayUrl(process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL),
    to: resolveToolPackBuildOutput(platform, options.to),
    webOutputMode: resolveToolPackWebOutputMode(platform, process.env.OD_WEB_OUTPUT_MODE),
    workspaceRoot: WORKSPACE_ROOT,
  };
}
