/**
 * Gesture-begin functions: startGroupDrag and startGesture.
 * These are pure "start a new gesture" operations — no draft rect updates.
 */
import { type DomEditSelection } from "./domEditing";
import type { EditMoment } from "./manualEditsTypes";
import {
  applyManualOffsetDragDraft,
  createManualOffsetDragMember,
  restoreManualOffsetDragMembers,
  type ManualOffsetDragMember,
} from "./manualOffsetDrag";
import { readElementLook } from "./gestureUndoRevert";
import { readCssRotationTarget, readRotationBase } from "./rotationDraft";
import {
  beginStudioManualEditGesture,
  endStudioManualEditGesture,
  captureStudioBoxSize,
  captureStudioPathOffset,
  captureStudioRotation,
  readStudioBoxSize,
} from "./manualEdits";
import {
  type OverlayRect,
  elementCornerOverlayPoints,
  filterNestedDomEditGroupItems,
  overlayCornersCentroid,
  selectionCacheKey,
} from "./domEditOverlayGeometry";
import {
  type GestureKind,
  type GestureState,
  type ResizeHandle,
  type UseDomEditOverlayGesturesOptions,
} from "./domEditOverlayGestures";
import { collectSnapContext, buildExcludeElements } from "./snapTargetCollection";
import { editsPlainCss } from "../../hooks/gsapRuntimeKeyframes";
import { logResize, resetResizeMoveLog } from "../../utils/resizeDebug";
import { logDrag, readDragPositions, resetDragMoveLog } from "../../utils/dragDebug";

export function notifyBlockedPress(
  e: React.PointerEvent<HTMLElement>,
  opts: UseDomEditOverlayGesturesOptions,
  selection: DomEditSelection,
): void {
  if (e.button !== 0 || selection.capabilities.commitCheckPending) return;
  opts.onBlockedMoveRef.current(selection);
}

export function startGroupDrag(
  e: React.PointerEvent<HTMLElement>,
  opts: UseDomEditOverlayGesturesOptions,
  at?: EditMoment,
): boolean {
  const items = opts.groupOverlayItemsRef.current;
  if (items.length <= 1) return false;

  const blockedSelection = items.find(
    (item) => !item.selection.capabilities.canApplyManualOffset,
  )?.selection;
  if (blockedSelection) {
    e.preventDefault();
    e.stopPropagation();
    notifyBlockedPress(e, opts, blockedSelection);
    return false;
  }

  opts.onManualDragStartRef.current?.();
  const dragItems = filterNestedDomEditGroupItems(items);
  const members: ManualOffsetDragMember[] = [];
  for (const item of dragItems) {
    const result = createManualOffsetDragMember({
      key: item.key,
      selection: item.selection,
      element: item.element,
      rect: item.rect,
      gesture: "drag",
      at,
    });
    if (!result.ok) {
      restoreManualOffsetDragMembers(members);
      e.preventDefault();
      e.stopPropagation();
      opts.onBlockedMoveRef.current(result.selection, result.reason);
      return false;
    }
    members.push(result.member);
  }
  try {
    resetDragMoveLog();
    logDrag("group-start", {
      // A member whose mapping differs from its neighbours travels a different
      // distance for the same pointer delta, which is the group coming apart.
      members: Object.fromEntries(
        members.map((member) => [
          member.key,
          {
            map: `${member.screenToOffset.a.toFixed(3)},${member.screenToOffset.d.toFixed(3)}`,
            base: `${Math.round(member.baseGsap.x)},${Math.round(member.baseGsap.y)}`,
            offset: `${Math.round(member.initialOffset.x)},${Math.round(member.initialOffset.y)}`,
          },
        ]),
      ),
      at: readDragPositions(members),
    });

    const overlayEl = opts.overlayRef.current;
    const iframe = opts.iframeRef.current;
    const snapContext =
      overlayEl && iframe
        ? collectSnapContext({
            overlayEl,
            iframe,
            excludeElements: buildExcludeElements({
              iframe,
              groupSelections: items.map((i) => i.selection),
            }),
          })
        : undefined;

    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    opts.rafPausedRef.current = true;
    opts.groupGestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originItems: items,
      members,
      snapContext,
    };
  } catch (error) {
    opts.groupGestureRef.current = null;
    restoreManualOffsetDragMembers(members);
    throw error;
  }
  return true;
}

