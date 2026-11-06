import { useI18n } from "../../i18n/I18n";
/**
 * Breakpoint automation over an audio clip, edited the way a DAW edits it:
 * double-click the line to add a point, drag one to shape it, right-click or
 * Shift+click a point to remove it, drag a line segment to move both endpoints,
 * Alt-drag the line to bend it, and double-click a point to type an exact value.
 *
 * Ableton-style modifiers apply: Shift locks/fines a drag, while Alt bends a
 * segment or ignores the grid during a point drag. Background drags select a
 * set that can be moved, deleted, or shaped together.
 *
 * Effect parameters, ranges, units, and scaling come from the FX registry, so
 * an upstream effect needs no lane-specific code here.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  sampleAutomationLane,
  type AutomationRange,
  type HfAutomation,
  type HfAutomationLane,
  type HfAutomationPoint,
} from "@hyperframes/core/audio-automation";
import type { TimelineEditOutcome } from "../../hooks/timelineEditPermission";
import { envelopePath, fromUnit, laneFor, PAD_X, toUnit, withLane } from "./automationLaneGeometry";
import { useAutomationLaneGestures } from "./useAutomationLaneGestures";
import { AutomationValueInput } from "./AutomationValueInput";
import { AutomationSelectionMenu } from "./AutomationSelectionMenu";
import { AUTOMATION_LANE_H } from "./automationLaneHeight";
import { generateShape, type AutomationShapeId } from "./automationShapes";
import { simplifyPoints } from "./automationSimplify";
import { pointInSelection, pointsIn, replaceRange } from "./automationLaneSelection";
import { defaultTimelineTheme } from "./timelineTheme";
import { AutomationEnvelopePaths } from "./AutomationEnvelopePaths";

/**
 * Drawn radius of a breakpoint.
 *
 * Independent of the grab radius, which is how close a pointer has to be to catch
 * one: the two were the same number scaled, and tying them meant a dot could not be
 * made easier to see without also changing what it caught. A touch over half the
 * grab radius reads clearly at lane height without swallowing a dense run.
 */
const POINT_R = 4.9;

/** Separator between stacked lanes — the same token a track row divides with. Read
 *  off the default theme rather than threaded as a prop: nothing overrides the
 *  timeline theme for lanes today, and a prop for one colour is plumbing to nowhere. */
const LANE_BORDER = defaultTimelineTheme.rowBorder;

/** Selection box on one lane. Value bounds included: a point at the right time
 *  but the wrong value is not in it. */
type SelectionBox = { t0: number; t1: number; v0: number; v1: number };

/** Is this breakpoint inside the selection box? The rule itself is shared with
 *  Delete and with the group drag, so what is drawn as caught is exactly what
 *  those act on; this only adds tolerance for there being no selection at all. */
function pointInBox(point: HfAutomationPoint, box: SelectionBox | null | undefined): boolean {
  return !!box && pointInSelection(point, box);
}

/** A breakpoint's drawn radius and stroke, pulled out of the render loop so the
 *  map callback stays a single JSX return — the ternaries below are what pushed
 *  it over the complexity budget when they lived inline. */
function pointCircleStyle(
  inRange: boolean,
  dragging: boolean,
): { radius: number; stroke: string; strokeWidth: number } {
  return {
    radius: POINT_R * (dragging ? 1.3 : inRange ? 1.15 : 1),
    // A white ring rather than a different fill: the fill is the parameter's
    // own colour, and a lane with two envelopes on it is read by colour first.
    stroke: inRange ? "var(--timeline-text-solid)" : "var(--timeline-automation-point-muted)",
    strokeWidth: inRange ? 1.5 : 1,
  };
}

/** Pointer shape: a read-only lane can only be selected, a live one edited. */
/**
 * Whether a point's grab handle is up.
 *
 * A raised handle is an offer to drag, so a read-only lane keeps them down: the
 * carve rewrites its envelopes from the analysis on every run, and a point
 * moved here is discarded rather than saved. Hidden rather than unmounted
 * either way, so the hit area survives — a point dragged past the lane's edge
 * fires pointerleave mid-gesture, and a handle that vanished then would drop
 * the drag. A live drag and a selected range both keep them up regardless: the
 * range is the subject of a pending Delete, and which points it caught cannot
 * depend on where the mouse is.
 */
