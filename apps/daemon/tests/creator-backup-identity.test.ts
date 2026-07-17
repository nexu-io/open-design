/**
 * Creator backup minimal project-identity restore tests (P1-2).
 *
 * Covers the daemon-only identity module (`captureProjectIdentities`,
 * `readProjectIdentity`, `reconcileProjectIdentities`). The module reads/writes the
 * project record ONLY through the daemon's controlled DB API, so a real
 * SQLite database is exercised here (no raw file or working-dir writes).
 */

import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDatabase, insertProject, openDatabase } from "../src/db.js";
import {
  captureProjectIdentities,
  readProjectIdentity,
  reconcileProjectIdentities,
} from "../src/creator-backup/project-identity.js";

let scratch: string;
let db: ReturnType<typeof openDatabase>;

function makeIdentity(id: string, name: string) {
  return { id, name, schemaVersion: 1, hash: createHash("sha256").update(`${id}\n${name}`).digest("hex") };
}

beforeEach(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), "od-creator-identity-"));
  db = openDatabase(scratch, { dataDir: path.join(scratch, "data") });
});

afterEach(() => {
  closeDatabase();
  rmSync(scratch, { recursive: true, force: true });
});

describe("captureProjectIdentities / readProjectIdentity (P1-2)", () => {
  it("captures minimal id + name with a tamper hash; skips missing projects", () => {
    insertProject(db, { id: "p1", name: "Demo", createdAt: Date.now(), updatedAt: Date.now() });

    const captured = captureProjectIdentities(db, ["p1", "ghost"]);
    expect(captured).toHaveLength(1);
    const first = captured[0]!;
    expect(first.id).toBe("p1");
    expect(first.name).toBe("Demo");
    expect(first.schemaVersion).toBe(1);
    expect(first.hash).toBe(createHash("sha256").update("p1\nDemo").digest("hex"));
  });

  it("readProjectIdentity returns null when the project record does not exist", () => {
    expect(readProjectIdentity(db, "ghost")).toBeNull();
  });
});

describe("reconcileProjectIdentities (P1-2)", () => {
  it("creates a record when none exists", () => {
    const report = reconcileProjectIdentities(db, [makeIdentity("p-new", "New Project")]);
    expect(report.performed).toBe(true);
    expect(report.created).toEqual(["p-new"]);
    expect(report.kept).toEqual([]);
    expect(report.conflicts).toEqual([]);
    expect((getProjectSafe("p-new") as { name: string }).name).toBe("New Project");
  });

  it("keeps a matching record (no silent overwrite)", () => {
    insertProject(db, { id: "p-keep", name: "Same", createdAt: Date.now(), updatedAt: Date.now() });
    const report = reconcileProjectIdentities(db, [makeIdentity("p-keep", "Same")]);
    expect(report.kept).toEqual(["p-keep"]);
    expect(report.created).toEqual([]);
    expect(report.conflicts).toEqual([]);
    expect((getProjectSafe("p-keep") as { name: string }).name).toBe("Same");
  });

  it("conflicts on a name mismatch and leaves the existing record untouched", () => {
    insertProject(db, { id: "p-conf", name: "Original", createdAt: Date.now(), updatedAt: Date.now() });
    const report = reconcileProjectIdentities(db, [makeIdentity("p-conf", "Hijack")]);
    expect(report.conflicts).toEqual(["p-conf"]);
    expect(report.created).toEqual([]);
    expect(report.kept).toEqual([]);
    // The pre-existing (possibly unrelated) project record is never overwritten.
    expect((getProjectSafe("p-conf") as { name: string }).name).toBe("Original");
  });
  it("rejects a tampered identity and leaves every candidate uncreated", () => {
    const tampered = { ...makeIdentity("p-bad", "Tampered"), hash: "0".repeat(64) };
    const report = reconcileProjectIdentities(db, [makeIdentity("p-valid", "Valid"), tampered]);
    expect(report.conflicts).toEqual(["p-bad"]);
    expect(readProjectIdentity(db, "p-valid")).toBeNull();
    expect(readProjectIdentity(db, "p-bad")).toBeNull();
  });
});

function getProjectSafe(id: string): unknown {
  // Re-open is a no-op (singleton); query through the same handle.
  return readProjectIdentity(db, id);
}
