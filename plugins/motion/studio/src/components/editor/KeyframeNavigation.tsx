import { useI18n } from "../../i18n/I18n";
import { memo } from "react";
import { KeyframeDiamond, type DiamondState } from "./KeyframeDiamond";

interface KeyframeNavigationProps {
  property: string;
  /** All keyframes for this element's tween, or null if no keyframes exist.
   *  `percentage` is clip-relative (element lifetime) for display/seek;
   *  `tweenPercentage` is the tween-relative value the writer/runtime key on. */
  keyframes: Array<{
    percentage: number;
    tweenPercentage?: number;
    properties: Record<string, number | string>;
    ease?: string;
    /** The tween that authored this keyframe, when the cache knows it. */
    animationId?: string;
  }> | null;
  /** Current playhead percentage within the element's lifetime (0-100) */
  currentPercentage: number;
  onSeek: (percentage: number) => void;
  onAddKeyframe: (percentage: number) => void;
  /** `animationId` is the clicked keyframe's OWN tween; see handleDiamondClick. */
  onRemoveKeyframe: (percentage: number, animationId?: string) => void;
  onConvertToKeyframes: () => void;
}

const TOLERANCE = 0.5;

interface NavigableKeyframe {
  percentage: number;
  tweenPercentage?: number;
  properties: Record<string, number | string>;
}

export function getKeyframeNavigationState<Keyframe extends NavigableKeyframe>(
  keyframes: readonly Keyframe[],
  currentPercentage: number,
  property?: string,
) {
  const propertyKeyframes = property
    ? keyframes.filter((keyframe) => property in keyframe.properties)
    : keyframes;
  return {
    propertyKeyframes,
    prevKeyframe:
      propertyKeyframes
        .filter((keyframe) => keyframe.percentage < currentPercentage - TOLERANCE)
        .at(-1) ?? null,
    nextKeyframe:
      propertyKeyframes.find((keyframe) => keyframe.percentage > currentPercentage + TOLERANCE) ??
      null,
    currentKeyframe:
      propertyKeyframes.find(
        (keyframe) => Math.abs(keyframe.percentage - currentPercentage) <= TOLERANCE,
      ) ?? null,
  };
}

/**
 * Convert a clip-relative percentage (element lifetime, used for display/seek) to
 * the TWEEN-relative percentage the GSAP writer/runtime key on. The clip→tween
 * map is linear, recovered from the keyframes' own (percentage, tweenPercentage)
 * pairs. Falls back to the input when there's no usable mapping (e.g. parser
 * keyframes that are already tween-relative, or fewer than two anchors).
 */
export function clipToTweenPercentage(
  keyframes: ReadonlyArray<{ percentage: number; tweenPercentage?: number }>,
  clipPct: number,
): number {
  const mapped = keyframes.filter((kf) => typeof kf.tweenPercentage === "number");
  if (mapped.length < 2) return clipPct;
  const a = mapped[0]!;
  const b = mapped[mapped.length - 1]!;
  if (b.percentage === a.percentage) return a.tweenPercentage!;
  const slope = (b.tweenPercentage! - a.tweenPercentage!) / (b.percentage - a.percentage);
  return a.tweenPercentage! + (clipPct - a.percentage) * slope;
}

function ArrowLeft({ disabled }: { disabled: boolean }) {
  return (
    <svg
      width="6"
      height="10"
      viewBox="0 0 6 10"
      fill="none"
      className={disabled ? "text-text-off" : "text-text-2"}
    >
      <path
        d="M5 1L1 5L5 9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowRight({ disabled }: { disabled: boolean }) {
  return (
    <svg
      width="6"
      height="10"
      viewBox="0 0 6 10"
      fill="none"
      className={disabled ? "text-text-off" : "text-text-2"}
    >
      <path
        d="M1 1L5 5L1 9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// fallow-ignore-next-line complexity
export const KeyframeNavigation = memo(function KeyframeNavigation({
  property,
  keyframes,
  currentPercentage,
  onSeek,
  onAddKeyframe,
  onRemoveKeyframe,
  onConvertToKeyframes,
}: KeyframeNavigationProps) {
  const { t } = useI18n();
  const {
    propertyKeyframes,
    prevKeyframe: prevKf,
    nextKeyframe: nextKf,
    currentKeyframe: atCurrent,
  } = getKeyframeNavigationState(keyframes ?? [], currentPercentage, property);

  // Diamond state
  let diamondState: DiamondState;
  if (!keyframes || keyframes.length === 0) {
    diamondState = "ghost";
  } else if (atCurrent) {
    diamondState = "active";
  } else if (propertyKeyframes.length > 0) {
    diamondState = "inactive";
  } else {
    diamondState = "ghost";
  }

  // Keyframe add/remove are keyed by TWEEN-relative percentage (what the GSAP
  // writer + runtime use), not the clip-relative `currentPercentage` used for
  // display/seek. Removing on an existing keyframe uses its own tweenPercentage;
  // adding converts the clip-relative playhead through the keyframes' own
  // clip→tween linear mapping. Passing clip-relative % made the mutation miss
  // every keyframe (off by the tween's offset/scale) → a silent no-op on disk
  // while the optimistic cache hid it, so the motion path never refreshed.
  const handleDiamondClick = () => {
    if (diamondState === "ghost") {
      onConvertToKeyframes();
    } else if (diamondState === "active" && atCurrent) {
      // Report the keyframe's OWN tween. A merged gutter row shows the keyframes
      // of every tween in the property group, so the caller's "the group's
      // animation" guess names the wrong tween whenever the clicked keyframe
      // belongs to a sibling — and the writer then finds no keyframe at that
      // percentage and silently does nothing.
      onRemoveKeyframe(atCurrent.tweenPercentage ?? atCurrent.percentage, atCurrent.animationId);
    } else {
      onAddKeyframe(clipToTweenPercentage(propertyKeyframes, currentPercentage));
    }
  };

  return (
    // The two 12x20 steppers sit gap-0.5 apart with a 9px diamond between them,
    // so they stay below the 24px WCAG 2.2 (2.5.8) minimum under that criterion's
    // own spacing/inline exception: centred 24px targets here would overlap each
    // other AND the diamond, and one control swallowing its neighbour's clicks is
    // a worse 2.5.8 failure than a small target. Do not "fix" these to 24.
    <div className="flex h-5 items-center gap-0.5">
      <button
        type="button"
        disabled={!prevKf}
        onClick={() => prevKf && onSeek(prevKf.percentage)}
        title={t("Previous keyframe")}
        aria-label={t("Previous {property} keyframe", { property: property })}
        className="relative flex h-5 w-3 items-center justify-center disabled:cursor-default before:absolute before:-inset-1.5 before:content-['']"
      >
        <ArrowLeft disabled={!prevKf} />
      </button>
      <KeyframeDiamond
        state={diamondState}
        onClick={handleDiamondClick}
        size={9}
        title={
          diamondState === "ghost"
            ? t("Convert {property} to keyframes", { property: property })
            : diamondState === "active"
              ? t("Remove {property} keyframe", { property: property })
              : t("Add {property} keyframe", { property: property })
        }
      />
      <button
        type="button"
        disabled={!nextKf}
        onClick={() => nextKf && onSeek(nextKf.percentage)}
        title={t("Next keyframe")}
        aria-label={t("Next {property} keyframe", { property: property })}
        className="relative flex h-5 w-3 items-center justify-center disabled:cursor-default before:absolute before:-inset-1.5 before:content-['']"
      >
        <ArrowRight disabled={!nextKf} />
      </button>
    </div>
  );
});
