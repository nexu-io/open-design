import { useI18n } from "../../i18n/I18n";
/**
 * The rows a track header draws BELOW its own line: one per disclosed keyframe
 * property group, one per automation envelope.
 *
 * Split out of `TimelineTrackHeader.tsx`, which owned all of this and stood at
 * 763 lines against the studio's 600-line cap. Nothing else moved: these three
 * components never read the header's state, only their own props, which is why
 * they are the seam.
 */

import type { TimelineElement } from "../store/playerStore";
import type { TimelineEditCallbacks } from "./timelineCallbacks";
import { AUTOMATION_LANE_H } from "./automationLaneHeight";
import { LANE_H, getTimelineLaneTop } from "./timelineLayout";
import {
  resolveLaneHeaderState,
  type KeyframeNavigationState,
  type TimelinePropertyLane,
} from "./trackHeaderLaneState";
import { valueReadout } from "./trackHeaderLaneValues";
import { timelineLogicalRowCellId, timelinePropertyRowId } from "./timelineNavigationIdentity";

// Figma layout: prev-keyframe ‹, the add/remove toggle (children), next ›.
function PropertyGroupNavigation({
  navigation,
  label,
  expandedElement,
  onSeek,
  children,
}: {
  navigation: KeyframeNavigationState;
  label: string;
  expandedElement: TimelineElement;
  onSeek?: (time: number) => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  // The 12x20px glyph is all the lane row has room for, so the WCAG 24x24
  // target is met with a centered transparent ::before overlay instead of a
  // bigger box; focus-visible matches every other control in this header.
  const CHEVRON_BUTTON_CLASS =
    "relative h-5 w-3 border-0 bg-transparent p-0 text-text-2 hover:text-text-0 disabled:text-text-off " +
    "focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-ring " +
    "before:absolute before:left-1/2 before:top-1/2 before:h-6 before:w-6 " +
    "before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']";
  const seekTo = (keyframe: { percentage: number } | null) => {
    if (keyframe) {
      onSeek?.(expandedElement.start + (keyframe.percentage / 100) * expandedElement.duration);
    }
  };
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        aria-label={t("Previous {label} keyframe", { label: t(label) })}
        disabled={!navigation.prevKeyframe}
        className={CHEVRON_BUTTON_CLASS}
        onClick={(event) => {
          event.stopPropagation();
          seekTo(navigation.prevKeyframe);
        }}
      >
        ‹
      </button>
      {children}
      <button
        type="button"
        aria-label={t("Next {label} keyframe", { label: t(label) })}
        disabled={!navigation.nextKeyframe}
        className={CHEVRON_BUTTON_CLASS}
        onClick={(event) => {
          event.stopPropagation();
          seekTo(navigation.nextKeyframe);
        }}
      >
        ›
      </button>
    </span>
  );
}

