import type { GeometryCommitResult } from "../utils/previewFeatureUsage";
import type { RotationCommit } from "../components/editor/rotationDraft";
import { useCallback, useMemo, useRef, useState } from "react";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditing";
import type {
  DomEditGroupPathOffsetCommit,
  MoveCommitOptions,
} from "../components/editor/DomEditOverlay";
import { isPreviewBooted } from "../player/store/playerStore";
import type { DomEditCommitOutcome } from "./domEditCommitRunner";
import type { UseDomStyleCommitOptions } from "./useDomStyleCommit";
import { useGsapAnimationFetchFallback } from "./useGsapAnimationFetchFallback";
import { useGsapAwareEditing } from "./useGsapAwareEditing";
import { useGsapInteractionFailureTelemetry } from "./useGsapInteractionFailureTelemetry";
import { useGsapScriptCommits } from "./useGsapScriptCommits";
import { useGsapCacheVersion } from "./useGsapTweenCache";
import { createDomEditSaveQueue } from "../utils/domEditSaveQueue";
import { useDomEditPersist } from "./useDomEditPersist";
import { useDomEditPositionPatchCommit } from "./useDomEditPositionPatchCommit";
import { useDomGeometryCommits } from "./useDomGeometryCommits";
import { useMountEffect } from "./useMountEffect";

/**
 * Studio's `Player` must show the project, with `beginTimelineSession(projectId)` run before it
 * mounts; drain `waitForPendingSaves` before switching projects.
 */
export interface UseDomGeometryCommitOptions extends UseDomStyleCommitOptions {
  /** Reloads the host's preview when a save cannot patch it in place. */
  reloadPreview: () => void;
}

export interface DomGeometryCommits {
  commitPathOffset: (
    selection: DomEditSelection,
    next: { x: number; y: number },
    modifiers?: MoveCommitOptions,
  ) => Promise<DomEditCommitOutcome>;
  commitGroupPathOffset: (updates: DomEditGroupPathOffsetCommit[]) => Promise<DomEditCommitOutcome>;
  commitBoxSize: (
    selection: DomEditSelection,
    next: { width: number; height: number },
    offset?: { x: number; y: number },
    restore?: () => void,
    route?: { plainTranslate: boolean },
  ) => Promise<DomEditCommitOutcome>;
  commitRotation: (
    selection: DomEditSelection,
    next: RotationCommit,
  ) => Promise<DomEditCommitOutcome>;
  waitForPendingSaves: () => Promise<void>;
}

const noop = () => {};
const NO_SELECTED_ANIMATIONS: GsapAnimation[] = [];

/**
 * Saves canvas moves, resizes and rotations through Studio's own GSAP-aware commits, for a host
 * without the editor. A failed save rejects, so DomEditOverlay undoes the live gesture.
 */
export function useDomGeometryCommit({
  projectId,
  iframeRef,
  writeProjectFile,
  recordEdit,
  activeCompPath = null,
  showToast = noop,
  reloadPreview,
}: UseDomGeometryCommitOptions): DomGeometryCommits {
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const pending = useRef(new Set<Promise<GeometryCommitResult | undefined>>()).current;
  const editHistory = useMemo(() => ({ recordEdit }), [recordEdit]);
  const { bump: bumpGsapCache } = useGsapCacheVersion();
  const gsap = useGsapScriptCommits({
    projectIdRef,
    activeCompPath,
    previewIframeRef: iframeRef,
    editHistory,
    reloadPreview,
    onCacheInvalidate: bumpGsapCache,
    showToast,
    writeProjectFile,
  });
  const [queue] = useState(createDomEditSaveQueue);
  useMountEffect(() => () => queue.destroy());
  const persistDomEditOperations = useDomEditPersist({
    activeCompPath,
    previewIframeRef: iframeRef,
    showToast,
    queueDomEditSave: queue.enqueue,
    writeProjectFile,
    editHistory,
    projectIdRef,
    reloadPreview: noop,
  });
  const commitPositionPatchToHtml = useDomEditPositionPatchCommit({
    activeCompPath,
    persistDomEditOperations,
    showToast,
  });
  // No paused-save banner in a host: each save is a retry, as in useDomStyleCommit.
  const commitWithFreshQueue = useCallback<typeof commitPositionPatchToHtml>(
    (...args) => {
      queue.reset();
      return commitPositionPatchToHtml(...args);
    },
    [commitPositionPatchToHtml, queue],
  );
  const { stageElementPositionOffset, handleDomBoxSizeCommit, handleDomRotationCommit } =
    useDomGeometryCommits({
      showToast,
      commitPositionPatchToHtml: commitWithFreshQueue,
      readOnlyPreview: false,
    });
  const makeFetchFallback = useGsapAnimationFetchFallback(projectId);
  const trackGsapInteractionFailure = useGsapInteractionFailureTelemetry(activeCompPath, showToast);
  const {
    handleGsapAwarePathOffsetCommit,
    handleGsapAwareGroupPathOffsetCommit,
    handleGsapAwareBoxSizeCommit,
    handleGsapAwareRotationCommit,
  } = useGsapAwareEditing({
    // The host owns selection, so every gesture reads its element's animations from the server.
    domEditSelection: null,
    selectedGsapAnimations: NO_SELECTED_ANIMATIONS,
    gsapCommitMutation: gsap.commitMutation,
    activeCompPath,
    previewIframeRef: iframeRef,
    showToast,
    bumpGsapCache,
    makeFetchFallback,
    trackGsapInteractionFailure,
    stageElementPositionOffset,
    handleDomBoxSizeCommit,
    handleDomRotationCommit,
    commitPositionPatchToHtml: commitWithFreshQueue,
    addGsapAnimation: gsap.addGsapAnimation,
    convertToKeyframes: gsap.convertToKeyframes,
    setArcPath: gsap.setArcPath,
    updateArcSegment: gsap.updateArcSegment,
  });
  const saved = useCallback(
    async (
      commit: () => Promise<GeometryCommitResult | undefined>,
      restore = noop,
    ): Promise<DomEditCommitOutcome> => {
      const refusal = !projectIdRef.current
        ? "No project is open"
        : !isPreviewBooted(projectIdRef.current)
          ? "The preview for this project has not loaded yet"
          : null;
      if (refusal) {
        restore();
        showToast(refusal, "error");
        throw new Error(refusal);
      }
      const run = commit();
      pending.add(run);
      try {
        return { ok: true, changed: (await run)?.changed === true };
      } finally {
        pending.delete(run);
      }
    },
    [pending, showToast],
  );
  return useMemo(
    () => ({
      commitPathOffset: (selection, next, modifiers) =>
        saved(() => handleGsapAwarePathOffsetCommit(selection, next, modifiers)),
      commitGroupPathOffset: (updates) =>
        saved(() => handleGsapAwareGroupPathOffsetCommit(updates)),
      commitBoxSize: (selection, next, offset, restore, route) =>
        saved(() => handleGsapAwareBoxSizeCommit(selection, next, offset, restore, route), restore),
      commitRotation: (selection, next) =>
        saved(() => handleGsapAwareRotationCommit(selection, next)),
      waitForPendingSaves: () => Promise.allSettled([...pending]).then(noop),
    }),
    [
      saved,
      pending,
      handleGsapAwarePathOffsetCommit,
      handleGsapAwareGroupPathOffsetCommit,
      handleGsapAwareBoxSizeCommit,
      handleGsapAwareRotationCommit,
    ],
  );
}
