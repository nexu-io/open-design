import type Database from 'better-sqlite3';
import type { PreviewComment, WorkspaceCollabContext } from '@open-design/contracts';
import { getWorkspaceProjectByProjectId } from '../db.js';
import { previewCommentToCloud } from './collab-cloud-service.js';
import { recordPublishedCommentMutation } from './comment-relay-publication-mapping.js';

/** Store only owner-authored-project mutations for the exact historical personal publication mapping. */
export function recordPersonalPublishedCommentMutation(
  db: Database.Database,
  comment: PreviewComment,
  context: WorkspaceCollabContext | null,
  deleted: boolean,
): boolean {
  if (!context) return true;
  const binding = getWorkspaceProjectByProjectId(db, comment.projectId);
  if (!binding || binding.visibility !== 'personal' || binding.workspaceId !== context.workspaceId
    || binding.createdByWorkspaceMemberId !== context.workspaceMemberId || binding.resourceState === 'deleted') return true;
  const scope = {
    resourceTeamId: binding.workspaceId,
    ownerMemberId: context.workspaceMemberId,
    projectId: comment.projectId,
    filePath: comment.filePath,
  };
  // Journal active and stopped aliases: stop can race the ordinary outbox acknowledgement.
  const payload = previewCommentToCloud(comment, '');
  // Ensure resumed lifecycle events outrank the record delivered before stop.
  payload.updatedAt = Math.max(Date.now(), payload.updatedAt + 1);
  if (deleted) payload.deleted = true;
  recordPublishedCommentMutation(db, scope, payload);
  return true;
}
