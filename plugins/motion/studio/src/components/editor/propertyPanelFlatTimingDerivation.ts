import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "./domEditingTypes";

/**
 * The single source of truth for an element's clip start/duration in the flat
 * inspector. Both the Motion group's Timing row (`FlatTimingRow`) and the
 * Layout group's keyframe gutter (fed via `elStart`/`elDuration` from
 * `PropertyPanel.tsx` through `PropertyPanelFlat.tsx`) must derive this the
 * same way — otherwise a keyframe-percentage seek in Layout lands on a
 * different absolute time than the range Motion displays for the same
 * element (found by the Plan 3a+3b whole-plan coherence review).
 *
 * Precedence: an explicit `data-duration` (or `data-hf-authored-duration`)
 * wins outright. Only when neither is present do we infer the range from the
 * element's own GSAP tweens (earliest tween start → latest tween end).
 *
 * Scoped to the FLAT inspector only — the legacy (non-flat) panel keeps its
 * own, unrelated `elStart`/`elDuration ?? 1` computation in `PropertyPanel.tsx`
 * untouched.
 */
export interface ElementTiming {
  start: number;
  duration: number;
  /** True when duration/start came from `deriveTimingFromAnimations`, not an authored attribute. */
  inferred: boolean;
}

function deriveTimingFromAnimations(
  animations: GsapAnimation[],
): { start: number; duration: number } | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const a of animations) {
    const s = a.resolvedStart ?? (typeof a.position === "number" ? a.position : 0);
    const d = a.duration ?? 0;
    lo = Math.min(lo, s);
    hi = Math.max(hi, s + d);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;
  return { start: lo, duration: hi - lo };
}

export function deriveElementTiming(
  element: Pick<DomEditSelection, "dataAttributes">,
  animations: GsapAnimation[] = [],
): ElementTiming {
  const explicitStart = Number.parseFloat(element.dataAttributes.start ?? "0") || 0;
  const explicitDuration =
    Number.parseFloat(
      element.dataAttributes.duration ?? element.dataAttributes["hf-authored-duration"] ?? "0",
    ) || 0;

  const derived = explicitDuration > 0 ? null : deriveTimingFromAnimations(animations);
  return {
    start: derived ? derived.start : explicitStart,
    duration: derived ? derived.duration : explicitDuration,
    inferred: derived !== null,
  };
}
