import type { CSSProperties } from 'react';

import type { PreviewCommentSnapshot } from '../comments';
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

function cssColorToHex(value: string | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw || raw === 'transparent' || raw === 'rgba(0, 0, 0, 0)') return null;
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw)) {
    if (raw.length === 4) {
      return '#' + raw.slice(1).split('').map((char) => char + char).join('').toUpperCase();
    }
    return raw.toUpperCase();
  }
  const match = raw.match(/rgba?\(\s*([0-9.]+)[ ,]+([0-9.]+)[ ,]+([0-9.]+)/i);
  if (!match) return raw;
  const toHex = (part: string | undefined) => {
    const value = Math.max(0, Math.min(255, Math.round(Number(part ?? 0))));
    return value.toString(16).padStart(2, '0').toUpperCase();
  };
  return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
}

function compactFontFamily(value: string | undefined): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim().replace(/^["']|["']$/g, '');
  return first || null;
}

type AnnotationStyleRow = { label: string; value: string; swatch?: string };

function annotationStyleRows(target: PreviewCommentSnapshot): AnnotationStyleRow[] {
  const rows: AnnotationStyleRow[] = [];
  const width = Math.round(target.position.width);
  const height = Math.round(target.position.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    rows.push({ label: 'Size', value: `${width}x${height}` });
  }
  const color = cssColorToHex(target.style?.color);
  if (color) rows.push({ label: 'Color', value: color, swatch: color });
  const background = cssColorToHex(target.style?.backgroundColor);
  if (background) rows.push({ label: 'Bg', value: background, swatch: background });

  const fontParts = [
    target.style?.fontSize,
    target.style?.fontWeight && target.style.fontWeight !== '400' ? target.style.fontWeight : null,
    compactFontFamily(target.style?.fontFamily),
  ].filter((part): part is string => Boolean(part));
  if (fontParts.length > 0) {
    rows.push({ label: 'Font', value: fontParts.join(' ') });
  }
  if (target.style?.lineHeight) rows.push({ label: 'Line', value: target.style.lineHeight });
  return rows;
}

function clampPopoverCoordinate(value: number, min: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.round(value));
}

function popoverAnchorStyle(target: PreviewCommentSnapshot, scale: number): CSSProperties {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const anchor = target.hoverPoint ?? {
    x: target.position.x + Math.min(target.position.width, 24),
    y: target.position.y + Math.min(target.position.height, 24),
  };
  return {
    left: clampPopoverCoordinate(anchor.x * safeScale + 14, 14),
    top: clampPopoverCoordinate(anchor.y * safeScale + 14, 14),
  };
}

export function AnnotationStyleSummary({
  target,
  testId = 'annotation-style-summary',
}: {
  target: PreviewCommentSnapshot;
  testId?: string;
}) {
  const rows = annotationStyleRows(target);
  if (rows.length === 0) return null;
  return (
    <div className="annotation-style-summary" data-testid={testId}>
      {rows.map((row) => (
        <div key={row.label} className="annotation-style-row">
          <span>{row.label}</span>
          <strong title={row.value}>
            {row.swatch ? <i aria-hidden="true" style={{ backgroundColor: row.swatch }} /> : null}
            {row.value}
          </strong>
        </div>
      ))}
    </div>
  );
}

export function AnnotationHoverPopover({ target, scale }: { target: PreviewCommentSnapshot; scale: number }) {
  return (
    <div
      className="comment-popover annotation-hover-popover"
      data-testid="annotation-hover-popover"
      role="tooltip"
      style={popoverAnchorStyle(target, scale)}
    >
      <AnnotationStyleSummary target={target} testId="annotation-hover-style-summary" />
    </div>
  );
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
  onRemoveMember,
  onHoverMember,
  sending,
  t,
  scale = 1,
  docked = false,
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
  onRemoveMember: (elementId: string) => void;
  onHoverMember?: (elementId: string | null) => void;
  sending: boolean;
  t: TranslateFn;
  scale?: number;
  docked?: boolean;
}) {
  const pendingCount = notes.length + (draft.trim() ? 1 : 0);
  const podMembers = target.podMembers ?? [];
  return (
    <div
      className={`comment-popover${docked ? ' comment-popover-docked' : ''}`}
      data-testid="comment-popover"
      role="dialog"
      aria-modal="false"
      aria-label="Annotation"
      style={docked ? undefined : popoverAnchorStyle(target, scale)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
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
        <div className="comment-popover-actions-start">
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
