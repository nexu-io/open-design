/**
 * Minimal project-identity export / import for Creator backups.
 *
 * This module is daemon-only. It reads and writes the project record through
 * the daemon's EXISTING controlled DB API (`getProject` / `insertProject`), so
 * it never copies or replaces the SQLite file directly and never touches
 * working-dir paths, credentials, asset bodies, or unrelated project data.
 *
 * It is intentionally NOT part of the `@open-design/daemon/creator-backup`
 * subpath that `apps/packaged` consumes, so the packaged desktop main process
 * does not pull `better-sqlite3` into its bundle.
 */

import { createHash } from "node:crypto";
import { getProject, insertProject } from "../db.js";
import type { CreatorBackupProjectIdentity, CreatorBackupProjectIdentityReport } from "@open-design/contracts";

type Db = Parameters<typeof getProject>[0];

function hashIdentity(id: string, name: string): string {
  return createHash("sha256").update(`${id}\n${name}`).digest("hex");
}

/** Minimal identity the rest of the backup pipeline needs. */
export type MinimalProjectIdentity = { id: string; name: string };

/**
 * Read the minimal project identity for `projectId` via the controlled DB API.
 * Returns null when no project record exists (so the snapshot can still be
 * taken, just without an identity payload).
 */
export function readProjectIdentity(db: unknown, projectId: string): MinimalProjectIdentity | null {
  const row = getProject(db as Db, projectId) as { id?: unknown; name?: unknown } | null;
  if (!row || typeof row.id !== "string" || typeof row.name !== "string") return null;
  return { id: row.id, name: row.name };
}

/**
 * Capture minimal identity payloads for the given projects (id + name only),
 * each with a SHA-256 over `${id}\n${name}` for tamper detection. Missing
 * projects are simply skipped.
 */
export function captureProjectIdentities(
  db: unknown,
  projectIds: string[],
): CreatorBackupProjectIdentity[] {
  const out: CreatorBackupProjectIdentity[] = [];
  for (const projectId of projectIds) {
    const minimal = readProjectIdentity(db, projectId);
    if (!minimal) continue;
    out.push({
      id: minimal.id,
      name: minimal.name,
      schemaVersion: 1,
      hash: hashIdentity(minimal.id, minimal.name),
    });
  }
  return out;
}

/**
 * Re-establish minimal project identity records during a restore.
 *
 * - No existing record → create it (minimal: id + name).
 * - Existing record with a matching name → keep (compatible).
 * - Existing record whose name disagrees → conflict: keep the existing record
 *   unchanged (never silently overwrite a non-Creator project).
 */
export function reconcileProjectIdentities(
  db: unknown,
  identities: CreatorBackupProjectIdentity[],
): CreatorBackupProjectIdentityReport {
  const report: CreatorBackupProjectIdentityReport = {
    performed: true,
    created: [],
    kept: [],
    conflicts: [],
  };
  const d = db as Db & { transaction: <T>(fn: () => T) => () => T };
  const normalized: CreatorBackupProjectIdentity[] = [];
  for (const identity of identities) {
    if (!identity || typeof identity.id !== "string" || identity.id.length === 0) {
      report.conflicts.push("");
      continue;
    }
    if (typeof identity.name !== "string" || !identity.name || identity.schemaVersion !== 1 || identity.hash !== hashIdentity(identity.id, identity.name)) {
      report.conflicts.push(identity.id);
      continue;
    }
    const existing = getProject(d, identity.id) as { id?: string; name?: unknown } | null;
    if (existing && (typeof existing.name !== "string" || existing.name !== identity.name)) {
      report.conflicts.push(identity.id);
      continue;
    }
    normalized.push(identity);
    if (existing) report.kept.push(identity.id);
  }
  if (report.conflicts.length > 0) return report;
  d.transaction(() => {
    for (const identity of normalized) {
      const existing = getProject(d, identity.id) as { id?: string; name?: unknown } | null;
      if (!existing) {
      insertProject(d, {
        id: identity.id,
        name: typeof identity.name === "string" && identity.name.length > 0 ? identity.name : identity.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as Parameters<typeof insertProject>[1]);
      report.created.push(identity.id);
    }
    }
  })();
  return report;
}
