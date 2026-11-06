import type { GsapAnimation, GsapPercentageKeyframe } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { usePlayerStore } from "../player/store/playerStore";
import {
  isTimeWithinTween,
  resolveTweenDuration,
  resolveTweenStart,
} from "../utils/globalTimeCompiler";
import { KEYFRAME_PCT_MATCH, playsNear } from "./gsapShared";
import { progressAtTime, runEaseOf, timeAtProgress } from "../utils/gsapKeyframeEases";
import { roundTo3 } from "../utils/rounding";
import {
  computeDraggedGsapPosition,
  readDragStamp,
  restoreDragOffset,
} from "./draggedGsapPosition";
import {
  type GsapDragCommitCallbacks,
  computeCurrentPercentage,
  parkPlayheadOnKeyframe,
} from "./gsapDragCommit";
import type { GsapEditOutcome } from "./gsapEditOutcome";
import { commitValueAtPlayhead, planValueEdit } from "./gsapValueAtPlayhead";
import { editMoment } from "./editMoment";
import type { EditMoment } from "../components/editor/manualEditsTypes";

/**
 * The tween's keyframes with one inserted at `percentage`. Any existing keyframe
 * within {@link KEYFRAME_PCT_MATCH} of the insert is REPLACED, not kept: the
 * server takes a replace-with-keyframes list verbatim, so an append-only build
 * could hand it two keyframes a fraction of a percent apart. The invariant lives
 * here rather than in each caller's own pre-check, which is how the two callers
 * ended up with different tolerances in the first place. Arc writes are linear, so each
 * keyframe moves to the time GSAP reached it and `percentage` is a time percentage.
 */
export function buildTemporalArcKeyframes(
  anim: GsapAnimation,
  percentage: number,
  properties: Record<string, number>,
) {
  return [
    ...linearArcKeyframes(anim)
      .filter((keyframe) => Math.abs(keyframe.percentage - percentage) > KEYFRAME_PCT_MATCH)
      .map((keyframe) => ({
        percentage: keyframe.percentage,
        properties: { ...keyframe.properties },
        ...(keyframe.ease ? { ease: keyframe.ease } : {}),
      })),
    { percentage, properties },
  ].sort((a, b) => a.percentage - b.percentage);
}

/** An arc's keyframes at the time percentages GSAP plays them, for a write with `ease: "none"`. */
export function linearArcKeyframes(anim: GsapAnimation): GsapPercentageKeyframe[] {
  const runEase = runEaseOf(anim);
  return (anim.keyframes?.keyframes ?? []).map((keyframe) => ({
    ...keyframe,
    percentage: roundTo3(timeAtProgress(runEase, keyframe.percentage)),
  }));
}

/** Grow a keyframe tween's range to a playhead outside it and add a keyframe there; every
 *  existing keyframe keeps its absolute time under `writeEase`, the run ease the write keeps. */
export function buildExtendedKeyframes(
  anim: GsapAnimation,
  currentTime: number,
  position: Record<string, number>,
  sourceDuration = resolveTweenDuration(anim),
  writeEase = runEaseOf(anim),
): { position: number; duration: number; keyframes: GsapPercentageKeyframe[] } {
  const oldStart = resolveTweenStart(anim) ?? 0;
  const oldDuration = sourceDuration;
  const newStart = Math.min(oldStart, currentTime);
  const newEnd = Math.max(oldStart + oldDuration, currentTime);
  const newDuration = roundTo3(newEnd - newStart);
  const oldRunEase = runEaseOf(anim);
  const toPct = (absoluteTime: number) => {
    if (newDuration <= 0) return 0;
    const progress = progressAtTime(writeEase, ((absoluteTime - newStart) / newDuration) * 100);
    return Math.max(0, Math.min(100, Math.round(progress * 10) / 10));
  };
  const stops = anim.keyframes?.keyframes ?? [];
  const rescaled: GsapPercentageKeyframe[] = stops.map((stop) => ({
    percentage: toPct(oldStart + (timeAtProgress(oldRunEase, stop.percentage) / 100) * oldDuration),
    properties: stop.properties,
    ...(stop.ease ? { ease: stop.ease } : {}),
  }));
  const added: GsapPercentageKeyframe = { percentage: toPct(currentTime), properties: position };
  const keyframes = [...rescaled, added].sort((a, b) => a.percentage - b.percentage);
  return { position: roundTo3(newStart), duration: newDuration, keyframes };
}

