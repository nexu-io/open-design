// Feature-local hook for the composer's comment/annotation attachments: the
// visual-comment chips staged locally (Mark draw-overlay annotations) merged
// with the `commentAttachments` prop (comments staged upstream, e.g. from a
// file-viewer selection), the "streaming annotation send is pending" latch
// used when an annotation arrives mid-stream and must wait for the current
// run to finish before it can send, and the entry_from tag that deferred send
// must carry once it flushes (the Mark draw-overlay tags 'mark' synchronously;
// without this the flush effect would report the run as the default composer
// entry). Pure UI state — no port, no transport — matching the memory
// canary's no-port `useMemoryFlash` and this slice's
// `useComposerModals`/`useComposerUpload`.
//
// The `ANNOTATION_EVENT` window listener (and its paired "flush the deferred
// send" effect) stay in the orchestrator: both are heavily entangled with
// other clusters' state (`draft`/`draftRef`, `staged`, `streaming`,
// `sendDisabled`, `sendComposedTurn`, `currentRunContextMeta`) that hasn't
// been extracted yet, so this hook only exposes the state/functions that are
// genuinely this cluster's own for those orchestrator-owned effects to call.
import { useCallback, useRef, useState } from 'react';
import type { ChatAnalyticsEntryFrom } from '@open-design/contracts';
import type { ChatCommentAttachment } from '../../../types';
import { sortChatCommentAttachmentsByOrder } from '../rules';

export interface CommentAttachmentsParams {
  commentAttachments: ChatCommentAttachment[];
  onRemoveCommentAttachment?: (id: string) => void;
}

export interface CommentAttachmentsController {
  stagedVisualComments: ChatCommentAttachment[];
  setStagedVisualComments: React.Dispatch<React.SetStateAction<ChatCommentAttachment[]>>;
  streamingAnnotationSendPending: boolean;
  streamingAnnotationSendPendingRef: React.MutableRefObject<boolean>;
  setStreamingAnnotationSendPending: (value: boolean) => void;
  streamingAnnotationSendEntryFromRef: React.MutableRefObject<ChatAnalyticsEntryFrom | undefined>;
  currentCommentAttachments: (extra?: ChatCommentAttachment[]) => ChatCommentAttachment[];
  removeCommentAttachment: (id: string) => void;
}

export function useCommentAttachments({
  commentAttachments,
  onRemoveCommentAttachment,
}: CommentAttachmentsParams): CommentAttachmentsController {
  const [stagedVisualComments, setStagedVisualComments] = useState<ChatCommentAttachment[]>([]);
  const streamingAnnotationSendPendingRef = useRef(false);
  const [streamingAnnotationSendPending, setStreamingAnnotationSendPendingState] = useState(false);
  const streamingAnnotationSendEntryFromRef = useRef<ChatAnalyticsEntryFrom | undefined>(undefined);

  const setStreamingAnnotationSendPending = useCallback((value: boolean) => {
    streamingAnnotationSendPendingRef.current = value;
    setStreamingAnnotationSendPendingState(value);
  }, []);

  const currentCommentAttachments = useCallback(
    (extra: ChatCommentAttachment[] = []): ChatCommentAttachment[] =>
      sortChatCommentAttachmentsByOrder([...commentAttachments, ...stagedVisualComments, ...extra]),
    [commentAttachments, stagedVisualComments],
  );

  const removeCommentAttachment = useCallback(
    (id: string) => {
      setStagedVisualComments((current) => current.filter((attachment) => attachment.id !== id));
      if (!stagedVisualComments.some((attachment) => attachment.id === id)) {
        onRemoveCommentAttachment?.(id);
      }
    },
    [onRemoveCommentAttachment, stagedVisualComments],
  );

  return {
    stagedVisualComments,
    setStagedVisualComments,
    streamingAnnotationSendPending,
    streamingAnnotationSendPendingRef,
    setStreamingAnnotationSendPending,
    streamingAnnotationSendEntryFromRef,
    currentCommentAttachments,
    removeCommentAttachment,
  };
}
