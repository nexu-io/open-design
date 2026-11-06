/**
 * The media section's lane state and edits: volume and speed.
 *
 * Both live in a different panel section from the FX chain but are automated
 * the same way, so they read and write through the same helper the FX group uses
 * rather than a second interpretation of the attribute.
 */

import {
  HF_AUDIO_AUTOMATION_DATA_KEY,
  RATE_TARGET,
  resolveAutomationRange,
  sampleAutomationLane,
  VOLUME_TARGET,
} from "@hyperframes/core/audio-automation";
import type { DomEditSelection } from "./domEditingTypes";
import {
  automationAttrValue,
  HF_AUDIO_AUTOMATION_ATTR,
  readPanelAutomation,
  withLane,
  withoutLane,
  withPointAt,
  withSeededLane,
} from "./propertyPanelAutomation";
import { deriveElementTiming } from "./propertyPanelFlatTimingDerivation";
import { SPEED_PRESETS, speedPresetLane, type SpeedPresetId } from "@hyperframes/core/speed-ramp";
import { clampNumber } from "../../utils/studioHelpers";
import type { HfAutomation } from "@hyperframes/core/audio-automation";
import type { LinkedSpeedCommit } from "./linkedSpeedEdits";

export interface LaneBinding {
  automated: boolean;
  onAutomate: () => void;
  onRemoveAutomation: () => void;
  /** Write `v` as a keyframe at the playhead instead of the disabled fallback. */
  onCommitAt: (v: number) => void;
  /** The envelope's own value at the playhead, so the slider tracks it live. */
  automatedValue: number | undefined;
}

export type RateBinding = LaneBinding & {
  /** False while the clip has no known duration to stretch a preset over. */
  canApplyPreset: boolean;
  onApplyPreset: (id: SpeedPresetId) => void;
};

export interface VolumeAutomationBinding {
  volumeAutomated: boolean;
  onAutomateVolume: () => void;
  onRemoveVolumeAutomation: () => void;
  onCommitVolumeAt: (v: number) => void;
  automatedVolumeValue: number | undefined;
  /** Speed: the `rate` lane, plus the CapCut-style presets that seed it. */
  rate: RateBinding;
}

export const SPEED_PRESET_OPTIONS = SPEED_PRESETS.map(({ id, label }) => ({ value: id, label }));

export function useVolumeAutomation(
  element: DomEditSelection,
  currentTime: number,
  onSetAttributeQuiet: (attr: string, value: string | null) => void | Promise<void>,
  linkedSpeed: LinkedSpeedCommit | null = null,
): VolumeAutomationBinding {
  // The chain is not needed to resolve a volume or rate lane: both are always valid
  // targets, so this deliberately does not parse it.
  const automation = readPanelAutomation(
    element.dataAttributes?.[HF_AUDIO_AUTOMATION_DATA_KEY],
    undefined,
  );
  // ponytail: no GSAP animations passed — a media clip always carries an
  // explicit data-duration, so `deriveElementTiming` never infers from animations here.
  // `currentTime` comes from the caller's own `useLivePlayheadTime()` — a second
  // subscription here would race the same re-render the caller already triggers.
  const { start: elStart, duration: elDuration } = deriveElementTiming(element);
  const clipTimeSec = clampNumber(currentTime - elStart, 0, elDuration > 0 ? elDuration : Infinity);
  const write = (next: Parameters<typeof automationAttrValue>[0]): void => {
    // Quiet: clicking the toggle used to reload the preview and restart every
    // playing track, while the same click on an effect parameter did not.
    void onSetAttributeQuiet(HF_AUDIO_AUTOMATION_ATTR, automationAttrValue(next) || null);
  };
  type Edit = (current: HfAutomation) => HfAutomation;
  const writeOwn = (edit: Edit) => write(edit(automation));
  // Speed moves every data-link member together, so a linked clip's rate lane edits fan out.
  const writeRate = (edit: Edit) => {
    if (!linkedSpeed) return writeOwn(edit);
    void linkedSpeed.commitAttribute(
      HF_AUDIO_AUTOMATION_ATTR,
      (raw) => automationAttrValue(edit(readPanelAutomation(raw, undefined))) || null,
      "Edit speed",
    );
  };
  const laneBinding = (
    target: string,
    seed: number,
    writeLane: (edit: Edit) => void,
  ): LaneBinding => {
    const lane = automation.lanes.find((l) => l.target === target);
    return {
      automated: lane !== undefined,
      automatedValue: lane
        ? sampleAutomationLane(lane, clipTimeSec, resolveAutomationRange(target, undefined)?.scale)
        : undefined,
      // Seeded at the level the control already shows, so automating does not change it.
      onAutomate: () => writeLane((a) => withSeededLane(a, target, seed)),
      onRemoveAutomation: () => writeLane((a) => withoutLane(a, target)),
      onCommitAt: (v: number) => writeLane((a) => withPointAt(a, target, clipTimeSec, v)),
    };
  };
  // Unity: `data-volume` multiplies the lane, so seeding it there would play it twice.
  const volume = laneBinding(VOLUME_TARGET, 1, writeOwn);
  const rateAttr = Number.parseFloat(element.dataAttributes?.["playback-rate"] ?? "");
  const rate = laneBinding(
    RATE_TARGET,
    Number.isFinite(rateAttr) && rateAttr > 0 ? rateAttr : 1,
    writeRate,
  );
  return {
    volumeAutomated: volume.automated,
    automatedVolumeValue: volume.automatedValue,
    onAutomateVolume: volume.onAutomate,
    onRemoveVolumeAutomation: volume.onRemoveAutomation,
    onCommitVolumeAt: volume.onCommitAt,
    rate: {
      ...rate,
      canApplyPreset: elDuration > 0,
      onApplyPreset: (id) => {
        if (elDuration > 0) writeRate((a) => withLane(a, speedPresetLane(id, elDuration)));
      },
    },
  };
}
