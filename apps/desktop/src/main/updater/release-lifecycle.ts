import { lstat, mkdir, readdir, realpath, rename, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import type {
  DesktopUpdateCacheLifecycleSummary,
  DesktopUpdateCacheLifecycleTrigger,
  DesktopUpdateErrorSnapshot,
  DesktopUpdateReleaseLifecycleState,
  DesktopUpdateStatusSnapshot,
} from "@open-design/sidecar-proto";

import type { DesktopUpdaterConfig } from "./config.js";
import {
  BACK_DIR,
  LOCK_OWNER_FILE,
  type DesktopUpdaterStoreLayout,
} from "./store.js";
import {
  containsPath,
  createError,
  isRecord,
  readJson,
  readJsonStrict,
  stringField,
  writeJson,
} from "./support.js";
import { compareVersions, releaseVersionForChannel } from "./feed.js";
import type { DesktopUpdaterLogger } from "../updater.js";

/**
 * @module updater/release-lifecycle
 *
 * Release-store cleanup lifecycle: the cleanup.json descriptor with its
 * guards, deprecate/remove scanning with deferred-failure retry, the
 * mkdir-based lifecycle lock, and the .back directory sweep.
 */

export const RELEASE_CLEANUP_DESCRIPTOR_VERSION = 1;

export type ReleaseCleanupReason =
  | "cleanup-failed"
  | "current-version-or-newer"
  | "manual-clear"
  | "metadata-invalid"
  | "metadata-missing"
  | "older-than-current-version";

export type ReleaseCleanupEntry = {
  currentVersion?: string;
  deprecatedAt?: string;
  error?: DesktopUpdateErrorSnapshot;
  key: string;
  metadataPath?: string;
  path: string;
  readyVersion?: string;
  reason: ReleaseCleanupReason;
  removedAt?: string;
  state: DesktopUpdateReleaseLifecycleState;
  updatedAt: string;
  version?: string;
};

export type ReleaseCleanupDescriptor = {
  currentVersion?: string;
  platform: string;
  readyVersion?: string;
  releases: ReleaseCleanupEntry[];
  trigger: DesktopUpdateCacheLifecycleTrigger;
  updatedAt: string;
  version: typeof RELEASE_CLEANUP_DESCRIPTOR_VERSION;
};

export async function cleanupBackDirectory(root: string, logger: DesktopUpdaterLogger): Promise<void> {
  const backDir = join(root, BACK_DIR);
  const entry = await lstat(backDir).catch(() => null);
  if (entry == null) return;
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    logger.warn("[open-design updater] skipped invalid update backup directory", backDir);
    return;
  }
  const realBackDir = await realpath(backDir).catch(() => null);
  if (realBackDir == null || !containsPath(root, realBackDir)) {
    logger.warn("[open-design updater] skipped escaped update backup directory", backDir);
    return;
  }
  const entries = await readdir(backDir);
  await Promise.all(entries.map(async (entry) => {
    const path = join(backDir, entry);
    const resolved = resolve(path);
    if (!containsPath(root, resolved)) return;
    const stats = await lstat(resolved).catch(() => null);
    if (stats == null || stats.isSymbolicLink()) return;
    if (stats.isDirectory()) {
      const real = await realpath(resolved).catch(() => null);
      if (real == null || !containsPath(root, real)) return;
    }
    await rm(resolved, { force: true, recursive: true }).catch((error: unknown) => {
      logger.warn("[open-design updater] failed to clean update backup entry", error);
    });
  }));
}

export function scheduleBackCleanup(root: string, logger: DesktopUpdaterLogger): void {
  void cleanupBackDirectory(root, logger).catch((error: unknown) => {
    logger.warn("[open-design updater] failed to clean update backup directory", error);
  });
}

export function isReleaseLifecycleState(value: unknown): value is DesktopUpdateReleaseLifecycleState {
  return value === "cleanup-deferred" ||
    value === "cleanup-removed" ||
    value === "deprecated" ||
    value === "retained" ||
    value === "unknown";
}