export function PropertyGroupHeaderRow({
  lanesId,
  lane,
  laneIndex,
  isLastLane,
  expandedElement,
  currentTime,
  clipPercentage,
  gutterBackground,
  columnWidth,
  onTogglePropertyGroupKeyframe,
  onSeek,
  rovingTargetId = null,
}: {
  lanesId: string;
  lane: TimelinePropertyLane;
  laneIndex: number;
  isLastLane: boolean;
  expandedElement: TimelineElement;
  currentTime: number;
  clipPercentage: number;
  gutterBackground: string;
  columnWidth: number;
  onTogglePropertyGroupKeyframe?: TimelineEditCallbacks["onTogglePropertyGroupKeyframe"];
  onSeek?: (time: number) => void;
  rovingTargetId: string | null;
}) {
  const { t } = useI18n();
  const elementId = expandedElement.key ?? expandedElement.id;
  const { navigation, values, label, toggleTarget } = resolveLaneHeaderState(
    lane,
    currentTime,
    clipPercentage,
  );

  return (
    <div
      id={timelineLogicalRowCellId(lanesId, timelinePropertyRowId(elementId, lane.group), "header")}
      data-timeline-focus-id={timelinePropertyRowId(elementId, lane.group)}
      data-timeline-element-id={elementId}
      tabIndex={rovingTargetId === timelinePropertyRowId(elementId, lane.group) ? 0 : -1}
      data-property-group={lane.group}
      data-timeline-lane-top={getTimelineLaneTop(laneIndex)}
      className="absolute left-0 flex items-center gap-1 overflow-hidden px-1.5 text-[10px] text-text-2"
      style={{
        top: getTimelineLaneTop(laneIndex),
        // The header column narrows to contentOrigin whenever that is under
        // LABEL_COL_W; a lane row pinned to LABEL_COL_W then hangs its value
        // readout over the canvas, on top of the clips it is labelling.
        width: columnWidth,
        height: LANE_H,
        background: gutterBackground,
      }}
    >
      {/* Tree connector: vertical spine (top-half on the last lane) + branch tick. */}
      <span className="relative h-full w-3 shrink-0" aria-hidden="true">
        <span
          className="absolute left-1.5 top-0 w-px bg-text-0/15"
          style={{ height: isLastLane ? "50%" : "100%" }}
        />
        <span className="absolute left-1.5 top-1/2 h-px w-1.5 bg-text-0/15" />
      </span>
      <span className="w-[46px] shrink-0 truncate text-text-0" title={t(label)}>
        {t(label)}
      </span>
      <PropertyGroupNavigation
        navigation={navigation}
        label={t(label)}
        expandedElement={expandedElement}
        onSeek={onSeek}
      >
        <button
          type="button"
          aria-pressed={!!navigation.currentKeyframe}
          aria-label={t("{value0} {label} keyframe", { value0: t(navigation.currentKeyframe ? "Remove" : "Add"), label: t(label) })}
          title={t("{value0} {label} keyframe", { value0: t(navigation.currentKeyframe ? "Remove" : "Add"), label: t(label) })}
          // h-6 w-6 = the 24x24 WCAG 2.2 minimum target; the ◆ glyph stays 11px.
          className="flex h-6 w-6 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-[11px] text-accent-ink focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-ring"
          onClick={(event) => {
            // Same as the disclosure caret and the eye: a control in the label
            // column owns its click, it does not also hit the track row behind it.
            event.stopPropagation();
            if (toggleTarget) {
              void onTogglePropertyGroupKeyframe?.(expandedElement, toggleTarget);
            }
          }}
        >
          {navigation.currentKeyframe ? "◆" : "◇"}
        </button>
      </PropertyGroupNavigation>
      <span
        className="min-w-0 flex-1 truncate text-right tabular-nums text-text-muted"
        title={valueReadout(lane.group, values)}
      >
        {valueReadout(lane.group, values)}
      </span>
    </div>
  );
}

/**
 * One envelope's row in the label column.
 *
 * Named here rather than inside the lane, on the same tree connector the
 * keyframe rows use: an automation lane is a child of its clip exactly as a
 * property group is, and drawing its name over the envelope put the label on top
 * of the curve it describes and scrolled it away from its own row.
 */
