// SQLite persistence for the chat-artifact versioning tables.
//
// Migration contract: ADDITIVE ONLY and RE-RUNNABLE. Every statement is
// `CREATE … IF NOT EXISTS`, every later column addition is guarded by a
// `PRAGMA table_info` probe, and nothing here rewrites `produced_files_json`.
// Running `migrateChatArtifacts` twice over the same file must be a no-op.

import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

import type {
  ChatArtifactDisplayPolicy,
  ChatArtifactFailureCode,
  ChatArtifactSnapshotState,
} from './types.js';

type SqliteDb = Database.Database;

export interface WorkspaceArtifactRow {
  id: string;
  projectId: string;
  currentPath: string | null;
  kind: string;
  mime: string | null;
  currentDigest: string | null;
  currentSize: number | null;
  currentMtime: number | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface ChatArtifactSnapshotRow {
  id: string;
  projectId: string;
  workspaceArtifactId: string | null;
  sourcePathAtCapture: string;
  kind: string;
  mime: string | null;
  contentDigest: string | null;
  thumbnailDigest: string | null;
  sourceSize: number | null;
  sourceMtime: number | null;
  expectedSize: number | null;
  expectedMtime: number | null;
  expectedDigest: string | null;
  tempKey: string | null;
  runId: string | null;
  mediaTaskId: string | null;
  captureState: ChatArtifactSnapshotState;
  failureCode: string | null;
  createdAt: number;
  readyAt: number | null;
}

export interface MessageArtifactRow {
  id: string;
  messageId: string;
  ordinal: number;
  snapshotId: string | null;
  workspaceArtifactId: string | null;
  displayPolicy: ChatArtifactDisplayPolicy;
  labelAtCapture: string;
  kind: string;
  htmlVersionId: string | null;
  createdAt: number;
}

export interface ChatArtifactBlobRow {
  digest: string;
  storageKey: string;
  byteSize: number;
  mime: string | null;
  createdAt: number;
  lastVerifiedAt: number | null;
}

const WORKSPACE_ARTIFACT_COLS = `
  id,
  project_id AS projectId,
  current_path AS currentPath,
  kind,
  mime,
  current_digest AS currentDigest,
  current_size AS currentSize,
  current_mtime AS currentMtime,
  created_at AS createdAt,
  updated_at AS updatedAt,
  deleted_at AS deletedAt
`;

const SNAPSHOT_COLS = `
  id,
  project_id AS projectId,
  workspace_artifact_id AS workspaceArtifactId,
  source_path_at_capture AS sourcePathAtCapture,
  kind,
  mime,
  content_digest AS contentDigest,
  thumbnail_digest AS thumbnailDigest,
  source_size AS sourceSize,
  source_mtime AS sourceMtime,
  expected_size AS expectedSize,
  expected_mtime AS expectedMtime,
  expected_digest AS expectedDigest,
  temp_key AS tempKey,
  run_id AS runId,
  media_task_id AS mediaTaskId,
  capture_state AS captureState,
  failure_code AS failureCode,
  created_at AS createdAt,
  ready_at AS readyAt
`;

const MESSAGE_ARTIFACT_COLS = `
  id,
  message_id AS messageId,
  ordinal,
  snapshot_id AS snapshotId,
  workspace_artifact_id AS workspaceArtifactId,
  display_policy AS displayPolicy,
  label_at_capture AS labelAtCapture,
  kind,
  html_version_id AS htmlVersionId,
  created_at AS createdAt
`;

const BLOB_COLS = `
  digest,
  storage_key AS storageKey,
  byte_size AS byteSize,
  mime,
  created_at AS createdAt,
  last_verified_at AS lastVerifiedAt
`;

export function migrateChatArtifacts(db: SqliteDb): void {
  db.exec(`
    -- Mutable "what is in Design Files right now" identity. Path is NOT the
    -- identity: overwrite only moves the digest, rename only moves the path,
    -- and delete leaves a tombstone rather than freeing the id for reuse.
    CREATE TABLE IF NOT EXISTS workspace_artifacts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      current_path TEXT,
      kind TEXT NOT NULL,
      mime TEXT,
      current_digest TEXT,
      current_size INTEGER,
      current_mtime INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- At most one LIVE identity per (project, path). Tombstoned rows drop out
    -- of the index, so a new file written at a deleted path gets a fresh
    -- identity instead of silently resurrecting the deleted one.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_artifacts_live_path
      ON workspace_artifacts(project_id, current_path)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_workspace_artifacts_project
      ON workspace_artifacts(project_id, updated_at DESC);

    -- Content-addressed blob index. storage_key is a daemon-internal
    -- RELATIVE key under the snapshot root; it is never returned over HTTP and
    -- never accepted from a caller.
    CREATE TABLE IF NOT EXISTS chat_artifact_blobs (
      digest TEXT PRIMARY KEY,
      storage_key TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      mime TEXT,
      created_at INTEGER NOT NULL,
      last_verified_at INTEGER
    );

    -- Immutable message evidence. One row per capture attempt, including the
    -- ones that failed: a refusal is data, not an absence.
    CREATE TABLE IF NOT EXISTS chat_artifact_snapshots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      workspace_artifact_id TEXT,
      source_path_at_capture TEXT NOT NULL,
      kind TEXT NOT NULL,
      mime TEXT,
      content_digest TEXT,
      thumbnail_digest TEXT,
      source_size INTEGER,
      source_mtime INTEGER,
      expected_size INTEGER,
      expected_mtime INTEGER,
      expected_digest TEXT,
      temp_key TEXT,
      run_id TEXT,
      media_task_id TEXT,
      capture_state TEXT NOT NULL CHECK (capture_state IN
        ('pending','ready','failed','orphaned')),
      failure_code TEXT,
      created_at INTEGER NOT NULL,
      ready_at INTEGER,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(workspace_artifact_id)
        REFERENCES workspace_artifacts(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_artifact_snapshots_project
      ON chat_artifact_snapshots(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_artifact_snapshots_state
      ON chat_artifact_snapshots(capture_state, created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_artifact_snapshots_content
      ON chat_artifact_snapshots(content_digest);
    CREATE INDEX IF NOT EXISTS idx_chat_artifact_snapshots_thumbnail
      ON chat_artifact_snapshots(thumbnail_digest);

    -- The join that gives a chat message its cards. Cascades with the message,
    -- which is also what makes conversation delete / project delete / fork work
    -- without a bespoke cleanup pass.
    CREATE TABLE IF NOT EXISTS message_artifacts (
      message_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      id TEXT NOT NULL UNIQUE,
      snapshot_id TEXT,
      workspace_artifact_id TEXT,
      display_policy TEXT NOT NULL CHECK (display_policy IN
        ('latest_with_static_preview','immutable_snapshot')),
      -- No open_policy column, on purpose: every card opens the workspace's
      -- latest file, so workspace_artifact_id above IS the click target.
      -- See policy.ts for the ruling.
      label_at_capture TEXT NOT NULL,
      kind TEXT NOT NULL,
      html_version_id TEXT,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (message_id, ordinal),
      FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY(snapshot_id)
        REFERENCES chat_artifact_snapshots(id) ON DELETE SET NULL,
      FOREIGN KEY(workspace_artifact_id)
        REFERENCES workspace_artifacts(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_message_artifacts_snapshot
      ON message_artifacts(snapshot_id);
  `);
  dropLegacyOpenPolicyColumn(db);
}

/**
 * Rebuild `message_artifacts` without `open_policy`.
 *
 * The column was `NOT NULL` with a CHECK constraint, so a database created by
 * an earlier build of this (unreleased) subsystem would reject every insert the
 * current code makes, and SQLite refuses `DROP COLUMN` on a column a CHECK
 * mentions. The rows themselves are still good — only the column is gone — so
 * this copies them across rather than dropping the table.
 */
function dropLegacyOpenPolicyColumn(db: SqliteDb): void {
  const columns = db
    .prepare(`SELECT name FROM pragma_table_info('message_artifacts')`)
    .all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'open_policy')) return;
  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;
    CREATE TABLE message_artifacts__rebuild (
      message_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      id TEXT NOT NULL UNIQUE,
      snapshot_id TEXT,
      workspace_artifact_id TEXT,
      display_policy TEXT NOT NULL CHECK (display_policy IN
        ('latest_with_static_preview','immutable_snapshot')),
      label_at_capture TEXT NOT NULL,
      kind TEXT NOT NULL,
      html_version_id TEXT,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (message_id, ordinal),
      FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY(snapshot_id)
        REFERENCES chat_artifact_snapshots(id) ON DELETE SET NULL,
      FOREIGN KEY(workspace_artifact_id)
        REFERENCES workspace_artifacts(id) ON DELETE SET NULL
    );
    INSERT INTO message_artifacts__rebuild
      (message_id, ordinal, id, snapshot_id, workspace_artifact_id,
       display_policy, label_at_capture, kind, html_version_id, created_at)
      SELECT message_id, ordinal, id, snapshot_id, workspace_artifact_id,
             display_policy, label_at_capture, kind, html_version_id, created_at
        FROM message_artifacts;
    DROP TABLE message_artifacts;
    ALTER TABLE message_artifacts__rebuild RENAME TO message_artifacts;
    CREATE INDEX IF NOT EXISTS idx_message_artifacts_snapshot
      ON message_artifacts(snapshot_id);
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

