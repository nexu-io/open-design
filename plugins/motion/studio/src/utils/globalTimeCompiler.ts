import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { GSAP_DEFAULT_DURATION } from "@hyperframes/parsers/gsap-parser";
import { progressAtTime, runEaseOf, timeAtProgress } from "./gsapKeyframeEases";

export function absoluteToPercentage(
  time: number,
  tweenStart: number,
  tweenDuration: number,
): number {
  if (tweenDuration <= 0) return 0;
  const raw = ((time - tweenStart) / tweenDuration) * 100;
  return Math.max(0, Math.min(100, Math.round(raw * 1000) / 1000));
}

export function percentageToAbsolute(
  pct: number,
  tweenStart: number,
  tweenDuration: number,
): number {
  return tweenStart + (pct / 100) * tweenDuration;
}

export function isTimeWithinTween(
  time: number,
  tweenStart: number,
  tweenDuration: number,
): boolean {
  return time >= tweenStart && time <= tweenStart + tweenDuration;
}

export function resolveTweenStart(animation: GsapAnimation): number | null {
  if (animation.resolvedStart != null) return animation.resolvedStart;
  if (typeof animation.position === "number") return animation.position;
  const parsed = Number.parseFloat(animation.position as string);
  if (!Number.isNaN(parsed)) return parsed;
  return null;
}

export function resolveTweenDuration(animation: GsapAnimation): number {
  return animation.duration ?? GSAP_DEFAULT_DURATION;
}

export function findTweenAtTime(
  time: number,
  animations: GsapAnimation[],
  selector: string,
): GsapAnimation | null {
  for (const anim of animations) {
    if (!matchesSelector(anim.targetSelector, selector)) continue;
    const start = resolveTweenStart(anim);
    if (start === null) continue;
    const duration = resolveTweenDuration(anim);
    if (isTimeWithinTween(time, start, duration)) return anim;
  }
  return null;
}

export function absoluteToPercentageForAnimation(
  time: number,
  animation: GsapAnimation,
): number | null {
  const start = resolveTweenStart(animation);
  if (start === null) return null;
  const duration = resolveTweenDuration(animation);
  return progressAtTime(runEaseOf(animation), absoluteToPercentage(time, start, duration));
}

export function percentageToAbsoluteForAnimation(
  pct: number,
  animation: GsapAnimation,
): number | null {
  const start = resolveTweenStart(animation);
  if (start === null) return null;
  const duration = resolveTweenDuration(animation);
  return percentageToAbsolute(timeAtProgress(runEaseOf(animation), pct), start, duration);
}

function matchesSelector(tweenSelector: string, querySelector: string): boolean {
  return tweenSelector.split(",").some((part) => part.trim() === querySelector);
}
