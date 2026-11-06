import { describe, expect, it } from "vitest";
import {
  resolveSnapAdjustment,
  snapEngagedForTravel,
  SNAP_THRESHOLD_PX,
  type SnapTarget,
} from "./snapEngine";

/**
 * Picking a selection up used to move it. An element resting within the snap
 * threshold of a guide is already snappable, so the snap computed on the first
 * frame of a drag displaced it by up to the threshold while the pointer had not
 * moved at all — captured live as `pointer "0,0"` against `applied "4,-3"`, with
 * every member of the group jumping 12,-8 composition px before the drag had
 * started. Snapping pulls toward a guide as you drag; it has nothing to say about
 * a gesture that has not moved.
 */
describe("snapping waits for the drag to travel", () => {
  // Moving box's right edge is at 150; the target's left edge is at 154, so the
  // pair is 4px apart — inside the threshold, and snappable the moment it is asked.
  const movingRect = { left: 100, top: 50, width: 50, height: 40 };
  const target: SnapTarget = {
    left: 154,
    top: 50,
    right: 254,
    bottom: 90,
    centerX: 204,
    centerY: 70,
    id: "neighbour",
  };

  const snapAt = (dx: number, dy: number) =>
    resolveSnapAdjustment({
      movingRect,
      proposedDx: dx,
      proposedDy: dy,
      targets: [target],
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
      disabledForTravel: !snapEngagedForTravel(dx, dy),
    });

  it("does not move a selection that has not been dragged yet", () => {
    expect(snapAt(0, 0)).toMatchObject({ dx: 0, dy: 0 });
  });

  it("leaves a sub-threshold twitch alone", () => {
    expect(snapAt(1, -1)).toMatchObject({ dx: 1, dy: -1 });
  });

  it("still snaps once the drag is a real one", () => {
    expect(snapEngagedForTravel(0, 0)).toBe(false);
    expect(snapEngagedForTravel(10, 0)).toBe(true);
    // Without the travel gate the same delta snaps, which is the behaviour to keep.
    const engaged = resolveSnapAdjustment({
      movingRect,
      proposedDx: 0,
      proposedDy: 0,
      targets: [target],
      threshold: SNAP_THRESHOLD_PX,
      disabled: false,
    });
    expect(engaged.dx).toBe(4);
  });
});
