/**
 * Restore orchestration engine tests.
 *
 * The engine (`restoreCreatorBackup`) is exercised with injected `daemonControl`
 * and store reads so the test performs NO real daemon freeze/restart and never
 * touches a live daemon. The live-file swap, rollback capture, and auto-rollback
 * all run against a real temp data dir, so the safety guarantees are verified
 * against the filesystem.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSingleFlightRestore,
  restoreCreatorBackup,
  type CreatorBackupDaemonControl,
  type CreatorBackupFile,
  type CreatorBackupManifest,
  type CreatorBackupProjectIdentity,
  type CreatorBackupProjectIdentityReport,
  type CreatorBackupValidationResult,
  type RestoreCreatorBackupDeps,
  type RestoreCreatorBackupRequest,
} from "../src/restore.js";

const ALLOWED = [
  "creator-workbench",
  "creator-media",
  "creator-content",
  "creator-release",
  "creator-performance",
] as const;

const BACKUP_ID = "bk-2026-0001";

let scratch: string;
let dataDir: string;
let backupRoot: string;

const liveContent = (subdir: string): string => `LIVE:${subdir}:project-1`;
const backupContent = (subdir: string): string => `BACKUP:${subdir}:project-1`;

function writeLiveFiles(projectId = "project-1"): void {
  for (const subdir of ALLOWED) {
    const target = path.join(dataDir, subdir, `${projectId}.json`);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, liveContent(subdir), "utf8");
  }
}

function relativeFile(subdir: string): CreatorBackupFile {
  return {
    relativePath: `${subdir}/project-1.json`,
    size: Buffer.byteLength(backupContent(subdir), "utf8"),
    sha256: "0".repeat(64),
  };
}

function makeManifest(files: CreatorBackupFile[], projectIds = ["project-1"]): CreatorBackupManifest {
  return {
    schemaVersion: 1,
    id: `creator-backup:${BACKUP_ID}`,
    createdAt: "2026-07-17T00:00:00.000Z",
    namespace: "test-namespace",
    profile: "full",
    projectIds,
    files,
    fileCount: files.length,
    totalSize: files.reduce((sum, f) => sum + f.size, 0),
    status: "ready",
  };
}

function writeSnapshotFiles(files: CreatorBackupFile[]): void {
  const snapshotDir = path.join(backupRoot, BACKUP_ID);
  mkdirSync(snapshotDir, { recursive: true });
  for (const file of files) {
    const dest = path.join(snapshotDir, file.relativePath);
    mkdirSync(path.dirname(dest), { recursive: true });
    const subdir = file.relativePath.split("/")[0] ?? "";
    writeFileSync(dest, backupContent(subdir), "utf8");
  }
}

function validValidation(fileCount: number): CreatorBackupValidationResult {
  return { id: `creator-backup:${BACKUP_ID}`, valid: true, issues: [], fileCount, totalSize: 0 };
}

function engineDeps(
  daemonControl: CreatorBackupDaemonControl,
  manifest: CreatorBackupManifest,
  options: { validation?: CreatorBackupValidationResult; readManifest?: CreatorBackupManifest | null } = {},
): RestoreCreatorBackupDeps {
  return {
    dataDir,
    daemonControl,
    resolveBackupRoot: () => backupRoot,
    allowedSubdirs: ALLOWED,
    readManifest: async () => (options.readManifest === undefined ? manifest : options.readManifest),
    validateSnapshot: async () => options.validation ?? validValidation(manifest.files.length),
  };
}

beforeEach(() => {
  // Nest dataDir under a unique scratch so the derived backup root
  // (`dirname(dataDir)/backups/creator`) is unique per test and never shared.
  scratch = mkdtempSync(path.join(os.tmpdir(), "od-restore-"));
  dataDir = path.join(scratch, "data");
  mkdirSync(dataDir, { recursive: true });
  backupRoot = path.join(scratch, "backups", "creator");
  mkdirSync(backupRoot, { recursive: true });
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("restoreCreatorBackup", () => {
  it("stages allowlisted files and reports ok after freeze + restart", async () => {
    writeLiveFiles();
    const files = ALLOWED.map((subdir) => relativeFile(subdir));
    writeSnapshotFiles(files);
    const daemonControl: CreatorBackupDaemonControl = {
      freeze: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
    };
    const manifest = makeManifest(files);

    const response = await restoreCreatorBackup(
      engineDeps(daemonControl, manifest),
      { backupId: BACKUP_ID } satisfies RestoreCreatorBackupRequest,
    );

    expect(response.ok).toBe(true);
    expect(response.backup?.id).toBe(`creator-backup:${BACKUP_ID}`);
    expect(daemonControl.freeze).toHaveBeenCalledTimes(1);
    expect(daemonControl.restart).toHaveBeenCalledTimes(1);

    // All five allowlisted stores are restored to the snapshot content.
    for (const subdir of ALLOWED) {
      expect(readFileSync(path.join(dataDir, subdir, "project-1.json"), "utf8")).toBe(
        backupContent(subdir),
      );
    }
    // Rollback snapshot is discarded on success.
    const rollbackRoot = path.join(scratch, "backups", "_rollback");
    expect(!existsSync(rollbackRoot) || readdirSync(rollbackRoot).length === 0).toBe(true);
  });

  it("returns not found and never freezes when the manifest is missing", async () => {
    const daemonControl: CreatorBackupDaemonControl = {
      freeze: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
    };
    const response = await restoreCreatorBackup(
      engineDeps(daemonControl, makeManifest([]), { readManifest: null }),
      { backupId: BACKUP_ID } satisfies RestoreCreatorBackupRequest,
    );
    expect(response.ok).toBe(false);
    expect(response.error).toContain("not found");
    expect(daemonControl.freeze).not.toHaveBeenCalled();
  });

  it("rejects a path-unsafe backup id without freezing", async () => {
    const daemonControl: CreatorBackupDaemonControl = {
      freeze: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
    };
    const response = await restoreCreatorBackup(
      engineDeps(daemonControl, makeManifest([])),
      { backupId: "../escape" } satisfies RestoreCreatorBackupRequest,
    );
    expect(response.ok).toBe(false);
    expect(response.error).toContain("not path safe");
    expect(daemonControl.freeze).not.toHaveBeenCalled();
  });

  it("fails validation before freezing and reports the issues", async () => {
    writeLiveFiles();
    const files = [relativeFile("creator-workbench")];
    writeSnapshotFiles(files);
    const daemonControl: CreatorBackupDaemonControl = {
      freeze: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
    };
    const response = await restoreCreatorBackup(
      engineDeps(daemonControl, makeManifest(files), {
        validation: { id: "x", valid: false, issues: ["hash mismatch for creator-workbench/project-1.json"], fileCount: 1, totalSize: 0 },
      }),
      { backupId: BACKUP_ID } satisfies RestoreCreatorBackupRequest,
    );
    expect(response.ok).toBe(false);
    expect(response.error).toContain("hash mismatch");
    expect(daemonControl.freeze).not.toHaveBeenCalled();
  });

  it("rejects a manifest file outside the allowlist before freezing", async () => {
    const daemonControl: CreatorBackupDaemonControl = {
      freeze: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
    };
    const manifest = makeManifest([{ relativePath: "creator-evil/project-1.json", size: 1, sha256: "0".repeat(64) }]);
    const response = await restoreCreatorBackup(
      engineDeps(daemonControl, manifest),
      { backupId: BACKUP_ID } satisfies RestoreCreatorBackupRequest,
    );
    expect(response.ok).toBe(false);
    expect(response.error).toContain("not allowlisted");
    expect(daemonControl.freeze).not.toHaveBeenCalled();
  });

  it("rejects a manifest file that escapes the data dir before freezing", async () => {
    const daemonControl: CreatorBackupDaemonControl = {
      freeze: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
    };
    const manifest = makeManifest([{ relativePath: "../escape.json", size: 1, sha256: "0".repeat(64) }]);
    const response = await restoreCreatorBackup(
      engineDeps(daemonControl, manifest),
      { backupId: BACKUP_ID } satisfies RestoreCreatorBackupRequest,
    );
    expect(response.ok).toBe(false);
    expect(response.error).toContain("not safe");
    expect(daemonControl.freeze).not.toHaveBeenCalled();
  });

  it("rolls back live files and restarts when staging fails mid-swap", async () => {
    writeLiveFiles();
    const files = [relativeFile("creator-workbench"), relativeFile("creator-media")];
    // Provide only the FIRST snapshot file; the second read throws mid-swap.
    writeSnapshotFiles([files[0]]);
    const daemonControl: CreatorBackupDaemonControl = {
      freeze: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
    };
    const manifest = makeManifest(files);

    const response = await restoreCreatorBackup(
      engineDeps(daemonControl, manifest),
      { backupId: BACKUP_ID } satisfies RestoreCreatorBackupRequest,
    );

    expect(response.ok).toBe(false);
    expect(response.error).toContain("rolled back");
    expect(daemonControl.freeze).toHaveBeenCalledTimes(2);
    expect(daemonControl.restart).toHaveBeenCalledTimes(1);
    // The partially-staged workbench file is reverted to its live content.
    expect(readFileSync(path.join(dataDir, "creator-workbench", "project-1.json"), "utf8")).toBe(
      liveContent("creator-workbench"),
    );
    // The never-staged media file keeps its live content.
    expect(readFileSync(path.join(dataDir, "creator-media", "project-1.json"), "utf8")).toBe(
      liveContent("creator-media"),
    );
    // Rollback snapshot is cleaned up.
    const rollbackRoot = path.join(scratch, "_rollback");
    expect(!existsSync(rollbackRoot) || readdirSync(rollbackRoot).length === 0).toBe(true);
  });

  it("P0-1: removes rollback only after restart succeeds; restores pre-restore state when restart fails", async () => {
    writeLiveFiles();
    const files = [relativeFile("creator-workbench"), relativeFile("creator-media")];
    writeSnapshotFiles(files);
    const daemonControl: CreatorBackupDaemonControl = {
      freeze: vi.fn(async () => undefined),
      // Restart FAILS — the engine must not claim success and must restore the
      // pre-restore live state, keeping the rollback snapshot for inspection.
      restart: vi.fn(async () => {
        throw new Error("daemon failed to come back up");
      }),
    };
    const manifest = makeManifest(files);

    const response = await restoreCreatorBackup(
      engineDeps(daemonControl, manifest),
      { backupId: BACKUP_ID } satisfies RestoreCreatorBackupRequest,
    );

    expect(response.ok).toBe(false);
    expect(response.rolledBack).toBe(true);
    expect(response.rollbackRemoved).toBe(false);
    // Error must NOT claim the restore succeeded.
    expect(response.error).toContain("daemon restart failed");
    expect(response.error).not.toMatch(/rolled back.*success|restore (complete|succeeded)/i);
    // All managed files are byte-identical to their pre-restore content.
    for (const subdir of ALLOWED) {
      expect(readFileSync(path.join(dataDir, subdir, "project-1.json"), "utf8")).toBe(liveContent(subdir));
    }
    // Rollback snapshot is retained (recovery did not fully succeed).
    const rollbackRoot = path.join(scratch, "backups", "_rollback");
    expect(existsSync(rollbackRoot)).toBe(true);
    expect(readdirSync(rollbackRoot).length).toBeGreaterThan(0);
  });

  it("P1-1: deletes live Creator files that are absent from the snapshot (full-snapshot restore)", async () => {
    // Live has all five stores populated; the snapshot covers only two.
    writeLiveFiles();
    const files = [relativeFile("creator-workbench"), relativeFile("creator-media")];
    writeSnapshotFiles(files);
    const daemonControl: CreatorBackupDaemonControl = {
      freeze: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
    };
    const manifest = makeManifest(files);

    const response = await restoreCreatorBackup(
      engineDeps(daemonControl, manifest),
      { backupId: BACKUP_ID } satisfies RestoreCreatorBackupRequest,
    );

    expect(response.ok).toBe(true);
    // Snapshot stores restored to backup content.
    expect(readFileSync(path.join(dataDir, "creator-workbench", "project-1.json"), "utf8")).toBe(
      backupContent("creator-workbench"),
    );
    expect(readFileSync(path.join(dataDir, "creator-media", "project-1.json"), "utf8")).toBe(
      backupContent("creator-media"),
    );
    // Stores not present in the snapshot are removed from the live data.
    for (const removed of ["creator-content", "creator-release", "creator-performance"]) {
      expect(existsSync(path.join(dataDir, removed, "project-1.json"))).toBe(false);
    }
    // Rollback snapshot discarded on success.
    const rollbackRoot = path.join(scratch, "backups", "_rollback");
    expect(!existsSync(rollbackRoot) || readdirSync(rollbackRoot).length === 0).toBe(true);
  });

  it("P1-1: removes files created during a partial swap when rolled back", async () => {
    // Live: workbench present, content ABSENT. Snapshot has all three but the
    // media file is missing on disk so staging throws after creating content.
    writeLiveFiles(); // writes all five
    rmSync(path.join(dataDir, "creator-content", "project-1.json")); // make content absent live
    const files = [
      relativeFile("creator-workbench"),
      relativeFile("creator-content"),
      relativeFile("creator-media"),
    ];
    writeSnapshotFiles([files[0], files[1]]); // media file intentionally missing -> staging throws
    const daemonControl: CreatorBackupDaemonControl = {
      freeze: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
    };
    const manifest = makeManifest(files);

    const response = await restoreCreatorBackup(
      engineDeps(daemonControl, manifest),
      { backupId: BACKUP_ID } satisfies RestoreCreatorBackupRequest,
    );

    expect(response.ok).toBe(false);
    expect(response.rolledBack).toBe(true);
    // workbench restored to its live content (it was present before the restore).
    expect(readFileSync(path.join(dataDir, "creator-workbench", "project-1.json"), "utf8")).toBe(
      liveContent("creator-workbench"),
    );
    // content was absent before the restore but created during the swap -> must be gone.
    expect(existsSync(path.join(dataDir, "creator-content", "project-1.json"))).toBe(false);
    // media was present live before the restore, so rollback restores it (not removed).
    expect(readFileSync(path.join(dataDir, "creator-media", "project-1.json"), "utf8")).toBe(
      liveContent("creator-media"),
    );
  });

  it("P0-2: aborts before any live mutation when the daemon cannot be frozen", async () => {
    writeLiveFiles();
    const files = [relativeFile("creator-workbench")];
    writeSnapshotFiles(files);
    const daemonControl: CreatorBackupDaemonControl = {
      freeze: vi.fn(async () => {
        throw new Error("daemon did not exit");
      }),
      restart: vi.fn(async () => undefined),
    };
    const manifest = makeManifest(files);

    const response = await restoreCreatorBackup(
      engineDeps(daemonControl, manifest),
      { backupId: BACKUP_ID } satisfies RestoreCreatorBackupRequest,
    );

    expect(response.ok).toBe(false);
    expect(response.error).toContain("daemon could not be stopped");
    // Live files untouched, no rollback snapshot created.
    expect(readFileSync(path.join(dataDir, "creator-workbench", "project-1.json"), "utf8")).toBe(
      liveContent("creator-workbench"),
    );
    const rollbackRoot = path.join(scratch, "backups", "_rollback");
    expect(existsSync(rollbackRoot)).toBe(false);
    expect(daemonControl.restart).not.toHaveBeenCalled();
  });

  it("P1-2: reconciles project identities via the injected control", async () => {
    writeLiveFiles();
    const files = [relativeFile("creator-workbench")];
    writeSnapshotFiles(files);
    const identities: CreatorBackupProjectIdentity[] = [
      { id: "project-1", name: "Demo Project", schemaVersion: 1, hash: "0".repeat(64) },
    ];
    const report: CreatorBackupProjectIdentityReport = {
      performed: true,
      created: ["project-1"],
      kept: [],
      conflicts: [],
    };
    const restoreProjectIdentities = vi.fn(async () => report);
    const daemonControl: CreatorBackupDaemonControl = {
      freeze: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
      restoreProjectIdentities,
    };
    const manifest = makeManifest(files);
    manifest.projectIdentities = identities;

    const response = await restoreCreatorBackup(
      engineDeps(daemonControl, manifest),
      { backupId: BACKUP_ID } satisfies RestoreCreatorBackupRequest,
    );

    expect(response.ok).toBe(true);
    expect(restoreProjectIdentities).toHaveBeenCalledWith(identities);
    expect(vi.mocked(daemonControl.restart).mock.invocationCallOrder[0]).toBeLessThan(
      restoreProjectIdentities.mock.invocationCallOrder[0]!,
    );
    expect(response.projectIdentity).toEqual(report);
  });

  it("P1-2: an identity conflict fails the restore and rolls back the file swap", async () => {
    writeLiveFiles();
    const files = [relativeFile("creator-workbench")];
    writeSnapshotFiles(files);
    const report: CreatorBackupProjectIdentityReport = {
      performed: true,
      created: [],
      kept: [],
      conflicts: ["project-1"],
    };
    const daemonControl: CreatorBackupDaemonControl = {
      freeze: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
      restoreProjectIdentities: vi.fn(async () => report),
    };
    const manifest = makeManifest(files);
    manifest.projectIdentities = [{ id: "project-1", name: "Other", schemaVersion: 1, hash: "0".repeat(64) }];

    const response = await restoreCreatorBackup(
      engineDeps(daemonControl, manifest),
      { backupId: BACKUP_ID } satisfies RestoreCreatorBackupRequest,
    );
    expect(response.ok).toBe(false);
    expect(response.rolledBack).toBe(true);
    expect(response.projectIdentity?.conflicts).toEqual(["project-1"]);
    expect(readFileSync(path.join(dataDir, "creator-workbench", "project-1.json"), "utf8")).toBe(
      liveContent("creator-workbench"),
    );
  });

  it("P1-2: identity reconcile failure rolls back instead of reporting restore success", async () => {
    writeLiveFiles();
    const files = [relativeFile("creator-workbench")];
    writeSnapshotFiles(files);
    const daemonControl: CreatorBackupDaemonControl = {
      freeze: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
      restoreProjectIdentities: vi.fn(async () => {
        throw new Error("reconcile endpoint down");
      }),
    };
    const manifest = makeManifest(files);
    manifest.projectIdentities = [{ id: "project-1", name: "Demo", schemaVersion: 1, hash: "0".repeat(64) }];

    const response = await restoreCreatorBackup(
      engineDeps(daemonControl, manifest),
      { backupId: BACKUP_ID } satisfies RestoreCreatorBackupRequest,
    );
    expect(response.ok).toBe(false);
    expect(response.rolledBack).toBe(true);
    expect(response.error).toContain("reconcile endpoint down");
    expect(readFileSync(path.join(dataDir, "creator-workbench", "project-1.json"), "utf8")).toBe(
      liveContent("creator-workbench"),
    );
  });

  it("P0-2.5: single-flight guard rejects a concurrent restore", async () => {
    const run = vi.fn(async (req: string) => {
      await new Promise((r) => setTimeout(r, 20));
      return `ran:${req}`;
    });
    const onConcurrency = vi.fn((req: string) => `busy:${req}`);
    const wrapped = createSingleFlightRestore(run, onConcurrency);
    const [first, second] = await Promise.all([wrapped("a"), wrapped("b")]);
    expect(first).toBe("ran:a");
    expect(second).toBe("busy:b");
    expect(run).toHaveBeenCalledTimes(1);
    expect(onConcurrency).toHaveBeenCalledTimes(1);
  });
});
