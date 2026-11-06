/**
 * The maths behind an automation lane: which parameters it can offer, how a
 * value maps to a position in the lane, and how a lane is edited.
 *
 * Pure — no React, no DOM. Split from the lane component so the geometry can be
 * tested on its own, and so the component is left with the parts that genuinely
 * need a pointer and a render.
 */

import {
  fxAutomationTarget,
  resolveAutomationRange,
  sampleAutomationLane,
  steadyViaPoint,
  VOLUME_RANGE,
  VOLUME_TARGET,
  type AutomationRange,
  type HfAutomation,
  type HfAutomationLane,
} from "@hyperframes/core/audio-automation";
import { getAudioFxDef, type HfAudioFxChain } from "@hyperframes/core/audio-fx";

/** Points nearer than this in clip seconds are the same point, not two. */
export const POINT_MERGE_SEC = 0.02;

/** Insert or replace the point nearest `t` — the one merge/seed rule every
 * hand-editing gesture on a lane uses (timeline double-click, panel control). */
export function mergeInsertPoint(
  points: readonly HfAutomationLane["points"][number][],
  t: number,
  v: number,
): HfAutomationLane["points"] {
  const kept = points.filter((p) => Math.abs(p.t - t) > POINT_MERGE_SEC);
  // A lane's first point alone would be a constant, which is not what
  // committing to an empty lane means: seed the far end at the same value so
  // the envelope has somewhere to go.
  const seeded = points.length === 0 && t > POINT_MERGE_SEC ? [{ t: 0, v }] : [];
  return [...seeded, ...kept, { t, v }].sort((a, b) => a.t - b.t);
}

/**
 * Closest two breakpoints may sit in clip seconds while still being two points.
 *
 * A drag clamps to this short of its neighbour rather than onto it. Landing on the
 * exact same time is not a step, it is a deletion: the lane's own normalisation
 * collapses points that share a `t`, keeping the later one — so dragging a point
 * fully into its neighbour used to consume that neighbour. A millisecond is under a
 * pixel at any zoom the lane offers, so the two still read as touching.
 */
export const MIN_POINT_GAP_SEC = 0.001;
/** Hit radius for grabbing a point, in px. */
export const GRAB_PX = 7;
/** Distance from the drawn envelope that offers a segment drag, in px. */
export const SEGMENT_GRAB_PX = 5;
/** Samples used to draw a segment the eye should see as curved. */
export const DRAW_SAMPLES = 64;
/**
 * Slack on each side of the envelope, so a point sitting exactly at the clip's
 * start or end is drawn whole instead of half outside the lane. Wide enough for
 * the grab circle plus its stroke.
 */
export const PAD_X = GRAB_PX + 2;

export interface AutomationTargetOption {
  target: string;
  label: string;
  range: AutomationRange;
}

/**
 * Everything this clip could automate: its fader, then each automatable knob of
 * each effect in its chain. Effects with no chain node id are skipped — a lane
 * has nothing stable to address them by (the panel mints ids as it adds nodes).
 */
export function automationTargets(chain: HfAudioFxChain | null): AutomationTargetOption[] {
  const out: AutomationTargetOption[] = [
    { target: VOLUME_TARGET, label: "Volume", range: VOLUME_RANGE },
  ];
  for (const node of chain?.nodes ?? []) {
    out.push(...nodeTargets(node, chain));
  }
  return out;
}

/** One effect's automatable knobs. Empty for a node no lane could address. */
function nodeTargets(
  node: HfAudioFxChain["nodes"][number],
  chain: HfAudioFxChain | null,
): AutomationTargetOption[] {
  const nodeId = node.id;
  const def = nodeId ? getAudioFxDef(node.type) : undefined;
  if (!nodeId || !def) return [];
  const out: AutomationTargetOption[] = [];
  for (const param of def.params) {
    if (param.kind !== "number" || !param.automatable) continue;
    const target = fxAutomationTarget(nodeId, param.key);
    const range = resolveAutomationRange(target, chain ?? undefined);
    if (range) out.push({ target, label: range.label, range });
  }
  return out;
}

/** Value → 0..1 up the lane, honouring a log-read knob's own scale. */
export function toUnit(range: AutomationRange, value: number): number {
  const { min, max } = range;
  if (max <= min) return 0;
  if (range.scale === "log" && min > 0 && value > 0) {
    return (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min));
  }
  return (value - min) / (max - min);
}

export function fromUnit(range: AutomationRange, unit: number): number {
  const t = Math.min(1, Math.max(0, unit));
  const { min, max } = range;
  if (range.scale === "log" && min > 0) {
    return Math.exp(Math.log(min) + t * (Math.log(max) - Math.log(min)));
  }
  return min + t * (max - min);
}

