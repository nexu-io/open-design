import { useCallback, type MutableRefObject } from "react";
import type { TimelineElement } from "../player";
import { toAuthoredStart, toCompositionTime } from "../player/store/timelineElement";
import {
  applyTimelineStackingReorder,
  patchIframeDomTiming,
  persistTimelineEdit,
  formatTimelineAttributeNumber,
  formatTimelineMediaOffset,
  extendRootDurationIfNeeded,
  buildTimelineMoveTimingPatch,
  buildTimelineResizeTimingPatch,
  type PersistTimelineEditInput,
} from "./timelineEditingHelpers";
import { playbackStartAttributeForElement } from "../player/lib/timelineElementHelpers";
import {
  captureDurationRollback,
  finishClipTimingFallback,
  sdkTimingGsapSync,
  readFileContent,
  syncPreviewContentDuration,
  timingGestureStep,
} from "./timelineTimingSync";
import { serializeZLaneGesture } from "../components/nle/zLaneGesture";
import { cutoverCommittedOrThrow, sdkTimingPersist } from "../utils/sdkCutover";
import type { TimelineMoveUpdates, UseTimelineEditingOptions } from "./useTimelineEditingTypes";
import { getStudioSaveErrorMessage } from "../utils/studioSaveDiagnostics";

type UseTimelineClipTimingEditingOptions = Pick<
  UseTimelineEditingOptions,
  | "activeCompPath"
  | "timelineElements"
  | "showToast"
  | "writeProjectFile"
  | "recordEdit"
  | "reloadPreview"
  | "previewIframeRef"
  | "pendingTimelineEditPathRef"
  | "isRecordingRef"
  | "sdkSession"
  | "publishSdkSession"
  | "forceReloadSdkSession"
  | "invalidateGsapCache"
  | "handleDomZIndexReorderCommitRef"
> & {
  editQueueRef: MutableRefObject<Promise<unknown>>;
  projectIdRef: MutableRefObject<string | null>;
};

