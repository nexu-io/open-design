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
import { currentCommentRelayPublicationMapping, migrateCommentRelayPublicationMappings } from './comment-relay-publication-mapping.js';
import { markPublishedCommentBackfillOutcome } from './published-comment-backfill-state.js';

type SqliteDb = Database.Database;

export interface CommentRelayOutboxIdentity {
  workspaceId: string;
  workspaceMemberId: string;
  teamId: string;
  /** Internal durable discriminator; existing rows default to team. */
  relayScope: 'team' | 'personal';
}

export interface CommentRelayPublicationWitness {
  slug: string;
  token: string;
  publicFilePath: string;
}

export interface CommentRelayOutboxRecord extends CommentRelayOutboxIdentity {
  projectId: string;
  commentId: string;
  expectedOwnerMemberId: string | null;
  comment: CollabCloudComment;
  publication?: CommentRelayPublicationWitness;
  revision: number;
  attemptCount: number;
  nextAttemptAt: number;
}

export interface CommentRelayOutboxStore {
  enqueue(input: CommentRelayOutboxIdentity & {
    projectId: string;
    expectedOwnerMemberId: string | null;
    comment: CollabCloudComment;
    publication?: CommentRelayPublicationWitness;
  }): void;
  isPublicationCurrent?(record: CommentRelayOutboxRecord): boolean;
  listDue(now: number, limit?: number): CommentRelayOutboxRecord[];
  /** Default acknowledgement is discard/cancel; only an explicit receipt is delivery. */
  acknowledge(record: CommentRelayOutboxRecord, outcome?: 'delivered' | 'discarded'): boolean;
  defer(record: CommentRelayOutboxRecord, input: {
    nextAttemptAt: number;
    error: string;
  }): boolean;
  count(): number;
}

export interface PersonalCommentRelayPublicationScope {
  resourceTeamId: string;
  ownerMemberId: string;
  projectId: string;
  filePath: string;
}

/**
 * Cancel only durable personal-relay records whose persisted publication scope
 * was authoritatively stopped. This is intentionally not part of enqueue or
 * ordinary publication updates: a stop is the one lifecycle transition that
 * invalidates revisions already waiting in SQLite.
 */
export function cancelPersonalCommentRelayOutbox(
  db: SqliteDb,
  scope: PersonalCommentRelayPublicationScope,
): void {
  db.prepare(`DELETE FROM comment_relay_outbox
    WHERE workspace_id = ?
      AND workspace_member_id = ?
      AND team_id = ?
      AND relay_scope = 'personal'
      AND project_id = ?
      AND file_path = ?`).run(
    scope.resourceTeamId,
    scope.ownerMemberId,
    scope.resourceTeamId,
    scope.projectId,
    scope.filePath,
  );
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
    || (record.relayScope === 'team' ? binding.visibility !== 'team' : binding.visibility !== 'personal')
    || binding.resourceState === 'deleted'
  ) return false;
  const currentOwnerMemberId = binding.createdByWorkspaceMemberId?.trim() || null;
  return currentOwnerMemberId === record.expectedOwnerMemberId;
}

