import { useEffect, useMemo, useRef } from "react";
import { usePlayerStore } from "../player/store/playerStore";
import { resolveBeatSourceTrack } from "../utils/timelineInspector";
import { analyzeMusicFromUrl } from "@hyperframes/core/beats";
import { whenTimelineIdle } from "../player/components/timelineMotion";
import { useFileManagerContextOptional } from "../contexts/FileManagerContext";
import { mergeUserBeats } from "../utils/beatEditing";
import { getTimelineElementIndexes } from "../player/lib/timelineElementIndexes";
import { remapBeatAnalysisToComposition } from "../utils/beatEditActions";
import {
  audioRelPathForSrc,
  beatFilePathForSrc,
  serializeBeats,
  parseBeats,
} from "@hyperframes/core/beats";

// Module-level cache so the same URL isn't re-decoded/analyzed on re-mount.
// Capped so decoded PCM buffers don't accumulate unbounded across a session.
const analysisCache = new Map<string, ReturnType<typeof analyzeMusicFromUrl>>();
const MAX_ANALYSIS_CACHE = 4;

const PERSIST_DEBOUNCE_MS = 350;

function cacheAnalysis(url: string, promise: ReturnType<typeof analyzeMusicFromUrl>): void {
  analysisCache.set(url, promise);
  while (analysisCache.size > MAX_ANALYSIS_CACHE) {
    const oldest = analysisCache.keys().next().value;
    if (oldest === undefined) break;
    analysisCache.delete(oldest);
  }
}

type ProjectIo = { readOptionalProjectFile: (p: string) => Promise<string> };

/**
 * Resolve the effective beat list for a track: a saved file with real beats
 * wins; otherwise the detected beats are used (and `hasFile` is false so the
 * caller seeds a new file). An empty saved file is ignored so detection retries.
 */
async function resolveBeats(
  beatPath: string | null,
  detected: { times: number[]; strengths: number[] },
  io: ProjectIo,
): Promise<{ times: number[]; strengths: number[]; hasFile: boolean }> {
  if (!beatPath) return { ...detected, hasFile: false };
  try {
    const content = await io.readOptionalProjectFile(beatPath);
    const parsed = content ? parseBeats(content) : null;
    if (parsed && parsed.times.length > 0) {
      return { times: parsed.times, strengths: parsed.strengths, hasFile: true };
    }
  } catch {
    /* fall back to detected beats */
  }
  return { ...detected, hasFile: false };
}

/** True when the beats file for a track exists and holds at least one beat. */
async function readHasSavedBeats(io: ProjectIo, beatPath: string): Promise<boolean> {
  try {
    const content = await io.readOptionalProjectFile(beatPath);
    const parsed = content ? parseBeats(content) : null;
    return !!(parsed && parsed.times.length > 0);
  } catch {
    return false;
  }
}

type MusicAnalysis = Awaited<ReturnType<typeof analyzeMusicFromUrl>>;

/**
 * Analyze a track (memoized per URL) and fold in any saved beat edits. Null on
 * decode/analysis failure — the caller then clears state and drops the cache
 * entry (only when the effect is still live).
 */
async function loadBeatAnalysis(
  musicSrc: string,
  beatPath: string,
  io: ProjectIo,
): Promise<{ analysis: MusicAnalysis; times: number[]; strengths: number[] } | null> {
  let promise = analysisCache.get(musicSrc);
  if (!promise) {
    promise = analyzeMusicFromUrl(musicSrc, { pause: whenTimelineIdle });
    cacheAnalysis(musicSrc, promise);
  }
  try {
    const analysis = await promise;
    const detected = { times: analysis.beatTimes, strengths: analysis.beatStrengths };
    const { times, strengths } = await resolveBeats(beatPath, detected, io);
    return { analysis, times, strengths };
  } catch {
    return null;
  }
}

/** The current beat analysis, remapped onto the composition's edited beat grid. */
export function useAdjustedBeatAnalysis() {
  const beatAnalysis = usePlayerStore((s) => s.beatAnalysis);
  const musicElement = usePlayerStore((s) => getTimelineElementIndexes(s.elements).musicElement);
  const beatEdits = usePlayerStore((s) => s.beatEdits);
  return useMemo(
    () => remapBeatAnalysisToComposition(beatAnalysis, musicElement, beatEdits),
    [beatAnalysis, musicElement, beatEdits],
  );
}