export function formatValue(range: AutomationRange, value: number): string {
  const decimals = range.step >= 1 ? 0 : range.step >= 0.1 ? 1 : 2;
  const shown =
    range.unit === "" && range.max === 1 ? `${Math.round(value * 100)}%` : value.toFixed(decimals);
  return range.unit ? `${shown} ${range.unit}` : shown;
}

/**
 * The via point that bends a segment through a dragged pointer: the pointer's own
 * position in the segment's normalised space, which is all the model needs.
 *
 * There is nothing to solve any more, and that is the point. This used to fit an
 * exponent — `x^e = f`, so `curve = log2(ln f / ln x) / 2` — and an exponent is
 * one knob for two questions. It spent it on the wrong one: every upward bend it
 * could draw deviated most inside the first fifth of the segment, so grabbing the
 * line near its right-hand breakpoint still bulged it on the left. And reaching a
 * pointer near either end needed an exponent the model refuses — `e` runs past 15
 * at `x = 0.9`, clamped to 4 — so the line stopped following the pointer
 * altogether, missing it by up to a third of the segment's height. Naming the
 * point the curve passes through says both things at once, exactly, anywhere.
 *
 * Null when the segment cannot take a bend: a flat segment draws the same line
 * whatever the shape, and a pointer at the very ends is the ends.
 */
export function curveForDrag(input: {
  range: AutomationRange;
  a: { t: number; v: number };
  b: { t: number; v: number };
  t: number;
  v: number;
}): { viaX: number; viaY: number } | null {
  const { range, a, b, t, v } = input;
  const span = b.t - a.t;
  if (span <= 0) return null;
  const x = (t - a.t) / span;
  if (x <= 0.001 || x >= 0.999) return null;
  const ua = toUnit(range, a.v);
  const ub = toUnit(range, b.v);
  if (Math.abs(ub - ua) < 0.001) return null;
  const f = (toUnit(range, v) - ua) / (ub - ua);
  if (f <= 0.001 || f >= 0.999) return null;
  // Reported as the model will honour it, not as the pointer asked. A bend is held
  // to a steady curve, so a pointer dragged past that stops being followed — and
  // the write, the preview and the readout all have to say the same thing about
  // where the line actually went.
  return steadyViaPoint(x, f);
}

/**
 * A point drag with Shift held: one axis at a time, whichever the gesture
 * committed to, and a quarter of the vertical travel for a value that has to
 * land on a number.
 *
 * Which axis "won" is decided in pixels, not in seconds and dB — those are
 * different units and comparing them would make the lock depend on the zoom.
 */
/** Which way a gesture is going, in pixels — the only comparable unit. */
export function dominantDragAxis(input: {
  origin: { t: number; v: number };
  raw: { t: number; v: number };
  xOf(t: number): number;
  yOf(v: number): number;
}): "time" | "value" {
  const { origin, raw, xOf, yOf } = input;
  return Math.abs(xOf(raw.t) - xOf(origin.t)) > Math.abs(yOf(raw.v) - yOf(origin.v))
    ? "time"
    : "value";
}

/**
 * The pointer, constrained to one axis.
 *
 * The axis is handed in rather than worked out here, because it has to be decided
 * once for the gesture and held. Recomputed per event it followed whichever way
 * the last move happened to lean, so a hand drifting sideways during a vertical
 * drag flipped the lock and the point moved in both — which is indistinguishable
 * from no lock at all.
 *
 * Locking to time holds the value exactly. Locking to value holds the time and
 * moves the value at a quarter speed: the same gesture is the fine adjustment,
 * because a fader spanning 60px of lane has no other way to be set precisely.
 */
export function applyShiftConstraint(input: {
  range: AutomationRange;
  origin: { t: number; v: number };
  raw: { t: number; v: number };
  /** Same projections the lane draws with, so the comparison is on screen. */
  xOf(t: number): number;
  yOf(v: number): number;
  /** Decided on the gesture's first travel; worked out here when absent. */
  axis?: "time" | "value";
}): { t: number; v: number } {
  const { range, origin, raw } = input;
  const axis = input.axis ?? dominantDragAxis(input);
  if (axis === "time") return { t: raw.t, v: origin.v };
  const from = toUnit(range, origin.v);
  return { t: origin.t, v: fromUnit(range, from + (toUnit(range, raw.v) - from) * 0.25) };
}

