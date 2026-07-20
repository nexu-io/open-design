import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useT } from '../i18n';
import {
  manualEditClampedCenter,
  manualEditGestureRect,
  manualEditMovePreviewTransform,
  manualEditMoveStyles,
  manualEditResizeStyles,
  manualEditSpaceScale,
  snapManualEditGestureRect,
  type ManualEditAlignmentGuide,
  type ManualEditGestureKind,
} from '../edit-mode/gestures';
import { manualEditTooltip } from '../edit-mode/shortcuts';
import type { ManualEditPreviewStyles, ManualEditRect, ManualEditStyles, ManualEditTarget } from '../edit-mode/types';
import { Icon } from './Icon';
import styles from './ManualEditSelectionOverlay.module.css';

export interface ManualEditCropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragState {
  kind: ManualEditGestureKind;
  startRect: ManualEditRect;
  rect: ManualEditRect;
  guides: ManualEditAlignmentGuide[];
  moved: boolean;
  /**
   * The element's REAL box as the iframe last measured it after a resize
   * preview applied. The gesture rect (`rect`) is only the intent: the element
   * it targets can re-center (a `margin:auto` / flex-centred image slides a
   * fixed edge inward as it widens), cap at `max-width`, honor an intrinsic
   * aspect ratio, or reflow inside its parent — so its rendered box drifts from
   * the intent on BOTH axes, not just the reflowed height. The frame draws this
   * measured box (see `displayRect`) so the selection chrome stays locked to
   * the element instead of trailing beside it — the resize "错位" report. Null
   * until the first measurement of a gesture, and always null for moves (they
   * preview through a compositor-only transform and are never measured).
   */
  measured: ManualEditRect | null;
}

/**
 * The rect the frame draws and the commit records. During a resize the iframe
 * reports the element's actual box after each preview; the frame follows THAT
 * so it stays wrapped around the element even when the element re-centers or
 * caps instead of honoring the raw gesture rect. Before the first measurement
 * (and for the whole of a move, which is never measured) it falls back to the
 * gesture rect.
 */
function displayRect(state: DragState): ManualEditRect {
  return state.measured ?? state.rect;
}

interface CropHandleState {
  handle: string;
  startRect: ManualEditRect;
  startPointer: { x: number; y: number };
}

/**
 * Bridges the window between pointer-up and the upstream rect catching up
 * (optimistic commit / od-edit-targets refresh): the frame keeps showing the
 * gesture outcome instead of flashing back to the stale pre-drag rect.
 * `baseline` is the target rect at drop time — any upstream change to it
 * deactivates the hold automatically.
 */
interface HeldRect {
  id: string;
  rect: ManualEditRect;
  baseline: ManualEditRect;
}

