import type { ReactNode, ChangeEvent, ClipboardEvent, CSSProperties } from 'react';
import { Button, Textarea } from '@open-design/components';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { PreviewCommentSnapshot } from '../comments';
import { layoutCommentMarkerCluster, projectCommentPoint, type CommentCanvasRect } from '../comments/canvas-geometry';
import { placeCommentPopover } from '../comments/popover-geometry';
import type { Dict } from '../i18n/types';
import type { PreviewComment, PreviewCommentMember } from '../types';
import { isImeComposing } from '../utils/imeComposing';

import { Icon } from './Icon';
import { COMMENT_MAX_CHARACTERS, countCommentCharacters } from '@open-design/contracts';
import { CommentImage } from './CommentBrowse';
import browseStyles from './CommentComposer.module.css';

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

const POPOVER_PAD = 14;
const POPOVER_DEFAULT_WIDTH = 320;
const POPOVER_EXPANDED_ESTIMATED_HEIGHT = 320;
const POPOVER_COLLAPSED_ESTIMATED_HEIGHT = 112;

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

function popoverSizeForPositioning(
  expanded: boolean,
  measuredSize?: PopoverSize,
): PopoverSize {
  return {
    width: measuredSize?.width && measuredSize.width > 0
      ? measuredSize.width
      : POPOVER_DEFAULT_WIDTH,
    height: measuredSize?.height && measuredSize.height > 0
      ? measuredSize.height
      : expanded
        ? POPOVER_EXPANDED_ESTIMATED_HEIGHT
        : POPOVER_COLLAPSED_ESTIMATED_HEIGHT,
  };
}

