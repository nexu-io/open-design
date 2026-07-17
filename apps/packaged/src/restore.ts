/**
 * Packaged creator backup restore orchestration.
 *
 * Restore is NEVER a daemon HTTP route. It is performed only here, in the
 * packaged desktop main process, keyed solely by `backupId`. All source/target
 * paths are derived server-side from the data dir; the renderer can only ask
 * "restore this backup id", never name a file on disk.
 *
 * The orchestration is deliberately a pure, injectable engine:
 *
 *   read manifest -> validate snapshot -> freeze daemon ->
 *   capture rollback of live files -> stage backup files (atomic) ->
 *   restart daemon -> (on any failure) auto-roll-back live files
 *
 * `daemonControl` (freeze/restart) is injected so the engine is fully testable
 * without a live daemon; the packaged main process supplies the real control
 * (graceful daemon shutdown + re-spawn).
 */

import { randomUUID } from "node:crypto";
import { promises as fsp } from "node:fs";
import path from "node:path";

/**
 * Creator backup DTOs used by the restore orchestration, declared locally so
 * `apps/packaged` does not take a hard dependency on `@open-design/contracts`.
 * The shapes mirror `packages/contracts/src/api/creator-backup.ts` so the
 * daemon store (which returns the canonical contracts types) remains
 * structurally compatible with the injectable store reads below.
 */
export type CreatorBackupStatus = "pending" | "ready" | "invalid" | "restoring" | "rollback";

export type CreatorBackupFile = {
  relativePath: string;
  size: number;
  sha256: string;
};

export type CreatorBackupManifest = {
  schemaVersion: number;
  id: string;
  createdAt: string;
  appVersion?: string;
  namespace: string;
  profile: "full";
  projectIds: string[];
  files: CreatorBackupFile[];
  fileCount: number;
  totalSize: number;
  status: CreatorBackupStatus;
  note?: string;
};

export type CreatorBackupSummary = {
  schemaVersion: number;
  id: string;
  createdAt: string;
  profile: "full";
  projectIds: string[];
  fileCount: number;
  totalSize: number;
  status: CreatorBackupStatus;
  validated?: boolean;
};

export type CreatorBackupValidationResult = {
  id: string;
  valid: boolean;
  issues: string[];
  fileCount: number;
  totalSize: number;
};

export type RestoreCreatorBackupRequest = {
  backupId: string;
};

export type RestoreCreatorBackupResponse = {
  ok: boolean;
  backup?: CreatorBackupSummary;
  error?: string;
};

import { requestJsonIpc } from "@open-design/sidecar";
import { SIDECAR_MESSAGES } from "@open-design/sidecar-proto";
import {
  ALLOWED_SUBDIRS,
  readCreatorBackupManifest,
  resolveCreatorBackupRoot,
  sanitizeBackupId,
  validateCreatorBackup,
} from "@open-design/daemon/creator-backup";

/** Process-lifecycle hook the restore engine drives. Injected for testability. */
export interface CreatorBackupDaemonControl {
  /** Pause daemon writes while the live files are swapped. */
  freeze(): Promise<void>;
  /** Restart the daemon sidecar so it reloads the restored Creator metadata. */
  restart(): Promise<void>;
}

export interface RestoreCreatorBackupDeps {
  /** Daemon data dir (e.g. `<namespaceRoot>/data`). */
  dataDir: string;
  /** Injected daemon lifecycle control. */
  daemonControl: CreatorBackupDaemonControl;
  /** Overridable store reads (primarily for tests). */
  readManifest?: (dataDir: string, backupId: string) => Promise<CreatorBackupManifest | null>;
  validateSnapshot?: (dataDir: string, backupId: string) => Promise<CreatorBackupValidationResult>;
  resolveBackupRoot?: (dataDir: string) => string;
  allowedSubdirs?: readonly string[];
  now?: () => Date;
}

const ROLLBACK_DIR_NAME = "_rollback";