/** The svg's tooltip: what this lane's gestures actually are. */
function laneTitle(readOnly: boolean | undefined): string {
  return readOnly
    ? "Drag a box to select points, which also selects this clip; then double-click to add a point"
    : "Double-click to add a point, drag to shape, double-click a point to type a value, right-click or Shift+click to remove it. Drag a line segment to move both endpoints. Drag the background to draw a box around points, then Delete to remove them or drag one to move them all. Alt-drag the line to curve it. Shift locks an axis mid-drag; Alt ignores the grid.";
}

/**
 * Why this lane will not take an edit, in the lane itself.
 *
 * Dimming and a default cursor say "not editable" but not WHY, and the why is
 * the part that matters: the carve rewrites these envelopes from its own
 * analysis on every run, so a point moved here is discarded rather than saved.
 * Only while hovered, so a stack of read-only lanes is not a stack of notices,
 * and never over a selection the author is about to act on.
 *
 * Separate from the gesture `hint` slot, which belongs to handlers that do not
 * run on a read-only lane at all.
 */
function ReadOnlyNote({
  readOnly,
  note,
  hovered,
  hasRange,
  leftPx,
  widthPx,
}: {
  readOnly: boolean | undefined;
  note: string | undefined;
  hovered: boolean;
  /** A selection is the subject of a pending action; do not cover it. */
  hasRange: boolean;
  leftPx: number;
  widthPx: number;
}) {
  if (!readOnly || !note || !hovered || hasRange) return null;
  return (
    <div
      data-automation-readonly-note=""
      className="hf-automation-readonly-note pointer-events-none absolute rounded-[3px] bg-[var(--timeline-overlay-bg-strong)] px-1.5 py-0.5 text-[9px] text-[var(--timeline-overlay-text)]"
      style={{ left: leftPx + 6, top: 2, zIndex: 3, maxWidth: Math.max(120, widthPx - 12) }}
    >
      {note}
    </div>
  );
}

function pointHandleOpacity(args: {
  readOnly: boolean | undefined;
  hovered: boolean;
  dragging: boolean;
  hasRange: boolean;
}): number {
  if (args.dragging || args.hasRange) return 1;
  return !args.readOnly && args.hovered ? 1 : 0;
}

function laneCursor(
  readOnly: boolean | undefined,
  dragging: boolean,
  stretching: boolean,
  segmentHovering: boolean,
): string {
  // A stretch handle wins over everything it might also sit above: the handle is
  // a few px wide and always overlaps whatever is under the selection edge, so
  // any other cursor there would advertise a gesture the press will not start.
  if (stretching) return "col-resize";
  if (readOnly) return "pointer";
  if (dragging) return "grabbing";
  return segmentHovering ? "grab" : "crosshair";
}

export interface TimelineAutomationLaneProps {
  /** Clip-local duration the lane spans. */
  duration: number;
  widthPx: number;
  leftPx: number;
  topPx: number;
  automation: HfAutomation;
  /** Which lane of that automation this row draws. */
  target: string;
  /** Axis, unit and label for the target, resolved against the chain. */
  range: AutomationRange;
  accentColor: string;
  /** Clip-local seconds of the playhead, or null when it is outside the clip. */
  playheadSec: number | null;
  /** Continuous write while dragging; does not persist. */
  onPreview(automation: HfAutomation, ended?: boolean): void;
  /** Gesture-end write; this is the one that persists and lands in undo. */
  onCommit(automation: HfAutomation): Promise<TimelineEditOutcome | void> | void;
  /**
   * Clip-local times a dragged point snaps to — the beat grid, shifted into this
   * clip's frame. Its own neighbouring points are added on top.
   */
  snapTimes?: readonly number[];
  /** Editing writes to the selected element, so an unselected clip is read-only. */
  readOnly?: boolean;
  /** Why `readOnly`, shown in the lane on hover. Without it the lane only looks
   *  disabled; the author still has to guess what would let them edit it. */
  readOnlyNote?: string;
  /** Called when a read-only lane is pressed: selects the clip so it goes live. */
  onSelect?(): void;
  /** Active selection box on THIS lane, or null. */
  rangeSelection?: SelectionBox | null | undefined;
  onRangeSelect?: ((t0: number, t1: number, v0: number, v1: number) => void) | undefined;
  onRangeClear?: (() => void) | undefined;
}

