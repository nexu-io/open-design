import { useRef, useCallback, useEffect } from "react";
import { usePlayerStore, liveTime, type TimelineElement } from "../store/playerStore";
import { useMountEffect } from "../../hooks/useMountEffect";
import { usePlaybackKeyboard } from "./usePlaybackKeyboard";
import { useTimelineSyncCallbacks } from "./useTimelineSyncCallbacks";
import { useShadowPreviewReload } from "./useShadowPreviewReload";
import { resolvePlaybackAdapter } from "./playbackAdapterResolution";
import { subscribePreviewFrame, transportAdapter } from "../store/previewFrameStore";
import { clampToDuration } from "../lib/time";
import { useTimelinePlayerLoop } from "./useTimelinePlayerLoop";
import { logReload } from "../../utils/reloadDebug";

export type { ClipManifestClip } from "../lib/playbackTypes";
export { createStaticSeekPlaybackAdapter } from "../lib/playbackAdapter";
export {
  buildStandaloneRootTimelineElement,
  createTimelineElementFromManifestClip,
  findTimelineDomNodeForClip,
  getTimelineElementSelector,
  mergeTimelineElementsPreservingDowngrades,
  parseTimelineFromDOM,
  readTimelineDurationFromDocument,
  resolveStandaloneRootCompositionSrc,
} from "../lib/timelineDOM";
export {
  shouldIgnorePlaybackShortcutEvent,
  shouldIgnorePlaybackShortcutTarget,
} from "../lib/playbackShortcuts";

import type { PlaybackAdapter, IframeWindow } from "../lib/playbackTypes";
import { releaseStaticSeekCache, type StaticSeekCacheEntry } from "../lib/playbackAdapter";
import { mergeTimelineElementsPreservingDowngrades } from "../lib/timelineDOM";
import { findTimelineElementInIframe } from "../../hooks/timelineEditingHelpers";
import { normalizeToZones } from "../components/timelineZones";
import { applyPreviewAudioFlags, setPreviewPlaybackRate } from "../lib/timelineIframeHelpers";
import { scrubMusicAtSeek, stopScrubPreviewAudio } from "../lib/playbackScrub";
import { hasTimelinePerformanceFixtureLease } from "../lib/timelinePerformanceFixture";
import { applyCachedSourceDurations, probeMissingSourceDurations } from "../lib/mediaProbe";
import { shouldResumeForwardPlaybackAfterSeek, shouldStopAfterSeek } from "../lib/playbackSeek";
import { applyPreviewVariablesToUrl } from "../../hooks/previewVariablesStore";
import { isStudioManualEditGestureLiveIn } from "../../components/editor/manualEditsDom";
import { createPreviewMessageHandler } from "./previewMessageRouter";
import { usePreviewQualityForwarding } from "./usePreviewQualityForwarding";
import { timelineElementsChanged } from "./timelinePlayerSync";
import { safeContentDocument } from "./timelineSyncHydration";
import { sceneSwapFor, supersededByNewerEdit, swapFreshly } from "../sceneSwap";

export interface UseTimelinePlayerOptions {
  /** Runs right after a reloaded preview becomes the live iframe. */
  onShadowPromoted?: () => void;
  /** A reload was abandoned (cause in the message); the previous preview is still showing. */
  onPreviewReloadFailed?: (message: string) => void;
}

const publishSeek = (time: number, options?: { follow?: boolean }) =>
  options?.follow === false ? liveTime.notify(time) : liveTime.notifySeek(time);

