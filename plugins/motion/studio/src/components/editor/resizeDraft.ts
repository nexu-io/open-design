import type { GestureState } from "./domEditOverlayGestures";
import { resolveResizeCenterAnchorOffset } from "./domEditOverlayGestures";
import type { OverlayRect } from "./domEditOverlayGeometry";
import {
  cornerEdgeLength,
  elementCornerOverlayPoints,
  overlayCornersCentroid,
} from "./domEditOverlayGeometry";
import { computeNextResizeAnchor, resizeRemainderShift } from "./domEditResizeLocal";
import type { ResizeDraftSizes } from "./domEditResizeLocal";
import { applyManualOffsetDragDraft } from "./manualOffsetDrag";

type Corners = ReturnType<typeof elementCornerOverlayPoints>;

/**
 * The residual center-pin offset for this frame. With measurable corners and a
 * fixed-center start, accumulate `fixedStart + shift - centerNow` onto the previous
 * anchor so it CONVERGES rather than oscillating: `applyManualOffsetDragDraft`
 * treats its argument as the absolute offset, and `centerNow` (measured on the
 * live element) already carries the previous frame's offset, so the difference
 * is only the residual correction. Using it absolutely would drop the offset
 * every other frame and un-pin the center (fa4f39168). Memberless/unmeasurable
 * geometry falls back to the AABB half-delta.
 */
function resolveResizeAnchor(
  g: GestureState,
  corners: Corners | null,
  measureOrientedRect: () => OverlayRect | null,
  sizes: ResizeDraftSizes,
): { dx: number; dy: number } {
  const fixedStart = g.resizeFixedCenterStart;
  if (corners && fixedStart) {
    const press = g.resizePressFromCorner ?? { x: 0, y: 0 };
    const grab = { x: g.startX - press.x - g.centerX, y: g.startY - press.y - g.centerY };
    const shift = resizeRemainderShift(corners, grab, sizes);
    const target = { x: fixedStart.x + shift.x, y: fixedStart.y + shift.y };
    return computeNextResizeAnchor(g.lastResizeAnchor, target, overlayCornersCentroid(corners));
  }
  const fallbackRect = measureOrientedRect();
  return resolveResizeCenterAnchorOffset({
    originWidth: g.originWidth,
    originHeight: g.originHeight,
    overlayWidth: fallbackRect ? fallbackRect.width : g.originWidth,
    overlayHeight: fallbackRect ? fallbackRect.height : g.originHeight,
  });
}

/**
 * Center-pinned draft rect: translate the element through the manual-offset
 * channel to keep its gesture-start center planted (rotation-safe for any
 * transform-origin), then hug its true rendered bounds. Mutates
 * `g.lastResizeAnchor` and applies the offset draft as a side effect.
 */
function resolveAnchoredResizeDraft(
  g: GestureState,
  member: NonNullable<GestureState["pathOffsetMember"]>,
  element: HTMLElement,
  overlayEl: HTMLDivElement | null,
  iframe: HTMLIFrameElement | null,
  measureOrientedRect: () => OverlayRect | null,
  sizes: ResizeDraftSizes,
): OverlayRect {
  // Measure real corners ONCE — reused for the anchor and the fallback size.
  const corners =
    overlayEl && iframe ? elementCornerOverlayPoints(overlayEl, iframe, element) : null;
  const anchor = resolveResizeAnchor(g, corners, measureOrientedRect, sizes);
  g.lastResizeAnchor = anchor;
  applyManualOffsetDragDraft(member, anchor.dx, anchor.dy);
  // Re-measure AFTER the anchor translate so it hugs the element every frame.
  return (
    measureOrientedRect() ?? {
      left: g.originLeft + anchor.dx,
      top: g.originTop + anchor.dy,
      width: corners ? cornerEdgeLength(corners.nw, corners.ne) : g.originWidth,
      height: corners ? cornerEdgeLength(corners.nw, corners.sw) : g.originHeight,
      editScaleX: g.editScaleX,
      editScaleY: g.editScaleY,
      angle: g.actualRotation,
    }
  );
}

/** The overlay rect to paint for the current resize pointer-move frame. */
export function resolveResizeDraftRect(
  g: GestureState,
  element: HTMLElement,
  overlayEl: HTMLDivElement | null,
  iframe: HTMLIFrameElement | null,
  measureOrientedRect: () => OverlayRect | null,
  sizes: ResizeDraftSizes,
): OverlayRect {
  if (g.pathOffsetMember) {
    return resolveAnchoredResizeDraft(
      g,
      g.pathOffsetMember,
      element,
      overlayEl,
      iframe,
      measureOrientedRect,
      sizes,
    );
  }
  // Re-measure the element's oriented box AFTER the size write. The size draft
  // rounds/clamps and (with a centered transform-origin + GSAP scale) the real
  // rendered size diverges from the CSS size, so measure rather than trust math.
  return (
    measureOrientedRect() ?? {
      left: g.originLeft,
      top: g.originTop,
      width: g.originWidth,
      height: g.originHeight,
      editScaleX: g.editScaleX,
      editScaleY: g.editScaleY,
      angle: g.actualRotation,
    }
  );
}
