import { useI18n } from "../../i18n/I18n";
import type { DomSelectionResult } from "../../hooks/useDomSelectionTypes";
import type { RotationCommit } from "./rotationDraft";
import { memo, useEffect, useMemo, useRef, type RefObject } from "react";
import { type DomEditSelection } from "./domEditing";
import type { PreviewMouseDownOptions } from "../../hooks/usePreviewInteraction";
import { useMarqueeGestures } from "./marqueeCommit";
import { MarqueeOverlay } from "./MarqueeOverlay";
import { resolveDomEditGroupOverlayRect } from "./domEditOverlayGeometry";
import { useZOrderCrossedFlash, ZOrderCrossedFlash } from "./useZOrderCrossedFlash";
import { useCanvasContextMenuState } from "./useCanvasContextMenuState";
import {
  type BlockedMoveState,
  type WaitingPressState,
  type DomEditGroupPathOffsetCommit,
  type FocusableDomEditOverlay,
  type MoveCommitOptions,
  type GestureState,
  type GroupGestureState,
  focusDomEditOverlayElement,
  resolveShiftClickCandidate,
} from "./domEditOverlayGestures";
import { useDomEditOverlayRects } from "./useDomEditOverlayRects";
import { ChildRectOutlines, OffCanvasIndicators } from "./OffCanvasIndicators";
import { createDomEditOverlayGestureHandlers } from "./useDomEditOverlayGestures";
import { useDomEditNudge } from "./useDomEditNudge";
import { SnapGuideOverlay, type SnapGuidesState } from "./SnapGuideOverlay";
import type { GestureRecordingState } from "./GestureRecordControl";
import { DomEditGroupChrome, DomEditSelectionChrome } from "./DomEditSelectionChrome";
import { hugRectForElement } from "./domEditOverlayCrop";
import { useCropOverlay } from "../../hooks/useCropOverlay";
import { readDomEditSelectionShapeStyles, resolveBoxChromeClass } from "./domEditOverlayShape";
import { useDomEditCompositionRect } from "./useDomEditCompositionRect";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { useInlineTextEditing } from "./useInlineTextEditing";
import { usePreviewReadOnly } from "./previewReadOnlyContext";
import { useMountEffect } from "../../hooks/useMountEffect";
import { countStudioManualEditSave as counted } from "./manualEditsDom";
import type { ZOrderAction, ZOrderPatch } from "./canvasContextMenuZOrder";
import { getPreviewTargetFromPointer } from "../../utils/studioPreviewHelpers";
import { logSelect } from "../../utils/selectDebug";
import { useOffCanvasIndicators } from "./useOffCanvasIndicators";

// Re-exports for external consumers — preserving existing import paths.
export {
  filterNestedDomEditGroupItems,
  resolveDomEditCoordinateScale,
  resolveDomEditGroupOverlayRect,
} from "./domEditOverlayGeometry";
export {
  focusDomEditOverlayElement,
  hasDomEditRotationChanged,
  resolveDomEditRotationGesture,
} from "./domEditOverlayGestures";
export type { DomEditGroupPathOffsetCommit, MoveCommitOptions } from "./domEditOverlayGestures";

