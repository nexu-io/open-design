/**
 * Low-level drag commit helpers for GSAP position mutations.
 * Extracted from gsapRuntimeBridge.ts to keep file sizes under the 600-line limit.
 */
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { usePlayerStore } from "../player/store/playerStore";
import {
  percentageToAbsoluteForAnimation,
  resolveTweenStart,
  resolveTweenDuration,
} from "../utils/globalTimeCompiler";
import { roundTo3, roundToLayoutPx } from "../utils/rounding";
import { computeElementPercentage, keyframeEases, writeTargetSelector } from "./gsapShared";
import {
  computeDraggedGsapPosition,
  readDragStamp,
  restoreDragOffset,
  type DragStamp,
} from "./draggedGsapPosition";
import type { CommitMutation } from "./gsapScriptCommitTypes";
import { isGestureTransactionCommit, runGestureTransaction } from "./gestureTransaction";
import { setPatchFromUpdateProperty } from "./gsapDragStaticSetHelpers";
import { GsapEditBlockedError, type PlayheadEditRefusal } from "./gsapEditOutcome";
import { isTweenConfigKey } from "@hyperframes/parsers/gsap-constants";
export {
  findExistingPositionWrite,
  findRotationSetAnimation,
  findSizeSetAnimation,
} from "./gsapDragStaticSetHelpers";
export interface GsapDragCommitCallbacks {
  commitMutation: CommitMutation;
  fetchAnimations?: () => Promise<GsapAnimation[]>;
  /** The gesture's drag stamp, when its commit can outlive it; else read from the element. */
  stamp?: DragStamp;
}

/**
 * The target for a tween these helpers are about to CREATE. Callers derive
 * `selector` with `selectorFromSelection`, which hands back a bare class for an
 * id-less element: authoring that widens a one-element drag/resize/rotate into a
 * write over every sibling sharing the class. Retargets of an EXISTING tween
 * must NOT come through here (they keep `anim.targetSelector`, so a tween the
 * author aimed at a group stays aimed at it).
 *
 * Null means no one-element form exists, and every caller drops the commit
 * rather than falling back to `selector` (see writeTargetSelector): the drag
 * reverts on the next reload, which is recoverable, where a `.group` write is
 * not.
 */
function newTweenTarget(selection: DomEditSelection): string | null {
  return writeTargetSelector(selection);
}

// Re-export for backward compatibility with existing imports.
export function computeCurrentPercentage(
  selection: DomEditSelection,
  animation?: GsapAnimation,
  time = usePlayerStore.getState().currentTime,
): number {
  return computeElementPercentage(time, selection, animation);
}

// When a drag edits a SELECTED keyframe, park the playhead on that keyframe's exact
// time. Otherwise the playhead can sit a frame outside the tween (e.g. 1.1666 vs a
// 1.2 start), so the post-commit reseek renders the element's base pose and the edit
// looks like it snapped away. Keeping the playhead on the edited keyframe avoids that.
export function parkPlayheadOnKeyframe(anim: GsapAnimation, pct: number): void {
  const time = percentageToAbsoluteForAnimation(pct, anim);
  if (time === null || resolveTweenDuration(anim) <= 0) return;
  usePlayerStore.getState().requestSeek(roundTo3(time));
}

async function replaceKeyframedPositionHold(
  selection: DomEditSelection,
  existingSet: GsapAnimation,
  properties: { x: number; y: number },
  commitMutation: GsapDragCommitCallbacks["commitMutation"],
): Promise<void> {
  const target = newTweenTarget(selection);
  if (!target) throw new GsapEditBlockedError("no-selector");
  const persist = async (commit: GsapDragCommitCallbacks["commitMutation"]) => {
    await commit(
      selection,
      {
        type: "add",
        targetSelector: target,
        method: "set",
        position: 0,
        properties,
        global: true,
      },
      { label: "Move layer", skipReload: true },
    );
    await commit(
      selection,
      { type: "delete", animationId: existingSet.id },
      { label: "Move layer", softReload: true },
    );
  };

  if (isGestureTransactionCommit(commitMutation)) {
    await persist(commitMutation);
    return;
  }
  await runGestureTransaction({
    element: selection.element,
    label: "Move layer",
    settle: () => undefined,
    persist: async (commit) => persist(commit(commitMutation)),
    restore: () => undefined,
  });
}

// ── Dynamic keyframe materialization ──────────────────────────────────────

export async function materializeIfDynamic(
  anim: GsapAnimation,
  iframe: HTMLIFrameElement | null,
  commitMutation: GsapDragCommitCallbacks["commitMutation"],
  selection: DomEditSelection,
): Promise<string | void> {
  if (!anim.hasUnresolvedKeyframes && !anim.hasUnresolvedSelector) return;
  // Geometry commits must never rewrite runtime/computed source implicitly.
  // The explicit Unroll action owns that source-destructive transition.
  void iframe;
  void commitMutation;
  void selection;
  throw new GsapEditBlockedError("source-uneditable", "geometry-unresolved-source");
}

