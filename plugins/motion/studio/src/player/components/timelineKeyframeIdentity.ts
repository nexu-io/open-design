import type { AnimationKeyframeTarget } from "../../hooks/gsapTweenSynth";

export interface TimelineKeyframeTarget {
  percentage: number;
  tweenPercentage?: number;
  propertyGroup?: string;
  animationId?: string;
  collidingAnimationTargets?: AnimationKeyframeTarget[];
}

/**
 * Note the asymmetry: `tweenPercentage` is optional here and defaults to
 * `percentage`, but the reader treats both slots as authoritative. Callers must
 * therefore keep the pair consistent — writing a new `tweenPercentage` without
 * the matching `percentage` hashes two logically-equal selections to different
 * keys.
 */
export function timelineKeyframeSelectionKey(
  elementId: string,
  target: TimelineKeyframeTarget,
): string {
  if (!target.propertyGroup) return `${elementId}:${target.percentage}`;
  return JSON.stringify([
    elementId,
    target.propertyGroup,
    target.animationId ?? "",
    target.percentage,
    target.tweenPercentage ?? target.percentage,
  ]);
}

export function timelineKeyframeTargetFromSelectionKey(
  elementId: string,
  key: string,
): TimelineKeyframeTarget | null {
  if (key.startsWith("[")) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(key);
    } catch {
      return null;
    }
    if (!Array.isArray(decoded) || decoded.length !== 5) return null;
    const [selectedElementId, propertyGroup, animationId, percentage, tweenPercentage] = decoded;
    if (
      selectedElementId !== elementId ||
      typeof propertyGroup !== "string" ||
      propertyGroup.length === 0 ||
      typeof animationId !== "string" ||
      typeof percentage !== "number" ||
      !Number.isFinite(percentage) ||
      typeof tweenPercentage !== "number" ||
      !Number.isFinite(tweenPercentage)
    ) {
      return null;
    }
    return {
      propertyGroup,
      animationId: animationId || undefined,
      percentage,
      tweenPercentage,
    };
  }

  const separator = key.lastIndexOf(":");
  if (separator < 0 || key.slice(0, separator) !== elementId) return null;
  const percentage = Number(key.slice(separator + 1));
  return Number.isFinite(percentage) ? { percentage } : null;
}
