/**
 * @module remove
 *
 * Inspection and removal of a managed download by bucket/file name. `inspect`
 * reports completion and manifest state without mutating anything; `remove`
 * deletes the final file plus its scratch state and prunes an emptied bucket,
 * refusing to remove a target that is currently active. Both synthesize a
 * placeholder payload since only the target identity (not the URL/checksum)
 * matters here. Depends on the target resolver, the store base guard, the
 * manifest reader, an fs-io probe, the coordination registry, errors, public
 * types, and the platform best-effort remover.
 */

import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { removePathBestEffort } from "@open-design/platform";

import { MANAGED_DOWNLOAD_ERROR_CODES, ManagedDownloadError } from "./errors.js";
import { pathExists } from "./fs-io.js";
import { readManifest } from "./manifest.js";
import { activeTargets, targetActiveKey } from "./registry.js";
import { ensureManagedBase } from "./store.js";
import { targetFromOptions } from "./target.js";
import type { ManagedDownloadInspection, RemoveManagedDownloadOptions, RemoveManagedDownloadResult } from "./types.js";

/**
 * Report a managed download's presence and manifest state without mutating it.
 * @returns The bucket/file name, resolved path, whether the final file exists,
 * and the manifest state (`complete`/`partial`/`missing`/`unreadable`).
 */
export async function inspectManagedDownload(options: RemoveManagedDownloadOptions): Promise<ManagedDownloadInspection> {
  const target = targetFromOptions({
    ...options,
    payload: {
      checksum: { algorithm: "sha256", value: "0".repeat(64) },
      url: "https://example.invalid/",
    },
  });
  await ensureManagedBase(target.basePath);
  const rawManifest = await readManifest(target.manifestPath);
  const manifest = rawManifest === "invalid" ? "unreadable" : rawManifest?.state ?? "missing";
  return {
    bucket: target.bucket,
    complete: await pathExists(target.finalPath),
    fileName: target.fileName,
    manifest,
    path: target.finalPath,
  };
}

/**
 * Remove a managed download: the final file, its manifest/partial/lock scratch
 * state, and an emptied bucket directory. Throws `TARGET_LOCKED` if the target is
 * currently active.
 * @returns `{ removed: true }` once removal completes.
 */
export async function removeManagedDownload(options: RemoveManagedDownloadOptions): Promise<RemoveManagedDownloadResult> {
  const target = targetFromOptions({
    ...options,
    payload: {
      checksum: { algorithm: "sha256", value: "0".repeat(64) },
      url: "https://example.invalid/",
    },
  });
  if (activeTargets.has(targetActiveKey(target))) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.TARGET_LOCKED, `download target is active: ${target.bucket}/${target.fileName}`);
  }
  await ensureManagedBase(target.basePath);
  await Promise.all([
    removePathBestEffort(target.finalPath),
    removePathBestEffort(target.partialPath, { recursive: false }),
    removePathBestEffort(target.manifestPath, { recursive: false }),
    removePathBestEffort(target.lockPath, { recursive: false }),
  ]);
  const bucketPath = join(target.basePath, target.bucket);
  const entries = await readdir(bucketPath).catch(() => null);
  if (entries != null && entries.length === 0) await rm(bucketPath, { force: true, recursive: true }).catch(() => undefined);
  return { removed: true };
}
