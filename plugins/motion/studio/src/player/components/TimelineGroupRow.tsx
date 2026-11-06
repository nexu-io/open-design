import {
  HF_AUDIO_FX_ATTR,
  serializeAudioFxChain,
  type HfAudioFxChain,
} from "@hyperframes/core/audio-fx";
import type { TimelineTheme } from "./timelineTheme";
import type { TimelineTrackGroupInfo } from "./useTimelineTrackDerivations";
import type { TimelineLogicalRow } from "./timelineKeyboardNavigation";
import { TimelineTrackRow } from "./TimelineTrackRow";
import { TimelineGroupHeader } from "./TimelineGroupHeader";
import { groupAutomationLanes } from "./automationLaneData";
import { groupAutomationElement } from "./groupAutomationElement";
import { TimelineAutomationLaneSlot } from "./TimelineAutomationLaneSlot";
import { TimelineGroupLaneLabels } from "./TimelineGroupLaneLabels";
import { LABEL_COL_W, TRACK_H } from "./timelineLayout";
import type { UseAutomationLanesResult } from "./useAutomationLanes";
import { useDomEditSelectionContextOptional } from "../../contexts/DomEditContext";
import { useTimelineEditContextOptional } from "../../contexts/TimelineEditContext";
import { useDomEditActionsContextOptional } from "../../contexts/DomEditContext";
import { usePlayerStore } from "../store/playerStore";

/** Accent rail on a group-owned lane — the same green the member rail uses, so
 *  "this belongs to the group" reads the same in both places (groups doc §5). */
const GROUP_LANE_ACCENT = "var(--timeline-accent)";

interface TimelineGroupRowProps {
  index: number;
  rowKey: number;
  group: TimelineTrackGroupInfo;
  logicalRow: TimelineLogicalRow;
  top: number;
  height: number;
  virtualized: boolean;
  contentOrigin: number;
  theme: TimelineTheme;
  showAudioEffects?: boolean;
  rovingTargetId?: string | null;
  collapsedGroupIds: ReadonlySet<string>;
  expandedLaneOwnerIds: ReadonlySet<string>;
  toggleGroupExpanded: (id: string) => void;
  toggleLaneOwnerExpanded: (id: string) => void;
  lanes: UseAutomationLanesResult;
  pps: number;
  currentTime: number;
  /** A group's lanes are in composition time (§1.3), so this is their span. */
  compositionDuration: number;
  beatTimes?: readonly number[];
  contentGutter: number;
  trackContentWidth: number;
}