/** One clip's move and resize: the timing write, then its tween rewrite, as one undo step. */
export function useTimelineClipTimingEditing({
  activeCompPath,
  timelineElements,
  showToast,
  writeProjectFile,
  recordEdit,
  reloadPreview,
  previewIframeRef,
  pendingTimelineEditPathRef,
  isRecordingRef,
  sdkSession,
  publishSdkSession,
  forceReloadSdkSession,
  invalidateGsapCache,
  handleDomZIndexReorderCommitRef,
  editQueueRef,
  projectIdRef,
}: UseTimelineClipTimingEditingOptions) {
  const enqueueEdit = useCallback(
    (
      element: TimelineElement,
      label: string,
      buildPatches: PersistTimelineEditInput["buildPatches"],
      step: ReturnType<typeof timingGestureStep>,
    ): Promise<void> => {
      if (isRecordingRef?.current) {
        showToast("Cannot edit timeline while recording", "error");
        return Promise.resolve();
      }
      const pid = projectIdRef.current;
      if (!pid) return Promise.resolve();
      const queued = editQueueRef.current
        .then(() =>
          persistTimelineEdit({
            projectId: pid,
            element,
            activeCompPath,
            label,
            buildPatches,
            writeProjectFile,
            recordEdit,
            pendingTimelineEditPathRef,
            ...step,
          }),
        )
        .then(() => {
          forceReloadSdkSession?.();
        });
      editQueueRef.current = queued.catch((error) => {
        console.error(`[Timeline] Failed to persist: ${label}`, error);
      });
      return queued;
    },
    [
      activeCompPath,
      recordEdit,
      writeProjectFile,
      pendingTimelineEditPathRef,
      showToast,
      isRecordingRef,
      forceReloadSdkSession,
      editQueueRef,
      projectIdRef,
    ],
  );
  const handleTimelineElementMove = useCallback(
    // fallow-ignore-next-line complexity
    (element: TimelineElement, updates: TimelineMoveUpdates) => {
      // fallow-ignore-next-line complexity
      const commitMove = () => {
        const targetPath = element.sourceFile || activeCompPath || "index.html";
        const startChanged = updates.start !== element.start;
        // A vertical-only lane move (start unchanged, authored track already in updates.track) must
        // persist like any other move, or the lane snaps back on reload.
        const trackChanged = updates.track !== element.track;
        const authoredStart = toAuthoredStart(element, updates.start);
        if (startChanged || trackChanged) {
          const liveAttrs: Array<[string, string]> = [];
          if (startChanged)
            liveAttrs.push(["data-start", formatTimelineAttributeNumber(authoredStart)]);
          if (trackChanged) {
            liveAttrs.push(["data-track-index", formatTimelineAttributeNumber(updates.track)]);
          }
          patchIframeDomTiming(previewIframeRef.current, element, liveAttrs, activeCompPath);
        }

        const reorderDone = applyTimelineStackingReorder({
          element,
          stackingReorder: updates.stackingReorder,
          timelineElements,
          iframe: previewIframeRef.current,
          activeCompPath,
          commit: handleDomZIndexReorderCommitRef?.current,
        });

        if (!startChanged && !trackChanged) return reorderDone;

        // Snapshot the duration BEFORE the optimistic updates below so a failed
        // persist can roll the readout + live root back (see captureDurationRollback).
        const rollbackDuration = captureDurationRollback(previewIframeRef.current);
        // Read before the readout sync below: the SDK path (setTiming) can't grow the root duration.
        const needsExtension = extendRootDurationIfNeeded(updates.start + element.duration);
        // Optimistic duration readout from the just-patched live DOM (grows and shrinks).
        syncPreviewContentDuration(previewIframeRef.current);

        const buildMovePatches: PersistTimelineEditInput["buildPatches"] = (original, target) => {
          // Persist lane changes too — data-start-only writes let reload snap the lane back.
          const track = trackChanged ? updates.track : undefined;
          return buildTimelineMoveTimingPatch(
            original,
            target,
            authoredStart,
            element.duration,
            track,
          );
        };
        const step = timingGestureStep("timeline-move");
        const finishMoveGsapSync = (sdkGsap?: ReturnType<typeof sdkTimingGsapSync>) =>
          // One GSAP sync per edit: the SDK commit's own (sdkGsap), else the server rewrite here.
          finishClipTimingFallback({
            iframe: previewIframeRef.current,
            reloadPreview,
            projectId: projectIdRef.current,
            targetPath,
            domId: element.domId,
            label: "Move timeline clip",
            coalesceKey: step.coalesceKey,
            recordEdit,
            writeProjectFile,
            edit: { kind: "shift", delta: updates.start - element.start },
            sdkGsap,
          }).finally(() => invalidateGsapCache?.());
        const moveFallback = () =>
          enqueueEdit(element, "Move timeline clip", buildMovePatches, step).then(() =>
            finishMoveGsapSync(),
          );
        return reorderDone
          .then(() => {
            // SDK setTiming writes start only; a lane change needs the fallback's track patch.
            if (sdkSession && element.hfId && !element.link && !needsExtension && !trackChanged) {
              return sdkTimingPersist(
                element.hfId,
                targetPath,
                { start: authoredStart },
                sdkSession,
                {
                  editHistory: { recordEdit },
                  writeProjectFile,
                  reloadPreview,
                  compositionPath: activeCompPath,
                  // Capture on-disk bytes as the undo `before` so undoing a timing move
                  // restores the file verbatim, not a normalized full-DOM re-emit.
                  readProjectFile: (path) => readFileContent(projectIdRef.current ?? "", path),
                  publishSession: publishSdkSession,
                },
                { label: "Move timeline clip", ...step, skipRefresh: true },
              ).then((result) => {
                if (!cutoverCommittedOrThrow(result)) return moveFallback();
                return finishMoveGsapSync(sdkTimingGsapSync(result));
              });
            }
            return moveFallback();
          })
          .catch((error) => {
            // Failed persist: revert the optimistic duration readout + live root.
            rollbackDuration();
            showToast(getStudioSaveErrorMessage(error), "error");
            throw error;
          });
      };
      return updates.stackingReorder ? serializeZLaneGesture(commitMove) : commitMove();
    },
    [
      previewIframeRef,
      enqueueEdit,
      activeCompPath,
      sdkSession,
      publishSdkSession,
      recordEdit,
      writeProjectFile,
      reloadPreview,
      timelineElements,
      handleDomZIndexReorderCommitRef,
      showToast,
      invalidateGsapCache,
      projectIdRef,
    ],
  );

  const handleTimelineElementResize = useCallback(
    // fallow-ignore-next-line complexity
    (
      element: TimelineElement,
      updates: Pick<TimelineElement, "start" | "duration" | "playbackStart">,
    ) => {
      const authoredStart = toAuthoredStart(element, updates.start);
      const liveAttrs: Array<[string, string]> = [
        ["data-start", formatTimelineAttributeNumber(authoredStart)],
        ["data-duration", formatTimelineAttributeNumber(updates.duration)],
      ];
      if (updates.playbackStart != null) {
        const liveAttr = playbackStartAttributeForElement(element);
        liveAttrs.push([liveAttr, formatTimelineMediaOffset(updates.playbackStart)]);
      }
      patchIframeDomTiming(previewIframeRef.current, element, liveAttrs, activeCompPath);
      // Snapshot the duration BEFORE the optimistic updates below so a failed
      // persist can roll the readout + live root back (see captureDurationRollback).
      const rollbackDuration = captureDurationRollback(previewIframeRef.current);
      // Read before the readout sync below: the SDK path (setTiming) can't grow the root duration.
      const needsExtension = extendRootDurationIfNeeded(updates.start + updates.duration);
      // Optimistic duration readout from the just-patched live DOM (grows and shrinks).
      syncPreviewContentDuration(previewIframeRef.current);
      const targetPath = element.sourceFile || activeCompPath || "index.html";
      const buildResizePatches: PersistTimelineEditInput["buildPatches"] = (original, target) => {
        return buildTimelineResizeTimingPatch(original, target, element, updates);
      };
      const hasPbsAdjustment =
        updates.playbackStart != null ||
        (updates.start !== element.start && element.playbackStart != null);
      // Server-path fallback: after persisting the attr patch, scale GSAP tween
      // positions/durations on the server, then soft-reload with the rewritten
      // script (timing-only resize) — same no-flash path as move; full reload is
      // the fallback.
      const step = timingGestureStep("timeline-resize");
      const finishResizeGsapSync = (sdkGsap?: ReturnType<typeof sdkTimingGsapSync>) =>
        finishClipTimingFallback({
          iframe: previewIframeRef.current,
          reloadPreview,
          projectId: projectIdRef.current,
          targetPath,
          domId: element.domId,
          label: "Resize timeline clip",
          coalesceKey: step.coalesceKey,
          recordEdit,
          writeProjectFile,
          edit: {
            kind: "scale",
            from: { start: toCompositionTime(element, element.start), duration: element.duration },
            to: { start: toCompositionTime(element, updates.start), duration: updates.duration },
          },
          sdkGsap,
        }).finally(() => invalidateGsapCache?.());
      const resizeFallback = () =>
        enqueueEdit(element, "Resize timeline clip", buildResizePatches, step).then(() =>
          finishResizeGsapSync(),
        );
      const persistDone =
        sdkSession && element.hfId && !element.link && !hasPbsAdjustment && !needsExtension
          ? sdkTimingPersist(
              element.hfId,
              targetPath,
              { start: authoredStart, duration: updates.duration },
              sdkSession,
              {
                editHistory: { recordEdit },
                writeProjectFile,
                reloadPreview,
                compositionPath: activeCompPath,
                // Capture on-disk bytes as the undo `before` so undoing a timing
                // resize restores the file verbatim, not a normalized full-DOM re-emit.
                readProjectFile: (path) => readFileContent(projectIdRef.current ?? "", path),
                publishSession: publishSdkSession,
              },
              { label: "Resize timeline clip", ...step, skipRefresh: true },
            ).then((result) => {
              if (!cutoverCommittedOrThrow(result)) return resizeFallback();
              return finishResizeGsapSync(sdkTimingGsapSync(result));
            })
          : resizeFallback();
      return persistDone.catch((error) => {
        // Failed persist: revert the optimistic duration readout + live root.
        rollbackDuration();
        showToast(getStudioSaveErrorMessage(error), "error");
        throw error;
      });
    },
    [
      previewIframeRef,
      enqueueEdit,
      activeCompPath,
      sdkSession,
      publishSdkSession,
      recordEdit,
      writeProjectFile,
      reloadPreview,
      showToast,
      invalidateGsapCache,
      projectIdRef,
    ],
  );

  return { handleTimelineElementMove, handleTimelineElementResize };
}