export function isReleaseCleanupReason(value: unknown): value is ReleaseCleanupReason {
  return value === "cleanup-failed" ||
    value === "current-version-or-newer" ||
    value === "manual-clear" ||
    value === "metadata-invalid" ||
    value === "metadata-missing" ||
    value === "older-than-current-version";
}

export function isDesktopUpdateErrorSnapshot(value: unknown): value is DesktopUpdateErrorSnapshot {
  if (!isRecord(value)) return false;
  return stringField(value, "code") != null && stringField(value, "message") != null;
}

export function isReleaseCleanupEntry(value: unknown): value is ReleaseCleanupEntry {
  if (!isRecord(value)) return false;
  if (stringField(value, "key") == null) return false;
  if (stringField(value, "path") == null) return false;
  if (!isReleaseLifecycleState(value.state)) return false;
  if (!isReleaseCleanupReason(value.reason)) return false;
  if (stringField(value, "updatedAt") == null) return false;
  if (value.currentVersion != null && typeof value.currentVersion !== "string") return false;
  if (value.deprecatedAt != null && typeof value.deprecatedAt !== "string") return false;
  if (value.metadataPath != null && typeof value.metadataPath !== "string") return false;
  if (value.readyVersion != null && typeof value.readyVersion !== "string") return false;
  if (value.removedAt != null && typeof value.removedAt !== "string") return false;
  if (value.version != null && typeof value.version !== "string") return false;
  if (value.error != null && !isDesktopUpdateErrorSnapshot(value.error)) return false;
  return true;
}

export function isReleaseCleanupDescriptor(value: unknown): value is ReleaseCleanupDescriptor {
  if (!isRecord(value)) return false;
  if (value.version !== RELEASE_CLEANUP_DESCRIPTOR_VERSION) return false;
  if (typeof value.platform !== "string") return false;
  if (value.trigger !== "cold-start" && value.trigger !== "manual" && value.trigger !== "next-version-ready") return false;
  if (typeof value.updatedAt !== "string") return false;
  if (value.currentVersion != null && typeof value.currentVersion !== "string") return false;
  if (value.readyVersion != null && typeof value.readyVersion !== "string") return false;
  if (!Array.isArray(value.releases)) return false;
  return value.releases.every(isReleaseCleanupEntry);
}

export function emptyLifecycleSummary(platform: string): DesktopUpdateCacheLifecycleSummary {
  return {
    platform,
    releases: {
      cleanupDeferred: 0,
      cleanupRemoved: 0,
      deprecated: 0,
      errors: 0,
      retained: 0,
      total: 0,
      unknown: 0,
    },
  };
}

export function summarizeReleaseCleanupDescriptor(
  descriptor: ReleaseCleanupDescriptor | null,
  platform: string,
): DesktopUpdateCacheLifecycleSummary {
  if (descriptor == null) return emptyLifecycleSummary(platform);
  const summary = emptyLifecycleSummary(descriptor.platform);
  summary.lastRunAt = descriptor.updatedAt;
  summary.lastTrigger = descriptor.trigger;
  summary.releases.total = descriptor.releases.length;
  for (const release of descriptor.releases) {
    if (release.state === "cleanup-deferred") summary.releases.cleanupDeferred += 1;
    if (release.state === "cleanup-removed") summary.releases.cleanupRemoved += 1;
    if (release.state === "deprecated") summary.releases.deprecated += 1;
    if (release.state === "retained") summary.releases.retained += 1;
    if (release.state === "unknown") summary.releases.unknown += 1;
    if (release.error != null) summary.releases.errors += 1;
  }
  return summary;
}

export async function readReleaseCleanupDescriptor(layout: DesktopUpdaterStoreLayout): Promise<ReleaseCleanupDescriptor | null> {
  const raw = await readJson<unknown>(layout.cleanupPath);
  return isReleaseCleanupDescriptor(raw) ? raw : null;
}

export function relativeStorePath(layout: DesktopUpdaterStoreLayout, path: string): string {
  return relative(layout.root, path);
}