/** A group's own row: the accessible shell (shared with track rows) plus the group header. */
export function TimelineGroupRow({
  index,
  rowKey,
  group,
  logicalRow,
  top,
  height,
  virtualized,
  contentOrigin,
  theme,
  showAudioEffects = true,
  rovingTargetId = null,
  collapsedGroupIds,
  expandedLaneOwnerIds,
  toggleGroupExpanded,
  toggleLaneOwnerExpanded,
  lanes,
  pps,
  currentTime,
  compositionDuration,
  beatTimes,
  contentGutter,
  trackContentWidth,
}: TimelineGroupRowProps) {
  // From the group, NOT from `tracks`: a collapsed group emits no member rows
  // into the display list, and every one of these reads silently degraded to
  // empty in that (default) state — the lane count
  // read 0, and the bus strip fell back to "track 1", "track 2".
  const memberElements = group.memberElements;
  // The group wearing a clip's shape so the lane machinery can render it — see
  // `groupAutomationElement` for why that beats a second, parallel lane path.
  const groupElement = groupAutomationElement(group, compositionDuration);
  // A group lane is editable exactly when the group is the selected element,
  // which clicking its name in the header does.
  const domSelection = useDomEditSelectionContextOptional()?.domEditSelection ?? null;
  const isGroupSelected = domSelection?.id === group.id;
  const isLaneOpen = expandedLaneOwnerIds.has(group.id);
  // Optional, like every sibling row: Timeline renders outside the edit
  // provider in read-only hosts (Timeline.test.ts asserts it), and the throwing
  // hook took the whole timeline down with it the moment a group existed —
  // not just this row.
  const {
    onSetAudioGroupAttributeLive,
    onSetAudioGroupAttributeQuiet,
    onRevertAudioGroupAttributeLive,
  } = useTimelineEditContextOptional();
  const domEditActions = useDomEditActionsContextOptional();
  const revealAudioFx = usePlayerStore((state) => state.setRevealedAudioFxTarget);
  const writeGroupFxChain = (next: HfAudioFxChain, live: boolean, ended = false) => {
    const value = next.nodes.length ? serializeAudioFxChain(next) : null;
    if (!live) {
      void onSetAudioGroupAttributeQuiet?.(group.id, HF_AUDIO_FX_ATTR, value, "Apply preset");
      return;
    }
    onSetAudioGroupAttributeLive?.(group.id, HF_AUDIO_FX_ATTR, value);
    if (ended) onRevertAudioGroupAttributeLive?.(group.id, HF_AUDIO_FX_ATTR);
  };
  const openGroupFxRack = (automationTarget?: string) => {
    // Use the guarded timeline-selection path even though the bus is synthetic:
    // it invalidates an older clip selection that may still be resolving. The
    // old direct build/apply path let that late clip reclaim the rack.
    const selection = domEditActions?.handleTimelineElementSelect(groupElement);
    if (!selection || !automationTarget) return;
    // Bus selection clears the clip selection, which intentionally retires any
    // old reveal request. Publish this one afterwards so the newly mounted bus
    // rack can consume it rather than losing it during that clear.
    void selection.then(() =>
      revealAudioFx({
        elementKey: group.id,
        automationTarget,
      }),
    );
  };
  return (
    <TimelineTrackRow
      index={index}
      rowKey={rowKey}
      logicalRow={logicalRow}
      propertyRows={[]}
      lanesId=""
      headerLanesId=""
      top={top}
      height={height}
      virtualized={virtualized}
      background={theme.rowBackground}
      borderColor={theme.rowBorder}
      rovingTargetId={rovingTargetId}
    >
      {/* Header and its lane labels in ONE sticky column — the shape
          `TimelineTrackHeader` already uses: a fixed TRACK_H line box with the
          lane rows absolutely positioned beneath it, the whole thing pinned.
          The labels used to be SIBLINGS of the header, so `absolute left-0`
          resolved against the ROW, and the row is what scrolls horizontally —
          they slid away with the canvas. Sticky lives here rather than on the
          header, which keeps its own box inside; a zero-width sticky wrapper
          around the labels alone does not work either, because as a flex item
          after the header it starts at x = columnWidth, i.e. inside the lanes. */}
      <div
        className="sticky left-0 z-12 shrink-0"
        style={{ width: contentOrigin >= LABEL_COL_W ? LABEL_COL_W : contentOrigin }}
      >
        <TimelineGroupHeader
          label={group.label}
          memberCount={group.memberTracks.length}
          isExpanded={!collapsedGroupIds.has(group.id)}
          onToggleExpanded={() => toggleGroupExpanded(group.id)}
          // The GROUP's own lanes, not its members'. `∿` is per-row (groups doc
          // §5: "∿ is lit on vo-1 but not vo-2, the same control per row"), and
          // counting the members' here made the group advertise curves it does
          // not own and cannot show.
          laneCount={groupAutomationLanes([groupElement]).length}
          isLaneOpen={isLaneOpen}
          onToggleLanes={() => toggleLaneOwnerExpanded(group.id)}
          fxChain={group.fxChain}
          onFxChainChange={(next) => writeGroupFxChain(next, false)}
          onFxChainPreview={(next, ended) => writeGroupFxChain(next, true, ended)}
          auditionSpans={memberElements}
          onOpenFxRack={() => openGroupFxRack()}
          // Same width as every other row's header. The group row needs a real
          // label column, but it gets one by turning `labelMode` on for the whole
          // timeline (see Timeline.tsx) rather than by overhanging alone — an
          // overhanging header paints opaquely across the rest of its row and
          // stays pinned there through horizontal scroll.
          columnWidth={contentOrigin >= LABEL_COL_W ? LABEL_COL_W : contentOrigin}
          theme={theme}
          showAudioEffects={showAudioEffects}
        />
        {/* The group's OWN curves, under the strip. Selected-gated exactly like a
          clip's: a lane is editable once the group is selected, which clicking
          its name does. */}
        {/* The label column for those lanes, on the accent rail — inside the
            sticky column above, so they pin with the header. */}
        {isLaneOpen && (
          <TimelineGroupLaneLabels
            groupElement={groupElement}
            groupLabel={group.label}
            top={TRACK_H}
            columnWidth={contentOrigin >= LABEL_COL_W ? LABEL_COL_W : contentOrigin}
            gutterBackground={theme.gutterBackground}
            accentColor={GROUP_LANE_ACCENT}
            onReveal={showAudioEffects ? openGroupFxRack : undefined}
          />
        )}
      </div>
      {isLaneOpen && (
        // The same offset content cell a track row wraps its lanes in — the
        // slot positions absolutely, so mounted straight on the row it resolved
        // against the row instead and drew the envelope across the label gutter
        // from x=0.
        <div
          role="gridcell"
          data-timeline-zoom-scale=""
          aria-colindex={2}
          style={{ width: trackContentWidth, marginLeft: contentGutter }}
          className="relative"
        >
          <TimelineAutomationLaneSlot
            elements={[groupElement]}
            isSelected={() => isGroupSelected}
            lanes={lanes}
            pps={pps}
            // Below the strip, which sits directly under the header row.
            laneCount={0}
            topOffset={TRACK_H}
            accentColor={GROUP_LANE_ACCENT}
            currentTime={currentTime}
            beatTimes={beatTimes}
          />
        </div>
      )}
    </TimelineTrackRow>
  );
}