/** Why a percentage keyframe can't stand in for this array step entry, or null when it can. */
function stepBlock([key, value]: [string, number | string]): PlayheadEditRefusal | null {
  if (key === "delay") return "array-step-delay";
  if (/^on[A-Z]/.test(key)) return "array-step-callback";
  if (isTweenConfigKey(key)) return "array-step-config";
  if (typeof value === "number") return null;
  return STEP_VALUE_BLOCKS.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}

/** First match wins: code is computed, even when it calls random(). */
const STEP_VALUE_BLOCKS: Array<[RegExp, PlayheadEditRefusal]> = [
  [/^__raw:/, "array-step-computed"],
  [/random\(/, "array-step-random"],
  [/[-+*/]=/, "array-step-relative"],
];

/** Why a step list can't be rewritten as percentage keyframes, or null. */
export function stepListBlock(anim: GsapAnimation): PlayheadEditRefusal | null {
  const data = anim.keyframes;
  if (data?.format !== "object-array") return null;
  const entries = data.keyframes.flatMap((kf) => Object.entries(kf.properties));
  return entries.map(stepBlock).find(Boolean) ?? null;
}

/** Whole-offset writers rewrite every step as a keyframe; refuse a list that holds more than values. */
export function refuseStepListRewrite(anim: GsapAnimation): void {
  const step = stepListBlock(anim);
  if (step) throw new GsapEditBlockedError("keyframes-uneditable", step);
}

// ── Drag → GSAP position math ──────────────────────────────────────────────

/**
 * Commit a STATIC element drag as a `tl.set("#el",{x,y})` — the single-source
 * position channel for elements with no position animation. Idempotent: a
 * re-nudge of an element that already has a `set` UPDATES that set's x/y
 * in one `update-properties` mutation rather than stacking a second set or
 * converting it to keyframes (plan R2 / KTD3). New elements get one `add`
 * mutation with `method:"set"` at position 0.
 */
export async function commitStaticGsapPosition(
  selection: DomEditSelection,
  studioOffset: { x: number; y: number },
  gsapPos: { x: number; y: number },
  selector: string,
  existingSet: GsapAnimation | null,
  callbacks: GsapDragCommitCallbacks,
): Promise<void> {
  const { newX, newY } = computeDraggedGsapPosition(
    selection.element,
    studioOffset,
    gsapPos,
    callbacks.stamp,
  );
  if (existingSet) {
    if (existingSet.keyframes) {
      // Keyframed zero-duration hold (drag-path corruption): can't update-property
      // into keyframes. Add the replacement first so either failure leaves at
      // least one hold on disk, then delete the corrupt tween in one transaction.
      await replaceKeyframedPositionHold(
        selection,
        existingSet,
        { x: newX, y: newY },
        callbacks.commitMutation,
      );
      return;
    }
    const mutation = {
      type: "update-properties",
      animationId: existingSet.id,
      properties: { x: newX, y: newY },
    } as const;
    const global = !!existingSet.global;
    await callbacks.commitMutation(selection, mutation, {
      label: "Move layer",
      softReload: true,
      instantPatch: {
        selector,
        change: { kind: global ? "global-set" : "set", props: mutation.properties },
      },
    });
    return;
  }
  // New static hold → a base `gsap.set` (off-timeline, no 0% keyframe marker), with
  // an instant patch so the first nudge shows immediately (no soft-reload flash).
  // The patch reuses the WRITTEN target so the runtime moves exactly the element
  // the source write names.
  const target = newTweenTarget(selection);
  if (!target) throw new GsapEditBlockedError("no-selector");
  await callbacks.commitMutation(
    selection,
    {
      type: "add",
      targetSelector: target,
      method: "set",
      position: 0,
      properties: { x: newX, y: newY },
      global: true,
    },
    {
      label: "Move layer",
      softReload: true,
      instantPatch: {
        selector: target,
        change: { kind: "global-set", props: { x: newX, y: newY } },
      },
    },
  );
}

/**
 * Commit a STATIC element rotation as a `tl.set("#el",{rotation})` — the single-
 * source rotation channel for elements with no rotation animation (mirrors
 * `commitStaticGsapPosition`). `newRotation` is the already-resolved absolute angle
 * (current runtime rotation + drag delta). Idempotent: re-rotating an element that
 * already has a rotation `set` UPDATES it in place (one `update-property`, rotation
 * is a single value unlike x/y); a new element gets one `add` with `method:"set"`.
 */
export async function commitStaticGsapRotation(
  selection: DomEditSelection,
  newRotation: number,
  selector: string,
  existingSet: GsapAnimation | null,
  callbacks: GsapDragCommitCallbacks,
): Promise<void> {
  if (existingSet) {
    // Derive the instantPatch from the SAME mutation object that's POSTed (single
    // source of truth — see commitStaticGsapPosition), so the validated `value`
    // flows into the patch and the two can't drift.
    const rotationMutation = {
      type: "update-property",
      animationId: existingSet.id,
      property: "rotation",
      value: newRotation,
    } as const;
    await callbacks.commitMutation(selection, rotationMutation, {
      label: "Rotate layer",
      softReload: true,
      // Value-only rotation set — patch the runtime in place (off-timeline gsap.set
      // applies to the element directly; on-timeline tl.set patches its tween).
      instantPatch: setPatchFromUpdateProperty(selector, rotationMutation, !!existingSet.global),
    });
    return;
  }
  // New static hold → off-timeline `gsap.set` (no 0% keyframe marker) + instant patch.
  const target = newTweenTarget(selection);
  if (!target) throw new GsapEditBlockedError("no-selector");
  await callbacks.commitMutation(
    selection,
    {
      type: "add",
      targetSelector: target,
      method: "set",
      position: 0,
      properties: { rotation: newRotation },
      global: true,
    },
    {
      label: "Rotate layer",
      softReload: true,
      instantPatch: {
        selector: target,
        change: { kind: "global-set", props: { rotation: newRotation } },
      },
    },
  );
}

/**
 * A static resize as `tl.set("#el",{width,height})`, only where the script already writes the size
 * (else it is CSS). A set, not a one-stop keyframe tween, which renders NaN/0 off its keyframe.
 * Updates an existing size set in place, else adds one.
 */
export async function commitStaticGsapSize(
  selection: DomEditSelection,
  size: { width: number; height: number },
  selector: string,
  existingSet: GsapAnimation | null,
  callbacks: GsapDragCommitCallbacks,
): Promise<void> {
  const width = roundToLayoutPx(size.width);
  const height = roundToLayoutPx(size.height);
  if (existingSet) {
    await callbacks.commitMutation(
      selection,
      {
        type: "update-properties",
        animationId: existingSet.id,
        properties: { width, height },
      },
      { label: "Resize layer", softReload: true },
    );
    return;
  }
  const target = newTweenTarget(selection);
  if (!target) throw new GsapEditBlockedError("no-selector");
  await callbacks.commitMutation(
    selection,
    {
      type: "add",
      targetSelector: target,
      method: "set",
      position: 0,
      properties: { width, height },
    },
    { label: "Resize layer", softReload: true },
  );
}

// ── Whole-path offset (plain drag on animated element) ──────────────────

/**
 * Offset the entire animation path by the drag delta — every keyframe's x/y
 * shifts together so the animation shape is preserved and the element can't
 * dart off-screen. For flat tweens (no keyframes), convert first then shift.
 */
// fallow-ignore-next-line code-duplication
// fallow-ignore-next-line complexity
export async function commitWholePathOffset(
  selection: DomEditSelection,
  anim: GsapAnimation,
  studioOffset: { x: number; y: number },
  gsapPos: { x: number; y: number },
  iframe: HTMLIFrameElement | null,
  selector: string,
  callbacks: GsapDragCommitCallbacks,
): Promise<void> {
  const el = selection.element;
  const stamp = callbacks.stamp ?? readDragStamp(el);
  const { newX, newY, baseGsapX, baseGsapY } = computeDraggedGsapPosition(
    el,
    studioOffset,
    gsapPos,
    stamp,
  );
  const deltaX = newX - baseGsapX;
  // fallow-ignore-next-line code-duplication
  const deltaY = newY - baseGsapY;
  const restoreOffset = () => restoreDragOffset(el, stamp);

  // fallow-ignore-next-line code-duplication
  let effectiveAnim = anim;
  if (anim.keyframes) {
    refuseStepListRewrite(anim);
    const newId = await materializeIfDynamic(anim, iframe, callbacks.commitMutation, selection);
    if (newId) effectiveAnim = { ...anim, id: newId };
  }

  const ts = resolveTweenStart(effectiveAnim);
  const td = resolveTweenDuration(effectiveAnim);

  let kfs = effectiveAnim.keyframes?.keyframes ?? [];
  if (kfs.length === 0) {
    const fromProps = effectiveAnim.fromProperties ?? {};
    const toProps = effectiveAnim.properties ?? {};
    const startX =
      typeof fromProps.x === "number" ? fromProps.x : typeof toProps.x === "number" ? 0 : 0;
    const startY =
      typeof fromProps.y === "number" ? fromProps.y : typeof toProps.y === "number" ? 0 : 0;
    const endX = typeof toProps.x === "number" ? toProps.x : startX;
    const endY = typeof toProps.y === "number" ? toProps.y : startY;
    kfs = [
      { percentage: 0, properties: { x: startX, y: startY } },
      { percentage: 100, properties: { x: endX, y: endY } },
    ];
  }

  const shifted = kfs.map((kf) => ({
    percentage: kf.percentage,
    properties: {
      ...kf.properties,
      x: roundTo3((typeof kf.properties.x === "number" ? kf.properties.x : 0) + deltaX),
      y: roundTo3((typeof kf.properties.y === "number" ? kf.properties.y : 0) + deltaY),
    },
    ...(kf.ease ? { ease: kf.ease } : {}),
  }));

  await callbacks.commitMutation(
    selection,
    {
      type: "replace-with-keyframes",
      animationId: effectiveAnim.id,
      targetSelector: effectiveAnim.targetSelector,
      position: roundTo3(ts ?? 0),
      duration: roundTo3(td || 1),
      keyframes: shifted,
      ...keyframeEases(effectiveAnim),
    },
    { label: "Move animation path", softReload: true, beforeReload: restoreOffset },
  );
}
