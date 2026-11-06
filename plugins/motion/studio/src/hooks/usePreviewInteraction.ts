import { trackPreviewFeatureUsed } from "../utils/previewFeatureUsage";
import { useCallback, useRef } from "react";
import { liveTime, usePlayerStore } from "../player";
import { pauseStudioPreviewPlayback } from "../utils/studioPreviewHelpers";
import { type DomEditSelection } from "../components/editor/domEditing";
import type { ApplyDomSelectionOptions, ResolveDomSelectionOptions } from "./useDomSelection";
import { trackStudioEvent } from "../utils/studioTelemetry";

// ── Types ──

export interface UsePreviewInteractionParams {
  captionEditMode: boolean;
  compositionLoading: boolean;
  previewIframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  showToast: (message: string, tone?: "error" | "info") => void;

  // From useDomSelection
  applyDomSelection: (
    selection: DomEditSelection | null,
    options?: ApplyDomSelectionOptions,
  ) => void;
  resolveDomSelectionFromPreviewPoint: (
    clientX: number,
    clientY: number,
    options?: ResolveDomSelectionOptions,
  ) => Promise<DomEditSelection | null>;
  resolveAllDomSelectionsFromPreviewPoint: (
    clientX: number,
    clientY: number,
  ) => Promise<DomEditSelection[]>;
  updateDomEditHoverSelection: (selection: DomEditSelection | null) => void;
  /** Drill into a group (double-click on the canvas) so its children become selectable. */
  setActiveGroupElement: (el: HTMLElement | null) => void;

  onClickToSource?: (selection: DomEditSelection) => void;
}

interface ClickCycleState {
  x: number;
  y: number;
  candidates: DomEditSelection[];
  index: number;
  at: number;
}

export interface PreviewMouseDownOptions {
  preferClipAncestor?: boolean;
  hoverSelection?: DomEditSelection | null;
}

const CYCLE_RADIUS_PX = 6;
const CYCLE_WINDOW_MS = 600;
// Manual double-click window. `e.detail` can't be trusted here: the first click
// selects the group and re-renders the overlay, so the second click lands on a
// fresh element and the browser's native click-counter resets to 1 — drill-in
// (which keyed off `e.detail >= 2`) never fired. We track time+position instead.
const DOUBLE_CLICK_MS = 400;
const DOUBLE_CLICK_RADIUS_PX = 6;

// ── Hook ──

