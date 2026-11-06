import { useI18n } from "../../i18n/I18n";
import {
  useMemo,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import {
  classifyPropertyGroup,
  type GsapAnimation,
  type PropertyGroupName,
} from "@hyperframes/core/gsap-parser";
import { toClipKeyframes } from "../../hooks/gsapShared";
import { synthesizeFlatTweenKeyframes } from "../../hooks/gsapTweenSynth";
import { TimelineDiamondLane, type TimelineDiamondKeyframe } from "./TimelineClipDiamonds";
import { LANE_H, getTimelineLaneTop } from "./timelineLayout";
import type { TimelineKeyframeTarget } from "./timelineKeyframeIdentity";
import { timelineLogicalRowCellId, timelinePropertyRowId } from "./timelineNavigationIdentity";

export interface TimelinePropertyLanesProps {
  /**
   * Id of the wrapper below, so the layer's disclosure caret can point
   * `aria-controls` at the lanes a sighted user sees it reveal. Minted by
   * TimelineLanes, which owns both this subtree and the caret's.
   */
  id: string;
  animations: readonly GsapAnimation[];
  clipStart: number;
  clipDuration: number;
  clipLeftPx: number;
  clipWidthPx: number;
  passengerStyle?: CSSProperties;
  accentColor: string;
  isSelected: boolean;
  currentPercentage: number;
  elementId: string;
  selectedKeyframes: ReadonlySet<string>;
  rovingTargetId?: string | null;
  onSelectSegment?: (target: TimelineKeyframeTarget) => void;
  onClickKeyframe?: (target: TimelineKeyframeTarget) => void;
  onShiftClickKeyframe?: (target: TimelineKeyframeTarget) => void;
  onContextMenuKeyframe?: (e: ReactMouseEvent, target: TimelineKeyframeTarget) => void;
  onMoveKeyframe?: (target: TimelineKeyframeTarget, toClipPercentage: number) => Promise<boolean>;
  suppressClickRef?: RefObject<boolean>;
}

/**
 * Keys that ride along in a tween's property bag without being animated: a
 * transform modifier, Studio's internal endpoint marker, and GSAP's reserved
 * `data`. Same exclusion list the parser's classifyTweenPropertyGroup applies —
 * without it `{ x, transformOrigin }` would draw a spurious "Other" lane.
 */
const NON_ANIMATED_PROPERTIES = new Set(["transformOrigin", "_auto", "data"]);

function isAnimatedProperty(property: string): boolean {
  return !NON_ANIMATED_PROPERTIES.has(property);
}

function hasGroupProperty(
  properties: Record<string, number | string>,
  group: PropertyGroupName,
): boolean {
  return Object.keys(properties).some(
    (property) => isAnimatedProperty(property) && classifyPropertyGroup(property) === group,
  );
}

/** The tween's editable keyframes: its real keyframes, or the start→end pair
 *  synthesized for a flat tween. Empty for a tween that animates nothing. */
function animationKeyframes(animation: GsapAnimation) {
  return animation.keyframes?.keyframes ?? synthesizeFlatTweenKeyframes(animation)?.keyframes ?? [];
}

/**
 * Every property group a tween draws a lane for, classified PER PROPERTY.
 * `animation.propertyGroup` is the parser's whole-tween verdict and is
 * `undefined` for anything spanning more than one group — but `{ x, opacity }`
 * is the canonical HyperFrames entrance tween, and reading that verdict gave it
 * no caret, no reserved row and no diamonds. classifyPropertyGroup is total, so
 * an unrecognised property still lands in "other" rather than vanishing.
 *
 * Single owner: the rendered lanes (sourceGroups) and the reserved row heights
 * (computeLaneCounts) both count groups through here, or they drift.
 */
export function animationLaneGroups(animation: GsapAnimation): PropertyGroupName[] {
  const groups = new Set<PropertyGroupName>();
  for (const keyframe of animationKeyframes(animation)) {
    for (const property of Object.keys(keyframe.properties)) {
      if (isAnimatedProperty(property)) groups.add(classifyPropertyGroup(property));
    }
  }
  return Array.from(groups);
}

/**
 * Which tween a panel edit to `prop` belongs to.
 *
 * Matches on the groups the tween's KEYFRAMES animate, not on the parser's
 * whole-tween `propertyGroup` verdict: that field is undefined for a legacy
 * mixed tween such as `{ x, opacity }`, so matching it dropped every such
 * tween and sent the edit to the selection's default animation instead, which
 * is a different tween than the lane the user is looking at.
 * {@link animationLaneGroups} is the single owner the rendered lanes count
 * groups through, so resolving here through the same helper keeps the panel
 * and the lanes on one answer.
 */
export function resolveAnimIdForProperty(
  prop: string,
  animations: readonly GsapAnimation[] | undefined,
  fallbackAnimId: string | undefined,
): string {
  const group = classifyPropertyGroup(prop);
  const groupAnim = animations?.find((a) => animationLaneGroups(a).includes(group));
  return groupAnim?.id ?? fallbackAnimId ?? "";
}

/** A tween contributes a property lane when it animates at least one property
 *  on at least one editable keyframe (real or synthesized). */
export function animationContributesLane(animation: GsapAnimation): boolean {
  return animationLaneGroups(animation).length > 0;
}

function sourceGroups(animations: readonly GsapAnimation[]) {
  const groups = new Map<PropertyGroupName, GsapAnimation[]>();
  for (const animation of animations) {
    for (const group of animationLaneGroups(animation)) {
      const groupAnimations = groups.get(group) ?? [];
      groupAnimations.push(animation);
      groups.set(group, groupAnimations);
    }
  }
  return groups;
}

/** Resolve the ease from THIS keyframe's own source tween. A lane can merge
 *  several tweens, so a shared lane-level fallback would label a segment with a
 *  different animation's ease than the one the ease editor targets (it routes
 *  by animationId). */
function keyframeEase(keyframe: { ease?: string }, animation: GsapAnimation): string | undefined {
  return keyframe.ease ?? animation.keyframes?.easeEach ?? animation.ease;
}

/**
 * One lane row per keyframe of `group`. The clip-% re-basing goes through the
 * shared toClipKeyframes so lane rows land on the exact same percentage the
 * keyframe cache writes: this file used to derive it inline and skipped that
 * helper's rounding, which is the one precision every keyframe-cache writer has
 * to agree on (selection keys embed the number).
 */
function groupKeyframes(
  animations: readonly GsapAnimation[],
  group: PropertyGroupName,
  clipStart: number,
  clipDuration: number,
): TimelineDiamondKeyframe[] {
  const keyframes: TimelineDiamondKeyframe[] = [];
  for (const animation of animations) {
    const inGroup = animationKeyframes(animation).filter((keyframe) =>
      hasGroupProperty(keyframe.properties, group),
    );
    for (const keyframe of toClipKeyframes(inGroup, animation, clipStart, clipDuration)) {
      keyframes.push({
        ...keyframe,
        // The LANE's group, not the tween's own classification: a mixed-property
        // tween classifies to undefined yet still feeds every group it touches.
        propertyGroup: group,
        ease: keyframeEase(keyframe, animation),
      });
    }
  }
  return keyframes;
}

export function getTimelinePropertyLanes(
  animations: readonly GsapAnimation[],
  clipStart: number,
  clipDuration: number,
) {
  if (clipDuration <= 0) return [];
  return Array.from(sourceGroups(animations), ([group, groupAnimations]) => ({
    group,
    animations: groupAnimations,
    elementAnimations: animations,
    keyframes: groupKeyframes(groupAnimations, group, clipStart, clipDuration),
  })).filter((lane) => lane.keyframes.length > 0);
}

export function TimelinePropertyLanes({
  id,
  animations,
  clipStart,
  clipDuration,
  clipLeftPx,
  clipWidthPx,
  passengerStyle,
  accentColor,
  isSelected,
  currentPercentage,
  elementId,
  selectedKeyframes,
  rovingTargetId = null,
  onSelectSegment,
  onClickKeyframe,
  onShiftClickKeyframe,
  onContextMenuKeyframe,
  onMoveKeyframe,
  suppressClickRef,
}: TimelinePropertyLanesProps) {
  const { t } = useI18n();
  // Memoized: TimelineDiamondLane is React.memo'd, and rebuilding the lanes (and
  // a fresh keyframesData literal per lane) on every render would re-render every
  // diamond in every expanded clip on each playhead tick.
  const lanes = useMemo(
    () =>
      clipWidthPx < 20 || clipDuration <= 0
        ? []
        : getTimelinePropertyLanes(animations, clipStart, clipDuration),
    [animations, clipStart, clipDuration, clipWidthPx],
  );
  const laneData = useMemo(
    () =>
      lanes.map((lane) => ({
        ...lane,
        keyframesData: { format: "percentage" as const, keyframes: lane.keyframes },
      })),
    [lanes],
  );

  // One STATIC wrapper, never `relative`: a static box establishes no containing
  // block, so every absolutely-positioned lane below still resolves against the
  // track-content div and the rendered geometry is byte-identical to the bare
  // fragment this replaced. It is also rendered when there are no lanes at all
  // (collapsed layer), so `id` stays resolvable in both disclosure states.
  return (
    <div id={id}>
      {laneData.map(({ group, keyframesData }, laneIndex) => (
        <div
          key={group}
          id={timelineLogicalRowCellId(id, timelinePropertyRowId(elementId, group), "content")}
          role="group"
          aria-label={t("{group} keyframes", { group: group })}
          data-property-group={group}
          data-timeline-element-id={elementId}
          data-timeline-property-lane=""
          data-timeline-lane-top={getTimelineLaneTop(laneIndex)}
          className="absolute"
          style={{
            left: clipLeftPx,
            top: getTimelineLaneTop(laneIndex),
            width: clipWidthPx,
            height: LANE_H,
            ...passengerStyle,
          }}
        >
          <TimelineDiamondLane
            keyframesData={keyframesData}
            clipWidthPx={clipWidthPx}
            clipHeightPx={LANE_H}
            accentColor={accentColor}
            isSelected={isSelected}
            currentPercentage={currentPercentage}
            elementId={elementId}
            clipStart={clipStart}
            clipDuration={clipDuration}
            selectedKeyframes={selectedKeyframes}
            rovingTargetId={rovingTargetId}
            onSelectSegment={onSelectSegment}
            onClickKeyframe={onClickKeyframe}
            onShiftClickKeyframe={onShiftClickKeyframe}
            onContextMenuKeyframe={onContextMenuKeyframe}
            onMoveKeyframe={onMoveKeyframe}
            suppressClickRef={suppressClickRef}
            groupAware
          />
        </div>
      ))}
    </div>
  );
}