export function TimelineAutomationLane({
  duration,
  widthPx,
  leftPx,
  topPx,
  automation,
  target,
  range,
  accentColor,
  playheadSec,
  onPreview,
  onCommit,
  snapTimes,
  readOnly,
  readOnlyNote,
  onSelect,
  rangeSelection,
  onRangeSelect,
  onRangeClear,
}: TimelineAutomationLaneProps) {
  const { t } = useI18n();
  const stored = laneFor(automation, target);

  const svgRef = useRef<SVGSVGElement | null>(null);

  /**
   * Points as the user is shaping them, before the edit has come back around.
   *
   * A live write sets the preview attribute but deliberately skips the refresh —
   * that is what keeps dragging from reloading the composition and restarting
   * playback. So the automation prop does not move under the pointer, and
   * without a local draft the point would not either.
   */
  const [draft, setDraft] = useState<{ points: HfAutomationPoint[]; basedOn: HfAutomation } | null>(
    null,
  );
  const lane: HfAutomationLane = useMemo(
    () => (draft ? { target, points: draft.points } : stored),
    [draft, target, stored],
  );

  // A different parameter is a different envelope; the draft does not carry over.
  useEffect(() => {
    setDraft(null);
  }, [target]);

  const h = AUTOMATION_LANE_H;
  const pad = 6;
  const inner = h - pad * 2;
  // Drawing is inset by PAD_X and the svg is widened to match, so screen
  // position still lines up with clip time — the lane just has margins.
  const xOf = useCallback(
    (t: number): number => PAD_X + (duration > 0 ? (t / duration) * widthPx : 0),
    [duration, widthPx],
  );
  const yOf = useCallback(
    (v: number): number => pad + (1 - toUnit(range, v)) * inner,
    [range, inner],
  );

  /** Pointer position as a clip-local time and a parameter value. */
  const pointAt = useCallback(
    (clientX: number, clientY: number): { t: number; v: number } => {
      const box = svgRef.current?.getBoundingClientRect();
      if (!box || box.width <= 0) return { t: 0, v: range.default ?? range.min };
      const t = Math.min(
        duration,
        Math.max(0, ((clientX - box.left - PAD_X) / widthPx) * duration),
      );
      const unit = 1 - (clientY - box.top - pad) / inner;
      return { t, v: fromUnit(range, unit) };
    },
    [duration, inner, range, widthPx],
  );

  const path = useMemo(
    () => envelopePath({ lane, range, widthPx, xOf, yOf }),
    [lane, range, widthPx, xOf, yOf],
  );

  const commitPoints = useCallback(
    (points: HfAutomationLane["points"], persist: boolean, ended?: boolean): void => {
      // Draw from the draft immediately; the write is what eventually agrees.
      setDraft({ points, basedOn: automation });
      const next = withLane(automation, { target, points });
      if (!persist) return onPreview(next, ended);
      void Promise.resolve(onCommit(next)).then((outcome) => {
        if (outcome && outcome.status !== "saved") {
          setDraft((current) => (current?.points === points ? null : current));
        }
      });
    },
    [automation, target, onCommit, onPreview],
  );

  const getBox = useCallback(
    (): DOMRect | null => svgRef.current?.getBoundingClientRect() ?? null,
    [],
  );
  const gestures = useAutomationLaneGestures({
    getBox,
    lane,
    range,
    pointAt,
    xOf,
    yOf,
    commitPoints,
    snapTimes,
    readOnly,
    onSelect,
    onRangeSelect,
    onRangeClear,
    duration,
    rangeSelection,
  });

  const {
    dragIndex,
    curveIndex,
    segmentDragIndex,
    segmentHoverIndex,
    edgeDrag,
    edgeHover,
    hint,
    editing,
  } = gestures;
  // Released when the automation it was drawn over changes, not on drag end (the point would
  // snap back until the write lands) and not under a live gesture (its release would commit
  // an older save's points).
  const gestureLive = [dragIndex, curveIndex, segmentDragIndex, edgeDrag].some((g) => g !== null);
  useEffect(() => {
    if (draft && draft.basedOn !== automation && !gestureLive) setDraft(null);
  }, [automation, draft, gestureLive]);

  const removeAt = useCallback(
    (index: number): void => {
      if (readOnly) return;
      commitPoints(
        lane.points.filter((_, i) => i !== index),
        true,
      );
    },
    [lane, commitPoints, readOnly],
  );

  /** Client-coordinate position of an open selection menu, or null when closed. */
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  /**
   * Whether the pointer is over this lane, which is what decides if the
   * breakpoints are drawn.
   *
   * A stack of envelopes across a long clip is hundreds of discs, and at rest the
   * shape of each is the thing worth reading — the handles matter only to someone
   * about to grab one. The line stays visible either way; this hides just the
   * points.
   */
  const [hovered, setHovered] = useState(false);

  const insertShape = useCallback(
    (shape: AutomationShapeId): void => {
      if (!rangeSelection) return;
      const inner = generateShape({
        shape,
        lane,
        range,
        t0: rangeSelection.t0,
        t1: rangeSelection.t1,
      });
      commitPoints(
        replaceRange({ lane, range, t0: rangeSelection.t0, t1: rangeSelection.t1, inner }),
        true,
      );
    },
    [rangeSelection, lane, range, commitPoints],
  );

  const simplifySelection = useCallback((): void => {
    if (!rangeSelection) return;
    const inner = simplifyPoints(pointsIn(lane, rangeSelection.t0, rangeSelection.t1), range);
    commitPoints(
      replaceRange({ lane, range, t0: rangeSelection.t0, t1: rangeSelection.t1, inner }),
      true,
    );
  }, [rangeSelection, lane, range, commitPoints]);

  // A point's own right-click already stops propagation and still deletes;
  // this only fires when the press lands on the background inside the
  // active selection.
  const onSvgContextMenu = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>): void => {
      if (readOnly || !rangeSelection) return;
      // Inside the drawn box, not merely inside its span: the menu's own actions
      // read the span, but a right-click well above or below the box is a press
      // on empty lane as far as the author can see.
      if (!pointInSelection(pointAt(e.clientX, e.clientY), rangeSelection)) return;
      e.preventDefault();
      setMenuAt({ x: e.clientX, y: e.clientY });
    },
    [readOnly, rangeSelection, pointAt],
  );

  const currentValue =
    lane.points.length > 0 && playheadSec !== null
      ? sampleAutomationLane(lane, playheadSec, range.scale)
      : null;

  return (
    <div
      // Spans the whole row so the separator below can, but takes no pointer
      // events itself: clips sharing a row each mount one of these over the
      // full width, so a band that accepted the pointer would let whichever
      // clip rendered last swallow every sibling's envelope — hover, drag and
      // all. Only the drawn parts opt back in.
      className="hf-automation-lane pointer-events-none absolute"
      style={{ top: topPx, left: 0, right: 0, height: h }}
      data-automation-lane={target}
    >
      {/* Separator above each lane, in the same colour a track row divides with, so
          a stack of envelopes reads as rows rather than as one tall field. Drawn as
          an overlay rather than a CSS border: the lane's height is fixed and its svg
          is positioned against the same box, so a border would shift the drawing a
          pixel off the geometry every hit test is computed from. */}
      <div
        data-automation-lane-border=""
        className="hf-automation-lane-border pointer-events-none absolute"
        style={{ top: 0, left: 0, right: 0, height: 1, background: LANE_BORDER, zIndex: 1 }}
      />
      {/* No name drawn here: the label column carries it, on the same tree
          connector as the keyframe rows. Painted in the lane it sat on top of the
          envelope it described and scrolled horizontally away from its own row. */}
      <svg
        ref={svgRef}
        className="hf-automation-svg pointer-events-auto absolute"
        style={{
          left: leftPx - PAD_X,
          top: 0,
          width: widthPx + PAD_X * 2,
          height: h,
          cursor: laneCursor(
            readOnly,
            dragIndex !== null || curveIndex !== null || segmentDragIndex !== null,
            edgeDrag !== null || edgeHover,
            segmentHoverIndex !== null,
          ),
          opacity: readOnly ? 0.55 : 1,
          touchAction: "none",
        }}
        width={widthPx + PAD_X * 2}
        height={h}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => {
          setHovered(false);
          gestures.onPointerLeave();
        }}
        onPointerDown={gestures.onPointerDown}
        onPointerMove={gestures.onPointerMove}
        onPointerUp={gestures.endDrag}
        onPointerCancel={gestures.cancelDrag}
        onDoubleClick={gestures.onDoubleClick}
        onContextMenu={onSvgContextMenu}
        role="group"
        aria-label={t("{value0} automation", { value0: range.label })}
      >
        <title>{laneTitle(readOnly)}</title>
        {/* No plate behind the envelope: the lane used to darken its clip's width,
            which drew a box inside the row and made a stack of lanes read as tiles
            rather than as rows of one timeline. The row background shows through, and
            the separator above each lane is what divides them now. */}
        {/* Mid rail, so a value reads against something. */}
        <line
          x1={PAD_X}
          x2={PAD_X + widthPx}
          y1={pad + inner / 2}
          y2={pad + inner / 2}
          stroke="var(--timeline-automation-rail)"
          strokeDasharray="3 4"
        />
        {rangeSelection ? (
          <rect
            data-automation-selection=""
            x={xOf(rangeSelection.t0)}
            // v1 is the upper bound, which is the SMALLER y: the value axis runs
            // up the lane and the screen axis runs down it.
            y={yOf(rangeSelection.v1)}
            width={Math.max(0, xOf(rangeSelection.t1) - xOf(rangeSelection.t0))}
            height={Math.max(0, yOf(rangeSelection.v0) - yOf(rangeSelection.v1))}
            fill={accentColor}
            opacity={0.15}
            // Outlined as well as tinted. A box dragged thin along either axis is
            // nearly invisible as a fill, and the author still has to be able to
            // see what they drew before pressing Delete.
            stroke={accentColor}
            strokeOpacity={0.6}
            pointerEvents="none"
          />
        ) : null}
        <AutomationEnvelopePaths
          path={path}
          lane={lane}
          range={range}
          accentColor={accentColor}
          activeSegment={segmentDragIndex ?? segmentHoverIndex}
          xOf={xOf}
          yOf={yOf}
        />
        {lane.points.map((p, i) => {
          // Endpoint-inclusive, the same rule Delete uses, so what looks caught by
          // the range is exactly what the range will remove. The tinted rectangle
          // says where the selection is; this says which points it has.
          const inRange = pointInBox(p, rangeSelection);
          const { radius, stroke, strokeWidth } = pointCircleStyle(inRange, i === dragIndex);
          return (
            <circle
              key={`${i}-${p.t}`}
              data-automation-point={i}
              {...(inRange ? { "data-automation-point-in-range": "" } : {})}
              cx={xOf(p.t)}
              cy={yOf(p.v)}
              r={radius}
              fill={accentColor}
              stroke={stroke}
              strokeWidth={strokeWidth}
              style={{
                cursor: readOnly ? "default" : "grab",
                opacity: pointHandleOpacity({
                  readOnly,
                  hovered,
                  dragging: dragIndex !== null,
                  hasRange: Boolean(rangeSelection),
                }),
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                removeAt(i);
              }}
            />
          );
        })}
        {playheadSec !== null && currentValue !== null ? (
          <circle
            data-automation-playhead=""
            cx={xOf(playheadSec)}
            cy={yOf(currentValue)}
            r={2.5}
            fill="var(--timeline-text-solid)"
            opacity={0.8}
            pointerEvents="none"
          />
        ) : null}
      </svg>

      {editing ? (
        <AutomationValueInput
          text={editing.text}
          leftPx={leftPx + xOf(lane.points[editing.index]?.t ?? 0) - PAD_X - 18}
          label={range.label}
          onChange={gestures.setEditingText}
          onCommit={gestures.commitEdit}
          onCancel={gestures.cancelEdit}
        />
      ) : null}

      {hint ? (
        <div
          className="hf-automation-hint pointer-events-none absolute rounded-[3px] bg-[var(--timeline-overlay-bg)] px-1 py-0.5 font-mono text-[9px] text-[var(--timeline-text-solid)]"
          style={{ left: leftPx + 6, top: 2, zIndex: 3 }}
        >
          {hint}
        </div>
      ) : null}

      <ReadOnlyNote
        readOnly={readOnly}
        note={readOnlyNote}
        hovered={hovered}
        hasRange={Boolean(rangeSelection)}
        leftPx={leftPx}
        widthPx={widthPx}
      />

      {menuAt && rangeSelection ? (
        <AutomationSelectionMenu
          x={menuAt.x}
          y={menuAt.y}
          onClose={() => setMenuAt(null)}
          onInsertShape={insertShape}
          onSimplify={simplifySelection}
          canSimplify={pointsIn(lane, rangeSelection.t0, rangeSelection.t1).length >= 3}
        />
      ) : null}
    </div>
  );
}
