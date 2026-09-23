import type Database from 'better-sqlite3';
import type { CommentBackfillState } from '@open-design/contracts';
import type { PublicFilePublicationRevision, PublicFilePublicationScope } from './public-file-publication-store.js';

type SqliteDb = Database.Database;
type BackfillOutcome = 'delivered' | 'discarded' | 'deferred';

export interface PublishedCommentBackfillSubject {
  projectId: string;
  workspaceId: string;
  workspaceMemberId: string;
  /** A project-wide question has no safe backfill answer. */
  filePath?: string;
}

export interface RecordPublishedCommentBackfillInput {
  scope: PublicFilePublicationScope;
  publicationRevision: PublicFilePublicationRevision;
  /** Exact ids present at publication time; later comments cannot satisfy this batch. */
  commentIds: readonly string[];
}

export interface PublishedCommentBackfillOutboxRecord {
  workspaceId: string;
  workspaceMemberId: string;
  projectId: string;
  commentId: string;
  comment: { filePath: string };
  publication?: { slug: string; token: string; publicFilePath: string };
}

/** Durable outcome schema, intentionally separate from generic relay retry state. */
export function migratePublishedCommentBackfillState(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS published_comment_backfill_batches (
      workspace_id TEXT NOT NULL,
      workspace_member_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      publication_revision TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('pending', 'succeeded', 'failed')),
      retryable INTEGER NOT NULL CHECK (retryable IN (0, 1)),
      code TEXT,
      PRIMARY KEY (workspace_id, workspace_member_id, project_id, file_path, publication_revision)
    );
    CREATE TABLE IF NOT EXISTS published_comment_backfill_members (
      workspace_id TEXT NOT NULL,
      workspace_member_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      publication_revision TEXT NOT NULL,
      comment_id TEXT NOT NULL,
      delivered INTEGER NOT NULL DEFAULT 0 CHECK (delivered IN (0, 1)),
      PRIMARY KEY (workspace_id, workspace_member_id, project_id, file_path, publication_revision, comment_id)
    );
  `);
}

function currentPublicationMatches(db: SqliteDb, record: PublishedCommentBackfillOutboxRecord): boolean {
  const publication = record.publication;
  if (!publication || !record.comment.filePath) return false;
  return Boolean(db.prepare(`SELECT 1 FROM public_file_publications
    WHERE resource_team_id = ? AND owner_member_id = ? AND project_id = ? AND file_path = ?
      AND slug = ? AND revision = ?`).get(
    record.workspaceId, record.workspaceMemberId, record.projectId, record.comment.filePath,
    publication.slug, publication.token,
  ));
}

function batchValues(record: PublishedCommentBackfillOutboxRecord): [string, string, string, string, string] | null {
  const publication = record.publication;
  if (!publication || !record.comment.filePath) return null;
  return [record.workspaceId, record.workspaceMemberId, record.projectId, record.comment.filePath, publication.token];
}

/**
 * Captures one publish's initial eligible comment set inside its publication transaction.
 * Empty batches are completed work, rather than an absent/not-run state.
 */
export function recordPublishedCommentBackfill(db: SqliteDb, input: RecordPublishedCommentBackfillInput): void {
  if (!db.inTransaction) throw new Error('Published comment backfill requires the publication transaction');
  migratePublishedCommentBackfillState(db);
  const { scope, publicationRevision } = input;
  if (!publicationRevision.token) throw new Error('Published comment backfill requires a publication revision');
  const commentIds = [...new Set(input.commentIds)];
  const inserted = db.prepare(`INSERT INTO published_comment_backfill_batches
    (workspace_id, workspace_member_id, project_id, file_path, publication_revision, state, retryable, code)
    VALUES (?, ?, ?, ?, ?, ?, 0, NULL)
    ON CONFLICT(workspace_id, workspace_member_id, project_id, file_path, publication_revision)
    DO NOTHING`).run(
    scope.resourceTeamId, scope.ownerMemberId, scope.projectId, scope.filePath, publicationRevision.token,
    commentIds.length === 0 ? 'succeeded' : 'pending',
  );
  if (!inserted.changes) return;
  const insertMember = db.prepare(`INSERT OR IGNORE INTO published_comment_backfill_members
    (workspace_id, workspace_member_id, project_id, file_path, publication_revision, comment_id)
    VALUES (?, ?, ?, ?, ?, ?)`);
  for (const commentId of commentIds) {
    insertMember.run(scope.resourceTeamId, scope.ownerMemberId, scope.projectId, scope.filePath, publicationRevision.token, commentId);
  }
}

/**
 * Applies an outcome only to a still-current publication and one of its initial
 * members. It deliberately does not infer delivery from queue deletion.
 */
export function markPublishedCommentBackfillOutcome(
  db: SqliteDb,
  record: PublishedCommentBackfillOutboxRecord,
  outcome: BackfillOutcome,
): void {
  const values = batchValues(record);
  if (!values || !currentPublicationMatches(db, record)) return;
  migratePublishedCommentBackfillState(db);
  const [workspaceId, workspaceMemberId, projectId, filePath, revision] = values;
  const member = db.prepare(`SELECT delivered FROM published_comment_backfill_members
    WHERE workspace_id=? AND workspace_member_id=? AND project_id=? AND file_path=?
      AND publication_revision=? AND comment_id=?`).get(
    workspaceId, workspaceMemberId, projectId, filePath, revision, record.commentId,
  ) as { delivered: number } | undefined;
  if (!member || member.delivered === 1) return;
  if (outcome === 'delivered') {
    db.prepare(`UPDATE published_comment_backfill_members SET delivered=1
      WHERE workspace_id=? AND workspace_member_id=? AND project_id=? AND file_path=?
        AND publication_revision=? AND comment_id=?`).run(
      workspaceId, workspaceMemberId, projectId, filePath, revision, record.commentId,
    );
    const pending = db.prepare(`SELECT 1 FROM published_comment_backfill_members
      WHERE workspace_id=? AND workspace_member_id=? AND project_id=? AND file_path=?
        AND publication_revision=? AND delivered=0 LIMIT 1`).get(...values);
    if (!pending) db.prepare(`UPDATE published_comment_backfill_batches
      SET state='succeeded', retryable=0, code=NULL
      WHERE workspace_id=? AND workspace_member_id=? AND project_id=? AND file_path=? AND publication_revision=?`).run(...values);
    return;
  }
  const retryable = outcome === 'deferred' ? 1 : 0;
  const code = outcome === 'deferred' ? 'BACKFILL_DELIVERY_DEFERRED' : 'BACKFILL_DELIVERY_DISCARDED';
  db.prepare(`UPDATE published_comment_backfill_batches SET state='failed', retryable=?, code=?
    WHERE workspace_id=? AND workspace_member_id=? AND project_id=? AND file_path=? AND publication_revision=?
      AND NOT (state='failed' AND retryable=0 AND ?=1)`).run(
    retryable, code, ...values, retryable,
  );
}

/** Returns a result only for the caller's exact, still-current published file. */
export function readPublishedCommentBackfill(
  db: SqliteDb,
  subject: PublishedCommentBackfillSubject,
): CommentBackfillState | undefined {
  if (!subject.filePath) return undefined;
  migratePublishedCommentBackfillState(db);
  const current = db.prepare(`SELECT revision FROM public_file_publications
    WHERE resource_team_id=? AND owner_member_id=? AND project_id=? AND file_path=?`).get(
    subject.workspaceId, subject.workspaceMemberId, subject.projectId, subject.filePath,
  ) as { revision?: unknown } | undefined;
  if (!current || typeof current.revision !== 'string' || !current.revision) return undefined;
  const row = db.prepare(`SELECT state, retryable, code FROM published_comment_backfill_batches
    WHERE workspace_id=? AND workspace_member_id=? AND project_id=? AND file_path=? AND publication_revision=?`).get(
    subject.workspaceId, subject.workspaceMemberId, subject.projectId, subject.filePath, current.revision,
  ) as { state?: unknown; retryable?: unknown; code?: unknown } | undefined;
  if (!row || (row.state !== 'pending' && row.state !== 'succeeded' && row.state !== 'failed')) return undefined;
  const result: CommentBackfillState = {
    state: row.state,
    filePath: subject.filePath,
    publicationRevision: current.revision,
    retryable: row.retryable === 1,
  };
  return typeof row.code === 'string' && row.code ? { ...result, code: row.code } : result;
}
