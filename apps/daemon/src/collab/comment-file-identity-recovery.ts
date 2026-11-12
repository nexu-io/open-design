import type Database from 'better-sqlite3';
import type { CollabCloudComment } from '@open-design/contracts';
import { isProjectCommentAnchorConversationId } from '../db.js';
import { createCommentRelayOutboxStore } from './comment-relay-outbox.js';

/** Rebind only explicit local pre-share comments, with their durable outbound
 * snapshots. The caller commits this together with fresh receipt-backed facts.
 * Artifact IDs, inbound comments and identity-less history remain unchanged.
 */
export function rebindLocalCommentFileIdentity(db: Database.Database, input: {
  projectId: string; workspaceId: string; creatorMemberId: string;
  filePath: string; localSourceFileId: string; sourceFileId: string;
}): void {
  if (!db.inTransaction) throw new Error('Comment identity recovery requires a transaction');
  const comments = db.prepare(`SELECT id, conversation_id AS conversationId FROM preview_comments
    WHERE project_id = ? AND file_path = ? AND source_file_id = ?
      AND COALESCE(author_kind, 'member') = 'member' AND author_app_user_id IS NULL
      AND cloud_revision_seq IS NULL`)
    .all(input.projectId, input.filePath, input.localSourceFileId) as Array<{ id: string; conversationId: string }>;
  if (!comments.length) return;
  const outbox = createCommentRelayOutboxStore(db);
  const rebind = (serialized: string, commentId: string): CollabCloudComment => {
    const comment = JSON.parse(serialized) as CollabCloudComment;
    if (comment.id !== commentId || comment.projectId !== input.projectId
      || comment.sourceFilePath !== input.filePath || comment.sourceFileId !== input.localSourceFileId) {
      throw new Error('COMMENT_FILE_LIFETIME_CONFLICT');
    }
    return { ...comment, sourceFileId: input.sourceFileId };
  };
  for (const comment of comments) {
    if (isProjectCommentAnchorConversationId(comment.conversationId)) continue;
    db.prepare('UPDATE preview_comments SET source_file_id = ? WHERE project_id = ? AND id = ?')
      .run(input.sourceFileId, input.projectId, comment.id);
    const queued = db.prepare(`SELECT payload_json AS payload, publication_json AS publication,
        relay_scope AS relayScope, expected_owner_member_id AS expectedOwner
      FROM comment_relay_outbox WHERE workspace_id = ? AND workspace_member_id = ?
        AND team_id = ? AND project_id = ? AND file_path = ? AND comment_id = ?`)
      .get(input.workspaceId, input.creatorMemberId, input.workspaceId, input.projectId, input.filePath, comment.id) as {
        payload: string; publication: string | null; relayScope: 'personal' | 'team'; expectedOwner: string | null;
      } | undefined;
    if (queued) {
      if (queued.expectedOwner !== input.creatorMemberId) throw new Error('COMMENT_FILE_LIFETIME_CONFLICT');
      // enqueue rotates the payload fingerprint/event key and revision fence:
      // an ACK for the old UUID cannot delete this replacement snapshot.
      outbox.enqueue({ workspaceId: input.workspaceId, workspaceMemberId: input.creatorMemberId,
        teamId: input.workspaceId, relayScope: queued.relayScope, projectId: input.projectId,
        expectedOwnerMemberId: queued.expectedOwner, comment: rebind(queued.payload, comment.id),
        ...(queued.publication ? { publication: JSON.parse(queued.publication) } : {}),
      });
    }
    const journal = db.prepare(`SELECT payload_json AS payload FROM published_comment_mutations
      WHERE resource_team_id = ? AND owner_member_id = ? AND project_id = ? AND file_path = ? AND comment_id = ?`)
      .get(input.workspaceId, input.creatorMemberId, input.projectId, input.filePath, comment.id) as { payload: string } | undefined;
    if (journal) {
      db.prepare(`UPDATE published_comment_mutations SET payload_json = ?
        WHERE resource_team_id = ? AND owner_member_id = ? AND project_id = ? AND file_path = ? AND comment_id = ?`)
        .run(JSON.stringify(rebind(journal.payload, comment.id)), input.workspaceId, input.creatorMemberId,
          input.projectId, input.filePath, comment.id);
    }
  }
}
