import type Database from 'better-sqlite3';
import type { CommentSyncState, CommentAlignResult } from '@open-design/contracts';
import { migrateCommentRelayOutbox } from './comment-relay-outbox.js';
import { readPublishedCommentBackfill } from './published-comment-backfill-state.js';
import type { ReadProjectShareState } from './vela-project-share-state.js';

export interface CommentSyncScope { projectId: string; workspaceId: string; workspaceMemberId: string; filePath?: string }
export interface CommentSyncStateService {
  read(scope: CommentSyncScope): Promise<CommentSyncState | null>;
  retry(scope: CommentSyncScope): Promise<CommentSyncState | null>;
}

/** Null is unknown, not a healthy initial state. Session checks are uncached here
 * so a read after login observes recovery without recreating the service.
 */
export function createCommentSyncStateService(db: Database.Database,
  sessionAvailable: (scope: CommentSyncScope) => Promise<boolean | null>,
  diagnostics?: {
    readAlign?: (scope: CommentSyncScope) => CommentAlignResult | undefined;
    readProjectShareState?: ReadProjectShareState;
    /** Credential used for this GET; compare across availability and remote read. */
    readCredential?: () => { apiUrl: string; controlKey: string } | null;
  },
): CommentSyncStateService {
  migrateCommentRelayOutbox(db);
  const args = (scope: CommentSyncScope) => {
    const values = [scope.projectId, scope.workspaceId, scope.workspaceMemberId];
    if (values.some(value => !value.trim())) throw new Error('Comment sync scope required');
    return values;
  };
  const read = async (scope: CommentSyncScope): Promise<CommentSyncState | null> => {
    const identity = args(scope);
    const credential = diagnostics?.readCredential?.();
    const sameCredential = () => {
      if (!diagnostics?.readCredential) return true;
      const current = diagnostics.readCredential();
      return Boolean(credential?.controlKey && credential.apiUrl
        && current?.controlKey === credential.controlKey && current.apiUrl === credential.apiUrl);
    };
    const available = await sessionAvailable(scope);
    if (available === null) return null;
    // Query after the session await, not a stale count from before a send finished.
    const rows = db.prepare(`SELECT last_error FROM comment_relay_outbox
      WHERE project_id=? AND workspace_id=? AND workspace_member_id=? ORDER BY updated_at DESC`).all(...identity) as Array<{ last_error: string | null }>;
    const align = diagnostics?.readAlign?.(scope);
    const backfill = readPublishedCommentBackfill(db, scope);
    // Stop removes the local publication row. Only the validated remote project
    // history can establish whether this exact file is stopped or still active.
    // A missing file, missing session or failed read is unknown, never 'active'.
    let shareStopped: boolean | null = null;
    if (available && scope.filePath && diagnostics?.readProjectShareState && sameCredential()) {
      try {
        const history = await diagnostics.readProjectShareState({
          projectId: scope.projectId, resourceTeamId: scope.workspaceId, ownerMemberId: scope.workspaceMemberId,
        });
        if (history.projectId === scope.projectId && history.bindingExists) {
          const file = history.publications.find(item => item.sourceFilePath === scope.filePath);
          if (file && sameCredential()) shareStopped = file.status === 'stopped';
        }
      } catch { /* Remote errors can contain credentials. Preserve unknown without logging. */ }
    }
    return { ...(align ? { align } : {}), ...(backfill ? { backfill } : {}), pending: rows.length,
      // Arbitrary transport messages can contain credentials or other private data.
      lastError: (rows.some(row => Boolean(row.last_error)) || db.prepare('SELECT 1 FROM comment_relay_sync_failures WHERE project_id=? AND workspace_id=? AND workspace_member_id=?').get(...identity)) ? 'COMMENT_SYNC_DELIVERY_FAILED' : null,
      sessionMissing: rows.length > 0 && !available, shareStopped };
  };
  return { read, retry: async scope => {
    const identity = args(scope);
    if (scope.filePath !== undefined) {
      const backfill = readPublishedCommentBackfill(db, scope);
      if (backfill?.state === 'failed') {
        // Expedite only outstanding members of THIS initial publish batch.
        // Do not re-publish, recreate discarded rows, run align, or retry later edits.
        db.prepare(`UPDATE comment_relay_outbox SET next_attempt_at=0
          WHERE project_id=? AND workspace_id=? AND workspace_member_id=? AND file_path=?
            AND json_valid(publication_json) AND json_extract(publication_json, '$.token')=?
            AND comment_id IN (SELECT comment_id FROM published_comment_backfill_members
              WHERE project_id=? AND workspace_id=? AND workspace_member_id=? AND file_path=?
                AND publication_revision=? AND delivered=0)`).run(
          ...identity, scope.filePath, backfill.publicationRevision,
          ...identity, scope.filePath, backfill.publicationRevision,
        );
      }
    } else {
      db.prepare(`UPDATE comment_relay_outbox SET next_attempt_at=0
        WHERE project_id=? AND workspace_id=? AND workspace_member_id=?`).run(...identity);
    }
    return read(scope);
  } };
}
