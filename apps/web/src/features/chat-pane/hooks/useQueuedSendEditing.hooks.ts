import { useCallback, useEffect, useState, type MutableRefObject } from 'react';
import { trackMessageQueueClick } from '../../../analytics/events';
import type { ChatComposerHandle } from '../../../components/ChatComposer';
import type { QueuedSendItem } from '../types';

type Track = (
  event: string,
  properties: Record<string, unknown>,
  options?: { requestId?: string; insertId?: string },
) => void;

export function useQueuedSendEditing(
  composerRef: MutableRefObject<ChatComposerHandle | null>,
  queuedItems: QueuedSendItem[],
  {
    analyticsTrack,
    projectId,
    onRemoveQueuedSend,
    onSendQueuedNow,
  }: {
    analyticsTrack: Track;
    projectId: string | null;
    onRemoveQueuedSend: ((id: string) => void) | undefined;
    onSendQueuedNow: ((id: string) => void) | undefined;
  },
) {
  const [editingQueuedSendId, setEditingQueuedSendId] = useState<string | null>(null);

  useEffect(() => {
    if (!editingQueuedSendId) return;
    if (queuedItems.some((item) => item.id === editingQueuedSendId)) return;
    setEditingQueuedSendId(null);
  }, [editingQueuedSendId, queuedItems]);

  const restoreQueuedSendToComposer = (item: QueuedSendItem) => {
    setEditingQueuedSendId(item.id);
    composerRef.current?.restoreDraft({
      text: item.prompt,
      attachments: item.attachments ?? [],
      commentAttachments: item.commentAttachments ?? [],
      meta: item.meta,
    });
  };

  const handleEditQueuedSend = useCallback((item: QueuedSendItem) => {
    trackMessageQueueClick(analyticsTrack, {
      page_name: 'chat_panel',
      area: 'message_queue',
      element: 'edit',
      project_id: projectId ?? '',
      queue_length: queuedItems.length,
    });
    restoreQueuedSendToComposer(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsTrack, projectId, queuedItems.length]);

  const handleRemoveQueuedSend = onRemoveQueuedSend
    ? (id: string) => {
        trackMessageQueueClick(analyticsTrack, {
          page_name: 'chat_panel',
          area: 'message_queue',
          element: 'delete',
          project_id: projectId ?? '',
          queue_length: queuedItems.length,
        });
        onRemoveQueuedSend(id);
      }
    : undefined;

  const handleSendQueuedNow = onSendQueuedNow
    ? (id: string) => {
        trackMessageQueueClick(analyticsTrack, {
          page_name: 'chat_panel',
          area: 'message_queue',
          element: 'send_now',
          project_id: projectId ?? '',
          queue_length: queuedItems.length,
        });
        onSendQueuedNow(id);
      }
    : undefined;

  return {
    editingQueuedSendId,
    setEditingQueuedSendId,
    restoreQueuedSendToComposer,
    handleEditQueuedSend,
    handleRemoveQueuedSend,
    handleSendQueuedNow,
  };
}
