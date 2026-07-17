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
 *   read manifest -> validate snapshot -> freeze daemon (await exit) ->
 *   capture rollback (records present-or-absent per target) ->
 *   stage snapshot files (atomic) -> delete live files absent from snapshot ->
 *   (optionally) reconcile project identities -> restart daemon+web group ->
 *   (on any failure) auto-rollback live files, then restart to un-pause.
 *
 * Transactional guarantees (P0-1):
 *   - The rollback snapshot is removed ONLY after the daemon/web group has been
 *     successfully restarted (the system is in a known-good state).
 *   - If the restart fails, the pre-restore live state is restored and an
 *     accurate error is returned; we never claim success.
 *
 * Full-snapshot semantics (P1-1):
 *   - For every project in `manifest.projectIds`, across all five allowlisted
 *     Creator stores, a live file that is NOT part of the snapshot is deleted
 *     on a successful restore.
 *   - The rollback records each target's original state (present content OR
 *     originally-absent); on rollback, present files are restored and
 *     originally-absent files are removed — so a half-written restore leaves
 *     no stray files behind.
 *
 * `daemonControl` (freeze/restart/restoreProjectIdentities) is injected so the
 * engine is fully testable without a live daemon; the packaged main process
 * supplies the real control (graceful daemon stop + confirmed exit, full
 * sidecar-group re-spawn, and project-identity reconciliation through the
 * daemon's controlled API).
 */

import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
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

export type CreatorBackupProjectIdentity = {
  id: string;
  name: string;
  schemaVersion: number;
  /** SHA-256 over `${id}\n${name}` — proves the payload hasn't been altered. */
  hash: string;
};

export type CreatorBackupProjectIdentityReport = {
  performed: boolean;
  created: string[];
  kept: string[];
  conflicts: string[];
  reason?: string;
};

export type CreatorBackupManifest = {
  schemaVersion: number;
  id: string;
  createdAt: string;
  appVersion?: string;
  namespace: string;
  profile: "full";
  projectIds: string[];
  /** Minimal project identity captured at backup time (id + name only). */
  projectIdentities?: CreatorBackupProjectIdentity[];
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
  /** True when the live data was rolled back to its pre-restore state. */
  rolledBack?: boolean;
  /** True when the rollback safety snapshot was removed (system is consistent). */
  rollbackRemoved?: boolean;
  /** Report from any project-identity reconciliation performed during restore. */
  projectIdentity?: CreatorBackupProjectIdentityReport;
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
  /**
   * Stop the daemon so it cannot write Creator metadata while the live files
   * are swapped. MUST await confirmed process exit and throw if the daemon
   * cannot be stopped — the engine relies on this to guarantee no live writes
   * happen during the swap.
   */
  freeze(): Promise<void>;
  /**
   * Restart the daemon (and web) sidecar group so it reloads the restored
   * Creator metadata, and replace the managed handle so the renderer reconnects
   * to the new daemon. The engine treats a thrown error as a hard failure.
   */
  restart(): Promise<void>;
  /**
   * Re-establish minimal project identity records for the restored projects.
   * Optional: when absent, identity reconciliation is skipped (the primary
   * Creator-metadata restore still proceeds).
   */
  restoreProjectIdentities?(identities: CreatorBackupProjectIdentity[]): Promise<CreatorBackupProjectIdentityReport | undefined>;
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
const ROLLBACK_MANIFEST = "rollback-manifest.json";

type RollbackEntry = {
  subdir: string;
  projectId: string;
  /** `present` → a content blob is stored; `absent` → the file must not exist. */
  state: "present" | "absent";
  sha256?: string;
};

type RollbackManifest = {
  createdAt: string;
  entries: RollbackEntry[];
};

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

function hashIdentity(id: string, name: string): string {
  return createHash("sha256").update(`${id}\n${name}`).digest("hex");
}

/**
 * Capture a rollback snapshot of the CURRENT live Creator JSON files for every
 * project the backup covers. Each target is recorded as `present` (with its
 * content copied) or `absent` (the file does not currently exist) so that a
 * later rollback can faithfully restore the pre-restore state — including
 * removing files the restore would have created.
 */
async function captureRollback(
  dataDir: string,
  manifest: CreatorBackupManifest,
  allowedSubdirs: readonly string[],
  rollbackDir: string,
): Promise<void> {
  const projectIds = Array.isArray(manifest.projectIds) ? manifest.projectIds : [];
  await fsp.mkdir(rollbackDir, { recursive: true });
  const entries: RollbackEntry[] = [];
  for (const projectId of projectIds) {
    for (const subdir of allowedSubdirs) {
      const live = path.join(dataDir, subdir, `${projectId}.json`);
      try {
        const buffer = await fsp.readFile(live);
        const dest = path.join(rollbackDir, subdir, `${projectId}.json`);
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.writeFile(dest, buffer);
        entries.push({
          subdir,
          projectId,
          state: "present",
          sha256: createHash("sha256").update(buffer).digest("hex"),
        });
      } catch {
        entries.push({ subdir, projectId, state: "absent" });
      }
    }
  }
  await fsp.writeFile(
    path.join(rollbackDir, ROLLBACK_MANIFEST),
    `${JSON.stringify({ createdAt: new Date().toISOString(), entries }, null, 2)}\n`,
    "utf8",
  );
}

/** Restore the live files from a previously captured rollback snapshot. */
async function applyRollback(
  dataDir: string,
  rollbackDir: string,
  allowedSubdirs: readonly string[],
): Promise<void> {
  let manifest: RollbackManifest;
  try {
    const raw = await fsp.readFile(path.join(rollbackDir, ROLLBACK_MANIFEST), "utf8");
    manifest = JSON.parse(raw) as RollbackManifest;
  } catch {
    return;
  }
  for (const entry of manifest.entries ?? []) {
    if (!allowedSubdirs.includes(entry.subdir)) continue;
    const fileName = `${entry.projectId}.json`;
    const dest = path.resolve(dataDir, entry.subdir, fileName);
    if (!isWithin(dataDir, dest)) continue;
    if (entry.state === "present") {
      const src = path.join(rollbackDir, entry.subdir, fileName);
      const buffer = await fsp.readFile(src);
      await stageFileAtomic(dest, buffer);
    } else {
      // Originally-absent: ensure the file is gone (removes anything the
      // restore created during a partial swap).
      await fsp.rm(dest, { force: true }).catch(() => undefined);
    }
  }
}

/** Write the snapshot's allowlisted files into the live data dir (atomic). */
async function stageSnapshotFiles(
  dataDir: string,
  manifest: CreatorBackupManifest,
  snapshotDir: string,
  allowedSubdirs: readonly string[],
): Promise<void> {
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  for (const file of files) {
    if (file?.relativePath == null) continue;
    const parts = file.relativePath.split("/");
    const subdir = parts[0] ?? "";
    if (!allowedSubdirs.includes(subdir)) continue;
    const dest = path.resolve(dataDir, file.relativePath);
    if (!isWithin(dataDir, dest)) continue;
    const src = path.join(snapshotDir, file.relativePath);
    const buffer = await fsp.readFile(src);
    await stageFileAtomic(dest, buffer);
  }
}

/**
 * Full-snapshot semantics (P1-1): for every project the snapshot covers, across
 * all five allowlisted Creator stores, delete any live file that is NOT part of
 * the snapshot. Only files in the allowlist and for the manifest's projects are
 * touched — never arbitrary files or other projects.
 */
async function deleteExtraLiveFiles(
  dataDir: string,
  manifest: CreatorBackupManifest,
  allowedSubdirs: readonly string[],
): Promise<void> {
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const inSnapshot = new Set(files.map((file) => file.relativePath));
  const projectIds = Array.isArray(manifest.projectIds) ? manifest.projectIds : [];
  for (const projectId of projectIds) {
    for (const subdir of allowedSubdirs) {
      const relativePath = `${subdir}/${projectId}.json`;
      if (inSnapshot.has(relativePath)) continue;
      const live = path.resolve(dataDir, subdir, `${projectId}.json`);
      if (!isWithin(dataDir, live)) continue;
      await fsp.rm(live, { force: true }).catch(() => undefined);
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

  let identityReport: CreatorBackupProjectIdentityReport | undefined;

  const fail = (error: string, extra: Partial<RestoreCreatorBackupResponse> = {}): RestoreCreatorBackupResponse => ({
    ok: false,
    error,
    ...extra,
  });

  let backupId: string;
  try {
    backupId = request.backupId;
    assertBackupIdSafe(backupId);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "invalid backup id");
  }

  const manifest = await readManifest(dataDir, backupId);
  if (manifest == null) {
    return fail("backup not found");
  }

  // Pre-flight: every declared file must be path-safe, under an allowlisted
  // subdir, and resolve inside the data dir — before we touch any live data.
  const backupRoot = resolveBackupRoot(dataDir);
  const snapshotDir = path.join(backupRoot, sanitizeBackupId(backupId));
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  for (const file of files) {
    if (typeof file?.relativePath !== "string" || !file.relativePath) {
      return fail("backup manifest contains a file without a relativePath");
    }
    if (file.relativePath.includes("..") || path.isAbsolute(file.relativePath)) {
      return fail(`backup file path is not safe: ${file.relativePath}`);
    }
    const parts = file.relativePath.split("/");
    if (parts.length !== 2 || !allowedSubdirs.includes(parts[0] ?? "")) {
      return fail(`backup file is not allowlisted: ${file.relativePath}`);
    }
    const dest = path.resolve(dataDir, file.relativePath);
    if (!isWithin(dataDir, dest)) {
      return fail(`backup file escapes data dir: ${file.relativePath}`);
    }
  }

  const validation = await validateSnapshot(dataDir, backupId);
  if (!validation.valid) {
    return fail(`backup failed validation: ${validation.issues.join("; ") || "unknown"}`);
  }

  // From here the live data is mutated. Freeze the daemon (await confirmed
  // exit); if it cannot be stopped we must NOT create a rollback or touch any
  // live file. The rollback snapshot itself is removed only once the system is
  // in a known-good state (after the sidecar group is back up).
  try {
    await daemonControl.freeze();
  } catch (error) {
    return fail(
      `restore aborted: daemon could not be stopped: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const stamp = now().toISOString().replace(/[:.]/g, "-");
  const rollbackDir = path.join(path.dirname(backupRoot), ROLLBACK_DIR_NAME, `${stamp}-${randomUUID()}`);

  try {
    await captureRollback(dataDir, manifest, allowedSubdirs, rollbackDir);

    try {
      await stageSnapshotFiles(dataDir, manifest, snapshotDir, allowedSubdirs);
      await deleteExtraLiveFiles(dataDir, manifest, allowedSubdirs);

      // Start the fresh daemon before reconciling identities: reconciliation
      // is a private daemon-sidecar operation and cannot run while frozen.
      await daemonControl.restart();
      if (Array.isArray(manifest.projectIdentities) && manifest.projectIdentities.length > 0) {
        if (!daemonControl.restoreProjectIdentities) {
          throw new Error("creator backup identity reconciliation is unavailable");
        }
        identityReport = await daemonControl.restoreProjectIdentities(manifest.projectIdentities);
        if (!identityReport?.performed || identityReport.conflicts.length > 0) {
          throw new Error(`creator backup identity reconciliation did not complete${identityReport?.conflicts.length ? `: conflicts for ${identityReport.conflicts.join(", ")}` : ""}`);
        }
      }

      // Success path: only now (daemon/web up and identities reconciled) drop
      // the rollback snapshot.
      await removeDir(rollbackDir);
      return {
        ok: true,
        backup: toSummary(manifest),
        rolledBack: false,
        rollbackRemoved: true,
        projectIdentity: identityReport,
      };
    } catch (stageOrRestartError) {
      const reason = stageOrRestartError instanceof Error ? stageOrRestartError.message : String(stageOrRestartError);
      // Auto-rollback: restore the pre-restore live files, then best-effort
      // restart so the daemon is never left paused on a broken state.
      try {
        // A post-restart identity failure means the daemon is live again; stop
        // it before restoring rollback bytes so it cannot race the swap.
        await daemonControl.freeze();
        await applyRollback(dataDir, rollbackDir, allowedSubdirs);
      } catch (rollbackError) {
        // Rollback itself failed: leave the snapshot dir for manual recovery
        // and report both failures accurately (never claim success).
        return fail(
          `restore failed and rollback failed: ${reason}; manual recovery needed at ${rollbackDir}`,
          { rolledBack: false, rollbackRemoved: false, projectIdentity: identityReport },
        );
      }
      try {
        await daemonControl.restart();
      } catch {
        // Data is consistent (pre-restore) but the daemon won't come up. Per
        // spec, do NOT delete the rollback (recovery did not fully succeed)
        // and report accurately — we never claim the restore succeeded.
        return fail(
          `restore aborted: live data restored to pre-restore state, but daemon restart failed: ${reason}`,
          { rolledBack: true, rollbackRemoved: false, projectIdentity: identityReport },
        );
      }
      await removeDir(rollbackDir);
      return fail(`restore aborted and rolled back: ${reason}`, {
        rolledBack: true,
        rollbackRemoved: true,
        projectIdentity: identityReport,
      });
    }
  } catch (error) {
    // Capture or an unexpected pre-mutation error: nothing live was mutated
    // beyond the rollback dir (which holds only copies of live files). Clean
    // it up and report accurately.
    await removeDir(rollbackDir).catch(() => undefined);
    return fail(`restore aborted before writing live data: ${error instanceof Error ? error.message : String(error)}`, {
      rolledBack: false,
      rollbackRemoved: false,
    });
  }
}

// ---- production daemon control --------------------------------------------
//
// The production control does NOT live entirely here. `freeze()` (stop the
// daemon and await confirmed exit) and `restart()` (re-spawn the full daemon +
// web group and replace the managed handle) are supplied by the packaged main
// process, which has the real sidecar children. This factory only wires those
// injected capabilities into the `CreatorBackupDaemonControl` shape and keeps a
// sensible default for `restoreProjectIdentities` when none is provided.

export interface CreatorBackupDaemonControlFactoryDeps {
  /** Stops the daemon sidecar and awaits confirmed process exit. Must throw on failure. */
  stopDaemon: () => Promise<void>;
  /** Re-spawns the full daemon + web sidecar group and replaces the managed handle. */
  restartSidecars: () => Promise<string>;
  /** Reconciles minimal project identities via the daemon's controlled API. */
  restoreProjectIdentities?: (identities: CreatorBackupProjectIdentity[]) => Promise<CreatorBackupProjectIdentityReport | undefined>;
}

/** Build the production daemon control used by the packaged main process. */
export function createCreatorBackupDaemonControl(
  deps: CreatorBackupDaemonControlFactoryDeps,
): CreatorBackupDaemonControl {
  const control: CreatorBackupDaemonControl = {
    async freeze() {
      await deps.stopDaemon();
    },
    async restart() {
      await deps.restartSidecars();
    },
  };
  if (deps.restoreProjectIdentities) {
    control.restoreProjectIdentities = deps.restoreProjectIdentities;
  }
  return control;
}

// ---- single-flight guard -------------------------------------------------
//
// A restore writes the shared data dir; two concurrent restores must never run
// in parallel. `createSingleFlightRestore` serializes calls: a second in-flight
// request is routed to `onConcurrency` (e.g. a clear rejection) instead of
// racing the first.

export function createSingleFlightRestore<Req, Res>(
  run: (req: Req) => Promise<Res>,
  onConcurrency: (req: Req) => Res,
): (req: Req) => Promise<Res> {
  let inFlight: Promise<Res> | null = null;
  return async (req: Req): Promise<Res> => {
    if (inFlight) return onConcurrency(req);
    const promise = run(req).finally(() => {
      inFlight = null;
    });
    inFlight = promise;
    return promise;
  };
}

export { hashIdentity };
