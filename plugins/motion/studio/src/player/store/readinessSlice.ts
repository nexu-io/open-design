/** Gates `timelineReady` on the composition's declared readiness inputs
 * (media, compute, and the paint-and-idle default) instead of just a known
 * duration. The generation counter is module-scope, not store state: it
 * guards an in-flight settlement, not something a component reads, so
 * bumping it shouldn't trigger a render. */
import type { StoreApi } from "zustand";
import { settleCompositionReadiness } from "@hyperframes/core/composition-readiness";

export interface PlaybackReadinessSlice {
  timelineReady: boolean;
  /** Latched when the project's first preview shows its first frame (or fails), kept through edit
   *  reloads, so work that must not compete with the boot waits for it once. */
  previewBooted: boolean;
  setTimelineReady: (ready: boolean) => void;
  markPreviewBooted: () => void;
  playLocked: boolean;
  setPlayLocked: (locked: boolean) => void;
  /** Sets timelineReady once doc's readiness inputs settle, or immediately
   *  if doc is null. A wait a later call supersedes never wins the race.
   *  Waits for doc's load step first: it pauses and rewinds the preview, so a
   *  Play enabled before it would be undone. */
  requestTimelineReady: (doc: Document | null) => void;
  /** Called by the preview's load step for the document it ran on. */
  markPreviewLoadStep: (doc: Document) => void;
}

let timelineReadyGeneration = 0;
const loadStepDocs = new WeakSet<Document>();
let awaitingLoadStep: { doc: Document; generation: number } | null = null;

/** For a full timeline reset: bumps the generation so any requestTimelineReady
 * wait in flight can never resolve into what replaced it. */
export function resetPlaybackReadinessState(): Pick<
  PlaybackReadinessSlice,
  "timelineReady" | "previewBooted"
> {
  timelineReadyGeneration++;
  return { timelineReady: false, previewBooted: false };
}

export function createPlaybackReadinessSlice(
  set: StoreApi<PlaybackReadinessSlice>["setState"],
): PlaybackReadinessSlice {
  const settle = (doc: Document, generation: number) =>
    settleCompositionReadiness(doc, () => {
      if (generation === timelineReadyGeneration) set({ timelineReady: true });
    });
  return {
    timelineReady: false,
    previewBooted: false,
    markPreviewBooted: () => set({ previewBooted: true }),
    playLocked: false,
    setPlayLocked: (locked) => set({ playLocked: locked }),
    setTimelineReady: (ready) => {
      timelineReadyGeneration++;
      set({ timelineReady: ready });
    },
    requestTimelineReady: (doc) => {
      const generation = ++timelineReadyGeneration;
      if (!doc) return set({ timelineReady: true });
      if (!loadStepDocs.has(doc)) {
        awaitingLoadStep = { doc, generation };
        return;
      }
      settle(doc, generation);
    },
    markPreviewLoadStep: (doc) => {
      loadStepDocs.add(doc);
      if (awaitingLoadStep?.doc !== doc) return;
      const { generation } = awaitingLoadStep;
      awaitingLoadStep = null;
      settle(doc, generation);
    },
  };
}
