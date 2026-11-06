import type { RefObject } from "react";
import type { DomEditSelection } from "./domEditing";
import type {
  StudioBoxSizeSnapshot,
  StudioPathOffsetSnapshot,
  StudioRotationSnapshot,
} from "./manualEdits";
import type { ManualOffsetDragMember } from "./manualOffsetDrag";
import type { StudioElementLook } from "./gestureUndoRevert";
import type { CssRotationTarget, RotationCommit } from "./rotationDraft";
import type { GroupOverlayItem, OverlayRect } from "./domEditOverlayGeometry";
import type { SnapContext } from "./snapTargetCollection";
import type { SnapGuidesState } from "./SnapGuideOverlay";
import type { PreviewMouseDownOptions } from "../../hooks/usePreviewInteraction";
import { logSelect } from "../../utils/selectDebug";
import { roundTo3 } from "../../utils/rounding";

export type GestureKind = "drag" | "resize" | "rotate";

/** Which corner handle initiated a resize gesture. */
export type ResizeHandle = "nw" | "ne" | "sw" | "se";

export const BLOCKED_MOVE_THRESHOLD_PX = 4;

export interface AxisLockedDelta {
  dx: number;
  dy: number;
  lockedAxis?: "x" | "y";
}

export function lockDragToDominantAxis(dx: number, dy: number, shiftKey: boolean): AxisLockedDelta {
  if (!shiftKey) return { dx, dy };
  return Math.abs(dx) >= Math.abs(dy)
    ? { dx, dy: 0, lockedAxis: "y" }
    : { dx: 0, dy, lockedAxis: "x" };
}

const ROTATION_COMMIT_EPSILON_DEGREES = 0.05;
const ROTATION_SNAP_DEGREES = 15;
/**
 * Above this rotation, resize/move edge-snapping is bypassed. Industry editors
 * (tldraw/Figma) don't edge-snap rotated boxes — the snap targets are axis-aligned
 * AABBs, so snapping a rotated box's AABB to them shifts the box in a way the user
 * can't predict; a wrong snap is worse than none. Rotation ~0 keeps snapping exactly
 * as before.
 */
export const ROTATED_SNAP_BYPASS_DEGREES = 0.5;

export interface GestureState {
  kind: GestureKind;
  mode: "path-offset" | "box-size" | "rotation";
  selection: DomEditSelection;
  pointerId: number;
  startX: number;
  startY: number;
  centerX: number;
  centerY: number;
  initialPathOffset: StudioPathOffsetSnapshot;
  initialRotation: StudioRotationSnapshot;
  initialBoxSize: StudioBoxSizeSnapshot;
  initialLook: StudioElementLook;
  pathOffsetMember?: ManualOffsetDragMember;
  originLeft: number;
  originTop: number;
  originWidth: number;
  originHeight: number;
  actualWidth: number;
  actualHeight: number;
  actualRotation: number;
  /** Null when GSAP owns the rotate; else where its CSS turn is drawn and saved, read at press. */
  plainRotation: CssRotationTarget | null;
  editScaleX: number;
  editScaleY: number;
  // Rendered px per CSS px of the element at gesture start (> 1 under a GSAP scale()); the resize
  // draft divides by it so the box follows the cursor instead of overshooting by the live scale.
  contentScaleX: number;
  contentScaleY: number;
  manualEditDragToken?: string;
  snapContext?: SnapContext;
  lastSnappedDx?: number;
  lastSnappedDy?: number;
  travelled?: boolean;
  /** Corner the resize gesture grabbed (resize gestures only). */
  resizeHandle?: ResizeHandle;
  /** Last anchoring translation applied during a corner resize (overlay px). */
  lastResizeAnchor?: { dx: number; dy: number };
  /**
   * The element's rendered CENTER in overlay px at gesture start (the centroid of
   * its four real — possibly rotated — corners). A center-anchored resize keeps this
   * point pinned; the per-frame anchor translation is computed as the shift of this
   * exact center, not an AABB width/height delta (which only holds the center still
   * when the element grows symmetrically from an unrotated layout box). Undefined
   * when the corner geometry can't be measured (member creation still succeeded).
   */
  resizeFixedCenterStart?: { x: number; y: number };
  resizePressFromCorner?: { x: number; y: number };
}

