/**
 * Wiring layer for DOM edit sessions: click-to-source navigation,
 * DOM selection to timeline sync, GSAP cache invalidation on refresh,
 * GSAP cache population, animation resolution for the selected element,
 * and preview sync side-effects.
 *
 * Extracted from useDomEditSession to isolate orchestration wiring from
 * the GSAP-aware geometry intercept logic.
 */
import { useCallback, useEffect, useRef } from "react";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { usePlayerStore } from "../player";
import { useDomEditPreviewSync } from "./useDomEditPreviewSync";
import { useGsapAnimationsForElement, usePopulateKeyframeCacheForFile } from "./useGsapTweenCache";
import { useGsapAnimationFetchFallback } from "./useGsapAnimationFetchFallback";
import { useGsapInteractionFailureTelemetry } from "./useGsapInteractionFailureTelemetry";
import { useGsapSelectionHandlers } from "./useGsapSelectionHandlers";
import type { PatchTarget } from "../utils/sourcePatcher";
import { useDockLayoutStore } from "../components/dock/dockLayoutStore";

export interface UseDomEditWiringParams {
  projectId: string | null;
  activeCompPath: string | null;
  domEditSelection: DomEditSelection | null;
  domEditSelectionRef: React.MutableRefObject<DomEditSelection | null>;
  refreshDomEditSelectionFromPreview: (
    selection: DomEditSelection,
    iframe: HTMLIFrameElement,
  ) => Promise<void>;
  previewIframeRef: React.RefObject<HTMLIFrameElement | null>;
  previewIframe: HTMLIFrameElement | null;
  captionEditMode: boolean;
  refreshKey: number;
  gsapCacheVersion: number;
  bumpGsapCache: () => void;
  showToast: (message: string, tone?: "error" | "info") => void;
  refreshPreviewDocumentVersion: () => void;
  syncPreviewHotkeys: (iframe: HTMLIFrameElement | null) => void;
  applyStudioManualEditsToPreviewRef: React.MutableRefObject<
    (iframe: HTMLIFrameElement) => Promise<void>
  >;
  openSourceForSelection?: (sourceFile: string, target: PatchTarget) => void;
  // GSAP script commit ops (from useGsapScriptCommits)
  updateGsapProperty: (
    sel: DomEditSelection,
    animId: string,
    prop: string,
    value: number | string,
  ) => void;
  updateGsapMeta: (
    sel: DomEditSelection,
    animId: string,
    updates: { duration?: number; ease?: string; position?: number },
  ) => Promise<void>;
  deleteGsapAnimation: (sel: DomEditSelection, animId: string) => Promise<void>;
  deleteAllForSelector: (sel: DomEditSelection, targetSelector: string) => Promise<void>;
  addGsapAnimation: (
    sel: DomEditSelection,
    method: "to" | "from" | "set" | "fromTo",
    time: number,
  ) => Promise<void>;
  addGsapProperty: (sel: DomEditSelection, animId: string, prop: string) => Promise<void>;
  removeGsapProperty: (sel: DomEditSelection, animId: string, prop: string) => Promise<void>;
  updateGsapFromProperty: (
    sel: DomEditSelection,
    animId: string,
    prop: string,
    value: number | string,
  ) => Promise<void>;
  addGsapFromProperty: (sel: DomEditSelection, animId: string, prop: string) => Promise<void>;
  removeGsapFromProperty: (sel: DomEditSelection, animId: string, prop: string) => Promise<void>;
  addKeyframe: (
    sel: DomEditSelection,
    animId: string,
    percentage: number,
    property: string,
    value: number | string,
  ) => void;
  addKeyframeBatch: (
    sel: DomEditSelection,
    animId: string,
    percentage: number,
    properties: Record<string, number | string>,
  ) => Promise<void>;
  removeKeyframe: (sel: DomEditSelection, animId: string, percentage: number) => void;
  moveKeyframe: (
    sel: DomEditSelection,
    animId: string,
    fromPercentage: number,
    toPercentage: number,
  ) => Promise<boolean>;
  resizeKeyframedTween: (
    sel: DomEditSelection,
    animId: string,
    position: number,
    duration: number,
    pctRemap: Array<{ from: number; to: number }>,
  ) => Promise<boolean>;
  convertToKeyframes: (
    sel: DomEditSelection,
    animId: string,
    resolvedFromValues?: Record<string, number | string>,
  ) => Promise<void>;
  removeAllKeyframes: Parameters<typeof useGsapSelectionHandlers>[0]["removeAllKeyframes"];
  handleDomManualEditsReset: (
    sel: DomEditSelection,
  ) => Promise<void | import("./domEditCommitTypes").DomEditPersistOutcome>;
}

