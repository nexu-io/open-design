import { access, lstat, mkdir, readdir, realpath, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import type {
  DesktopUpdateArtifactSnapshot,
  DesktopUpdateChannel,
  DesktopUpdateChecksumSnapshot,
  DesktopUpdateErrorSnapshot,
  DesktopUpdateStatusSnapshot,
} from "@open-design/sidecar-proto";

import {
  isDesktopUpdateChannel,
  normalizeDownloadRoot,
  type DesktopUpdaterConfig,
} from "./config.js";
import {
  containsPath,
  createError,
  directoryIsEmpty,
  isRecord,
  readJson,
  stringField,
  writeJson,
} from "./support.js";
import type { DesktopUpdaterLogger } from "../updater.js";

/**
 * @module updater/store
 *
 * On-disk update store ownership and layout: the ownership sentinel, the
 * store directory shape, persisted store metadata types with their guards,
 * and the owned-root recovery used by manual clear-cache.
 */

export const OWNERSHIP_SENTINEL = ".open-design-updater-root.json";
export const STORE_METADATA_FILE = "metadata.json";
export const RELEASES_DIR = "releases";
export const STAGING_DIR = "staging";
export const DOWNLOADS_DIR = "downloads";
export const BACK_DIR = ".back";
export const HELPERS_DIR = "helpers";
export const STATE_DIR = "state";
export const CLEANUP_METADATA_FILE = "cleanup.json";
export const LOCK_DIR = "lock";
export const LOCK_OWNER_FILE = "owner.json";
export const UPDATE_ROOT_VERSION = 1;
export const STORE_METADATA_VERSION = 1;

export type UpdateReleaseRef = {
  arch: string;
  artifact: DesktopUpdateArtifactSnapshot;
  artifactPath: string;
  checksum: DesktopUpdateChecksumSnapshot;
  checksumPath: string;
  channel: DesktopUpdateChannel;
  downloadedAt: string;
  key: string;
  metadata: Record<string, unknown>;
  metadataPath: string;
  platformKey: string;
  version: string;
};

export type IncomingRef = {
  arch: string;
  artifact: DesktopUpdateArtifactSnapshot;
  channel: DesktopUpdateChannel;
  cycleId: string;
  metadata: Record<string, unknown>;
  platformKey: string;
  startedAt: string;
  version: string;
};

export type UpdateStoreMetadata = {
  active?: UpdateReleaseRef;
  incoming?: IncomingRef;
  installFrozen?: boolean;
  installResult?: DesktopUpdateStatusSnapshot["installResult"];
  lastCheckedAt?: string;
  version: typeof STORE_METADATA_VERSION;
};

export type ResolvedChecksumSnapshot = DesktopUpdateChecksumSnapshot & { value: string };

export type OwnedRoot =
  | { layout: DesktopUpdaterStoreLayout; metadataPath: string; ok: true; realRoot: string }
  | { error: DesktopUpdateErrorSnapshot; ok: false };

export type DesktopUpdaterStoreLayout = {
  backRoot: string;
  cleanupPath: string;
  downloadsRoot: string;
  helpersRoot: string;
  lockRoot: string;
  metadataPath: string;
  ownershipSentinelPath: string;
  releasesRoot: string;
  root: string;
  stagingRoot: string;
  stateRoot: string;
};

export function resolveDesktopUpdaterStoreLayout(root: string): DesktopUpdaterStoreLayout {
  const realRoot = resolve(root);
  const stateRoot = join(realRoot, STATE_DIR);
  return {
    backRoot: join(realRoot, BACK_DIR),
    cleanupPath: join(stateRoot, CLEANUP_METADATA_FILE),
    downloadsRoot: join(realRoot, DOWNLOADS_DIR),
    helpersRoot: join(realRoot, HELPERS_DIR),
    lockRoot: join(stateRoot, LOCK_DIR),
    metadataPath: join(realRoot, STORE_METADATA_FILE),
    ownershipSentinelPath: join(realRoot, OWNERSHIP_SENTINEL),
    releasesRoot: join(realRoot, RELEASES_DIR),
    root: realRoot,
    stagingRoot: join(realRoot, STAGING_DIR),
    stateRoot,
  };
}

export function rootEntryForPath(layout: DesktopUpdaterStoreLayout, path: string): string {
  return relative(layout.root, path).split(/[\\/]/)[0] ?? "";
}

export function rootEntriesForLayout(layout: DesktopUpdaterStoreLayout): Set<string> {
  return new Set([
    rootEntryForPath(layout, layout.backRoot),
    rootEntryForPath(layout, layout.downloadsRoot),
    rootEntryForPath(layout, layout.helpersRoot),
    rootEntryForPath(layout, layout.ownershipSentinelPath),
    rootEntryForPath(layout, layout.releasesRoot),
    rootEntryForPath(layout, layout.stagingRoot),
    rootEntryForPath(layout, layout.stateRoot),
    rootEntryForPath(layout, layout.metadataPath),
  ]);
}

export function storeShapeError(root: string, message: string, details?: unknown): DesktopUpdateErrorSnapshot {
  return createError("update-store-invalid-shape", message, {
    root,
    ...(details === undefined ? {} : { details }),
  });
}

export function logStoreError(logger: DesktopUpdaterLogger, error: DesktopUpdateErrorSnapshot): void {
  logger.error("[open-design updater] invalid update store", error);
}

export function isAllowedRootEntry(layout: DesktopUpdaterStoreLayout, name: string): boolean {
  return rootEntriesForLayout(layout).has(name);
}

export function isUpdateStoreMetadata(value: unknown): value is UpdateStoreMetadata {
  if (!isRecord(value) || value.version !== STORE_METADATA_VERSION) return false;
  if (value.active != null && !isUpdateReleaseRef(value.active)) return false;
  if (value.incoming != null && !isIncomingRef(value.incoming)) return false;
  if (value.installFrozen != null && typeof value.installFrozen !== "boolean") return false;
  if (value.installResult != null && !isInstallResult(value.installResult)) return false;
  if (value.lastCheckedAt != null && typeof value.lastCheckedAt !== "string") return false;
  return true;
}

export function isArtifactSnapshot(value: unknown): value is DesktopUpdateArtifactSnapshot {
  if (!isRecord(value)) return false;
  if (stringField(value, "platformKey") == null) return false;
  if (stringField(value, "type") == null) return false;
  if (stringField(value, "url") == null) return false;
  if (value.name != null && typeof value.name !== "string") return false;
  if (value.size != null && (typeof value.size !== "number" || !Number.isFinite(value.size))) return false;
  return true;
}

export function isChecksumSnapshot(value: unknown): value is DesktopUpdateChecksumSnapshot {
  if (!isRecord(value)) return false;
  if (value.algorithm !== "sha256" && value.algorithm !== "sha512") return false;
  if (value.value != null && typeof value.value !== "string") return false;
  if (value.url != null && typeof value.url !== "string") return false;
  return true;
}

export function isResolvedChecksumSnapshot(value: unknown): value is ResolvedChecksumSnapshot {
  return isChecksumSnapshot(value) && typeof value.value === "string" && value.value.length > 0;
}

export function isUpdateReleaseRef(value: unknown): value is UpdateReleaseRef {
  if (!isRecord(value)) return false;
  return stringField(value, "arch") != null &&
    isArtifactSnapshot(value.artifact) &&
    stringField(value, "artifactPath") != null &&
    isChecksumSnapshot(value.checksum) &&
    stringField(value, "checksumPath") != null &&
    isDesktopUpdateChannel(value.channel) &&
    stringField(value, "downloadedAt") != null &&
    stringField(value, "key") != null &&
    isRecord(value.metadata) &&
    stringField(value, "metadataPath") != null &&
    stringField(value, "platformKey") != null &&
    stringField(value, "version") != null;
}

export function isIncomingRef(value: unknown): value is IncomingRef {
  if (!isRecord(value)) return false;
  return stringField(value, "arch") != null &&
    isArtifactSnapshot(value.artifact) &&
    isDesktopUpdateChannel(value.channel) &&
    stringField(value, "cycleId") != null &&
    isRecord(value.metadata) &&
    stringField(value, "platformKey") != null &&
    stringField(value, "startedAt") != null &&
    stringField(value, "version") != null;
}

export function isInstallResult(value: unknown): value is NonNullable<DesktopUpdateStatusSnapshot["installResult"]> {
  if (!isRecord(value)) return false;
  if (stringField(value, "openedAt") == null) return false;
  if (stringField(value, "path") == null) return false;
  if (value.activeVersion != null && typeof value.activeVersion !== "string") return false;
  if (value.artifactPath != null && typeof value.artifactPath !== "string") return false;
  if (value.dryRun != null && typeof value.dryRun !== "boolean") return false;
  if (value.helperLogPath != null && typeof value.helperLogPath !== "string") return false;
  if (value.launcherRuntimePath != null && typeof value.launcherRuntimePath !== "string") return false;
  if (value.launchPath != null && typeof value.launchPath !== "string") return false;
  return true;
}

export async function ensureOwnedUpdateRoot(
  config: DesktopUpdaterConfig,
  logger: DesktopUpdaterLogger = console,
): Promise<OwnedRoot> {
  const root = normalizeDownloadRoot(config.downloadRoot);
  try {
    await mkdir(root, { recursive: true });
    const rootEntry = await lstat(root);
    if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) {
      return {
        ok: false,
        error: createError("update-root-not-owned", `update root is not an owned directory: ${root}`),
      };
    }
    const realRoot = await realpath(root);
    const layout = resolveDesktopUpdaterStoreLayout(realRoot);
    const sentinel = await readJson<{ namespace?: string; version?: number }>(layout.ownershipSentinelPath);
    if (sentinel != null) {
      if (sentinel.version !== UPDATE_ROOT_VERSION) {
        return {
          ok: false,
          error: createError("update-root-version-mismatch", `update root has unsupported ownership marker version at ${layout.ownershipSentinelPath}`),
        };
      }
    } else {
      if (!(await directoryIsEmpty(realRoot))) {
        return {
          ok: false,
          error: createError(
            "update-root-not-owned",
            `update root is not empty and has no Open Design updater ownership marker: ${realRoot}`,
          ),
        };
      }
      await writeJson(layout.ownershipSentinelPath, {
        createdAt: new Date().toISOString(),
        owner: "open-design-updater",
        source: config.source,
        version: UPDATE_ROOT_VERSION,
      });
    }

    const entries = await readdir(realRoot);
    const unexpected = entries.filter((entry) => !isAllowedRootEntry(layout, entry));
    if (unexpected.length > 0) {
      const error = storeShapeError(realRoot, "update store contains unexpected root entries", { unexpected });
      logStoreError(logger, error);
      return { ok: false, error };
    }

    for (const dirName of [RELEASES_DIR, STAGING_DIR, DOWNLOADS_DIR, BACK_DIR, HELPERS_DIR, STATE_DIR]) {
      const path = join(realRoot, dirName);
      let entry;
      try {
        entry = await lstat(path);
      } catch {
        continue;
      }
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        const error = storeShapeError(realRoot, `update store entry ${dirName} must be a plain directory`, { path });
        logStoreError(logger, error);
        return { ok: false, error };
      }
      const realDir = await realpath(path);
      if (!containsPath(realRoot, realDir)) {
        const error = storeShapeError(realRoot, `update store entry ${dirName} escapes update root`, { path, realDir });
        logStoreError(logger, error);
        return { ok: false, error };
      }
    }

    try {
      await access(layout.metadataPath);
    } catch {
      const nonSentinelEntries = entries.filter((entry) => entry !== OWNERSHIP_SENTINEL);
      if (nonSentinelEntries.length > 0) {
        const error = storeShapeError(realRoot, "update store metadata.json is missing for a non-empty store", {
          entries: nonSentinelEntries,
        });
        logStoreError(logger, error);
        return { ok: false, error };
      }
      await writeJson(layout.metadataPath, { version: STORE_METADATA_VERSION });
    }

    return { ok: true, layout, metadataPath: layout.metadataPath, realRoot };
  } catch (error) {
    return {
      ok: false,
      error: createError("update-root-unavailable", error instanceof Error ? error.message : String(error)),
    };
  }
}

