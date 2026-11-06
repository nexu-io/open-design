import type {
  GsapAnimation,
  GsapKeyframesData,
  SourcedGsapPercentageKeyframe,
} from "@hyperframes/core/gsap-parser";
import { PROPERTY_DEFAULTS } from "./gsapShared";

/**
 * A static position hold (only x/y, no real motion) is a `set`, not a keyframe —
 * it must not synthesize a diamond. Covers both `tl.set(...)` and the
 * `tl.to({ duration: 0, immediateRender: true })` hold that remove-all-keyframes
 * collapses to (otherwise shown as a stray 0% keyframe).
 *
 * Single owner: the collapsed keyframe cache and the expanded property lanes'
 * `gsapAnimations` map MUST agree on it, or a hold draws a phantom expanded lane
 * with no matching collapsed diamond.
 */
export function isStaticPositionHold(anim: GsapAnimation): boolean {
  if (anim.keyframes) return false;
  if (anim.method !== "set" && (anim.duration ?? 0) !== 0) return false;
  const propKeys = Object.keys(anim.properties).filter((k) => k !== "immediateRender");
  return propKeys.length > 0 && propKeys.every((k) => k === "x" || k === "y");
}

export interface AnimationKeyframeTarget {
  animationId: string;
  tweenPercentage: number;
}

function accumulateCollidingAnimationTargets(
  keyframe: AnimationKeyframeTarget & {
    collidingAnimationTargets?: AnimationKeyframeTarget[];
  },
  incoming: AnimationKeyframeTarget,
): void {
  const primaryId = keyframe.animationId;
  // One tween meeting itself is not a collision. Both identity fields are
  // required by the parameter types rather than guarded at runtime: a keyframe
  // that arrives without them cannot be attributed to a tween at all, and an
  // early return here would silently record no collision and let the inline
  // ease button edit an arbitrary one of the tweens that met at this
  // percentage. The compiler now refuses the incomplete keyframe instead.
  if (primaryId === incoming.animationId) return;
  const collisionTargets = keyframe.collidingAnimationTargets;
  if (collisionTargets?.some((target) => target.animationId === incoming.animationId)) return;
  keyframe.collidingAnimationTargets = [
    ...(collisionTargets === undefined || collisionTargets.length === 0
      ? [{ animationId: primaryId, tweenPercentage: keyframe.tweenPercentage }]
      : collisionTargets),
    { animationId: incoming.animationId, tweenPercentage: incoming.tweenPercentage },
  ];
}

/**
 * What a keyframe looks like once it has been attributed to its source tween
 * and is ready to be merged with the other tweens landing on the same row. The
 * runtime scan produces unattributed keyframes and they never reach a merge, so
 * they are deliberately not this type.
 */
export type MergeableKeyframe = SourcedGsapPercentageKeyframe & {
  propertyGroup?: string;
  collidingAnimationTargets?: AnimationKeyframeTarget[];
};

export function deduplicateKeyframes<T extends MergeableKeyframe>(keyframes: T[]): T[] {
  const byPct = new Map<number, T>();
  for (const kf of keyframes) {
    const existing = byPct.get(kf.percentage);
    if (existing) {
      existing.properties = { ...existing.properties, ...kf.properties };
      accumulateCollidingAnimationTargets(existing, kf);
      // Whichever tween iterated last used to win `ease`, so the merged keyframe
      // carried an arbitrary one of the colliding curves. Readers that show a
      // single curve (drag readouts, lane hints, the inline ease button) then
      // displayed one belonging to a different animation than the one an edit
      // targets. A collision means "no single ease", and dropping it is the only
      // honest answer; collidingAnimationTargets still names every tween there.
      if ((existing.collidingAnimationTargets?.length ?? 0) > 1) delete existing.ease;
      else if (kf.ease) existing.ease = kf.ease;
    } else {
      byPct.set(kf.percentage, { ...kf, properties: { ...kf.properties } });
    }
  }
  return Array.from(byPct.values()).sort((a, b) => a.percentage - b.percentage);
}

// fallow-ignore-next-line complexity
export function synthesizeFlatTweenKeyframes(anim: GsapAnimation): GsapKeyframesData | null {
  // Both parsers store extras as raw source text (`__raw:${code}`) so
  // non-editable config like `stagger: {...}` survives verbatim — a literal
  // `immediateRender: true` prints as exactly this string, not a boolean.
  const hasImmediateRenderHold = anim.extras?.immediateRender === "__raw:true";
  if (anim.method === "set" || (anim.duration === 0 && hasImmediateRenderHold)) {
    // A `set` — or a `to()`/`from()` collapsed to a zero-duration
    // immediateRender hold (what removeAllKeyframesFromScript collapses a
    // keyframed tween to) — is a STATIC HOLD: a value applied at one point,
    // not an animated keyframe. It must NOT synthesize a keyframe, or the
    // timeline + panel show a phantom diamond for a value that doesn't
    // animate. This aligns the AST path with the runtime scan, which already
    // skips every zero-duration set.
    return null;
  }
  const toProps = anim.properties;
  const fromProps = anim.fromProperties;
  if (!toProps || Object.keys(toProps).length === 0) return null;

  const rawStart: Record<string, number | string> = {};
  const rawEnd: Record<string, number | string> = {};

  if (anim.method === "from") {
    for (const [k, v] of Object.entries(toProps)) {
      rawStart[k] = v;
      rawEnd[k] = PROPERTY_DEFAULTS[k] ?? 0;
    }
  } else if (anim.method === "fromTo" && fromProps) {
    Object.assign(rawStart, fromProps);
    Object.assign(rawEnd, toProps);
  } else {
    for (const [k, v] of Object.entries(toProps)) {
      rawStart[k] = PROPERTY_DEFAULTS[k] ?? 0;
      rawEnd[k] = v;
    }
  }

  // Only numeric props are keyframe-interpolatable — a flat tween of a
  // non-numeric prop (e.g. backgroundColor: "#fff") can't be a 2-keyframe lane.
  const numericKeys = Object.keys(rawEnd).filter(
    (k) => typeof rawStart[k] === "number" && typeof rawEnd[k] === "number",
  );
  if (numericKeys.length === 0) return null;
  const startProps = Object.fromEntries(numericKeys.map((k) => [k, rawStart[k]]));
  const endProps = Object.fromEntries(numericKeys.map((k) => [k, rawEnd[k]]));

  return {
    format: "percentage",
    keyframes: [
      { percentage: 0, properties: startProps },
      // Segment ease lives on the destination keyframe (Figma/AE model) so the
      // lane + cache surface it; also kept data-level for useGsapTweenCache.
      { percentage: 100, properties: endProps, ...(anim.ease ? { ease: anim.ease } : {}) },
    ],
    ...(anim.ease ? { ease: anim.ease } : {}),
  };
}
