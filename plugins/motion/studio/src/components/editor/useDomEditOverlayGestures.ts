import { createPreviewGestureStarts } from "./previewGestureStarts";
import { trackPreviewEditResult } from "../../utils/previewFeatureUsage";
// fallow-ignore-file code-duplication
/**
 * Gesture handling for DomEditOverlay.
 * Owns: onPointerMove, onPointerUp, clearPointerState.
 * startGesture and startGroupDrag live in domEditOverlayStartGesture.ts.
 */
import type { RefObject } from "react";
import { type DomEditSelection } from "./domEditing";
import {
  applyManualOffsetDragCommit,
  applyManualOffsetDragDraft,
  endManualOffsetDragMembers,
  restoreManualOffsetDragMembers,
} from "./manualOffsetDrag";
import { manualOffsetMoveRevert, elementLookRevert } from "./gestureUndoRevert";
import { applyRotationDraft, restoreRotationDraft } from "./rotationDraft";
import {
  applyStudioBoxSize,
  applyStudioBoxSizeDraft,
  endStudioManualEditGesture,
  isStudioManualEditGestureCurrent,
  readStudioBoxSize,
  restoreStudioBoxSize,
  restoreStudioPathOffset,
} from "./manualEdits";
import {
  type GroupOverlayItem,
  type OverlayRect,
  orientedOverlayRect,
  shiftedOverlayRect,
} from "./domEditOverlayGeometry";
import {
  BLOCKED_MOVE_THRESHOLD_PX,
  type GestureState,
  type GroupGestureState,
  type UseDomEditOverlayGesturesOptions,
  ROTATED_SNAP_BYPASS_DEGREES,
  hasDomEditRotationChanged,
  lockDragToDominantAxis,
  movesGesture,
  resolveDomEditRotationGesture,
} from "./domEditOverlayGestures";
import { resolveCenterResizeSize } from "./domEditResizeLocal";
import { resolveResizeDraftRect } from "./resizeDraft";
import { notifyBlockedPress } from "./domEditOverlayStartGesture";
import { hugRectForElement } from "./domEditOverlayCrop";
import {
  resolveSnapAdjustment,
  resolveEquidistanceGuides,
  snapEngagedForTravel,
  SNAP_THRESHOLD_PX,
} from "./snapEngine";
import { logResize, logResizeMove, logResizeSettle } from "../../utils/resizeDebug";
import { logDrag, logDragSettle, readDragPositions } from "../../utils/dragDebug";
import { createGroupDragMover } from "./groupDragMove";
import { DomEditSaveQueueOpenError } from "../../utils/domEditSaveQueue";
import { beginStudioPendingEdit } from "../../utils/studioPendingEdits";

function isTap(g: { startX: number; startY: number; travelled?: boolean }, e: React.PointerEvent) {
  return (
    !g.travelled &&
    Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < BLOCKED_MOVE_THRESHOLD_PX
  );
}

function logGestureCommitFailure(message: string, error: unknown): void {
  if (error instanceof DomEditSaveQueueOpenError) return;
  console.error(message, error);
}