// ---------------------------------------------------------------------------
// workspace_artifacts
// ---------------------------------------------------------------------------

export interface EnsureWorkspaceArtifactInput {
  projectId: string;
  /** Project-relative, forward-slash path. */
  path: string;
  kind: string;
  mime?: string | null;
  digest?: string | null;
  size?: number | null;
  mtime?: number | null;
  now?: number;
}

/**
 * Resolve the live identity for a project path, creating it on first sight.
 *
 * Overwrite semantics live here: a second call for the same path returns the
 * SAME id and only advances digest/size/mtime. That is what keeps a later
 * `hero.png` from stealing an earlier message's history.
 */
export function ensureWorkspaceArtifactForPath(
  db: SqliteDb,
  input: EnsureWorkspaceArtifactInput,
): WorkspaceArtifactRow {
  const now = input.now ?? Date.now();
  const existing = db
    .prepare(
      `SELECT ${WORKSPACE_ARTIFACT_COLS} FROM workspace_artifacts
        WHERE project_id = ? AND current_path = ? AND deleted_at IS NULL`,
    )
    .get(input.projectId, input.path) as WorkspaceArtifactRow | undefined;
  if (existing) {
    db.prepare(
      `UPDATE workspace_artifacts
          SET kind = ?, mime = COALESCE(?, mime),
              current_digest = COALESCE(?, current_digest),
              current_size = COALESCE(?, current_size),
              current_mtime = COALESCE(?, current_mtime),
              updated_at = ?
        WHERE id = ?`,
    ).run(
      input.kind,
      input.mime ?? null,
      input.digest ?? null,
      input.size ?? null,
      input.mtime ?? null,
      now,
      existing.id,
    );
    const refreshed = getWorkspaceArtifact(db, existing.id);
    if (!refreshed) throw new Error('workspace artifact vanished after update');
    return refreshed;
  }
  const id = randomUUID();
  db.prepare(
    `INSERT INTO workspace_artifacts
       (id, project_id, current_path, kind, mime, current_digest,
        current_size, current_mtime, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  ).run(
    id,
    input.projectId,
    input.path,
    input.kind,
    input.mime ?? null,
    input.digest ?? null,
    input.size ?? null,
    input.mtime ?? null,
    now,
    now,
  );
  const created = getWorkspaceArtifact(db, id);
  if (!created) throw new Error('workspace artifact vanished after insert');
  return created;
}

export function getWorkspaceArtifact(
  db: SqliteDb,
  id: string,
): WorkspaceArtifactRow | null {
  const row = db
    .prepare(`SELECT ${WORKSPACE_ARTIFACT_COLS} FROM workspace_artifacts WHERE id = ?`)
    .get(id) as WorkspaceArtifactRow | undefined;
  return row ?? null;
}

export function getLiveWorkspaceArtifactByPath(
  db: SqliteDb,
  projectId: string,
  filePath: string,
): WorkspaceArtifactRow | null {
  const row = db
    .prepare(
      `SELECT ${WORKSPACE_ARTIFACT_COLS} FROM workspace_artifacts
        WHERE project_id = ? AND current_path = ? AND deleted_at IS NULL`,
    )
    .get(projectId, filePath) as WorkspaceArtifactRow | undefined;
  return row ?? null;
}

/**
 * Follow a rename. The identity survives; `source_path_at_capture` on old
 * snapshots deliberately does not move — it records where the bytes came from
 * at the time, which is history, not a lookup key.
 */
export function renameWorkspaceArtifactPath(
  db: SqliteDb,
  projectId: string,
  fromPath: string,
  toPath: string,
  now = Date.now(),
): WorkspaceArtifactRow | null {
  const existing = getLiveWorkspaceArtifactByPath(db, projectId, fromPath);
  if (!existing) return null;
  // A live identity may already sit on the destination (the rename overwrote
  // it). Tombstone that one first so the partial unique index stays satisfiable.
  const collision = getLiveWorkspaceArtifactByPath(db, projectId, toPath);
  if (collision && collision.id !== existing.id) {
    tombstoneWorkspaceArtifactRow(db, collision.id, now);
  }
  db.prepare(
    `UPDATE workspace_artifacts SET current_path = ?, updated_at = ? WHERE id = ?`,
  ).run(toPath, now, existing.id);
  return getWorkspaceArtifact(db, existing.id);
}

/**
 * Tombstone the live identity at a path. The row is kept so historical cards
 * can say "the current file was deleted" instead of quietly opening whatever
 * later takes the name.
 */
export function deleteWorkspaceArtifact(
  db: SqliteDb,
  projectId: string,
  filePath: string,
  now = Date.now(),
): WorkspaceArtifactRow | null {
  const existing = getLiveWorkspaceArtifactByPath(db, projectId, filePath);
  if (!existing) return null;
  tombstoneWorkspaceArtifactRow(db, existing.id, now);
  return getWorkspaceArtifact(db, existing.id);
}

function tombstoneWorkspaceArtifactRow(db: SqliteDb, id: string, now: number): void {
  db.prepare(
    `UPDATE workspace_artifacts
        SET current_path = NULL, deleted_at = ?, updated_at = ?
      WHERE id = ?`,
  ).run(now, now, id);
}

// ---------------------------------------------------------------------------
// chat_artifact_blobs
// ---------------------------------------------------------------------------

export function getChatArtifactBlob(
  db: SqliteDb,
  digest: string,
): ChatArtifactBlobRow | null {
  const row = db
    .prepare(`SELECT ${BLOB_COLS} FROM chat_artifact_blobs WHERE digest = ?`)
    .get(digest) as ChatArtifactBlobRow | undefined;
  return row ?? null;
}

export function upsertChatArtifactBlob(
  db: SqliteDb,
  input: {
    digest: string;
    storageKey: string;
    byteSize: number;
    mime?: string | null;
    now?: number;
  },
): void {
  const now = input.now ?? Date.now();
  db.prepare(
    `INSERT INTO chat_artifact_blobs
       (digest, storage_key, byte_size, mime, created_at, last_verified_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(digest) DO UPDATE SET
       storage_key = excluded.storage_key,
       byte_size = excluded.byte_size,
       mime = COALESCE(chat_artifact_blobs.mime, excluded.mime),
       last_verified_at = excluded.last_verified_at`,
  ).run(input.digest, input.storageKey, input.byteSize, input.mime ?? null, now, now);
}

// ---------------------------------------------------------------------------
// chat_artifact_snapshots
// ---------------------------------------------------------------------------

export interface SnapshotIntentInput {
  id: string;
  projectId: string;
  sourcePathAtCapture: string;
  kind: string;
  mime?: string | null;
  workspaceArtifactId?: string | null;
  runId?: string | null;
  mediaTaskId?: string | null;
  expectedSize?: number | null;
  expectedMtime?: number | null;
  expectedDigest?: string | null;
  tempKey: string | null;
  now?: number;
}

/** Phase 1 of the two-phase commit: the durable intent, written before bytes. */
export function insertSnapshotIntent(
  db: SqliteDb,
  input: SnapshotIntentInput,
): ChatArtifactSnapshotRow {
  const now = input.now ?? Date.now();
  db.prepare(
    `INSERT INTO chat_artifact_snapshots
       (id, project_id, workspace_artifact_id, source_path_at_capture, kind, mime,
        content_digest, thumbnail_digest, source_size, source_mtime,
        expected_size, expected_mtime, expected_digest, temp_key,
        run_id, media_task_id, capture_state, failure_code, created_at, ready_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL)`,
  ).run(
    input.id,
    input.projectId,
    input.workspaceArtifactId ?? null,
    input.sourcePathAtCapture,
    input.kind,
    input.mime ?? null,
    input.expectedSize ?? null,
    input.expectedMtime ?? null,
    input.expectedSize ?? null,
    input.expectedMtime ?? null,
    input.expectedDigest ?? null,
    input.tempKey ?? null,
    input.runId ?? null,
    input.mediaTaskId ?? null,
    now,
  );
  const row = getChatArtifactSnapshot(db, input.id);
  if (!row) throw new Error('snapshot intent vanished after insert');
  return row;
}

export function getChatArtifactSnapshot(
  db: SqliteDb,
  id: string,
): ChatArtifactSnapshotRow | null {
  const row = db
    .prepare(`SELECT ${SNAPSHOT_COLS} FROM chat_artifact_snapshots WHERE id = ?`)
    .get(id) as ChatArtifactSnapshotRow | undefined;
  return row ?? null;
}

export interface SnapshotReadyInput {
  id: string;
  contentDigest?: string | null;
  thumbnailDigest?: string | null;
  sourceSize?: number | null;
  sourceMtime?: number | null;
  now?: number;
}

/** Phase 4: flip to ready once the blob is installed and verified. */
export function markSnapshotReady(db: SqliteDb, input: SnapshotReadyInput): void {
  const now = input.now ?? Date.now();
  db.prepare(
    `UPDATE chat_artifact_snapshots
        SET capture_state = 'ready',
            failure_code = NULL,
            content_digest = COALESCE(?, content_digest),
            thumbnail_digest = COALESCE(?, thumbnail_digest),
            source_size = COALESCE(?, source_size),
            source_mtime = COALESCE(?, source_mtime),
            temp_key = NULL,
            ready_at = ?
      WHERE id = ?`,
  ).run(
    input.contentDigest ?? null,
    input.thumbnailDigest ?? null,
    input.sourceSize ?? null,
    input.sourceMtime ?? null,
    now,
    input.id,
  );
}

export function markSnapshotFailed(
  db: SqliteDb,
  id: string,
  failureCode: ChatArtifactFailureCode,
): void {
  db.prepare(
    `UPDATE chat_artifact_snapshots
        SET capture_state = 'failed', failure_code = ?, temp_key = NULL
      WHERE id = ?`,
  ).run(failureCode, id);
}

export function listSnapshotsByState(
  db: SqliteDb,
  state: ChatArtifactSnapshotState,
  limit = 500,
): ChatArtifactSnapshotRow[] {
  return db
    .prepare(
      `SELECT ${SNAPSHOT_COLS} FROM chat_artifact_snapshots
        WHERE capture_state = ?
        ORDER BY created_at ASC
        LIMIT ?`,
    )
    .all(state, limit) as ChatArtifactSnapshotRow[];
}

// ---------------------------------------------------------------------------
// message_artifacts
// ---------------------------------------------------------------------------

export interface MessageArtifactInput {
  id?: string;
  snapshotId?: string | null;
  workspaceArtifactId?: string | null;
  displayPolicy: ChatArtifactDisplayPolicy;
  label: string;
  kind: string;
  htmlVersionId?: string | null;
}

/**
 * Rewrite one message's refs. Called on capture and again when a fork copies a
 * message: the copy gets its OWN ref rows pointing at the SAME immutable
 * snapshot, so neither branch can invalidate the other's history.
 */
export function replaceMessageArtifacts(
  db: SqliteDb,
  messageId: string,
  refs: readonly MessageArtifactInput[],
  now = Date.now(),
): MessageArtifactRow[] {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM message_artifacts WHERE message_id = ?`).run(messageId);
    refs.forEach((ref, ordinal) => {
      db.prepare(
        `INSERT INTO message_artifacts
           (message_id, ordinal, id, snapshot_id, workspace_artifact_id,
            display_policy, label_at_capture, kind,
            html_version_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        messageId,
        ordinal,
        ref.id ?? randomUUID(),
        ref.snapshotId ?? null,
        ref.workspaceArtifactId ?? null,
        ref.displayPolicy,
        ref.label,
        ref.kind,
        ref.htmlVersionId ?? null,
        now,
      );
    });
  });
  tx();
  return listMessageArtifactRows(db, messageId);
}

export function listMessageArtifactRows(
  db: SqliteDb,
  messageId: string,
): MessageArtifactRow[] {
  return db
    .prepare(
      `SELECT ${MESSAGE_ARTIFACT_COLS} FROM message_artifacts
        WHERE message_id = ? ORDER BY ordinal ASC`,
    )
    .all(messageId) as MessageArtifactRow[];
}

export function listMessageArtifactRowsForConversation(
  db: SqliteDb,
  conversationId: string,
): Map<string, MessageArtifactRow[]> {
  const rows = db
    .prepare(
      `SELECT ${MESSAGE_ARTIFACT_COLS} FROM message_artifacts
        WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = ?)
        ORDER BY message_id ASC, ordinal ASC`,
    )
    .all(conversationId) as MessageArtifactRow[];
  const grouped = new Map<string, MessageArtifactRow[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.messageId);
    if (bucket) bucket.push(row);
    else grouped.set(row.messageId, [row]);
  }
  return grouped;
}

export function getMessageArtifactRowById(
  db: SqliteDb,
  id: string,
): MessageArtifactRow | null {
  const row = db
    .prepare(`SELECT ${MESSAGE_ARTIFACT_COLS} FROM message_artifacts WHERE id = ?`)
    .get(id) as MessageArtifactRow | undefined;
  return row ?? null;
}

/**
 * Backfill the HTML version store's id onto the refs of one message.
 *
 * Lineage arrives LATE by construction: the refs are written at the terminal
 * chokepoint, and the AI HTML versions are snapshotted right after, so at
 * ref-write time the version does not exist yet. Rather than reorder two
 * independent terminal passes, the second one tells the first what it produced.
 *
 * Only fills rows that have no lineage yet. A ref that already names a version
 * is capture-time evidence and must not be re-pointed at a later one.
 */
export function setMessageArtifactHtmlVersionIds(
  db: SqliteDb,
  messageId: string,
  versionIdByLabel: ReadonlyMap<string, string>,
): number {
  if (versionIdByLabel.size === 0) return 0;
  const update = db.prepare(
    `UPDATE message_artifacts
        SET html_version_id = ?
      WHERE message_id = ? AND label_at_capture = ? AND html_version_id IS NULL`,
  );
  let filled = 0;
  const tx = db.transaction(() => {
    for (const [label, versionId] of versionIdByLabel) {
      if (!label || !versionId) continue;
      filled += update.run(versionId, messageId, label).changes;
    }
  });
  tx();
  return filled;
}
