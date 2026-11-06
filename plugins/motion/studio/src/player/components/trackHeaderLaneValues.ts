/**
 * Sampling and formatting for the property-lane readouts in the track header:
 * what value a property holds at a given tween percentage, and how that value
 * reads to a human. Kept apart from the header's JSX so a formatting change and
 * a layout change never touch the same file.
 */
import {
  classifyPropertyGroup,
  type GsapAnimation,
  type PropertyGroupName,
} from "@hyperframes/core/gsap-parser";
import { PROPERTY_DEFAULTS } from "../../hooks/gsapShared";
import { resolveTweenDuration, resolveTweenStart } from "../../utils/globalTimeCompiler";
import { easeFunction, keyframedTweenEases } from "../../utils/gsapKeyframeEases";

export type LaneValues = Record<string, number | string>;

function roundValue(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function easedProgress(progress: number, animation: GsapAnimation, ease?: string): number {
  return easeFunction(keyframedTweenEases(animation).segment({ ease }))?.(progress) ?? progress;
}

interface PropertyStop {
  percentage: number;
  value: number | string;
  ease?: string;
}

/** Before its first keyframe a tween animates from the value it starts at (`start`), or the
 *  property's base value as for a flat tween (synthesizeFlatTweenKeyframes). */
function propertyStops(
  animation: GsapAnimation,
  property: string,
  start?: number | string,
): PropertyStop[] {
  const stops = (animation.keyframes?.keyframes ?? [])
    .filter((keyframe) => property in keyframe.properties)
    .map((keyframe) => ({
      percentage: keyframe.percentage,
      value: keyframe.properties[property],
      ease: keyframe.ease,
    }));
  const first = stops[0];
  if (!first || first.percentage <= 0 || typeof first.value !== "number") return stops;
  return [{ percentage: 0, value: start ?? PROPERTY_DEFAULTS[property] ?? 0 }, ...stops];
}

/** A pair only interpolates when both ends are numeric and actually span time;
 *  string values (colors, keywords) and zero-width pairs hold the earlier value.
 *  Returns the numeric ends so the caller needs no cast to use them. */
function interpolableEnds(
  before: PropertyStop,
  after: PropertyStop,
): { from: number; to: number } | null {
  if (typeof before.value !== "number" || typeof after.value !== "number") return null;
  if (before.percentage === after.percentage) return null;
  return { from: before.value, to: after.value };
}

function propertyValueAt(
  animation: GsapAnimation,
  property: string,
  tweenPercentage: number,
  start?: number | string,
): number | string | undefined {
  const stops = propertyStops(animation, property, start);
  const before = stops.filter((stop) => stop.percentage <= tweenPercentage).at(-1);
  const after = stops.find((stop) => stop.percentage >= tweenPercentage);
  if (!before) return after?.value;
  if (!after) return before.value;
  const ends = interpolableEnds(before, after);
  if (!ends) return before.value;
  const progress = (tweenPercentage - before.percentage) / (after.percentage - before.percentage);
  return ends.from + (ends.to - ends.from) * easedProgress(progress, animation, after.ease);
}

/** Every property of `group` this animation touches, sampled at `tweenPercentage`. */
export function valuesAt(
  animation: GsapAnimation,
  group: PropertyGroupName,
  tweenPercentage: number,
  startValues: LaneValues = {},
): LaneValues {
  const propertyNames = new Set<string>();
  for (const keyframe of animation.keyframes?.keyframes ?? []) {
    for (const property of Object.keys(keyframe.properties)) {
      if (classifyPropertyGroup(property) === group) propertyNames.add(property);
    }
  }
  const values: LaneValues = {};
  for (const property of propertyNames) {
    const value = propertyValueAt(animation, property, tweenPercentage, startValues[property]);
    if (value !== undefined) values[property] = value;
  }
  return values;
}

const endValue = (animation: GsapAnimation, property: string) =>
  animation.keyframes?.keyframes.findLast((keyframe) => property in keyframe.properties)
    ?.properties[property] ?? animation.properties[property];

/** Each property's value as `animation` starts: the end of the last tween done writing it by then. */
export function valuesBefore(
  animation: GsapAnimation,
  animations: readonly GsapAnimation[],
): LaneValues {
  const start = resolveTweenStart(animation);
  if (start == null) return {};
  const endOf = (other: GsapAnimation) =>
    (resolveTweenStart(other) ?? Infinity) +
    (other.method === "set" ? 0 : resolveTweenDuration(other));
  const index = animations.indexOf(animation);
  const finished = animations
    .filter((other, i) => {
      if (other.method === "from" || i === index) return false;
      return endOf(other) < start || (endOf(other) === start && i < index);
    })
    .sort((a, b) => endOf(a) - endOf(b));
  const values: LaneValues = {};
  for (const other of finished) {
    const keyframes = other.keyframes?.keyframes ?? [{ properties: other.properties }];
    for (const property of new Set(
      keyframes.flatMap((keyframe) => Object.keys(keyframe.properties)),
    )) {
      const value = endValue(other, property);
      if (typeof value === "number") values[property] = value;
      else delete values[property];
    }
  }
  return values;
}

export function groupLabel(group: PropertyGroupName, properties: LaneValues): string {
  if (group === "visual" && ("opacity" in properties || "autoAlpha" in properties)) {
    return "Opacity";
  }
  if (group !== "other") return `${group[0]?.toUpperCase() ?? ""}${group.slice(1)}`;
  const property = Object.keys(properties)[0];
  return property ? `${property[0]?.toUpperCase() ?? ""}${property.slice(1)}` : "Other";
}

function defaultValueReadout(values: LaneValues): string {
  return Object.values(values)
    .map((value) => (typeof value === "number" ? roundValue(value) : value))
    .join(", ");
}

function positionValueReadout(values: LaneValues): string | null {
  const x = values.x;
  const y = values.y;
  return typeof x === "number" && typeof y === "number"
    ? `${roundValue(x)}, ${roundValue(y)}`
    : null;
}

function rotationValueReadout(values: LaneValues): string | null {
  return typeof values.rotation === "number" ? `${roundValue(values.rotation)}°` : null;
}

function visualValueReadout(values: LaneValues): string | null {
  const opacity = values.opacity ?? values.autoAlpha;
  return typeof opacity === "number"
    ? `${roundValue(Math.abs(opacity) <= 1 ? opacity * 100 : opacity)}%`
    : null;
}

const GROUP_VALUE_READOUTS: Partial<
  Record<PropertyGroupName, (values: LaneValues) => string | null>
> = {
  position: positionValueReadout,
  rotation: rotationValueReadout,
  visual: visualValueReadout,
};

export function valueReadout(group: PropertyGroupName, values: LaneValues): string {
  return GROUP_VALUE_READOUTS[group]?.(values) ?? defaultValueReadout(values);
}
