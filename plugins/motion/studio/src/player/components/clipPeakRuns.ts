import { EXPORT_PEAK_CEILING } from "../../utils/exportPeakCeiling";

export interface PeakMap {
  binSeconds: number;
  bins: number[];
}

export interface ClipSourceWindow {
  mediaStart: number;
  sourceSpan: number;
}

export interface ClipPeakMarkRuns {
  runs: Array<{ from: number; to: number }>;
  peakDbfs: number | null;
}

/**
 * Where, as fractions of the clip, its source at the clip's own gain reaches the
 * export ceiling, and the loudest point when it does. Adjacent hot bins merge.
 */
export function clipPeakRuns(
  map: PeakMap,
  window: ClipSourceWindow,
  gain: number,
): ClipPeakMarkRuns {
  const runs: ClipPeakMarkRuns["runs"] = [];
  if (!(window.sourceSpan > 0) || !(map.binSeconds > 0) || !(gain > 0))
    return { runs, peakDbfs: null };
  const first = Math.max(0, Math.floor(window.mediaStart / map.binSeconds));
  const last = Math.min(
    map.bins.length,
    Math.ceil((window.mediaStart + window.sourceSpan) / map.binSeconds),
  );
  const toFraction = (bin: number) =>
    Math.min(1, Math.max(0, (bin * map.binSeconds - window.mediaStart) / window.sourceSpan));
  let loudest = 0;
  for (let bin = first; bin < last; bin++) {
    const level = (map.bins[bin] ?? 0) * gain;
    if (level < EXPORT_PEAK_CEILING) continue;
    loudest = Math.max(loudest, level);
    const previous = runs.at(-1);
    const from = toFraction(bin);
    const to = toFraction(bin + 1);
    if (previous && previous.to >= from) previous.to = to;
    else runs.push({ from, to });
  }
  return { runs, peakDbfs: runs.length > 0 ? 20 * Math.log10(loudest) : null };
}

export function clipSourcePeak(map: PeakMap, window: ClipSourceWindow): number | null {
  if (!(window.sourceSpan > 0) || !(map.binSeconds > 0)) return null;
  const first = Math.max(0, Math.floor(window.mediaStart / map.binSeconds));
  const last = Math.min(
    map.bins.length,
    Math.ceil((window.mediaStart + window.sourceSpan) / map.binSeconds),
  );
  if (last <= first) return null;
  return map.bins.slice(first, last).reduce((loudest, bin) => Math.max(loudest, bin), 0);
}

export function isPeakMap(value: unknown): value is PeakMap {
  if (typeof value !== "object" || value === null) return false;
  const bins: unknown = Reflect.get(value, "bins");
  return (
    typeof Reflect.get(value, "binSeconds") === "number" &&
    Array.isArray(bins) &&
    bins.every((bin) => typeof bin === "number")
  );
}
