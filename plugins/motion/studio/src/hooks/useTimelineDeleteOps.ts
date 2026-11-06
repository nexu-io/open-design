import { buildProjectApiPath } from "../utils/projectRouting";
// Timeline clip deletion: the marquee/multi path and the single-clip wrapper
// the context menu uses. Extracted verbatim from useTimelineEditing.ts to keep
// it under the studio 600-line cap, following useTimelineAssetDropOps.
import { keyHint } from "../player/components/studioShortcuts";
import { useCallback, useRef, type MutableRefObject, type RefObject } from "react";
import type { TimelineElement } from "../player";
import { usePlayerStore } from "../player";
import { saveServerRewriteWithHistory, type RecordEditInput } from "../utils/studioFileHistory";
import { studioWriteHeaders } from "../utils/studioFileVersion";
import { getTimelineElementLabel } from "../utils/studioHelpers";
import {
  buildPatchTarget,
  removeIframeTimelineElements,
  syncCompositionDurationWithEnd,
} from "./timelineEditingHelpers";
import { captureDurationRollback, timingGestureStep } from "./timelineTimingSync";
import { setLinkInSource } from "../components/editor/mediaLinkEdits";
import {
  resolveMainTrackDeleteRippleShifts,
  resolveShiftedElements,
} from "../player/components/timelineGapCommit";
import type {
  TimelineGroupCommitOptions,
  TimelineGroupMoveChange,
} from "./useTimelineGroupEditing";
import { studioApiFetch } from "../utils/studioApiFetch";

/** Apply already-resolved ripple changes to the surviving elements for the
 *  optimistic store update after a delete. Pure — no IO. */
export function applyRippleShifts(
  survivors: TimelineElement[],
  changes: readonly TimelineGroupMoveChange[] | null,
): TimelineElement[] {
  if (!changes) return survivors;
  const newStartByElement = new Map(changes.map((c) => [c.element, c.start]));
  return survivors.map((te) => {
    const newStart = newStartByElement.get(te);
    return newStart != null ? { ...te, start: newStart } : te;
  });
}

interface UseTimelineDeleteOpsOptions {
  projectIdRef: MutableRefObject<string | null>;
  activeCompPath: string | null;
  timelineElements: TimelineElement[];
  showToast: (message: string, tone?: "error" | "info") => void;
  writeProjectFile: (path: string, content: string, expectedContent?: string) => Promise<void>;
  recordEdit: (input: RecordEditInput) => Promise<void>;
  reloadPreview: () => void;
  isRecordingRef?: MutableRefObject<boolean>;
  forceReloadSdkSession?: () => void;
  previewIframeRef: RefObject<HTMLIFrameElement | null>;
  /** The same atomic multi-clip move commit the track-gap menu uses, reused
   *  to ripple the main track after a delete, folded into the delete's own
   *  undo entry via a shared coalesceKey. */
  handleTimelineGroupMove: (
    changes: TimelineGroupMoveChange[],
    options?: TimelineGroupCommitOptions,
  ) => Promise<void>;
}

function unlinkInSource(source: string, survivors: readonly TimelineElement[]): string {
  const targets = survivors.map(buildPatchTarget).filter((target) => target !== null);
  return targets.length > 0 ? setLinkInSource(source, targets, null) : source;
}

