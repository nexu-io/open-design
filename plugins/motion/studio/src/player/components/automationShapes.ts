/**
 * The utility shapes a video author reaches for: fade in, fade out, swell,
 * duck. One shape scaled to the selection — this is not a DAW, nobody needs a
 * tempo-synced LFO. Edge values come from the envelope itself so a shape
 * splices into whatever is already there; vertical maths runs in unit space so
 * a log knob (frequency) behaves like the lane that draws it.
 */
import {
  sampleAutomationLane,
  type AutomationRange,
  type HfAutomationLane,
  type HfAutomationPoint,
} from "@hyperframes/core/audio-automation";
import { fromUnit, toUnit } from "./automationLaneGeometry";

export type AutomationShapeId = "ramp-up" | "ramp-down" | "swell" | "dip";

export const AUTOMATION_SHAPES: ReadonlyArray<{ id: AutomationShapeId; label: string }> = [
  { id: "ramp-up", label: "Ramp up" },
  { id: "ramp-down", label: "Ramp down" },
  { id: "swell", label: "Swell" },
  { id: "dip", label: "Dip" },
];

/** Ease used on the segments entering/leaving a swell or dip midpoint. */
const SMOOTH = 0.4;
/** A dip ducks to this fraction of the edge value, in unit space. */
const DIP_FLOOR = 0.25;

function edgeValue(lane: HfAutomationLane, range: AutomationRange, t: number): number {
  if (lane.points.length === 0) return range.default ?? (range.min + range.max) / 2;
  return sampleAutomationLane(lane, t, range.scale);
}

export function generateShape(input: {
  shape: AutomationShapeId;
  lane: HfAutomationLane;
  range: AutomationRange;
  t0: number;
  t1: number;
}): HfAutomationPoint[] {
  const { shape, lane, range, t0, t1 } = input;
  const v0 = edgeValue(lane, range, t0);
  const v1 = edgeValue(lane, range, t1);
  const mid = (t0 + t1) / 2;
  switch (shape) {
    case "ramp-up":
      return [
        { t: t0, v: range.min },
        { t: t1, v: v1 },
      ];
    case "ramp-down":
      return [
        { t: t0, v: v0 },
        { t: t1, v: range.min },
      ];
    case "swell":
      return [
        { t: t0, v: v0, curve: SMOOTH },
        { t: mid, v: range.max, curve: -SMOOTH },
        { t: t1, v: v1 },
      ];
    case "dip":
      return [
        { t: t0, v: v0, curve: -SMOOTH },
        { t: mid, v: fromUnit(range, toUnit(range, v0) * DIP_FLOOR), curve: SMOOTH },
        { t: t1, v: v1 },
      ];
  }
}
