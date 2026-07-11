// Feature-local hook for the preview-comments cluster: refreshing, saving,
// deleting, and (de)attaching a project's preview comments to the chat
// composer. `previewComments`/`attachedComments` stay owned by the
// orchestrator (mirroring `useConversationManagement`'s pattern) — they're
// reset by the conversation-load effects (cluster 4) and read/written by the
// not-yet-extracted chat-send pipeline (cluster 17), so this hook takes them
// and their setters as params and owns only the CRUD functions themselves.
import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  ChatCommentAttachment,
  PreviewComment,
  PreviewCommentAttachment,
  PreviewCommentTarget,
} from '../../../types';
import {
  mergeAttachedComments,
  mergePreviewCommentAttachments,
  removeAttachedComment,
} from '../../../comments';
import { mergeSavedPreviewComment } from '../rules';
import { projectViewTransportPort } from '../dependencies';
import type { ProjectViewTransportPort } from '../ports';

export interface PreviewCommentsController {
  refreshPreviewComments: () => Promise<void>;
  savePreviewComment: (
    target: PreviewCommentTarget,
    note: string,
    attachAfterSave: boolean,
    images?: File[],
  ) => Promise<PreviewComment | null>;
  removePreviewComment: (commentId: string) => Promise<void>;
  attachPreviewComment: (comment: PreviewComment) => void;
  detachPreviewComment: (commentId: string) => void;
  patchAttachedStatuses: (
    attachments: ChatCommentAttachment[],
    status: PreviewComment['status'],
  ) => Promise<void>;
}

export function usePreviewComments(
  port: ProjectViewTransportPort,
  projectId: string,
  activeConversationId: string | null,
  previewComments: PreviewComment[],
  setPreviewComments: Dispatch<SetStateAction<PreviewComment[]>>,
  setAttachedComments: Dispatch<SetStateAction<PreviewComment[]>>,
): PreviewCommentsController {
  const refreshPreviewComments = useCallback(async () => {
    if (!activeConversationId) return;
    const next = await port.fetchPreviewComments(projectId, activeConversationId);
    setPreviewComments(next);
    setAttachedComments((current) =>
      current
        .map((attached) => next.find((comment) => comment.id === attached.id))
        .filter((comment): comment is PreviewComment => Boolean(comment)),
    );
  }, [port, projectId, activeConversationId, setPreviewComments, setAttachedComments]);

  const savePreviewComment = useCallback(
    async (
      target: PreviewCommentTarget,
      note: string,
      attachAfterSave: boolean,
      images: File[] = [],
    ) => {
      if (!activeConversationId) return null;
      // Upload any attached images first so the saved comment carries durable
      // file paths — this is what lets the comment list / re-opened popover
      // re-display the images instead of losing them on echo.
      let uploadedAttachments: PreviewCommentAttachment[] | undefined;
      if (images.length > 0) {
        uploadedAttachments = await port.uploadPreviewCommentImages(projectId, images);
        if (uploadedAttachments.length !== images.length) return null;
      }
      const existing = previewComments.find(
        (comment) => comment.filePath === target.filePath && comment.elementId === target.elementId,
      );
      const attachments = mergePreviewCommentAttachments(existing?.attachments, uploadedAttachments);
      const saved = await port.savePreviewComment(projectId, activeConversationId, {
        target,
        note,
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      if (!saved) return null;
      setPreviewComments((current) => mergeSavedPreviewComment(current, saved));
      setAttachedComments((current) =>
        attachAfterSave
          ? mergeAttachedComments(current, saved)
          : current.map((comment) => (comment.id === saved.id ? saved : comment)),
      );
      return saved;
    },
    [port, projectId, activeConversationId, previewComments, setPreviewComments, setAttachedComments],
  );

  const removePreviewComment = useCallback(
    async (commentId: string) => {
      if (!activeConversationId) return;
      const ok = await port.deletePreviewComment(projectId, activeConversationId, commentId);
      if (!ok) return;
      setPreviewComments((current) => current.filter((comment) => comment.id !== commentId));
      setAttachedComments((current) => removeAttachedComment(current, commentId));
    },
    [port, projectId, activeConversationId, setPreviewComments, setAttachedComments],
  );

  const attachPreviewComment = useCallback(
    (comment: PreviewComment) => {
      setAttachedComments((current) => mergeAttachedComments(current, comment));
    },
    [setAttachedComments],
  );

  const detachPreviewComment = useCallback(
    (commentId: string) => {
      setAttachedComments((current) => removeAttachedComment(current, commentId));
    },
    [setAttachedComments],
  );

  const patchAttachedStatuses = useCallback(
    async (attachments: ChatCommentAttachment[], status: PreviewComment['status']) => {
      if (!activeConversationId || attachments.length === 0) return;
      const persistedAttachments = attachments.filter(
        (attachment) => attachment.source !== 'board-batch',
      );
      if (persistedAttachments.length === 0) return;
      setPreviewComments((current) =>
        current.map((comment) =>
          persistedAttachments.some((attachment) => attachment.id === comment.id)
            ? { ...comment, status }
            : comment,
        ),
      );
      await Promise.all(
        persistedAttachments.map((attachment) =>
          port.patchPreviewCommentStatus(projectId, activeConversationId, attachment.id, status),
        ),
      );
      void refreshPreviewComments();
    },
    [port, projectId, activeConversationId, setPreviewComments, refreshPreviewComments],
  );

  return {
    refreshPreviewComments,
    savePreviewComment,
    removePreviewComment,
    attachPreviewComment,
    detachPreviewComment,
    patchAttachedStatuses,
  };
}

/** Wirer: binds the real project-view transport port; swap in tests. */
export function useWiredPreviewComments(
  projectId: string,
  activeConversationId: string | null,
  previewComments: PreviewComment[],
  setPreviewComments: Dispatch<SetStateAction<PreviewComment[]>>,
  setAttachedComments: Dispatch<SetStateAction<PreviewComment[]>>,
): PreviewCommentsController {
  return usePreviewComments(
    projectViewTransportPort,
    projectId,
    activeConversationId,
    previewComments,
    setPreviewComments,
    setAttachedComments,
  );
}