export function useTimelineDeleteOps({
  projectIdRef,
  activeCompPath,
  timelineElements,
  showToast,
  writeProjectFile,
  recordEdit,
  reloadPreview,
  isRecordingRef,
  forceReloadSdkSession,
  previewIframeRef,
  handleTimelineGroupMove,
}: UseTimelineDeleteOpsOptions) {
  // First-use-per-session notice for the ripple. Plain info toast: Studio's
  // toast system has no action buttons, so Undo and the toggle location are
  // named in words instead.
  const rippleNoticeShownRef = useRef(false);
  // fallow-ignore-next-line complexity
  const handleTimelineElementsDelete = useCallback(
    // fallow-ignore-next-line complexity
    async (selection: TimelineElement[], alsoUnlink: readonly TimelineElement[] = []) => {
      if (isRecordingRef?.current) {
        showToast("Cannot edit timeline while recording", "error");
        return;
      }
      const pid = projectIdRef.current;
      if (!pid) throw new Error("No active project");
      const [element] = selection;
      if (!element) return;
      const label =
        selection.length === 1 ? getTimelineElementLabel(element) : `${selection.length} clips`;

      // One file per delete pass. Every element in a marquee selection lives in
      // the composition being edited, so they share a target; anything that
      // does not is dropped rather than written to the wrong file.
      const targetPath = element.sourceFile || activeCompPath || "index.html";
      const sameFile = selection.filter(
        (candidate) => (candidate.sourceFile || activeCompPath || "index.html") === targetPath,
      );
      try {
        // Shared with the ripple move below so a folded ripple is one undo step with the delete.
        const step = timingGestureStep("main-track-ripple-delete");
        const deleteHistoryLabel = "Delete timeline clip";
        let rollbackDuration = () => {};
        try {
          await saveServerRewriteWithHistory({
            projectId: pid,
            path: targetPath,
            label: deleteHistoryLabel,
            ...step,
            writeFile: writeProjectFile,
            recordEdit,
            rewrite: async (originalContent) => {
              // One request removes every selected element and rewrites the file once, so a
              // large selection is a single round trip and a single history entry.
              const patchTargets = sameFile.map((target) => {
                const patchTarget = buildPatchTarget(target);
                if (!patchTarget) {
                  throw new Error(`Timeline element ${target.id} is missing a patchable target`);
                }
                return patchTarget;
              });
              const removeResponse = await studioApiFetch(
                buildProjectApiPath(
                  pid,
                  `/file-mutations/remove-elements/${encodeURIComponent(targetPath)}`,
                ),
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json", ...studioWriteHeaders() },
                  body: JSON.stringify({ targets: patchTargets }),
                },
              );
              if (!removeResponse.ok) {
                throw new Error(`Failed to delete ${sameFile.length} clips from ${targetPath}`);
              }
              const removeData = (await removeResponse.json()) as { content?: string };
              const removedContent =
                typeof removeData.content === "string" ? removeData.content : originalContent;
              // Shrink to the furthest remaining clip end, read from the post-removal source:
              // store durations are runtime-truncated.
              const synced = syncCompositionDurationWithEnd(removedContent);
              const patchedContent = unlinkInSource(synced.source, alsoUnlink);
              // Optimistically reflect the shrunk length in the readout/seek bar,
              // rolling it back if the persist below fails (see captureDurationRollback).
              rollbackDuration = captureDurationRollback(previewIframeRef.current);
              if (synced.contentEnd > 0 && targetPath === (activeCompPath || "index.html")) {
                usePlayerStore.getState().setDuration(synced.contentEnd);
              }
              return { disk: removedContent, after: patchedContent };
            },
          });
        } catch (error) {
          rollbackDuration();
          throw error;
        }

        removeIframeTimelineElements(previewIframeRef.current, sameFile, activeCompPath);
        const deletedKeys = new Set(sameFile.map((te) => te.key ?? te.id));
        const survivors = timelineElements.filter((te) => !deletedKeys.has(te.key ?? te.id));

        // Ripple: close the gap the delete left on the main track. Pure decision
        // first (resolveMainTrackDeleteRippleShifts — off, no main-track clip
        // deleted, already gapless, or a locked survivor all resolve to null),
        // then the one write, folded into the delete's undo entry above.
        const rippleShifts = resolveMainTrackDeleteRippleShifts(
          survivors,
          sameFile,
          usePlayerStore.getState().rippleEditEnabled,
        );
        const rippleChanges = rippleShifts ? resolveShiftedElements(survivors, rippleShifts) : null;
        // The timeline follows the delete's write at once, as the owner of the ripple's optimistic update.
        usePlayerStore.getState().setElements(applyRippleShifts(survivors, rippleChanges));
        let rippleFailed = false;
        if (rippleChanges) {
          try {
            await handleTimelineGroupMove(rippleChanges, {
              coalesceKey: step.coalesceKey,
              // Coalescing keeps the LAST entry's label; without this the undo
              // toast reads "Undid Move timeline clips" after a delete, naming
              // the ripple's mechanics instead of what the user actually did.
              label: deleteHistoryLabel,
              // This call gets its own, more specific failure toast below —
              // the generic one would tell the user about one action twice.
              suppressFailureToast: true,
            });
          } catch (error) {
            // The delete already committed; a failed ripple leaves the gap the
            // toggle-off behaviour would have left anyway — not worth undoing
            // an otherwise-successful delete over.
            rippleFailed = true;
            usePlayerStore.getState().setElements(survivors);
            console.error("[Timeline] ripple-edit failed to persist after delete", error);
            showToast("Clip deleted, but the gap could not be closed.", "error");
          }
        }

        usePlayerStore.getState().setSelectedElementId(null);
        usePlayerStore.getState().setSelectedElementIds(new Set());
        forceReloadSdkSession?.();
        reloadPreview();
        // A failed ripple already showed its own toast above; the user did one
        // thing (delete), so they get one message, not this generic follow-up too.
        if (!rippleFailed) {
          showToast(
            `Deleted ${label}. Use Undo to restore ${sameFile.length === 1 ? "it" : "them"}.`,
            "info",
          );
        }
        if (rippleChanges && !rippleFailed && !rippleNoticeShownRef.current) {
          rippleNoticeShownRef.current = true;
          showToast(
            `Ripple closed the gap on the main track. Undo (${keyHint("undo")}) restores it, or turn off ` +
              "Ripple in the timeline toolbar.",
            "info",
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete timeline clip";
        showToast(message);
      }
    },
    [
      activeCompPath,
      projectIdRef,
      recordEdit,
      showToast,
      timelineElements,
      writeProjectFile,
      reloadPreview,
      isRecordingRef,
      forceReloadSdkSession,
      previewIframeRef,
      handleTimelineGroupMove,
    ],
  );

  /** Single-clip delete — the context menu and clip chrome path. */
  const handleTimelineElementDelete = useCallback(
    async (element: TimelineElement) => {
      await handleTimelineElementsDelete([element]);
    },
    [handleTimelineElementsDelete],
  );

  return { handleTimelineElementsDelete, handleTimelineElementDelete };
}