export function createDomEditOverlayGestureHandlers(opts: UseDomEditOverlayGesturesOptions) {
  const setDraftOverlayRect = (next: OverlayRect) => {
    if (!opts.waitingPressRef.current) opts.setOverlayRect(next);
  };
  const restoreGestureOverlayRect = (g: GestureState) => {
    setDraftOverlayRect({
      left: g.originLeft,
      top: g.originTop,
      width: g.originWidth,
      height: g.originHeight,
      editScaleX: g.editScaleX,
      editScaleY: g.editScaleY,
      // Rotation keeps the chrome aligned with the element during its draft.
      angle: g.actualRotation,
    });
  };
  const setDraftGroupOverlayItems = (next: GroupOverlayItem[]) => {
    if (!opts.waitingPressRef.current) opts.setGroupOverlayItems(next);
  };

  const restoreGroupPathOffsets = (g: GroupGestureState) => {
    restoreManualOffsetDragMembers(g.members);
    setDraftGroupOverlayItems(g.originItems);
  };

  const { startGesture, startGroupDrag, endWaitingPress, endHeldPress, releaseWaitingPress } =
    createPreviewGestureStarts(
      opts,
      (event) => moveActiveGesture(event),
      (event) => releaseActiveGesture(event),
    );

  // A press on a box that cannot move says why at once.
  const startBlockedMove = (e: React.PointerEvent<HTMLElement>, selection: DomEditSelection) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    opts.blockedMoveRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY };
    notifyBlockedPress(e, opts, selection);
  };

  const moveGroupDrag = createGroupDragMover(opts, setDraftGroupOverlayItems);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const waiting = opts.waitingPressRef.current;
    if (waiting && waiting.pointerId === e.pointerId) {
      if (waiting.released || !movesGesture(waiting, e)) return;
      waiting.moved = e;
      waiting.draw?.(e.clientX - waiting.startX, e.clientY - waiting.startY);
      return;
    }
    moveActiveGesture(e);
  };

  // fallow-ignore-next-line complexity
  const moveActiveGesture = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = opts.gestureRef.current;
    const groupG = opts.groupGestureRef.current;
    const sel = g?.selection ?? opts.selectionRef.current;
    const box = opts.waitingPressRef.current ? null : opts.boxRef.current;
    const blockedMove = opts.blockedMoveRef.current;
    if (!blockedMove && !g && !groupG) {
      opts.onCanvasPointerMoveRef.current(e, { preferClipAncestor: false });
    }
    const held = g ?? groupG;
    if (held && !movesGesture(held, e)) return;

    if (blockedMove) {
      const dx = e.clientX - blockedMove.startX;
      const dy = e.clientY - blockedMove.startY;
      if (Math.hypot(dx, dy) >= BLOCKED_MOVE_THRESHOLD_PX) {
        opts.suppressNextBoxClickRef.current = true;
      }
      return;
    }

    if (groupG) {
      if (!isTap(groupG, e)) groupG.travelled = true;
      moveGroupDrag(groupG, e);
      return;
    }

    if (!g || !sel) return;
    if (!isTap(g, e)) g.travelled = true;
    let dx = e.clientX - g.startX;
    let dy = e.clientY - g.startY;

    if (g.kind === "rotate") {
      // Single source of truth: preview the rotation through the GSAP channel (the
      // same channel the commit lands in), not the `--hf-studio-rotation` CSS var.
      const rotated = resolveDomEditRotationGesture({
        centerX: g.centerX,
        centerY: g.centerY,
        startX: g.startX,
        startY: g.startY,
        currentX: e.clientX,
        currentY: e.clientY,
        actualAngle: g.actualRotation,
        snap: e.shiftKey,
      });
      applyRotationDraft(sel.element, rotated.angle, g.plainRotation);
      return;
    }

    if (g.kind === "drag") {
      const lock = lockDragToDominantAxis(dx, dy, e.shiftKey);
      dx = lock.dx;
      dy = lock.dy;
      const sc = g.snapContext;
      // Bypass edge-snapping for rotated elements — the snap targets and the
      // snapped rect are axis-aligned, so snapping a rotated box's AABB shifts it
      // unpredictably. Rotation ~0 keeps snapping exactly as before.
      const dragRotated = Math.abs(g.actualRotation) >= ROTATED_SNAP_BYPASS_DEGREES;
      if (!dragRotated && sc?.snapEnabled && sc.targets.length > 0) {
        // Snap the element's VISIBLE (crop-hugged) edges, not the full bounds.
        const movingRect = hugRectForElement(
          {
            left: g.originLeft,
            top: g.originTop,
            width: g.originWidth,
            height: g.originHeight,
            editScaleX: g.editScaleX,
            editScaleY: g.editScaleY,
          },
          g.selection.element,
        );
        const allTargets = sc.compositionTarget
          ? [...sc.targets, sc.compositionTarget]
          : sc.targets;
        const snap = resolveSnapAdjustment({
          movingRect,
          proposedDx: dx,
          proposedDy: dy,
          // Same reason as the group path: a snap on a drag that has not travelled
          // yet moves the element while the pointer is still.
          disabledForTravel: !snapEngagedForTravel(dx, dy),
          targets: allTargets,
          gridEdges: sc.gridEdges ?? undefined,
          threshold: SNAP_THRESHOLD_PX,
          disabled: e.altKey,
          lockedAxis: lock.lockedAxis,
        });
        dx = snap.dx;
        dy = snap.dy;
        const movedRect = {
          left: movingRect.left + dx,
          top: movingRect.top + dy,
          width: movingRect.width,
          height: movingRect.height,
        };
        const spacingGuides = e.altKey
          ? []
          : resolveEquidistanceGuides({
              movingRect: movedRect,
              targets: allTargets,
              threshold: SNAP_THRESHOLD_PX,
            });
        opts.snapGuidesRef.current = { guides: snap.guides, spacingGuides };
      }
      g.lastSnappedDx = dx;
      g.lastSnappedDy = dy;

      const nextBoxLeft = g.originLeft + dx;
      const nextBoxTop = g.originTop + dy;
      setDraftOverlayRect({
        left: nextBoxLeft,
        top: nextBoxTop,
        width: g.originWidth,
        height: g.originHeight,
        editScaleX: g.editScaleX,
        editScaleY: g.editScaleY,
        angle: g.actualRotation,
      });
      if (box) {
        box.style.left = `${nextBoxLeft}px`;
        box.style.top = `${nextBoxTop}px`;
      }
      if (g.pathOffsetMember) applyManualOffsetDragDraft(g.pathOffsetMember, dx, dy);
    } else {
      // Corner resize scales proportionally about the center, without edge snapping.
      const grab = g.resizePressFromCorner ?? { x: 0, y: 0 };
      const nextSize = resolveCenterResizeSize({
        baseWidth: g.actualWidth,
        baseHeight: g.actualHeight,
        pointer: { x: e.clientX - grab.x, y: e.clientY - grab.y },
        pointerStart: { x: g.startX - grab.x, y: g.startY - grab.y },
        centerStart: { x: g.centerX, y: g.centerY },
      });
      const writtenSize = applyStudioBoxSizeDraft(sel.element, nextSize);

      const overlayEl = opts.overlayRef.current;
      const iframe = opts.iframeRef.current;
      const measureOrientedRect = () =>
        overlayEl && iframe ? orientedOverlayRect(overlayEl, iframe, sel.element) : null;

      const draftRect = resolveResizeDraftRect(
        g,
        sel.element,
        overlayEl,
        iframe,
        measureOrientedRect,
        { wanted: nextSize, written: writtenSize },
      );
      logResizeMove({
        pointer: { x: e.clientX, y: e.clientY },
        nextSize,
        anchor: g.lastResizeAnchor ?? null,
        draftRect,
        liveInlineStyle: sel.element.getAttribute("style"),
      });
      if (box) {
        box.style.left = `${draftRect.left}px`;
        box.style.top = `${draftRect.top}px`;
        box.style.width = `${draftRect.width}px`;
        box.style.height = `${draftRect.height}px`;
      }
      setDraftOverlayRect(draftRect);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const waiting = opts.waitingPressRef.current;
    if (waiting && waiting.pointerId === e.pointerId) {
      releaseWaitingPress(waiting, e);
      opts.suppressNextBoxClickRef.current = true;
      return;
    }
    releaseActiveGesture(e);
  };

  // fallow-ignore-next-line complexity
  const releaseActiveGesture = (e: React.PointerEvent<HTMLDivElement>) => {
    opts.snapGuidesRef.current = null;
    const g = opts.gestureRef.current;
    const groupG = opts.groupGestureRef.current;
    const sel = g?.selection ?? opts.selectionRef.current;
    const box = opts.waitingPressRef.current ? null : opts.boxRef.current;
    opts.blockedMoveRef.current = null;
    opts.rafPausedRef.current = opts.waitingPressRef.current !== null;

    if (groupG) {
      opts.groupGestureRef.current = null;
      const rawDx = e.clientX - groupG.startX;
      const rawDy = e.clientY - groupG.startY;
      // Consume the release click so it cannot deselect the moved group.
      opts.suppressNextBoxClickRef.current = true;
      if (isTap(groupG, e)) {
        restoreGroupPathOffsets(groupG);
        if (e.shiftKey) {
          opts.onCanvasMouseDown(e as unknown as React.MouseEvent<HTMLDivElement>, {
            preferClipAncestor: false,
            hoverSelection: opts.hoverSelectionRef.current,
          });
        }
        return;
      }
      const dx = groupG.lastSnappedDx ?? rawDx;
      const dy = groupG.lastSnappedDy ?? rawDy;
      setDraftGroupOverlayItems(
        groupG.originItems.map((item) => ({
          ...item,
          rect: shiftedOverlayRect(item.rect, dx, dy),
        })),
      );
      const updates = groupG.members.map((member) => ({
        selection: member.selection,
        next: applyManualOffsetDragCommit(member, dx, dy),
        plainTranslate: member.plainTranslate,
      }));
      logDrag("drop", {
        pointer: `${Math.round(rawDx)},${Math.round(rawDy)}`,
        applied: `${Math.round(dx)},${Math.round(dy)}`,
        committed: Object.fromEntries(
          updates.map((update, index) => [
            groupG.members[index]?.key ?? String(index),
            `${Math.round(update.next.x)},${Math.round(update.next.y)}`,
          ]),
        ),
        at: readDragPositions(groupG.members),
      });
      const groupEdit = beginStudioPendingEdit(manualOffsetMoveRevert(groupG.members));
      const groupSaved = Promise.resolve(
        groupEdit.adopt(() => opts.onGroupPathOffsetCommitRef.current(updates)),
      )
        .then((result) => trackPreviewEditResult("move", "drag", result))
        .catch(() => {
          for (const member of groupG.members) {
            if (
              member.gestureToken &&
              isStudioManualEditGestureCurrent(member.element, member.gestureToken)
            )
              restoreStudioPathOffset(member.element, member.initialPathOffset);
          }
        })
        .finally(() => {
          logDrag("committed", { at: readDragPositions(groupG.members) });
          endManualOffsetDragMembers(groupG.members);
          // Teardown re-seeks the player, exposing any stale preview position.
          logDragSettle("settle", groupG.members);
        });
      groupEdit.settle(groupSaved);
      return;
    }

    opts.gestureRef.current = null;
    if (!g || !sel) return;
    const movedDistance = Math.hypot(e.clientX - g.startX, e.clientY - g.startY);

    if (g.kind === "drag" && isTap(g, e)) {
      if (g.pathOffsetMember) restoreManualOffsetDragMembers([g.pathOffsetMember]);
      if (box) {
        box.style.left = `${g.originLeft}px`;
        box.style.top = `${g.originTop}px`;
      }
      restoreGestureOverlayRect(g);
      opts.suppressNextBoxClickRef.current = true;
      opts.onCanvasMouseDown(e as unknown as React.MouseEvent<HTMLDivElement>, {
        preferClipAncestor: false,
        hoverSelection: opts.hoverSelectionRef.current,
      });
      return;
    }

    if (g.kind === "resize" && movedDistance < BLOCKED_MOVE_THRESHOLD_PX) {
      restoreStudioBoxSize(sel.element, g.initialBoxSize);
      if (g.pathOffsetMember) {
        restoreManualOffsetDragMembers([g.pathOffsetMember]);
      } else {
        endStudioManualEditGesture(sel.element, g.manualEditDragToken);
      }
      if (box) {
        box.style.width = `${g.originWidth}px`;
        box.style.height = `${g.originHeight}px`;
      }
      restoreGestureOverlayRect(g);
      opts.suppressNextBoxClickRef.current = true;
      return;
    }

    if (g.kind === "rotate") {
      const finalRotation = resolveDomEditRotationGesture({
        centerX: g.centerX,
        centerY: g.centerY,
        startX: g.startX,
        startY: g.startY,
        currentX: e.clientX,
        currentY: e.clientY,
        actualAngle: g.actualRotation,
        snap: e.shiftKey,
      });
      const restoreRotation = () =>
        restoreRotationDraft(
          sel.element,
          g.actualRotation,
          g.initialRotation,
          g.plainRotation !== null,
        );
      if (!hasDomEditRotationChanged(g.actualRotation, finalRotation.angle)) {
        restoreRotation();
        endStudioManualEditGesture(sel.element, g.manualEditDragToken);
        return;
      }
      // Hold the final angle while the commit lands.
      applyRotationDraft(sel.element, finalRotation.angle, g.plainRotation);
      const commit = { ...finalRotation, plain: g.plainRotation };
      const edit = beginStudioPendingEdit(elementLookRevert(sel.element, g.initialLook));
      const saved = Promise.resolve(edit.adopt(() => opts.onRotationCommitRef.current(sel, commit)))
        .then((result) => trackPreviewEditResult("rotate", "drag", result))
        .catch((error) => {
          logGestureCommitFailure("rotate commit failed", error);
          if (
            g.manualEditDragToken &&
            isStudioManualEditGestureCurrent(sel.element, g.manualEditDragToken)
          )
            restoreRotation();
        })
        .finally(() => endStudioManualEditGesture(sel.element, g.manualEditDragToken));
      edit.settle(saved);
    } else if (g.kind === "drag") {
      // A release over another layer must keep this dragged layer selected.
      opts.suppressNextBoxClickRef.current = true;
      const dx = g.lastSnappedDx ?? e.clientX - g.startX;
      const dy = g.lastSnappedDy ?? e.clientY - g.startY;
      if (!g.pathOffsetMember) {
        return;
      }
      const finalOffset = applyManualOffsetDragCommit(g.pathOffsetMember, dx, dy);
      const nextBoxLeft = g.originLeft + dx;
      const nextBoxTop = g.originTop + dy;
      setDraftOverlayRect({
        left: nextBoxLeft,
        top: nextBoxTop,
        width: g.originWidth,
        height: g.originHeight,
        editScaleX: g.editScaleX,
        editScaleY: g.editScaleY,
        angle: g.actualRotation,
      });
      if (box) {
        box.style.left = `${nextBoxLeft}px`;
        box.style.top = `${nextBoxTop}px`;
      }
      const member = g.pathOffsetMember;
      const edit = beginStudioPendingEdit(manualOffsetMoveRevert([member]));
      const saved = Promise.resolve(
        edit.adopt(() =>
          opts.onPathOffsetCommitRef.current(sel, finalOffset, {
            altKey: e.altKey,
            plainTranslate: member.plainTranslate,
          }),
        ),
      )
        .then((result) => trackPreviewEditResult("move", "drag", result))
        .catch(() => {
          if (
            g.pathOffsetMember?.gestureToken &&
            isStudioManualEditGestureCurrent(sel.element, g.pathOffsetMember.gestureToken)
          )
            restoreStudioPathOffset(sel.element, g.initialPathOffset);
        })
        .finally(() => {
          if (g.pathOffsetMember) endManualOffsetDragMembers([g.pathOffsetMember]);
        });
      edit.settle(saved);
    } else {
      opts.suppressNextBoxClickRef.current = true;
      const finalSize = readStudioBoxSize(sel.element);
      applyStudioBoxSize(sel.element, finalSize);
      // Save size and center-preserving offset together under one undo entry.
      const member = g.pathOffsetMember;
      const anchor = g.lastResizeAnchor;
      const finalOffset =
        member && anchor && (anchor.dx !== 0 || anchor.dy !== 0)
          ? applyManualOffsetDragCommit(member, anchor.dx, anchor.dy)
          : null;
      logResize("release", {
        finalSize,
        anchor: anchor ?? null,
        finalOffset: finalOffset ?? null,
        hasMember: !!member,
        inlineStyle: sel.element.getAttribute("style"),
      });
      const restore = () => {
        if (
          !g.manualEditDragToken ||
          !isStudioManualEditGestureCurrent(sel.element, g.manualEditDragToken)
        )
          return;
        restoreStudioBoxSize(sel.element, g.initialBoxSize);
        if (finalOffset) restoreStudioPathOffset(sel.element, g.initialPathOffset);
      };
      const commitSize = () =>
        opts.onBoxSizeCommitRef.current(sel, finalSize, finalOffset ?? undefined, restore, member);
      const edit = beginStudioPendingEdit(elementLookRevert(sel.element, g.initialLook));
      const saved = Promise.resolve(edit.adopt(commitSize))
        .then((result) => trackPreviewEditResult("resize", "drag", result))
        .catch((error) => {
          logGestureCommitFailure("resize commit failed", error);
        })
        .finally(() => {
          if (member) endManualOffsetDragMembers([member]);
          else endStudioManualEditGesture(sel.element, g.manualEditDragToken);
        });
      edit.settle(saved);
      logResizeSettle(sel.element, "post-release");
    }
  };

  /** `dropQueued`: released presses still waiting go too, as when the overlay leaves or turns read-only. */
  // fallow-ignore-next-line complexity
  const clearPointerState = (
    selectionRef: RefObject<DomEditSelection | null>,
    dropQueued = false,
  ) => {
    if (dropQueued) endWaitingPress();
    else endHeldPress();
    opts.snapGuidesRef.current = null;
    const groupG = opts.groupGestureRef.current;
    if (groupG) restoreGroupPathOffsets(groupG);
    const g = opts.gestureRef.current;
    const sel = g?.selection ?? selectionRef.current;
    if (g?.mode === "path-offset" && sel) {
      if (g.pathOffsetMember) restoreManualOffsetDragMembers([g.pathOffsetMember]);
      restoreGestureOverlayRect(g);
    }
    if (g?.mode === "box-size" && sel) {
      restoreStudioBoxSize(sel.element, g.initialBoxSize);
      if (g.pathOffsetMember) {
        restoreManualOffsetDragMembers([g.pathOffsetMember]);
      } else {
        endStudioManualEditGesture(sel.element, g.manualEditDragToken);
      }
      restoreGestureOverlayRect(g);
    }
    if (g?.mode === "rotation" && sel) {
      restoreRotationDraft(
        sel.element,
        g.actualRotation,
        g.initialRotation,
        g.plainRotation !== null,
      );
      endStudioManualEditGesture(sel.element, g.manualEditDragToken);
    }
    opts.blockedMoveRef.current = null;
    opts.groupGestureRef.current = null;
    opts.gestureRef.current = null;
    opts.rafPausedRef.current = opts.waitingPressRef.current !== null;
  };

  const onLostPointerCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    const waiting = opts.waitingPressRef.current;
    // Pointerup releases capture normally; the queued edit still has to land.
    if (waiting?.pointerId === e.pointerId && waiting.released) return;
    clearPointerState(opts.selectionRef);
  };

  return {
    startGesture,
    startGroupDrag,
    startBlockedMove,
    onPointerMove,
    onPointerUp,
    onLostPointerCapture,
    clearPointerState,
  };
}