export function migrateCommentRelayOutbox(db: SqliteDb): void {
  migrateCommentRelayPublicationMappings(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS comment_relay_outbox (
      workspace_id TEXT NOT NULL,
      workspace_member_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      relay_scope TEXT NOT NULL DEFAULT 'team',
      project_id TEXT NOT NULL,
      file_path TEXT NOT NULL DEFAULT '',
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

    CREATE TABLE IF NOT EXISTS comment_relay_sync_failures (
      workspace_id TEXT NOT NULL,
      workspace_member_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      failed_at INTEGER NOT NULL,
      PRIMARY KEY (workspace_id, workspace_member_id, project_id)
    );

    CREATE INDEX IF NOT EXISTS idx_comment_relay_outbox_due
      ON comment_relay_outbox(next_attempt_at, updated_at);
  `);
  const columns = db.prepare('PRAGMA table_info(comment_relay_outbox)').all() as Array<{ name: string }>;
  if (!columns.some(column => column.name === 'publication_json')) {
    db.exec('ALTER TABLE comment_relay_outbox ADD COLUMN publication_json TEXT');
  }
  // Compatible with rows written before personal publication relay existed.
  try { db.exec("ALTER TABLE comment_relay_outbox ADD COLUMN relay_scope TEXT NOT NULL DEFAULT 'team'"); } catch { /* already migrated */ }
  try { db.exec("ALTER TABLE comment_relay_outbox ADD COLUMN file_path TEXT NOT NULL DEFAULT ''"); } catch { /* already migrated */ }
  // Personal rows predate the explicit exact-file cancellation key. Backfill
  // from the durable payload once; malformed legacy JSON stays uncancelled and
  // remains protected by the existing delivery-time eligibility gate.
  db.exec(`UPDATE comment_relay_outbox
    SET file_path = COALESCE(json_extract(payload_json, '$.filePath'), file_path)
    WHERE relay_scope = 'personal' AND file_path = '' AND json_valid(payload_json)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_comment_relay_outbox_personal_publication
    ON comment_relay_outbox(
      workspace_id, workspace_member_id, team_id, relay_scope, project_id, file_path
    )`);
}

function parsePublicationWitness(value: unknown): CommentRelayPublicationWitness {
  if (!value || typeof value !== 'object'
    || !('slug' in value) || typeof value.slug !== 'string' || !value.slug
    || !('token' in value) || typeof value.token !== 'string' || !value.token
    || !('publicFilePath' in value) || typeof value.publicFilePath !== 'string' || !value.publicFilePath) {
    throw new Error('Invalid publication relay witness');
  }
  return { slug: value.slug, token: value.token, publicFilePath: value.publicFilePath };
}

function parseRecord(row: Record<string, unknown>): CommentRelayOutboxRecord | null {
  try {
    const comment = JSON.parse(String(row.payloadJson ?? '')) as unknown;
    if (!comment || typeof comment !== 'object' || Array.isArray(comment)) return null;
    if (
      typeof row.workspaceId !== 'string'
      || typeof row.workspaceMemberId !== 'string'
      || typeof row.teamId !== 'string'
      || (row.relayScope !== 'team' && row.relayScope !== 'personal')
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
      relayScope: row.relayScope,
      projectId: row.projectId,
      commentId: row.commentId,
      expectedOwnerMemberId: row.expectedOwnerMemberId as string | null,
      comment: comment as CollabCloudComment,
      ...(row.publicationJson == null ? {} : { publication: parsePublicationWitness(JSON.parse(String(row.publicationJson))) }),
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
      (workspace_id, workspace_member_id, team_id, relay_scope, project_id, file_path, comment_id,
       expected_owner_member_id,
       payload_json, publication_json, revision, attempt_count, next_attempt_at, last_error,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, NULL, ?, ?)
    ON CONFLICT(workspace_id, workspace_member_id, project_id, comment_id)
    DO UPDATE SET
      team_id = excluded.team_id,
      relay_scope = excluded.relay_scope,
      expected_owner_member_id = excluded.expected_owner_member_id,
      file_path = excluded.file_path,
      payload_json = excluded.payload_json,
      publication_json = excluded.publication_json,
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
           relay_scope AS relayScope,
           project_id AS projectId,
           comment_id AS commentId,
           expected_owner_member_id AS expectedOwnerMemberId,
           payload_json AS payloadJson,
           publication_json AS publicationJson,
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
      const publication = input.publication ?? currentCommentRelayPublicationMapping(db, {
        resourceTeamId: input.teamId, ownerMemberId: input.workspaceMemberId,
        projectId: input.projectId, filePath: input.comment.filePath,
      });
      enqueueRow.run(
        input.workspaceId,
        input.workspaceMemberId,
        input.teamId,
        input.relayScope,
        input.projectId,
        input.comment.filePath,
        input.comment.id,
        input.expectedOwnerMemberId,
        JSON.stringify(input.comment),
        publication ? JSON.stringify(publication) : null,
        timestamp,
        timestamp,
        timestamp,
      );
    },
    isPublicationCurrent(record) {
      if (!record.publication) return true;
      return Boolean(db.prepare(`SELECT 1 FROM public_file_publications
        WHERE resource_team_id = ? AND owner_member_id = ? AND project_id = ?
          AND file_path = ? AND slug = ? AND revision = ?`).get(
        record.teamId, record.workspaceMemberId, record.projectId, record.comment.filePath,
        record.publication.slug, record.publication.token,
      ));
    },
    listDue(timestamp, limit = 64) {
      return (listDueRows.all(timestamp, Math.max(1, Math.round(limit))) as Record<string, unknown>[])
        .map(parseRecord)
        .filter((record): record is CommentRelayOutboxRecord => record !== null);
    },
    acknowledge(record, outcome = 'discarded') {
      return db.transaction(() => {
        const changed = acknowledgeRow.run(
          record.workspaceId,
          record.workspaceMemberId,
          record.projectId,
          record.commentId,
          record.revision,
        ).changes > 0;
        // Revision-conditional deletion is the race fence: an older in-flight
        // acknowledgement cannot affect an overwritten queue row or its batch.
        if (changed) markPublishedCommentBackfillOutcome(db, record, outcome);
        return changed;
      })();
    },
    defer(record, input) {
      return db.transaction(() => {
        const changed = deferRow.run(
          input.nextAttemptAt,
          input.error,
          now(),
          record.workspaceId,
          record.workspaceMemberId,
          record.projectId,
          record.commentId,
          record.revision,
        ).changes > 0;
        if (changed) markPublishedCommentBackfillOutcome(db, record, 'deferred');
        if (changed) db.prepare(`INSERT INTO comment_relay_sync_failures(workspace_id, workspace_member_id, project_id, failed_at)
          VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id, workspace_member_id, project_id)
          DO UPDATE SET failed_at=excluded.failed_at`).run(record.workspaceId, record.workspaceMemberId, record.projectId, now());
        return changed;
      })();
    },
    count() {
      return Number((countRows.get() as { count?: unknown } | undefined)?.count ?? 0);
    },
  };
}