export function releaseCleanupError(code: string, message: string, details?: unknown): DesktopUpdateErrorSnapshot {
  return createError(code, message, details);
}

export async function withUpdaterLifecycleLock<T>(
  layout: DesktopUpdaterStoreLayout,
  logger: DesktopUpdaterLogger,
  task: () => Promise<T>,
  options: { reclaimStale?: boolean } = {},
): Promise<T | null> {
  await mkdir(layout.stateRoot, { recursive: true });
  const acquire = async (): Promise<boolean> => {
    try {
      await mkdir(layout.lockRoot);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      return false;
    }
  };
  let acquired = await acquire();
  if (!acquired && options.reclaimStale === true) {
    const owner = await readJson<unknown>(join(layout.lockRoot, LOCK_OWNER_FILE));
    const ownerPid = isRecord(owner) && owner.owner === "open-design-updater-lifecycle"
      && owner.version === RELEASE_CLEANUP_DESCRIPTOR_VERSION
      && typeof owner.pid === "number" && Number.isSafeInteger(owner.pid) && owner.pid > 0
      ? owner.pid
      : null;
    let ownerIsDead = false;
    if (ownerPid != null) {
      try {
        process.kill(ownerPid, 0);
      } catch (error) {
        ownerIsDead = (error as NodeJS.ErrnoException).code === "ESRCH";
      }
    }
    if (ownerIsDead) {
      const staleLockRoot = `${layout.lockRoot}.stale-${process.pid}-${Date.now()}`;
      try {
        await rename(layout.lockRoot, staleLockRoot);
        await rm(staleLockRoot, { force: true, recursive: true });
        acquired = await acquire();
        if (acquired) {
          logger.warn("[open-design updater] reclaimed stale updater lifecycle lock", {
            lockRoot: layout.lockRoot,
            ownerPid,
          });
        }
      } catch (error) {
        logger.warn("[open-design updater] failed to reclaim stale updater lifecycle lock", error);
      }
    }
  }
  if (!acquired) {
    logger.warn("[open-design updater] skipped release lifecycle because updater lifecycle lock is held", {
      lockRoot: layout.lockRoot,
    });
    return null;
  }
  try {
    await writeJson(join(layout.lockRoot, LOCK_OWNER_FILE), {
      createdAt: new Date().toISOString(),
      owner: "open-design-updater-lifecycle",
      pid: process.pid,
      version: RELEASE_CLEANUP_DESCRIPTOR_VERSION,
    });
    return await task();
  } finally {
    await rm(layout.lockRoot, { force: true, recursive: true }).catch((error: unknown) => {
      logger.warn("[open-design updater] failed to release updater lifecycle lock", error);
    });
  }
}

export function mergeExistingReleaseCleanupEntry(
  existing: ReleaseCleanupEntry | undefined,
  next: ReleaseCleanupEntry,
): ReleaseCleanupEntry {
  if (next.state !== "deprecated" && next.state !== "cleanup-deferred") return next;
  return {
    ...next,
    deprecatedAt: existing?.deprecatedAt ?? next.deprecatedAt,
  };
}

