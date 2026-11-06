// Durable cursor + atomic page commit for C3-LITE member comment pages.
//
// One row per (workspace, member, team, project) scope records where the next
// page request starts. A page is applied in ONE immediate SQLite transaction:
// every comment merge, every tombstone delete and the cursor advance commit
// together or not at all. A crash, a throwing merge or a lost CAS therefore
// leaves the cursor on the last page that fully landed, and the next drain
// re-requests exactly the page that did not.
//
// The cursor is the cloud's stateless token (C3-LITE §1, §6 item 7): the page
// token while a round is open, the resume token once a round is complete.
// Tokens never expire, so persisting them across restarts is the contract.
//
// A page whose scope token no longer matches the stored round is refused with
// `rebuild-required` and the cursor untouched; the caller then `reset`s the
// cursor and drains a fresh snapshot.
//
// Rebuild pruning (BO2). A per-scope ledger records every comment id the member
// stream has delivered to this scope. The first page of a snapshot pass marks
// the whole ledger unseen; each snapshot page marks the ids it carries (merged,
// or skipped as malformed) seen. The terminal snapshot page — in the same
// transaction that hands the cursor off to incremental — deletes the local rows
// whose ids stayed unseen: cloud-origin rows the stream no longer has at the
// snapshot watermark W. Consequences, each deliberate:
// - Nothing is deleted before the snapshot completes, so a rebuild keeps the
//   old rows visible and a crash mid-snapshot deletes nothing.
// - Only ids the member stream delivered can be pruned. A comment written here
//   and never synced, a share-page comment from the legacy pull, and a row
//   another account learned are never in this scope's ledger.
// - A write committed after W is not in the ledger until the incremental
//   handoff delivers it, so a snapshot cannot prune it.
//
// Scope change (account switch, stop sharing) is `forgetProject`: the other
// scopes' cursors and ledgers go, the local comment rows stay as local copies.

import type Database from 'better-sqlite3';
import type { CollabCloudComment } from '@open-design/contracts';
import type {
  CollabCloudMemberPage,
  CollabCloudMemberPageMode,
  CollabCloudMemberPageQuery,
} from '../integrations/collab-cloud.js';

type SqliteDb = Database.Database;

/** The exact team identity a member cursor belongs to. */
export interface MemberSyncScope {
  workspaceId: string;
  memberId: string;
  teamId: string;
  projectId: string;
}

export interface MemberSyncCursor {
  /** Mode of the round the next request continues or starts. */
  phase: CollabCloudMemberPageMode;
  /** Continuation token of an open round; null between rounds. */
  pageToken: string | null;
  /** Persistent resume point after a completed round. */
  resumeToken: string | null;
  streamEpoch: string;
  scopeToken: string;
  watermarkSeq: number;
  /** Cumulative count of malformed items skipped for this scope. */
  skippedCount: number;
}

export type MemberPageMerge = (comment: CollabCloudComment) => 'changed' | 'unchanged';

export type ApplyMemberPageResult =
  | {
    status: 'committed';
    changed: number;
    /** Rows removed by tombstones. */
    deleted: number;
    /** Rows removed at snapshot completion because the snapshot lacked them. */
    pruned: number;
    skipped: number;
    cursor: MemberSyncCursor;
  }
  | { status: 'conflict' }
  | { status: 'rebuild-required'; reason: 'scope-changed' };

export interface CommentInboundStore {
  read(scope: MemberSyncScope): MemberSyncCursor | null;
  apply(input: ApplyMemberPageInput): ApplyMemberPageResult;
  /**
   * Author kind of a stored comment, or null when absent. Lets the legacy pull
   * route an author-less tombstone: a share-page ('user') target is still the
   * legacy pull's to delete; member targets belong to the member page stream.
   */
  storedAuthorKind(projectId: string, commentId: string): 'member' | 'user' | null;
  /**
   * Drop the scope's cursor so the next request is a fresh snapshot. The
   * ledger is kept: that snapshot's completion prunes against it.
   */
  reset(scope: MemberSyncScope): void;
  /**
   * Drop every member-sync cursor and ledger of `projectId` except `keep`'s.
   * Local comment rows are never touched. Returns the cursors removed.
   */
  forgetProject(projectId: string, keep?: MemberSyncScope): number;
}

export interface ApplyMemberPageInput {
  scope: MemberSyncScope;
  /** The query the page answers; must equal the cursor's next query (CAS). */
  query: CollabCloudMemberPageQuery;
  page: CollabCloudMemberPage;
  /**
   * Synchronous, side-effect-free merge of one full comment into
   * preview_comments. It runs inside the page transaction: no notifications,
   * Runs or I/O may happen here, because a later failure rolls the row back.
   */
  merge: MemberPageMerge;
}

const scopeValues = (scope: MemberSyncScope) =>
  [scope.workspaceId, scope.memberId, scope.teamId, scope.projectId] as const;

function assertScope(scope: MemberSyncScope): void {
  if (!scope || !scopeValues(scope).every(value => typeof value === 'string' && value.trim().length > 0)) {
    throw new Error('Member sync scope is incomplete');
  }
}

