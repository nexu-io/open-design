/**
 * Resolves what a property lane's header row shows at the current playhead:
 * which animation owns the lane right now, where the playhead sits inside it,
 * the sampled values, and the add/remove keyframe target. Pure state, no JSX, so
 * the header component only renders what this returns.
 */
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import {
  clipToTweenPercentage,
  getKeyframeNavigationState,
} from "../../components/editor/KeyframeNavigation";
import {
  absoluteToPercentageForAnimation,
  isTimeWithinTween,
  resolveTweenDuration,
  resolveTweenStart,
} from "../../utils/globalTimeCompiler";
import type { TimelinePropertyGroupKeyframeToggle } from "./timelineCallbacks";
import { getTimelinePropertyLanes } from "./TimelinePropertyLanes";
import { groupLabel, valuesAt, valuesBefore, type LaneValues } from "./trackHeaderLaneValues";

export type TimelinePropertyLane = ReturnType<typeof getTimelinePropertyLanes>[number];
export type KeyframeNavigationState = ReturnType<
  typeof getKeyframeNavigationState<TimelinePropertyLane["keyframes"][number]>
>;

function findNearestLaneKeyframe(lane: TimelinePropertyLane, clipPercentage: number) {
  return lane.keyframes.reduce<(typeof lane.keyframes)[number] | null>(
    (nearest, keyframe) =>
      !nearest ||
      Math.abs(keyframe.percentage - clipPercentage) < Math.abs(nearest.percentage - clipPercentage)
        ? keyframe
        : nearest,
    null,
  );
}

function findAnimationAtTime(animations: TimelinePropertyLane["animations"], currentTime: number) {
  return animations.find((candidate) => {
    const start = resolveTweenStart(candidate);
    return start !== null && isTimeWithinTween(currentTime, start, resolveTweenDuration(candidate));
  });
}

function resolveLaneAnimation(
  lane: TimelinePropertyLane,
  navigation: KeyframeNavigationState,
  nearestKeyframe: TimelinePropertyLane["keyframes"][number] | null,
  animationAtPlayhead: GsapAnimation | undefined,
) {
  const animationId = navigation.currentKeyframe?.animationId ?? nearestKeyframe?.animationId;
  return animationAtPlayhead ?? lane.animations.find((candidate) => candidate.id === animationId);
}

function resolveLaneTweenPercentage(
  navigation: KeyframeNavigationState,
  animation: GsapAnimation | undefined,
  animationKeyframes: TimelinePropertyLane["keyframes"],
  currentTime: number,
  clipPercentage: number,
) {
  return (
    navigation.currentKeyframe?.tweenPercentage ??
    (animation ? absoluteToPercentageForAnimation(currentTime, animation) : null) ??
    clipToTweenPercentage(animationKeyframes, clipPercentage)
  );
}

function createLaneToggleTarget(
  animation: GsapAnimation | undefined,
  lane: TimelinePropertyLane,
  tweenPercentage: number,
  values: LaneValues,
  navigation: KeyframeNavigationState,
): TimelinePropertyGroupKeyframeToggle | null {
  return animation
    ? {
        animationId: animation.id,
        propertyGroup: lane.group,
        tweenPercentage,
        properties: values,
        remove: navigation.currentKeyframe !== null,
      }
    : null;
}

export interface LaneHeaderState {
  navigation: KeyframeNavigationState;
  values: LaneValues;
  label: string;
  toggleTarget: TimelinePropertyGroupKeyframeToggle | null;
}

export function resolveLaneHeaderState(
  lane: TimelinePropertyLane,
  currentTime: number,
  clipPercentage: number,
): LaneHeaderState {
  const navigation = getKeyframeNavigationState(lane.keyframes, clipPercentage);
  const nearestKeyframe = findNearestLaneKeyframe(lane, clipPercentage);
  const animationAtPlayhead = findAnimationAtTime(lane.animations, currentTime);
  const animation = resolveLaneAnimation(lane, navigation, nearestKeyframe, animationAtPlayhead);
  const animationKeyframes = lane.keyframes.filter(
    (keyframe) => keyframe.animationId === animation?.id,
  );
  const tweenPercentage = resolveLaneTweenPercentage(
    navigation,
    animation,
    animationKeyframes,
    currentTime,
    clipPercentage,
  );
  const values = animation
    ? valuesAt(
        animation,
        lane.group,
        tweenPercentage,
        valuesBefore(animation, lane.elementAnimations),
      )
    : {};

  return {
    navigation,
    values,
    label: groupLabel(lane.group, values),
    toggleTarget: createLaneToggleTarget(animation, lane, tweenPercentage, values, navigation),
  };
}
