import { useId } from 'react';

import { selectionKindLabel, type PreviewCommentSnapshot } from '../comments';
import type { Dict } from '../i18n/types';
import type { PreviewComment, PreviewCommentMember } from '../types';

import { Icon } from './Icon';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

function summarizeMember(member: PreviewCommentMember): string {
  const text = String(member.text || '').trim();
  if (text) {
    const trimmed = text.length > 24 ? `${text.slice(0, 21)}...` : text;
    return `${member.label || member.elementId} · ${trimmed}`;
  }
  return member.label || member.elementId;
}

export function BoardComposerPopover({
  target,
  existing,
  draft,
  notes,
  onDraft,
  onAddDraft,
  onRemoveQueuedNote,
  onClose,
  onSaveComment,
  onSendBatch,
  onRemove,
  onRemoveMember,
  onHoverMember,
  sending,
  t,
}: {
  target: PreviewCommentSnapshot;
  existing: PreviewComment | null;
  draft: string;
  notes: string[];
  onDraft: (value: string) => void;
  onAddDraft: () => void;
  onRemoveQueuedNote: (index: number) => void;
  onClose: () => void;
  onSaveComment: () => void | Promise<void>;
  onSendBatch: () => void | Promise<void>;
  onRemove: (commentId: string) => void | Promise<void>;
  onRemoveMember: (elementId: string) => void;
  onHoverMember?: (elementId: string | null) => void;
  sending: boolean;
  t: TranslateFn;
}) {
  const pendingCount = notes.length + (draft.trim() ? 1 : 0);
  const podMembers = target.podMembers ?? [];
  const titleId = useId();
  const isFreePin = target.elementId.startsWith('pin-');
  return (
    <div
      className="comment-popover"
      data-testid="comment-popover"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="comment-popover-head">
        <div title={target.elementId}>
          {isFreePin ? (
            <>
              <strong id={titleId}>{t('chat.comments.pin')}</strong>
              <span>{t('chat.comments.pinAtCoords', { x: target.position.x + 12, y: target.position.y + 12 })}</span>
            </>
          ) : (
            <>
              <strong id={titleId}>{target.label || target.elementId}</strong>
              <span>{selectionKindLabel(target.selectionKind, target.memberCount)}</span>
            </>
          )}
        </div>
        <button
          type="button"
          className="comment-popover-close"
          onClick={onClose}
          title={t('common.close')}
          aria-label={t('common.close')}
        >
          <Icon name="close" size={12} />
        </button>
      </div>
      {podMembers.length > 0 ? (
        <div className="board-pod-summary">
          <strong>{t('chat.comments.capturedItems', { n: target.memberCount || podMembers.length })}</strong>
          <div className="board-pod-members">
            {podMembers.map((member) => (
              <span
                key={member.elementId}
                className="board-pod-chip"
                onPointerEnter={(e) => {
                  if (e.pointerType && e.pointerType !== 'mouse') return;
                  onHoverMember?.(member.elementId);
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType && e.pointerType !== 'mouse') return;
                  onHoverMember?.(null);
                }}
              >
                {summarizeMember(member)}
                <button
                  type="button"
                  className="board-pod-chip-remove"
                  onClick={() => onRemoveMember(member.elementId)}
                  onFocus={() => onHoverMember?.(member.elementId)}
                  onBlur={() => onHoverMember?.(null)}
                  aria-label={t('chat.comments.remove')}
                  title={t('chat.comments.remove')}
                >
                  <Icon name="close" size={10} />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {notes.length > 0 ? (
        <div className="board-note-list">
          {notes.map((note, index) => (
            <div key={`${target.elementId}-${index}`} className="board-note-item">
              <span>{note}</span>
              <button type="button" className="ghost" onClick={() => onRemoveQueuedNote(index)}>
                {t('chat.comments.remove')}
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <textarea
        data-testid="comment-popover-input"
        value={draft}
        autoFocus
        aria-label={t('chat.comments.placeholder')}
        placeholder={t('chat.comments.placeholder')}
        onChange={(event) => onDraft(event.target.value)}
      />
      <div className="comment-popover-actions">
        {existing ? (
          <button
            type="button"
            className="comment-popover-remove"
            onClick={() => onRemove(existing.id)}
            title={t('chat.comments.remove')}
          >
            {t('chat.comments.remove')}
          </button>
        ) : null}
        <div className="comment-popover-actions-end">
          {target.selectionKind === 'pod' ? (
            <button
              type="button"
              className="ghost"
              data-testid="comment-popover-add-note"
              disabled={!draft.trim()}
              onClick={onAddDraft}
            >
              {t('chat.comments.addNote')}
            </button>
          ) : (
            <button
              type="button"
              className="ghost"
              data-testid="comment-popover-save"
              disabled={!draft.trim()}
              onClick={() => void onSaveComment()}
            >
              {t('chat.comments.comment')}
            </button>
          )}
          <button
            type="button"
            className="primary"
            data-testid="comment-add-send"
            disabled={pendingCount === 0 || sending}
            onClick={() => void onSendBatch()}
          >
            {sending ? t('chat.comments.sending') : t('chat.comments.sendToChat')}
          </button>
        </div>
      </div>
    </div>
  );
}
