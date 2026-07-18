/**
 * @module run
 *
 * Single managed-download execution. Detects reusable state (a verified complete
 * file or a resumable partial), resets suspicious/corrupt bases, then acquires the
 * lock, prunes, transfers, verifies the checksum, and atomically promotes the
 * partial to its final path — emitting the final result. This is the orchestration
 * kernel behind the public `managedDownload`. Depends on the store, manifest, lock,
 * transfer, prune, target, and fs-io concerns.
 */

import { mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

import { MANAGED_DOWNLOAD_ERROR_CODES, ManagedDownloadError } from "./errors.js";
import { hashFile, pathExists, statFileSize, writeJson } from "./fs-io.js";
import { acquireLock, type AcquiredLock, releaseLock } from "./lock.js";
import { createManifest, manifestMatchesTarget, readManifest } from "./manifest.js";
import { pruneManagedDownloads } from "./prune.js";
import { ensureManagedBase, resetOwnedBase } from "./store.js";
import type { NormalizedTarget } from "./target.js";
import { downloadWithRetries } from "./transfer.js";
import type { DownloadManifest } from "./manifest.js";
import type { ManagedDownloadProgress, ManagedDownloadResult } from "./types.js";

/**
 * @internal Snapshot of reusable state resolved before a transfer: an existing
 * complete result, a resumable partial manifest, or a signal that the base was
 * reset because its state was suspicious.
 */
type ReusableState = {
  manifest: DownloadManifest | null;
  reset?: boolean;
  result?: ManagedDownloadResult;
};

/**
 * @internal Reset the owned base and report that a suspicious state was cleared.
 */
async function suspiciousReset(target: NormalizedTarget): Promise<ReusableState> {
  await resetOwnedBase(target.basePath);
  return { manifest: null, reset: true };
}

/**
 * @internal Resolve whether an existing complete file can be reused, a partial
 * can be resumed, or the base must be reset.
 * @returns The resolved reusable state.
 */
async function loadReusableState(target: NormalizedTarget): Promise<ReusableState> {
  const manifest = await readManifest(target.manifestPath);
  const finalExists = await pathExists(target.finalPath);
  const partialExists = await pathExists(target.partialPath);
  if (manifest === "invalid") {
    return await suspiciousReset(target);
  }
  if (manifest == null) {
    if (finalExists || partialExists) return await suspiciousReset(target);
    return { manifest: null };
  }
  if (!manifestMatchesTarget(manifest, target)) {
    return await suspiciousReset(target);
  }
  if (manifest.state === "complete") {
    if (!finalExists) return await suspiciousReset(target);
    const actual = await hashFile(target.finalPath, target.checksum.algorithm).catch(() => null);
    if (actual !== target.checksum.value) return await suspiciousReset(target);
    const bytes = await statFileSize(target.finalPath);
    if (bytes == null) return await suspiciousReset(target);
    return {
      manifest,
      result: {
        bucket: target.bucket,
        bytes,
        checksum: target.checksum,
        fileName: target.fileName,
        path: target.finalPath,
        reusedComplete: true,
        resumed: false,
        urlDigest: target.urlDigest,
      },
    };
  }
  if (!partialExists) return await suspiciousReset(target);
  return { manifest };
}

/**
 * Execute one managed download end to end: reuse detection, locking, pruning,
 * transfer, checksum verification, and atomic promotion of the partial to its
 * final path.
 * @returns The completed download result.
 */
export async function runManagedDownload(
  target: NormalizedTarget,
  options: {
    emit: (progress: ManagedDownloadProgress) => void;
    fetchImpl: typeof globalThis.fetch;
    maxAttempts: number;
    requestHeaders?: Record<string, string>;
  },
): Promise<ManagedDownloadResult> {
  await ensureManagedBase(target.basePath);
  await pruneManagedDownloads({ basePath: target.basePath }).catch(() => undefined);
  let lock: AcquiredLock | null = await acquireLock(target);
  try {
    let state = await loadReusableState(target);
    if (state.result != null) return state.result;
    if (state.reset === true) {
      // A reset removes the lock as part of the managed base cleanup, so
      // reacquire it before writing the fresh target state.
      await releaseLock(lock);
      lock = null;
      await ensureManagedBase(target.basePath);
      lock = await acquireLock(target);
      state = await loadReusableState(target);
      if (state.result != null) return state.result;
      if (state.reset === true) {
        throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.STORE_CORRUPT, "download state kept resetting after base cleanup");
      }
    }
    const download = await downloadWithRetries(target, state.manifest, options);
    const actual = await hashFile(target.partialPath, target.checksum.algorithm).catch((error: unknown) => {
      throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.STORE_CORRUPT, `downloaded partial could not be hashed: ${errorMessage(error)}`);
    });
    if (actual !== target.checksum.value) {
      await resetOwnedBase(target.basePath).catch(() => undefined);
      throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.CHECKSUM_MISMATCH, "downloaded file checksum did not match requested payload", {
        actual,
        expected: target.checksum.value,
      });
    }

    await mkdir(dirname(target.finalPath), { recursive: true });
    if (await pathExists(target.finalPath)) {
      const existing = await hashFile(target.finalPath, target.checksum.algorithm).catch(() => null);
      if (existing !== target.checksum.value) {
        await resetOwnedBase(target.basePath).catch(() => undefined);
        throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.STORE_CORRUPT, "existing complete file did not match requested payload");
      }
      await rm(target.partialPath, { force: true }).catch(() => undefined);
    } else {
      await rename(target.partialPath, target.finalPath);
    }
    const bytes = await statFileSize(target.finalPath);
    if (bytes == null) throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.STORE_CORRUPT, "complete file is missing after promotion");
    await writeJson(target.manifestPath, createManifest(target, "complete", { totalBytes: download.totalBytes }));
    return {
      bucket: target.bucket,
      bytes,
      checksum: target.checksum,
      fileName: target.fileName,
      path: target.finalPath,
      reusedComplete: false,
      resumed: download.resumed,
      urlDigest: target.urlDigest,
    };
  } finally {
    await releaseLock(lock);
  }
}

/**
 * @internal Extract a human-readable message from an unknown thrown value.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