// fallow-ignore-next-line complexity
export function useDomEditWiring(params: UseDomEditWiringParams) {
  const {
    projectId,
    activeCompPath,
    domEditSelection,
    domEditSelectionRef,
    refreshDomEditSelectionFromPreview,
    previewIframeRef,
    previewIframe,
    captionEditMode,
    refreshKey,
    gsapCacheVersion,
    bumpGsapCache,
    showToast,
    refreshPreviewDocumentVersion,
    syncPreviewHotkeys,
    applyStudioManualEditsToPreviewRef,
    openSourceForSelection,
    updateGsapProperty,
    updateGsapMeta,
    deleteGsapAnimation,
    deleteAllForSelector,
    addGsapAnimation,
    addGsapProperty,
    removeGsapProperty,
    updateGsapFromProperty,
    addGsapFromProperty,
    removeGsapFromProperty,
    addKeyframe,
    addKeyframeBatch,
    removeKeyframe,
    moveKeyframe,
    resizeKeyframedTween,
    convertToKeyframes,
    removeAllKeyframes,
    handleDomManualEditsReset,
  } = params;
  // ── Click-to-source navigation ──

  const onClickToSource = useCallback(
    (selection: DomEditSelection) => {
      if (!openSourceForSelection) return;
      if (!selection.sourceFile) return;
      useDockLayoutStore.getState().activatePanel("code");
      openSourceForSelection(selection.sourceFile, {
        id: selection.id,
        selector: selection.selector,
        selectorIndex: selection.selectorIndex,
      });
    },
    [openSourceForSelection],
  );

  // ── DOM selection -> timeline element sync ──

  useEffect(() => {
    if (!domEditSelection?.id) return;
    const { selectedElementId, elements, setSelectedElementId } = usePlayerStore.getState();
    const matchKey = elements.find(
      (el) => el.domId === domEditSelection.id || el.id === domEditSelection.id,
    );
    const key = matchKey ? (matchKey.key ?? matchKey.id) : null;
    if (key && key !== selectedElementId) setSelectedElementId(key);
  }, [domEditSelection?.id]);

  // ── GSAP cache sync ──

  // Bump GSAP cache when refreshKey changes (code-tab edits trigger iframe
  // reload via refreshKey but don't go through commitMutation, so the cache
  // would otherwise retain stale keyframe entries).
  const prevRefreshKeyRef = useRef(refreshKey);
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    if (refreshKey !== prevRefreshKeyRef.current) {
      prevRefreshKeyRef.current = refreshKey;
      bumpGsapCache();
    }
  }, [refreshKey, bumpGsapCache]);

  const gsapSourceFile = domEditSelection?.sourceFile || activeCompPath || "index.html";

  usePopulateKeyframeCacheForFile(
    projectId ?? null,
    gsapSourceFile,
    gsapCacheVersion,
    previewIframeRef,
  );

  const {
    animations: selectedGsapAnimations,
    multipleTimelines: gsapMultipleTimelines,
    unsupportedTimelinePattern: gsapUnsupportedTimelinePattern,
  } = useGsapAnimationsForElement(
    projectId ?? null,
    gsapSourceFile,
    domEditSelection,
    gsapCacheVersion,
    // Pass the preview iframe so class/selector tweens (e.g. `.dot`) resolve to
    // the live element and surface in the inspector — not just by #id match.
    previewIframeRef,
  );

  // ── Telemetry & fallback ──

  const trackGsapInteractionFailure = useGsapInteractionFailureTelemetry(activeCompPath, showToast);
  const makeFetchFallback = useGsapAnimationFetchFallback(projectId);

  // ── GSAP selection handlers ──

  const gsapSelectionHandlers = useGsapSelectionHandlers({
    domEditSelection,
    updateGsapProperty,
    updateGsapMeta,
    deleteGsapAnimation,
    deleteAllForSelector,
    addGsapAnimation,
    addGsapProperty,
    removeGsapProperty,
    updateGsapFromProperty,
    addGsapFromProperty,
    removeGsapFromProperty,
    addKeyframe,
    addKeyframeBatch,
    removeKeyframe,
    moveKeyframe,
    resizeKeyframedTween,
    convertToKeyframes,
    removeAllKeyframes,
    handleDomManualEditsReset,
    selectedGsapAnimations,
    showToast,
  });

  // ── Preview sync side-effects ──

  useDomEditPreviewSync({
    previewIframe,
    captionEditMode,
    domEditSelectionRef,
    domEditSelection,
    refreshDomEditSelectionFromPreview,
    refreshPreviewDocumentVersion,
    syncPreviewHotkeys,
    applyStudioManualEditsToPreviewRef,
    openSourceForSelection,
    gsapCacheVersion,
  });

  return {
    onClickToSource,
    selectedGsapAnimations,
    gsapMultipleTimelines,
    gsapUnsupportedTimelinePattern,
    trackGsapInteractionFailure,
    makeFetchFallback,
    ...gsapSelectionHandlers,
  };
}
