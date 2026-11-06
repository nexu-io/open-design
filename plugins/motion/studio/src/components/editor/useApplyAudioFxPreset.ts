/**
 * Append (or, on reapply, replace in place) a preset's nodes onto a chain,
 * with the telemetry that decision needs — the write path the property
 * panel's FX section and the timeline FX popover (C1) both use, so a preset
 * applied from either surface counts the same way.
 */

import { applyAudioFxPreset, getAudioFxPreset } from "@hyperframes/core/audio-fx-presets";
import type { HfAudioFxChain } from "@hyperframes/core/audio-fx";
import type { HfAudioNameKind } from "@hyperframes/core/audio-carve";
import { trackPresetApplied } from "./audioFxTelemetry.js";

export function applyPresetToChain(
  chain: HfAudioFxChain,
  presetId: string,
  trackKind: HfAudioNameKind | undefined,
): HfAudioFxChain | null {
  const preset = getAudioFxPreset(presetId);
  if (!preset) return null;
  // Appends. Stacking a character preset onto an already-cleaned voice is a
  // real thing to want, and replacing silently would throw work away — so
  // the destructive option is a separate gesture, not the default one.
  const next = applyAudioFxPreset(chain, preset);
  // Re-applying replaces this preset's own nodes in place rather than
  // appending a second copy, and the two are different decisions — worth
  // telling apart in the numbers.
  const reapply = chain.nodes.some((n) => n.fromPreset === preset.id);
  trackPresetApplied(
    preset.id,
    preset.family,
    preset.nodes.length,
    reapply ? "reapply" : "append",
    { trackKind },
  );
  return next;
}
