import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import {
  HF_AUDIO_FX_ATTR,
  serializeAudioFxChain,
  type HfAudioFxChain,
} from "@hyperframes/core/audio-fx";
import { classifyAudioName } from "@hyperframes/core/audio-carve";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { VisibilityButton, PlainTrackHeader } from "./TimelineTrackPlainHeader";
import type { TimelineEditCallbacks } from "./timelineCallbacks";
import { useTimelineEditContextOptional } from "../../contexts/TimelineEditContext";
import { useDomEditActionsContextOptional } from "../../contexts/DomEditContext";
import { mintGroupId } from "../../components/editor/useFxCarveGrouping";
import { runtimeAudioId } from "../lib/timelineElementHelpers";
import { isAudioOnlyTrack } from "../../utils/timelineInspector";
import { TimelineFxButton } from "./TimelineFxButton";
import { getTimelinePropertyLanes } from "./TimelinePropertyLanes";
import { elementFxChain, groupAutomationLanes, isCarveLane } from "./automationLaneData";
import { AUTOMATION_LANE_H } from "./automationLaneHeight";
import { clipTimingStart } from "../../hooks/gsapShared";
import { LaneToggleButton, LayerDisclosureRow } from "./LayerDisclosureRow";
import { LABEL_COL_W, TRACK_H, getTimelineLaneTop } from "./timelineLayout";
import type { TimelineTheme } from "./timelineTheme";
import { trackDisplaySuffix } from "./timelineTrackDisplay";
import { AutomationLaneHeaderRow, PropertyGroupHeaderRow } from "./trackHeaderLabelRows";
import { useMemo } from "react";

/** Accent rail + inset marking a row as a group MEMBER, matching the level-2
 *  nesting its `aria-level` already reports. */
const GROUP_MEMBER_RAIL = "var(--timeline-accent-rail)";
const GROUP_MEMBER_INDENT = 14;
/** A neutral wash keeps group membership visible without changing the row's hue. */
const GROUP_MEMBER_TINT = "var(--timeline-group-member-tint)";

/** The gutter fill for a row, tinted when it belongs to a group. */
export function gutterFill(base: string, isGroupMember: boolean): string {
  return isGroupMember
    ? `linear-gradient(${GROUP_MEMBER_TINT}, ${GROUP_MEMBER_TINT}), ${base}`
    : base;
}

interface TimelineTrackHeaderProps {
  /** The track's real key: a FRACTIONAL z-order sort value. Routes callbacks;
   *  never shown or announced. */
  trackNumber: number;
  /** The track's 1-based position in the rendered order: the only number safe
   *  to put in a label. Announcing `trackNumber` read out "track
   *  0.16666666666666666". Null when the key has no row, which drops the number
   *  from the label rather than inventing one (see trackDisplayNumber). */
  trackDisplayNumber: number | null;
  trackLabel: string;
  /** Ids of the canvas-side lane regions the disclosure caret expands, space
   *  separated as `aria-controls` takes them: the active clip's keyframe lanes
   *  and the track's automation lanes are separate elements, one owned by a
   *  clip and one by the row. Minted by TimelineLanes, the one place that sees
   *  every subtree. */
  lanesId: string;
  contentOrigin: number;
  /** The track's active keyframe clip (selected, else primary) — the one whose
   *  disclosure + property rows this header shows, whether expanded or not. */
  keyframeClip: TimelineElement | null;
  /** Every clip on this track. Automation rows are the track's, unioned over
   *  these, so they stop changing with the selection. */
  trackElements: readonly TimelineElement[];
  /** Clips on this track, so the header can say how many the row holds. */
  clipCount: number;
  isExpanded: boolean;
  animations: readonly GsapAnimation[];
  currentTime: number;
  isTrackHidden: boolean;
  isAudioTrack: boolean;
  /** This track is a member of an audio group — indents the row under its header. */
  isGroupMember?: boolean;
  rovingTargetId?: string | null;
  theme: TimelineTheme;
  showAudioEffects?: boolean;
  onToggleClipExpanded: () => void;
  onToggleTrackHidden: TimelineEditCallbacks["onToggleTrackHidden"];
  onTogglePropertyGroupKeyframe?: TimelineEditCallbacks["onTogglePropertyGroupKeyframe"];
  /** Drop one envelope. Absent while the lanes are read-only, which is what
   *  hides the control rather than offering a button that cannot act. */
  onRemoveAutomationLane?: (target: string) => void;
  onSeek?: (time: number) => void;
}

