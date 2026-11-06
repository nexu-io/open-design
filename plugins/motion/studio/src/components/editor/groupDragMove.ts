import { resolveDomEditGroupOverlayRect } from "./domEditOverlayGeometry";
import {
  resolveEquidistanceGuides,
  resolveSnapAdjustment,
  snapEngagedForTravel,
  SNAP_THRESHOLD_PX,
} from "./snapEngine";
import { applyManualOffsetDragDraft } from "./manualOffsetDrag";
import {
  lockDragToDominantAxis,
  type AxisLockedDelta,
  type GroupGestureState,
  type UseDomEditOverlayGesturesOptions,
} from "./domEditOverlayGestures";
import type { GroupOverlayItem } from "./domEditOverlayGeometry";
import {
  findNonRigidMembers,
  logDrag,
  logDragMove,
  readDragPositions,
} from "../../utils/dragDebug";

/**
 * One frame of a group drag, kept out of onPointerMove — which already handles
 * four gesture kinds and reads better without this one's snapping arithmetic.
 * The previous frame's positions live in the closure so the rigidity check below
 * compares against the frame before, not against whatever was last sampled.
 */
export function createGroupDragMover(
  opts: UseDomEditOverlayGesturesOptions,
  setDraftGroupOverlayItems: (items: GroupOverlayItem[]) => void,
) {
  let lastGroupPositions: Record<string, string> = {};
  let lastGesture: GroupGestureState | null = null;

  /** Snap the group's delta to nearby edges, publishing the guides drawn for it. */
  // fallow-ignore-next-line complexity
  const snapGroupDelta = (
    groupG: GroupGestureState,
    e: React.PointerEvent<HTMLDivElement>,
    proposed: AxisLockedDelta,
  ) => {
    const sc = groupG.snapContext;
    if (!sc?.snapEnabled || sc.targets.length === 0) return proposed;
    if (!snapEngagedForTravel(proposed.dx, proposed.dy)) {
      opts.snapGuidesRef.current = null;
      return proposed;
    }
    const groupBounds = resolveDomEditGroupOverlayRect(groupG.originItems.map((i) => i.rect));
    if (!groupBounds) return proposed;
    const allTargets = sc.compositionTarget ? [...sc.targets, sc.compositionTarget] : sc.targets;
    const snap = resolveSnapAdjustment({
      movingRect: groupBounds,
      proposedDx: proposed.dx,
      proposedDy: proposed.dy,
      targets: allTargets,
      gridEdges: sc.gridEdges ?? undefined,
      threshold: SNAP_THRESHOLD_PX,
      disabled: e.altKey,
      lockedAxis: proposed.lockedAxis,
    });
    const movingRect = {
      ...groupBounds,
      left: groupBounds.left + snap.dx,
      top: groupBounds.top + snap.dy,
    };
    const spacingGuides = e.altKey
      ? []
      : resolveEquidistanceGuides({
          movingRect,
          targets: allTargets,
          threshold: SNAP_THRESHOLD_PX,
        });
    opts.snapGuidesRef.current = { guides: snap.guides, spacingGuides };
    return { dx: snap.dx, dy: snap.dy };
  };

  /** One frame of a group drag: snap the delta, redraw the boxes, move every member. */
  const moveGroupDrag = (groupG: GroupGestureState, e: React.PointerEvent<HTMLDivElement>) => {
    if (groupG !== lastGesture) {
      lastGesture = groupG;
      lastGroupPositions = {};
    }
    const { dx, dy } = snapGroupDelta(
      groupG,
      e,
      lockDragToDominantAxis(e.clientX - groupG.startX, e.clientY - groupG.startY, e.shiftKey),
    );
    groupG.lastSnappedDx = dx;
    groupG.lastSnappedDy = dy;

    setDraftGroupOverlayItems(
      groupG.originItems.map((i) => ({
        ...i,
        rect: { ...i.rect, left: i.rect.left + dx, top: i.rect.top + dy },
      })),
    );
    const offsets: Record<string, string> = {};
    for (const m of groupG.members) {
      const n = applyManualOffsetDragDraft(m, dx, dy);
      offsets[m.key] = `${Math.round(n.x)},${Math.round(n.y)}`;
    }
    const at = readDragPositions(groupG.members);
    const px = Math.round(e.clientX - groupG.startX);
    const py = Math.round(e.clientY - groupG.startY);
    // A member breaking away IS the fault, so it reports on the frame it happens;
    // the throttled line below would step over it. A gap between pointer and
    // applied there is snapping pulling the group off the cursor.
    const trace = { pointer: `${px},${py}`, applied: `${Math.round(dx)},${Math.round(dy)}`, at };
    const drift = findNonRigidMembers(lastGroupPositions, at);
    if (drift.length > 0) logDrag("drift", { ...trace, drift });
    lastGroupPositions = at;
    logDragMove({ ...trace, offsets });
  };

  return moveGroupDrag;
}
