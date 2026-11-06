// Loads a full-reload edit in a hidden shadow iframe and promotes it once painted,
// so the live iframe never shows a blank frame.

import { useCallback, useRef, useState } from "react";
import { useMountEffect } from "../../hooks/useMountEffect";
import {
  afterStudioManualEditGestures,
  isStudioManualEditGestureLiveIn,
  studioManualEditSavesIn,
} from "../../components/editor/manualEditsDom";
import { refusedPreviewStatus } from "@hyperframes/core/studio-preview-mark";
import { logReload } from "../../utils/reloadDebug";
import {
  useTimelineSyncCallbacks,
  planShadowReload,
  planShadowPromotion,
  planShadowDiscard,
  type PreviewIframeSlot,
  type UseTimelineSyncCallbacksParams,
} from "./useTimelineSyncCallbacks";
import type { IframeWindow, PlaybackAdapter } from "../lib/playbackTypes";
import { setPreviewReloading } from "../previewReloading";
import { studioFileRevision } from "../../utils/studioFileVersion";
import { announcePreviewPromoted } from "../sceneSwap";
import { afterStudioPendingEdits, isStudioEditSaving } from "../../utils/studioPendingEdits";
import { usePlayerStore } from "../store/playerStore";
import { READY_TIMEOUT_CAUSE, useShadowReloadRetry } from "./useShadowReloadRetry";

// One wait budget for a shadow: the player's 8s asset cap plus its 0.42s loader fade
// leaves about 6.5s for the document load and runtime boot. Nothing shorter may fail the swap.
// Spent only while frames are drawn (readiness needs them); a hidden tab or a covered Linux window draws none.
export const SHADOW_READY_TIMEOUT_MS = 15_000;
// A busy machine can need more than one budget; the shadow keeps loading for this many before it is dropped.
export const SHADOW_READY_BUDGETS = 3;

function restoreSeekPainted(iframe: HTMLIFrameElement | null): Promise<void> | undefined {
  const win = iframe?.contentWindow as IframeWindow | null | undefined;
  return win?.__hfWaitForSeekCompletion?.().catch(() => {});
}

function shadowPlayerReachable(iframe: HTMLIFrameElement | null): boolean {
  try {
    return Boolean((iframe?.contentWindow as IframeWindow | null | undefined)?.__player);
  } catch {
    return false;
  }
}

function shadowPagePhase(iframe: HTMLIFrameElement | null): string {
  const doc = iframe?.contentDocument;
  if (!doc || doc.URL === "about:blank") return "no-page";
  const win = iframe!.contentWindow as unknown as Record<string, unknown>;
  if (doc.readyState === "loading") return "page-loading";
  if (win.__hfStartupError) return "startup-error";
  if (!win.__hyperframes) return "runtime-not-run";
  if (!win.__hyperframeRuntimeBootstrapped) return "scripts-waiting";
  return "no-player";
}

const pageGotTo = (iframe: HTMLIFrameElement | null) =>
  shadowPlayerReachable(iframe) ? "" : ` Its page had got to: ${shadowPagePhase(iframe)}.`;

function isDocumentHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

type UseShadowPreviewReloadParams = Omit<
  UseTimelineSyncCallbacksParams,
  | "probeIntervalRef"
  | "onAdapterReady"
  | "getAdapter"
  | "isCurrent"
  | "onLoadGiveUp"
  | "hostOwnsDeadline"
> & {
  getAdapter: (overrideIframe?: HTMLIFrameElement | null) => PlaybackAdapter | null;
  /** Runs right after a shadow becomes the live iframe (iframeRef already points at it). */
  onPromoted?: () => void;
  /** A shadow that never became ready was dropped; the live preview is unchanged. */
  onReloadFailed?: (message: string) => void;
  /** Puts the promoted document at the live frame's time, playing if the live frame was. */
  handOverPlayback: (time: number, playing: boolean) => void;
};