function toSummary(manifest: CreatorBackupManifest): CreatorBackupSummary {
  return {
    schemaVersion: manifest.schemaVersion,
    id: manifest.id,
    createdAt: manifest.createdAt,
    profile: manifest.profile,
    projectIds: Array.isArray(manifest.projectIds) ? manifest.projectIds : [],
    fileCount: manifest.fileCount,
    totalSize: manifest.totalSize,
    status: manifest.status,
    validated: true,
  };
}

function assertBackupIdSafe(backupId: string): void {
  if (typeof backupId !== "string" || !backupId.trim()) {
    throw new Error("backup id is required");
  }
  if (/[/\\]/.test(backupId) || backupId.includes("..")) {
    throw new Error("backup id is not path safe");
  }
}

/** True when `target` resolves inside `base` (rejects symlink escapes too). */
function isWithin(base: string, target: string): boolean {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function stageFileAtomic(dest: string, buffer: Buffer): Promise<void> {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fsp.writeFile(tmp, buffer);
    await fsp.rename(tmp, dest);
  } catch (error) {
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function removeDir(dir: string): Promise<void> {
  await fsp.rm(dir, { recursive: true, force: true });
}

/**
 * Copy the CURRENT live Creator JSON files for every project the backup covers
 * into `rollbackDir`. These are the safety net restored on a failed swap.
 */
async function captureRollback(
  dataDir: string,
  manifest: CreatorBackupManifest,
  allowedSubdirs: readonly string[],
  rollbackDir: string,
): Promise<void> {
  const projectIds = Array.isArray(manifest.projectIds) ? manifest.projectIds : [];
  await fsp.mkdir(rollbackDir, { recursive: true });
  for (const projectId of projectIds) {
    for (const subdir of allowedSubdirs) {
      const live = path.join(dataDir, subdir, `${projectId}.json`);
      try {
        const buffer = await fsp.readFile(live);
        const dest = path.join(rollbackDir, subdir, `${projectId}.json`);
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.writeFile(dest, buffer);
      } catch {
        // Live file absent for this subdir/project: nothing to roll back.
      }
    }
  }
}

/** Restore the live files from a previously captured rollback snapshot. */
async function applyRollback(
  dataDir: string,
  rollbackDir: string,
  allowedSubdirs: readonly string[],
): Promise<void> {
  let subdirs: import("node:fs").Dirent[];
  try {
    subdirs = await fsp.readdir(rollbackDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const subdirEntry of subdirs) {
    if (!subdirEntry.isDirectory() || !allowedSubdirs.includes(subdirEntry.name)) continue;
    const subdir = subdirEntry.name;
    const subdirPath = path.join(rollbackDir, subdir);
    let files: string[];
    try {
      files = await fsp.readdir(subdirPath);
    } catch {
      continue;
    }
    for (const fileName of files) {
      if (!fileName.endsWith(".json")) continue;
      const src = path.join(subdirPath, fileName);
      const dest = path.resolve(dataDir, subdir, fileName);
      if (!isWithin(dataDir, dest)) continue;
      const buffer = await fsp.readFile(src);
      await stageFileAtomic(dest, buffer);
    }
  }
}

/**
 * Restore a Creator backup snapshot into the live data dir with a controlled,
 * validated, auto-rollbackable swap.
 */
export async function restoreCreatorBackup(
  deps: RestoreCreatorBackupDeps,
  request: RestoreCreatorBackupRequest,
): Promise<RestoreCreatorBackupResponse> {
  const {
    dataDir,
    daemonControl,
    readManifest = readCreatorBackupManifest,
    validateSnapshot = validateCreatorBackup,
    resolveBackupRoot = resolveCreatorBackupRoot,
    allowedSubdirs = ALLOWED_SUBDIRS,
    now = () => new Date(),
  } = deps;

  const backupId = request.backupId;
  try {
    assertBackupIdSafe(backupId);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "invalid backup id" };
  }

  const manifest = await readManifest(dataDir, backupId);
  if (manifest == null) {
    return { ok: false, error: "backup not found" };
  }

  // Pre-flight: every declared file must be path-safe, under an allowlisted
  // subdir, and resolve inside the data dir — before we touch any live data.
  const backupRoot = resolveBackupRoot(dataDir);
  const snapshotDir = path.join(backupRoot, sanitizeBackupId(backupId));
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  for (const file of files) {
    if (typeof file?.relativePath !== "string" || !file.relativePath) {
      return { ok: false, error: "backup manifest contains a file without a relativePath" };
    }
    if (file.relativePath.includes("..") || path.isAbsolute(file.relativePath)) {
      return { ok: false, error: `backup file path is not safe: ${file.relativePath}` };
    }
    const parts = file.relativePath.split("/");
    if (parts.length !== 2 || !allowedSubdirs.includes(parts[0] ?? "")) {
      return { ok: false, error: `backup file is not allowlisted: ${file.relativePath}` };
    }
    const dest = path.resolve(dataDir, file.relativePath);
    if (!isWithin(dataDir, dest)) {
      return { ok: false, error: `backup file escapes data dir: ${file.relativePath}` };
    }
  }

  const validation = await validateSnapshot(dataDir, backupId);
  if (!validation.valid) {
    return {
      ok: false,
      error: `backup failed validation: ${validation.issues.join("; ") || "unknown"}`,
    };
  }

  // From here the live data is mutated. Freeze the daemon, snapshot a rollback,
  // stage the backup, then restart. Any failure rolls the live data back.
  await daemonControl.freeze();

  const stamp = now().toISOString().replace(/[:.]/g, "-");
  const rollbackDir = path.join(path.dirname(backupRoot), ROLLBACK_DIR_NAME, `${stamp}-${randomUUID()}`);
  await captureRollback(dataDir, manifest, allowedSubdirs, rollbackDir);

  try {
    for (const file of files) {
      const src = path.join(snapshotDir, file.relativePath);
      const dest = path.resolve(dataDir, file.relativePath);
      const buffer = await fsp.readFile(src);
      await stageFileAtomic(dest, buffer);
    }
    // Success: discard the rollback snapshot and restart the daemon so it
    // reloads the restored Creator metadata.
    await removeDir(rollbackDir);
    await daemonControl.restart();
    return { ok: true, backup: toSummary(manifest) };
  } catch (error) {
    // Auto-rollback: restore the pre-restore live files, then best-effort
    // restart so the daemon is never left paused on a broken state.
    const reason = error instanceof Error ? error.message : String(error);
    try {
      await applyRollback(dataDir, rollbackDir, allowedSubdirs);
      await removeDir(rollbackDir);
    } catch {
      // Rollback failed: leave the snapshot dir for manual recovery.
    }
    await daemonControl.restart().catch(() => undefined);
    return { ok: false, error: `restore failed and was rolled back: ${reason}` };
  }
}

// ---- production daemon control --------------------------------------------

export interface CreatorBackupDaemonControlFactoryDeps {
  /** Resolved daemon sidecar IPC path. */
  daemonIpcPath: string;
  /** Re-spawns the daemon sidecar (production restart). */
  restartDaemon: () => Promise<void>;
  /** Overridable shutdown request (primarily for tests). */
  requestShutdown?: (ipcPath: string) => Promise<void>;
}

/** Build the production daemon control used by the packaged main process. */
export function createCreatorBackupDaemonControl(
  deps: CreatorBackupDaemonControlFactoryDeps,
): CreatorBackupDaemonControl {
  const requestShutdown = deps.requestShutdown ?? defaultRequestDaemonShutdown;
  return {
    async freeze() {
      await requestShutdown(deps.daemonIpcPath);
    },
    async restart() {
      await deps.restartDaemon();
    },
  };
}

async function defaultRequestDaemonShutdown(ipcPath: string): Promise<void> {
  // Best-effort graceful stop: ask the daemon sidecar to shut down so it is
  // not writing Creator metadata while we swap the live files. A missing or
  // already-stopped daemon is not an error here.
  await requestJsonIpc(ipcPath, { type: SIDECAR_MESSAGES.SHUTDOWN }, { timeoutMs: 1200 }).catch(
    () => undefined,
  );
}
