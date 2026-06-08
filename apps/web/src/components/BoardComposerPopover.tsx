import type { ChangeEvent, ClipboardEvent, CSSProperties } from 'react';
import { Button, Textarea } from '@open-design/components';
import { useLayoutEffect, useRef, useState } from 'react';

import type { PreviewCommentSnapshot } from '../comments';
import type { Dict } from '../i18n/types';
import type { PreviewComment, PreviewCommentMember } from '../types';
import { isImeComposing } from '../utils/imeComposing';

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
type PopoverBounds = { width: number; height: number; scrollLeft?: number; scrollTop?: number };
type PopoverOffset = { x: number; y: number };
type PopoverSize = { width: number; height: number };

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

function clampPopoverRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function popoverAnchorStyle(
  target: PreviewCommentSnapshot,
  scale: number,
  bounds?: PopoverBounds,
  offset: PopoverOffset = { x: 0, y: 0 },
  expanded = true,
  measuredSize?: PopoverSize,
): CSSProperties {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const anchor = target.hoverPoint ?? {
    x: target.position.x + Math.min(target.position.width, 24),
    y: target.position.y + Math.min(target.position.height, 24),
  };
  const pad = 14;
  const overlapOffset = 8;
  const width = 320;
  const estimatedHeight = expanded ? 252 : 112;
  const anchorX = offset.x + anchor.x * safeScale;
  const anchorY = offset.y + anchor.y * safeScale;
  const preferredLeft = clampPopoverCoordinate(anchorX + pad, pad);
  const preferredTop = clampPopoverCoordinate(anchorY + pad, pad);
  if (bounds?.width && bounds.width > 0) {
    const viewportLeft = Math.max(0, bounds.scrollLeft ?? 0);
    const viewportTop = Math.max(0, bounds.scrollTop ?? 0);
    const viewportRight = viewportLeft + bounds.width;
    const viewportBottom = bounds.height ? viewportTop + bounds.height : Number.POSITIVE_INFINITY;
    const position = target.position;
    const rect = {
      left: offset.x + position.x * safeScale,
      top: offset.y + position.y * safeScale,
      width: Math.max(1, position.width * safeScale),
      height: Math.max(1, position.height * safeScale),
    };
    const rectRight = rect.left + rect.width;
    const rectBottom = rect.top + rect.height;
    const measuredWidth = measuredSize?.width && measuredSize.width > 0 ? measuredSize.width : width;
    const measuredHeight = measuredSize?.height && measuredSize.height > 0
      ? measuredSize.height
      : expanded
        ? 320
        : estimatedHeight;
    const minLeft = viewportLeft + pad;
    const minTop = viewportTop + pad;
    const maxLeft = Math.max(minLeft, viewportRight - measuredWidth - pad);
    const maxTop = Number.isFinite(viewportBottom)
      ? Math.max(minTop, viewportBottom - measuredHeight - pad)
      : preferredTop;
    const spaces = [
      { side: 'top' as const, space: rect.top - viewportTop - pad, fits: rect.top - viewportTop - pad >= measuredHeight },
      { side: 'bottom' as const, space: viewportBottom - rectBottom - pad, fits: viewportBottom - rectBottom - pad >= measuredHeight },
      { side: 'left' as const, space: rect.left - viewportLeft - pad, fits: rect.left - viewportLeft - pad >= measuredWidth },
      { side: 'right' as const, space: viewportRight - rectRight - pad, fits: viewportRight - rectRight - pad >= measuredWidth },
    ];
    const sorted = spaces
      .filter((item) => Number.isFinite(item.space))
      .sort((a, b) => Number(b.fits) - Number(a.fits) || b.space - a.space);
    const side = sorted[0]?.side ?? 'bottom';
    const centerLeft = rect.left + rect.width / 2 - measuredWidth / 2;
    const centerTop = rect.top + rect.height / 2 - measuredHeight / 2;
    const withVisibleHeight = (left: number, top: number): CSSProperties => {
      const clampedTop = clampPopoverRange(top, minTop, maxTop);
      const maxHeight = Number.isFinite(viewportBottom)
        ? Math.max(120, Math.floor(viewportBottom - clampedTop - pad))
        : undefined;
      return {
        left: clampPopoverRange(left, minLeft, maxLeft),
        top: clampedTop,
        ...(maxHeight ? { maxHeight } : {}),
      };
    };
    if (side === 'top' && sorted[0]?.fits) {
      return withVisibleHeight(centerLeft, rect.top - measuredHeight - pad);
    }
    if (side === 'bottom' && sorted[0]?.fits) {
      return withVisibleHeight(centerLeft, rectBottom + pad);
    }
    if (side === 'left' && sorted[0]?.fits) {
      return withVisibleHeight(rect.left - measuredWidth - pad, centerTop);
    }
    if (side === 'right' && sorted[0]?.fits) {
      return withVisibleHeight(rectRight + pad, centerTop);
    }
    return withVisibleHeight(
      anchorX + pad + measuredWidth <= viewportRight - pad ? anchorX + pad : anchorX - measuredWidth - pad,
      anchorY + overlapOffset,
    );
  }
  return {
    left: preferredLeft,
    top: preferredTop,
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

function annotationHoverAnchorStyle(target: PreviewCommentSnapshot, scale: number): CSSProperties {
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

export function AnnotationHoverPopover({
  target,
  scale,
  onMouseEnter,
  onMouseLeave,
}: {
  target: PreviewCommentSnapshot;
  scale: number;
  // The card floats over the preview iframe at the cursor. Moving onto it pulls
  // the pointer off the iframe, which fires mouseout and would otherwise unmount
  // the card — the cursor then lands back on the iframe and re-triggers it,
  // flickering forever. The host uses these to pin the card while it is hovered
  // (ignoring the iframe's leave) so the tooltip stays put and its values stay
  // selectable/copyable.
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <div
      className="comment-popover annotation-hover-popover"
      data-testid="annotation-hover-popover"
      role="tooltip"
      style={annotationHoverAnchorStyle(target, scale)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
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
  onDeleteComment,
  images = [],
  existingImages = [],
  onAttachImages,
  onRemoveImage,
  onPreviewImage,
  sending,
  queueOnSend = false,
  sendDisabled = false,
  t,
  scale = 1,
  bounds,
  offset,
  docked = false,
  commenting = true,
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
  onDeleteComment?: (commentId: string) => void | Promise<void>;
  /** Object-URL thumbnails for images the user attached to this comment. */
  images?: { file: File; url: string }[];
  /** Already-saved attachment thumbnails (read-only) for a re-opened comment. */
  existingImages?: { url: string; name: string }[];
  onAttachImages?: (files: File[]) => void;
  onRemoveImage?: (index: number) => void;
  onPreviewImage?: (index: number) => void;
  sending: boolean;
  queueOnSend?: boolean;
  sendDisabled?: boolean;
  t: TranslateFn;
  scale?: number;
  bounds?: PopoverBounds;
  offset?: PopoverOffset;
  docked?: boolean;
  commenting?: boolean;
}) {
  const pendingCount = notes.length + (draft.trim() ? 1 : 0);
  const podMembers = target.podMembers ?? [];
  const composingRef = useRef(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverSize, setPopoverSize] = useState<PopoverSize | undefined>(undefined);
  useLayoutEffect(() => {
    const node = popoverRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      const next = {
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),
      };
      if (next.width <= 0 || next.height <= 0) return;
      setPopoverSize((current) =>
        current?.width === next.width && current.height === next.height ? current : next,
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
    // Key only on `commenting` (which mounts/unmounts the compose section, so
    // the observed node identity can change). Content-driven size changes —
    // typing in the textarea, adding images/notes — are reported by the
    // ResizeObserver itself, so listing draft/images/notes here only churned a
    // teardown + re-observe + synchronous getBoundingClientRect on every keystroke.
  }, [commenting]);
  const trimmedDraft = draft.trim();
  const existingNote = existing?.note.trim() ?? '';
  const hasFreshImage = images.length > 0;
  // An attached image alone is enough to send (the element context rides along
  // even without a typed note).
  const hasAnyImage = hasFreshImage || existingImages.length > 0;
  // `sendDisabled` (prop) is the external gate (e.g. the chat can't accept the
  // batch right now); combine it with the local "nothing to send" / sending
  // checks so the send-to-chat CTA reflects both.
  const sendBlocked = (pendingCount === 0 && !hasAnyImage) || sending || sendDisabled;
  const isPodSelection = target.selectionKind === 'pod';
  const hasSaveContent = Boolean(trimmedDraft) || hasAnyImage;
  const existingChanged = existing ? trimmedDraft !== existingNote || hasFreshImage : true;
  const saveDisabled = !hasSaveContent || !existingChanged || sending;
  // Queue-on-send swaps the primary label to the annotation-queue wording.
  const primaryLabel = sending
    ? t('chat.comments.sending')
    : queueOnSend
      ? t('chat.annotationQueue')
      : t('chat.comments.sendToChat');
  function pickImages(list: FileList | null) {
    const imgs = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
    if (imgs.length > 0) onAttachImages?.(imgs);
  }
  function onImageInputChange(e: ChangeEvent<HTMLInputElement>) {
    pickImages(e.target.files);
    e.target.value = '';
  }
  function onComposerPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = e.clipboardData?.files;
    if (!files || files.length === 0) return;
    const imgs = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imgs.length === 0) return;
    e.preventDefault();
    onAttachImages?.(imgs);
  }
  return (
    <div
      ref={popoverRef}
      className={`comment-popover${docked ? ' comment-popover-docked' : ''}`}
      data-testid="comment-popover"
      role="dialog"
      aria-modal="false"
      aria-label="Annotation"
      style={docked ? undefined : popoverAnchorStyle(target, scale, bounds, offset, commenting, popoverSize)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <section className="comment-popover-section comment-popover-section-params">
        <AnnotationStyleSummary target={target} testId="comment-popover-style-summary" />
      </section>
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
      {commenting ? (
        <section className="comment-popover-section comment-popover-section-compose">
          {notes.length > 0 ? (
            <div className="board-note-list">
              {notes.map((note, index) => (
                <div key={`${target.elementId}-${index}`} className="board-note-item">
                  <span>{note}</span>
                  <Button variant="ghost" onClick={() => onRemoveQueuedNote(index)}>
                    {t('chat.comments.remove')}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
          {existingImages.length > 0 || images.length > 0 ? (
            <div className="comment-popover-images">
              {existingImages.map((item) => (
                <div key={`saved-${item.url}`} className="comment-popover-image">
                  <a
                    className="comment-popover-image-thumb"
                    data-testid="comment-popover-existing-image"
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={item.name}
                  >
                    <img src={item.url} alt="" aria-hidden />
                  </a>
                </div>
              ))}
              {images.map((item, index) => (
                <div key={item.url} className="comment-popover-image">
                  <button
                    type="button"
                    className="comment-popover-image-thumb"
                    onClick={() => onPreviewImage?.(index)}
                    title={item.file.name}
                    aria-label={item.file.name}
                  >
                    <img src={item.url} alt="" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="comment-popover-image-remove"
                    onClick={() => onRemoveImage?.(index)}
                    aria-label={t('chat.annotationAttachedRemove')}
                    title={t('chat.annotationAttachedRemove')}
                  >
                    <Icon name="close" size={10} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <Textarea
            data-testid="comment-popover-input"
            value={draft}
            autoFocus
            aria-label={t('chat.comments.placeholder')}
            placeholder={t('chat.comments.placeholder')}
            onChange={(event) => onDraft(event.target.value)}
            onPaste={onComposerPaste}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            onKeyDown={(event) => {
              if (isImeComposing(event, composingRef.current)) return;
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.altKey
              ) {
                event.preventDefault();
                // Enter triggers the primary CTA: comment (save) for element
                // selections, send-to-chat for pod selections.
                if (isPodSelection) {
                  if (!sendBlocked) void onSendBatch();
                } else if (!saveDisabled) {
                  void onSaveComment();
                }
              }
            }}
          />
          <div className="comment-popover-actions">
            <div className="comment-popover-actions-start">
              {onAttachImages ? (
                <>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={onImageInputChange}
                  />
                  <button
                    type="button"
                    className="comment-popover-close"
                    onClick={() => imageInputRef.current?.click()}
                    title={t('chat.annotationAttachImage')}
                    aria-label={t('chat.annotationAttachImage')}
                  >
                    <Icon name="attach" size={13} />
                  </button>
                </>
              ) : null}
              {existing && onDeleteComment ? (
                <button
                  type="button"
                  className="comment-popover-close comment-popover-delete"
                  onClick={() => void onDeleteComment(existing.id)}
                  title={t('common.delete')}
                  aria-label={t('common.delete')}
                >
                  <Icon name="trash" size={13} />
                </button>
              ) : (
                <button
                  type="button"
                  className="comment-popover-close"
                  onClick={onClose}
                  title={t('common.close')}
                  aria-label={t('common.close')}
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
            <div className="comment-popover-actions-end">
              {isPodSelection ? (
                <>
                  {/* Pod: add-note is secondary, send-to-chat is the primary CTA. */}
                  <Button
                    variant="ghost"
                    data-testid="comment-popover-add-note"
                    disabled={!draft.trim()}
                    onClick={onAddDraft}
                  >
                    {t('chat.comments.addNote')}
                  </Button>
                  <Button
                    variant="primary"
                    data-testid="comment-add-send"
                    disabled={sendBlocked}
                    onClick={() => void onSendBatch()}
                  >
                    {primaryLabel}
                  </Button>
                </>
              ) : (
                <>
                  {/* Element: comment (save) is the primary CTA (also Enter);
                      send-to-chat is secondary. */}
                  <Button
                    variant="ghost"
                    data-testid="comment-add-send"
                    disabled={sendBlocked}
                    onClick={() => void onSendBatch()}
                  >
                    {primaryLabel}
                  </Button>
                  <Button
                    variant="primary"
                    data-testid="comment-popover-save"
                    disabled={saveDisabled}
                    onClick={() => void onSaveComment()}
                  >
                    {t('chat.comments.comment')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