export interface DomEditOverlayProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  activeCompositionPath: string | null;
  selection: DomEditSelection | null;
  groupSelections?: DomEditSelection[];
  hoverSelection: DomEditSelection | null;
  allowCanvasMovement?: boolean;
  allowBodyDrag?: boolean;
  /** "host": no marquee, box re-select, or body drag if allowBodyDrag is false; Enter still opens text. */
  canvasInput?: "overlay" | "host";
  onTextEditingChange?: (editing: boolean) => void;
  /** A click on a single selection's box, in either mode; the event may be the pointerup. */
  onSelectionBoxClick?: (
    event: React.MouseEvent<HTMLDivElement>,
    selection: DomEditSelection,
  ) => void;
  onCanvasMouseDown: (
    event: React.MouseEvent<HTMLDivElement>,
    options?: PreviewMouseDownOptions,
  ) => void;
  onCanvasPointerMove: (
    event: React.PointerEvent<HTMLDivElement>,
    options?: { preferClipAncestor?: boolean },
  ) => Promise<DomEditSelection | null>;
  onCanvasPointerLeave: () => void;
  onSelectionChange: (
    selection: DomEditSelection,
    options?: { revealPanel?: boolean; additive?: boolean },
  ) => void;
  onBlockedMove: (selection: DomEditSelection, reason?: string) => void;
  onManualDragStart?: () => void;
  onPathOffsetCommit: (
    selection: DomEditSelection,
    next: { x: number; y: number },
    modifiers?: MoveCommitOptions,
  ) => Promise<unknown> | void;
  onGroupPathOffsetCommit: (updates: DomEditGroupPathOffsetCommit[]) => Promise<unknown> | void;
  onBoxSizeCommit: (
    selection: DomEditSelection,
    next: { width: number; height: number },
    offset?: { x: number; y: number },
    restore?: () => void,
    route?: { plainTranslate: boolean },
  ) => Promise<unknown> | void;
  onRotationCommit: (selection: DomEditSelection, next: RotationCommit) => Promise<unknown> | void;
  onStyleCommit?: (property: string, value: string) => Promise<unknown> | void;
  recordingState?: GestureRecordingState;
  onToggleRecording?: () => void;
  onMarqueeSelect?: (
    selections: DomEditSelection[],
    additive: boolean,
  ) => DomSelectionResult | void;
  /**
   * Delete the selected canvas element.
   * Wire to handleDomEditElementDelete from useDomEditActionsContext —
   * same handler the Delete/Backspace hotkey uses.
   */
  onDeleteSelection?: (selection: DomEditSelection) => void;
  /**
   * Called with the resolved z-order patch list and the menu action that
   * produced it (feeds the undo coalesce key). The patch list is tie-aware and
   * may include sibling elements (see canvasContextMenuZOrder); the live DOM is
   * NOT yet mutated. Wire to handleDomZIndexReorderCommit from
   * useDomEditActionsContext. See CanvasContextMenu.tsx module comment.
   */
  onApplyZIndex?: (
    selection: DomEditSelection,
    patches: ZOrderPatch[],
    action: ZOrderAction,
    /** Sibling a forward/backward step moved past (pre-mutation render order);
     *  null for front/back. Feeds the timeline z-mirror's crossedKey. */
    crossed: HTMLElement | null,
  ) => void;
}

