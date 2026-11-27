/**
 * @module prune
 *
 * Age-based garbage collection of a managed base. Groups each target's final
 * file and scratch state, acquires its existing download lock, then removes the
 * group only when all its entries are old. Live or unverifiable owners are
 * skipped without waiting. Depends on target resolution, store ownership,
 * manifests, download locks, and the platform best-effort remover.
 */

import { lstat, readdir, rmdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { removePathBestEffort } from "@open-design/platform";

import { DEFAULT_PRUNE_OLDER_THAN_MS, LOCK_DIR, PARTIAL_DIR, STATE_DIR } from "./constants.js";
import { MANAGED_DOWNLOAD_ERROR_CODES, ManagedDownloadError } from "./errors.js";
import { acquireLock, releaseLock, type AcquiredLock } from "./lock.js";
import { readManifest } from "./manifest.js";
import { ensureManagedBase } from "./store.js";
import { normalizeBasePath, targetFromOptions, type NormalizedTarget } from "./target.js";
import type { PruneManagedDownloadsOptions, PruneManagedDownloadsResult } from "./types.js";

type PruneTarget = {
  key: string;
  lock: Pick<NormalizedTarget, "bucket" | "fileName" | "lockPath">;
  manifestPath: string;
  paths: Set<string>;
};

/** @internal Resolve a target's paths without needing its download URL or checksum. */
function namedTarget(basePath: string, bucket: string, fileName: string): NormalizedTarget {
  return targetFromOptions({
    basePath, bucket, fileName,
    payload: { checksum: { algorithm: "sha256", value: "0".repeat(64) }, url: "https://example.invalid/" },
  });
}

/** @internal Missing entries are harmless; other inspection failures must prevent removal. */
async function modifiedAt(path: string): Promise<number | null> {
  try {
    return (await stat(path)).mtimeMs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** @internal Remove observed stale entries while collecting best-effort removal warnings. */
async function removeEntries(paths: string[]): Promise<PruneManagedDownloadsResult> {
  const result: PruneManagedDownloadsResult = { removed: 0, warnings: [] };
  for (const path of paths) {
    const removed = await removePathBestEffort(path);
    if (removed.removed) result.removed += 1;
    else if (removed.error != null) result.warnings.push(removed.error);
  }
  return result;
}

/** @internal Recheck the complete target under its lease; the owned lock is released only in finally. */
async function pruneTarget(
  basePath: string,
  target: PruneTarget,
  olderThan: number,
  buckets: Set<string>,
): Promise<PruneManagedDownloadsResult> {
  const before = await Promise.all([...target.paths, target.lock.lockPath].map(modifiedAt));
  if (before.every((mtime) => mtime == null) || before.some((mtime) => mtime != null && mtime > olderThan)) {
    return { removed: 0, warnings: [] };
  }
  let lease: AcquiredLock;
  try {
    lease = await acquireLock(target.lock);
  } catch (error) {
    if (error instanceof ManagedDownloadError && error.code === MANAGED_DOWNLOAD_ERROR_CODES.TARGET_LOCKED) {
      return { removed: 0, warnings: [] };
    }
    throw error;
  }
  // Successful acquisition has reclaimed any old dead-owner lock observed above.
  const removedLock = before[before.length - 1] == null ? 0 : 1;
  try {
    const manifest = await readManifest(target.manifestPath);
    if (manifest != null && manifest !== "invalid") {
      try {
        const named = namedTarget(basePath, manifest.bucket, manifest.fileName);
        if (named.targetKey === target.key) {
          const bucketPath = dirname(named.finalPath);
          const bucket = await lstat(bucketPath).catch((error: unknown) => {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
            throw error;
          });
          if (bucket?.isDirectory() && !bucket.isSymbolicLink()) {
            target.paths.add(named.finalPath);
            buckets.add(bucketPath);
          }
        }
      } catch (error) {
        if (!(error instanceof ManagedDownloadError) || error.code !== MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET) throw error;
      }
    }
    const paths = [...target.paths];
    const current = await Promise.all(paths.map(modifiedAt));
    if (current.some((mtime) => mtime != null && mtime > olderThan)) return { removed: removedLock, warnings: [] };
    const result = await removeEntries(paths.filter((_path, index) => current[index] != null));
    result.removed += removedLock;
    return result;
  } finally {
    await releaseLock(lease);
  }
}

/**
 * Prune inactive targets whose final file and scratch state are all older than
 * the configured age threshold. Keep live/unverifiable leases and recent
 * targets intact, leaving the ownership sentinel and scratch layout in place.
 * @returns The number of entries removed and any non-fatal removal warnings.
 */
export async function pruneManagedDownloads(options: PruneManagedDownloadsOptions): Promise<PruneManagedDownloadsResult> {
  const basePath = normalizeBasePath(options.basePath);
  await ensureManagedBase(basePath);
  const olderThan = (options.now?.getTime() ?? Date.now()) - (options.olderThanMs ?? DEFAULT_PRUNE_OLDER_THAN_MS);
  const targets = new Map<string, PruneTarget>();
  const buckets = new Set<string>();
  const debris: string[] = [];
  const result: PruneManagedDownloadsResult = { removed: 0, warnings: [] };
  const targetForKey = (key: string): PruneTarget => {
    let target = targets.get(key);
    if (target == null) {
      const manifestPath = join(basePath, STATE_DIR, `${key}.json`);
      target = {
        key,
        lock: { bucket: STATE_DIR, fileName: key, lockPath: join(basePath, LOCK_DIR, `${key}.lock`) },
        manifestPath,
        paths: new Set([manifestPath, join(basePath, PARTIAL_DIR, `${key}.partial`)]),
      };
      targets.set(key, target);
    }
    return target;
  };
  const scratchRoots: Array<[string, RegExp]> = [
    [STATE_DIR, /^([a-f0-9]{64})\.json(?:\..+\.tmp)?$/],
    [PARTIAL_DIR, /^([a-f0-9]{64})\.partial$/],
    [LOCK_DIR, /^([a-f0-9]{64})\.lock$/],
  ];
  for (const [directory, pattern] of scratchRoots) {
    for (const entry of await readdir(join(basePath, directory)).catch(() => [])) {
      const path = join(basePath, directory, entry);
      const key = pattern.exec(entry)?.[1];
      if (key == null) debris.push(path);
      else {
        const target = targetForKey(key);
        if (path !== target.lock.lockPath) target.paths.add(path);
      }
    }
  }
  for (const bucket of await readdir(basePath, { withFileTypes: true }).catch(() => [])) {
    if (!bucket.isDirectory() || bucket.name.startsWith(".")) continue;
    const bucketPath = join(basePath, bucket.name);
    buckets.add(bucketPath);
    for (const fileName of await readdir(bucketPath).catch(() => [])) {
      try {
        const named = namedTarget(basePath, bucket.name, fileName);
        const target = targetForKey(named.targetKey);
        target.lock = named;
        target.paths.add(named.finalPath);
      } catch (error) {
        if (!(error instanceof ManagedDownloadError) || error.code !== MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET) throw error;
        debris.push(join(bucketPath, fileName));
      }
    }
  }
  for (const target of targets.values()) {
    try {
      const pruned = await pruneTarget(basePath, target, olderThan, buckets);
      result.removed += pruned.removed;
      result.warnings.push(...pruned.warnings);
    } catch (error) {
      result.warnings.push(error instanceof Error ? error.message : String(error));
    }
  }
  for (const path of debris) {
    try {
      const mtime = await modifiedAt(path);
      if (mtime == null || mtime > olderThan) continue;
      const pruned = await removeEntries([path]);
      result.removed += pruned.removed;
      result.warnings.push(...pruned.warnings);
    } catch (error) {
      result.warnings.push(error instanceof Error ? error.message : String(error));
    }
  }
  // Unlike recursive rm after an emptiness check, rmdir cannot erase a new file
  // that another target creates in this bucket during cleanup.
  for (const bucketPath of buckets) await rmdir(bucketPath).catch(() => undefined);
  return result;
}
