// User edits to the detected beat grid. All times are in AUDIO-FILE coordinates
// (offsets into the music source), matching MusicBeatAnalysis.beatTimes, so edits
// survive moving/trimming the music clip on the timeline.

export interface UserBeat {
  time: number; // audio-file seconds
  strength: number; // 0–1, measured from audio
}

export interface BeatEditState {
  /** Music src these edits apply to; edits reset when the src changes. */
  src: string;
  /** Beats the user added (audio-file coords). */
  added: UserBeat[];
  /** Audio-file times of detected beats the user removed. */
  removed: number[];
}

// Two beat times within this many seconds are treated as the same beat.
const MATCH_EPS = 0.015;

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < MATCH_EPS;
}

function activeEdits(edits: BeatEditState | null, src: string | null): BeatEditState | null {
  return edits && src && edits.src === src ? edits : null;
}

/** Merge detected beats with user edits → effective beats (audio-file coords). */
export function mergeUserBeats(
  detectedTimes: number[],
  detectedStrengths: number[],
  edits: BeatEditState | null,
  src: string | null,
): { times: number[]; strengths: number[] } {
  const e = activeEdits(edits, src);
  const removed = e?.removed ?? [];
  const merged: UserBeat[] = [];
  for (let i = 0; i < detectedTimes.length; i++) {
    const t = detectedTimes[i]!;
    if (removed.some((r) => near(r, t))) continue;
    merged.push({ time: t, strength: detectedStrengths[i] ?? 0.5 });
  }
  if (e) {
    // Skip added beats that land on an already-present (detected) beat so an
    // "add" near an existing beat doesn't create a near-duplicate.
    for (const b of e.added) {
      if (!merged.some((m) => near(m.time, b.time))) merged.push(b);
    }
  }
  merged.sort((a, b) => a.time - b.time);
  return { times: merged.map((b) => b.time), strengths: merged.map((b) => b.strength) };
}

function base(edits: BeatEditState | null, src: string): BeatEditState {
  const e = activeEdits(edits, src);
  return e
    ? { ...e, added: [...e.added], removed: [...e.removed] }
    : { src, added: [], removed: [] };
}

/**
 * Add a beat at an audio-file time. `detectedTimes` lets us no-op when the beat
 * lands on an existing (non-removed) detected beat — otherwise the merge would
 * drop it anyway and we'd record a phantom edit/undo/write. Returns the SAME
 * reference when nothing changed so callers can skip persisting.
 */
export function addUserBeat(
  edits: BeatEditState | null,
  src: string,
  beat: UserBeat,
  detectedTimes: number[] = [],
): BeatEditState | null {
  const active = activeEdits(edits, src);
  // Already covered by a surviving detected beat → nothing to do.
  const onLiveDetected =
    detectedTimes.some((t) => near(t, beat.time)) &&
    !(active?.removed ?? []).some((r) => near(r, beat.time));
  if (onLiveDetected) return edits;
  // Already an added beat here → nothing to do.
  if ((active?.added ?? []).some((b) => near(b.time, beat.time))) return edits;

  const next = base(edits, src);
  // If a detected beat here was previously removed, drop the removal instead of stacking.
  const ri = next.removed.findIndex((r) => near(r, beat.time));
  if (ri >= 0) {
    next.removed.splice(ri, 1);
    return next;
  }
  next.added.push(beat);
  return next;
}

/**
 * Remove the beat nearest `time` — drops a user-added beat or hides a detected
 * one. Returns the SAME reference when nothing changed (no added beat near
 * `time`, and no live detected beat to hide) so callers can skip persisting a
 * phantom edit/undo/write.
 */
export function removeUserBeat(
  edits: BeatEditState | null,
  src: string,
  detectedTimes: number[],
  time: number,
): BeatEditState | null {
  const active = activeEdits(edits, src);
  const hasAdded = (active?.added ?? []).some((b) => near(b.time, time));
  const detected = detectedTimes.find((t) => near(t, time));
  const alreadyHidden =
    detected !== undefined && (active?.removed ?? []).some((r) => near(r, detected));
  if (!hasAdded && (detected === undefined || alreadyHidden)) return edits;

  const next = base(edits, src);
  const ai = next.added.findIndex((b) => near(b.time, time));
  if (ai >= 0) {
    next.added.splice(ai, 1);
    return next;
  }
  if (detected !== undefined && !next.removed.some((r) => near(r, detected))) {
    next.removed.push(detected);
  }
  return next;
}

/** Move the beat at `fromTime` to `toBeat` (delete original, add new). */
export function moveUserBeat(
  edits: BeatEditState | null,
  src: string,
  detectedTimes: number[],
  fromTime: number,
  toBeat: UserBeat,
): BeatEditState | null {
  const removed = removeUserBeat(edits, src, detectedTimes, fromTime);
  return addUserBeat(removed, src, toBeat, detectedTimes) ?? removed;
}