// fallow-ignore-next-line complexity
export const DomEditOverlay = memo(function DomEditOverlay({
  iframeRef,
  activeCompositionPath,
  selection,
  groupSelections = [],
  hoverSelection,
  allowCanvasMovement = true,
  allowBodyDrag = true,
  canvasInput = "overlay",
  onTextEditingChange,
  onSelectionBoxClick,
  onCanvasMouseDown: onCanvasMouseDownProp,
  onCanvasPointerMove,
  onCanvasPointerLeave,
  onSelectionChange,
  onBlockedMove,
  onManualDragStart,
  onPathOffsetCommit,
  onGroupPathOffsetCommit,
  onBoxSizeCommit,
  onRotationCommit,
  onStyleCommit,
  onMarqueeSelect,
  onDeleteSelection,
  onApplyZIndex,
}: DomEditOverlayProps) {
  const { t } = useI18n();
  const readOnly = usePreviewReadOnly();
  const hostInput = canvasInput === "host";
  const bodyDrag = allowBodyDrag || !hostInput;
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const onMarqueeSelectRef = useRef(onMarqueeSelect);
  onMarqueeSelectRef.current = onMarqueeSelect;

  const selectionShapeStyles = readDomEditSelectionShapeStyles(selection);
  const gestureRef = useRef<GestureState | null>(null);
  const groupGestureRef = useRef<GroupGestureState | null>(null);
  const blockedMoveRef = useRef<BlockedMoveState | null>(null);
  const waitingPressRef = useRef<WaitingPressState | null>(null);
  const suppressNextBoxClickRef = useRef(false);
  const snapGuidesRef = useRef<SnapGuidesState | null>(null);
  const rafPausedRef = useRef(false);

  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const onCanvasMouseDown: typeof onCanvasMouseDownProp = (event, options) => {
    const sel = selectionRef.current;
    if (sel && boxRef.current?.contains(event.target as Node | null)) {
      onSelectionBoxClick?.(event, sel);
    }
    if (!hostInput) onCanvasMouseDownProp(event, options);
  };

  // Brief highlight on the sibling a forward/backward z step crossed — drawn
  // in this studio overlay, never in the iframe DOM (see useZOrderCrossedFlash).
  const { zOrderFlashRect, handleZOrderCrossed } = useZOrderCrossedFlash({ overlayRef, iframeRef });

  const activeCompositionPathRef = useRef(activeCompositionPath);
  activeCompositionPathRef.current = activeCompositionPath;
  const groupSelectionsRef = useRef(groupSelections);
  groupSelectionsRef.current = groupSelections;
  const hoverSelectionRef = useRef(hoverSelection);
  hoverSelectionRef.current = hoverSelection;

  // Double-click an element to edit its text where it sits.
  const inlineText = useInlineTextEditing(selectionRef, { enterFromWindow: hostInput });
  const onTextEditingChangeRef = useRef(onTextEditingChange);
  onTextEditingChangeRef.current = onTextEditingChange;
  useEffect(() => {
    if (!inlineText.editing) return;
    onTextEditingChangeRef.current?.(true);
    return () => onTextEditingChangeRef.current?.(false);
  }, [inlineText.editing]);
  // Each canvas save is counted, so a reload requested before it settles loads again.
  const onPathOffsetCommitRef = useRef(onPathOffsetCommit);
  onPathOffsetCommitRef.current = (sel, ...rest) =>
    counted(sel.element, () => onPathOffsetCommit(sel, ...rest));
  const onGroupPathOffsetCommitRef = useRef(onGroupPathOffsetCommit);
  onGroupPathOffsetCommitRef.current = (updates) => {
    const save = () => onGroupPathOffsetCommit(updates);
    return updates[0] ? counted(updates[0].selection.element, save) : save();
  };
  const onBoxSizeCommitRef = useRef(onBoxSizeCommit);
  onBoxSizeCommitRef.current = (sel, ...rest) =>
    counted(sel.element, () => onBoxSizeCommit(sel, ...rest));
  const onRotationCommitRef = useRef(onRotationCommit);
  onRotationCommitRef.current = (sel, next) =>
    counted(sel.element, () => onRotationCommit(sel, next));
  const onStyleCommitRef = useRef(onStyleCommit);
  onStyleCommitRef.current =
    onStyleCommit &&
    ((property, value) => {
      const save = () => onStyleCommit(property, value);
      return selectionRef.current ? counted(selectionRef.current.element, save) : save();
    });
  const onBlockedMoveRef = useRef(onBlockedMove);
  onBlockedMoveRef.current = onBlockedMove;
  const onManualDragStartRef = useRef(onManualDragStart);
  onManualDragStartRef.current = onManualDragStart;
  const onCanvasPointerMoveRef = useRef(onCanvasPointerMove);
  onCanvasPointerMoveRef.current = onCanvasPointerMove;
  const onCanvasPointerLeaveRef = useRef(onCanvasPointerLeave);
  onCanvasPointerLeaveRef.current = onCanvasPointerLeave;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  const {
    overlayRect,
    overlayRectRef,
    setOverlayRect,
    hoverRect,
    groupOverlayItems,
    groupOverlayItemsRef,
    setGroupOverlayItems,
    childRects,
  } = useDomEditOverlayRects({
    iframeRef,
    overlayRef,
    selectionRef,
    activeCompositionPathRef,
    groupSelectionsRef,
    hoverSelectionRef,
    rafPausedRef,
  });

  const compRect = useDomEditCompositionRect({ iframeRef, overlayRef });
  const compRectRef = useRef(compRect);
  compRectRef.current = compRect;

  const { hasCropInsets, cropOutlineInsetPx } = useCropOverlay({
    selection,
    overlayRect,
  });
  // Inset crops draw their own outline child; other clip shapes keep the raw mirror.
  const boxClipPath = hasCropInsets ? undefined : selectionShapeStyles.clipPath;
  const boxChromeClass = resolveBoxChromeClass(Boolean(cropOutlineInsetPx), boxClipPath);

  const { offCanvasRects, offCanvasElementsRef } = useOffCanvasIndicators({
    iframeRef,
    overlayRef,
    compRectRef,
    activeCompositionPathRef,
    activeCompositionPath,
  });

  const gestures = createDomEditOverlayGestureHandlers({
    activeCompositionPathRef,
    overlayRef,
    iframeRef,
    boxRef,
    selectionRef,
    hoverSelectionRef,
    overlayRectRef,
    groupOverlayItemsRef,
    gestureRef,
    groupGestureRef,
    blockedMoveRef,
    waitingPressRef,
    rafPausedRef,
    suppressNextBoxClickRef,
    setOverlayRect,
    setGroupOverlayItems,
    onBlockedMoveRef,
    onManualDragStartRef,
    onPathOffsetCommitRef,
    onGroupPathOffsetCommitRef,
    onBoxSizeCommitRef,
    onRotationCommitRef,
    onCanvasPointerMoveRef,
    onCanvasMouseDown,
    snapGuidesRef,
  });

  useEffect(() => {
    if (readOnly) gestures.clearPointerState(selectionRef, true);
  }, [gestures, readOnly, selectionRef]);
  // A gesture that loses its pointer, the window or the overlay is cancelled, so its mark goes too.
  const cancelGestureRef = useRef((_dropQueued?: boolean) => {});
  cancelGestureRef.current = (dropQueued) => gestures.clearPointerState(selectionRef, dropQueued);
  useMountEffect(() => {
    const cancel = () => cancelGestureRef.current();
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      cancelGestureRef.current(true);
    };
  });

  // Arrow-key nudge (1px, Shift = 10px) — commits through the same
  // path-offset callbacks as a drag, one undo entry per key burst.
  const { flushNudge } = useDomEditNudge({
    selection,
    groupSelections,
    allowCanvasMovement: allowCanvasMovement && !readOnly,
    selectionRef,
    overlayRectRef,
    groupOverlayItemsRef,
    gestureRef,
    groupGestureRef,
    blockedMoveRef,
    onBlockedMoveRef,
    onManualDragStartRef,
    onPathOffsetCommitRef,
    onGroupPathOffsetCommitRef,
  });

  const marquee = useMarqueeGestures({
    iframeRef,
    overlayRef,
    activeCompositionPathRef,
    onMarqueeSelectRef,
    selectionRef,
    gestures,
  });

  const selectionKey = useMemo(() => {
    if (!selection) return "none";
    return `${selection.sourceFile}:${selection.id ?? selection.selector ?? selection.label}:${selection.selectorIndex ?? 0}`;
  }, [selection]);

  const groupBounds = useMemo(
    () => resolveDomEditGroupOverlayRect(groupOverlayItems.map((item) => item.rect)),
    [groupOverlayItems],
  );
  const hasGroupSelection = groupSelections.length > 1;
  const groupCanMove =
    hasGroupSelection &&
    groupOverlayItems.length > 1 &&
    groupOverlayItems.every((item) => item.selection.capabilities.canApplyManualOffset);

  const handleOverlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!allowCanvasMovement) return;
    const target = event.target as HTMLElement | null;
    const onBox = Boolean(target?.closest('[data-dom-edit-selection-box="true"]'));
    logSelect("mousedown", { shift: event.shiftKey, onBox });
    if (onBox) return;
    // Allow clicks anywhere on the overlay — GSAP-translated elements can
    // extend beyond the composition rect into the gray zone, and users need
    // to select/deselect them by clicking there.
    onCanvasMouseDown(event, { hoverSelection: hoverSelectionRef.current });
  };

  // fallow-ignore-next-line complexity
  const handleOverlayPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!allowCanvasMovement || hostInput || event.button !== 0) return;
    if (event.shiftKey) {
      const shiftIframe = iframeRef.current;
      const candidate = resolveShiftClickCandidate({
        cached: hoverSelectionRef.current,
        elementAtPoint: shiftIframe
          ? getPreviewTargetFromPointer(
              shiftIframe,
              event.clientX,
              event.clientY,
              activeCompositionPathRef.current,
            )
          : null,
      });
      // Not confident: fall through untouched — no preventDefault, no suppression —
      // so the mousedown path resolves this point instead of guessing here.
      if (!candidate) return;
      event.preventDefault();
      event.stopPropagation();
      suppressNextBoxClickRef.current = true;
      onSelectionChangeRef.current(candidate, { additive: true });
      return;
    }

    // A second press on the same spot opens that element's text. This is the
    // press path that actually runs: the pointer handler prevents the default
    // on its way through, so the overlay's own mousedown never fires, and the
    // browser never pairs the presses into a dblclick either.
    if (inlineText.startFromPress(event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-dom-edit-selection-box="true"]')) return;

    // Start marquee if clicking on empty canvas (no element under pointer).
    // The hover selection is an ASYNC cache: on a fast click (or when the
    // pointer was already resting over an element) it can still be empty while
    // an element IS under the pointer — starting a marquee here would swallow
    // the selection mousedown and the click would silently select nothing.
    // Confirm emptiness with a fresh SYNCHRONOUS hit-test before committing.
    if (!hoverSelectionRef.current && onMarqueeSelectRef.current && compRect.width > 0) {
      const iframe = iframeRef.current;
      const freshTarget = iframe
        ? getPreviewTargetFromPointer(
            iframe,
            event.clientX,
            event.clientY,
            activeCompositionPathRef.current,
          )
        : null;
      if (freshTarget) return;
      if (overlayRef.current) {
        // Anywhere empty on the overlay starts one, not just inside the frame.
        // An element dragged past the edge sits OUT there in the grey, and a
        // rubber band that refuses to start there cannot reach it — which left
        // the timeline as the only way to select something you can plainly see.
        // The hit test collects in overlay space and never clipped to the frame,
        // so those elements were always selectable once the band could begin.
        event.preventDefault();
        event.stopPropagation();
        marquee.begin(event);
        return;
      }
    }
  };

  const handleBoxClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!allowCanvasMovement) return;
    if (gestureRef.current || groupGestureRef.current) return;
    if (suppressNextBoxClickRef.current) {
      suppressNextBoxClickRef.current = false;
      event.stopPropagation();
      return;
    }
    onCanvasMouseDown(event, { hoverSelection: hoverSelectionRef.current });
  };

  // Right-click state + handler: select the element under the pointer (if
  // needed), then open the menu; closes when the selection moves off-target.
  const { contextMenu, closeContextMenu, handleContextMenu } = useCanvasContextMenuState({
    selection,
    selectionRef,
    hoverSelectionRef,
    onCanvasPointerMoveRef,
    onSelectionChangeRef,
  });

  return (
    <div
      ref={overlayRef}
      // Standing aside is the only way the caret below can be reached, and is
      // what keeps selection, drag and marquee from firing mid-edit.
      className={`absolute inset-0 z-10 outline-hidden ${
        inlineText.editing || hostInput ? "pointer-events-none" : "pointer-events-auto"
      }`}
      data-editing-text={inlineText.editing ? "true" : undefined}
      tabIndex={-1}
      aria-label={t("Composition canvas")}
      // Cursor follows marquee rect *state* (re-renders), not the mutable ref.
      style={marquee.marqueeRect ? { cursor: "crosshair" } : undefined}
      onPointerDownCapture={(event) => {
        // A pointer gesture supersedes a pending nudge burst — commit it first
        // so the gesture's member snapshot starts from the nudged position.
        flushNudge();
        suppressNextBoxClickRef.current = false;
        // Not while editing: taking focus back would send the keystroke nowhere.
        if (!inlineText.editing) {
          focusDomEditOverlayElement(event.currentTarget as FocusableDomEditOverlay);
        }
      }}
      onKeyDown={(event) => {
        if (!inlineText.handleKeyDown(event)) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={handleOverlayPointerDown}
      onMouseDown={handleOverlayMouseDown}
      onPointerMove={marquee.onPointerMove}
      onPointerLeave={() => onCanvasPointerLeaveRef.current()}
      onPointerUp={marquee.onPointerUp}
      onPointerCancel={marquee.onPointerCancel}
      onLostPointerCapture={gestures.onLostPointerCapture}
      onContextMenu={hostInput ? undefined : handleContextMenu}
    >
      {hoverSelection && hoverRect && compRect.width > 0 && (
        <div
          aria-hidden="true"
          data-dom-edit-hover-box="true"
          className="pointer-events-none absolute rounded-md border border-studio-accent/80 shadow-[0_0_0_1px_rgba(60,230,172,0.25)]"
          style={{
            ...hugRectForElement(hoverRect, hoverSelection.element),
            transform: hoverRect.angle ? `rotate(${hoverRect.angle}deg)` : undefined,
          }}
        />
      )}
      {hasGroupSelection && groupOverlayItems.length > 1 && groupBounds && compRect.width > 0 && (
        <DomEditGroupChrome
          groupOverlayItems={groupOverlayItems}
          groupBounds={groupBounds}
          allowCanvasMovement={allowCanvasMovement}
          allowBodyDrag={bodyDrag}
          groupCanMove={groupCanMove}
          gestures={gestures}
          onBoxClick={handleBoxClick}
        />
      )}
      {!hasGroupSelection && selection && overlayRect && compRect.width > 0 && (
        <DomEditSelectionChrome
          inlineText={inlineText}
          selection={selection}
          overlayRect={overlayRect}
          allowCanvasMovement={allowCanvasMovement}
          allowBodyDrag={bodyDrag}
          cropOutlineInsetPx={cropOutlineInsetPx ?? undefined}
          boxRef={boxRef}
          boxChromeClass={boxChromeClass}
          boxClipPath={boxClipPath}
          selectionKey={selectionKey}
          groupSelectionCount={groupSelections.length}
          gestures={gestures}
          onStyleCommit={onStyleCommitRef.current}
          onBoxClick={handleBoxClick}
        />
      )}
      <ChildRectOutlines rects={compRect.width > 0 ? childRects : []} />
      {/* Mounted here rather than with the selection chrome: the chrome does
          not render for every selection, and the toolbar belongs to the
          editing session, which does. */}
      {inlineText.toolbar}
      <OffCanvasIndicators
        rects={hostInput ? [] : offCanvasRects}
        elements={offCanvasElementsRef}
        compRect={compRect}
        selection={selection}
        groupSelections={groupSelections}
        activeCompositionPathRef={activeCompositionPathRef}
        onSelectionChangeRef={onSelectionChangeRef}
      />
      <MarqueeOverlay candidateRects={marquee.candidateRects} marqueeRect={marquee.marqueeRect} />
      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selection={contextMenu.sel}
          onClose={closeContextMenu}
          onDelete={
            onDeleteSelection && !readOnly
              ? (sel) => {
                  closeContextMenu();
                  onDeleteSelection(sel);
                }
              : undefined
          }
          onApplyZIndex={
            onApplyZIndex && !readOnly
              ? (patches, action, crossed) => {
                  onApplyZIndex(contextMenu.sel, patches, action, crossed);
                }
              : undefined
          }
          onZOrderCrossed={handleZOrderCrossed}
        />
      )}
      <ZOrderCrossedFlash rect={zOrderFlashRect} />
      <SnapGuideOverlay
        snapGuidesRef={snapGuidesRef}
        compositionLeft={compRect.left}
        compositionTop={compRect.top}
        compositionWidth={compRect.width}
        compositionHeight={compRect.height}
      />
    </div>
  );
});