export function AutomationLaneHeaderRow({
  target,
  label,
  name,
  param,
  alsoAutomatedBy,
  top,
  isLastLane,
  gutterBackground,
  columnWidth,
  onRemove,
  isCarve,
  onReveal,
}: {
  /** The lane the ACTIVE clip draws in this row, or null when it draws none —
   *  the row belongs to the property, and a clip may be absent from it. */
  target: string | null;
  /** The whole thing on one line: the row's identity, its tooltip, and the
   *  remove button's name. */
  label: string;
  /** What the effect is — "Peaking EQ 1.6 kHz". */
  name: string;
  /** Which knob the envelope drives. Empty when there is no second line to draw. */
  param: string;
  /** Set when this clip's group automates the SAME parameter. Gain stages
   *  multiply — 0.42 on the group under 0.80 here plays at 0.34 — so an author
   *  who drew one curve and then another hears something quieter than either
   *  with nothing on screen to say why (groups doc §5). Not a warning; an
   *  explanation. */
  alsoAutomatedBy?: string;
  top: number;
  isLastLane: boolean;
  gutterBackground: string;
  columnWidth: number;
  onRemove?: (target: string) => void;
  /** The carve owns this envelope and rewrites it on every re-run, so it is
   *  shown but not the author's to edit or delete. */
  isCarve?: boolean;
  /** Reveal this parameter in the rack. Absent, the name is inert rather than a
   *  button that looks live and does nothing. */
  onReveal?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      data-automation-lane-label={t(label)}
      data-timeline-lane-top={top}
      className="absolute left-0 flex items-center gap-1 overflow-hidden px-1.5 text-[10px] text-text-2"
      style={{
        top,
        width: columnWidth,
        height: AUTOMATION_LANE_H,
        background: gutterBackground,
      }}
    >
      {/* Tree connector, as the keyframe rows draw it: spine down the row, branch
          tick at the name's own height. */}
      <span className="relative h-full w-3 shrink-0" aria-hidden="true">
        <span
          className="absolute left-1.5 top-0 w-px bg-text-0/15"
          style={{ height: isLastLane ? "50%" : "100%" }}
        />
        <span className="absolute left-1.5 top-1/2 h-px w-1.5 bg-text-0/15" />
      </span>
      {/* Two lines: what the effect is, then which knob the envelope drives. On
          one line a band's own name was the first thing truncated in a column this
          narrow — "Peaking EQ 1.6 k…" — losing exactly the part that tells two
          bands apart. */}
      {/* A button, because the name IS the way to the knob: clicking it opens
          the rack on the effect this envelope drives and scrolls to it. Nothing
          else in the timeline can get there — a lane names a parameter, and the
          rack is where a parameter is set. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={onReveal ? t("Show {label} in the effect rack", { label: t(label) }) : undefined}
        title={onReveal ? t("Show {label} in the effect rack", { label: t(label) }) : label}
        disabled={!onReveal}
        className="flex min-w-0 flex-1 flex-col justify-center rounded-sm border-0 bg-transparent p-0 text-left leading-tight enabled:hover:text-text-0 focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-ring"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          // The label column owns its click; it does not also fall through to
          // the track row behind it and move the selection.
          event.stopPropagation();
          onReveal?.();
        }}
      >
        <span data-automation-lane-name="" className="truncate font-mono text-[9px] text-text-2">
          {name}
        </span>
        {param ? (
          <span
            data-automation-lane-param=""
            className="truncate font-mono text-[9px] text-text-muted"
          >
            {param}
          </span>
        ) : null}
        {alsoAutomatedBy ? (
          <span
            data-automation-lane-also=""
            className="truncate text-[9px] text-warning-ink"
            title={t("{alsoAutomatedBy} is also fading this. The two multiply.", { alsoAutomatedBy: alsoAutomatedBy })}
          >
            {alsoAutomatedBy} {t("is also fading this.")}</span>
        ) : null}
      </button>
      {/* Beside the name it labels, because that is the only place an envelope is
          named at all: a carve writes its own lanes, and the FX panel's automate
          toggle can only reach a parameter it still lists — so without this an
          envelope could be created and never removed.

          Only for the clip the header is showing, since that is the only one a
          write can reach: a shared row's other envelopes belong to clips that
          are not selected, and a button that silently removed one of them (or
          none) would be worse than no button. */}
      {/* Not on a carve's own lane: the carve regenerates it on the next
          analysis, so removing one band would come back and reads as the
          button not working. Switching the carve off in the rack is what
          removes them, all together, which is how they were made. */}
      {onRemove && target !== null && !isCarve && (
        <button
          type="button"
          aria-label={t("Remove {label} automation", { label: t(label) })}
          title={t("Remove {label} automation", { label: t(label) })}
          // h-6 w-6 is the 24x24 WCAG 2.2 target; the glyph stays small.
          className="flex h-6 w-6 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-[11px] text-text-muted hover:text-text-0 focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-ring"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            // A control in the label column owns its click; it does not also hit
            // the track row behind it and change the selection.
            event.stopPropagation();
            onRemove(target);
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