/** commitGsapPositionFromDrag's refusal, decided without writing. */
export function gsapPositionFromDragOutcome(
  selection: DomEditSelection,
  anim: GsapAnimation,
  studioOffset: { x: number; y: number },
  gsapPos: { x: number; y: number },
  iframe: HTMLIFrameElement | null,
  moment?: EditMoment,
): GsapEditOutcome {
  if (anim.arcPath?.enabled) return { status: "persisted" };
  const { newX, newY, baseGsapX, baseGsapY } = computeDraggedGsapPosition(
    selection.element,
    studioOffset,
    gsapPos,
  );
  const plan = planValueEdit(selection, anim, { x: newX, y: newY }, iframe, {
    backfill: { x: baseGsapX, y: baseGsapY },
    moment,
  });
  return plan.ok
    ? { status: "persisted" }
    : { status: "blocked", reason: "keyframes-uneditable", detail: plan.reason };
}

// fallow-ignore-next-line code-duplication
// fallow-ignore-next-line complexity
export async function commitGsapPositionFromDrag(
  selection: DomEditSelection,
  anim: GsapAnimation,
  studioOffset: { x: number; y: number },
  gsapPos: { x: number; y: number },
  iframe: HTMLIFrameElement | null,
  callbacks: GsapDragCommitCallbacks,
): Promise<GsapEditOutcome> {
  const el = selection.element;
  const stamp = callbacks.stamp ?? readDragStamp(el);
  // fallow-ignore-next-line code-duplication
  const { newX, newY, baseGsapX, baseGsapY } = computeDraggedGsapPosition(
    el,
    studioOffset,
    gsapPos,
    stamp,
  );
  const restoreOffset = () => restoreDragOffset(el, stamp);

  if (anim.arcPath?.enabled) {
    const { keyframePct: activeKeyframePct, time: currentTime } = editMoment(stamp);
    const { setActiveKeyframePct } = usePlayerStore.getState();
    const tweenStart = resolveTweenStart(anim);
    const tweenDuration = resolveTweenDuration(anim);
    if (
      activeKeyframePct === null &&
      tweenStart !== null &&
      !isTimeWithinTween(currentTime, tweenStart, tweenDuration)
    ) {
      const extended = buildExtendedKeyframes(
        anim,
        currentTime,
        { x: newX, y: newY },
        tweenDuration,
        "none",
      );
      await callbacks.commitMutation(
        selection,
        {
          type: "replace-with-keyframes",
          animationId: anim.id,
          targetSelector: anim.targetSelector,
          ...extended,
          ease: "none",
        },
        {
          label: "Move layer (new keyframe)",
          keyframeAction: "add",
          softReload: true,
          beforeReload: restoreOffset,
        },
      );
      return { status: "persisted" };
    }
    const pct = activeKeyframePct ?? computeCurrentPercentage(selection, anim, currentTime);
    const keyframes = anim.keyframes?.keyframes ?? [];
    // A drag counts as on a waypoint when it plays within KEYFRAME_PCT_MATCH of it,
    // so landing a fraction of a percent off an authored waypoint updates that point
    // instead of appending a new one.
    const pointIndex = keyframes.findIndex((kf) => playsNear(anim, kf.percentage, pct));
    if (pointIndex >= 0) {
      await callbacks.commitMutation(
        selection,
        {
          type: "update-motion-path-point",
          animationId: anim.id,
          pointIndex,
          x: newX,
          y: newY,
        },
        { label: "Move layer (waypoint)", softReload: true, beforeReload: restoreOffset },
      );
      setActiveKeyframePct(null);
      parkPlayheadOnKeyframe(anim, pct);
      return { status: "persisted" };
    }

    if (tweenStart === null || tweenDuration <= 0 || keyframes.length < 2)
      return { status: "persisted" };
    const timePct = roundTo3(timeAtProgress(runEaseOf(anim), pct));
    const temporalKeyframes = buildTemporalArcKeyframes(anim, timePct, { x: newX, y: newY });
    await callbacks.commitMutation(
      selection,
      {
        type: "replace-with-keyframes",
        animationId: anim.id,
        targetSelector: anim.targetSelector,
        position: roundTo3(tweenStart),
        duration: roundTo3(tweenDuration),
        keyframes: temporalKeyframes,
        ease: "none",
      },
      {
        label: "Move layer (new keyframe)",
        keyframeAction: "add",
        softReload: true,
        beforeReload: restoreOffset,
      },
    );
    return { status: "persisted" };
  }
  return commitValueAtPlayhead(
    selection,
    anim,
    { x: newX, y: newY },
    iframe,
    { ...callbacks, stamp },
    {
      label: "Move layer",
      backfill: { x: baseGsapX, y: baseGsapY },
      beforeReload: restoreOffset,
    },
  );
}
