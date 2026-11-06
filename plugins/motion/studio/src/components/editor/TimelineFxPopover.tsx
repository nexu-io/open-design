import { useI18n } from "../../i18n/I18n";
/**
 * The FX popover the timeline's per-track/per-group FX button opens (C1).
 *
 * A THIN positioner around existing pieces, not a second rack: the body is
 * `FxPresetMenu` exactly as the property panel's FX section renders it, and
 * applying or auditioning a preset goes through the caller's own write path
 * (a group's own attribute for a group target, the selected element's for a
 * clip) — nothing here serializes a chain of its own.
 */

import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import type { HfAudioFxChain } from "@hyperframes/core/audio-fx";
import type { HfAudioNameKind } from "@hyperframes/core/audio-carve";
import { applyAudioFxPreset, getAudioFxPreset } from "@hyperframes/core/audio-fx-presets";
import { FxPresetMenu } from "./propertyPanelFxPresetMenu.js";
import { applyPresetToChain } from "./useApplyAudioFxPreset.js";
import { useFxAudition } from "./useFxAudition.js";
import { trackPresetAuditioned } from "./audioFxTelemetry.js";

const POPOVER_WIDTH = 260;
const VIEWPORT_MARGIN = 8;
/** Below this the popover is useless anyway; it scrolls instead of vanishing. */
const MIN_POPOVER_HEIGHT = 160;

function clampedStyle(anchorRect: DOMRect): CSSProperties {
  const left = Math.min(
    Math.max(anchorRect.left, VIEWPORT_MARGIN),
    Math.max(VIEWPORT_MARGIN, window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN),
  );
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  // Named, because the height cap below needs the same quantity the flip does.
  // (`spaceAbove === anchorRect.top` for a viewport-relative rect, so the flip
  // condition itself is unchanged — this is a rename, not a behaviour fix.)
  const spaceAbove = anchorRect.top;
  const openUpward = spaceBelow < 260 && spaceAbove > spaceBelow;
  // Flipping direction alone is not enough: the preset list is taller than either
  // gap on a short window, so the popover ran off the top or the bottom and its
  // footer ("+ effect" / "Open rack") went with it. Cap to whatever the chosen
  // side actually has and let the list scroll inside that.
  const available = (openUpward ? spaceAbove : spaceBelow) - VIEWPORT_MARGIN - 4;
  // The minimum is a floor against a tight GAP, not against a tight window: keep
  // a usable list when the gap is smaller than 160px, but never ask for more
  // height than the viewport itself can hold.
  const height = Math.min(
    Math.max(MIN_POPOVER_HEIGHT, available),
    window.innerHeight - VIEWPORT_MARGIN * 2,
  );
  // A floor larger than the gap would hang the box off the edge it opened away
  // from — reachable at high browser zoom, where both gaps fall under ~172px.
  // Slide it back in-bounds the way `left` is already clamped, rather than
  // shrinking below the floor: the offset that keeps BOTH edges inside is
  // `innerHeight - height - VIEWPORT_MARGIN`, from either side.
  const inset = (desired: number) =>
    Math.max(
      VIEWPORT_MARGIN,
      Math.min(desired, Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN)),
    );
  return {
    position: "fixed",
    left,
    width: POPOVER_WIDTH,
    maxHeight: height,
    ...(openUpward
      ? { bottom: inset(window.innerHeight - anchorRect.top + 4) }
      : { top: inset(anchorRect.bottom + 4) }),
  };
}

export interface TimelineFxPopoverProps {
  anchorRect: DOMRect;
  chain: HfAudioFxChain;
  trackKind?: HfAudioNameKind;
  onClose: () => void;
  /** Persist the applied preset onto the target (group attribute, or the
   *  selected clip's attribute — the caller resolves which). */
  onChainChange: (next: HfAudioFxChain) => void;
  /** Preview a hypothetical chain on the running graph without persisting. */
  onChainPreview?: (next: HfAudioFxChain, ended?: boolean) => void;
  onAuditionTransport?: (on: boolean) => void;
  /** Select the target the way clicking it in the timeline does, and ensure
   *  the property panel's Audio FX group is expanded. */
  onOpenRack: () => void;
}

/** A preset applied for AUDITION only: no telemetry, since nothing was chosen.
 *  `applyPresetToChain` is the tracked path and belongs to `onPick`. */
function auditionPresetChain(base: HfAudioFxChain, presetId: string): HfAudioFxChain {
  const preset = getAudioFxPreset(presetId);
  return preset ? applyAudioFxPreset(base, preset) : base;
}

export function TimelineFxPopover({
  anchorRect,
  chain,
  trackKind,
  onClose,
  onChainChange,
  onChainPreview,
  onAuditionTransport,
  onOpenRack,
}: TimelineFxPopoverProps) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { audition, clearAudition, storedChain } = useFxAudition(
    chain,
    onChainPreview,
    onAuditionTransport,
  );

  // Outside click dismisses like any other popover; the button itself is
  // excluded by pointerdown timing (the button's own click hasn't happened yet).
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [onClose]);

  const applyPreset = (id: string) => {
    // The stored chain, not the auditioned one — see `storedChain`.
    const next = applyPresetToChain(storedChain(), id, trackKind);
    if (!next) return;
    clearAudition();
    onChainChange(next);
    onClose();
  };

  // Escape closes without deselecting whatever is behind this — a keystroke
  // aimed at the popover is not aimed at the clip under it.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    audition(null);
    onClose();
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={t("Effects")}
      className="z-200 flex flex-col overflow-hidden rounded-md border border-border bg-raised p-2 shadow-xl"
      style={clampedStyle(anchorRect)}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {/* The list scrolls; the footer below stays put. `min-h-0` is load-bearing
          — a flex child defaults to min-height:auto and would refuse to shrink,
          pushing the footer out of the popover instead of scrolling. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FxPresetMenu
          trackKind={trackKind}
          onPick={applyPreset}
          // The RAW apply, not `applyPresetToChain` — that helper fires
          // `trackPresetApplied` on every call, so auditioning a 12-preset shelf
          // by hover or arrow key emitted 12 `preset_applied` events and the
          // numbers could not tell an audition from a decision. `FxSection`
          // makes exactly this split, with `onAuditionTracked` carrying the
          // honest event.
          onAudition={
            onChainPreview
              ? (id) => audition(id ? (base) => auditionPresetChain(base, id) : null)
              : undefined
          }
          onAuditionTracked={(id) => trackPresetAuditioned(id, { trackKind })}
        />
      </div>
      <div className="mt-2 flex shrink-0 items-center justify-between border-t border-border pt-2 text-[10px] text-text-muted">
        <button
          type="button"
          className="hover:text-text-0"
          onClick={() => {
            onClose();
            onOpenRack();
          }}
        >
          {t("+ effect")}</button>
        <button
          type="button"
          className="hover:text-text-0"
          onClick={() => {
            onClose();
            onOpenRack();
          }}
        >
          {t("Open rack ›")}</button>
      </div>
    </div>
  );
}
