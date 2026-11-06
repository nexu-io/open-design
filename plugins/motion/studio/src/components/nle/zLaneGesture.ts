import type { DomEditPatchBatchesResult } from "../../hooks/domEditCommitTypes";

/**
 * Run one COMPLETE z→lane gesture — the z-index persist followed by its
 * timeline lane mirror — as a single serialized transaction.
 *
 * Why a queue: the two phases persist through DIFFERENT pipelines (the z patch
 * rides the DOM-edit save queue, the lane move rides the timeline/SDK move
 * path). Each gesture orders its own phases by awaiting the z persist, but
 * without cross-gesture serialization a second rapid gesture can land between
 * the first gesture's phases and the interleaved file writes can clobber each
 * other. Canvas z→lane and timeline lane→z gestures both chain through this
 * single module-level tail, so gesture B cannot start until gesture A settled.
 *
 * Why the durability gate: a resolved z commit is not necessarily durable —
 * when the server cannot match a patch target, commitDomEditPatchBatches
 * resolves with `durable: false` (after scheduling a reload to
 * reconverge). Mirroring a lane move onto a z state that disk never held
 * would desync track order from what actually paints, so the mirror phase is
 * skipped and the gesture resolves `false`.
 *
 * Failures never wedge the queue: a rejected gesture propagates to ITS caller
 * while the tail continues for the next gesture.
 */
let gestureTail: Promise<void> | null = null;

/** The single ordering owner for every gesture that crosses z/lane persistence. */
export function serializeZLaneGesture<Result>(run: () => Promise<Result>): Promise<Result> {
  const previous = gestureTail;
  // Preserve synchronous optimistic updates for the first gesture. A queued
  // gesture starts only after the preceding gesture fully settled.
  let gesture: Promise<Result>;
  if (previous) {
    gesture = previous.then(run, run);
  } else {
    try {
      gesture = Promise.resolve(run());
    } catch (error) {
      gesture = Promise.reject(error);
    }
  }
  const tail = gesture.then(
    () => undefined,
    () => undefined,
  );
  gestureTail = tail;
  void tail.then(() => {
    if (gestureTail === tail) gestureTail = null;
  });
  return gesture;
}

export function runZLaneGesture(input: {
  /** Phase 1: persist the z patch (handleDomZIndexReorderCommit). */
  commitZ: () => Promise<DomEditPatchBatchesResult | undefined | void>;
  /** Phase 2: mirror into a timeline lane move; only runs on a durable phase 1. */
  mirror: () => Promise<boolean>;
}): Promise<boolean> {
  const run = async (): Promise<boolean> => {
    const result = await input.commitZ();
    if (result && !result.durable) return false;
    return input.mirror();
  };
  return serializeZLaneGesture(run);
}

/** Run one lane→z gesture under the same owner as canvas z→lane gestures. */
export function runLaneZGesture(input: {
  commitLane: () => Promise<boolean>;
  commitZ: () => Promise<void>;
}): Promise<boolean> {
  return serializeZLaneGesture(async () => {
    if (!(await input.commitLane())) return false;
    await input.commitZ();
    return true;
  });
}
