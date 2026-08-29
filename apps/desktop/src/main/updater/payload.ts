import { execFile } from "node:child_process";
import { lstat, mkdir, readdir, readFile, realpath, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import {
  LAUNCHER_SCHEMA_VERSION,
  compareLauncherVersions,
  resolveLauncherPaths,
  resolveLauncherVersionPaths,
  validateLauncherAttemptDescriptor,
  validateLauncherCleanupDescriptor,
  validateLauncherRuntimeDescriptor,
  type LauncherAttemptDescriptor,
  type LauncherCleanupDescriptor,
  type LauncherCleanupEntry,
  type LauncherRuntimeDescriptor,
} from "@open-design/launcher-proto";
import type { DesktopUpdateChannel } from "@open-design/sidecar-proto";

import type { DesktopUpdaterConfig } from "./config.js";
import {
  containsPath,
  isRecord,
  objectField,
  readJson,
  readJsonStrict,
  stringField,
  writeJson,
} from "./support.js";
import type { DesktopUpdaterLogger, LoadedRelease } from "../updater.js";

/**
 * @module updater/payload
 *
 * Launcher payload lifecycle for the desktop updater: payload manifest
 * validation, archive extraction and prepared-release verification, payload
 * activation with attempt pre-arming, and the launcher-side cleanup
 * machinery (deferred failures, retention, cold-start retry sweep).
 */

export const execFileAsync = promisify(execFile);

export const MAC_PAYLOAD_XATTRS_TO_SCRUB = ["com.apple.quarantine", "com.apple.provenance", "com.apple.macl"] as const;

export type LauncherPayloadExtractInput = {
  archivePath: string;
  destinationRoot: string;
  extractorPath?: string;
  platform: string;
};

export type LauncherPayloadCleanupTrigger = "activate" | "manual-clear" | "prepare-existing" | "prepare-promoted";

export type LauncherPayloadCleanupFailure = {
  error: NonNullable<LauncherCleanupEntry["error"]>;
  version: string;
};

export type LauncherCleanupLifecycleSummary = {
  cleanupDeferred: number;
  cleanupRemoved: number;
  deprecated: number;
  retained: number;
  total: number;
};

export type LauncherPayloadManifest = {
  channel: string;
  entry?: { cwd?: string; executable?: string };
  namespace: string;
  payloadRoot: string;
  platform: "darwin" | "win32";
  schemaVersion: typeof LAUNCHER_SCHEMA_VERSION;
  version: string;
};

export function validateLauncherPayloadManifest(value: unknown, expected: {
  channel: DesktopUpdateChannel;
  namespace: string;
  platform: string;
  version: string;
}): LauncherPayloadManifest {
  if (!isRecord(value)) throw new Error("launcher payload manifest must be an object");
  if (value.schemaVersion !== LAUNCHER_SCHEMA_VERSION) {
    throw new Error(`unsupported launcher payload schemaVersion: ${String(value.schemaVersion)}`);
  }
  if (stringField(value, "channel") !== expected.channel) {
    throw new Error(`launcher payload channel does not match expected channel ${expected.channel}`);
  }
  if (stringField(value, "namespace") !== expected.namespace) {
    throw new Error(`launcher payload namespace does not match expected namespace ${expected.namespace}`);
  }
  if (stringField(value, "version") !== expected.version) {
    throw new Error(`launcher payload version does not match expected version ${expected.version}`);
  }
  const platform = stringField(value, "platform");
  if (platform !== expected.platform) {
    throw new Error(`launcher payload platform ${String(platform)} does not match expected platform ${expected.platform}`);
  }
  if (stringField(value, "payloadRoot") !== "payload") throw new Error("launcher payload root must be payload");
  const entry = objectField(value, "entry");
  if (entry == null || stringField(entry, "cwd") == null || stringField(entry, "executable") == null) {
    throw new Error("launcher payload entry must include cwd and executable");
  }
  return value as LauncherPayloadManifest;
}

export async function assertLauncherPayloadBootConfig(input: {
  manifest: LauncherPayloadManifest;
  payloadRoot: string;
  stagingRoot: string;
}): Promise<void> {
  const resourcesPath = input.manifest.platform === "darwin"
    ? join(input.stagingRoot, input.manifest.entry?.cwd ?? "", "Contents", "Resources")
    : join(input.payloadRoot, "resources");
  if (!containsPath(input.stagingRoot, resourcesPath)) {
    throw new Error("launcher payload resources path escaped extracted payload");
  }
  const resourcesEntry = await lstat(resourcesPath);
  if (!resourcesEntry.isDirectory() || resourcesEntry.isSymbolicLink()) {
    throw new Error("launcher payload resources must be a plain directory");
  }
  const packagedConfigPath = join(resourcesPath, "open-design-config.json");
  if (!containsPath(input.stagingRoot, packagedConfigPath)) {
    throw new Error("launcher payload config path escaped extracted payload");
  }
  const rawConfig = await readJsonStrict<unknown>(packagedConfigPath);
  if (!isRecord(rawConfig)) throw new Error("launcher payload config must be a JSON object");
  const resourceRoot = typeof rawConfig.resourceRoot === "string" && rawConfig.resourceRoot.length > 0
    ? rawConfig.resourceRoot
    : join(resourcesPath, "open-design");
  const resourceRootEntry = await lstat(resourceRoot);
  if (!resourceRootEntry.isDirectory() || resourceRootEntry.isSymbolicLink()) {
    throw new Error("launcher payload resource root must be a plain directory");
  }
}

export async function defaultExtractLauncherPayloadArchive(input: LauncherPayloadExtractInput): Promise<void> {
  await mkdir(input.destinationRoot, { recursive: true });
  if (input.platform === "darwin") {
    await execFileAsync("ditto", ["-x", "-k", input.archivePath, input.destinationRoot]);
    for (const attribute of MAC_PAYLOAD_XATTRS_TO_SCRUB) {
      await execFileAsync("xattr", ["-dr", attribute, input.destinationRoot]).catch(() => undefined);
    }
    return;
  }
  if (input.platform === "win32") {
    await execFileAsync(input.extractorPath ?? "7z", ["x", "-y", `-o${input.destinationRoot}`, input.archivePath], { windowsHide: true });
    return;
  }
  throw new Error(`launcher payload extraction is not supported on ${input.platform}`);
}

export async function assertPreparedLauncherPayloadRelease(input: {
  config: DesktopUpdaterConfig;
  root: string;
  version: string;
}): Promise<string> {
  const manifest = validateLauncherPayloadManifest(await readJsonStrict<unknown>(join(input.root, "manifest.json")), {
    channel: input.config.channel,
    namespace: input.config.namespace ?? "",
    platform: input.config.platform,
    version: input.version,
  });
  const entryCwd = resolve(input.root, manifest.entry?.cwd ?? "");
  const entryExecutable = resolve(input.root, manifest.entry?.executable ?? "");
  if (!containsPath(input.root, entryCwd) || !containsPath(input.root, entryExecutable)) {
    throw new Error("launcher payload entry path escaped extracted payload");
  }
  const entryCwdStat = await lstat(entryCwd);
  if (!entryCwdStat.isDirectory() || entryCwdStat.isSymbolicLink()) {
    throw new Error("launcher payload entry cwd must be a plain directory");
  }
  const entryExecutableStat = await lstat(entryExecutable);
  if (!entryExecutableStat.isFile() || entryExecutableStat.isSymbolicLink()) {
    throw new Error("launcher payload entry executable must be a plain file");
  }
  const payloadRoot = join(input.root, manifest.payloadRoot);
  const payloadRootEntry = await lstat(payloadRoot);
  if (!payloadRootEntry.isDirectory() || payloadRootEntry.isSymbolicLink()) {
    throw new Error("launcher payload root must be a plain directory");
  }
  await assertLauncherPayloadBootConfig({ manifest, payloadRoot, stagingRoot: input.root });
  return entryExecutable;
}

export async function prepareLauncherPayloadRelease(input: {
  activeRelease: LoadedRelease;
  config: DesktopUpdaterConfig;
  extractLauncherPayloadArchive: (extractInput: LauncherPayloadExtractInput) => Promise<void>;
  logger: DesktopUpdaterLogger;
  now: () => Date;
  removeLauncherPayloadRoot: (path: string) => Promise<void>;
}): Promise<void> {
  if (input.config.launcherRoot == null || input.config.launcherRuntimePath == null || input.config.namespace == null) {
    throw new Error("launcher payload prepare requires launcher root, runtime path, and namespace");
  }

  const currentRuntime = validateLauncherRuntimeDescriptor(
    await readJsonStrict<LauncherRuntimeDescriptor>(input.config.launcherRuntimePath),
    { channel: input.config.channel, namespace: input.config.namespace },
  );
  const versionPaths = resolveLauncherVersionPaths({
    channel: input.config.channel,
    namespace: input.config.namespace,
    root: input.config.launcherRoot,
    version: input.activeRelease.ref.version,
  });
  const stagingRoot = join(versionPaths.stagingRoot, `prepare-${input.activeRelease.ref.key}`);
  if (!containsPath(versionPaths.root, stagingRoot)) {
    throw new Error("launcher payload staging path escaped launcher root");
  }

  let promoted = false;
  try {
    await mkdir(versionPaths.versionsRoot, { recursive: true });
    const existingVersion = await lstat(versionPaths.versionRoot).catch(() => null);
    if (existingVersion != null) {
      if (!existingVersion.isDirectory() || existingVersion.isSymbolicLink()) {
        throw new Error(`launcher payload version root is not a plain directory: ${versionPaths.versionRoot}`);
      }
      let existingVersionValid = false;
      try {
        await assertPreparedLauncherPayloadRelease({
          config: input.config,
          root: versionPaths.versionRoot,
          version: input.activeRelease.ref.version,
        });
        existingVersionValid = true;
      } catch {
        // Keep the existing version root intact until the replacement staging
        // payload has fully validated. If validation fails below, the old root
        // remains available for forensic inspection or a later retry.
      }
      if (existingVersionValid) {
        await cleanupLauncherPayloadRoots({
          config: input.config,
          currentRuntime,
          keepVersions: new Set([
            input.activeRelease.ref.version,
            ...(currentRuntime.active == null ? [] : [currentRuntime.active.version]),
            ...(currentRuntime.lastSuccessful == null ? [] : [currentRuntime.lastSuccessful.version]),
          ]),
          logger: input.logger,
          now: input.now,
          removeLauncherPayloadRoot: input.removeLauncherPayloadRoot,
          trigger: "prepare-existing",
          versionPaths,
        });
        return;
      }
    }

    await rm(stagingRoot, { force: true, recursive: true });
    await mkdir(dirname(stagingRoot), { recursive: true });
    await input.extractLauncherPayloadArchive({
      archivePath: input.activeRelease.path,
      destinationRoot: stagingRoot,
      ...(input.config.launcherPayloadExtractorPath == null ? {} : { extractorPath: input.config.launcherPayloadExtractorPath }),
      platform: input.config.platform,
    });

    await assertPreparedLauncherPayloadRelease({
      config: input.config,
      root: stagingRoot,
      version: input.activeRelease.ref.version,
    });

    await rm(versionPaths.versionRoot, { force: true, recursive: true });
    await rename(stagingRoot, versionPaths.versionRoot);
    promoted = true;
    await cleanupLauncherPayloadRoots({
      config: input.config,
      currentRuntime,
      keepVersions: new Set([
        input.activeRelease.ref.version,
        ...(currentRuntime.active == null ? [] : [currentRuntime.active.version]),
        ...(currentRuntime.lastSuccessful == null ? [] : [currentRuntime.lastSuccessful.version]),
      ]),
      logger: input.logger,
      now: input.now,
      removeLauncherPayloadRoot: input.removeLauncherPayloadRoot,
      trigger: "prepare-promoted",
      versionPaths,
    });
  } catch (error) {
    if (!promoted) await rm(stagingRoot, { force: true, recursive: true }).catch(() => undefined);
    throw error;
  }
}

export async function activatePreparedLauncherPayloadRelease(input: {
  activeRelease: LoadedRelease;
  config: DesktopUpdaterConfig;
  logger: DesktopUpdaterLogger;
  now: () => Date;
  removeLauncherPayloadRoot: (path: string) => Promise<void>;
}): Promise<{ launchPath: string; runtime: LauncherRuntimeDescriptor }> {
  if (input.config.launcherRoot == null || input.config.launcherRuntimePath == null || input.config.namespace == null) {
    throw new Error("launcher payload activate requires launcher root, runtime path, and namespace");
  }

  const currentRuntime = validateLauncherRuntimeDescriptor(
    await readJsonStrict<LauncherRuntimeDescriptor>(input.config.launcherRuntimePath),
    { channel: input.config.channel, namespace: input.config.namespace },
  );
  const versionPaths = resolveLauncherVersionPaths({
    channel: input.config.channel,
    namespace: input.config.namespace,
    root: input.config.launcherRoot,
    version: input.activeRelease.ref.version,
  });
  const launchPath = await assertPreparedLauncherPayloadRelease({
    config: input.config,
    root: versionPaths.versionRoot,
    version: input.activeRelease.ref.version,
  });
  const launcherPaths = resolveLauncherPaths({
    channel: input.config.channel,
    namespace: input.config.namespace,
    root: input.config.launcherRoot,
  });
  const currentAttempt = await readJsonStrict<LauncherAttemptDescriptor>(launcherPaths.attemptsPath)
    .then((value) => validateLauncherAttemptDescriptor(value, {
      channel: input.config.channel,
      namespace: input.config.namespace ?? "",
    }))
    .catch(() => null);
  const activeRuntimeVersion = currentRuntime.active;
  const alreadyActive = activeRuntimeVersion?.version === input.activeRelease.ref.version;
  const retryFailedGeneration = alreadyActive &&
    activeRuntimeVersion != null &&
    currentAttempt?.version === activeRuntimeVersion.version &&
    currentAttempt.generation === activeRuntimeVersion.generation;
  const nextActive = alreadyActive && activeRuntimeVersion != null && !retryFailedGeneration
    ? activeRuntimeVersion
    : {
        generation: Math.max(
          currentRuntime.active?.generation ?? 0,
          currentRuntime.lastSuccessful?.generation ?? 0,
        ) + 1,
        version: input.activeRelease.ref.version,
      };
  const nextRuntime: LauncherRuntimeDescriptor = {
    active: nextActive,
    channel: input.config.channel,
    lastSuccessful: currentRuntime.lastSuccessful ?? currentRuntime.active,
    namespace: input.config.namespace,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
    updatedAt: input.now().toISOString(),
  };
  await writeJson(input.config.launcherRuntimePath, nextRuntime);
  // Pre-arm the launch attempt for the activated pointer: the relaunched
  // payload carries the matching delegated pointer and treats this attempt as
  // its own launch in progress, while a payload that dies before reaching its
  // own bookkeeping leaves the attempt behind as rollback evidence for the
  // next cold start.
  await writeJson(launcherPaths.attemptsPath, {
    channel: input.config.channel,
    generation: nextActive.generation,
    namespace: input.config.namespace,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
    startedAt: input.now().toISOString(),
    version: nextActive.version,
  } satisfies LauncherAttemptDescriptor);
  if (retryFailedGeneration) {
    await rm(launcherPaths.handoffPath, { force: true });
  }
  await cleanupLauncherPayloadRoots({
    config: input.config,
    currentRuntime: nextRuntime,
    keepVersions: new Set([
      nextActive.version,
      ...(currentRuntime.active == null ? [] : [currentRuntime.active.version]),
      ...(currentRuntime.lastSuccessful == null ? [] : [currentRuntime.lastSuccessful.version]),
      ...(nextRuntime.lastSuccessful == null ? [] : [nextRuntime.lastSuccessful.version]),
    ]),
    logger: input.logger,
    now: input.now,
    removeLauncherPayloadRoot: input.removeLauncherPayloadRoot,
    trigger: "activate",
    versionPaths,
  });
  return { launchPath, runtime: nextRuntime };
}

export function launcherCleanupErrorFrom(error: unknown): NonNullable<LauncherCleanupEntry["error"]> {
  const code = (error as NodeJS.ErrnoException).code;
  return launcherCleanupError(
    typeof code === "string" && code.length > 0 ? code : "launcher-cleanup-failed",
    error instanceof Error ? error.message : String(error),
  );
}

export function launcherRuntimeGenerationForVersion(runtime: LauncherRuntimeDescriptor, version: string): number {
  return Math.max(
    ...(runtime.active?.version === version ? [runtime.active.generation] : []),
    ...(runtime.lastSuccessful?.version === version ? [runtime.lastSuccessful.generation] : []),
    0,
  );
}

export async function readLauncherCleanupDescriptor(
  config: DesktopUpdaterConfig,
  cleanupPath: string,
): Promise<LauncherCleanupDescriptor | null> {
  try {
    return validateLauncherCleanupDescriptor(
      await readJsonStrict<LauncherCleanupDescriptor>(cleanupPath),
      { channel: config.channel, namespace: config.namespace ?? "" },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeDeferredLauncherCleanupFailures(input: {
  cleanup: LauncherCleanupDescriptor | null;
  config: DesktopUpdaterConfig;
  currentRuntime: LauncherRuntimeDescriptor;
  failures: LauncherPayloadCleanupFailure[];
  nowIso: string;
  path: string;
}): Promise<void> {
  const versions = new Map((input.cleanup?.versions ?? []).map((entry) => [entry.version, entry] as const));
  for (const failure of input.failures) {
    const existing = versions.get(failure.version);
    if (existing?.state === "retained") continue;
    versions.set(failure.version, {
      error: failure.error,
      generation: existing?.generation ?? launcherRuntimeGenerationForVersion(input.currentRuntime, failure.version),
      reason: "cleanup-failed",
      state: "cleanup-deferred",
      updatedAt: input.nowIso,
      version: failure.version,
    });
  }
  const next: LauncherCleanupDescriptor = {
    channel: input.config.channel,
    currentVersion: input.cleanup?.currentVersion ?? input.config.currentVersion,
    namespace: input.config.namespace ?? "",
    updatedAt: input.nowIso,
    version: LAUNCHER_SCHEMA_VERSION,
    versions: [...versions.values()].sort((left, right) => (
      compareLauncherVersions(left.version, right.version) || left.version.localeCompare(right.version)
    )),
  };
  await writeJson(input.path, next);
}

export async function cleanupLauncherPayloadRoots(input: {
  config: DesktopUpdaterConfig;
  currentRuntime: LauncherRuntimeDescriptor;
  keepVersions: ReadonlySet<string>;
  logger: DesktopUpdaterLogger;
  now: () => Date;
  removeLauncherPayloadRoot: (path: string) => Promise<void>;
  trigger: LauncherPayloadCleanupTrigger;
  versionPaths: ReturnType<typeof resolveLauncherVersionPaths>;
}): Promise<void> {
  const { config, currentRuntime, keepVersions, logger, now, removeLauncherPayloadRoot, trigger, versionPaths } = input;
  await rm(versionPaths.stagingRoot, { force: true, recursive: true }).catch((error: unknown) => {
    const cleanupError = launcherCleanupErrorFrom(error);
    logger.warn("[open-design updater] failed post-commit launcher staging cleanup", {
      error: cleanupError.message,
      errorCode: cleanupError.code,
      event: "launcher-payload-cleanup",
      path: versionPaths.stagingRoot,
      trigger,
    });
  });

  let cleanup: LauncherCleanupDescriptor | null;
  try {
    cleanup = await readLauncherCleanupDescriptor(config, versionPaths.cleanupPath);
  } catch (error) {
    const cleanupError = launcherCleanupErrorFrom(error);
    logger.warn("[open-design updater] skipped post-commit launcher cleanup because cleanup state is invalid", {
      error: cleanupError.message,
      errorCode: cleanupError.code,
      event: "launcher-payload-cleanup",
      path: versionPaths.cleanupPath,
      trigger,
    });
    return;
  }

  const retainedVersions = new Set([
    ...keepVersions,
    ...(cleanup?.versions.filter((entry) => entry.state === "retained").map((entry) => entry.version) ?? []),
  ]);
  let entries;
  try {
    entries = await readdir(versionPaths.versionsRoot, { withFileTypes: true });
  } catch (error) {
    const cleanupError = launcherCleanupErrorFrom(error);
    logger.warn("[open-design updater] failed to scan launcher payload versions after commit", {
      error: cleanupError.message,
      errorCode: cleanupError.code,
      event: "launcher-payload-cleanup",
      path: versionPaths.versionsRoot,
      trigger,
    });
    return;
  }

  const failures: LauncherPayloadCleanupFailure[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || retainedVersions.has(entry.name)) continue;
    const path = join(versionPaths.versionsRoot, entry.name);
    try {
      await removeLauncherPayloadRoot(path);
    } catch (error) {
      const cleanupError = launcherCleanupErrorFrom(error);
      failures.push({ error: cleanupError, version: entry.name });
      logger.warn("[open-design updater] deferred launcher payload cleanup", {
        error: cleanupError.message,
        errorCode: cleanupError.code,
        event: "launcher-payload-cleanup",
        path,
        trigger,
        version: entry.name,
      });
    }
  }
  if (failures.length === 0) return;

  try {
    await writeDeferredLauncherCleanupFailures({
      cleanup,
      config,
      currentRuntime,
      failures,
      nowIso: now().toISOString(),
      path: versionPaths.cleanupPath,
    });
  } catch (error) {
    const cleanupError = launcherCleanupErrorFrom(error);
    logger.warn("[open-design updater] failed to persist deferred launcher payload cleanup", {
      error: cleanupError.message,
      errorCode: cleanupError.code,
      event: "launcher-payload-cleanup",
      path: versionPaths.cleanupPath,
      trigger,
    });
  }
}

export function launcherCleanupError(code: string, message: string): NonNullable<LauncherCleanupEntry["error"]> {
  return { code, message };
}

export function summarizeLauncherCleanupDescriptor(descriptor: LauncherCleanupDescriptor): LauncherCleanupLifecycleSummary {
  const summary: LauncherCleanupLifecycleSummary = {
    cleanupDeferred: 0,
    cleanupRemoved: 0,
    deprecated: 0,
    retained: 0,
    total: descriptor.versions.length,
  };
  for (const version of descriptor.versions) {
    if (version.state === "cleanup-deferred") summary.cleanupDeferred += 1;
    if (version.state === "cleanup-removed") summary.cleanupRemoved += 1;
    if (version.state === "deprecated") summary.deprecated += 1;
    if (version.state === "retained") summary.retained += 1;
  }
  return summary;
}

/**
 * Manual disaster-recovery clear of launcher-side state: removes a stale
 * attempt.json, removes a non-terminal desktop-handoff journal, and deletes
 * any payload version directory not retained by runtime pointers or explicit
 * retained cleanup entries. The running desktop's own version is always
 * retained through runtime.active. A confirmed handoff journal is a successful
 * terminal state consulted by historical-outer cold starts and must survive.
 * When the runtime descriptor is unreadable the retained set is unknown, so
 * version cleanup is skipped entirely rather than risking the active payload.
 */
export async function clearLauncherStateForManualClear(input: {
  config: DesktopUpdaterConfig;
  logger: DesktopUpdaterLogger;
  now: () => Date;
  removeLauncherPayloadRoot: (path: string) => Promise<void>;
}): Promise<void> {
  const { config, logger, now, removeLauncherPayloadRoot } = input;
  if (config.launcherRoot == null || config.launcherRuntimePath == null || config.namespace == null) return;
  const launcherPaths = resolveLauncherPaths({
    channel: config.channel,
    namespace: config.namespace,
    root: config.launcherRoot,
  });

  // The app is running its active payload right now, so an unconfirmed attempt
  // is leftover state from an interrupted transition. Removing it means the
  // next cold start retries the active pointer instead of rolling back — the
  // deliberate trade of a manual reset.
  await rm(launcherPaths.attemptsPath, { force: true }).catch((error: unknown) => {
    logger.warn("[open-design updater] failed to clear stale launcher attempt", {
      error: error instanceof Error ? error.message : String(error),
      path: launcherPaths.attemptsPath,
    });
  });

  const rawHandoff = await readFile(launcherPaths.handoffPath, "utf8").catch(() => null);
  if (rawHandoff != null) {
    let confirmed = false;
    try {
      const parsed: unknown = JSON.parse(rawHandoff);
      confirmed = isRecord(parsed) && parsed.state === "confirmed";
    } catch {
      confirmed = false;
    }
    if (!confirmed) {
      await rm(launcherPaths.handoffPath, { force: true }).catch((error: unknown) => {
        logger.warn("[open-design updater] failed to clear stale desktop handoff journal", {
          error: error instanceof Error ? error.message : String(error),
          path: launcherPaths.handoffPath,
        });
      });
    }
  }

  let runtime: LauncherRuntimeDescriptor;
  try {
    runtime = validateLauncherRuntimeDescriptor(
      await readJsonStrict<LauncherRuntimeDescriptor>(config.launcherRuntimePath),
      { channel: config.channel, namespace: config.namespace },
    );
  } catch (error) {
    logger.warn("[open-design updater] skipped manual launcher version cleanup because runtime state is unreadable", {
      error: error instanceof Error ? error.message : String(error),
      runtimePath: config.launcherRuntimePath,
    });
    return;
  }
  const keepVersions = new Set<string>([
    ...(runtime.active == null ? [] : [runtime.active.version]),
    ...(runtime.lastSuccessful == null ? [] : [runtime.lastSuccessful.version]),
  ]);
  const versionPaths = resolveLauncherVersionPaths({
    channel: config.channel,
    namespace: config.namespace,
    root: config.launcherRoot,
    version: runtime.active?.version ?? config.currentVersion,
  });
  await cleanupLauncherPayloadRoots({
    config,
    currentRuntime: runtime,
    keepVersions,
    logger,
    now,
    removeLauncherPayloadRoot,
    trigger: "manual-clear",
    versionPaths,
  });
}

export async function runLauncherCleanupLifecycle(input: {
  config: DesktopUpdaterConfig;
  logger: DesktopUpdaterLogger;
  now: () => Date;
}): Promise<LauncherCleanupLifecycleSummary | null> {
  const { config, logger, now } = input;
  if (config.launcherRoot == null || config.launcherRuntimePath == null || config.namespace == null) return null;

  const launcherPaths = resolveLauncherPaths({
    channel: config.channel,
    namespace: config.namespace,
    root: config.launcherRoot,
  });
  const rawCleanup = await readJson<unknown>(launcherPaths.cleanupPath);
  if (rawCleanup == null) return null;

  let cleanup: LauncherCleanupDescriptor;
  let runtime: LauncherRuntimeDescriptor;
  try {
    cleanup = validateLauncherCleanupDescriptor(rawCleanup as LauncherCleanupDescriptor, {
      channel: config.channel,
      namespace: config.namespace,
    });
    runtime = validateLauncherRuntimeDescriptor(
      await readJsonStrict<LauncherRuntimeDescriptor>(config.launcherRuntimePath),
      { channel: config.channel, namespace: config.namespace },
    );
  } catch (error) {
    logger.warn("[open-design updater] failed to read launcher cleanup lifecycle inputs", {
      error: error instanceof Error ? error.message : String(error),
      cleanupPath: launcherPaths.cleanupPath,
      runtimePath: config.launcherRuntimePath,
    });
    return null;
  }

  const nowIso = now().toISOString();
  const retainedVersions = new Set<string>([
    ...(runtime.active == null ? [] : [runtime.active.version]),
    ...(runtime.lastSuccessful == null ? [] : [runtime.lastSuccessful.version]),
    ...cleanup.versions.filter((entry) => entry.state === "retained").map((entry) => entry.version),
  ]);
  const nextVersions: LauncherCleanupEntry[] = [];

  for (const entry of cleanup.versions) {
    if (entry.state !== "deprecated" && entry.state !== "cleanup-deferred") {
      nextVersions.push(entry);
      continue;
    }
    if (retainedVersions.has(entry.version)) {
      nextVersions.push({
        ...entry,
        error: launcherCleanupError("launcher-cleanup-retained", "deprecated launcher version is retained by runtime state"),
        reason: "cleanup-failed",
        state: "cleanup-deferred",
        updatedAt: nowIso,
      });
      continue;
    }

    const versionPaths = resolveLauncherVersionPaths({
      channel: config.channel,
      namespace: config.namespace,
      root: config.launcherRoot,
      version: entry.version,
    });
    try {
      const versionEntry = await lstat(versionPaths.versionRoot).catch(() => null);
      if (versionEntry != null && (!versionEntry.isDirectory() || versionEntry.isSymbolicLink())) {
        throw new Error(`launcher cleanup target is not a plain directory: ${versionPaths.versionRoot}`);
      }
      if (versionEntry?.isDirectory()) {
        const realVersionsRoot = await realpath(versionPaths.versionsRoot);
        const realVersionRoot = await realpath(versionPaths.versionRoot);
        if (!containsPath(realVersionsRoot, realVersionRoot)) {
          throw new Error(`launcher cleanup target escaped versions root: ${realVersionRoot}`);
        }
      }
      await rm(versionPaths.versionRoot, { force: true, recursive: true });
      nextVersions.push({
        ...entry,
        error: undefined,
        removedAt: entry.removedAt ?? nowIso,
        state: "cleanup-removed",
        updatedAt: nowIso,
      });
    } catch (error) {
      logger.warn("[open-design updater] failed to clean deprecated launcher payload", {
        error: error instanceof Error ? error.message : String(error),
        path: versionPaths.versionRoot,
        version: entry.version,
      });
      nextVersions.push({
        ...entry,
        error: launcherCleanupError("launcher-cleanup-failed", error instanceof Error ? error.message : String(error)),
        reason: "cleanup-failed",
        state: "cleanup-deferred",
        updatedAt: nowIso,
      });
    }
  }

  const next: LauncherCleanupDescriptor = {
    ...cleanup,
    updatedAt: nowIso,
    versions: nextVersions,
  };
  await writeJson(launcherPaths.cleanupPath, next);
  return summarizeLauncherCleanupDescriptor(next);
}
