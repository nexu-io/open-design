import {
  resolveRateSpec,
  sourceTimeAt,
  timeAtSourceTime,
  type RateSpec,
} from "@hyperframes/core/speed-ramp";
import {
  readDataDurationSeconds,
  readMediaOffsetSeconds,
  readPlaybackRate,
  type AttrReader,
} from "@hyperframes/parsers/media-duration";

/** Where a clip's audio starts in its file, how fast it plays, and for how long (null: to the end). */
export interface ClipClock {
  inPoint: number;
  rate: RateSpec;
  duration: number | null;
}

export function readClipClock(getAttr: AttrReader): ClipClock {
  return {
    inPoint: readMediaOffsetSeconds(getAttr),
    rate: resolveRateSpec(getAttr("data-automation"), readPlaybackRate(getAttr)),
    duration: readDataDurationSeconds(getAttr),
  };
}

/** The source samples a clip plays, still on the file's clock. */
export function clipSourceWindow(
  samples: Float32Array,
  sampleRate: number,
  clock: ClipClock,
): Float32Array {
  const from = Math.min(samples.length, Math.floor(clock.inPoint * sampleRate));
  const to = clock.duration
    ? Math.min(
        samples.length,
        from + Math.ceil(sourceTimeAt(clock.rate, clock.duration) * sampleRate),
      )
    : samples.length;
  return samples.subarray(from, to);
}

const GRAIN = 4096;
const HOP = GRAIN / 2;
const HANN = Float32Array.from(
  { length: GRAIN },
  (_, k) => 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / GRAIN),
);

/**
 * The audio heard over clip time [0, duration]. Off rate 1, Hann grains overlap-added at the source
 * time each lands on: pitch kept, like export's atempo, close enough for band and level analysis.
 */
export function clipAudioOnItsClock(
  samples: Float32Array,
  sampleRate: number,
  clock: ClipClock,
): Float32Array {
  const source = clipSourceWindow(samples, sampleRate, clock);
  if (clock.rate === 1) return source;
  const out = new Float32Array(
    Math.round(timeAtSourceTime(clock.rate, source.length / sampleRate) * sampleRate),
  );
  // Grains are not phase-aligned, so off rate 1 the level reads ~1.3 dB low (up to ~3 dB on
  // tones); a WSOLA stretch would keep it.
  for (let at = -HOP; at < out.length; at += HOP) {
    const centre = Math.round(sourceTimeAt(clock.rate, (at + HOP) / sampleRate) * sampleRate);
    for (let k = 0; k < GRAIN; k += 1) {
      const o = at + k;
      const s = centre - HOP + k;
      if (o < 0 || o >= out.length || s < 0 || s >= source.length) continue;
      out[o] = (out[o] ?? 0) + (HANN[k] ?? 0) * (source[s] ?? 0);
    }
  }
  return out;
}
