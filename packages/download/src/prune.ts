/**
 * @module prune
 *
 * Age-based garbage collection of a managed base. Removes manifest/partial/lock
 * scratch entries and bucket files whose modification time is older than a
 * threshold, aggregating a removed count and per-entry warnings. Depends on
 * constants, the target base-path normalizer, the store base guard, public prune
 * types, and the platform best-effort remover.
 */

import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import { removePathBestEffort } from "@open-design/platform";

import { DEFAULT_PRUNE_OLDER_THAN_MS, LOCK_DIR, PARTIAL_DIR, STATE_DIR } from "./constants.js";
import { ensureManagedBase } from "./store.js";
import { normalizeBasePath } from "./target.js";
import type { PruneManagedDownloadsOptions, PruneManagedDownloadsResult } from "./types.js";

/**
 * @internal Remove direct children of `root` older than `olderThan` (epoch ms),
 * returning how many were removed plus any best-effort removal warnings.
 */
async function removeEntriesOlderThan(root: string, olderThan: number): Promise<{ removed: number; warnings: string[] }> {
  const warnings: string[] = [];
  let removed = 0;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const path = join(root, entry.name);
    const info = await stat(path).catch(() => null);
    if (info == null || info.mtimeMs > olderThan) continue;
    const result = await removePathBestEffort(path);
    if (result.removed) removed += 1;
    else if (result.error != null) warnings.push(result.error);
  }
  return { removed, warnings };
}

/**
 * Prune stale scratch state and bucket entries from a managed base older than the
 * configured age threshold, leaving the ownership sentinel and scratch layout
 * intact.
 * @returns The number of entries removed and any non-fatal removal warnings.
 */
export async function pruneManagedDownloads(options: PruneManagedDownloadsOptions): Promise<PruneManagedDownloadsResult> {
  const basePath = normalizeBasePath(options.basePath);
  await ensureManagedBase(basePath);
  const olderThan = (options.now?.getTime() ?? Date.now()) - (options.olderThanMs ?? DEFAULT_PRUNE_OLDER_THAN_MS);
  const roots = [join(basePath, STATE_DIR), join(basePath, PARTIAL_DIR), join(basePath, LOCK_DIR)];
  let removed = 0;
  const warnings: string[] = [];
  for (const root of roots) {
    const result = await removeEntriesOlderThan(root, olderThan);
    removed += result.removed;
    warnings.push(...result.warnings);
  }
  const bucketEntries = await readdir(basePath, { withFileTypes: true }).catch(() => []);
  for (const entry of bucketEntries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const result = await removeEntriesOlderThan(join(basePath, entry.name), olderThan);
    removed += result.removed;
    warnings.push(...result.warnings);
    const remaining = await readdir(join(basePath, entry.name)).catch(() => null);
    if (remaining != null && remaining.length === 0) await rm(join(basePath, entry.name), { force: true, recursive: true }).catch(() => undefined);
  }
  return { removed, warnings };
}
