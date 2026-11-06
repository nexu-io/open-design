import type { ArcPathSegment } from "@hyperframes/parsers/gsap-parser";
import type { AnimationKeyframeTarget } from "../../hooks/gsapTweenSynth";

/**
 * Edit callbacks shared by GsapAnimationSection and each AnimationCard it
 * renders. Extracted so the two prop interfaces don't duplicate the (large)
 * signatures the section forwards straight through to the card.
 */
export interface GsapAnimationEditCallbacks {
  onUpdateProperty: (animationId: string, property: string, value: number | string) => void;
  onUpdateMeta: (
    animationId: string,
    updates: { duration?: number; ease?: string; position?: number },
  ) => void;
  onDeleteAnimation: (animationId: string) => void;
  onAddProperty: (animationId: string, property: string) => void;
  onRemoveProperty: (animationId: string, property: string) => void;
  onUpdateFromProperty?: (animationId: string, property: string, value: number | string) => void;
  onAddFromProperty?: (animationId: string, property: string) => void;
  onRemoveFromProperty?: (animationId: string, property: string) => void;
  onLivePreview?: (property: string, value: number | string) => void;
  onLivePreviewEnd?: () => void;
  onSetArcPath?: (
    animationId: string,
    config: { enabled: boolean; autoRotate?: boolean | number; segments?: ArcPathSegment[] },
  ) => void;
  onUpdateArcSegment?: (
    animationId: string,
    segmentIndex: number,
    update: Partial<ArcPathSegment>,
  ) => void;
  onUpdateKeyframeEase?: (animationId: string, percentage: number, ease: string) => void;
  onUpdateSegmentEase?: (targets: AnimationKeyframeTarget[], ease: string) => void;
  /** Apply one ease to every keyframe segment at once (clears per-segment overrides). */
  onSetAllKeyframeEases?: (animationId: string, ease: string) => void;
  /** Unroll a computed (helper/loop) tween into literal tweens so it edits directly. */
  onUnroll?: (animationId: string) => void;
}

type TrackDesignInput = (control: string, name: string) => void;

function trackAnimationProperty(track: TrackDesignInput, property: string): void {
  const control =
    property === "visibility"
      ? "toggle"
      : property === "filter" || property === "clipPath"
        ? "text"
        : "metric";
  track(control, property);
}

// User-facing control label for each animation-meta field. The ease control is
// labelled "Speed" in the card UI, so ease/easeEach map there.
const ANIMATION_META_LABELS: Record<string, { control: string; name: string }> = {
  duration: { control: "metric", name: "Length" },
  position: { control: "metric", name: "Starts at" },
  ease: { control: "select", name: "Speed" },
  easeEach: { control: "select", name: "Speed" },
};

/**
 * Emit design-input telemetry for an `onUpdateMeta` payload, attributing each
 * changed field to the control the user actually touched. Iterates the real keys
 * present rather than falling through to a single placeholder — so a meta field
 * added later is attributed honestly by its own key instead of poisoning another
 * control's usage count.
 */
function trackAnimationMetaUpdate(track: TrackDesignInput, updates: Record<string, unknown>): void {
  for (const key of Object.keys(updates)) {
    const mapped = ANIMATION_META_LABELS[key];
    if (mapped) track(mapped.control, mapped.name);
    else track("select", key);
  }
}

/**
 * Add design-input telemetry to the shared animation-edit callback surface.
 * Optional callbacks remain absent, pass-through preview callbacks keep their
 * original identity, and every tracked event fires once before its mutation.
 */
export function withTrackedGsapAnimationCallbacks(
  callbacks: GsapAnimationEditCallbacks,
  track: TrackDesignInput,
): GsapAnimationEditCallbacks {
  return {
    onUpdateProperty: (animationId, property, value) => {
      trackAnimationProperty(track, property);
      callbacks.onUpdateProperty(animationId, property, value);
    },
    onUpdateMeta: (animationId, updates) => {
      trackAnimationMetaUpdate(track, updates);
      callbacks.onUpdateMeta(animationId, updates);
    },
    onDeleteAnimation: (animationId) => {
      track("button", "Remove animation");
      callbacks.onDeleteAnimation(animationId);
    },
    onAddProperty: (animationId, property) => {
      track("select", "Add effect property");
      callbacks.onAddProperty(animationId, property);
    },
    onRemoveProperty: (animationId, property) => {
      track("button", `Remove ${property}`);
      callbacks.onRemoveProperty(animationId, property);
    },
    onUpdateFromProperty: callbacks.onUpdateFromProperty
      ? (animationId, property, value) => {
          trackAnimationProperty(track, property);
          callbacks.onUpdateFromProperty?.(animationId, property, value);
        }
      : undefined,
    onAddFromProperty: callbacks.onAddFromProperty
      ? (animationId, property) => {
          track("select", "Add from property");
          callbacks.onAddFromProperty?.(animationId, property);
        }
      : undefined,
    onRemoveFromProperty: callbacks.onRemoveFromProperty
      ? (animationId, property) => {
          track("button", `Remove from ${property}`);
          callbacks.onRemoveFromProperty?.(animationId, property);
        }
      : undefined,
    onLivePreview: callbacks.onLivePreview,
    onLivePreviewEnd: callbacks.onLivePreviewEnd,
    onUpdateSegmentEase: callbacks.onUpdateSegmentEase
      ? (targets, ease) => {
          track("select", "Segment ease");
          callbacks.onUpdateSegmentEase?.(targets, ease);
        }
      : undefined,
    onSetArcPath: callbacks.onSetArcPath
      ? (animationId, config) => {
          track("toggle", config.autoRotate !== undefined ? "Auto rotate" : "Arc motion");
          callbacks.onSetArcPath?.(animationId, config);
        }
      : undefined,
    onUpdateArcSegment: callbacks.onUpdateArcSegment
      ? (animationId, segmentIndex, update) => {
          if (update.curviness === undefined) {
            track("button", `Reset arc segment ${segmentIndex + 1}`);
          }
          callbacks.onUpdateArcSegment?.(animationId, segmentIndex, update);
        }
      : undefined,
    onUpdateKeyframeEase: callbacks.onUpdateKeyframeEase
      ? (animationId, percentage, ease) => {
          track("select", "Keyframe ease");
          callbacks.onUpdateKeyframeEase?.(animationId, percentage, ease);
        }
      : undefined,
    onSetAllKeyframeEases: callbacks.onSetAllKeyframeEases
      ? (animationId, ease) => {
          track("select", "All keyframe eases");
          callbacks.onSetAllKeyframeEases?.(animationId, ease);
        }
      : undefined,
    onUnroll: callbacks.onUnroll
      ? (animationId) => {
          track("button", "Unroll animation");
          callbacks.onUnroll?.(animationId);
        }
      : undefined,
  };
}
