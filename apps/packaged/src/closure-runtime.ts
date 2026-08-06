import { lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { compareLauncherVersions, type LauncherChannel } from "@open-design/launcher-proto";
import {
  armClosureRuntimeAttempt,
  confirmClosureRuntime,
  recoverClosureRuntime,
  resolveClosureStorePaths,
  verifyStoredClosureCandidate,
  type ClosureRuntimePointer,
  type ClosureStorePaths,
  type StoredClosureVerification,
} from "@open-design/closure-store";

import type { PackagedConfig } from "./config.js";

export type PackagedClosureFallbackReason =
  | "candidate-invalid"
  | "closure-start-failed"
  | "no-active-closure"
  | "platform-mismatch"
  | "shell-incompatible"
  | "state-unavailable";

export type PackagedClosureLayout = {
  daemonCliEntry: string;
  daemonSidecarEntry: string;
  resourceRoot: string;
  webServerEntry: string;
  webSidecarEntry: string;
  webStandaloneRoot: string;
};

export type PackagedLegacyClosureRuntime = {
  error: string | null;
  legacyConfig: PackagedConfig;
  reason: PackagedClosureFallbackReason;
  runtimeConfig: PackagedConfig;
  source: "legacy";
};

export type PackagedActiveClosureRuntime = {
  legacyConfig: PackagedConfig;
  layout: PackagedClosureLayout;
  pointer: ClosureRuntimePointer;
  runtimeConfig: PackagedConfig;
  source: "closure";
  storePaths: ClosureStorePaths;
  verification: StoredClosureVerification;
};

export type PackagedClosureRuntime =
  | PackagedActiveClosureRuntime
  | PackagedLegacyClosureRuntime;

export type PackagedRuntimeIdentity = {
  closure:
    | {
        channel: string;
        digest: string;
        generation: number;
        namespace: string;
        platform: string;
        protocolVersion: number;
        source: "closure";
        version: string;
      }
    | {
        reason: PackagedClosureFallbackReason;
        source: "legacy-combined";
        version: string | null;
      };
  shell: {
    source: "current-package" | "payload";
    version: string | null;
  };
};

type ClosureRuntimeModule = {
  resolveOpenDesignClosureLayout?: () => unknown;
};

export type ResolvePackagedClosureRuntimeOptions = {
  importRuntime?: (entryUrl: string) => Promise<ClosureRuntimeModule>;
  platformTarget?: string | null;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hostClosurePlatform(): string | null {
  if (process.platform === "darwin" && process.arch === "arm64") return "darwin-arm64";
  if (process.platform === "win32" && process.arch === "x64") return "win32-x64";
  return null;
}

function legacyRuntime(
  legacyConfig: PackagedConfig,
  reason: PackagedClosureFallbackReason,
  error: unknown = null,
): PackagedLegacyClosureRuntime {
  return {
    error: error == null ? null : errorMessage(error),
    legacyConfig,
    reason,
    runtimeConfig: legacyConfig,
    source: "legacy",
  };
}

function requireString(record: Record<string, unknown>, key: keyof PackagedClosureLayout): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Closure layout ${key} must be a non-empty path`);
  }
  return value;
}

function assertExactPath(actual: string, expected: string, label: string): string {
  if (resolve(actual) !== resolve(expected)) {
    throw new Error(`Closure layout ${label} does not match its immutable payload`);
  }
  return expected;
}

async function assertEntry(path: string, kind: "directory" | "file", label: string): Promise<void> {
  const metadata = await lstat(path).catch(() => null);
  const matches = kind === "file" ? metadata?.isFile() : metadata?.isDirectory();
  if (metadata == null || metadata.isSymbolicLink() || matches !== true) {
    throw new Error(`Closure layout ${label} is not a materialized ${kind}: ${path}`);
  }
}

async function validateClosureLayout(
  value: unknown,
  verification: StoredClosureVerification,
): Promise<PackagedClosureLayout> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Closure runtime layout must be an object");
  }
  const layout = value as Record<string, unknown>;
  const payloadRoot = verification.paths.payloadRoot;
  const webStandaloneRoot = join(payloadRoot, "web", "standalone");
  const webServerCandidates = [
    join(webStandaloneRoot, "apps", "web", "server.js"),
    join(webStandaloneRoot, "server.js"),
  ];
  const webServerEntry = resolve(requireString(layout, "webServerEntry"));
  if (!webServerCandidates.some((candidate) => resolve(candidate) === webServerEntry)) {
    throw new Error("Closure layout webServerEntry does not match its immutable payload");
  }
  const normalized: PackagedClosureLayout = {
    daemonCliEntry: assertExactPath(
      requireString(layout, "daemonCliEntry"),
      join(payloadRoot, "daemon", "daemon-cli.mjs"),
      "daemonCliEntry",
    ),
    daemonSidecarEntry: assertExactPath(
      requireString(layout, "daemonSidecarEntry"),
      join(payloadRoot, "daemon", "daemon-sidecar.mjs"),
      "daemonSidecarEntry",
    ),
    resourceRoot: assertExactPath(
      requireString(layout, "resourceRoot"),
      join(payloadRoot, "resources", "open-design"),
      "resourceRoot",
    ),
    webServerEntry,
    webSidecarEntry: assertExactPath(
      requireString(layout, "webSidecarEntry"),
      join(payloadRoot, "web", "web-sidecar.mjs"),
      "webSidecarEntry",
    ),
    webStandaloneRoot: assertExactPath(
      requireString(layout, "webStandaloneRoot"),
      webStandaloneRoot,
      "webStandaloneRoot",
    ),
  };
  await Promise.all([
    assertEntry(normalized.daemonCliEntry, "file", "daemonCliEntry"),
    assertEntry(normalized.daemonSidecarEntry, "file", "daemonSidecarEntry"),
    assertEntry(normalized.resourceRoot, "directory", "resourceRoot"),
    assertEntry(normalized.webServerEntry, "file", "webServerEntry"),
    assertEntry(normalized.webSidecarEntry, "file", "webSidecarEntry"),
    assertEntry(normalized.webStandaloneRoot, "directory", "webStandaloneRoot"),
  ]);
  return normalized;
}

async function loadClosureLayout(
  verification: StoredClosureVerification,
  importRuntime: NonNullable<ResolvePackagedClosureRuntimeOptions["importRuntime"]>,
): Promise<PackagedClosureLayout> {
  const entryPath = join(verification.paths.payloadRoot, verification.manifest.artifact.entryPath);
  const runtime = await importRuntime(pathToFileURL(entryPath).href);
  if (typeof runtime.resolveOpenDesignClosureLayout !== "function") {
    throw new Error("Closure runtime does not export resolveOpenDesignClosureLayout");
  }
  return await validateClosureLayout(runtime.resolveOpenDesignClosureLayout(), verification);
}

async function recoverRejectedCandidate(
  paths: ClosureStorePaths,
  pointer: ClosureRuntimePointer,
): Promise<void> {
  await armClosureRuntimeAttempt(paths, pointer);
  await recoverClosureRuntime(paths);
}

export async function resolvePackagedClosureRuntime(input: {
  channel: LauncherChannel;
  installationRoot: string;
  legacyConfig: PackagedConfig;
  namespace: string;
  shellVersion: string | null;
}, options: ResolvePackagedClosureRuntimeOptions = {}): Promise<PackagedClosureRuntime> {
  const storePaths = resolveClosureStorePaths({
    channel: input.channel,
    namespace: input.namespace,
    root: input.installationRoot,
  });
  const recovered = await recoverClosureRuntime(storePaths).catch((error: unknown) => ({ error }));
  if ("error" in recovered) {
    return legacyRuntime(input.legacyConfig, "state-unavailable", recovered.error);
  }
  if (!recovered.selection.selected) {
    return legacyRuntime(input.legacyConfig, "no-active-closure");
  }
  const pointer = recovered.selection.pointer;
  const platformTarget = options.platformTarget === undefined
    ? hostClosurePlatform()
    : options.platformTarget;
  if (platformTarget == null || pointer.platform !== platformTarget) {
    await recoverRejectedCandidate(storePaths, pointer).catch(() => undefined);
    return legacyRuntime(
      input.legacyConfig,
      "platform-mismatch",
      `Closure platform ${pointer.platform} does not match shell platform ${platformTarget ?? "unsupported"}`,
    );
  }
  let verification: StoredClosureVerification;
  try {
    verification = await verifyStoredClosureCandidate(storePaths, pointer);
  } catch (error) {
    await recoverRejectedCandidate(storePaths, pointer).catch(() => undefined);
    return legacyRuntime(input.legacyConfig, "candidate-invalid", error);
  }
  if (
    input.shellVersion == null
    || compareLauncherVersions(
      input.shellVersion,
      verification.manifest.compatibility.shell.minVersion,
    ) < 0
  ) {
    return legacyRuntime(
      input.legacyConfig,
      "shell-incompatible",
      `Closure requires shell ${verification.manifest.compatibility.shell.minVersion}; running ${input.shellVersion ?? "unknown"}`,
    );
  }
  let layout: PackagedClosureLayout;
  try {
    layout = await loadClosureLayout(
      verification,
      options.importRuntime ?? (async (entryUrl) => await import(entryUrl) as ClosureRuntimeModule),
    );
    await armClosureRuntimeAttempt(storePaths, pointer);
  } catch (error) {
    await recoverRejectedCandidate(storePaths, pointer).catch(() => undefined);
    return legacyRuntime(input.legacyConfig, "candidate-invalid", error);
  }
  return {
    legacyConfig: input.legacyConfig,
    layout,
    pointer,
    runtimeConfig: {
      ...input.legacyConfig,
      appVersion: pointer.version,
      daemonCliEntry: layout.daemonCliEntry,
      daemonSidecarEntry: layout.daemonSidecarEntry,
      resourceRoot: layout.resourceRoot,
      webOutputMode: "standalone",
      webSidecarEntry: layout.webSidecarEntry,
      webStandaloneRoot: layout.webStandaloneRoot,
    },
    source: "closure",
    storePaths,
    verification,
  };
}

export async function startPackagedClosureRuntime<T>(
  runtime: PackagedClosureRuntime,
  start: (config: PackagedConfig) => Promise<T>,
): Promise<{ runtime: PackagedClosureRuntime; value: T }> {
  try {
    return { runtime, value: await start(runtime.runtimeConfig) };
  } catch (closureError) {
    if (runtime.source !== "closure") throw closureError;
    await recoverClosureRuntime(runtime.storePaths).catch(() => undefined);
    const fallback = legacyRuntime(runtime.legacyConfig, "closure-start-failed", closureError);
    try {
      return { runtime: fallback, value: await start(fallback.runtimeConfig) };
    } catch (legacyError) {
      throw new AggregateError(
        [closureError, legacyError],
        "active Closure and legacy packaged runtime both failed to start",
      );
    }
  }
}

export async function confirmPackagedClosureRuntime(runtime: PackagedClosureRuntime): Promise<void> {
  if (runtime.source !== "closure") return;
  await confirmClosureRuntime(runtime.storePaths, runtime.pointer);
}

export function createPackagedRuntimeIdentity(input: {
  closure: PackagedClosureRuntime;
  shellSource: "current-package" | "payload";
  shellVersion: string | null;
}): PackagedRuntimeIdentity {
  return {
    closure: input.closure.source === "closure"
      ? {
          channel: input.closure.pointer.channel,
          digest: input.closure.pointer.digest,
          generation: input.closure.pointer.generation,
          namespace: input.closure.pointer.namespace,
          platform: input.closure.pointer.platform,
          protocolVersion: input.closure.pointer.protocolVersion,
          source: "closure",
          version: input.closure.pointer.version,
        }
      : {
          reason: input.closure.reason,
          source: "legacy-combined",
          version: input.closure.runtimeConfig.appVersion,
        },
    shell: {
      source: input.shellSource,
      version: input.shellVersion,
    },
  };
}