export function useShadowPreviewReload({
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
  onPromoted,
  onReloadFailed,
  handOverPlayback,
}: UseShadowPreviewReloadParams) {
  const shadowIframeRef = useRef<HTMLIFrameElement | null>(null);
  const shadowProbeIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  // Invalidation counter, separate from the live slot's key: bumping it never remounts the live Player.
  const shadowGenRef = useRef(0);
  const pendingCommitRef = useRef<{ gen: number; commit: () => void } | null>(null);
  const visuallyReadyGenRef = useRef<number | null>(null);
  const onPromotedRef = useRef(onPromoted);
  onPromotedRef.current = onPromoted;
  const onReloadFailedRef = useRef(onReloadFailed);
  onReloadFailedRef.current = onReloadFailed;
  const handOverPlaybackRef = useRef(handOverPlayback);
  handOverPlaybackRef.current = handOverPlayback;
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const budgetsSpentRef = useRef(0);
  // The shadow still owed a wait budget, so a hidden tab can resume it when it becomes visible.
  const budgetGenRef = useRef<number | null>(null);
  const cancelPendingLoadRef = useRef<() => void>(() => {});
  const stopHoldRef = useRef<() => void>(() => {});
  const shadowUrlRef = useRef("");
  const savesAtRequestRef = useRef(0);
  const revisionAtRequestRef = useRef(0);
  const beginShadowReloadRef = useRef<(url: string) => void>(() => {});
  const retry = useShadowReloadRetry(shadowGenRef, shadowUrlRef, beginShadowReloadRef);
  const promoteWhenReadyRef = useRef<(gen: number) => void>(() => {});
  const [previewSlots, setPreviewSlots] = useState<PreviewIframeSlot[]>([{ gen: 0, role: "live" }]);

  const stopPendingShadow = useCallback(() => {
    clearTimeout(readyTimerRef.current);
    budgetGenRef.current = null;
    cancelPendingLoadRef.current();
    stopHoldRef.current();
    pendingCommitRef.current = null;
    visuallyReadyGenRef.current = null;
  }, []);

  const failShadow = useCallback(
    (gen: number, cause: string) => {
      if (gen !== shadowGenRef.current) return;
      const waitingFor = !shadowPlayerReachable(shadowIframeRef.current)
        ? "the page and its runtime to load"
        : pendingCommitRef.current?.gen !== gen
          ? "its timeline to be ready"
          : "its loaders to clear";
      const got = pageGotTo(shadowIframeRef.current);
      shadowGenRef.current += 1;
      const failedGen = shadowGenRef.current;
      stopPendingShadow();
      shadowIframeRef.current = null;
      isRefreshingRef.current = false;
      pendingSeekRef.current = null;
      setPreviewSlots(planShadowDiscard);
      setPreviewReloading(false);
      const message = `The preview did not reload (${cause}). It was still waiting for ${waitingFor}.${got} The previous preview is still showing.`;
      logReload("shadow-failed", { cause, waitingFor });
      const refused = refusedPreviewStatus(cause);
      const pageMissingNow = refused !== null && refused < 500;
      (pageMissingNow ? console.warn : console.error)(`[studio] ${message}`);
      onReloadFailedRef.current?.(message);
      retry.afterFailure(cause, failedGen);
    },
    [stopPendingShadow, retry, isRefreshingRef, pendingSeekRef],
  );

  const gestureSavesOnScreen = useCallback(() => {
    const liveDoc = iframeRef.current?.contentDocument;
    return liveDoc ? studioManualEditSavesIn(liveDoc) : 0;
  }, [iframeRef]);

  const waitThenRetry = useCallback(
    (gen: number, why: string, wait: (retry: () => void) => () => void) => {
      clearTimeout(readyTimerRef.current);
      budgetGenRef.current = null;
      stopHoldRef.current();
      logReload("shadow-held", { gen, why });
      stopHoldRef.current = wait(() => {
        logReload("shadow-hold-ended", { gen, why });
        promoteWhenReadyRef.current(gen);
      });
      return true;
    },
    [],
  );

  // Nothing replaces the preview under a gesture, and a shadow requested before a write
  // shows the file before it: once that write has landed, a fresh one loads instead.
  const heldOrStale = useCallback(
    (gen: number) => {
      const liveDoc = iframeRef.current?.contentDocument;
      if (liveDoc && isStudioManualEditGestureLiveIn(liveDoc))
        return waitThenRetry(gen, "gesture", (retry) =>
          afterStudioManualEditGestures(liveDoc, retry),
        );
      if (
        gestureSavesOnScreen() === savesAtRequestRef.current &&
        studioFileRevision() === revisionAtRequestRef.current
      )
        return false;
      if (isStudioEditSaving()) return waitThenRetry(gen, "save", afterStudioPendingEdits);
      logReload("shadow-reloaded-after-gesture-save", { gen });
      const url = new URL(shadowUrlRef.current, window.location.origin);
      url.searchParams.set("_t", String(Date.now()));
      beginShadowReloadRef.current(url.toString());
      return true;
    },
    [iframeRef, gestureSavesOnScreen, waitThenRetry],
  );

  const shadowReadyToPromote = useCallback((gen: number) => {
    const shadow = shadowIframeRef.current;
    const pending = pendingCommitRef.current;
    const ready = pending?.gen === gen && visuallyReadyGenRef.current === gen;
    return shadow && pending && ready && gen === shadowGenRef.current ? { shadow, pending } : null;
  }, []);

  const promoteWhenReady = useCallback(
    (gen: number) => {
      const promotable = shadowReadyToPromote(gen);
      if (!promotable || heldOrStale(gen)) return;
      const { shadow, pending } = promotable;
      stopPendingShadow();
      // The live frame kept playing, stopped at the end or was seeked while the shadow loaded.
      const live = getAdapter();
      const liveTime = live?.getTime();
      const playing = usePlayerStore.getState().isPlaying;
      live?.pause();
      // The store takes the new document's timeline only now that it is the one on screen, and reads it there.
      const retired = iframeRef.current;
      iframeRef.current = shadow;
      pending.commit();
      shadowIframeRef.current = null;
      attachIframeShortcutListeners();
      applyPreviewAudioState();
      setPreviewSlots((prev) => planShadowPromotion(prev, gen));
      if (liveTime != null) handOverPlaybackRef.current(liveTime, playing);
      announcePreviewPromoted({ retired, live: shadow });
      onPromotedRef.current?.();
      setPreviewReloading(false);
    },
    [
      stopPendingShadow,
      shadowReadyToPromote,
      heldOrStale,
      getAdapter,
      iframeRef,
      attachIframeShortcutListeners,
      applyPreviewAudioState,
    ],
  );
  promoteWhenReadyRef.current = promoteWhenReady;

  const getShadowAdapter = useCallback(() => getAdapter(shadowIframeRef.current), [getAdapter]);
  const isCurrentShadow = useCallback((gen?: number) => gen === shadowGenRef.current, []);
  const previewGeneration = useCallback(() => shadowGenRef.current, []);
  const markAdapterReady = useCallback(
    (iframe: HTMLIFrameElement | null, gen: number | undefined, commit: () => void) => {
      if (gen == null || gen !== shadowGenRef.current) return;
      const register = () => {
        if (gen !== shadowGenRef.current) return;
        pendingCommitRef.current = { gen, commit };
        promoteWhenReady(gen);
      };
      const painted = restoreSeekPainted(iframe);
      if (painted) void painted.then(register);
      else register();
    },
    [promoteWhenReady],
  );

  const { onIframeLoad: onShadowIframeLoad, cancelPendingLoad } = useTimelineSyncCallbacks({
    iframeRef: shadowIframeRef,
    probeIntervalRef: shadowProbeIntervalRef,
    pendingSeekRef,
    isRefreshingRef,
    getAdapter: getShadowAdapter,
    syncTimelineElements,
    setDuration,
    setCurrentTime,
    requestTimelineReady,
    setIsPlaying,
    // A hidden shadow gets neither: shortcuts and audio state apply once it is promoted.
    attachIframeShortcutListeners: () => {},
    applyPreviewAudioState: () => {},
    onAdapterReady: markAdapterReady,
    isCurrent: isCurrentShadow,
    hostOwnsDeadline: true,
  });
  cancelPendingLoadRef.current = cancelPendingLoad;

  // The Player reports whether loaders (shader transition, assets) are cleared right now.
  const onShadowReadyChange = useCallback(
    (gen: number, ready: boolean) => {
      if (gen !== shadowGenRef.current) return;
      visuallyReadyGenRef.current = ready ? gen : null;
      if (ready) promoteWhenReady(gen);
    },
    [promoteWhenReady],
  );

  const setShadowIframeNode = useCallback((node: HTMLIFrameElement | null) => {
    shadowIframeRef.current = node;
  }, []);

  const armReadyTimer = useCallback(
    (gen: number) => {
      clearTimeout(readyTimerRef.current);
      if (isDocumentHidden()) return;
      let drew = false;
      let starved = false;
      requestAnimationFrame(() => {
        if (!starved) drew = true;
        else if (budgetGenRef.current === gen) armReadyTimerRef.current(gen);
      });
      readyTimerRef.current = setTimeout(() => {
        if (gen !== shadowGenRef.current) return;
        if (!drew) {
          starved = true;
          logReload("shadow-starved", { gen });
          return;
        }
        budgetsSpentRef.current += 1;
        if (budgetsSpentRef.current < SHADOW_READY_BUDGETS) {
          logReload("shadow-slow", { budgetsSpent: budgetsSpentRef.current });
          armReadyTimerRef.current(gen);
          return;
        }
        failShadow(gen, READY_TIMEOUT_CAUSE);
      }, SHADOW_READY_TIMEOUT_MS);
    },
    [failShadow],
  );
  const armReadyTimerRef = useRef(armReadyTimer);
  armReadyTimerRef.current = armReadyTimer;

  const beginShadowReload = useCallback(
    (url: string) => {
      retry.started();
      shadowGenRef.current += 1;
      const gen = shadowGenRef.current;
      stopPendingShadow();
      budgetGenRef.current = gen;
      budgetsSpentRef.current = 0;
      shadowUrlRef.current = url;
      savesAtRequestRef.current = gestureSavesOnScreen();
      revisionAtRequestRef.current = studioFileRevision();
      armReadyTimer(gen);
      setPreviewSlots((prev) => planShadowReload(prev, gen, url));
      // Thumbnails of the edit wait for the new preview instead of competing with it.
      setPreviewReloading(true);
    },
    [retry, stopPendingShadow, armReadyTimer, gestureSavesOnScreen],
  );
  beginShadowReloadRef.current = beginShadowReload;

  // Composition switch (not an edit reload): drop any in-flight shadow.
  const resetPreviewSlots = useCallback(() => {
    retry.cancel();
    shadowGenRef.current += 1;
    stopPendingShadow();
    shadowIframeRef.current = null;
    isRefreshingRef.current = false;
    pendingSeekRef.current = null;
    usePlayerStore.getState().setTimelineReady(false);
    setPreviewSlots(planShadowDiscard);
    setPreviewReloading(false);
  }, [retry, stopPendingShadow, isRefreshingRef, pendingSeekRef]);

  // Hiding the tab pauses the budget; showing it again restarts the full budget for a pending shadow.
  useMountEffect(() => {
    const onVisibilityChange = () => {
      if (isDocumentHidden()) {
        clearTimeout(readyTimerRef.current);
        return;
      }
      const gen = budgetGenRef.current;
      if (gen != null && gen === shadowGenRef.current) armReadyTimerRef.current(gen);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      retry.cancel();
      stopPendingShadow();
      setPreviewReloading(false);
    };
  });

  return {
    previewSlots,
    onShadowIframeLoad,
    onShadowReadyChange,
    onShadowError: failShadow,
    setShadowIframeNode,
    beginShadowReload,
    resetPreviewSlots,
    previewGeneration,
  };
}
