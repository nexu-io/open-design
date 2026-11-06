// Imperative beat-edit operations driven by the player store. Times passed in
// are COMPOSITION coordinates (timeline seconds); they're converted to audio-file
// coordinates internally and strength is measured from the decoded audio.

import { usePlayerStore, type TimelineElement } from "../player/store/playerStore";
import { isMusicTrack } from "./timelineInspector";
import { strengthAtTime, type MusicBeatAnalysis } from "@hyperframes/core/beats";
import {
  addUserBeat,
  removeUserBeat,
  moveUserBeat,
  mergeUserBeats,
  type BeatEditState,
} from "./beatEditing";

/**
 * Merge user beat edits into the detected analysis and remap from audio-file to
 * composition coordinates (filtered to the music clip's visible range). Returns
 * null when there's no music element, so beats never paint at wrong positions.
 */
export function remapBeatAnalysisToComposition(
  beatAnalysis: MusicBeatAnalysis | null,
  musicElement: Pick<TimelineElement, "src" | "start" | "playbackStart" | "duration"> | null,
  beatEdits: BeatEditState | null,
): MusicBeatAnalysis | null {
  if (!beatAnalysis || !musicElement) return null;
  const merged = mergeUserBeats(
    beatAnalysis.beatTimes,
    beatAnalysis.beatStrengths,
    beatEdits,
    musicElement.src ?? null,
  );
  const playbackStart = musicElement.playbackStart ?? 0;
  const clipEnd = playbackStart + musicElement.duration;
  const offset = musicElement.start - playbackStart;
  const times: number[] = [];
  const strengths: number[] = [];
  merged.times.forEach((t, i) => {
    if (t >= playbackStart && t <= clipEnd) {
      times.push(Math.round((t + offset) * 1000) / 1000);
      strengths.push(merged.strengths[i] ?? 1);
    }
  });
  return { ...beatAnalysis, beatTimes: times, beatStrengths: strengths };
}

function ctx() {
  const s = usePlayerStore.getState();
  const music = s.elements.find(isMusicTrack);
  const analysis = s.beatAnalysis;
  if (!music || !analysis || !music.src) return null;
  return { s, music, analysis, src: music.src };
}

function compToAudio(start: number, playbackStart: number, compT: number): number {
  return playbackStart + (compT - start);
}

// Clip length on the timeline. Falls back to source/analysis length when the
// media duration hasn't been probed yet (0), so the add window isn't degenerate.
function clipDuration(music: { duration: number; sourceDuration?: number }): number {
  if (music.duration > 0) return music.duration;
  if (music.sourceDuration && music.sourceDuration > 0) return music.sourceDuration;
  return Number.POSITIVE_INFINITY;
}

/** True when a music track with analysis exists and the time is inside the clip. */
export function canAddBeatAt(compT: number): boolean {
  const c = ctx();
  if (!c) return false;
  return compT >= c.music.start && compT <= c.music.start + clipDuration(c.music);
}

export function addBeatAtCompositionTime(compT: number): void {
  const c = ctx();
  if (!c) return;
  const playbackStart = c.music.playbackStart ?? 0;
  const audioT = compToAudio(c.music.start, playbackStart, compT);
  if (audioT < playbackStart || audioT > playbackStart + clipDuration(c.music)) return;
  const strength = strengthAtTime(c.analysis, audioT);
  const next = addUserBeat(c.s.beatEdits, c.src, { time: audioT, strength }, c.analysis.beatTimes);
  // No-op when the beat lands on an existing one — skip the undo entry + write.
  if (next !== c.s.beatEdits) c.s.commitBeatEdits(next, "add beat");
}

export function deleteBeatAtCompositionTime(compT: number): void {
  const c = ctx();
  if (!c) return;
  const audioT = compToAudio(c.music.start, c.music.playbackStart ?? 0, compT);
  const next = removeUserBeat(c.s.beatEdits, c.src, c.analysis.beatTimes, audioT);
  // No-op when there was no beat to remove — skip the undo entry + write.
  if (next !== c.s.beatEdits) c.s.commitBeatEdits(next, "delete beat");
}

export function moveBeatCompositionTime(fromCompT: number, toCompT: number): void {
  const c = ctx();
  if (!c) return;
  const playbackStart = c.music.playbackStart ?? 0;
  const fromAudio = compToAudio(c.music.start, playbackStart, fromCompT);
  const toAudio = compToAudio(c.music.start, playbackStart, toCompT);
  const clamped = Math.max(playbackStart, Math.min(playbackStart + clipDuration(c.music), toAudio));
  const strength = strengthAtTime(c.analysis, clamped);
  const next = moveUserBeat(c.s.beatEdits, c.src, c.analysis.beatTimes, fromAudio, {
    time: clamped,
    strength,
  });
  // No-op when the move resolves to no change — skip the undo entry + write.
  if (next !== c.s.beatEdits) c.s.commitBeatEdits(next, "move beat");
}
