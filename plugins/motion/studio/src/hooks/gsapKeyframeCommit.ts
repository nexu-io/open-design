import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { absoluteToPercentageForAnimation, findTweenAtTime } from "../utils/globalTimeCompiler";
import { PROPERTY_DEFAULTS, selectorFromSelection, writeTargetSelector } from "./gsapShared";
import { roundToCenti } from "../utils/rounding";

import type { CommitMutation } from "./gsapScriptCommitTypes";

export async function commitKeyframeAtTimeImpl(
  selection: DomEditSelection,
  absoluteTime: number,
  animations: GsapAnimation[],
  properties: Record<string, number | string>,
  commitMutation: CommitMutation,
): Promise<void> {
  // Matching an authored tween is a string compare against what the author
  // wrote, so it keeps using the selection's own selector; the NEW tween below
  // is authored with the one-element form instead.
  const selector = selectorFromSelection(selection);
  if (!selector) return;

  const tween = findTweenAtTime(absoluteTime, animations, selector);
  if (tween) {
    const pct = absoluteToPercentageForAnimation(absoluteTime, tween);
    if (pct === null) return;

    const hasExplicitKeyframes = !!tween.keyframes && tween.keyframes.keyframes.length > 0;
    if (!hasExplicitKeyframes) {
      await commitMutation(
        selection,
        { type: "convert-to-keyframes", animationId: tween.id },
        { label: "Convert to keyframes", keyframeTelemetry: false, skipReload: true },
      );
    }

    const backfillDefaults: Record<string, number | string> = {};
    for (const key of Object.keys(properties)) {
      backfillDefaults[key] = PROPERTY_DEFAULTS[key] ?? 0;
    }

    await commitMutation(
      selection,
      {
        type: "add-keyframe",
        animationId: tween.id,
        percentage: pct,
        properties,
        backfillDefaults,
      },
      {
        label: `Add keyframe at ${roundToCenti(absoluteTime)}s`,
        coalesceKey: `keyframe:${tween.id}:${pct}`,
        softReload: true,
      },
    );
  } else {
    // Null means the live DOM could not prove any one-element form. Falling
    // back to the author's own selector would write the group-collapsing
    // target this narrowing exists to prevent, so the keyframe is dropped
    // instead (see writeTargetSelector).
    const target = writeTargetSelector(selection);
    if (!target) return;
    const defaultDuration = 0.5;
    await commitMutation(
      selection,
      {
        type: "add-with-keyframes" as const,
        targetSelector: target,
        position: absoluteTime,
        duration: defaultDuration,
        keyframes: [
          { percentage: 0, properties },
          { percentage: 100, properties },
        ],
      },
      {
        label: `New animation at ${roundToCenti(absoluteTime)}s`,
        softReload: true,
      },
    );
  }
}
