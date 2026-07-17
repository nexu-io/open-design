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
  restoreCreatorBackup,
  type CreatorBackupDaemonControl,
  type CreatorBackupFile,
  type CreatorBackupManifest,
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
    expect(response.backup?.id).toBe(`creator-backup:${BACKUP_ID}`);
    expect(daemonControl.freeze).toHaveBeenCalledTimes(1);
    expect(daemonControl.restart).toHaveBeenCalledTimes(1);

    expect(readFileSync(path.join(dataDir, "creator-workbench", "project-1.json"), "utf8")).toBe(
      backupContent("creator-workbench"),
    );
    expect(readFileSync(path.join(dataDir, "creator-media", "project-1.json"), "utf8")).toBe(
      backupContent("creator-media"),
    );
    // Untouched subdirs keep their live content.
    expect(readFileSync(path.join(dataDir, "creator-content", "project-1.json"), "utf8")).toBe(
      liveContent("creator-content"),
    );
    // Rollback snapshot is discarded on success.
    const rollbackRoot = path.join(scratch, "_rollback");
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
    expect(daemonControl.freeze).toHaveBeenCalledTimes(1);
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
});
