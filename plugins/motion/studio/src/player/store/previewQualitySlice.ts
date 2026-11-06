import type { StoreApi } from "zustand";
import { isPreviewQuality, type PreviewQuality } from "@hyperframes/core/preview-quality";
import type { MediaLoadFailure } from "@hyperframes/core/runtime/protocol";
import { readStudioUiPreferences, writeStudioUiPreferences } from "../../utils/studioUiPreferences";

/** The lighter copies of heavy videos the preview wants at its current quality. */
export interface PreviewCopies {
  total: number;
  ready: number;
  failed: number;
  progress: number | null;
  error: string | null;
}

/** How playback went over the last few seconds of play; null while paused, seeking or warming up. */
export interface PlaybackHealth {
  droppedShare: number;
  seconds: number;
  choppy: boolean;
  fps: number;
  worstFrameMs: number;
  skippedShare?: number;
  waitingShare?: number;
  frozenShare?: number;
  gapP50Ms?: number;
  gapP95Ms?: number;
  clockSource?: "audio" | "webaudio" | "monotonic";
  mode: "play";
}

/** What the preview holds, counts and classes only, filled when asked for. */
export interface PreviewFacts {
  sceneCount: number;
  mountedElementCount: number;
  durationSeconds: number;
  videos: Array<{ codec: string; width: number; height: number; bitDepth: number; count: number }>;
  lighterAt: PreviewQuality[];
  copiesReady: boolean;
}

export type PreviewQualityChosenBy = "person" | "app";

export interface PreviewQualitySlice {
  previewQuality: PreviewQuality;
  /** Who set the level: a person (saved level, or a pick) or the app (never saved); null while nothing has. */
  previewQualityChosenBy: PreviewQualityChosenBy | null;
  /** A person's pick is saved; `by: "app"` sets the level without saving it and never overrides a saved pick. */
  setPreviewQuality: (level: PreviewQuality, options?: { by?: PreviewQualityChosenBy }) => void;
  /** Null when no copies are wanted: full quality, or nothing heavy. */
  previewCopies: PreviewCopies | null;
  setPreviewCopies: (copies: PreviewCopies | null) => void;
  /** Bumped by retryPreviewCopies; the preview owner forwards each bump to the runtime. */
  previewCopiesRetry: number;
  retryPreviewCopies: () => void;
  playbackHealth: PlaybackHealth | null;
  setPlaybackHealth: (health: PlaybackHealth | null) => void;
  previewFacts: PreviewFacts | null;
  setPreviewFacts: (facts: PreviewFacts | null) => void;
  mediaLoadFailure: MediaLoadFailure | null;
  setMediaLoadFailure: (failure: MediaLoadFailure | null) => void;
  /** Bumped by requestPreviewFacts; the preview owner forwards each bump and the answer lands in previewFacts. */
  previewFactsRequests: number;
  requestPreviewFacts: () => void;
}

export function createPreviewQualitySlice(
  set: StoreApi<PreviewQualitySlice>["setState"],
  get: StoreApi<PreviewQualitySlice>["getState"],
): PreviewQualitySlice {
  const saved = readStudioUiPreferences().previewQuality;
  return {
    previewQuality: saved ?? 1,
    previewQualityChosenBy: saved === undefined ? null : "person",
    setPreviewQuality: (previewQuality, options) => {
      // A health reading belongs to the level it was measured at; drop it in the same update as the level.
      const stale = previewQuality === get().previewQuality ? {} : { playbackHealth: null };
      if (options?.by === "app") {
        if (get().previewQualityChosenBy !== "person") {
          set({ previewQuality, previewQualityChosenBy: "app", ...stale });
        }
        return;
      }
      writeStudioUiPreferences({ previewQuality });
      set({ previewQuality, previewQualityChosenBy: "person", ...stale });
    },
    previewCopies: null,
    setPreviewCopies: (previewCopies) => set({ previewCopies }),
    previewCopiesRetry: 0,
    retryPreviewCopies: () =>
      set((state) => ({ previewCopiesRetry: state.previewCopiesRetry + 1 })),
    playbackHealth: null,
    setPlaybackHealth: (playbackHealth) => set({ playbackHealth }),
    previewFacts: null,
    setPreviewFacts: (previewFacts) => set({ previewFacts }),
    mediaLoadFailure: null,
    setMediaLoadFailure: (mediaLoadFailure) => set({ mediaLoadFailure }),
    previewFactsRequests: 0,
    requestPreviewFacts: () =>
      set((state) => ({ previewFactsRequests: state.previewFactsRequests + 1 })),
  };
}

/** The runtime's report, kept only when it has the shape of one. */
export function parsePreviewCopies(value: unknown): PreviewCopies | null {
  if (typeof value !== "object" || value === null) return null;
  const { total, ready, failed, progress, error } = value as Record<string, unknown>;
  const counts = [total, ready, failed].every((count) => typeof count === "number");
  if (!counts || typeof progress !== "number") return null;
  return {
    total: total as number,
    ready: ready as number,
    failed: failed as number,
    progress,
    error: typeof error === "string" ? error : null,
  };
}

const optionalNumber = (n: unknown) => (typeof n === "number" ? n : undefined);
const CLOCK_SOURCES = ["audio", "webaudio", "monotonic"] as const;
const optionalClock = (clock: unknown) => CLOCK_SOURCES.find((known) => known === clock);

export function parsePlaybackHealth(value: unknown): PlaybackHealth | null {
  if (typeof value !== "object" || value === null) return null;
  const extra = value as Record<string, unknown>;
  const { droppedShare, seconds, choppy, fps, worstFrameMs } = value as Record<string, unknown>;
  const numbers = [droppedShare, seconds, fps, worstFrameMs].every((n) => typeof n === "number");
  if (!numbers || typeof choppy !== "boolean") return null;
  return {
    droppedShare: droppedShare as number,
    seconds: seconds as number,
    choppy,
    fps: fps as number,
    worstFrameMs: worstFrameMs as number,
    skippedShare: optionalNumber(extra.skippedShare),
    waitingShare: optionalNumber(extra.waitingShare),
    frozenShare: optionalNumber(extra.frozenShare),
    gapP50Ms: optionalNumber(extra.gapP50Ms),
    gapP95Ms: optionalNumber(extra.gapP95Ms),
    clockSource: optionalClock(extra.clockSource),
    mode: "play",
  };
}

export function parsePreviewFacts(value: unknown): PreviewFacts | null {
  if (typeof value !== "object" || value === null) return null;
  const { sceneCount, mountedElementCount, durationSeconds, videos, copiesReady, lighterAt } =
    value as Record<string, unknown>;
  const numbers = [sceneCount, mountedElementCount, durationSeconds].every(
    (n) => typeof n === "number",
  );
  if (!numbers || !Array.isArray(videos) || typeof copiesReady !== "boolean") return null;
  const grouped = videos.flatMap((video: unknown) => {
    if (typeof video !== "object" || video === null) return [];
    const { codec, width, height, bitDepth, count } = video as Record<string, unknown>;
    const ok =
      typeof codec === "string" &&
      [width, height, bitDepth, count].every((n) => typeof n === "number");
    return ok
      ? [
          {
            codec,
            width: width as number,
            height: height as number,
            bitDepth: bitDepth as number,
            count: count as number,
          },
        ]
      : [];
  });
  return {
    lighterAt: Array.isArray(lighterAt) ? lighterAt.filter(isPreviewQuality) : [],
    sceneCount: sceneCount as number,
    mountedElementCount: mountedElementCount as number,
    durationSeconds: durationSeconds as number,
    videos: grouped,
    copiesReady,
  };
}