export async function scanReleaseCleanupEntries(input: {
  config: DesktopUpdaterConfig;
  // Manual clear resets the downloaded-update state entirely, so every scanned
  // release is deprecated regardless of its version relative to the running one.
  deprecateAll?: boolean;
  descriptor: ReleaseCleanupDescriptor | null;
  layout: DesktopUpdaterStoreLayout;
  nowIso: string;
  readyVersion?: string;
}): Promise<ReleaseCleanupEntry[]> {
  const { config, deprecateAll, descriptor, layout, nowIso, readyVersion } = input;
  const existing = new Map((descriptor?.releases ?? []).map((entry) => [entry.key, entry] as const));
  const entries = await readdir(layout.releasesRoot, { withFileTypes: true }).catch(() => []);
  const nextEntries: ReleaseCleanupEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const releaseDir = resolve(layout.releasesRoot, entry.name);
    if (!containsPath(layout.releasesRoot, releaseDir)) {
      nextEntries.push({
        currentVersion: config.currentVersion,
        error: releaseCleanupError("release-path-escaped", "release directory escaped releases root", { path: releaseDir }),
        key: entry.name,
        path: relativeStorePath(layout, releaseDir),
        reason: "metadata-invalid",
        state: "unknown",
        updatedAt: nowIso,
      });
      continue;
    }
    const releaseEntry = await lstat(releaseDir).catch(() => null);
    if (releaseEntry == null || !releaseEntry.isDirectory() || releaseEntry.isSymbolicLink()) {
      nextEntries.push({
        currentVersion: config.currentVersion,
        error: releaseCleanupError("release-path-invalid", "release entry is not a plain directory", { path: releaseDir }),
        key: entry.name,
        path: relativeStorePath(layout, releaseDir),
        reason: "metadata-invalid",
        state: "unknown",
        updatedAt: nowIso,
      });
      continue;
    }
    const metadataPath = join(releaseDir, "metadata.json");
    let metadata: unknown;
    try {
      metadata = await readJsonStrict<unknown>(metadataPath);
    } catch (error) {
      nextEntries.push({
        currentVersion: config.currentVersion,
        error: releaseCleanupError("release-metadata-missing", "release metadata.json could not be read", {
          reason: error instanceof Error ? error.message : String(error),
        }),
        key: entry.name,
        metadataPath: relativeStorePath(layout, metadataPath),
        path: relativeStorePath(layout, releaseDir),
        reason: "metadata-missing",
        state: "unknown",
        updatedAt: nowIso,
      });
      continue;
    }
    if (!isRecord(metadata)) {
      nextEntries.push({
        currentVersion: config.currentVersion,
        error: releaseCleanupError("release-metadata-invalid", "release metadata.json is not an object"),
        key: entry.name,
        metadataPath: relativeStorePath(layout, metadataPath),
        path: relativeStorePath(layout, releaseDir),
        reason: "metadata-invalid",
        state: "unknown",
        updatedAt: nowIso,
      });
      continue;
    }
    const version = releaseVersionForChannel(metadata, config.channel);
    if (version == null) {
      nextEntries.push({
        currentVersion: config.currentVersion,
        error: releaseCleanupError("release-version-missing", "release metadata does not expose a version for the updater channel", {
          channel: config.channel,
        }),
        key: entry.name,
        metadataPath: relativeStorePath(layout, metadataPath),
        path: relativeStorePath(layout, releaseDir),
        reason: "metadata-invalid",
        state: "unknown",
        updatedAt: nowIso,
      });
      continue;
    }

    const deprecated = deprecateAll === true || compareVersions(version, config.currentVersion) < 0;
    const next: ReleaseCleanupEntry = {
      currentVersion: config.currentVersion,
      key: entry.name,
      metadataPath: relativeStorePath(layout, metadataPath),
      path: relativeStorePath(layout, releaseDir),
      ...(readyVersion == null ? {} : { readyVersion }),
      reason: deprecateAll === true
        ? "manual-clear"
        : deprecated
          ? "older-than-current-version"
          : "current-version-or-newer",
      state: deprecated ? "deprecated" : "retained",
      updatedAt: nowIso,
      version,
      ...(deprecated ? { deprecatedAt: nowIso } : {}),
    };
    nextEntries.push(mergeExistingReleaseCleanupEntry(existing.get(entry.name), next));
  }

  for (const previous of descriptor?.releases ?? []) {
    if (nextEntries.some((entry) => entry.key === previous.key)) continue;
    if (previous.state === "cleanup-removed") nextEntries.push(previous);
  }

  nextEntries.sort((left, right) => left.key.localeCompare(right.key));
  return nextEntries;
}