// fallow-ignore-next-line complexity
export function startGesture(
  kind: GestureKind,
  e: React.PointerEvent<HTMLElement>,
  opts: UseDomEditOverlayGesturesOptions,
  options?: {
    selection?: DomEditSelection;
    rect?: OverlayRect | null;
    resizeHandle?: ResizeHandle;
    resizeCorner?: { x: number; y: number };
    at?: EditMoment;
  },
): boolean {
  const at = options?.at;
  const sel = options?.selection ?? opts.selectionRef.current;
  const rect = options?.rect ?? opts.overlayRectRef.current;
  const box = opts.boxRef.current;
  const overlayEl = opts.overlayRef.current;
  if (!sel || !rect) return false;
  if (kind !== "drag" && !box) return false;
  const mode: GestureState["mode"] =
    kind === "rotate" ? "rotation" : kind === "drag" ? "path-offset" : "box-size";
  if (kind === "drag" && !sel.capabilities.canApplyManualOffset) return false;
  if (kind === "resize" && !sel.capabilities.canApplyManualSize) return false;
  if (kind === "rotate" && !sel.capabilities.canApplyManualRotation) return false;
  if (kind === "resize" && (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)))
    return false;

  const size = readStudioBoxSize(sel.element);
  // The draft writes CSS width/height, so the resize base must be the CSS
  // layout size. offsetWidth/Height are transform-free; the overlay-rect
  // fallback (rect / editScale) includes the element's own GSAP scale and
  // would make a rescaled element's draft grow from the RENDERED size.
  const layoutWidth = sel.element.offsetWidth;
  const layoutHeight = sel.element.offsetHeight;
  const actualWidth =
    size.width > 0 ? size.width : layoutWidth > 0 ? layoutWidth : rect.width / rect.editScaleX;
  const actualHeight =
    size.height > 0 ? size.height : layoutHeight > 0 ? layoutHeight : rect.height / rect.editScaleY;
  // overlay rect = cssSize x contentScale x editScale, so the element's own
  // render factor (its GSAP scale) falls out of the measured rect. 1 when
  // unscaled or unmeasurable.
  const rawContentScaleX = rect.width / (rect.editScaleX * actualWidth);
  const rawContentScaleY = rect.height / (rect.editScaleY * actualHeight);
  const contentScaleX =
    Number.isFinite(rawContentScaleX) && rawContentScaleX > 0 ? rawContentScaleX : 1;
  const contentScaleY =
    Number.isFinite(rawContentScaleY) && rawContentScaleY > 0 ? rawContentScaleY : 1;
  const initialLook = readElementLook(
    sel.element,
    kind !== "drag" && !editsPlainCss(sel.element, kind === "rotate" ? "rotate" : "resize"),
  );
  let initialPathOffset = captureStudioPathOffset(sel.element);
  let manualEditDragToken: string | undefined;
  let pathOffsetMember: ManualOffsetDragMember | undefined;

  if (kind === "drag") {
    opts.onManualDragStartRef.current?.();
    const result = createManualOffsetDragMember({
      key: selectionCacheKey(sel),
      selection: sel,
      element: sel.element,
      rect,
      gesture: "drag",
      at,
    });
    if (!result.ok) {
      opts.onBlockedMoveRef.current(result.selection, result.reason);
      e.preventDefault();
      return false;
    }
    pathOffsetMember = result.member;
    initialPathOffset = result.member.initialPathOffset;
    manualEditDragToken = result.member.gestureToken;
  } else {
    // Center-anchored corner resize (CapCut model): the element scales about its planted CENTER,
    // so every corner needs the member that re-pins the center per frame (the memberless
    // branch is only a fallback for an element that can't take a manual offset).
    const needsAnchorOffset = kind === "resize" && sel.capabilities.canApplyManualOffset;
    if (needsAnchorOffset) {
      const result = createManualOffsetDragMember({
        key: selectionCacheKey(sel),
        selection: sel,
        element: sel.element,
        rect,
        gesture: "resize",
        at,
      });
      if (result.ok) {
        pathOffsetMember = result.member;
        initialPathOffset = result.member.initialPathOffset;
        manualEditDragToken = result.member.gestureToken;
        // Hold a % translate as the same px now, so a growing box can't drag it along mid-frame.
        if (result.member.plainTranslate) applyManualOffsetDragDraft(result.member, 0, 0);
      } else {
        manualEditDragToken = beginStudioManualEditGesture(sel.element, "resize", at);
      }
    } else {
      manualEditDragToken = beginStudioManualEditGesture(
        sel.element,
        kind === "rotate" ? "rotate" : "resize",
        at,
      );
    }
  }

  // A throw before the gesture is armed would leave its mark, and the mark holds every reload.
  try {
    // Rotation base: the angle the element shows. An element GSAP does not turn, or a plain-translate
    // move, never asks GSAP: reading a property makes it bake the CSS into its transform.
    const plain = !!pathOffsetMember?.plainTranslate || editsPlainCss(sel.element, "rotate");
    const plainRotation = plain && kind === "rotate" ? readCssRotationTarget(sel.element) : null;
    const rotation = { angle: readRotationBase(sel.element, plain) };
    const overlayBounds = overlayEl?.getBoundingClientRect();
    const centerX = (overlayBounds?.left ?? 0) + rect.left + rect.width / 2;
    const centerY = (overlayBounds?.top ?? 0) + rect.top + rect.height / 2;

    const iframe = opts.iframeRef.current;

    // A corner resize pins the centroid of the four rotation-aware corners: an axis-aligned
    // size delta only holds the centre still for a symmetric, unrotated growth.
    let resizeFixedCenterStart: { x: number; y: number } | undefined;
    if (kind === "resize" && pathOffsetMember && overlayEl && iframe) {
      const corners = elementCornerOverlayPoints(overlayEl, iframe, sel.element);
      if (corners) resizeFixedCenterStart = overlayCornersCentroid(corners);
    }
    const snapContext =
      (kind === "drag" || kind === "resize") && overlayEl && iframe
        ? collectSnapContext({
            overlayEl,
            iframe,
            excludeElements: buildExcludeElements({ iframe, selection: sel }),
          })
        : undefined;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    opts.rafPausedRef.current = true;
    opts.gestureRef.current = {
      kind,
      mode,
      selection: sel,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      centerX,
      centerY,
      initialPathOffset,
      initialRotation: captureStudioRotation(sel.element),
      initialBoxSize: captureStudioBoxSize(sel.element),
      initialLook,
      pathOffsetMember,
      originLeft: rect.left,
      originTop: rect.top,
      originWidth: rect.width,
      originHeight: rect.height,
      actualWidth,
      actualHeight,
      actualRotation: rotation.angle,
      plainRotation,
      editScaleX: rect.editScaleX,
      editScaleY: rect.editScaleY,
      contentScaleX,
      contentScaleY,
      manualEditDragToken,
      snapContext,
      resizeHandle: kind === "resize" ? (options?.resizeHandle ?? "se") : undefined,
      resizePressFromCorner:
        kind === "resize" && options?.resizeCorner
          ? { x: e.clientX - options.resizeCorner.x, y: e.clientY - options.resizeCorner.y }
          : undefined,
      resizeFixedCenterStart,
    };
    if (kind === "resize") {
      resetResizeMoveLog();
      logResize("start", {
        handle: options?.resizeHandle ?? "se",
        pointer: { x: e.clientX, y: e.clientY },
        center: { x: centerX, y: centerY },
        origin: { left: rect.left, top: rect.top, w: rect.width, h: rect.height },
        actual: { w: actualWidth, h: actualHeight },
        editScale: { x: rect.editScaleX, y: rect.editScaleY },
        contentScale: { x: contentScaleX, y: contentScaleY },
        rotation: rotation.angle,
        hasOffsetMember: !!pathOffsetMember,
        fixedCenterStart: resizeFixedCenterStart ?? null,
        initialBoxSize: opts.gestureRef.current?.initialBoxSize ?? null,
        initialInlineStyle: sel.element.getAttribute("style"),
      });
    }
  } catch (error) {
    opts.gestureRef.current = null;
    if (pathOffsetMember) restoreManualOffsetDragMembers([pathOffsetMember]);
    else if (manualEditDragToken) endStudioManualEditGesture(sel.element, manualEditDragToken);
    throw error;
  }
  return true;
}
