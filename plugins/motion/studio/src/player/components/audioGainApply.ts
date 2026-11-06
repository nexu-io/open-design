import { formatAudioGain } from "@hyperframes/core/audio-gain";
import type { TimelineElement } from "../store/timelineElement";
import type { TimelineEditCallbacks } from "./timelineCallbacks";
import {
  normalizeToastText,
  requestNormalizePlan,
  throwUnlessSaved,
  VOLUME_LANE_REFUSAL,
  volumeLaneOwnsGain,
} from "./clipMenuNormalize";

export const AUDIO_GAIN_LABEL = "Audio Gain";

type VolumeWriters = Pick<
  TimelineEditCallbacks,
  "onSetElementAttributeQuiet" | "onSetElementsAttributeQuiet"
>;

/** Every clip's new gain as `data-volume`, one undo step when the host can save them together. */
export async function writeClipGains(
  edits: ReadonlyArray<{ element: TimelineElement; gain: number }>,
  writers: VolumeWriters,
  label = AUDIO_GAIN_LABEL,
): Promise<void> {
  if (edits.some(({ element }) => volumeLaneOwnsGain(element))) {
    throw new Error(VOLUME_LANE_REFUSAL);
  }
  const values = edits.map(({ element, gain }) => ({ element, value: formatAudioGain(gain) }));
  if (values.length > 1 && writers.onSetElementsAttributeQuiet) {
    throwUnlessSaved(await writers.onSetElementsAttributeQuiet(values, "data-volume", label));
    return;
  }
  for (const { element, value } of values) {
    throwUnlessSaved(
      await writers.onSetElementAttributeQuiet?.(element, "data-volume", value, label),
    );
  }
}

/** Measure each clip against −16 LUFS, write the gains, and say what happened. */
export async function normalizeClipsLoudness(
  projectId: string,
  elements: readonly TimelineElement[],
  writers: VolumeWriters,
): Promise<string> {
  if (elements.some(volumeLaneOwnsGain)) throw new Error(VOLUME_LANE_REFUSAL);
  const plans = await Promise.all(elements.map((el) => requestNormalizePlan(projectId, el)));
  await writeClipGains(
    elements.map((element, index) => ({ element, gain: plans[index]?.volume ?? 1 })),
    writers,
    "Normalize loudness",
  );
  const [only] = plans;
  return plans.length === 1 && only
    ? normalizeToastText(only)
    : `Normalized ${plans.length} clips to −16 LUFS`;
}
