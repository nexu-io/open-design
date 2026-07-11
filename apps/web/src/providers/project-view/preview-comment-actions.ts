// Transport home for preview-comment write actions (save/patch-status/delete)
// and the image-upload step `savePreviewComment` uses to attach files before
// saving. `fetchPreviewComments` (listing) already lives in `messages.ts`
// alongside the other conversation-message transport; this file owns the
// write-side calls, all sourced from the daemon `registry`.
import {
  deletePreviewComment as deletePreviewCommentTransport,
  patchPreviewCommentStatus as patchPreviewCommentStatusTransport,
  uploadProjectFiles as uploadProjectFilesTransport,
  upsertPreviewComment as upsertPreviewCommentTransport,
} from '../registry';
import type { PreviewComment, PreviewCommentAttachment, PreviewCommentTarget } from '../../types';

/** Upload preview-comment images ahead of saving. Best-effort: resolves only
 *  the images that succeeded, so the caller can detect a partial failure by
 *  comparing lengths against the input. */
export async function uploadPreviewCommentImages(
  projectId: string,
  images: File[],
): Promise<PreviewCommentAttachment[]> {
  if (images.length === 0) return [];
  const result = await uploadProjectFilesTransport(projectId, images);
  return result.uploaded.map((file) => ({ path: file.path, name: file.name }));
}

/** Create or update a preview comment. Best-effort: resolves `null` on failure. */
export async function savePreviewComment(
  projectId: string,
  conversationId: string,
  input: { target: PreviewCommentTarget; note: string; attachments?: PreviewCommentAttachment[] },
): Promise<PreviewComment | null> {
  return upsertPreviewCommentTransport(projectId, conversationId, input);
}

/** Patch a preview comment's status. Best-effort: resolves `null` on failure. */
export async function patchPreviewCommentStatus(
  projectId: string,
  conversationId: string,
  commentId: string,
  status: PreviewComment['status'],
): Promise<PreviewComment | null> {
  return patchPreviewCommentStatusTransport(projectId, conversationId, commentId, status);
}

/** Delete a preview comment. Resolves `false` on failure. */
export async function deletePreviewComment(
  projectId: string,
  conversationId: string,
  commentId: string,
): Promise<boolean> {
  return deletePreviewCommentTransport(projectId, conversationId, commentId);
}