function popoverAnchorStyle(
  target: PreviewCommentSnapshot,
  scale: number,
  bounds?: PopoverBounds,
  offset: PopoverOffset = { x: 0, y: 0 },
  expanded = true,
  measuredSize?: PopoverSize,
  markerRect?: CommentCanvasRect | null,
): CSSProperties {
  const viewport = {
    left: bounds?.scrollLeft ?? 0, top: bounds?.scrollTop ?? 0,
    width: bounds?.width ?? window.innerWidth, height: bounds?.height ?? window.innerHeight,
  };
  const avatar = markerRect === undefined
    ? layoutCommentMarkerCluster(projectCommentPoint(target, { scale, offset }), 1, viewport)?.avatars[0]
    : markerRect;
  const placement = avatar && placeCommentPopover(avatar, viewport, popoverSizeForPositioning(expanded, measuredSize).height);
  // Keep the mounted editor and its draft while the nearby safe space is unavailable.
  return placement ? { ...placement, boxSizing: 'border-box' } : { visibility: 'hidden', pointerEvents: 'none' };
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

function annotationHoverAnchorStyle(
  target: PreviewCommentSnapshot,
  scale: number,
  bounds?: PopoverBounds,
  offset: PopoverOffset = { x: 0, y: 0 },
  measuredSize?: PopoverSize,
): CSSProperties {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const pad = 14;
  const anchor = target.hoverPoint ?? {
    x: target.position.x + Math.min(target.position.width, 24),
    y: target.position.y + Math.min(target.position.height, 24),
  };
  const anchorX = offset.x + anchor.x * safeScale;
  const anchorY = offset.y + anchor.y * safeScale;
  const preferredLeft = anchorX + pad;
  const preferredTop = anchorY + pad;
  if (!bounds?.width || bounds.width <= 0) {
    return {
      left: clampPopoverCoordinate(preferredLeft, pad),
      top: clampPopoverCoordinate(preferredTop, pad),
    };
  }
  // Keep the card fully inside the preview viewport. The previous logic only
  // clamped the top-left corner to a minimum, so a card near the right/bottom
  // edge ran off-screen and its values were clipped. When the card would spill
  // past an edge, flip it to the opposite side of the anchor; if it still does
  // not fit, pin it to the last on-screen position.
  const viewportLeft = Math.max(0, bounds.scrollLeft ?? 0);
  const viewportTop = Math.max(0, bounds.scrollTop ?? 0);
  const viewportRight = viewportLeft + bounds.width;
  const viewportBottom = bounds.height ? viewportTop + bounds.height : Number.POSITIVE_INFINITY;
  const cardWidth = measuredSize?.width && measuredSize.width > 0 ? measuredSize.width : 240;
  const cardHeight = measuredSize?.height && measuredSize.height > 0 ? measuredSize.height : 132;
  const minLeft = viewportLeft + pad;
  const minTop = viewportTop + pad;
  const maxLeft = Math.max(minLeft, viewportRight - cardWidth - pad);
  let left = preferredLeft;
  if (left > maxLeft) {
    const flipped = anchorX - cardWidth - pad;
    left = flipped >= minLeft ? flipped : maxLeft;
  }
  if (!Number.isFinite(viewportBottom)) {
    return {
      left: clampPopoverRange(left, minLeft, maxLeft),
      top: clampPopoverCoordinate(preferredTop, minTop),
    };
  }
  const maxTop = Math.max(minTop, viewportBottom - cardHeight - pad);
  let top = preferredTop;
  if (top > maxTop) {
    const flipped = anchorY - cardHeight - pad;
    top = flipped >= minTop ? flipped : maxTop;
  }
  return {
    left: clampPopoverRange(left, minLeft, maxLeft),
    top: clampPopoverRange(top, minTop, maxTop),
  };
}

export function AnnotationHoverPopover({
  target,
  scale,
  bounds,
  offset,
  onMouseEnter,
  onMouseLeave,
}: {
  target: PreviewCommentSnapshot;
  scale: number;
  // The preview viewport rect and pan offset, so the card can clamp itself
  // inside the visible canvas instead of overflowing the right/bottom edge.
  bounds?: PopoverBounds;
  offset?: PopoverOffset;
  // The card floats over the preview iframe at the cursor. Moving onto it pulls
  // the pointer off the iframe, which fires mouseout and would otherwise unmount
  // the card — the cursor then lands back on the iframe and re-triggers it,
  // flickering forever. The host uses these to pin the card while it is hovered
  // (ignoring the iframe's leave) so the tooltip stays put and its values stay
  // selectable/copyable.
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardSize, setCardSize] = useState<PopoverSize | undefined>(undefined);
  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      const next = { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
      if (next.width <= 0 || next.height <= 0) return;
      setCardSize((current) =>
        current?.width === next.width && current.height === next.height ? current : next,
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    // Content-driven size changes (a different hovered element yields different
    // rows) are reported by the observer, so a single stable observation covers
    // every target without re-subscribing.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={cardRef}
      className="comment-popover annotation-hover-popover"
      data-testid="annotation-hover-popover"
      role="tooltip"
      style={annotationHoverAnchorStyle(target, scale, bounds, offset, cardSize)}
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
  sendDisabledReason,
  canEditComment = true,
  canDeleteComment = true,
  canSendToAgent = true,
  allowSendToChat = true,
  t,
  scale = 1,
  bounds,
  offset,
  markerRect,
  docked = false,
  commenting = true,
  discardPending = false,
  saveError = false,
  author,
  locationNotice,
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
  onDeleteComment?: (commentId: string) => void | Promise<boolean | void>;
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
  sendDisabledReason?: string;
  /**
   * Team-collab permission gates for an EXISTING comment's action buttons
   * (product model, 庆雨 2026-07-09). All default true so the create flow and
   * every off-team/single-user call site are unaffected. When re-opening a
   * comment the caller sets these from the comment's author vs. the current
   * member + project owner:
   *  - `canEditComment`  — only the author may edit their own note (hides the
   *    save CTA, add-note, attach-image, and makes the textarea read-only).
   *  - `canDeleteComment` — author OR project owner (hides the trash button,
   *    falling back to a plain close button).
   *  - `canSendToAgent`  — author OR project owner (hides the send-to-chat CTA).
   * The B lane enforces the same rules server-side; hiding here just keeps a
   * member from clicking an action they would be 403'd on.
   */
  canEditComment?: boolean;
  canDeleteComment?: boolean;
  canSendToAgent?: boolean;
  allowSendToChat?: boolean;
  t: TranslateFn;
  scale?: number;
  bounds?: PopoverBounds;
  offset?: PopoverOffset;
  /** Current displayed avatar rectangle, in the same host coordinates as bounds. */
  markerRect?: CommentCanvasRect | null;
  docked?: boolean;
  commenting?: boolean;
  /** A pick was held back to protect unsent work; the next pick discards it. */
  discardPending?: boolean;
  saveError?: boolean;
  author?: ReactNode;
  locationNotice?: string;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<CSSProperties>({});
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [detailOverflows, setDetailOverflows] = useState(false);
  const detailRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { setDetailExpanded(false); }, [existing?.id]);
  useLayoutEffect(() => {
    const node = detailRef.current;
    if (!node) return;
    if (detailExpanded) return;
    const measure = () => setDetailOverflows(node.scrollHeight > node.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [existing?.id, existing?.note, detailExpanded]);
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
  const popoverStyle = docked
    ? undefined
    : popoverAnchorStyle(target, scale, bounds, offset, commenting, popoverSize, markerRect);
  const trimmedDraft = draft.trim();
  const existingNote = existing?.note.trim() ?? '';
  const hasFreshImage = images.length > 0;
  // An attached image alone is enough to send (the element context rides along
  // even without a typed note).
  const hasAnyImage = hasFreshImage || existingImages.length > 0;
  // `sendDisabled` (prop) is the external gate (e.g. the chat can't accept the
  // batch right now); combine it with the local "nothing to send" / sending
  // checks so the send-to-chat CTA reflects both.
  const characterCount = countCommentCharacters(draft);
  const overLimit = !existing && characterCount > COMMENT_MAX_CHARACTERS;
  const sendBlocked = (pendingCount === 0 && !hasAnyImage) || sending || sendDisabled || overLimit;
  const isPodSelection = target.selectionKind === 'pod';
  const hasSaveContent = Boolean(trimmedDraft) || hasAnyImage;
  const existingChanged = existing ? trimmedDraft !== existingNote || hasFreshImage : true;
  const saveDisabled = !hasSaveContent || !existingChanged || sending || overLimit;
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
  const actionsMenu = (
          <div className={browseStyles.menu}>
            <button type="button" className={browseStyles.menuToggle} aria-label={t('comment.moreActions')} aria-haspopup="menu" onClick={event => {
              const rect = event.currentTarget.getBoundingClientRect();
              setMenuPosition({ left: Math.min(window.innerWidth - 140, Math.max(16, rect.right - 120)), top: Math.min(window.innerHeight - 110, rect.bottom + 4) });
              menuRef.current?.togglePopover();
            }}>···</button>
            <div ref={menuRef} popover="auto" role="menu" className={browseStyles.menuItems} style={menuPosition}>
              {!existing && canSendToAgent && allowSendToChat ? <button type="button" data-testid="comment-add-send" disabled={sendBlocked} title={sendDisabled ? sendDisabledReason : undefined} onClick={() => void onSendBatch()}>{primaryLabel}</button> : null}
              {existing && onDeleteComment && canDeleteComment ? <button type="button" className={browseStyles.deleteAction} disabled={sending} onClick={() => void onDeleteComment(existing.id)}>{t('common.delete')}</button> : null}
              {isPodSelection && canEditComment && !existing ? <button type="button" data-testid="comment-popover-add-note" disabled={!draft.trim() || sending || overLimit} onClick={onAddDraft}>{t('chat.comments.addNote')}</button> : null}
            </div>
          </div>
  );
  return (
    <div
      ref={popoverRef}
      className={browseStyles.popover}
      data-testid="comment-popover"
      data-existing-comment={Boolean(existing)}
      data-over-limit={overLimit}
      role="dialog"
      aria-modal="false"
      aria-label={`${t('chat.comments.comment')}${target.label ? `: ${target.label}` : ''}`}
      style={popoverStyle}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          if (menuRef.current?.matches(':popover-open')) {
            menuRef.current.hidePopover();
            event.stopPropagation();
            return;
          }
          onClose();
        }
      }}
    >
      {existing && !docked ? (
        <div className={browseStyles.header}>
          <div className={browseStyles.author}>
            {author ?? existing.authorDisplayName ?? t('comment.unknownAuthor')}
          </div>
          {canSendToAgent && allowSendToChat ? <button
            type="button"
            className={browseStyles.iconButton}
            data-testid="comment-add-send"
            disabled={sendBlocked}
            title={sendDisabled ? sendDisabledReason : primaryLabel}
            aria-label={primaryLabel}
            onClick={() => void onSendBatch()}
          ><Icon name="send" size={16} /></button> : null}
          {actionsMenu}
          <button type="button" className={browseStyles.iconButton} aria-label={t('common.close')} onClick={onClose}><Icon name="close" size={14} /></button>
        </div>
      ) : null}
      {/* Everything above the action row scrolls; the action row itself lives
          outside this box (see below) so a height-clamped card can never push
          the buttons out of view. */}
      <div className={browseStyles.body}>
        {!commenting ? <section className={browseStyles.parameters}>
          <AnnotationStyleSummary target={target} testId="comment-popover-style-summary" />
        </section> : null}
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
                  {!existing && canEditComment ? <button
                    type="button"
                    disabled={sending}
                    className="board-pod-chip-remove"
                    onClick={() => onRemoveMember(member.elementId)}
                    onFocus={() => onHoverMember?.(member.elementId)}
                    onBlur={() => onHoverMember?.(null)}
                    aria-label={t('chat.comments.remove')}
                    title={t('chat.comments.remove')}
                  >
                    <Icon name="close" size={14} />
                  </button> : null}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {commenting ? (
          <section className={browseStyles.compose}>
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
              <div className={browseStyles.images}>
                {existingImages.map((item) => (
                  <div key={`saved-${item.url}`} className={browseStyles.image}>
                    <a
                      className={browseStyles.imageThumb}
                      data-testid="comment-popover-existing-image"
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={item.name}
                    >
                      <CommentImage src={item.url} name={item.name} failedLabel={t('comment.imageFailed')} />
                    </a>
                  </div>
                ))}
                {images.map((item, index) => (
                  <div key={item.url} className={browseStyles.image}>
                    <button
                      type="button"
                      className={browseStyles.imageThumb}
                      onClick={() => onPreviewImage?.(index)}
                      title={item.file.name}
                      aria-label={item.file.name}
                    >
                      <img src={item.url} alt="" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={browseStyles.imageRemove}
                      disabled={sending}
                      onClick={() => onRemoveImage?.(index)}
                      aria-label={t('chat.annotationAttachedRemove')}
                      title={t('chat.annotationAttachedRemove')}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {existing && locationNotice ? <p dir="auto" role="status" className={browseStyles.readonlyNote}>{locationNotice}</p> : null}
            {existing ? <div className={browseStyles.detail} data-testid="comment-popover-detail">
              <p dir="auto" ref={detailRef} className={detailExpanded ? browseStyles.expanded : browseStyles.clamped}>{existing.note}</p>
              {detailOverflows || detailExpanded ? <button type="button" onClick={() => setDetailExpanded(value => !value)} aria-expanded={detailExpanded}>
                {t(detailExpanded ? 'chat.comments.collapseBody' : 'chat.comments.expandBody')}
              </button> : null}
            </div> : <Textarea
              dir="auto"
              data-testid="comment-popover-input"
              className={!canEditComment ? 'composer-note--readonly' : undefined}
              value={draft}
              autoFocus={canEditComment}
              readOnly={!canEditComment || sending}
              aria-invalid={overLimit || undefined}
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
                  if (event.repeat) return;
                  // Enter triggers the primary CTA: comment (save) for element
                  // selections, send-to-chat for pod selections. Respect the same
                  // permission gates as the visible buttons so Enter can't perform
                  // an action whose button is hidden.
                  if (isPodSelection) {
                    if (canSendToAgent && !sendBlocked) void onSendBatch();
                  } else if (canEditComment && !saveDisabled) {
                    void onSaveComment();
                  }
                }
              }}
            />}
            {overLimit ? <p dir="auto" role="alert" className={`${browseStyles.error} ${browseStyles.limitError}`}><span>{t('comment.overLimit', { count: characterCount - COMMENT_MAX_CHARACTERS, max: COMMENT_MAX_CHARACTERS })}</span><span dir="ltr" className={browseStyles.counter}>{characterCount} / {COMMENT_MAX_CHARACTERS}</span></p> : null}
            {!existing && saveError ? <p dir="auto" role="alert" className={browseStyles.error}>{t('comment.saveFailed')} <button type="button" disabled={saveDisabled} onClick={() => void onSaveComment()}>{t('preview.retry')}</button></p> : null}
            {/* OP2: explain WHY the textarea is read-only when it's specifically
                a share-page (external) comment — team-member-vs-team-member
                read-only (OP3) has no such reason line, board only asked for
                this on the owner-reads-external-comment case. */}
            {!canEditComment && existing?.authorKind === 'user' ? (
              <p className={browseStyles.readonlyNote}>{t('comment.sharePageCommentReadOnly')}</p>
            ) : null}
            {discardPending ? (
              <p className={browseStyles.readonlyNote} role="status">
                {t('comment.unsentDiscardNotice')}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
      {commenting && !existing ? <div className={browseStyles.actions}>
        <div className={browseStyles.actionsStart}>
          {!existing && onAttachImages && canEditComment ? <>
            <input ref={imageInputRef} type="file" accept="image/*" multiple hidden onChange={onImageInputChange} />
            <button type="button" className={browseStyles.iconButton} disabled={sending} onClick={() => imageInputRef.current?.click()} title={t('chat.annotationAttachImage')} aria-label={t('chat.annotationAttachImage')}><Icon name="image" size={16} /></button>
          </> : null}
        </div>
        {!existing ? actionsMenu : null}
        {!existing && canEditComment ? <button type="button" className={browseStyles.send} data-testid="comment-popover-save" aria-label={t('chat.comments.comment')} disabled={isPodSelection ? sendBlocked : saveDisabled} onClick={() => void (isPodSelection ? onSendBatch() : onSaveComment())}>
          {sending ? <span className={browseStyles.spinner} aria-label={t('common.loading')} /> : <span aria-hidden>↑</span>}
        </button> : null}
      </div> : null}
    </div>
  );
}