/**
 * Nearest snap target within the threshold, else the time unchanged.
 *
 * A breakpoint is placed by eye, and by eye "on the beat" and "three
 * milliseconds off the beat" look identical — so the lane snaps to the beat grid
 * and to its own neighbouring points, the two things an envelope is usually
 * aligned against.
 */
export function snapLaneTime(t: number, targets: readonly number[], thresholdSec: number): number {
  let best = t;
  let bestDist = thresholdSec;
  for (const target of targets) {
    const d = Math.abs(target - t);
    if (d < bestDist) {
      bestDist = d;
      best = target;
    }
  }
  return best;
}

/** Draw commands from one breakpoint to the next, sampled when it is curved. */
function segmentLineCommands(input: {
  lane: HfAutomationLane;
  range: AutomationRange;
  index: number;
  xOf(t: number): number;
  yOf(v: number): number;
}): string[] {
  const { lane, range, index, xOf, yOf } = input;
  const a = lane.points[index];
  const b = lane.points[index + 1];
  if (!a || !b) return [];
  // A via point bends the segment with no `curve` of its own, so the
  // straight-line shortcut has to rule out both.
  if (!a.curve && a.viaX === undefined && range.scale === "linear") {
    return [`L ${xOf(b.t)} ${yOf(b.v)}`];
  }
  return Array.from({ length: DRAW_SAMPLES }, (_, sample) => {
    const t = a.t + ((b.t - a.t) * (sample + 1)) / DRAW_SAMPLES;
    return `L ${xOf(t)} ${yOf(sampleAutomationLane(lane, t, range.scale))}`;
  });
}

/**
 * The svg path for one lane's envelope.
 *
 * A flat line at the parameter's own default stands in for a lane with no
 * points, so the first double-click has something to land on. Straight segments
 * are drawn as one line each; a curved or log-read segment is sampled, because
 * drawing it straight would lie about the envelope the audio thread is going to
 * play.
 */
export function envelopePath(input: {
  lane: HfAutomationLane;
  range: AutomationRange;
  widthPx: number;
  xOf(t: number): number;
  yOf(v: number): number;
}): string {
  const { lane, range, widthPx, xOf, yOf } = input;
  const first = lane.points[0];
  const last = lane.points[lane.points.length - 1];
  if (!first || !last) {
    const y = yOf(range.default ?? (range.min + range.max) / 2);
    return `M ${PAD_X} ${y} L ${PAD_X + widthPx} ${y}`;
  }
  const pts = [`M ${PAD_X} ${yOf(first.v)}`, `L ${xOf(first.t)} ${yOf(first.v)}`];
  for (let i = 0; i + 1 < lane.points.length; i += 1) {
    pts.push(...segmentLineCommands({ lane, range, index: i, xOf, yOf }));
  }
  pts.push(`L ${PAD_X + widthPx} ${yOf(last.v)}`);
  return pts.join(" ");
}

/**
 * The visible path for one segment, without the lane's constant extensions.
 *
 * Used for the hover/drag affordance: only the segment under the pointer grows
 * heavier, rather than making the entire envelope look selected. It samples by
 * the same rule as `envelopePath`, so a curved or logarithmic segment's hover
 * stroke sits exactly on the line the audio model draws.
 */
export function envelopeSegmentPath(input: {
  lane: HfAutomationLane;
  range: AutomationRange;
  index: number;
  xOf(t: number): number;
  yOf(v: number): number;
}): string | null {
  const { lane, range, index, xOf, yOf } = input;
  const a = lane.points[index];
  const b = lane.points[index + 1];
  if (!a || !b) return null;
  const pts = [
    `M ${xOf(a.t)} ${yOf(a.v)}`,
    ...segmentLineCommands({ lane, range, index, xOf, yOf }),
  ];
  return pts.join(" ");
}

export function laneFor(automation: HfAutomation, target: string): HfAutomationLane {
  return automation.lanes.find((l) => l.target === target) ?? { target, points: [] };
}

/**
 * Replace one lane in place, dropping it when it has no points left.
 *
 * Order is preserved deliberately. A lane with no explicitly chosen parameter
 * shows whichever comes first, so moving the edited one to the end would switch
 * the lane out from under the pointer on the first edit.
 */
export function withLane(automation: HfAutomation, lane: HfAutomationLane): HfAutomation {
  const empty = lane.points.length === 0;
  const exists = automation.lanes.some((l) => l.target === lane.target);
  const lanes = automation.lanes
    .map((l) => (l.target === lane.target ? lane : l))
    .filter((l) => l.points.length > 0);
  if (!exists && !empty) lanes.push(lane);
  return { version: 1, lanes };
}
