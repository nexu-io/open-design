/**
 * @module lock
 *
 * Advisory per-target file locking with stale-lock reclamation. Writes an
 * exclusive lock file recording the owning PID and process start time, detects
 * and clears locks left behind by dead processes (with PID-reuse safeguards for
 * Windows), and releases held locks. Depends on constants, errors, the fs-io
 * JSON reader, the `NormalizedTarget` shape, and the platform liveness probe.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { isProcessAlive } from "@open-design/platform";

import { PID_REUSE_GRACE_MS, PROCESS_STARTED_AT_MS } from "./constants.js";
import { MANAGED_DOWNLOAD_ERROR_CODES, ManagedDownloadError } from "./errors.js";
import { readJson } from "./fs-io.js";
import type { NormalizedTarget } from "./target.js";

/**
 * @internal On-disk lock record identifying the owning process.
 */
type DownloadLockFile = {
  createdAt: string;
  pid: number;
  processStartedAt?: string;
};

/**
 * Handle to an acquired lock, carrying the lock file path to release.
 */
export type AcquiredLock = {
  path: string;
};

/**
 * @internal Extract a Node error `code` string from an unknown thrown value.
 */
function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error == null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return code == null ? null : String(code);
}

/**
 * @internal Type guard for a well-formed lock file record.
 */
function isDownloadLockFile(value: unknown): value is DownloadLockFile {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return false;
  const record = value as Partial<DownloadLockFile>;
  return typeof record.createdAt === "string" &&
    typeof record.pid === "number" &&
    Number.isInteger(record.pid) &&
    record.pid > 0 &&
    (record.processStartedAt == null || typeof record.processStartedAt === "string");
}

/**
 * @internal Parse an ISO time string to epoch ms, or `null` if unparseable.
 */
function parseTimeMs(value: string | undefined): number | null {
  if (value == null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @internal Decide whether a same-PID lock actually belongs to this process
 * (guarding against PID reuse across process lifetimes).
 */
function lockBelongsToCurrentProcess(lock: DownloadLockFile): boolean {
  if (lock.pid !== process.pid) return false;
  const ownerStartedAtMs = parseTimeMs(lock.processStartedAt);
  if (ownerStartedAtMs != null) return ownerStartedAtMs >= PROCESS_STARTED_AT_MS - PID_REUSE_GRACE_MS;

  // Older locks only carried a pid. If Windows reuses that pid for this
  // process, a lock that predates this process start is definitely stale.
  const lockCreatedAtMs = parseTimeMs(lock.createdAt);
  return lockCreatedAtMs == null || lockCreatedAtMs >= PROCESS_STARTED_AT_MS - PID_REUSE_GRACE_MS;
}

/**
 * @internal Decide whether the process owning a lock is still alive.
 */
function isLockProcessAlive(lock: DownloadLockFile): boolean {
  if (!isProcessAlive(lock.pid)) return false;
  if (lock.pid === process.pid) return lockBelongsToCurrentProcess(lock);
  return true;
}

/**
 * @internal Remove a lock file if it is stale (dead owner).
 * @returns `true` if a stale lock was cleared.
 */
async function clearStaleLock(target: NormalizedTarget): Promise<boolean> {
  const lock = await readJson<unknown>(target.lockPath);
  if (!isDownloadLockFile(lock) || isLockProcessAlive(lock)) return false;
  await rm(target.lockPath, { force: true }).catch(() => undefined);
  return true;
}

/**
 * Acquire an exclusive advisory lock for a target, clearing one stale lock if
 * present. Throws `TARGET_LOCKED` when the target is held by a live process.
 * @returns A handle to the acquired lock.
 */
export async function acquireLock(target: NormalizedTarget): Promise<AcquiredLock> {
  await mkdir(dirname(target.lockPath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await writeFile(
        target.lockPath,
        `${JSON.stringify({
          createdAt: new Date().toISOString(),
          pid: process.pid,
          processStartedAt: new Date(PROCESS_STARTED_AT_MS).toISOString(),
        } satisfies DownloadLockFile)}\n`,
        { flag: "wx" },
      );
      return { path: target.lockPath };
    } catch (error) {
      if (errorCode(error) === "EEXIST") {
        const staleLockCleared = attempt === 0 && await clearStaleLock(target);
        if (staleLockCleared) continue;
        throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.TARGET_LOCKED, `download target is locked: ${target.bucket}/${target.fileName}`);
      }
      throw error;
    }
  }
  throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.TARGET_LOCKED, `download target is locked: ${target.bucket}/${target.fileName}`);
}

/**
 * Release a previously acquired lock (best effort); a `null` handle is a no-op.
 */
export async function releaseLock(lock: AcquiredLock | null): Promise<void> {
  if (lock == null) return;
  await rm(lock.path, { force: true }).catch(() => undefined);
}
