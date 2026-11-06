import { usePlayerStore } from "../player/store/playerStore";
import { timelineKeyframeTargetFromSelectionKey } from "../player/components/timelineKeyframeIdentity";
import type { CommitMutationOptions } from "./gsapScriptCommitTypes";

let deleteKeyframesCommitCounter = 0;

/**
 * Remove the keyframes currently selected in the player store from the active
 * element's GSAP animation. Reads selection lazily so it stays correct when
 * invoked from a ref callback.
 */
export function deleteSelectedKeyframes(session: {
  selectedGsapAnimations: readonly { id: string; keyframes?: unknown }[];
  handleGsapRemoveKeyframe: (
    animId: string,
    pct: number,
    options?: Partial<CommitMutationOptions>,
  ) => void;
}): void {
  const { selectedKeyframes, selectedElementId } = usePlayerStore.getState();
  if (!selectedElementId) return;
  const keyframedAnimations = session.selectedGsapAnimations.filter((anim) => anim.keyframes);
  // A collapsed selection key (an ungrouped animation) carries no animation id,
  // so it only resolves when there is exactly one keyframed animation it could
  // mean. Taking the first of several deletes an arbitrary tween's keyframe.
  const fallbackAnimation = keyframedAnimations.length === 1 ? keyframedAnimations[0] : undefined;
  const animationsById = new Map(keyframedAnimations.map((animation) => [animation.id, animation]));
  const removals = new Map<string, { animationId: string; percentage: number }>();
  for (const key of selectedKeyframes) {
    const target = timelineKeyframeTargetFromSelectionKey(selectedElementId, key);
    if (!target) continue;
    const animation = target.animationId
      ? animationsById.get(target.animationId)
      : fallbackAnimation;
    if (!animation) continue;
    const percentage = target.tweenPercentage ?? target.percentage;
    removals.set(`${animation.id}\0${percentage}`, { animationId: animation.id, percentage });
  }
  const targets = [...removals.values()];
  if (targets.length === 0) return;
  const coalesceOptions = {
    coalesceKey: `delete-keyframes:${++deleteKeyframesCommitCounter}`,
    coalesceMs: Number.POSITIVE_INFINITY,
  };
  for (const [index, target] of targets.entries()) {
    session.handleGsapRemoveKeyframe(target.animationId, target.percentage, {
      ...coalesceOptions,
      ...(index === targets.length - 1 ? { softReload: true } : { skipReload: true }),
    });
  }
}