export interface GroupGestureState {
  pointerId: number;
  startX: number;
  startY: number;
  originItems: GroupOverlayItem[];
  members: ManualOffsetDragMember[];
  snapContext?: SnapContext;
  lastSnappedDx?: number;
  lastSnappedDy?: number;
  travelled?: boolean;
}

/** Only the pressing pointer's moves with its button held drive a gesture, not Chromium's buttonless resends. */
export function movesGesture(
  gesture: { pointerId: number },
  e: { pointerId: number; buttons: number },
): boolean {
  return e.pointerId === gesture.pointerId && (e.buttons & 1) === 1;
}

export interface BlockedMoveState {
  pointerId: number;
  startX: number;
  startY: number;
}

/** Marks the selection box while its press waits for a reload: it is drawn at the pointer, not at the element. */
export const PRESS_WAITING_ATTR = "data-dom-edit-press-waiting";

/** A press that landed while the preview reloads: it starts once the new preview shows what it pressed. */
export interface WaitingPressState {
  pointerId: number;
  startX: number;
  startY: number;
  draw: ((dx: number, dy: number) => void) | null;
  frame: number;
  moved: React.PointerEvent<HTMLDivElement> | null;
  released: React.PointerEvent<HTMLDivElement> | null;
  after: WaitingPressState | null;
  ended: boolean;
}

export type FocusableDomEditOverlay = {
  focus(options?: FocusOptions): void;
};

export function focusDomEditOverlayElement(element: FocusableDomEditOverlay | null): void {
  element?.focus({ preventScroll: true });
}

/**
 * Whether the hover cache may stand in for a hit-test at this point.
 *
 * The cache is filled asynchronously as the pointer moves, so it can describe an
 * element the pointer has already left. That is harmless for drawing a hover
 * outline and wrong for a shift-click, which would add the stale element to the
 * selection instead of the one under the pointer. True only when the cached
 * element IS the element at the point, or contains it — the resolver is allowed
 * to hand back a clip ancestor of the raw target, and that still describes the
 * same click.
 */
export function hoverCacheDescribesPoint(
  cachedElement: Element | null | undefined,
  elementAtPoint: Element | null | undefined,
): boolean {
  if (!cachedElement || !elementAtPoint) return false;
  return cachedElement === elementAtPoint || cachedElement.contains(elementAtPoint);
}

/**
 * The element a shift-click should add, or null to let the slower path resolve it.
 *
 * Reading the hover cache without checking is safe for a hover outline and wrong
 * for a shift-click: the click silently adds whatever the pointer last passed
 * over instead of the element under it, which reads as multi-select picking
 * things at random. Returning null means "not confident", and the caller must
 * then fall through untouched so the mousedown path resolves the point properly.
 */
export function resolveShiftClickCandidate<T extends { element: Element }>(input: {
  cached: T | null;
  elementAtPoint: Element | null;
}): T | null {
  const describes = hoverCacheDescribesPoint(input.cached?.element, input.elementAtPoint);
  logSelect("shift-pointerdown", {
    candidate: input.cached ? ((input.cached as { selector?: string }).selector ?? null) : null,
    pointTarget: input.elementAtPoint?.id ?? input.elementAtPoint?.tagName ?? null,
    cacheIsAboutThisPoint: describes,
  });
  return describes ? input.cached : null;
}

/**
 * Overlay-px translation that keeps the element's CENTER fixed while a corner
 * resizes: a CSS width/height change grows the layout box from its top-left, so
 * the center drifts by half the size change on each axis; translating back by that
 * half-delta re-pins the center. This is the UNROTATED (AABB) fallback used only
 * when the element's real transformed corners can't be measured — the primary path
 * pins the measured center (rotation-safe) in useDomEditOverlayGestures.
 */
export function resolveResizeCenterAnchorOffset(input: {
  originWidth: number;
  originHeight: number;
  overlayWidth: number;
  overlayHeight: number;
}): { dx: number; dy: number } {
  return {
    dx: (input.originWidth - input.overlayWidth) / 2,
    dy: (input.originHeight - input.overlayHeight) / 2,
  };
}

