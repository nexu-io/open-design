import { audioDbToGain, audioGainToDb, clampAudioGain } from "@hyperframes/core/audio-gain";

export type AudioGainMode = "set" | "adjust" | "normalize-max" | "normalize-all";

export interface AudioGainChoice {
  mode: AudioGainMode;
  db: number;
}

/** A selected clip: its `data-volume` gain and its source's linear sample peak over the played window. */
export interface AudioGainClip {
  key: string;
  gain: number;
  sourcePeak: number | null;
}

export interface AudioGainEdit {
  key: string;
  gain: number;
}

function isMeasured(clip: AudioGainClip): clip is AudioGainClip & { sourcePeak: number } {
  return clip.sourcePeak !== null && clip.sourcePeak > 0;
}

const heardPeak = (clip: AudioGainClip & { sourcePeak: number }) => clip.sourcePeak * clip.gain;

/** Premiere's Audio Gain options as new `data-volume` gains, clamped to silence..+12 dB. */
export function planAudioGain(
  clips: readonly AudioGainClip[],
  choice: AudioGainChoice,
): AudioGainEdit[] {
  const target = audioDbToGain(choice.db);
  const edit = (clip: AudioGainClip, gain: number) => ({
    key: clip.key,
    gain: clampAudioGain(gain),
  });
  if (choice.mode === "set") return clips.map((clip) => edit(clip, target));
  if (choice.mode === "adjust") return clips.map((clip) => edit(clip, clip.gain * target));
  const measured = clips.filter(isMeasured);
  if (choice.mode === "normalize-all") {
    return measured.map((clip) => edit(clip, target / clip.sourcePeak));
  }
  const loudest = Math.max(0, ...measured.map(heardPeak));
  if (loudest <= 0) return [];
  return measured.map((clip) => edit(clip, (clip.gain * target) / loudest));
}

/** The loudest peak the selection plays at its current gains, in dBFS. */
export function peakAmplitudeDb(clips: readonly AudioGainClip[]): number | null {
  const loudest = Math.max(0, ...clips.filter(isMeasured).map(heardPeak));
  return loudest > 0 ? audioGainToDb(loudest) : null;
}
