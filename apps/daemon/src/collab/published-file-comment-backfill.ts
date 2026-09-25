import type Database from 'better-sqlite3';
import type { PreviewComment } from '@open-design/contracts';
import { ensureProjectCommentAnchorConversation, getProjectPreviewComment, getWorkspaceProjectByProjectId, isProjectCommentAnchorConversationId } from '../db.js';
import { previewCommentToCloud } from './collab-cloud-service.js';
import { createCommentRelayOutboxStore } from './comment-relay-outbox.js';
import { carryPublishedCommentMutationsToRevision, listPublishedCommentMutations, recordCommentRelayPublicationMapping } from './comment-relay-publication-mapping.js';
import { recordPublishedCommentBackfill } from './published-comment-backfill-state.js';
import { createSqlitePublicFilePublicationStore, type PublicFilePublicationScope, type PublicFilePublicationRevision } from './public-file-publication-store.js';

export interface PublishedFileCommentBackfillInput {
  scope: PublicFilePublicationScope;
  publicationRevision: PublicFilePublicationRevision;
  /** Produced by the publisher's actual file mapping; never guessed here. */
  publicFilePath: string;
  /** From the verified publication completion, not a local URL guess. */
  reopened?: boolean;
}

/**
 * Enqueue existing local comments in the publication transaction, never send.
 * The user explicitly authorized all conversations of this ONE published file.
 * Publication identity and original authors remain independent: publishing a
 * file cannot turn an inbound web comment into a comment by its publisher.
 */
export function enqueuePublishedFileComments(
  db: Database.Database,
  input: PublishedFileCommentBackfillInput,
): { enqueued: number; skippedInbound: number } {
  if (!db.inTransaction) throw new Error('Publication backfill requires the publication transaction');
  const { scope, publicationRevision, publicFilePath } = input;
  if (!publicFilePath || publicFilePath.startsWith('/') || publicFilePath.includes('\\')
    || publicFilePath.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Publication backfill requires an exact mapped path');
  }
  const binding = getWorkspaceProjectByProjectId(db, scope.projectId);
  if (!binding || binding.workspaceId !== scope.resourceTeamId || binding.resourceState === 'deleted'
    || (binding.visibility !== 'personal' && binding.visibility !== 'team')
    || binding.createdByWorkspaceMemberId !== scope.ownerMemberId) {
    throw new Error('Publication backfill project identity mismatch');
  }
  const current = createSqlitePublicFilePublicationStore(db).getRevision(scope);
  if (!current || !publicationRevision.token || current.token !== publicationRevision.token
    || current.slug !== publicationRevision.slug) throw new Error('Publication backfill witness is stale');
  // Public comments need the same internal conversation FK as Team comments.
  // Establish it atomically with the publication, never by borrowing a user chat.
  if (!ensureProjectCommentAnchorConversation(db, scope.projectId)) {
    throw new Error('Publication comment anchor unavailable');
  }
  const outbox = createCommentRelayOutboxStore(db);
  const pendingMutations = listPublishedCommentMutations(db, scope, publicationRevision.slug);
  const pendingMutationIds = new Set(pendingMutations.map(comment => comment.id));
  // Filter in SQL, not by scanning every file and later deciding to disclose it.
  const ids = db.prepare(`SELECT id FROM preview_comments
    WHERE project_id = ? AND file_path = ? ORDER BY created_at, rowid`)
    .all(scope.projectId, scope.filePath) as Array<{ id: string }>;
  const commentIds: string[] = [];
  let enqueued = 0;
  let skippedInbound = 0;
  for (const { id } of ids) {
    const stored = getProjectPreviewComment(db, scope.projectId, id);
    if (!stored) throw new Error('Publication backfill comment disappeared inside transaction');
    if (stored.authorKind === 'user' || stored.authorAppUserId
      || isProjectCommentAnchorConversationId(stored.conversationId)) {
      skippedInbound += 1;
      continue;
    }
    // SAFETY: DB normalizer supplies the PreviewComment shape; authorless legacy rows
    // remain authorless in the wire converter, never assigned to the publisher.
    const comment = previewCommentToCloud(stored as unknown as PreviewComment, '');
    // The journal is the authoritative latest mutation for an already-published
    // comment. Enqueuing the older local snapshot first would rotate its durable
    // event key twice during each resume (and duplicate a committed remote event).
    if (pendingMutationIds.has(comment.id)) {
      commentIds.push(comment.id);
      continue;
    }
    outbox.enqueue({
      workspaceId: scope.resourceTeamId, workspaceMemberId: scope.ownerMemberId,
      teamId: scope.resourceTeamId, relayScope: binding.visibility,
      projectId: scope.projectId, expectedOwnerMemberId: binding.createdByWorkspaceMemberId,
      comment,
      publication: { ...publicationRevision, publicFilePath },
    });
    commentIds.push(comment.id);
    enqueued += 1;
  }
  // Reconcile changes to comments that were already published before the stop.
  // Current rows above provide new additions; these durable latest snapshots
  // cover status edits and deleted rows. The outbox key coalesces same-id rows.
  for (const comment of pendingMutations) {
    outbox.enqueue({
      workspaceId: scope.resourceTeamId, workspaceMemberId: scope.ownerMemberId,
      teamId: scope.resourceTeamId, relayScope: binding.visibility,
      projectId: scope.projectId, expectedOwnerMemberId: binding.createdByWorkspaceMemberId,
      comment,
      publication: { ...publicationRevision, publicFilePath },
    });
    // A stopped-period deletion has no surviving preview_comments row above. It
    // still belongs to this publication's initial reconciliation batch: a
    // failed tombstone must not make comment sync appear succeeded.
    commentIds.push(comment.id);
    enqueued += 1;
  }
  // The outbox can be cancelled by another stop before delivery. Carry the
  // journal to this witness and clear each change only on its remote receipt.
  carryPublishedCommentMutationsToRevision(db, scope, publicationRevision);
  recordCommentRelayPublicationMapping(db, scope, { ...publicationRevision, publicFilePath });
  // The queue writes above and this exact initial membership are one SQLite
  // transaction: no published file can silently lack a backfill result.
  recordPublishedCommentBackfill(db, { scope, publicationRevision, commentIds,
    ...(input.reopened !== undefined ? { reopened: input.reopened } : {}),
  });
  return { enqueued, skippedInbound };
}