export function migrateCommentInboundStore(db: SqliteDb): void {
  db.exec(`CREATE TABLE IF NOT EXISTS comment_member_sync_cursor (
    workspace_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    phase TEXT NOT NULL CHECK(phase IN ('snapshot','incremental')),
    page_token TEXT,
    resume_token TEXT,
    stream_epoch TEXT NOT NULL,
    scope_token TEXT NOT NULL,
    watermark_seq INTEGER NOT NULL,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    CHECK((page_token IS NULL) <> (resume_token IS NULL)),
    PRIMARY KEY(workspace_id, member_id, team_id, project_id)
  )`);
  // Ids the member stream delivered to a scope; `seen` is the current snapshot
  // pass's mark (see the header comment).
  db.exec(`CREATE TABLE IF NOT EXISTS comment_member_sync_known (
    workspace_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    comment_id TEXT NOT NULL,
    seen INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY(workspace_id, member_id, team_id, project_id, comment_id)
  )`);
}

const SCOPE_WHERE = 'workspace_id=? AND member_id=? AND team_id=? AND project_id=?';

export function resetMemberSyncCursor(db: SqliteDb, scope: MemberSyncScope): void {
  assertScope(scope);
  db.prepare(`DELETE FROM comment_member_sync_cursor WHERE ${SCOPE_WHERE}`).run(...scopeValues(scope));
}

export function forgetMemberSyncProject(db: SqliteDb, projectId: string, keep?: MemberSyncScope): number {
  if (keep) assertScope(keep);
  const run = db.transaction((): number => {
    let removed = 0;
    for (const table of ['comment_member_sync_cursor', 'comment_member_sync_known'] as const) {
      const result = keep
        ? db.prepare(`DELETE FROM ${table} WHERE project_id=?
            AND NOT (workspace_id=? AND member_id=? AND team_id=?)`)
          .run(projectId, keep.workspaceId, keep.memberId, keep.teamId)
        : db.prepare(`DELETE FROM ${table} WHERE project_id=?`).run(projectId);
      if (table === 'comment_member_sync_cursor') removed = result.changes;
    }
    return removed;
  });
  return run.immediate();
}

export function readMemberSyncCursor(db: SqliteDb, scope: MemberSyncScope): MemberSyncCursor | null {
  assertScope(scope);
  const row = db.prepare(`SELECT phase, page_token AS pageToken, resume_token AS resumeToken,
      stream_epoch AS streamEpoch, scope_token AS scopeToken, watermark_seq AS watermarkSeq,
      skipped_count AS skippedCount
    FROM comment_member_sync_cursor
    WHERE workspace_id=? AND member_id=? AND team_id=? AND project_id=?`)
    .get(...scopeValues(scope)) as MemberSyncCursor | undefined;
  return row ?? null;
}

/**
 * The single request a cursor leads to. No cursor → a fresh snapshot. An open
 * round continues with its page token in the round's own mode; a completed
 * round resumes incrementally.
 */
export function nextMemberPageQuery(cursor: MemberSyncCursor | null): CollabCloudMemberPageQuery {
  if (!cursor) return { mode: 'snapshot' };
  if (cursor.pageToken !== null) return { mode: cursor.phase, pageToken: cursor.pageToken };
  return { mode: 'incremental', resumeToken: cursor.resumeToken! };
}

const sameQuery = (a: CollabCloudMemberPageQuery, b: CollabCloudMemberPageQuery) =>
  a.mode === b.mode && (a.pageToken ?? null) === (b.pageToken ?? null) && (a.resumeToken ?? null) === (b.resumeToken ?? null);

/**
 * Apply a remote delete (C3-LITE §3 minimal tombstone, decision 67 #5).
 *
 * A row with a `pin_seq` is treated as cloud-origin and deleted. The id itself
 * is the stronger witness: the cloud can only emit a tombstone for an id that
 * was pushed to it, so this deliberately does NOT also require the push to be
 * confirmed — a teammate may delete our comment before our own push's seq is
 * written back, and skipping it then would lose the deletion for good once
 * the cursor moves past it. A row without a `pin_seq` is left alone, as is
 * any id we do not store (a snapshot replays historical deletes).
 */
function applyTombstone(db: SqliteDb, projectId: string, commentId: string): boolean {
  return db.prepare(`DELETE FROM preview_comments
    WHERE id=? AND project_id=? AND pin_seq IS NOT NULL`)
    .run(commentId, projectId).changes > 0;
}