// fallow-ignore-next-line complexity
export function TimelineTrackHeader({
  trackNumber,
  trackDisplayNumber,
  trackLabel,
  lanesId,
  contentOrigin,
  keyframeClip,
  trackElements,
  clipCount,
  isExpanded,
  animations,
  currentTime,
  isTrackHidden,
  isAudioTrack,
  isGroupMember = false,
  theme,
  showAudioEffects = true,
  onToggleClipExpanded,
  onToggleTrackHidden,
  onTogglePropertyGroupKeyframe,
  onRemoveAutomationLane,
  onSeek,
  rovingTargetId = null,
}: TimelineTrackHeaderProps) {
  const clipPercentage = keyframeClip
    ? ((currentTime - keyframeClip.start) / keyframeClip.duration) * 100
    : 0;
  const lanes = keyframeClip
    ? // clipTimingStart, not the raw start: an expanded sub-comp child's start is
      // host-absolute while its tweens are local to its own file.
      getTimelinePropertyLanes(animations, clipTimingStart(keyframeClip), keyframeClip.duration)
    : [];
  // Label mode = keyframe view; the label column stays LABEL_COL_W (Timeline.tsx
  // owns the gutter past it, so a 0% diamond isn't clipped by this panel).
  const showTrackLabel = contentOrigin >= LABEL_COL_W;
  // One row per automated property across the whole track, in the order the
  // canvas draws them — a name beside the wrong envelope is worse than an awkward
  // order. `target` is the ACTIVE clip's lane in that row, which is the only one
  // the remove button can write to; null when the row belongs to its siblings.
  const activeKey = keyframeClip ? (keyframeClip.key ?? keyframeClip.id) : null;
  const groupOwner = useMemo(
    () => trackElements.find((element) => element.audioGroup)?.audioGroup,
    [trackElements],
  );
  const groupLabelForNote = useMemo(
    () => trackElements.find((element) => element.audioGroupLabel)?.audioGroupLabel,
    [trackElements],
  );
  const groupAutomationRaw = useMemo(
    () => trackElements.find((element) => element.audioGroupAutomation)?.audioGroupAutomation,
    [trackElements],
  );
  const groupFxChainRaw = useMemo(
    () => trackElements.find((element) => element.audioGroupFxChain)?.audioGroupFxChain,
    [trackElements],
  );
  // Which parameters this track's GROUP also automates. Gain stages multiply,
  // and §5 asks for the explanation rather than leaving the author to wonder
  // why two curves they drew sound quieter than either.
  const groupAutomatedTargets = useMemo(
    () =>
      new Set(
        groupAutomationLanes(
          groupOwner
            ? [
                {
                  id: groupOwner,
                  tag: "audio",
                  start: 0,
                  duration: 0,
                  track: 0,
                  ...(groupAutomationRaw ? { automation: groupAutomationRaw } : {}),
                  ...(groupFxChainRaw ? { fxChain: groupFxChainRaw } : {}),
                },
              ]
            : [],
        ).map((lane) => lane.key),
      ),
    [groupAutomationRaw, groupFxChainRaw, groupOwner],
  );
  const revealAudioFx = usePlayerStore((s) => s.setRevealedAudioFxTarget);
  /**
   * Which element's rack a lane's reveal opens, in the PANEL's id space.
   *
   * The bare dom id, not the timeline's `sourceFile#domId` composite: the
   * property panel identifies its element by `element.id`, so a composite would
   * never match — the same boundary `runtimeAudioId` exists for.
   */
  const revealElementId = keyframeClip ? runtimeAudioId(keyframeClip) : null;
  const automationRows = useMemo(
    () =>
      groupAutomationLanes(trackElements).map((group) => {
        const active = group.entries.find(
          (entry) => (entry.element.key ?? entry.element.id) === activeKey,
        );
        return {
          key: group.key,
          label: group.key,
          name: group.name,
          param: group.param,
          target: active?.lane.target ?? null,
          // Every entry in a row is the same parameter, so the first answers for the
          // row when the active clip is absent from it.
          isCarve: (() => {
            const entry = active ?? group.entries[0];
            return entry ? isCarveLane(entry.lane.target, elementFxChain(entry.element)) : false;
          })(),
        };
      }),
    [activeKey, trackElements],
  );
  // Automation counts as something to disclose: gating the caret on tweens alone
  // left an audio clip's envelopes unreachable, since the track could not expand.
  const disclosable = lanes.length > 0 || automationRows.length > 0;
  // Which HEADER LAYOUT the row wears — not the same question as `disclosable`.
  // An audio track that automates something is still an audio track: it keeps
  // the music glyph and the group indent and gains the `∿`. Tying layout to
  // disclosability swapped it for the keyframe-layer row (a `◇`, no indent) the
  // moment an envelope appeared.
  const isKeyframeLayer = !!keyframeClip && disclosable && !isAudioTrack;
  const isAudioOnly = isAudioOnlyTrack(trackElements);
  // What the lane disclosure calls this row. A row of several clips is named
  // for the TRACK, not for whichever is selected — the lanes are the track's,
  // shared per property, so "Narration 2 lanes" read as if they were that one
  // slice's. Shared by both layouts so the name cannot change with the layout.
  const laneOwnerName =
    clipCount > 1
      ? `Track${trackDisplaySuffix(trackDisplayNumber)}`
      : (keyframeClip?.label ?? keyframeClip?.domId ?? keyframeClip?.id ?? trackLabel);

  // C1: the FX entry point. A single audio clip has one chain to point at; a
  // track holding several ungrouped ones has no single chain — the design
  // doc refuses to build "N clips = N chains", so that case gets a pointer
  // at grouping (B6's normative rule) instead of a popover.
  const {
    onGroupClips,
    onSetElementAttributeLive,
    onSetElementAttributeQuiet,
    onRevertElementAttributeLive,
  } = useTimelineEditContextOptional();
  const domEditActions = useDomEditActionsContextOptional();
  const singleAudioClip =
    isAudioTrack && clipCount === 1 && trackElements.length > 0 ? trackElements[0] : null;
  const isTrackGrouped = trackElements.some((el) => el.audioGroup);
  const audioBearingClips = isAudioTrack
    ? trackElements
    : trackElements.filter((el) => el.hasAudio === true);
  const writeClipFxChain = (
    clip: TimelineElement,
    next: HfAudioFxChain,
    live: boolean,
    ended = false,
  ) => {
    const value = next.nodes.length ? serializeAudioFxChain(next) : null;
    if (!live) {
      void onSetElementAttributeQuiet?.(clip, HF_AUDIO_FX_ATTR, value, "Apply preset");
      return;
    }
    onSetElementAttributeLive?.(clip, HF_AUDIO_FX_ATTR, value);
    if (ended) onRevertElementAttributeLive?.(clip, HF_AUDIO_FX_ATTR);
  };
  const openClipFxRack = (clip: TimelineElement) => {
    void domEditActions?.handleTimelineElementSelect(clip);
  };
  // DOM ids, matching the carve picker's other caller — membership is read back
  // by `resolveAudioGroups`, which only ever sees the document. A clip with no
  // DOM id cannot be a member (resolveAudioGroups skips it), so a track holding
  // one cannot be grouped WHOLE — and grouping the rest would quietly leave
  // those clips outside the bus, past every fader, mute and effect, while the
  // UI showed the track as grouped. The button is withheld instead of acting on
  // a subset, which is also why the carve path's loud guard cannot catch this:
  // the unresolvable ids were filtered out before the call.
  const groupableClipIds = audioBearingClips.map(runtimeAudioId);
  const allGroupableClipIds = groupableClipIds.every((id): id is string => id !== null)
    ? groupableClipIds
    : null;
  const canGroupWholeTrack = (allGroupableClipIds?.length ?? 0) >= 2;
  const groupUngroupedClips = (label: string) => {
    const doc = domEditActions?.previewIframeRef.current?.contentDocument;
    if (!doc || !onGroupClips) return;
    if (!allGroupableClipIds || allGroupableClipIds.length < 2) return;
    void onGroupClips(allGroupableClipIds, mintGroupId(doc), label);
  };

  return (
    <div
      role="rowheader"
      aria-colindex={1}
      className="sticky left-0 z-12 shrink-0"
      style={{
        width: showTrackLabel ? LABEL_COL_W : contentOrigin,
        background: gutterFill(theme.gutterBackground, isGroupMember),
        borderRight: `1px solid ${theme.gutterBorder}`,
        // A group's member rows are `aria-level="2"`, and until this they read
        // as level 2 to a screen reader while looking identical to every
        // top-level row on screen. The rail is the accent-tinted left border
        // B2's design called for; the inset is what actually makes the nesting
        // legible. Padding rather than margin so the rail stays flush with the
        // gutter's own edge.
        ...(isGroupMember
          ? {
              borderLeft: `2px solid ${GROUP_MEMBER_RAIL}`,
              paddingLeft: GROUP_MEMBER_INDENT,
            }
          : {}),
      }}
    >
      {!isKeyframeLayer ? (
        <>
          {/* The two lines own exactly TRACK_H, not the whole header.
              `justify-center` on the header itself centred them in its FULL
              height — which grows by AUTOMATION_LANE_H per open lane — so
              opening one pushed the name and its controls down THROUGH the lane
              rows below, which are absolutely positioned from the top. */}
          <div
            className={
              showTrackLabel
                ? "flex flex-col justify-center gap-0.5 px-1.5 text-[var(--timeline-handle)]"
                : "flex flex-col items-center justify-center gap-0.5"
            }
            style={{ height: TRACK_H }}
          >
            <PlainTrackHeader
              trackNumber={trackNumber}
              trackDisplayNumber={trackDisplayNumber}
              trackLabel={trackLabel}
              clipCount={clipCount}
              showTrackLabel={showTrackLabel}
              isTrackHidden={isTrackHidden}
              isAudioTrack={isAudioTrack}
              isAudioOnly={isAudioOnly}
              onToggleTrackHidden={onToggleTrackHidden}
              // On the control line rather than a third row of its own.
              trailing={
                <>
                  {showAudioEffects && singleAudioClip && (
                    <TimelineFxButton
                      variant="chain"
                      fxChainRaw={singleAudioClip.fxChain}
                      trackKind={classifyAudioName(singleAudioClip.id, singleAudioClip.src)}
                      onChainChange={(next) => writeClipFxChain(singleAudioClip, next, false)}
                      onChainPreview={(next, ended) =>
                        writeClipFxChain(singleAudioClip, next, true, ended)
                      }
                      // Muted, an audition is silent — so the hover lifts the mute on
                      // the running graph and puts it back on the way out, the same
                      // borrow-and-return it already does with the playhead.
                      auditionSpans={[singleAudioClip]}
                      isMuted={isTrackHidden}
                      onSetMutedLive={(muted) =>
                        onSetElementAttributeLive?.(
                          singleAudioClip,
                          "data-hidden",
                          muted ? "" : null,
                        )
                      }
                      onOpenRack={() => openClipFxRack(singleAudioClip)}
                    />
                  )}
                  {showAudioEffects && clipCount > 1 && !isTrackGrouped && canGroupWholeTrack && (
                    <TimelineFxButton
                      variant="group-pointer"
                      clipCount={audioBearingClips.length}
                      defaultLabel={trackLabel}
                      onGroupClips={groupUngroupedClips}
                    />
                  )}
                  {/* The lane disclosure, on the row's own layout rather than by
                    swapping it for a keyframe-layer row. */}
                  {disclosable && (
                    <LaneToggleButton
                      name={laneOwnerName}
                      isExpanded={isExpanded}
                      lanesId={lanesId}
                      onToggle={onToggleClipExpanded}
                    />
                  )}
                </>
              }
            />
          </div>
        </>
      ) : (
        <>
          <LayerDisclosureRow
            name={laneOwnerName}
            clipCount={clipCount}
            isExpanded={isExpanded}
            gutterBackground={gutterFill(theme.gutterBackground, isGroupMember)}
            columnWidth={showTrackLabel ? LABEL_COL_W : contentOrigin}
            lanesId={lanesId}
            onToggleClipExpanded={onToggleClipExpanded}
          >
            {/* The eye belongs to the LAYER, so it lives on the always-mounted
                layer row exactly like a plain track's. Hanging it off a lane row
                (hover-gated, and only while expanded) left a keyframed track with
                no way to be hidden at all by keyboard, and put the control on a
                row it does not act on. */}
            <VisibilityButton
              hidden={isTrackHidden}
              trackNumber={trackNumber}
              trackDisplayNumber={trackDisplayNumber}
              asMute={isAudioOnly}
              onToggle={onToggleTrackHidden}
            />
          </LayerDisclosureRow>
        </>
      )}
      {/* The caret expands TWO disjoint subtrees: these label-column rows,
            which carry the per-lane keyframe controls, and the diamond lanes
            on the canvas. `lanesId` names the canvas lanes (rendered by
            TimelineLanes), because that is what a sighted user watches appear
            and what following the reference has to land on. These rows are not
            empty and are not the target; they are absolutely positioned inside
            the sticky column, which is what made a wrapper HERE compute to
            0x0 and hold no diamonds. */}
      {isExpanded &&
        keyframeClip &&
        lanes.map((lane, laneIndex) => (
          <PropertyGroupHeaderRow
            key={lane.group}
            lanesId={lanesId}
            lane={lane}
            laneIndex={laneIndex}
            isLastLane={laneIndex === lanes.length - 1 && automationRows.length === 0}
            expandedElement={keyframeClip}
            currentTime={currentTime}
            clipPercentage={clipPercentage}
            gutterBackground={gutterFill(theme.gutterBackground, isGroupMember)}
            columnWidth={showTrackLabel ? LABEL_COL_W : contentOrigin}
            onTogglePropertyGroupKeyframe={onTogglePropertyGroupKeyframe}
            onSeek={onSeek}
            rovingTargetId={rovingTargetId}
          />
        ))}
      {/* Below the keyframe rows and stepping by its own height, which is how
            TimelineAutomationLaneSlot lays the envelopes out on the canvas. The
            two have to agree or a name labels the wrong curve. */}
      {isExpanded &&
        automationRows.map((row, index) => {
          // Bound outside the closure so it narrows: `row.target` is null on a
          // row the active clip is absent from.
          const revealTarget = row.target;
          return (
            <AutomationLaneHeaderRow
              key={row.key}
              target={row.target}
              label={row.label}
              name={row.name}
              param={row.param}
              alsoAutomatedBy={
                groupAutomatedTargets.has(row.key) ? (groupLabelForNote ?? groupOwner) : undefined
              }
              top={getTimelineLaneTop(lanes.length) + index * AUTOMATION_LANE_H}
              isLastLane={index === automationRows.length - 1}
              gutterBackground={gutterFill(theme.gutterBackground, isGroupMember)}
              columnWidth={showTrackLabel ? LABEL_COL_W : contentOrigin}
              onRemove={onRemoveAutomationLane}
              isCarve={row.isCarve}
              // Only for a lane the ACTIVE clip actually draws: the rack shows one
              // element, so a shared row's other envelopes belong to clips it is
              // not showing and there would be nothing to reveal.
              onReveal={
                showAudioEffects && revealTarget && revealElementId && keyframeClip
                  ? () => {
                      // Select FIRST: the rack is the property panel's view of
                      // the selected element, so a reveal aimed at an unselected
                      // clip lands on a panel that says "Nothing selected". The
                      // request survives the selection — it is stored, not an
                      // event — so the rack consumes it as it mounts.
                      openClipFxRack(keyframeClip);
                      revealAudioFx({
                        elementKey: revealElementId,
                        automationTarget: revealTarget,
                      });
                    }
                  : undefined
              }
            />
          );
        })}
    </div>
  );
}