function rectsEqual(a: ManualEditRect, b: ManualEditRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

const ACTION_BAR_HEIGHT = 34;
const CROP_MIN_SIZE = 16;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function guidesSignature(guides: ManualEditAlignmentGuide[]): string {
  return guides
    .map((guide) => `${guide.orientation}:${Math.round(guide.position)}:${Math.round(guide.start)}:${Math.round(guide.end)}`)
    .join('|');
}

/**
 * Host-side selection chrome for manual edit mode: the Manus-style frame
 * around the selected element with an action bar (edit params / duplicate /
 * delete, plus replace & crop for images), side handles that resize width,
 * and a top handle that freely moves the element with live alignment guides.
 *
 * Gesture engine: pointermove only records the latest pointer; one rAF tick
 * per frame computes snap geometry, writes the frame position imperatively
 * (no per-move React render), and posts one preview message. Move gestures
 * preview through `transform: translate(...)` so the iframe never re-layouts
 * mid-drag — the final left/top styles are applied once, on release. All
 * geometry flows through the pure helpers in `edit-mode/gestures.ts`; style
 * persistence goes through the same preview/commit pipeline as the inspector
 * panel, so every gesture is undoable.
 */
export function ManualEditSelectionOverlay({
  target,
  targets,
  scale,
  canvasSize,
  busy = false,
  cropActive = false,
  actionBarHidden = false,
  onGesturePreview,
  onGestureCommit,
  onGestureCancel,
  onGestureActiveChange,
  onOpenInspector,
  onDuplicate,
  onDelete,
  onReplaceImage,
  onCropStart,
  onCropCancel,
  onCropApply,
}: {
  target: ManualEditTarget;
  targets: ManualEditTarget[];
  scale: number;
  canvasSize?: { width: number; height: number };
  busy?: boolean;
  cropActive?: boolean;
  /** One toolbar layer at a time: hides the action bar while the text
   * toolbar owns the selection (an active text range inside the element). */
  actionBarHidden?: boolean;
  /**
   * `onApplied` reports the element's rect once the iframe has laid the
   * preview out — only for previews that change layout, so a resize can follow
   * the height its reflowed content took.
   */
  onGesturePreview: (
    partial: ManualEditPreviewStyles,
    onApplied?: (rect: ManualEditRect | null) => void,
  ) => void;
  onGestureCommit: (partial: Partial<ManualEditStyles>, nextRect: ManualEditRect, gesture: 'move' | 'resize') => void;
  onGestureCancel: (touchedKeys: Array<keyof ManualEditStyles>) => void;
  onGestureActiveChange?: (active: boolean) => void;
  onOpenInspector?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReplaceImage?: (file: File) => void;
  onCropStart?: () => void;
  onCropCancel?: () => void;
  onCropApply?: (region: ManualEditCropRegion) => void;
}) {
  const t = useT();
  const [dragKind, setDragKind] = useState<ManualEditGestureKind | null>(null);
  const [guides, setGuides] = useState<ManualEditAlignmentGuide[]>([]);
  const [cropRect, setCropRect] = useState<ManualEditRect | null>(null);
  const [actionBarWidth, setActionBarWidth] = useState(0);
  const dragRef = useRef<DragState | null>(null);
  const heldRectRef = useRef<HeldRect | null>(null);
  const guidesSignatureRef = useRef('');
  const frameRef = useRef<HTMLDivElement | null>(null);
  const actionBarRef = useRef<HTMLDivElement | null>(null);
  const previewFrameRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const effectiveScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  // Host preview zoom converts screen pixels to iframe CSS pixels; this second
  // factor converts those to the element's OWN pixels, which is what its
  // left/top/width mean. They differ whenever something inside the page scales
  // the element's space — a deck stage fitting a 1920x1080 slide.
  const spaceScale = manualEditSpaceScale(target.scale);

  useEffect(() => {
    if (!cropActive) setCropRect(null);
    else setCropRect({ ...target.rect });
    // Re-arm only when crop mode toggles or the selection moves elsewhere —
    // live rect updates during crop should not reset the user's region.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropActive, target.id]);

  useEffect(() => () => {
    if (previewFrameRef.current) cancelAnimationFrame(previewFrameRef.current);
  }, []);

  // The bar's button set varies (image targets add replace/crop), so measure
  // it after every render; the equality guard keeps this from looping.
  useLayoutEffect(() => {
    const width = actionBarRef.current?.offsetWidth ?? 0;
    setActionBarWidth((current) => (current === width ? current : width));
  });

  const held = heldRectRef.current;
  const holdActive = !dragRef.current
    && held !== null
    && held.id === target.id
    && rectsEqual(held.baseline, target.rect);
  if (held && !holdActive && !dragRef.current) heldRectRef.current = null;
  const liveRect = dragRef.current
    ? displayRect(dragRef.current)
    : holdActive ? held.rect : target.rect;
  const frame = {
    left: liveRect.x * effectiveScale,
    top: liveRect.y * effectiveScale,
    width: liveRect.width * effectiveScale,
    height: liveRect.height * effectiveScale,
  };

  const commitStylesForGesture = (state: DragState): Partial<ManualEditStyles> => {
    if (state.kind === 'move') {
      return manualEditMoveStyles(
        target.styles,
        state.rect.x - state.startRect.x,
        state.rect.y - state.startRect.y,
        state.startRect.width,
        spaceScale,
      );
    }
    return manualEditResizeStyles(state.kind, target.styles, state.startRect, state.rect, spaceScale);
  };

  // Move previews are pure compositor work (translate) — the expensive
  // left/top layout styles land exactly once, on commit. The drag offset is
  // composed IN FRONT of the element's own transform so authored centering
  // (translate(-50%,-50%)) survives the preview and release never jumps.
  const previewStylesForGesture = (state: DragState): ManualEditPreviewStyles => {
    if (state.kind === 'move') {
      const dx = round1(state.rect.x - state.startRect.x);
      const dy = round1(state.rect.y - state.startRect.y);
      return { transform: manualEditMovePreviewTransform(dx, dy, target.styles.transform, spaceScale) };
    }
    return manualEditResizeStyles(state.kind, target.styles, state.startRect, state.rect, spaceScale);
  };

  const applyFrameGeometry = (rect: ManualEditRect) => {
    const node = frameRef.current;
    if (!node) return;
    node.style.left = `${rect.x * effectiveScale}px`;
    node.style.top = `${rect.y * effectiveScale}px`;
    node.style.width = `${rect.width * effectiveScale}px`;
    node.style.height = `${rect.height * effectiveScale}px`;
  };

  const syncGuides = (next: ManualEditAlignmentGuide[]) => {
    const signature = guidesSignature(next);
    if (signature === guidesSignatureRef.current) return;
    guidesSignatureRef.current = signature;
    setGuides(next);
  };

  const startGesture = (kind: ManualEditGestureKind) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (busy || cropActive || dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const startPointer = { x: event.clientX, y: event.clientY };
    const lastPointer = { x: event.clientX, y: event.clientY };
    const startRect = { ...target.rect };
    const candidates = targets
      .filter((candidate) => candidate.id !== target.id && !candidate.isHidden)
      .filter((candidate) => candidate.rect.width >= 8 && candidate.rect.height >= 8)
      .slice(0, 400)
      .map((candidate) => candidate.rect);
    if (canvasSize && canvasSize.width > 0) {
      candidates.push({
        x: 0,
        y: 0,
        width: canvasSize.width / effectiveScale,
        height: canvasSize.height / effectiveScale,
      });
    }
    dragRef.current = {
      kind,
      startRect,
      rect: startRect,
      guides: [],
      moved: false,
      measured: null,
    };
    setDragKind(kind);
    onGestureActiveChange?.(true);
    const node = event.currentTarget;
    const ownerDocument = node.ownerDocument;
    const ownerWindow = ownerDocument.defaultView ?? window;
    let finished = false;
    try {
      node.setPointerCapture(event.pointerId);
    } catch {
      // Some browser/automation paths cannot retain capture. Document-level
      // listeners below still finish the gesture instead of leaving it stuck.
    }

    // Lock the frame onto the element's real box after each resize preview.
    // Adopting the FULL measured rect — x and width included, not just the
    // reflowed y/height — is what keeps the frame from drifting off an element
    // that re-centers or caps as it resizes (a widened text box also gets
    // SHORTER as its text pulls onto fewer lines; the height comes back the
    // same way). The gesture still persists the intent (`state.rect`); only the
    // chrome the user sees follows the measurement.
    const adoptMeasuredExtent = (measured: ManualEditRect | null) => {
      const state = dragRef.current;
      if (!state || !measured || state.kind === 'move') return;
      if (state.measured && rectsEqual(state.measured, measured)) return;
      state.measured = measured;
      applyFrameGeometry(displayRect(state));
    };

    const tick = () => {
      previewFrameRef.current = 0;
      const state = dragRef.current;
      if (!state) return;
      const dx = (lastPointer.x - startPointer.x) / effectiveScale;
      const dy = (lastPointer.y - startPointer.y) / effectiveScale;
      const raw = manualEditGestureRect(kind, startRect, dx, dy);
      const snapped = snapManualEditGestureRect(kind, raw, candidates);
      // Coalesced pointer bursts often resolve to the same snapped rect —
      // skip the frame write and the iframe preview message entirely then,
      // so drag cost tracks actual motion instead of pointer frequency.
      if (state.moved && rectsEqual(snapped.rect, state.rect)) {
        syncGuides(snapped.guides);
        return;
      }
      state.rect = snapped.rect;
      state.guides = snapped.guides;
      state.moved = true;
      applyFrameGeometry(displayRect(state));
      syncGuides(snapped.guides);
      onGesturePreview(
        previewStylesForGesture(state),
        state.kind === 'move' ? undefined : adoptMeasuredExtent,
      );
    };
    const schedule = () => {
      if (previewFrameRef.current) return;
      previewFrameRef.current = requestAnimationFrame(tick);
    };
    const flushScheduledTick = () => {
      if (!previewFrameRef.current) return;
      cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = 0;
      tick();
    };

    const finish = (commit: boolean) => {
      if (finished) return;
      // A short physical drag can release capture before the next rAF. Commit
      // paths must consume the last pointermove synchronously or they will
      // misclassify a real move as a click and snap the frame back.
      if (commit) flushScheduledTick();
      finished = true;
      ownerDocument.removeEventListener('pointermove', onMove);
      ownerDocument.removeEventListener('pointerup', onUp);
      ownerDocument.removeEventListener('pointercancel', onCancel);
      node.removeEventListener('lostpointercapture', onLostCapture);
      ownerWindow.removeEventListener('keydown', onKey, true);
      ownerWindow.removeEventListener('blur', onBlur);
      try {
        if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
      } catch {
        // Capture may already have been released by the browser. Cleanup and
        // commit/cancel are intentionally independent from that DOM detail.
      }
      const state = dragRef.current;
      dragRef.current = null;
      setDragKind(null);
      syncGuides([]);
      onGestureActiveChange?.(false);
      if (previewFrameRef.current) {
        cancelAnimationFrame(previewFrameRef.current);
        previewFrameRef.current = 0;
      }
      if (!state || !state.moved) {
        applyFrameGeometry(target.rect);
        return;
      }
      // Hold the frame at the outcome position until the upstream rect
      // catches up (optimistic commit / refresh); cancel snaps straight back.
      const outcome = displayRect(state);
      applyFrameGeometry(commit ? outcome : state.startRect);
      heldRectRef.current = commit
        ? { id: target.id, rect: outcome, baseline: { ...target.rect } }
        : null;
      const partial = commitStylesForGesture(state);
      if (commit) {
        onGestureCommit(partial, outcome, state.kind === 'move' ? 'move' : 'resize');
      } else {
        onGestureCancel(Object.keys(partial) as Array<keyof ManualEditStyles>);
      }
    };

    const onMove = (moveEvent: PointerEvent) => {
      if (!dragRef.current) return;
      lastPointer.x = moveEvent.clientX;
      lastPointer.y = moveEvent.clientY;
      schedule();
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    // Some OS/browser automation paths end a physical drag by dropping
    // capture without delivering pointerup back to the captured node. If a
    // frame was already rendered, preserve exactly what the user saw instead
    // of snapping it back; a loss before any movement remains a cancel.
    const onLostCapture = () => {
      flushScheduledTick();
      finish(Boolean(dragRef.current?.moved));
    };
    const onBlur = () => finish(false);
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== 'Escape') return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      finish(false);
    };
    // Pointer capture normally retargets these events to `node`, but real OS
    // drags can lose that routing when the pointer crosses iframe/window
    // boundaries. Listening on the owning document closes the gesture in
    // either case; lost capture/blur are explicit cancel fallbacks.
    ownerDocument.addEventListener('pointermove', onMove);
    ownerDocument.addEventListener('pointerup', onUp);
    ownerDocument.addEventListener('pointercancel', onCancel);
    node.addEventListener('lostpointercapture', onLostCapture);
    ownerWindow.addEventListener('keydown', onKey, true);
    ownerWindow.addEventListener('blur', onBlur);
  };

  const startCropGesture = (handle: string) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!cropRect) return;
    event.preventDefault();
    event.stopPropagation();
    const start: CropHandleState = {
      handle,
      startRect: { ...cropRect },
      startPointer: { x: event.clientX, y: event.clientY },
    };
    const node = event.currentTarget;
    const ownerDocument = node.ownerDocument;
    const ownerWindow = ownerDocument.defaultView ?? window;
    let finished = false;
    try {
      node.setPointerCapture(event.pointerId);
    } catch {
      // The document listeners below remain sufficient without capture.
    }
    const bounds = target.rect;
    const onMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - start.startPointer.x) / effectiveScale;
      const dy = (moveEvent.clientY - start.startPointer.y) / effectiveScale;
      setCropRect(applyCropHandleDelta(start.startRect, bounds, start.handle, dx, dy));
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      ownerDocument.removeEventListener('pointermove', onMove);
      ownerDocument.removeEventListener('pointerup', finish);
      ownerDocument.removeEventListener('pointercancel', finish);
      node.removeEventListener('lostpointercapture', finish);
      ownerWindow.removeEventListener('blur', finish);
      try {
        if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
      } catch {
        // Capture may already be gone; the crop state is still valid.
      }
    };
    ownerDocument.addEventListener('pointermove', onMove);
    ownerDocument.addEventListener('pointerup', finish);
    ownerDocument.addEventListener('pointercancel', finish);
    node.addEventListener('lostpointercapture', finish);
    ownerWindow.addEventListener('blur', finish);
  };

  const isImage = target.kind === 'image';
  const barTop = Math.max(4, frame.top - ACTION_BAR_HEIGHT - 8);
  const barLeft = manualEditClampedCenter(
    frame.left + frame.width / 2,
    actionBarWidth || 120,
    canvasSize?.width,
    4,
  );

  if (cropActive && isImage && cropRect) {
    const crop = {
      left: cropRect.x * effectiveScale,
      top: cropRect.y * effectiveScale,
      width: cropRect.width * effectiveScale,
      height: cropRect.height * effectiveScale,
    };
    return (
      <div
        className={`${styles.layer} ${styles.layerGestureActive}`}
        data-testid="manual-edit-crop-overlay"
        data-gesture-active="true"
      >
        <div className={styles.cropMask} style={{ left: frame.left, top: frame.top, width: frame.width, height: crop.top - frame.top }} />
        <div className={styles.cropMask} style={{ left: frame.left, top: crop.top + crop.height, width: frame.width, height: Math.max(0, frame.top + frame.height - crop.top - crop.height) }} />
        <div className={styles.cropMask} style={{ left: frame.left, top: crop.top, width: crop.left - frame.left, height: crop.height }} />
        <div className={styles.cropMask} style={{ left: crop.left + crop.width, top: crop.top, width: Math.max(0, frame.left + frame.width - crop.left - crop.width), height: crop.height }} />
        <div
          className={styles.cropWindow}
          style={{ left: crop.left, top: crop.top, width: crop.width, height: crop.height }}
          onPointerDown={startCropGesture('move')}
        >
          {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => (
            <div
              key={handle}
              className={`${styles.cropHandle} ${styles[`cropHandle-${handle}`] ?? ''}`}
              onPointerDown={startCropGesture(handle)}
            />
          ))}
        </div>
        <div
          className={styles.cropActions}
          style={{
            left: manualEditClampedCenter(crop.left + crop.width / 2, 150, canvasSize?.width, 4),
            top: Math.min((canvasSize?.height ?? Infinity) - 44, crop.top + crop.height + 10),
          }}
        >
          <button
            type="button"
            className={styles.cropButton}
            data-testid="manual-edit-crop-cancel"
            onClick={() => onCropCancel?.()}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={`${styles.cropButton} ${styles.cropButtonPrimary}`}
            data-testid="manual-edit-crop-apply"
            disabled={busy}
            onClick={() => {
              if (!cropRect || target.rect.width <= 0 || target.rect.height <= 0) return;
              onCropApply?.({
                x: (cropRect.x - target.rect.x) / target.rect.width,
                y: (cropRect.y - target.rect.y) / target.rect.height,
                width: cropRect.width / target.rect.width,
                height: cropRect.height / target.rect.height,
              });
            }}
          >
            {t('manualEdit.applyCrop')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.layer}${dragKind ? ` ${styles.layerGestureActive}` : ''}`}
      data-testid="manual-edit-overlay-layer"
      data-gesture-active={dragKind ? 'true' : 'false'}
    >
      {guides.map((guide, index) => (
        <div
          key={`${guide.orientation}-${index}`}
          className={guide.orientation === 'vertical' ? styles.guideVertical : styles.guideHorizontal}
          style={
            guide.orientation === 'vertical'
              ? {
                  left: guide.position * effectiveScale,
                  top: guide.start * effectiveScale,
                  height: (guide.end - guide.start) * effectiveScale,
                }
              : {
                  top: guide.position * effectiveScale,
                  left: guide.start * effectiveScale,
                  width: (guide.end - guide.start) * effectiveScale,
                }
          }
        />
      ))}
      <div
        ref={frameRef}
        className={`${styles.frame}${dragKind ? ` ${styles.frameDragging}` : ''}`}
        data-testid="manual-edit-selection-frame"
        style={frame}
      >
        {isImage ? (
          // Whole-image move surface: dragging anywhere on the picture moves it,
          // so moving no longer requires grabbing the top pill. Rendered before
          // the handles so their edge hit areas paint on top and still resize.
          // Scoped to images — text/link bodies stay click-to-edit.
          <div
            className={styles.moveBody}
            data-testid="manual-edit-move-body"
            title={t('manualEdit.moveElement')}
            onPointerDown={startGesture('move')}
          />
        ) : null}
        <div
          className={styles.moveHandle}
          data-testid="manual-edit-move-handle"
          title={t('manualEdit.moveElement')}
          onPointerDown={startGesture('move')}
        />
        <div
          className={`${styles.sideHandle} ${styles.sideHandleLeft}`}
          data-testid="manual-edit-resize-left"
          onPointerDown={startGesture('resize-left')}
        />
        <div
          className={`${styles.sideHandle} ${styles.sideHandleRight}`}
          data-testid="manual-edit-resize-right"
          onPointerDown={startGesture('resize-right')}
        />
      </div>
      {!dragKind && !actionBarHidden ? (
        <div
          ref={actionBarRef}
          className={styles.actionBar}
          data-testid="manual-edit-action-bar"
          style={{ left: barLeft, top: barTop }}
        >
          {isImage && onReplaceImage ? (
            <>
              <button
                type="button"
                className={`${styles.actionButton} od-tooltip`}
                data-tooltip={t('manualEdit.replaceImage')}
                data-tooltip-placement="bottom"
                aria-label={t('manualEdit.replaceImage')}
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                <Icon name="image" size={15} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  if (!file) return;
                  // Native picker handles can become stale after the change
                  // turn (and clearing the input makes that window wider).
                  // Snapshot the bytes while the browser still owns the
                  // handle, then upload a detached File just like paste/drop.
                  void file.arrayBuffer()
                    .then((buffer) => {
                      input.value = '';
                      onReplaceImage(new File([buffer], file.name, {
                        type: file.type,
                        lastModified: file.lastModified,
                      }));
                    })
                    .catch(() => {
                      // Preserve the existing upload path for unusual browser
                      // File implementations that cannot expose ArrayBuffer.
                      input.value = '';
                      onReplaceImage(file);
                    });
                }}
              />
            </>
          ) : null}
          {isImage && onCropStart ? (
            <button
              type="button"
              className={`${styles.actionButton} od-tooltip`}
              data-testid="manual-edit-crop-start"
              data-tooltip={t('manualEdit.cropImage')}
              data-tooltip-placement="bottom"
              aria-label={t('manualEdit.cropImage')}
              disabled={busy}
              onClick={onCropStart}
            >
              <Icon name="crop" size={15} />
            </button>
          ) : null}
          {onOpenInspector ? (
            <button
              type="button"
              className={`${styles.actionButton} od-tooltip`}
              data-testid="manual-edit-open-inspector"
              data-tooltip={t('manualEdit.editParams')}
              data-tooltip-placement="bottom"
              aria-label={t('manualEdit.editParams')}
              onClick={onOpenInspector}
            >
              <Icon name="sliders" size={15} />
            </button>
          ) : null}
          <button
            type="button"
            className={`${styles.actionButton} od-tooltip`}
            data-testid="manual-edit-duplicate"
            data-tooltip={manualEditTooltip(t('manualEdit.duplicateElement'), 'duplicate')}
            data-tooltip-placement="bottom"
            aria-label={t('manualEdit.duplicateElement')}
            disabled={busy}
            onClick={onDuplicate}
          >
            <Icon name="copy" size={15} />
          </button>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.actionButtonDanger} od-tooltip`}
            data-testid="manual-edit-delete"
            data-tooltip={manualEditTooltip(t('manualEdit.deleteElement'), 'delete')}
            data-tooltip-placement="bottom"
            aria-label={t('manualEdit.deleteElement')}
            disabled={busy}
            onClick={onDelete}
          >
            <Icon name="trash" size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function applyCropHandleDelta(
  start: ManualEditRect,
  bounds: ManualEditRect,
  handle: string,
  dx: number,
  dy: number,
): ManualEditRect {
  const clampX = (value: number) => Math.min(Math.max(value, bounds.x), bounds.x + bounds.width);
  const clampY = (value: number) => Math.min(Math.max(value, bounds.y), bounds.y + bounds.height);
  if (handle === 'move') {
    const x = Math.min(Math.max(start.x + dx, bounds.x), bounds.x + bounds.width - start.width);
    const y = Math.min(Math.max(start.y + dy, bounds.y), bounds.y + bounds.height - start.height);
    return { ...start, x, y };
  }
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (handle.includes('w')) left = clampX(Math.min(start.x + dx, right - CROP_MIN_SIZE));
  if (handle.includes('e')) right = clampX(Math.max(right + dx, left + CROP_MIN_SIZE));
  if (handle.includes('n')) top = clampY(Math.min(start.y + dy, bottom - CROP_MIN_SIZE));
  if (handle.includes('s')) bottom = clampY(Math.max(bottom + dy, top + CROP_MIN_SIZE));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
