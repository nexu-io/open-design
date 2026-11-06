/**
 * commitWholePropertyOffset — extracted from gsapDragCommit.ts to keep file
 * sizes under the 600-line limit (mirrors gsapDragPositionCommit.ts).
 */
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { resolveTweenStart, resolveTweenDuration } from "../utils/globalTimeCompiler";
import { roundTo3 } from "../utils/rounding";
import { keyframeEases, PROPERTY_DEFAULTS } from "./gsapShared";
import { synthesizeFlatTweenKeyframes } from "./gsapTweenSynth";
import {
  materializeIfDynamic,
  refuseStepListRewrite,
  type GsapDragCommitCallbacks,
} from "./gsapDragCommit";

/**
 * Generic sibling of commitWholePathOffset for property groups other than
 * position (rotation, size, scale) — shift every keyframe of `anim` by the
 * same delta for each key in `newValues`, preserving the tween's shape. The
 * delta is computed against the keyframe NEAREST `currentPct` (the one an
 * ordinary edit would otherwise overwrite), not the live DOM: by the time a
 * drag gesture reaches its commit step, the preview has often already
 * gsap.set the dragged property to its new value, so the DOM can no longer
 * tell "old" from "new".
 */
export async function commitWholePropertyOffset(
  selection: DomEditSelection,
  anim: GsapAnimation,
  newValues: Record<string, number>,
  currentPct: number,
  iframe: HTMLIFrameElement | null,
  callbacks: GsapDragCommitCallbacks,
  label: string,
): Promise<void> {
  // fallow-ignore-next-line code-duplication
  let effectiveAnim = anim;
  if (anim.keyframes) {
    refuseStepListRewrite(anim);
    const newId = await materializeIfDynamic(anim, iframe, callbacks.commitMutation, selection);
    if (newId) effectiveAnim = { ...anim, id: newId };
  }

  const ts = resolveTweenStart(effectiveAnim);
  const td = resolveTweenDuration(effectiveAnim);
  const keys = Object.keys(newValues);
  const at = (props: Record<string, number | string>, key: string) =>
    typeof props[key] === "number" ? (props[key] as number) : (PROPERTY_DEFAULTS[key] ?? 0);

  const kfs =
    effectiveAnim.keyframes?.keyframes ?? synthesizeFlatTweenKeyframes(effectiveAnim)?.keyframes;
  if (!kfs || kfs.length === 0) {
    // A `to()`/`from()` collapsed to a zero-duration immediateRender hold (what
    // removeAllKeyframesFromScript leaves behind) has no shape to preserve —
    // just persist the flat value instead of replacing with an empty keyframe list.
    await callbacks.commitMutation(
      selection,
      { type: "update-properties", animationId: effectiveAnim.id, properties: newValues },
      { label, softReload: true },
    );
    return;
  }
  const nearest = kfs.reduce((best, kf) =>
    Math.abs(kf.percentage - currentPct) < Math.abs(best.percentage - currentPct) ? kf : best,
  );

  const shifted = kfs.map((kf) => {
    const properties = { ...kf.properties };
    for (const key of keys) {
      properties[key] = roundTo3(
        at(properties, key) + (newValues[key]! - at(nearest.properties, key)),
      );
    }
    return { percentage: kf.percentage, properties, ...(kf.ease ? { ease: kf.ease } : {}) };
  });

  await callbacks.commitMutation(
    selection,
    {
      type: "replace-with-keyframes",
      animationId: effectiveAnim.id,
      targetSelector: effectiveAnim.targetSelector,
      position: roundTo3(ts ?? 0),
      duration: roundTo3(td || 1),
      keyframes: shifted,
      ...keyframeEases(effectiveAnim),
    },
    { label, softReload: true },
  );
}
