import { useI18n } from "../../i18n/I18n";
import { memo, useEffect, useRef, useState } from "react";
import { BEAT_BAND_H } from "./BeatStrip";
import { TimelineDiamondConnectors } from "./TimelineDiamondConnectors";
import { LANE_H } from "./timelineLayout";
import { STUDIO_PREVIEW_FPS } from "../lib/time";
import { timelineKeyframeSelectionKey } from "./timelineKeyframeIdentity";
import {
  beginTimelineKeyframeRetime,
  readPendingTimelineKeyframeRetimes,
  subscribeTimelineKeyframeRetimePreview,
  type TimelineKeyframeRetimeHandle,
} from "./useTimelineKeyframeHandlers";
import { timelineKeyframeFocusId } from "./timelineNavigationIdentity";
import { reportPressOnTravel, useTimelineReadOnlyPress } from "./timelineReadOnly";
import {
  DIAMOND_RATIO,
  keyframeTimeLabel,
  keyframeTarget,
  type TimelineClipDiamondsProps,
  type TimelineDiamondKeyframe,
  type TimelineDiamondLaneProps,
} from "./timelineDiamondTypes";

export type { TimelineDiamondKeyframe } from "./timelineDiamondTypes";

// Floor for a diamond's clickable width. The visible diamond stays full-size
// even when neighbours overlap; shrinking recorded-gesture keyframes into dots
// makes the timeline unreadable. The hit box still follows the neighbour gap
// and stops at this floor so nearby timestamps remain separately targetable.
//
// Deliberately below the 24px WCAG 2.2 (2.5.8) minimum, under that criterion's
// own spacing exception: at normal keyframe density the neighbour gap is under
// 24px, so a 24px floor would make adjacent diamonds' hit boxes OVERLAP — one
// diamond swallowing its neighbour's clicks is a worse 2.5.8 failure than a
// small target. Do not "fix" this to 24.
const KF_MIN_HIT_W = 12;

/** A clip-% is a float division, so a raw tooltip reads `25.032499999999995%`. */
function roundPct(percentage: number): number {
  return Math.round(percentage * 1000) / 1000;
}

/** Find the closest authored keyframe without scanning the full lane on every playhead tick. */
function nearestKeyframeWithin(
  sorted: TimelineDiamondKeyframe[],
  percentage: number,
  tolerance: number,
): TimelineDiamondKeyframe | null {
  if (!Number.isFinite(percentage) || tolerance <= 0 || sorted.length === 0) return null;
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (sorted[mid]!.percentage < percentage) low = mid + 1;
    else high = mid;
  }
  const before = sorted[low - 1];
  const after = sorted[low];
  const nearest =
    before && after
      ? percentage - before.percentage <= after.percentage - percentage
        ? before
        : after
      : (before ?? after);
  return nearest && Math.abs(nearest.percentage - percentage) <= tolerance ? nearest : null;
}

