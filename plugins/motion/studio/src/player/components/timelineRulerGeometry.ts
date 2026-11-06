import { formatTime, secondsToFrame } from "../lib/time";
import type { TimelineTimeDisplayMode } from "../../utils/studioUiPreferences";
import type { TimelineTimeRange } from "../lib/timelineClipIndex";

// fallow-ignore-next-line complexity
export function getTimelineMajorTickInterval(
  duration: number,
  pixelsPerSecond?: number,
  frameRate?: number,
): number {
  // "Nice" NLE steps: 1-2-5 sub-second decades, then 1s/2s/5s/10s/15s/30s,
  // minute multiples, and 15m/30m/1h so ultra-zoomed-out long comps still get
  // readable (non-colliding) labels instead of the old 10m fallback everywhere.
  const zoomIntervals = [
    0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600,
  ];
  let interval: number;
  if (Number.isFinite(pixelsPerSecond) && (pixelsPerSecond ?? 0) > 0) {
    const targetMajorPx = 88;
    interval =
      zoomIntervals.find((candidate) => candidate * (pixelsPerSecond ?? 0) >= targetMajorPx) ??
      3600;
  } else {
    const durationIntervals = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
    const target = duration / 6;
    interval = durationIntervals.find((candidate) => candidate >= target) ?? 60;
  }
  // Frame display mode: labels are frame numbers, so a major step must be a
  // WHOLE number of frames. Snap UP so label spacing stays readable.
  if (Number.isFinite(frameRate) && (frameRate ?? 0) > 0) {
    const fps = frameRate ?? 0;
    return Math.max(1, Math.ceil(interval * fps - 1e-6)) / fps;
  }
  return interval;
}

// Prefer quarter subdivisions so the midpoint remains visible; fall back to
// smaller whole-frame-compatible sets as ticks become too dense to read.
// fallow-ignore-next-line complexity
function getMinorSubdivisions(
  majorInterval: number,
  pixelsPerSecond?: number,
  frameRate?: number,
): number {
  const pps = Number.isFinite(pixelsPerSecond) ? (pixelsPerSecond ?? 0) : 0;
  if (pps <= 0) return 4;
  const fps = Number.isFinite(frameRate) ? (frameRate ?? 0) : 0;
  const majorFrames = fps > 0 ? Math.round(majorInterval * fps) : 0;
  const candidates = fps > 0 ? [4, 5, 3, 2] : [4, 2];
  for (const parts of candidates) {
    if (fps > 0 && majorFrames % parts !== 0) continue;
    if ((majorInterval / parts) * pps >= 8) return parts;
  }
  return 0;
}

// Multiply from the index rather than accumulating, then round to 1µs so long
// rulers do not drift and frame-exact positions keep clean values and keys.
function roundTickValue(time: number): number {
  return Math.round(time * 1e6) / 1e6;
}

function isSupportedTickDuration(duration: number): boolean {
  return duration > 0 && Number.isFinite(duration) && duration <= 14400;
}

function getTickRange(duration: number, range?: TimelineTimeRange): TimelineTimeRange {
  return {
    start: Math.max(0, range?.start ?? 0),
    end: Math.min(duration, range?.end ?? duration),
  };
}

function appendMinorTicks(
  minor: number[],
  majorTime: number,
  minorInterval: number,
  subdivisions: number,
  range: TimelineTimeRange,
  maxTicks: number,
  majorCount: number,
): void {
  for (let part = 1; part < subdivisions && majorCount + minor.length < maxTicks; part++) {
    const time = majorTime + part * minorInterval;
    if (time >= range.start - 0.001 && time <= range.end + 0.001) {
      minor.push(roundTickValue(time));
    }
  }
}

function tickSpacing(duration: number, pixelsPerSecond?: number, frameRate?: number) {
  const majorInterval = getTimelineMajorTickInterval(duration, pixelsPerSecond, frameRate);
  const subdivisions = getMinorSubdivisions(majorInterval, pixelsPerSecond, frameRate);
  return { majorInterval, subdivisions };
}

export function rulerFrameRate(mode: TimelineTimeDisplayMode, fps: number): number | undefined {
  return mode === "frame" ? fps : undefined;
}

/** Seconds between neighbouring ruler lines (minor ticks when drawn, else major): the snap grid. */
export function getTimelineGridStep(
  duration: number,
  pixelsPerSecond?: number,
  frameRate?: number,
): number {
  if (!isSupportedTickDuration(duration)) return 0;
  const { majorInterval, subdivisions } = tickSpacing(duration, pixelsPerSecond, frameRate);
  return subdivisions > 0 ? majorInterval / subdivisions : majorInterval;
}

export function generateTicks(
  duration: number,
  pixelsPerSecond?: number,
  frameRate?: number,
  range?: TimelineTimeRange,
): { major: number[]; minor: number[] } {
  if (!isSupportedTickDuration(duration)) return { major: [], minor: [] };
  const { majorInterval, subdivisions } = tickSpacing(duration, pixelsPerSecond, frameRate);
  const minorInterval = subdivisions > 0 ? majorInterval / subdivisions : 0;
  const major: number[] = [];
  const minor: number[] = [];
  // Safety cap prevents malformed inputs from creating an unbounded ruler.
  const maxTicks = 2000;
  const tickRange = getTickRange(duration, range);
  const firstMajorIndex = Math.max(0, Math.floor(tickRange.start / majorInterval));
  for (let index = firstMajorIndex; major.length < maxTicks; index++) {
    const time = index * majorInterval;
    if (time > tickRange.end + 0.001) break;
    if (time >= tickRange.start - 0.001) major.push(roundTickValue(time));
    appendMinorTicks(minor, time, minorInterval, subdivisions, tickRange, maxTicks, major.length);
  }
  return { major, minor };
}

export function formatTimelineTickLabel(
  time: number,
  duration: number,
  majorInterval: number,
): string {
  if (!Number.isFinite(time)) return "00:00";
  const safeTime = Math.max(0, time);
  if (majorInterval < 0.1) {
    const totalHundredths = Math.round(safeTime * 100);
    const wholeSeconds = Math.floor(totalHundredths / 100);
    const hundredth = totalHundredths % 100;
    return `${formatTime(wholeSeconds)}.${hundredth.toString().padStart(2, "0")}`;
  }
  if (majorInterval < 1) {
    const totalTenths = Math.round(safeTime * 10);
    const wholeSeconds = Math.floor(totalTenths / 10);
    const tenth = totalTenths % 10;
    return `${formatTime(wholeSeconds)}.${tenth}`;
  }
  if (duration >= 3600 || safeTime >= 3600) {
    const totalSeconds = Math.floor(safeTime);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return formatTime(safeTime);
}

export function rulerTickText(
  time: number,
  frameRate: number | undefined,
  duration: number,
  majorInterval: number,
): string | number {
  return frameRate
    ? secondsToFrame(time, frameRate)
    : formatTimelineTickLabel(time, duration, majorInterval);
}
