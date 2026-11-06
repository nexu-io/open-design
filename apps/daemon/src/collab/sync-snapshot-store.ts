// Local persistence for the sync-digest snapshot cache.
//
// One row holds a face's last-fetched payload TOGETHER with the digest token
// that payload was current at. Storing them in the same row of the same
// database is the whole trick: a half state ("snapshot but no token", or the
// reverse) would make the reuse test unanswerable, so the schema makes it
// impossible to write one without the other.
//
// The row lives in the daemon's SQLite database, which the daemon opened from
// the resolved runtime data root — this module never resolves a data path of
// its own (see the Daemon data directory contract in AGENTS.md).

import type Database from 'better-sqlite3';
import type { CollabCloudMemberDirectoryEntry, TeamProject } from '@open-design/contracts';
import type { SyncDigestFace } from './sync-digest.js';

type SqliteDb = Database.Database;

export function migrateCollabSyncSnapshots(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS collab_sync_snapshots (
      face TEXT NOT NULL,
      account_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      digest_token TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (face, account_id, workspace_id)
    );
  `);
}

/**
 * Cache identity. `accountId` is part of the primary key so a snapshot can
 * only ever be read back under the account that wrote it — switching accounts
 * is a miss, not a leak. Callers must never synthesize a placeholder for a
 * missing account id.
 */
export interface CollabSyncSnapshotKey {
  face: SyncDigestFace;
  accountId: string;
  workspaceId: string;
}

export interface CollabSyncSnapshotRecord {
  token: string;
  snapshotJson: string;
}

export interface CollabSyncSnapshotStore {
  read(key: CollabSyncSnapshotKey): CollabSyncSnapshotRecord | null;
  /** Write token + payload as one atomic unit. */
  write(key: CollabSyncSnapshotKey, record: CollabSyncSnapshotRecord): void;
  drop(key: CollabSyncSnapshotKey): void;
}

export function createCollabSyncSnapshotStore(db: SqliteDb): CollabSyncSnapshotStore {
  const selectRow = db.prepare(
    `SELECT digest_token AS token, snapshot_json AS snapshotJson
       FROM collab_sync_snapshots
      WHERE face = ? AND account_id = ? AND workspace_id = ?`,
  );
  const upsertRow = db.prepare(
    `INSERT INTO collab_sync_snapshots
       (face, account_id, workspace_id, digest_token, snapshot_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(face, account_id, workspace_id) DO UPDATE SET
       digest_token = excluded.digest_token,
       snapshot_json = excluded.snapshot_json,
       updated_at = excluded.updated_at`,
  );
  const deleteRow = db.prepare(
    `DELETE FROM collab_sync_snapshots
      WHERE face = ? AND account_id = ? AND workspace_id = ?`,
  );
  // One statement already writes both columns atomically; the explicit
  // transaction states the invariant at the call site so a future edit that
  // splits the write into two statements still cannot publish a half state.
  const writeAtomically = db.transaction(
    (key: CollabSyncSnapshotKey, record: CollabSyncSnapshotRecord) => {
      upsertRow.run(
        key.face,
        key.accountId,
        key.workspaceId,
        record.token,
        record.snapshotJson,
        Date.now(),
      );
    },
  );

  return {
    read(key) {
      const row = selectRow.get(key.face, key.accountId, key.workspaceId) as
        | { token?: unknown; snapshotJson?: unknown }
        | undefined;
      if (!row || typeof row.token !== 'string' || typeof row.snapshotJson !== 'string') {
        return null;
      }
      return { token: row.token, snapshotJson: row.snapshotJson };
    },
    write(key, record) {
      writeAtomically(key, record);
    },
    drop(key) {
      deleteRow.run(key.face, key.accountId, key.workspaceId);
    },
  };
}

/**
 * Shape guards for the two cached faces.
 *
 * A snapshot that survives a schema change (or lands corrupted) must degrade to
 * a real fetch rather than being handed to the UI, so parsing is a validation
 * step and not a cast.
 */
export function parseTeamProjectSnapshot(value: unknown): TeamProject[] | null {
  if (!Array.isArray(value)) return null;
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const project = entry as Record<string, unknown>;
    if (
      typeof project.projectId !== 'string' ||
      typeof project.ownerMemberId !== 'string' ||
      typeof project.sharedAt !== 'string'
    ) {
      return null;
    }
  }
  return value as TeamProject[];
}

export function parseMemberDirectorySnapshot(
  value: unknown,
): CollabCloudMemberDirectoryEntry[] | null {
  if (!Array.isArray(value)) return null;
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const member = entry as Record<string, unknown>;
    if (
      typeof member.memberId !== 'string' ||
      typeof member.displayName !== 'string' ||
      typeof member.role !== 'string'
    ) {
      return null;
    }
  }
  return value as CollabCloudMemberDirectoryEntry[];
}
