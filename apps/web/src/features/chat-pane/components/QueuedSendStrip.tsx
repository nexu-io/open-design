import { useState, type DragEvent as ReactDragEvent, type MutableRefObject } from 'react';
import { Icon } from '../../../components/Icon';
import { useT } from '../../../i18n';
import { QUEUED_SEND_DRAG_MIME, QUEUED_SEND_VISIBLE_ROW_COUNT } from '../constants';
import { queuedDropEdgeForPosition, reorderQueuedSendIds, summarizeQueuedPrompt } from '../rules';
import type { QueuedSendDragState, QueuedSendItem } from '../types';
import { QueuedSendMetaChips } from './QueuedSendMetaChips';

function dropEdgeForEvent(event: ReactDragEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return queuedDropEdgeForPosition(event.clientY, rect.top, rect.height);
}

export function QueuedSendStrip({
  containerRef,
  editingId,
  items,
  onEdit,
  onRemove,
  onReorder,
  onSendNow,
}: {
  containerRef?: MutableRefObject<HTMLDivElement | null>;
  editingId?: string | null;
  items: QueuedSendItem[];
  onEdit?: (item: QueuedSendItem) => void;
  onRemove?: (id: string) => void;
  onReorder?: (orderedIds: string[]) => void;
  onSendNow?: (id: string) => void;
}) {
  const t = useT();
  const [dragState, setDragState] = useState<QueuedSendDragState | null>(null);
  if (items.length === 0) return null;
  const canReorder = Boolean(onReorder && items.length > 1);
  const overflowCount = Math.max(0, items.length - QUEUED_SEND_VISIBLE_ROW_COUNT);

  const handleDragStart = (
    event: ReactDragEvent<HTMLButtonElement>,
    item: QueuedSendItem,
  ) => {
    if (!canReorder) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(QUEUED_SEND_DRAG_MIME, item.id);
    event.dataTransfer.setData('text/plain', item.id);
    setDragState({ draggingId: item.id, overId: item.id, edge: null });
  };

  const handleDragOver = (
    event: ReactDragEvent<HTMLDivElement>,
    targetId: string,
  ) => {
    if (!canReorder) return;
    const draggingId = dragState?.draggingId || event.dataTransfer.getData(QUEUED_SEND_DRAG_MIME);
    if (!draggingId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (draggingId === targetId) {
      if (dragState?.overId !== targetId || dragState.edge !== null) {
        setDragState({ draggingId, overId: targetId, edge: null });
      }
      return;
    }
    const edge = dropEdgeForEvent(event);
    if (
      dragState?.draggingId !== draggingId
      || dragState.overId !== targetId
      || dragState.edge !== edge
    ) {
      setDragState({ draggingId, overId: targetId, edge });
    }
  };

  const handleDrop = (
    event: ReactDragEvent<HTMLDivElement>,
    targetId: string,
  ) => {
    if (!canReorder) return;
    event.preventDefault();
    const draggingId =
      dragState?.draggingId
      || event.dataTransfer.getData(QUEUED_SEND_DRAG_MIME)
      || event.dataTransfer.getData('text/plain');
    if (!draggingId || draggingId === targetId) {
      setDragState(null);
      return;
    }
    const edge = dragState?.overId === targetId && dragState.edge
      ? dragState.edge
      : dropEdgeForEvent(event);
    const nextIds = reorderQueuedSendIds(items, draggingId, targetId, edge);
    if (nextIds.join('\0') !== items.map((item) => item.id).join('\0')) {
      onReorder?.(nextIds);
    }
    setDragState(null);
  };

  return (
    <div
      ref={containerRef}
      className="chat-queued-send-strip"
      data-testid="chat-queued-send-strip"
      onDragLeave={(event) => {
        const related = event.relatedTarget;
        if (related instanceof Node && event.currentTarget.contains(related)) return;
        setDragState(null);
      }}
    >
      <div className="chat-queued-send-header">
        <div className="chat-queued-send-heading">
          <strong>
            {items.length} {t('chat.queuedHeader')}
          </strong>
          <span aria-hidden>↩</span>
          <span>{t('chat.queuedToSend')}</span>
        </div>
      </div>
      <div className={`chat-queued-send-list${overflowCount > 0 ? ' is-scrollable' : ''}`}>
        {items.map((item, index) => {
          const isDragging = dragState?.draggingId === item.id;
          const dropClass = dragState?.overId === item.id
            && dragState.draggingId !== item.id
            && dragState.edge
            ? ` chat-queued-send-row-drop-${dragState.edge}`
            : '';
          return (
            <div
              className={`chat-queued-send-row${index === 0 ? ' chat-queued-send-row-active' : ''}${
                editingId === item.id ? ' chat-queued-send-row-editing' : ''
              }${isDragging ? ' chat-queued-send-row-dragging' : ''}${dropClass}`}
              key={item.id}
              onDragOver={(event) => handleDragOver(event, item.id)}
              onDrop={(event) => handleDrop(event, item.id)}
            >
              <button
                type="button"
                className="chat-queued-send-drag-handle chat-queued-send-tooltip od-tooltip"
                title={t('chat.queuedReorder')}
                data-tooltip={t('chat.queuedReorder')}
                data-tooltip-placement="right"
                aria-label={t('chat.queuedReorder')}
                draggable={canReorder}
                disabled={!canReorder}
                onDragStart={(event) => handleDragStart(event, item)}
                onDragEnd={() => setDragState(null)}
              >
                <Icon name="grip-vertical" size={14} />
              </button>
              <div className="chat-queued-send-main">
                <span className="chat-queued-send-title">{summarizeQueuedPrompt(item, t)}</span>
                <QueuedSendMetaChips item={item} />
              </div>
              <div className="chat-queued-send-actions">
                {onEdit ? (
                  <button
                    type="button"
                    className="chat-queued-send-action chat-queued-send-tooltip od-tooltip"
                    title={t('chat.queuedEdit')}
                    data-tooltip={t('chat.queuedEdit')}
                    data-tooltip-placement="top"
                    aria-label={t('chat.queuedEdit')}
                    onClick={() => onEdit(item)}
                  >
                    <Icon name="pencil" size={13} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="chat-queued-send-action chat-queued-send-tooltip od-tooltip"
                  title={t('chat.send')}
                  data-tooltip={t('chat.send')}
                  data-tooltip-placement="top"
                  aria-label={t('chat.send')}
                  data-testid="chat-queued-send-now"
                  onClick={() => onSendNow?.(item.id)}
                  disabled={!onSendNow}
                >
                  <Icon name="arrow-up" size={13} />
                </button>
                {onRemove ? (
                  <button
                    type="button"
                    className="chat-queued-send-action chat-queued-send-tooltip od-tooltip"
                    onClick={() => onRemove(item.id)}
                    title={t('chat.comments.remove')}
                    data-tooltip={t('chat.comments.remove')}
                    data-tooltip-placement="top"
                    aria-label={t('chat.comments.remove')}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {overflowCount > 0 ? (
        <div className="chat-queued-send-overflow">
          +{overflowCount} {t('chat.queuedMore')}
        </div>
      ) : null}
    </div>
  );
}
