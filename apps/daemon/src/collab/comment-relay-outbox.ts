// Durable delivery queue for Team comment relay writes.
//
// Comment mutations are committed to the daemon's SQLite database before the
// remote relay is contacted. Keeping the outbound snapshot in that same
// database makes a transient Vela/network failure (or daemon restart) a retry,
// not a permanently local-only comment. The stored Workspace + member identity
// is part of the row key: a later login or Workspace switch can never retarget
// an old delivery to another Team or silently fall back to Personal.

import type Database from 'better-sqlite3';
import type { CollabCloudComment } from '@open-design/contracts';

type SqliteDb = Database.Database;

export interface CommentRelayOutboxIdentity {
  workspaceId: string;
  workspaceMemberId: string;
  teamId: string;
}

export interface CommentRelayOutboxRecord extends CommentRelayOutboxIdentity {
  projectId: string;
  commentId: string;
  expectedOwnerMemberId: string | null;
  comment: CollabCloudComment;
  revision: number;
  attemptCount: number;
  nextAttemptAt: number;
}

export interface CommentRelayOutboxStore {
  enqueue(input: CommentRelayOutboxIdentity & {
    projectId: string;
    expectedOwnerMemberId: string | null;
    comment: CollabCloudComment;
  }): void;
  listDue(now: number, limit?: number): CommentRelayOutboxRecord[];
  acknowledge(record: CommentRelayOutboxRecord): boolean;
  defer(record: CommentRelayOutboxRecord, input: {
    nextAttemptAt: number;
    error: string;
  }): boolean;
  count(): number;
}

export interface CommentRelayLocalProjectBinding {
  workspaceId?: string | null;
  visibility?: string | null;
  resourceState?: string | null;
  createdByWorkspaceMemberId?: string | null;
}

export function commentRelayLocalBindingMatches(
  record: CommentRelayOutboxRecord,
  binding: CommentRelayLocalProjectBinding | null | undefined,
): boolean {
  if (
    binding?.workspaceId?.trim() !== record.workspaceId
    || binding.visibility !== 'team'
    || binding.resourceState === 'deleted'
  ) return false;
  const currentOwnerMemberId = binding.createdByWorkspaceMemberId?.trim() || null;
  return currentOwnerMemberId === record.expectedOwnerMemberId;
}

export function migrateCommentRelayOutbox(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS comment_relay_outbox (
      workspace_id TEXT NOT NULL,
      workspace_member_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      comment_id TEXT NOT NULL,
      expected_owner_member_id TEXT,
      payload_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (workspace_id, workspace_member_id, project_id, comment_id)
    );

    CREATE INDEX IF NOT EXISTS idx_comment_relay_outbox_due
      ON comment_relay_outbox(next_attempt_at, updated_at);
  `);
}

function parseRecord(row: Record<string, unknown>): CommentRelayOutboxRecord | null {
  try {
    const comment = JSON.parse(String(row.payloadJson ?? '')) as unknown;
    if (!comment || typeof comment !== 'object' || Array.isArray(comment)) return null;
    if (
      typeof row.workspaceId !== 'string'
      || typeof row.workspaceMemberId !== 'string'
      || typeof row.teamId !== 'string'
      || typeof row.projectId !== 'string'
      || typeof row.commentId !== 'string'
      || (row.expectedOwnerMemberId !== null && typeof row.expectedOwnerMemberId !== 'string')
    ) {
      return null;
    }
    return {
      workspaceId: row.workspaceId,
      workspaceMemberId: row.workspaceMemberId,
      teamId: row.teamId,
      projectId: row.projectId,
      commentId: row.commentId,
      expectedOwnerMemberId: row.expectedOwnerMemberId as string | null,
      comment: comment as CollabCloudComment,
      revision: Number(row.revision),
      attemptCount: Number(row.attemptCount),
      nextAttemptAt: Number(row.nextAttemptAt),
    };
  } catch {
    return null;
  }
}

export function createCommentRelayOutboxStore(
  db: SqliteDb,
  now: () => number = Date.now,
): CommentRelayOutboxStore {
  const enqueueRow = db.prepare(`
    INSERT INTO comment_relay_outbox
      (workspace_id, workspace_member_id, team_id, project_id, comment_id,
       expected_owner_member_id,
       payload_json, revision, attempt_count, next_attempt_at, last_error,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, NULL, ?, ?)
    ON CONFLICT(workspace_id, workspace_member_id, project_id, comment_id)
    DO UPDATE SET
      team_id = excluded.team_id,
      expected_owner_member_id = excluded.expected_owner_member_id,
      payload_json = excluded.payload_json,
      revision = comment_relay_outbox.revision + 1,
      attempt_count = 0,
      next_attempt_at = excluded.next_attempt_at,
      last_error = NULL,
      updated_at = excluded.updated_at
  `);
  const listDueRows = db.prepare(`
    SELECT workspace_id AS workspaceId,
           workspace_member_id AS workspaceMemberId,
           team_id AS teamId,
           project_id AS projectId,
           comment_id AS commentId,
           expected_owner_member_id AS expectedOwnerMemberId,
           payload_json AS payloadJson,
           revision,
           attempt_count AS attemptCount,
           next_attempt_at AS nextAttemptAt
      FROM comment_relay_outbox
     WHERE next_attempt_at <= ?
     ORDER BY next_attempt_at ASC, updated_at ASC
     LIMIT ?
  `);
  const acknowledgeRow = db.prepare(`
    DELETE FROM comment_relay_outbox
     WHERE workspace_id = ?
       AND workspace_member_id = ?
       AND project_id = ?
       AND comment_id = ?
       AND revision = ?
  `);
  const deferRow = db.prepare(`
    UPDATE comment_relay_outbox
       SET attempt_count = attempt_count + 1,
           next_attempt_at = ?,
           last_error = ?,
           updated_at = ?
     WHERE workspace_id = ?
       AND workspace_member_id = ?
       AND project_id = ?
       AND comment_id = ?
       AND revision = ?
  `);
  const countRows = db.prepare(`SELECT COUNT(*) AS count FROM comment_relay_outbox`);

  return {
    enqueue(input) {
      const timestamp = now();
      enqueueRow.run(
        input.workspaceId,
        input.workspaceMemberId,
        input.teamId,
        input.projectId,
        input.comment.id,
        input.expectedOwnerMemberId,
        JSON.stringify(input.comment),
        timestamp,
        timestamp,
        timestamp,
      );
    },
    listDue(timestamp, limit = 64) {
      return (listDueRows.all(timestamp, Math.max(1, Math.round(limit))) as Record<string, unknown>[])
        .map(parseRecord)
        .filter((record): record is CommentRelayOutboxRecord => record !== null);
    },
    acknowledge(record) {
      return acknowledgeRow.run(
        record.workspaceId,
        record.workspaceMemberId,
        record.projectId,
        record.commentId,
        record.revision,
      ).changes > 0;
    },
    defer(record, input) {
      return deferRow.run(
        input.nextAttemptAt,
        input.error,
        now(),
        record.workspaceId,
        record.workspaceMemberId,
        record.projectId,
        record.commentId,
        record.revision,
      ).changes > 0;
    },
    count() {
      return Number((countRows.get() as { count?: unknown } | undefined)?.count ?? 0);
    },
  };
}