/**
 * Manual-clear degradation for a corrupt store: rebuild an update root the
 * updater can PROVE it owns. Proof is the current-generation ownership
 * sentinel — everything else inside an owned root is updater cache by
 * definition and safe to purge. Roots without a sentinel (unowned), with a
 * foreign-generation marker (another updater's store), or failing IO are
 * never touched; the caller surfaces the original store error instead.
 */
export async function rebuildOwnedUpdateRootForManualClear(
  config: DesktopUpdaterConfig,
  logger: DesktopUpdaterLogger,
): Promise<boolean> {
  try {
    const root = normalizeDownloadRoot(config.downloadRoot);
    const rootEntry = await lstat(root);
    if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) return false;
    const realRoot = await realpath(root);
    const layout = resolveDesktopUpdaterStoreLayout(realRoot);
    const sentinel = await readJson<{ version?: number }>(layout.ownershipSentinelPath);
    if (sentinel == null || sentinel.version !== UPDATE_ROOT_VERSION) return false;
    for (const entry of await readdir(realRoot)) {
      if (entry === OWNERSHIP_SENTINEL) continue;
      await rm(join(realRoot, entry), { force: true, recursive: true });
    }
    await writeJson(layout.metadataPath, { version: STORE_METADATA_VERSION });
    logger.warn("[open-design updater] rebuilt corrupt owned update store for manual clear", { root: realRoot });
    return true;
  } catch (error) {
    logger.warn("[open-design updater] failed to rebuild corrupt update store for manual clear", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function ensureOwnedSubdir(root: string, name: string): Promise<string> {
  if (name.length === 0 || name.includes("\0") || /[\\/]/.test(name)) {
    throw new Error(`update subdirectory must be a simple path segment: ${name}`);
  }
  const dir = join(root, name);
  if (!containsPath(root, dir)) throw new Error(`update subdirectory escaped update root: ${dir}`);
  await mkdir(dir, { recursive: true });
  const entry = await lstat(dir);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error(`update subdirectory is not an owned directory: ${dir}`);
  }
  const realDir = await realpath(dir);
  if (!containsPath(root, realDir)) throw new Error(`update subdirectory realpath escaped update root: ${realDir}`);
  return realDir;
}

