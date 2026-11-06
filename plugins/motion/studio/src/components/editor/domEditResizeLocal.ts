/**
 * Center-anchored corner-resize math (the CapCut model): the element scales
 * proportionally about its CENTER, the center stays planted, and all four corners
 * behave identically.
 *
 * The scale factor is the RADIAL distance from the element's center: how far the
 * pointer is from the center now, divided by how far it was at gesture start. This
 * is inherently proportional, continuous everywhere, and rotation-invariant — a
 * distance is a distance regardless of the element's angle, so there is no per-axis
 * projection and no dominant-axis branch to jump across. Which corner was grabbed
 * is irrelevant to the size (it only picks the resize cursor).
 *
 * All math here is pure and unit-tested; the live wiring (measuring the element's
 * rendered center, feeding the center-pin translate through the manual-offset
 * channel) lives in useDomEditOverlayGestures.ts.
 */
import type { FixedCorner } from "./domEditOverlayGeometry";
import type { ResizeHandle } from "./domEditOverlayGestures";

/** Minimum element edge in LOCAL px — mirrors the old MIN_RESIZE_EDGE_PX clamp
 *  (no flip-through-zero: clamp, never mirror). */
const MIN_RESIZE_LOCAL_PX = 1;

/**
 * Below this start-to-center distance (overlay px) the gesture started at (or
 * effectively at) the center, so the ratio is degenerate (division by ~0). Bail to
 * scale 1 rather than blow up. A handle starts from its corner, so a pick a few px across still resizes.
 */
const DEGENERATE_START_DIST_PX = 0.5;

/**
 * The proportional scale factor for a center-anchored resize: the ratio of the
 * pointer's radial distance from the element center now to its distance at gesture
 * start. Rotation-invariant (a radial distance ignores the element's angle) and
 * continuous. Never negative — dragging through the center just shrinks toward the
 * clamp; the caller clamps the resulting size, this returns the raw ratio (guarded
 * against a degenerate start-at-center gesture, which returns 1).
 */
export function resolveCenterResizeScale(input: {
  pointer: { x: number; y: number };
  pointerStart: { x: number; y: number };
  centerStart: { x: number; y: number };
}): number {
  const startDist = Math.hypot(
    input.pointerStart.x - input.centerStart.x,
    input.pointerStart.y - input.centerStart.y,
  );
  if (!Number.isFinite(startDist) || startDist < DEGENERATE_START_DIST_PX) return 1;
  const nowDist = Math.hypot(
    input.pointer.x - input.centerStart.x,
    input.pointer.y - input.centerStart.y,
  );
  return nowDist / startDist;
}

/**
 * The element's new LOCAL size for a center-anchored corner resize: base size
 * scaled by `resolveCenterResizeScale`, clamped so the smaller edge never drops
 * below MIN_RESIZE_LOCAL_PX (clamp small, never mirror through zero). The scale is
 * a dimensionless ratio, so the base local size and the screen-space pointer
 * distances live in different frames without any display-scale conversion — the
 * ratio cancels the scale.
 */
export function resolveCenterResizeSize(input: {
  baseWidth: number;
  baseHeight: number;
  pointer: { x: number; y: number };
  pointerStart: { x: number; y: number };
  centerStart: { x: number; y: number };
}): { width: number; height: number } {
  const baseWidth = Math.max(input.baseWidth, MIN_RESIZE_LOCAL_PX);
  const baseHeight = Math.max(input.baseHeight, MIN_RESIZE_LOCAL_PX);
  const rawScale = resolveCenterResizeScale({
    pointer: input.pointer,
    pointerStart: input.pointerStart,
    centerStart: input.centerStart,
  });
  const minScale = MIN_RESIZE_LOCAL_PX / Math.min(baseWidth, baseHeight);
  const scale = Math.max(minScale, rawScale);
  return { width: baseWidth * scale, height: baseHeight * scale };
}

/**
 * The eight CSS resize cursors, rotated with the object. A corner's base pointing
 * direction (the diagonal it lives on) plus the element rotation, bucketed into
 * 45° slots. So a 90°-rotated NW corner reads as a NE-diagonal cursor, etc.
 */
const CURSORS_8 = [
  "ns-resize", // 0°   (up)
  "nesw-resize", // 45°
  "ew-resize", // 90°  (right)
  "nwse-resize", // 135°
  "ns-resize", // 180° (down)
  "nesw-resize", // 225°
  "ew-resize", // 270° (left)
  "nwse-resize", // 315°
] as const;

/** Base outward diagonal angle of each corner, in degrees, screen convention
 *  (0° = up, clockwise). NW points up-left = 315°, NE up-right = 45°, etc. */
const CORNER_BASE_ANGLE_DEG: Record<ResizeHandle, number> = {
  nw: 315,
  ne: 45,
  se: 135,
  sw: 225,
};

/** Resize cursor for a corner handle on an element rotated by `rotationDeg`. */
export function resolveRotatedResizeCursor(handle: ResizeHandle, rotationDeg: number): string {
  const angle = CORNER_BASE_ANGLE_DEG[handle] + rotationDeg;
  const normalized = ((angle % 360) + 360) % 360;
  const bucket = Math.round(normalized / 45) % 8;
  return CURSORS_8[bucket]!;
}

type Size = { width: number; height: number };
/** The size the pointer asks for and the whole-px size written for it. */
export type ResizeDraftSizes = { wanted: Size; written: Size };

/** Overlay shift of the pinned center that puts the grabbed corner where the wanted size would: the
 *  written size is whole px, so half the remainder moves along the element's own rendered edges. */
export function resizeRemainderShift(
  corners: Record<FixedCorner, { x: number; y: number }>,
  grab: { x: number; y: number },
  { wanted, written }: ResizeDraftSizes,
): { x: number; y: number } {
  const u = { x: corners.ne.x - corners.nw.x, y: corners.ne.y - corners.nw.y };
  const v = { x: corners.sw.x - corners.nw.x, y: corners.sw.y - corners.nw.y };
  // `grab` in edge coordinates: which side of each edge the grabbed corner is, even on a skewed box.
  const det = u.x * v.y - u.y * v.x;
  if (!det) return { x: 0, y: 0 };
  const su = Math.sign((grab.x * v.y - grab.y * v.x) / det);
  const sv = Math.sign((u.x * grab.y - u.y * grab.x) / det);
  const kw = (su * (wanted.width - written.width)) / (2 * written.width);
  const kh = (sv * (wanted.height - written.height)) / (2 * written.height);
  return { x: u.x * kw + v.x * kh, y: u.y * kw + v.y * kh };
}

/** Per-frame anchored-resize center accumulator: ADD the residual center correction
 *  (fixedStart − fixedNow) onto the previous anchor so the pin CONVERGES instead of
 *  oscillating (fa4f39168). Pure; exported for the release-shift characterization tests. */
export function computeNextResizeAnchor(
  prev: { dx: number; dy: number } | undefined,
  fixedStart: { x: number; y: number },
  fixedNow: { x: number; y: number },
): { dx: number; dy: number } {
  const base = prev ?? { dx: 0, dy: 0 };
  return { dx: base.dx + (fixedStart.x - fixedNow.x), dy: base.dy + (fixedStart.y - fixedNow.y) };
}