export function usePreviewInteraction({
  captionEditMode,
  compositionLoading,
  previewIframeRef,
  showToast,
  applyDomSelection,
  resolveDomSelectionFromPreviewPoint,
  resolveAllDomSelectionsFromPreviewPoint,
  updateDomEditHoverSelection,
  setActiveGroupElement,
  onClickToSource,
}: UsePreviewInteractionParams) {
  const cycleRef = useRef<ClickCycleState | null>(null);
  const lastDownRef = useRef<{ t: number; x: number; y: number } | null>(null);

  const pausePreviewPlayback = useCallback(() => {
    const pausedTime = pauseStudioPreviewPlayback(previewIframeRef.current);
    const playerStore = usePlayerStore.getState();
    playerStore.setIsPlaying(false);
    if (pausedTime != null) {
      playerStore.setCurrentTime(pausedTime);
      liveTime.notify(pausedTime);
    }
  }, [previewIframeRef]);

  const handlePreviewCanvasMouseDown = useCallback(
    // fallow-ignore-next-line complexity
    async (e: React.MouseEvent<HTMLDivElement>, options?: PreviewMouseDownOptions) => {
      if (captionEditMode || compositionLoading) return;

      // Manual double-click detection (see DOUBLE_CLICK_MS): the first click
      // re-renders the overlay so `e.detail` never reaches 2 on the canvas.
      const downTs = Date.now();
      const lastDown = lastDownRef.current;
      const isDoubleClick =
        e.detail >= 2 ||
        (lastDown != null &&
          downTs - lastDown.t < DOUBLE_CLICK_MS &&
          Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < DOUBLE_CLICK_RADIUS_PX);
      lastDownRef.current = { t: downTs, x: e.clientX, y: e.clientY };
      const wasPlaying = usePlayerStore.getState().isPlaying;
      pausePreviewPlayback();
      // A click that resolves to nothing (dead-zone / deselect) shouldn't leave
      // playback paused; the pause only keeps the hit target stable while resolving.
      // Resume through requestPlayback so adapter, rAF loop and flag move together.
      const resumeIfNothingSelected = () => {
        if (wasPlaying) usePlayerStore.getState().requestPlayback(true);
      };

      // Double-click a group → drill into it and select the child under the
      // pointer (resolve with the group as the explicit drill-in scope, since the
      // activeGroupElement state hasn't re-rendered yet within this handler).
      if (isDoubleClick && !e.shiftKey) {
        const hit = await resolveDomSelectionFromPreviewPoint(e.clientX, e.clientY);
        const cycle = cycleRef.current;
        const hasStackCycleAtSpot =
          cycle !== null &&
          cycle.candidates.length > 1 &&
          Math.hypot(e.clientX - cycle.x, e.clientY - cycle.y) < CYCLE_RADIUS_PX &&
          downTs - cycle.at < CYCLE_WINDOW_MS;
        if (hit?.element.hasAttribute("data-hf-group")) {
          e.preventDefault();
          e.stopPropagation();
          cycleRef.current = null;
          trackStudioEvent("group", { action: "drill_in" });
          setActiveGroupElement(hit.element);
          const child = await resolveDomSelectionFromPreviewPoint(e.clientX, e.clientY, {
            activeGroupElement: hit.element,
          });
          applyDomSelection(child ?? hit);
          return;
        }
        if (
          hit &&
          !hasStackCycleAtSpot &&
          !hit.element.hasAttribute("data-composition-src") &&
          !hit.element.hasAttribute("data-composition-file")
        ) {
          e.preventDefault();
          e.stopPropagation();
          cycleRef.current = null;
          applyDomSelection(hit);
          return;
        }
      }

      const now = Date.now();
      const prev = cycleRef.current;
      const dx = prev ? e.clientX - prev.x : Infinity;
      const dy = prev ? e.clientY - prev.y : Infinity;
      const sameSpot =
        prev !== null &&
        Math.sqrt(dx * dx + dy * dy) < CYCLE_RADIUS_PX &&
        now - prev.at < CYCLE_WINDOW_MS;

      if (e.shiftKey) {
        // Additive selection — no cycling
        cycleRef.current = null;
        const nextSelection =
          (await resolveDomSelectionFromPreviewPoint(e.clientX, e.clientY, {
            preferClipAncestor: options?.preferClipAncestor ?? false,
          })) ??
          options?.hoverSelection ??
          null;
        if (!nextSelection) {
          resumeIfNothingSelected();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        applyDomSelection(nextSelection, { additive: true });
        trackPreviewFeatureUsed("multi_select", "button");
        return;
      }

      if (sameSpot && prev) {
        // Cycle to next candidate in z-stack
        const nextIndex = (prev.index + 1) % prev.candidates.length;
        const nextSel = prev.candidates[nextIndex];
        cycleRef.current = { ...prev, index: nextIndex, at: now };
        e.preventDefault();
        e.stopPropagation();
        applyDomSelection(nextSel);
        return;
      }

      // Fresh click — resolve topmost element
      let nextSelection = await resolveDomSelectionFromPreviewPoint(e.clientX, e.clientY, {
        preferClipAncestor: options?.preferClipAncestor ?? false,
      });
      // A null result while drilled into a group means the click landed OUTSIDE that
      // group (resolveGroupCapture → out-of-scope). Drill-in isn't sticky: exit it and
      // re-resolve at the top level so this click selects whatever's there (or the
      // group as a unit). Without this, a stale drill-in keeps selecting children and
      // the "first click selects the group" expectation breaks.
      if (!nextSelection) {
        setActiveGroupElement(null);
        nextSelection = await resolveDomSelectionFromPreviewPoint(e.clientX, e.clientY, {
          preferClipAncestor: options?.preferClipAncestor ?? false,
          activeGroupElement: null,
        });
      }
      nextSelection = nextSelection ?? options?.hoverSelection ?? null;
      if (!nextSelection) {
        cycleRef.current = null;
        applyDomSelection(null, { revealPanel: false });
        resumeIfNothingSelected();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      applyDomSelection(nextSelection);

      if (!e.shiftKey && e.altKey && onClickToSource) {
        onClickToSource(nextSelection);
      }

      // Resolve all stacked candidates so a subsequent click at the same
      // position can cycle to the next layer (issues #1124, #1125).
      const all = await resolveAllDomSelectionsFromPreviewPoint(e.clientX, e.clientY);
      cycleRef.current =
        all.length > 1 ? { x: e.clientX, y: e.clientY, candidates: all, index: 0, at: now } : null;
    },
    [
      applyDomSelection,
      captionEditMode,
      compositionLoading,
      onClickToSource,
      pausePreviewPlayback,
      resolveAllDomSelectionsFromPreviewPoint,
      resolveDomSelectionFromPreviewPoint,
      setActiveGroupElement,
    ],
  );

  const handlePreviewCanvasPointerMove = useCallback(
    // fallow-ignore-next-line complexity
    async (e: React.PointerEvent<HTMLDivElement>, options?: { preferClipAncestor?: boolean }) => {
      if (captionEditMode || compositionLoading) {
        updateDomEditHoverSelection(null);
        return null;
      }

      const nextSelection = await resolveDomSelectionFromPreviewPoint(e.clientX, e.clientY, {
        preferClipAncestor: options?.preferClipAncestor ?? false,
        skipSourceProbe: true,
      });
      updateDomEditHoverSelection(nextSelection);
      return nextSelection;
    },
    [
      captionEditMode,
      compositionLoading,
      resolveDomSelectionFromPreviewPoint,
      updateDomEditHoverSelection,
    ],
  );

  const handlePreviewCanvasPointerLeave = useCallback(() => {
    updateDomEditHoverSelection(null);
  }, [updateDomEditHoverSelection]);

  const handleBlockedDomMove = useCallback(
    (selection: DomEditSelection, reason?: string) => {
      showToast(
        reason ??
          selection.capabilities.reasonIfDisabled ??
          "This element can't be adjusted directly from the preview.",
        "info",
      );
    },
    [showToast],
  );

  const handleDomManualDragStart = useCallback(() => {
    pausePreviewPlayback();
  }, [pausePreviewPlayback]);

  return {
    handlePreviewCanvasMouseDown,
    handlePreviewCanvasPointerMove,
    handlePreviewCanvasPointerLeave,
    handleBlockedDomMove,
    handleDomManualDragStart,
  };
}