export async function cleanupDeprecatedReleaseEntries(input: {
  descriptor: ReleaseCleanupDescriptor;
  layout: DesktopUpdaterStoreLayout;
  logger: DesktopUpdaterLogger;
  nowIso: string;
}): Promise<ReleaseCleanupDescriptor> {
  const { descriptor, layout, logger, nowIso } = input;
  const releases: ReleaseCleanupEntry[] = [];
  for (const entry of descriptor.releases) {
    if (entry.state !== "deprecated" && entry.state !== "cleanup-deferred") {
      releases.push(entry);
      continue;
    }
    const releaseDir = resolve(layout.root, entry.path);
    if (!containsPath(layout.releasesRoot, releaseDir)) {
      releases.push({
        ...entry,
        error: releaseCleanupError("release-cleanup-path-escaped", "deprecated release path escaped releases root", {
          path: releaseDir,
        }),
        reason: "cleanup-failed",
        state: "cleanup-deferred",
        updatedAt: nowIso,
      });
      continue;
    }
    try {
      const releaseEntry = await lstat(releaseDir).catch(() => null);
      if (releaseEntry != null && (!releaseEntry.isDirectory() || releaseEntry.isSymbolicLink())) {
        throw new Error(`release cleanup target is not a plain directory: ${releaseDir}`);
      }
      if (releaseEntry?.isDirectory()) {
        const realReleaseDir = await realpath(releaseDir);
        if (!containsPath(layout.releasesRoot, realReleaseDir)) {
          throw new Error(`release cleanup target escaped releases root: ${realReleaseDir}`);
        }
      }
      await rm(releaseDir, { force: true, recursive: true });
      releases.push({
        ...entry,
        error: undefined,
        removedAt: entry.removedAt ?? nowIso,
        state: "cleanup-removed",
        updatedAt: nowIso,
      });
    } catch (error) {
      logger.warn("[open-design updater] failed to clean deprecated release", {
        error: error instanceof Error ? error.message : String(error),
        key: entry.key,
        path: releaseDir,
      });
      releases.push({
        ...entry,
        error: releaseCleanupError("release-cleanup-failed", error instanceof Error ? error.message : String(error)),
        reason: "cleanup-failed",
        state: "cleanup-deferred",
        updatedAt: nowIso,
      });
    }
  }
  return {
    ...descriptor,
    releases,
    updatedAt: nowIso,
  };
}

export async function runUpdateReleaseLifecycle(input: {
  config: DesktopUpdaterConfig;
  layout: DesktopUpdaterStoreLayout;
  logger: DesktopUpdaterLogger;
  now: () => Date;
  reclaimStaleLock?: boolean;
  readyVersion?: string;
  trigger: DesktopUpdateCacheLifecycleTrigger;
}): Promise<DesktopUpdateCacheLifecycleSummary | null> {
  const { config, layout, logger, now, readyVersion, trigger } = input;
  return await withUpdaterLifecycleLock(layout, logger, async () => {
    const startedAt = now().toISOString();
    const current = await readReleaseCleanupDescriptor(layout);
    let next: ReleaseCleanupDescriptor;
    if (trigger === "next-version-ready" || trigger === "manual") {
      next = {
        currentVersion: config.currentVersion,
        platform: config.platform,
        ...(readyVersion == null ? {} : { readyVersion }),
        releases: await scanReleaseCleanupEntries({
          config,
          deprecateAll: trigger === "manual",
          descriptor: current,
          layout,
          nowIso: startedAt,
          readyVersion,
        }),
        trigger,
        updatedAt: startedAt,
        version: RELEASE_CLEANUP_DESCRIPTOR_VERSION,
      };
      await writeJson(layout.cleanupPath, next);
    } else {
      next = current ?? {
        currentVersion: config.currentVersion,
        platform: config.platform,
        releases: [],
        trigger,
        updatedAt: startedAt,
        version: RELEASE_CLEANUP_DESCRIPTOR_VERSION,
      };
    }

    const cleaned = await cleanupDeprecatedReleaseEntries({
      descriptor: {
        ...next,
        currentVersion: config.currentVersion,
        platform: config.platform,
        trigger,
        updatedAt: startedAt,
      },
      layout,
      logger,
      nowIso: now().toISOString(),
    });
    await writeJson(layout.cleanupPath, cleaned);
    return summarizeReleaseCleanupDescriptor(cleaned, config.platform);
  }, { reclaimStale: input.reclaimStaleLock });
}