export function useMusicBeatAnalysis(): void {
  const elements = usePlayerStore((s) => s.elements);
  const setBeatAnalysis = usePlayerStore((s) => s.setBeatAnalysis);
  const setBeatEdits = usePlayerStore((s) => s.setBeatEdits);
  const setBeatPersist = usePlayerStore((s) => s.setBeatPersist);
  const resetBeatHistory = usePlayerStore((s) => s.resetBeatHistory);
  const fileManager = useFileManagerContextOptional();
  const readOptionalProjectFile = fileManager?.readOptionalProjectFile;
  const writeProjectFile = fileManager?.writeProjectFile;

  // File IO via ref so the effects only re-run when the track changes.
  const ioRef = useRef<
    (ProjectIo & { writeProjectFile: (p: string, c: string) => Promise<void> }) | null
  >(null);
  ioRef.current =
    readOptionalProjectFile && writeProjectFile
      ? { readOptionalProjectFile, writeProjectFile }
      : null;

  const { musicSrc, isFallbackTrack } = useMemo(() => {
    const resolved = resolveBeatSourceTrack(elements);
    return {
      musicSrc: resolved?.element.src ?? null,
      isFallbackTrack: resolved?.isFallback ?? false,
    };
  }, [elements]);

  // ── Load: decode for strength data, then use the saved beat file if present,
  //    otherwise seed it from detection. Resets edits + history on track change. ──
  useEffect(() => {
    if (!musicSrc) {
      setBeatAnalysis(null);
      setBeatEdits(null);
      resetBeatHistory();
      return;
    }
    if (!ioRef.current) {
      setBeatAnalysis(null);
      setBeatEdits(null);
      resetBeatHistory();
      return;
    }
    let cancelled = false;
    const beatPath = beatFilePathForSrc(musicSrc);
    const io = ioRef.current;

    // For explicitly tagged/named music tracks: only run expensive audio decode
    // + beat analysis when the user has an explicit beats file saved. Without
    // one, skip entirely — no surprise green lines on the timeline after
    // dragging unrelated assets.
    //
    // For fallback tracks (audio dropped from Finder with no role/music-id):
    // always run analysis so the Beat tool becomes usable immediately.
    (async () => {
      if (!beatPath || !io) return;
      if (!isFallbackTrack) {
        const hasSavedBeats = await readHasSavedBeats(io, beatPath);
        if (cancelled) return;
        if (!hasSavedBeats) {
          setBeatAnalysis(null);
          return;
        }
      }
      if (cancelled) return;

      const result = await loadBeatAnalysis(musicSrc, beatPath, io);
      if (cancelled) return;
      if (!result) {
        setBeatAnalysis(null);
        analysisCache.delete(musicSrc);
        return;
      }
      setBeatEdits(null);
      resetBeatHistory();
      setBeatAnalysis({
        ...result.analysis,
        beatTimes: result.times,
        beatStrengths: result.strengths,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [musicSrc, isFallbackTrack, setBeatAnalysis, setBeatEdits, resetBeatHistory]);

  // ── Persist: register a debounced writer fired by every beat edit/undo/redo.
  //    Flushes any pending write on cleanup so the last edit is never lost. ──
  useEffect(() => {
    const beatPath = beatFilePathForSrc(musicSrc);
    if (!musicSrc || !beatPath || !ioRef.current) {
      setBeatPersist(null);
      return;
    }
    const io = ioRef.current;
    const audio = audioRelPathForSrc(musicSrc) ?? "audio";
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: string | null = null;

    const flush = () => {
      if (pending === null) return;
      const content = pending;
      pending = null;
      void io.writeProjectFile(beatPath, content).catch(() => {});
    };

    const persist = () => {
      const s = usePlayerStore.getState();
      const a = s.beatAnalysis;
      if (!a) return;
      const merged = mergeUserBeats(a.beatTimes, a.beatStrengths, s.beatEdits, musicSrc);
      pending = serializeBeats(merged.times, merged.strengths, audio);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, PERSIST_DEBOUNCE_MS);
    };

    setBeatPersist(persist);
    return () => {
      if (timer) clearTimeout(timer);
      flush(); // write the last pending edit before tearing down
      setBeatPersist(null);
    };
  }, [musicSrc, setBeatPersist]);
}
