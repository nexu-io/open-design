import { audioDbToGain, clampAudioGain } from "@hyperframes/core/audio-gain";
import { RATE_RANGE } from "@hyperframes/core/audio-automation";

const NUMBER = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)`;

/** Gain as the readout shows it (dB, "x0.8", "80%"). Returns linear gain, or null to refuse. */
export function parseGainInput(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return null;
  if (t === "-inf" || t === "-infinity" || t === "-∞" || t === "silence" || t === "mute") return 0;
  let m = new RegExp(`^(${NUMBER})%$`).exec(t);
  if (m) return finiteGain(Number(m[1]) / 100);
  m = new RegExp(`^(?:x(${NUMBER})|(${NUMBER})x)$`).exec(t);
  if (m) return finiteGain(Number(m[1] ?? m[2]));
  m = new RegExp(`^(${NUMBER})(?:db)?$`).exec(t);
  if (m) return finiteGain(audioDbToGain(Number(m[1])));
  return null;
}

function finiteGain(gain: number): number | null {
  return Number.isFinite(gain) && gain >= 0 ? clampAudioGain(gain) : null;
}

/** Playback rate: "1.5x", "1.5", "150%". Clamped to the rate lane's range. */
export function parseRateInput(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return null;
  let value: number;
  let m = new RegExp(`^(${NUMBER})%$`).exec(t);
  if (m) value = Number(m[1]) / 100;
  else {
    m = new RegExp(`^(?:x(${NUMBER})|(${NUMBER})x?)$`).exec(t);
    if (!m) return null;
    value = Number(m[1] ?? m[2]);
  }
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(RATE_RANGE.max, Math.max(RATE_RANGE.min, value));
}

/** Non-negative duration or offset: "2.5", "2.5s", "500ms", "1:02.5". Returns seconds, or null to refuse. */
export function parseSecondsInput(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return null;
  let m = new RegExp(`^(\\d+):(\\d{1,2}(?:\\.\\d*)?)$`).exec(t);
  if (m) return finiteSeconds(Number(m[1]) * 60 + Number(m[2]));
  m = new RegExp(`^(${NUMBER})ms$`).exec(t);
  if (m) return finiteSeconds(Number(m[1]) / 1000);
  m = new RegExp(`^(${NUMBER})(?:s|sec|secs)?$`).exec(t);
  if (m) return finiteSeconds(Number(m[1]));
  return null;
}

function finiteSeconds(seconds: number): number | null {
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}
