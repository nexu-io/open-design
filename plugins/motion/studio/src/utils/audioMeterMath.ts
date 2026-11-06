import { useMemo } from "react";
import { audioDbToGain, audioGainToDb } from "@hyperframes/core/audio-gain";
import { audibleVideoNeedsWebAudio } from "@hyperframes/core/audible-video";
import { usePlayerStore, type TimelineElement } from "../player";
import { isAudioTimelineElement } from "./timelineInspector";

/** dB stops of the meter scale, top to bottom; equal spacing between stops. */
export const METER_DB_MARKS = [0, -3, -6, -12, -24] as const;
const FLOOR_DB = -60;
const STOPS = [...METER_DB_MARKS, FLOOR_DB];

const FALL_PER_SECOND = 0.9;
const HOLD_MS = 1200;

/** Linear peak (0..1) to a 0..1 bar fraction along the piecewise-linear dB scale. */
export function levelToFraction(linear: number): number {
  const db = linear > 0 ? audioGainToDb(linear) : FLOOR_DB;
  if (db >= 0) return 1;
  if (db <= FLOOR_DB) return 0;
  const j = STOPS.findIndex((stop) => db >= stop);
  const hi = STOPS[j - 1] as number;
  const lo = STOPS[j] as number;
  return (STOPS.length - 1 - j + (db - lo) / (hi - lo)) / (STOPS.length - 1);
}

/** Fraction of the bar height at which a dB mark sits, 0 at the bottom. */
export function markFraction(db: number): number {
  return levelToFraction(audioDbToGain(db));
}

export interface MeterChannel {
  level: number;
  peak: number;
  peakAt: number;
}

export const SILENT_CHANNEL: MeterChannel = { level: 0, peak: 0, peakAt: 0 };

/** Instant attack, steady fall; the peak holds for HOLD_MS, then falls with the bar. */
export function stepChannel(
  prev: MeterChannel,
  linear: number,
  now: number,
  dtMs: number,
): MeterChannel {
  const fall = (dtMs / 1000) * FALL_PER_SECOND;
  const target = levelToFraction(linear);
  const level = Math.max(target, prev.level - fall);
  if (target >= prev.peak) return { level, peak: target, peakAt: now };
  if (now - prev.peakAt < HOLD_MS) return { level, peak: prev.peak, peakAt: prev.peakAt };
  return { level, peak: Math.max(target, prev.peak - fall), peakAt: prev.peakAt };
}

export type MeterPair = [MeterChannel, MeterChannel];

const atRest = (ch: MeterChannel): boolean => ch.level === 0 && ch.peak === 0;

/** Steps both channels; returns `prev` itself while silent and at rest, so callers can skip the paint. */
export function stepPair(
  prev: MeterPair | undefined,
  raw: { l: number; r: number } | undefined,
  now: number,
  dtMs: number,
): MeterPair {
  const [l, r] = prev ?? [SILENT_CHANNEL, SILENT_CHANNEL];
  const silent = !raw?.l && !raw?.r;
  if (prev && silent && atRest(l) && atRest(r)) return prev;
  return [stepChannel(l, raw?.l ?? 0, now, dtMs), stepChannel(r, raw?.r ?? 0, now, dtMs)];
}

/** The meters appear only for a project with an audio clip, a group, or a video Web Audio carries. */
export function hasProjectAudio(elements: readonly TimelineElement[]): boolean {
  return elements.some(
    (el) =>
      isAudioTimelineElement(el) ||
      el.audioGroup !== undefined ||
      (el.hasAudio === true && !el.muted && audibleVideoNeedsWebAudio(el)),
  );
}

/** Scans once per `elements` change, not on every store update (the playhead ticks each frame). */
export function useProjectHasAudio(): boolean {
  const elements = usePlayerStore((s) => s.elements);
  return useMemo(() => hasProjectAudio(elements), [elements]);
}