export const TimelineDiamondLane = memo(function TimelineDiamondLane({
  keyframesData,
  clipWidthPx,
  clipHeightPx,
  beatsActive,
  accentColor,
  isSelected,
  currentPercentage,
  elementId,
  clipStart = 0,
  clipDuration = 0,
  selectedKeyframes,
  rovingTargetId = null,
  onClickKeyframe,
  onShiftClickKeyframe,
  onContextMenuKeyframe,
  onMoveKeyframe,
  onSelectSegment,
  suppressClickRef,
  groupAware = false,
  globalEase = "none",
}: TimelineDiamondLaneProps) {
  const { t } = useI18n();
  // Hooks must run before the early return below.
  // The retime itself lives on the stable scroll viewport (beginTimelineKeyframeRetime),
  // so a row unmounted by virtualization mid-drag does not drop the gesture.
  // This lane only arms it and renders the preview it publishes.
  const rootRef = useRef<HTMLDivElement>(null);
  const retimeHandleRef = useRef<TimelineKeyframeRetimeHandle | null>(null);
  const readOnlyPress = useTimelineReadOnlyPress();
  // Retime destinations already dispatched but not yet in the keyframe cache, so
  // a rapid second drag composes from where the first move left the keyframe
  // instead of the stale rendered value.
  const pendingRetimes = readPendingTimelineKeyframeRetimes(rootRef.current);
  // Visual-only preview of the dragged diamond's clip-% — no runtime/GSAP hold
  // (that optimistic hold was the #1763 flake). The atomic move-keyframe commit
  // on drop re-keys the diamond from source.
  const [preview, setPreview] = useState<{ kfKey: string; clipPct: number } | null>(null);
  useEffect(() => {
    const source = rootRef.current;
    if (!source) return;
    return subscribeTimelineKeyframeRetimePreview(source, (nextPreview) => {
      setPreview(
        nextPreview === null
          ? null
          : { kfKey: nextPreview.keyframeKey, clipPct: nextPreview.clipPercentage },
      );
    });
  }, []);
  // The button element can re-render (reposition/unmount) synchronously from
  // the state updates onClickKeyframe/onMoveKeyframe trigger, before the
  // browser gets to auto-synthesize the "click" event that normally follows
  // pointerdown+pointerup on a button. That orphaned click then fires on
  // whatever ancestor is still there — the clip wrapper — whose own onClick
  // toggles selection off when the clip is already selected (the state a
  // diamond click always happens in). Suppressing it here is the same fix
  // already used for clip drag/resize in useTimelineClipDrag.ts.
  const suppressNextClick = () => {
    if (!suppressClickRef) return;
    suppressClickRef.current = true;
    requestAnimationFrame(() => {
      suppressClickRef.current = false;
    });
  };

  if (clipWidthPx < 20) return null;

  // When the beat strip occupies the top band, shrink the diamonds and center
  // them in the remaining bottom region so they don't collide with it.
  // One consistent keyframe-diamond size everywhere (clip bars + property lanes),
  // matching the property-lane size (LANE_H · ratio). Beat-strip tracks still
  // shrink to fit under the strip.
  const diamondSize = beatsActive
    ? Math.round(clipHeightPx * 0.45)
    : Math.round(LANE_H * DIAMOND_RATIO);
  const centerY = beatsActive ? BEAT_BAND_H + (clipHeightPx - BEAT_BAND_H) / 2 : clipHeightPx / 2;
  // Hit-box height only — the glyph keeps `marker.visualSize`. 24 is the WCAG 2.2
  // (2.5.8) minimum and still fits the 28px lane. Beat-strip lanes keep the
  // shrunken box: 24px there would reach up into the beat strip.
  const hitHeight = beatsActive ? diamondSize : 24;
  // Keyframes authored outside the element's visible clip window are parked at
  // the boundary rather than hidden: dropping them made the lane's count
  // disagree with its diamonds and left users unable to inspect or remove state
  // that still affects the clip once it appears.
  const sorted = [...keyframesData.keyframes].sort((a, b) => a.percentage - b.percentage);
  const beforeClip = sorted.filter((keyframe) => keyframe.percentage < 0);
  const afterClip = sorted.filter((keyframe) => keyframe.percentage > 100);
  const boundaryStep = Math.max(6, Math.round(diamondSize * 0.55));
  // The neighbour clamp bounds a dragged diamond between its immediate siblings
  // so a retime can't reorder the tween. Siblings means "keyframes of the SAME
  // tween": a merged row interleaves several animations, and two of them
  // colliding at one percentage would otherwise pin each other's diamonds in
  // place — the drag clamped back onto its own position and resolved to a click.
  const siblingRowOf = (keyframe: TimelineDiamondKeyframe) =>
    keyframe.animationId === undefined
      ? sorted
      : sorted.filter((k) => k.animationId === keyframe.animationId);
  // Compose each sibling's pending destination in first: clamping against
  // cached positions while the dragged keyframe reads its pending one let a
  // second drag cross a neighbour that had already moved past it. Built once
  // per render, keyed by tween: every diamond of a row needs the same row, and
  // rebuilding + re-sorting it inside the marker loop below made this
  // O(keyframes squared) allocations on every playhead tick.
  const pendingClipPctOf = (keyframe: TimelineDiamondKeyframe) =>
    pendingRetimes.get(timelineKeyframeSelectionKey(elementId, keyframeTarget(keyframe)))
      ?.clipPercentage ?? keyframe.percentage;
  const siblingRows = new Map<
    string | undefined,
    { keyframes: TimelineDiamondKeyframe[]; clipPcts: number[] }
  >();
  for (const keyframe of sorted) {
    if (siblingRows.has(keyframe.animationId)) continue;
    const row = siblingRowOf(keyframe)
      .map((k) => ({ keyframe: k, clipPct: pendingClipPctOf(k) }))
      .sort((a, b) => a.clipPct - b.clipPct);
    siblingRows.set(keyframe.animationId, {
      keyframes: row.map((s) => s.keyframe),
      clipPcts: row.map((s) => s.clipPct),
    });
  }
  const centerXOf = (keyframe: TimelineDiamondKeyframe, percentage = keyframe.percentage) => {
    if (percentage < 0) {
      const rank = beforeClip.indexOf(keyframe);
      return -(beforeClip.length - Math.max(0, rank)) * boundaryStep;
    }
    if (percentage > 100) {
      const rank = afterClip.indexOf(keyframe);
      return clipWidthPx + (Math.max(0, rank) + 1) * boundaryStep;
    }
    return (percentage / 100) * clipWidthPx;
  };
  // One record per diamond, carrying its own geometry, so the connector and
  // button passes below read neighbours as values instead of index lookups.
  const markers = sorted.map((keyframe, index) => {
    const centerX = centerXOf(keyframe);
    // Parked diamonds sit on their own boundary spacing, so the in-clip
    // neighbour-gap shrink would only make them unreadable.
    if (keyframe.percentage < 0 || keyframe.percentage > 100) {
      return { keyframe, centerX, hitWidth: diamondSize, visualSize: diamondSize };
    }
    const previous = sorted[index - 1];
    const next = sorted[index + 1];
    const previousGap = previous ? centerX - centerXOf(previous) : Infinity;
    const nextGap = next ? centerXOf(next) - centerX : Infinity;
    const nearestGap = Math.max(1, Math.min(previousGap, nextGap));
    const hitWidth = Math.min(diamondSize, nearestGap);
    return {
      keyframe,
      centerX,
      hitWidth: Math.max(KF_MIN_HIT_W, hitWidth),
      visualSize: diamondSize,
    };
  });
  // The playhead is a cursor, not a selection. Resolve one nearest keyframe per
  // rendered property lane and only while it is within half an output frame.
  // A fixed clip-% tolerance grows with duration and lit whole clusters of
  // gesture-recorded keyframes at once on long clips.
  const halfFramePct =
    clipDuration && clipDuration > 0 ? 50 / STUDIO_PREVIEW_FPS / clipDuration : 0;
  const playheadKeyframe =
    isSelected && halfFramePct > 0
      ? nearestKeyframeWithin(sorted, currentPercentage, halfFramePct)
      : null;
  const baseColor = isSelected ? accentColor : "var(--timeline-diamond-muted)";
  const baseOpacity = isSelected ? 0.4 : 0.25;
  const canDrag = isSelected && !!onMoveKeyframe && !readOnlyPress;

  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      style={{
        // Above the clip's trim-handle strips (TimelineClip.tsx, z-index 4) so
        // a keyframe sitting in the first/last ~14px of the clip stays
        // clickable instead of being covered by the resize handle. This div
        // establishes its own stacking context (position + z-index), so the
        // diamonds' own z-index (1/2) can't escape it on their own — the bump
        // has to happen here.
        zIndex: 5,
        pointerEvents: "none",
      }}
    >
      <TimelineDiamondConnectors
        markers={markers}
        centerY={centerY}
        elementId={elementId}
        clipStart={clipStart}
        clipDuration={clipDuration}
        rovingTargetId={rovingTargetId}
        baseColor={baseColor}
        baseOpacity={baseOpacity}
        groupAware={groupAware}
        globalEase={globalEase}
        keyframeTarget={keyframeTarget}
        onSelectSegment={onSelectSegment}
      />

      {markers.map((marker, i) => {
        const kf = marker.keyframe;
        const target = keyframeTarget(kf);
        const focusId = timelineKeyframeFocusId(elementId, target);
        const kfKey = timelineKeyframeSelectionKey(elementId, target);
        const boundary = kf.percentage < 0 ? "before" : kf.percentage > 100 ? "after" : null;
        // Clamp against this keyframe's own tween, not the whole merged row.
        const siblingRow = siblingRows.get(kf.animationId);
        const siblingClipPcts = siblingRow?.clipPcts ?? [];
        const siblingIndex = siblingRow?.keyframes.indexOf(kf) ?? -1;
        // While dragging this diamond, render it at the live preview clip-%.
        const renderPct = preview?.kfKey === kfKey ? preview.clipPct : kf.percentage;
        // Center the marker's non-overlapping hit region ON its keyframe %, so
        // the diamond's midpoint sits exactly on the playhead/ruler x for that time.
        // The 0% diamond's left half lands in the reserved left gutter (the
        // content origin is inset past the label column, Figma-style) so it stays
        // fully visible instead of being clipped by the sticky label column.
        const leftPx = centerXOf(kf, renderPct) - marker.hitWidth / 2;
        const isKfSelected = selectedKeyframes.has(kfKey);
        const atPlayhead = kf === playheadKeyframe;
        const isHighlighted = isKfSelected || atPlayhead;
        const color = isKfSelected ? accentColor : "var(--timeline-diamond-muted)";

        const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          if (!canDrag) {
            if (isSelected) reportPressOnTravel(e, readOnlyPress);
            return;
          }
          retimeHandleRef.current = beginTimelineKeyframeRetime({
            event: e,
            elementId,
            keyframeKey: kfKey,
            target,
            keyframes: keyframesData.keyframes,
            clipWidthPx,
            // Clamp against this keyframe's own tween, not the whole merged row:
            // a merged row interleaves several animations, and two colliding at
            // one percentage would otherwise pin each other's diamonds in place.
            draggedIndex: siblingIndex,
            sortedClipPercentages: siblingClipPcts,
            keyframeKeyOf: (keyframe) =>
              timelineKeyframeSelectionKey(elementId, keyframeTarget(keyframe)),
            onMove: (fromTarget, toClipPercentage) =>
              onMoveKeyframe?.(fromTarget, toClipPercentage) ?? Promise.resolve(false),
            onSelect: (nextTarget, additive) => {
              if (additive) onShiftClickKeyframe?.(nextTarget);
              else onClickKeyframe?.(nextTarget);
            },
            suppressNextClick,
          });
        };
        const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
          // The viewport coordinator owns an armed retime; this local path is
          // only for diamonds that cannot be dragged.
          if (canDrag) {
            retimeHandleRef.current?.commit(e);
            retimeHandleRef.current = null;
            e.stopPropagation();
            return;
          }
          if (e.button !== 0) return;
          suppressNextClick();
          if (e.shiftKey) onShiftClickKeyframe?.(target);
          else onClickKeyframe?.(target);
        };

        return (
          <button
            // Key on the authored identity (tween-%), not the rendered clip-% or
            // the row index: a clip resize, a neighbour's retime, or a re-sort
            // changes both of those without changing WHICH keyframe this is, and
            // a key change remounts the button mid-drag (losing pointer capture).
            key={`${kf.animationId ?? i}:${kf.propertyGroup ?? ""}:${kf.tweenPercentage ?? kf.percentage}`}
            type="button"
            className="absolute"
            data-timeline-focus-id={focusId}
            data-keyframe-group={groupAware ? kf.propertyGroup : undefined}
            data-keyframe-percentage={
              groupAware ? (kf.tweenPercentage ?? kf.percentage) : undefined
            }
            data-keyframe-at-playhead={String(atPlayhead)}
            data-keyframe-selected={String(isKfSelected)}
            aria-current={atPlayhead ? "time" : undefined}
            data-keyframe-outside-clip={boundary ?? undefined}
            tabIndex={focusId === rovingTargetId ? 0 : -1}
            aria-label={t("{value0} keyframe at {value1}{value2}", { value0: t(kf.propertyGroup ?? "Motion"), value1: keyframeTimeLabel(clipStart, clipDuration, kf.percentage), value2: boundary ? ` (${boundary} clip)` : "" })}
            aria-pressed={isKfSelected}
            style={{
              left: leftPx,
              top: centerY,
              transform: "translateY(-50%)",
              width: marker.hitWidth,
              height: hitHeight,
              zIndex: isHighlighted ? 2 : 1,
              pointerEvents: "auto",
              background: "none",
              border: "none",
              cursor: canDrag ? "ew-resize" : "pointer",
              padding: 0,
              touchAction: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "visible",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={canDrag ? (e) => retimeHandleRef.current?.update(e) : undefined}
            onPointerUp={onPointerUp}
            // Keyboard activation only (detail 0): pointer presses already
            // resolve through the pointerup path above.
            onClick={(e) => {
              if (e.detail !== 0) return;
              e.stopPropagation();
              suppressNextClick();
              if (e.shiftKey) onShiftClickKeyframe?.(target);
              else onClickKeyframe?.(target);
            }}
            onPointerCancel={
              canDrag
                ? (e) => {
                    retimeHandleRef.current?.cancel(e);
                    retimeHandleRef.current = null;
                  }
                : undefined
            }
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenuKeyframe?.(e, target);
            }}
            title={`${roundPct(kf.percentage)}%${boundary ? ` · ${boundary} clip` : ""}`}
          >
            <svg
              width={marker.visualSize}
              height={marker.visualSize}
              viewBox="0 0 10 10"
              style={{ flexShrink: 0, pointerEvents: "none" }}
            >
              {(isKfSelected || atPlayhead) && (
                <path
                  d="M5 0L10 5L5 10L0 5Z"
                  fill="none"
                  stroke={accentColor}
                  strokeWidth="0.8"
                  opacity={isKfSelected ? 0.5 : 1}
                />
              )}
              <path
                d="M5 1L9 5L5 9L1 5Z"
                fill={color}
                opacity={isKfSelected ? 1 : atPlayhead ? 0.9 : 0.55}
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
});

export const TimelineClipDiamonds = memo(function TimelineClipDiamonds(
  props: TimelineClipDiamondsProps,
) {
  return (
    <TimelineDiamondLane
      {...props}
      globalEase={props.keyframesData.ease}
      onClickKeyframe={(target) => props.onClickKeyframe?.(props.elementId, target)}
      onShiftClickKeyframe={(target) => props.onShiftClickKeyframe?.(props.elementId, target)}
      onContextMenuKeyframe={(e, target) =>
        props.onContextMenuKeyframe?.(e, props.elementId, target)
      }
      onMoveKeyframe={
        props.onMoveKeyframe
          ? (target, toClipPercentage) =>
              props.onMoveKeyframe?.(props.elementId, target, toClipPercentage) ??
              Promise.resolve(false)
          : undefined
      }
      onSelectSegment={
        props.onSelectSegment
          ? (target) => props.onSelectSegment?.(props.elementId, target)
          : undefined
      }
    />
  );
});