// fallow-ignore-next-line complexity
export function useTimelinePlayer({
  onShadowPromoted,
  onPreviewReloadFailed,
}: UseTimelinePlayerOptions = {}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const rafRef = useRef<number>(0);
  const probeIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const pendingSeekRef = useRef<number | null>(null);
  const isRefreshingRef = useRef(false);
  const reverseRafRef = useRef<number>(0);
  const shuttleDirectionRef = useRef<"forward" | "backward" | null>(null);
  const shuttleSpeedIndexRef = useRef(0);
  const iframeShortcutCleanupRef = useRef<(() => void) | null>(null);
  const lastTimelineMessageRef = useRef<number>(0);
  const staticSeekAdapterRef = useRef<StaticSeekCacheEntry | null>(null);
  const staticSeekWarnedRef = useRef(false);

  const { setIsPlaying, setCurrentTime, setDuration, requestTimelineReady, setElements } =
    usePlayerStore.getState();

  // The fixture lease belongs at this shared synchronization boundary so every
  // iframe discovery path has the same owner for deciding whether it may write.
  const syncTimelineElements = useCallback(
    // fallow-ignore-next-line complexity
    (elements: TimelineElement[], nextDuration?: number) => {
      if (hasTimelinePerformanceFixtureLease()) return;
      const state = usePlayerStore.getState();
      const resolvedDuration = nextDuration ?? state.duration;
      // applyCachedSourceDurations re-applies the cached probe duration: re-derived
      // elements (e.g. after a clip move) can arrive without sourceDuration, which
      // otherwise makes trimmed waveforms lose their window.
      // Enforced CapCut zoning (overlay → main → audio): normalize track indices
      // on every discovery. Idempotent — already-zoned input is returned as-is, so
      // drops persist zoned indices and reloads re-zone to the same (no drift).
      const mergedElements = normalizeToZones(
        applyCachedSourceDurations(
          mergeTimelineElementsPreservingDowngrades(
            state.elements,
            elements,
            state.duration,
            resolvedDuration,
            (element) =>
              findTimelineElementInIframe(iframeRef.current, {
                ...element,
                kind: "composition",
              }) !== null,
          ),
          state.timelineProjectId,
        ),
      );

      if (timelineElementsChanged(state.elements, mergedElements)) {
        setElements(mergedElements);
      }
      if (
        Number.isFinite(nextDuration) &&
        (nextDuration ?? 0) > 0 &&
        nextDuration !== state.duration
      ) {
        setDuration(nextDuration ?? 0);
      }
      if (!state.timelineReady) {
        // Same gate as initializeAdapter's own readiness wait: this is the
        // message-based fallback for compositions that report their duration
        // via clip manifest rather than the direct adapter, and it must not
        // enable Play any earlier than that path does.
        requestTimelineReady(safeContentDocument(iframeRef.current));
      }

      // Asynchronously enrich media elements still missing sourceDuration
      // (header-only probe, cheap), applying each resolved value to the store.
      void probeMissingSourceDurations(
        mergedElements,
        state.timelineProjectId,
        (key, durationSeconds) => {
          usePlayerStore.setState((state) => {
            const idx = state.elements.findIndex((e) => (e.key ?? e.id) === key);
            if (idx === -1 || state.elements[idx].sourceDuration != null) return state;
            const patched = state.elements.slice();
            patched[idx] = { ...state.elements[idx], sourceDuration: durationSeconds };
            return { elements: patched };
          });
        },
      );
    },
    [setElements, requestTimelineReady, setDuration],
  );

  const getAdapter = useCallback(
    (overrideIframe?: HTMLIFrameElement | null): PlaybackAdapter | null => {
      try {
        // undefined means "no override"; an explicit null override means "no adapter".
        const iframe = overrideIframe !== undefined ? overrideIframe : iframeRef.current;
        const win = iframe?.contentWindow as IframeWindow | null;
        if (!iframe || !win) return null;
        const adapter = resolvePlaybackAdapter(iframe, win, {
          cache: staticSeekAdapterRef,
          warned: staticSeekWarnedRef,
        });
        return transportAdapter(adapter);
      } catch {
        return null;
      }
    },
    [],
  );

  const setLoopStart = useCallback((seconds: number | null) => {
    try {
      (iframeRef.current?.contentWindow as IframeWindow | null)?.__hf?.setLoopStart?.(seconds);
    } catch {}
  }, []);
  const { startRAFLoop, stopRAFLoop, stopReverseLoop } = useTimelinePlayerLoop({
    rafRef,
    reverseRafRef,
    getAdapter,
    setCurrentTime,
    setIsPlaying,
    setLoopStart,
  });

  const applyPlaybackRate = useCallback((rate: number) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    setPreviewPlaybackRate(iframe, rate);
    // Also set directly on GSAP timeline if accessible
    try {
      const win = iframe.contentWindow as IframeWindow | null;
      if (win?.__timelines) {
        for (const tl of Object.values(win.__timelines)) {
          if (
            tl &&
            typeof (tl as unknown as { timeScale?: (v: number) => void }).timeScale === "function"
          ) {
            (tl as unknown as { timeScale: (v: number) => void }).timeScale(rate);
          }
        }
      }
    } catch {}
  }, []);
  const applyPreviewAudioState = useCallback(() => {
    const { audioMuted, audioVolume } = usePlayerStore.getState();
    applyPreviewAudioFlags(iframeRef.current, audioMuted, audioVolume);
  }, []);
  const play = useCallback(() => {
    const { timelineReady, playLocked } = usePlayerStore.getState();
    if (!timelineReady || playLocked) return;
    stopRAFLoop();
    stopReverseLoop();
    stopScrubPreviewAudio();
    const adapter = getAdapter();
    if (!adapter) return;
    if (adapter.getTime() >= adapter.getDuration()) {
      adapter.seek(usePlayerStore.getState().inPoint ?? 0);
    }
    applyPlaybackRate(usePlayerStore.getState().playbackRate);
    applyPreviewAudioState();
    adapter.play();
    shuttleDirectionRef.current = "forward";
    setIsPlaying(true);
    startRAFLoop();
  }, [
    getAdapter,
    setIsPlaying,
    startRAFLoop,
    applyPlaybackRate,
    applyPreviewAudioState,
    stopRAFLoop,
    stopReverseLoop,
  ]);
  const playBackward = useCallback(
    (rate: number) => {
      stopRAFLoop();
      stopReverseLoop();
      const adapter = getAdapter();
      if (!adapter) return;
      const duration = Math.max(0, adapter.getDuration());
      const initialTime = adapter.getTime() <= 0 && duration > 0 ? duration : adapter.getTime();
      adapter.pause();
      if (initialTime !== adapter.getTime()) adapter.seek(initialTime);
      const speed = Math.max(0.1, Math.min(4, rate));
      applyPlaybackRate(speed);
      applyPreviewAudioState();
      let startTime = initialTime;
      let startedAt = performance.now();

      const tick = (now: number) => {
        const elapsed = ((now - startedAt) / 1000) * speed;
        let nextTime = startTime - elapsed;
        const { inPoint, outPoint } = usePlayerStore.getState();
        const rawLoopEnd = outPoint !== null ? Math.min(outPoint, duration) : duration;
        const rawLoopStart = inPoint !== null ? inPoint : 0;
        const loopEnd = rawLoopStart < rawLoopEnd ? rawLoopEnd : duration;
        const loopStart = rawLoopStart < rawLoopEnd ? rawLoopStart : 0;
        if (nextTime <= loopStart) {
          if (usePlayerStore.getState().loopEnabled && duration > 0) {
            startTime = loopEnd;
            startedAt = now;
            nextTime = loopEnd;
          } else {
            adapter.seek(loopStart);
            liveTime.notify(loopStart);
            setCurrentTime(loopStart);
            setIsPlaying(false);
            shuttleDirectionRef.current = null;
            reverseRafRef.current = 0;
            return;
          }
        }
        adapter.seek(Math.max(0, nextTime));
        liveTime.notify(Math.max(0, nextTime));
        setIsPlaying(true);
        reverseRafRef.current = requestAnimationFrame(tick);
      };

      setIsPlaying(true);
      shuttleDirectionRef.current = "backward";
      reverseRafRef.current = requestAnimationFrame(tick);
    },
    [
      getAdapter,
      setCurrentTime,
      setIsPlaying,
      applyPlaybackRate,
      applyPreviewAudioState,
      stopRAFLoop,
      stopReverseLoop,
    ],
  );
  const pause = useCallback(() => {
    stopReverseLoop();
    const adapter = getAdapter();
    adapter?.pause();
    if (adapter) setCurrentTime(adapter.getTime()); // sync store so Split/Delete have accurate time
    setIsPlaying(false);
    shuttleDirectionRef.current = null;
    shuttleSpeedIndexRef.current = 0;
    stopRAFLoop();
  }, [getAdapter, setCurrentTime, setIsPlaying, stopRAFLoop, stopReverseLoop]);
  const seek = useCallback(
    (time: number, options?: { keepPlaying?: boolean; follow?: boolean }) => {
      const wasReverseShuttle = shuttleDirectionRef.current === "backward";
      stopReverseLoop();
      const adapter = getAdapter();
      if (!adapter) {
        pendingSeekRef.current = Math.max(0, time);
        return false;
      }
      const duration = Math.max(0, adapter.getDuration());
      const nextTime = clampToDuration(time, duration);
      const keepPlaying = options?.keepPlaying === true;
      const { playLocked, isPlaying: storeWasPlaying } = usePlayerStore.getState();
      const shouldResumeAfterSeek = shouldResumeForwardPlaybackAfterSeek({
        keepPlaying,
        wasReverseShuttle,
        storeWasPlaying,
        duration,
        nextTime,
        playLocked,
      });
      adapter.seek(nextTime, options);
      publishSeek(nextTime, options); // Direct DOM updates (playhead, timecode, progress) — no re-render
      setCurrentTime(nextTime); // sync store so Split/Delete have accurate time
      if (!keepPlaying && !playLocked) scrubMusicAtSeek(iframeRef.current, nextTime);
      if (shouldResumeAfterSeek) {
        stopRAFLoop();
        applyPlaybackRate(usePlayerStore.getState().playbackRate);
        applyPreviewAudioState();
        adapter.play();
        setIsPlaying(true);
        shuttleDirectionRef.current = "forward";
        shuttleSpeedIndexRef.current = 0;
        startRAFLoop();
      } else if (shouldStopAfterSeek({ keepPlaying, wasReverseShuttle })) {
        stopRAFLoop();
        if (usePlayerStore.getState().isPlaying) setIsPlaying(false);
        shuttleDirectionRef.current = null;
        shuttleSpeedIndexRef.current = 0;
      }
      return true;
    },
    [
      getAdapter,
      pendingSeekRef,
      setCurrentTime,
      setIsPlaying,
      startRAFLoop,
      stopRAFLoop,
      stopReverseLoop,
      applyPlaybackRate,
      applyPreviewAudioState,
      shuttleDirectionRef,
      shuttleSpeedIndexRef,
    ],
  );

  useEffect(
    () =>
      usePlayerStore.subscribe((state, prev) => {
        if (state.playLocked && !prev.playLocked && state.isPlaying) pause();
      }),
    [pause],
  );
  useEffect(() => {
    return usePlayerStore.subscribe((state, prev) => {
      if (state.requestedSeekTime !== null && state.requestedSeekTime !== prev.requestedSeekTime) {
        seek(state.requestedSeekTime);
        usePlayerStore.getState().clearSeekRequest();
      }
      // Play or stop from outside the loop — the FX rack auditioning a preset
      // while paused, which is silent otherwise. `returnTo` puts the playhead
      // back where the request found it: hovering is not an edit.
      const request = state.playbackRequest;
      if (request && request.nonce !== prev.playbackRequest?.nonce) {
        if (request.playing) play();
        else {
          pause();
          if (request.returnTo !== null) seek(request.returnTo, { follow: false });
        }
        usePlayerStore.getState().clearPlaybackRequest();
      }
    });
  }, [seek, play, pause]);
  useEffect(() => subscribePreviewFrame(getAdapter), [getAdapter]);
  const { playbackKeyDownRef, playbackKeyUpRef, attachIframeShortcutListeners, togglePlay } =
    usePlaybackKeyboard({
      iframeRef,
      shuttleDirectionRef,
      shuttleSpeedIndexRef,
      iframeShortcutCleanupRef,
      getAdapter,
      play,
      playBackward,
      pause,
      seek,
    });

  const {
    processTimelineMessageRef,
    enrichMissingCompositionsRef,
    onIframeLoad,
    cancelPendingLoad,
  } = useTimelineSyncCallbacks({
    iframeRef,
    probeIntervalRef,
    pendingSeekRef,
    isRefreshingRef,
    getAdapter,
    syncTimelineElements,
    setDuration,
    setCurrentTime,
    requestTimelineReady,
    setIsPlaying,
    attachIframeShortcutListeners,
    applyPreviewAudioState,
  });

  // Full-reload edits load behind a hidden shadow iframe (useShadowPreviewReload.ts).
  const {
    previewSlots,
    onShadowIframeLoad,
    onShadowReadyChange,
    onShadowError,
    setShadowIframeNode,
    beginShadowReload,
    resetPreviewSlots,
    previewGeneration,
  } = useShadowPreviewReload({
    iframeRef,
    getAdapter,
    pendingSeekRef,
    isRefreshingRef,
    syncTimelineElements,
    setDuration,
    setCurrentTime,
    requestTimelineReady,
    setIsPlaying,
    attachIframeShortcutListeners,
    applyPreviewAudioState,
    onPromoted: onShadowPromoted,
    onReloadFailed: onPreviewReloadFailed,
    handOverPlayback: (time, playing) => {
      // keepPlaying: move the playhead without the paused-seek audio scrub.
      seek(time, { keepPlaying: true, follow: false });
      const adapter = getAdapter();
      // An edit that cut the film short of the live time stops it at the new end, as playback does.
      if (playing && adapter && adapter.getTime() < adapter.getDuration()) play();
    },
  });

  const saveSeekPosition = useCallback(() => {
    // Never DEGRADE the saved position. Overlapping reloads (e.g. an external
    // file drop = upload reload + insert reload back-to-back) call this while
    // the iframe from the FIRST reload is mid-teardown: getAdapter() can still
    // return that dying document's adapter, whose getTime() reads 0 — and the
    // store's currentTime can lag the visual playhead. Overwriting the
    // still-unconsumed pendingSeek with either value is exactly how the
    // playhead used to end up at 0 after a Finder drop (verified live via a
    // currentTime write-trace). So: while a refresh is already in flight and a
    // save exists, keep it; otherwise trust the live adapter, then the store.
    const refreshInFlight = isRefreshingRef.current && pendingSeekRef.current != null;
    if (!refreshInFlight) {
      const adapter = getAdapter();
      if (adapter) {
        pendingSeekRef.current = adapter.getTime();
      } else if (pendingSeekRef.current == null) {
        pendingSeekRef.current = usePlayerStore.getState().currentTime ?? 0;
      }
    }
    isRefreshingRef.current = true;
    // Forward playback runs on in the live frame; the promotion hands it to the new document.
    const keepPlaying =
      usePlayerStore.getState().isPlaying && shuttleDirectionRef.current !== "backward";
    stopReverseLoop();
    if (keepPlaying) return true;
    stopRAFLoop();
    setIsPlaying(false);
    return false;
  }, [getAdapter, stopRAFLoop, setIsPlaying, stopReverseLoop]);
  const reloadWholeFilm = useCallback(
    (url: string) => {
      // The old iframe is no longer navigated away, so stop its playback (and audio) here.
      if (!saveSeekPosition()) getAdapter()?.pause();
      // The live iframe is never hidden; the reload loads in a shadow and is promoted once painted.
      beginShadowReload(url);
    },
    [saveSeekPosition, getAdapter, beginShadowReload],
  );
  const refreshGenRef = useRef(0);
  const swapCancelRef = useRef<AbortController | null>(null);
  const refreshPlayer = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    swapCancelRef.current?.abort(supersededByNewerEdit());
    const cancel = new AbortController();
    swapCancelRef.current = cancel;
    logReload("refreshPlayer", () => ({ stack: new Error("refreshPlayer").stack }));
    const url = new URL(iframe.src, window.location.origin);
    url.searchParams.set("_t", String(Date.now()));
    applyPreviewVariablesToUrl(url);
    const gen = ++refreshGenRef.current;
    const slot = previewGeneration();
    // A newer edit, or anything replacing the live preview (a reload, a composition switch), wins.
    const isCurrent = () => gen === refreshGenRef.current && slot === previewGeneration();
    const swap = sceneSwapFor(iframe);
    const swapWouldReplaceGestureNode =
      !!iframe.contentDocument && isStudioManualEditGestureLiveIn(iframe.contentDocument);
    if (!swap || isRefreshingRef.current || swapWouldReplaceGestureNode)
      return reloadWholeFilm(url.toString());
    swapFreshly(swap, url, isCurrent, cancel.signal, reloadWholeFilm);
  }, [reloadWholeFilm, previewGeneration]);
  const pauseRef = useRef(pause);
  pauseRef.current = pause;

  usePreviewQualityForwarding(iframeRef);

  useMountEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent) => playbackKeyDownRef.current(e);
    const handleWindowKeyUp = (e: KeyboardEvent) => playbackKeyUpRef.current(e);

    const handleMessage = createPreviewMessageHandler({
      iframeRef,
      processTimelineMessageRef,
      enrichMissingCompositionsRef,
      lastTimelineMessageRef,
      getAdapter,
      syncTimelineElements,
    });

    const handleVisibilityChange = () => {
      if (document.hidden && usePlayerStore.getState().isPlaying) pauseRef.current();
    };

    window.addEventListener("keydown", handleWindowKeyDown, true);
    window.addEventListener("keyup", handleWindowKeyUp, true);
    window.addEventListener("message", handleMessage);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown, true);
      window.removeEventListener("keyup", handleWindowKeyUp, true);
      iframeShortcutCleanupRef.current?.();
      iframeShortcutCleanupRef.current = null;
      window.removeEventListener("message", handleMessage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopRAFLoop();
      stopReverseLoop();
      stopScrubPreviewAudio();
      releaseStaticSeekCache(staticSeekAdapterRef, staticSeekWarnedRef);
      cancelPendingLoad();
    };
  });

  const resetPlayer = useCallback(() => {
    stopRAFLoop();
    stopReverseLoop();
    cancelPendingLoad();
    usePlayerStore.getState().reset();
  }, [stopRAFLoop, stopReverseLoop, cancelPendingLoad]);

  useEffect(() => {
    return usePlayerStore.subscribe((state, prev) => {
      const playbackRateChanged = state.playbackRate !== prev.playbackRate;
      const audioMutedChanged = state.audioMuted !== prev.audioMuted;
      const audioVolumeChanged = state.audioVolume !== prev.audioVolume;
      if (!playbackRateChanged && !audioMutedChanged && !audioVolumeChanged) return;

      if (playbackRateChanged) {
        applyPlaybackRate(state.playbackRate);
      }
      applyPreviewAudioState();
    });
  }, [applyPlaybackRate, applyPreviewAudioState]);

  return {
    iframeRef,
    play,
    pause,
    togglePlay,
    seek,
    onIframeLoad,
    refreshPlayer,
    saveSeekPosition,
    resetPlayer,
    previewSlots,
    onShadowIframeLoad,
    onShadowReadyChange,
    onShadowError,
    setShadowIframeNode,
    resetPreviewSlots,
  };
}
