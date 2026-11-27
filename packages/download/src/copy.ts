/**
 * @module copy
 *
 * Download-then-copy-to-an-external-path with reference-counted cleanup. Downloads
 * into the managed base, copies the verified bytes to the caller's `outputPath`
 * (idempotently — an identical existing output is accepted, a differing one
 * conflicts), then clears the managed copy once no other lease is outstanding.
 * The lease map keeps concurrent copy callers from clearing bytes another caller
 * still needs. Depends on the target resolver, fs-io size/hash helpers, the
 * coordination registry, the managed-download entry, the remove operation,
 * errors, public types, and the platform atomic copier.
 */

import { lstat, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { atomicCopyFile } from "@open-design/platform";

import { MANAGED_DOWNLOAD_ERROR_CODES, ManagedDownloadError } from "./errors.js";
import { hashFile, statFileSize } from "./fs-io.js";
import { managedDownload } from "./managed-download.js";
import { targetActiveKey } from "./registry.js";
import { removeManagedDownload } from "./remove.js";
import { type NormalizedTarget, targetFromOptions } from "./target.js";
import type { DownloadCopyAndClearOptions, DownloadCopyAndClearResult, RemoveManagedDownloadOptions } from "./types.js";

/**
 * @internal Handle to a held copy lease, keyed by target.
 */
type CopyLease = {
  key: string;
};

/**
 * @internal Reference-count and deferred-clear bookkeeping for a target's copy
 * leases.
 */
type CopyLeaseState = {
  clearRequested: boolean;
  count: number;
  removeOptions: RemoveManagedDownloadOptions | null;
};

/** Singleton map of target key → copy-lease reference state. */
const copyLeases = new Map<string, CopyLeaseState>();

/**
 * @internal Extract a human-readable message from an unknown thrown value.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** @internal Check containment by path segments, including names beginning with two dots. */
function containsPath(basePath: string, outputPath: string): boolean {
  const rel = relative(basePath, outputPath);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** @internal Resolve existing ancestors without requiring the destination to exist yet. */
async function resolveWithMissingTail(path: string): Promise<string> {
  const tail: string[] = [];
  let current = path;
  for (;;) {
    try {
      return resolve(await realpath(current), ...tail.reverse());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const entry = await lstat(current).catch((statError: unknown) => {
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw statError;
      });
      // A dangling link is an existing path component, not a missing tail. It
      // may become an alias of the managed base once the download creates it.
      if (entry != null) {
        throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, `cannot resolve copy path: ${current}`);
      }
      const parent = dirname(current);
      if (parent === current) throw error;
      tail.push(basename(current));
      current = parent;
    }
  }
}

/** @internal Keep caller-owned output outside the managed tree before any download or cleanup. */
async function assertExternalOutput(basePath: string, outputPath: string): Promise<void> {
  if (containsPath(basePath, outputPath)) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, "outputPath must be outside basePath");
  }
  const [realBase, realOutput] = await Promise.all([resolveWithMissingTail(basePath), resolveWithMissingTail(outputPath)]);
  if (containsPath(realBase, realOutput)) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, "outputPath must be outside basePath, including symbolic-link aliases");
  }
}

/**
 * @internal Acquire (reference-count) a copy lease for a target.
 */
function acquireCopyLease(target: NormalizedTarget): CopyLease {
  const key = targetActiveKey(target);
  const state = copyLeases.get(key) ?? { clearRequested: false, count: 0, removeOptions: null };
  state.count += 1;
  copyLeases.set(key, state);
  return { key };
}

/**
 * @internal Request a post-copy clear: defer it when other leases are still held,
 * otherwise remove the managed copy now.
 * @returns `"deferred"` when clearing was postponed, `"removed"` when done now.
 */
async function requestClearAfterCopy(target: NormalizedTarget): Promise<"deferred" | "removed"> {
  const key = targetActiveKey(target);
  const state = copyLeases.get(key);
  if (state != null && state.count > 1) {
    state.clearRequested = true;
    state.removeOptions = { basePath: target.basePath, bucket: target.bucket, fileName: target.fileName };
    return "deferred";
  }
  await removeManagedDownload({ basePath: target.basePath, bucket: target.bucket, fileName: target.fileName });
  return "removed";
}

/**
 * @internal Release a copy lease, performing a deferred clear once the last lease
 * is dropped.
 */
async function releaseCopyLease(lease: CopyLease): Promise<void> {
  const state = copyLeases.get(lease.key);
  if (state == null) return;
  state.count -= 1;
  if (state.count > 0) return;
  copyLeases.delete(lease.key);
  if (state.clearRequested && state.removeOptions != null) {
    await removeManagedDownload(state.removeOptions).catch(() => undefined);
  }
}

/**
 * Download a payload and copy the verified bytes to an external `outputPath`,
 * then clear the managed copy when no other copy lease is outstanding. An
 * existing output with matching bytes is accepted; a differing one throws
 * `OUTPUT_CONFLICT`. An output within the managed base (including an alias)
 * throws `INVALID_TARGET` before any download or managed-state mutation.
 * @returns The copied byte count, output path, reuse/resume flags, and the
 * cleanup outcome (with a warning if cleanup failed).
 */
export async function downloadCopyAndClear(options: DownloadCopyAndClearOptions): Promise<DownloadCopyAndClearResult> {
  const target = targetFromOptions(options);
  if (typeof options.outputPath !== "string" || options.outputPath.length === 0 || options.outputPath.includes("\0")) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, "outputPath must be a non-empty path");
  }
  const outputPath = resolve(options.outputPath);
  if (!isAbsolute(outputPath)) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, `outputPath must resolve to an absolute path: ${options.outputPath}`);
  }
  await assertExternalOutput(target.basePath, outputPath);
  const lease = acquireCopyLease(target);
  try {
    const downloaded = await managedDownload(options);
    const existingOutput = await statFileSize(outputPath);
    if (existingOutput != null) {
      const existingDigest = await hashFile(outputPath, target.checksum.algorithm).catch(() => null);
      if (existingDigest !== target.checksum.value) {
        throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.OUTPUT_CONFLICT, `output already exists with different bytes: ${outputPath}`);
      }
    } else {
      await atomicCopyFile(downloaded.path, outputPath);
      const copiedDigest = await hashFile(outputPath, target.checksum.algorithm);
      if (copiedDigest !== target.checksum.value) {
        throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.CHECKSUM_MISMATCH, "copied output checksum did not match requested payload");
      }
    }
    let cleanup: "deferred" | "removed" = "removed";
    let cleanupWarning: string | undefined;
    try {
      cleanup = await requestClearAfterCopy(target);
    } catch (error) {
      cleanupWarning = errorMessage(error);
    }
    return {
      bytes: downloaded.bytes,
      cleanup,
      ...(cleanupWarning == null ? {} : { cleanupWarning }),
      outputPath,
      reusedComplete: downloaded.reusedComplete,
      resumed: downloaded.resumed,
    };
  } finally {
    await releaseCopyLease(lease);
  }
}