export function applyMemberPage(db: SqliteDb, input: ApplyMemberPageInput): ApplyMemberPageResult {
  assertScope(input.scope);
  const { scope, page, query } = input;
  if (page.mode !== query.mode) throw new Error('Member page mode does not answer its query');
  const nextToken = page.hasMore ? page.nextPageToken : page.resumeToken;
  if (!nextToken) throw new Error('Member page carries no continuation');
  const run = db.transaction((): ApplyMemberPageResult => {
    const current = readMemberSyncCursor(db, scope);
    if (!sameQuery(nextMemberPageQuery(current), query)) return { status: 'conflict' };
    // The stream epoch is NOT compared here: tokens carry it and the server
    // answers a real mismatch with 409 CURSOR_STALE. A client-side check would
    // be wrong for a project whose first snapshot saw no stream yet (epoch
    // "0"): position 0 is valid under any epoch (C3-LITE §1), so the next page
    // legitimately arrives under the newly created stream's epoch.
    if (current && current.scopeToken !== page.scopeToken) {
      return { status: 'rebuild-required', reason: 'scope-changed' };
    }
    const snapshot = page.mode === 'snapshot';
    // A fresh snapshot pass starts with every known id unseen.
    if (snapshot && query.pageToken === undefined) {
      db.prepare(`UPDATE comment_member_sync_known SET seen=0 WHERE ${SCOPE_WHERE}`).run(...scopeValues(scope));
    }
    const remember = db.prepare(`INSERT INTO comment_member_sync_known
        (workspace_id, member_id, team_id, project_id, comment_id, seen) VALUES(?,?,?,?,?,1)
      ON CONFLICT(workspace_id, member_id, team_id, project_id, comment_id) DO UPDATE SET seen=1`);
    const forget = db.prepare(`DELETE FROM comment_member_sync_known WHERE ${SCOPE_WHERE} AND comment_id=?`);
    let changed = 0;
    let deleted = 0;
    for (const change of page.comments) {
      if (change.deleted === true) {
        if (applyTombstone(db, scope.projectId, change.id)) deleted += 1;
        forget.run(...scopeValues(scope), change.id);
        continue;
      }
      const outcome = input.merge(change);
      if (outcome === 'changed') changed += 1;
      else if (outcome !== 'unchanged') throw new Error('Member comment merge was not acknowledged');
      remember.run(...scopeValues(scope), change.id);
    }
    // A malformed snapshot copy still proves the comment exists at W: keep it.
    if (snapshot) {
      const markSeen = db.prepare(`UPDATE comment_member_sync_known SET seen=1 WHERE ${SCOPE_WHERE} AND comment_id=?`);
      for (const item of page.skipped) if (item.id) markSeen.run(...scopeValues(scope), item.id);
    }
    let pruned = 0;
    if (snapshot && !page.hasMore) {
      // Same #5 witness as a tombstone (pin_seq), restricted to ids this
      // scope's member stream delivered and this snapshot did not.
      pruned = db.prepare(`DELETE FROM preview_comments
        WHERE project_id=? AND pin_seq IS NOT NULL AND (author_kind IS NULL OR author_kind <> 'user')
          AND id IN (SELECT comment_id FROM comment_member_sync_known WHERE ${SCOPE_WHERE} AND seen=0)`)
        .run(scope.projectId, ...scopeValues(scope)).changes;
      db.prepare(`DELETE FROM comment_member_sync_known WHERE ${SCOPE_WHERE} AND seen=0`).run(...scopeValues(scope));
    }
    const cursor: MemberSyncCursor = {
      // A terminal snapshot hands off to incremental (C3-LITE §3 handoff).
      phase: page.hasMore ? page.mode : 'incremental',
      pageToken: page.hasMore ? nextToken : null,
      resumeToken: page.hasMore ? null : nextToken,
      streamEpoch: page.streamEpoch,
      scopeToken: page.scopeToken,
      watermarkSeq: page.watermarkSeq,
      skippedCount: (current?.skippedCount ?? 0) + page.skipped.length,
    };
    db.prepare(`INSERT INTO comment_member_sync_cursor(workspace_id, member_id, team_id, project_id,
        phase, page_token, resume_token, stream_epoch, scope_token, watermark_seq, skipped_count, updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(workspace_id, member_id, team_id, project_id) DO UPDATE SET
        phase=excluded.phase, page_token=excluded.page_token, resume_token=excluded.resume_token,
        stream_epoch=excluded.stream_epoch, scope_token=excluded.scope_token,
        watermark_seq=excluded.watermark_seq, skipped_count=excluded.skipped_count,
        updated_at=excluded.updated_at`)
      .run(...scopeValues(scope), cursor.phase, cursor.pageToken, cursor.resumeToken, cursor.streamEpoch,
        cursor.scopeToken, cursor.watermarkSeq, cursor.skippedCount, Date.now());
    return { status: 'committed', changed, deleted, pruned, skipped: page.skipped.length, cursor };
  });
  return run.immediate();
}

export function createCommentInboundStore(db: SqliteDb): CommentInboundStore {
  return {
    read: scope => readMemberSyncCursor(db, scope),
    apply: input => applyMemberPage(db, input),
    reset: scope => resetMemberSyncCursor(db, scope),
    forgetProject: (projectId, keep) => forgetMemberSyncProject(db, projectId, keep),
    storedAuthorKind: (projectId, commentId) => {
      const row = db.prepare('SELECT author_kind AS authorKind FROM preview_comments WHERE id=? AND project_id=?')
        .get(commentId, projectId) as { authorKind: string | null } | undefined;
      if (!row) return null;
      // Rows written before author kinds existed are member comments.
      return row.authorKind === 'user' ? 'user' : 'member';
    },
  };
}