function pointerAngleDegrees(centerX: number, centerY: number, x: number, y: number): number {
  return (Math.atan2(y - centerY, x - centerX) * 180) / Math.PI;
}

function normalizeAngleDelta(delta: number): number {
  return ((((delta + 180) % 360) + 360) % 360) - 180;
}

export function resolveDomEditRotationGesture(input: {
  centerX: number;
  centerY: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  actualAngle: number;
  snap: boolean;
}): { angle: number } {
  const startAngle = pointerAngleDegrees(input.centerX, input.centerY, input.startX, input.startY);
  const currentAngle = pointerAngleDegrees(
    input.centerX,
    input.centerY,
    input.currentX,
    input.currentY,
  );
  const delta = normalizeAngleDelta(currentAngle - startAngle);
  const angle = input.actualAngle + delta;
  return {
    angle: input.snap
      ? Math.round(angle / ROTATION_SNAP_DEGREES) * ROTATION_SNAP_DEGREES
      : roundTo3(angle),
  };
}

export function hasDomEditRotationChanged(initialAngle: number, nextAngle: number): boolean {
  return Math.abs(nextAngle - initialAngle) >= ROTATION_COMMIT_EPSILON_DEGREES;
}

// ── Shared types for DomEditOverlay gesture wiring ──
// These live here (rather than in DomEditOverlay.tsx or useDomEditOverlayGestures.ts)
// to break circular imports between those files.

export interface MoveCommitOptions {
  altKey?: boolean;
  plainTranslate?: boolean;
}

export interface DomEditGroupPathOffsetCommit {
  selection: DomEditSelection;
  next: { x: number; y: number };
  plainTranslate?: boolean;
}

// Refs are stable across renders; values are read via .current.
export type UseDomEditOverlayGesturesOptions = {
  activeCompositionPathRef: RefObject<string | null>;
  overlayRef: RefObject<HTMLDivElement | null>;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  boxRef: RefObject<HTMLDivElement | null>;
  selectionRef: RefObject<DomEditSelection | null>;
  hoverSelectionRef: RefObject<DomEditSelection | null>;
  overlayRectRef: RefObject<OverlayRect | null>;
  groupOverlayItemsRef: RefObject<GroupOverlayItem[]>;
  gestureRef: RefObject<GestureState | null>;
  groupGestureRef: RefObject<GroupGestureState | null>;
  blockedMoveRef: RefObject<BlockedMoveState | null>;
  waitingPressRef: RefObject<WaitingPressState | null>;
  rafPausedRef: RefObject<boolean>;
  suppressNextBoxClickRef: RefObject<boolean>;
  setOverlayRect: (next: OverlayRect | null) => void;
  setGroupOverlayItems: (next: GroupOverlayItem[]) => void;
  onBlockedMoveRef: RefObject<(selection: DomEditSelection, reason?: string) => void>;
  onManualDragStartRef: RefObject<(() => void) | undefined>;
  onPathOffsetCommitRef: RefObject<
    (
      s: DomEditSelection,
      n: { x: number; y: number },
      m?: MoveCommitOptions,
    ) => Promise<unknown> | void
  >;
  onGroupPathOffsetCommitRef: RefObject<
    (updates: DomEditGroupPathOffsetCommit[]) => Promise<unknown> | void
  >;
  onBoxSizeCommitRef: RefObject<
    (
      s: DomEditSelection,
      n: { width: number; height: number },
      offset?: { x: number; y: number },
      restore?: () => void,
      route?: { plainTranslate: boolean },
    ) => Promise<unknown> | void
  >;
  onRotationCommitRef: RefObject<
    (s: DomEditSelection, n: RotationCommit) => Promise<unknown> | void
  >;
  onCanvasPointerMoveRef: RefObject<
    (
      e: React.PointerEvent<HTMLDivElement>,
      o?: { preferClipAncestor?: boolean },
    ) => Promise<DomEditSelection | null>
  >;
  onCanvasMouseDown: (e: React.MouseEvent<HTMLDivElement>, o?: PreviewMouseDownOptions) => void;
  snapGuidesRef: RefObject<SnapGuidesState | null>;
};
