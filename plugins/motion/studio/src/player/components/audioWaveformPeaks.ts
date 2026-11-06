/** Quietest bar that still clears the timeline contrast gate on the 70% pill. */
const LOUDNESS_OPACITY_FLOOR = 0.64;

const LOUDNESS_OPACITY_SPAN = 1 - LOUDNESS_OPACITY_FLOOR;

/** Peak is 0–1 against the file's own maximum. Hotter peaks paint more opaque. */
export function loudnessToOpacity(peak: number): number {
  if (!Number.isFinite(peak)) return LOUDNESS_OPACITY_FLOOR;
  const clamped = Math.min(1, Math.max(0, peak));
  return LOUDNESS_OPACITY_FLOOR + LOUDNESS_OPACITY_SPAN * clamped;
}

/**
 * Max-in-bucket over the trimmed peak window, one value per bar.
 * A point sample drops a transient that sits between bar columns.
 */
export function decimatePeaks(
  peaks: readonly number[],
  startFraction: number,
  endFraction: number,
  barCount: number,
): number[] {
  if (barCount <= 0 || peaks.length === 0) return [];
  const startFractionClamped = Math.min(1, Math.max(0, startFraction));
  const endFractionClamped = Math.min(1, Math.max(startFractionClamped, endFraction));
  const start = Math.floor(startFractionClamped * peaks.length);
  const endIndex = Math.ceil(endFractionClamped * peaks.length);
  const end = Math.max(start + 1, Math.min(peaks.length, endIndex));
  const span = end - start;
  const bars: number[] = [];
  for (let index = 0; index < barCount; index++) {
    let from = start + Math.floor((index * span) / barCount);
    let to = start + Math.floor(((index + 1) * span) / barCount);
    if (to <= from) {
      from = Math.min(from, end - 1);
      to = from + 1;
    }
    let max = 0;
    for (let cursor = from; cursor < to; cursor++) {
      const value = peaks[cursor] ?? 0;
      if (value > max) max = value;
    }
    bars.push(max);
  }
  return bars;
}
