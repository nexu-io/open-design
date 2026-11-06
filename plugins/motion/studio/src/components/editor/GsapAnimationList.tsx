import { useI18n } from "../../i18n/I18n";
import { useCallback, useState } from "react";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { useShallow } from "zustand/react/shallow";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { usePlayerStore } from "../../player";
import { isFocusedEaseRequestCurrent } from "../../player/store/keyframeSlice";
import { AnimationCard } from "./AnimationCard";
import { GsapAddAnimationControl } from "./GsapAddAnimationControl";
import {
  type GsapAnimationEditCallbacks,
  withTrackedGsapAnimationCallbacks,
} from "./gsapAnimationCallbacks";

interface GsapAnimationListProps extends GsapAnimationEditCallbacks {
  elementId: string;
  animations: GsapAnimation[];
  onAddAnimation: (method: "to" | "from" | "set" | "fromTo") => void;
  variant: "classic" | "flat";
}

/** Shared animation cards, telemetry, and timeline-ease focus ownership for both inspectors. */
export function GsapAnimationList({
  elementId,
  animations,
  onAddAnimation,
  variant,
  ...callbacks
}: GsapAnimationListProps) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const trackedCallbacks = withTrackedGsapAnimationCallbacks(callbacks, track);
  const { focusedEaseSegment, timelineProjectId, timelineSessionEpoch, selectedElementId } =
    usePlayerStore(
      useShallow((state) => ({
        focusedEaseSegment: state.focusedEaseSegment,
        timelineProjectId: state.timelineProjectId,
        timelineSessionEpoch: state.timelineSessionEpoch,
        selectedElementId: state.selectedElementId,
      })),
    );
  const focusedHere =
    focusedEaseSegment &&
    focusedEaseSegment.elementId === elementId &&
    isFocusedEaseRequestCurrent(focusedEaseSegment, {
      timelineProjectId,
      timelineSessionEpoch,
      selectedElementId,
    }) &&
    animations.some((animation) => animation.id === focusedEaseSegment.animationId)
      ? focusedEaseSegment
      : null;
  // Stable while the request is unchanged: AnimationCard includes this callback
  // in its focus-effect deps, and a fresh closure would replay that effect on
  // unrelated inspector renders. Reading the action lazily also avoids a store
  // subscription for a function whose identity never changes.
  const consumeFocusedEaseSegment = useCallback(() => {
    if (focusedHere) {
      usePlayerStore.getState().clearFocusedEaseSegment(focusedHere.nonce);
    }
  }, [focusedHere]);

  return (
    <div className="space-y-2">
      {animations.length === 0 && (
        <p className="text-[11px] leading-4 text-neutral-500">
          {t("No animations on this element yet. Add an effect below to animate it.")}</p>
      )}
      {animations.map((animation, index) => (
        <AnimationCard
          {...trackedCallbacks}
          key={animation.id}
          animation={animation}
          defaultExpanded={index === 0}
          flat={variant === "flat"}
          focusedSegment={focusedHere?.animationId === animation.id ? focusedHere : null}
          onFocusSegmentConsumed={consumeFocusedEaseSegment}
        />
      ))}
      <GsapAddAnimationControl
        open={addMenuOpen}
        setOpen={setAddMenuOpen}
        onAddAnimation={onAddAnimation}
        track={track}
        variant={variant}
      />
    </div>
  );
}
