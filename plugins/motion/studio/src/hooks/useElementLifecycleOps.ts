import { buildProjectApiPath } from "../utils/projectRouting";
import { useCallback } from "react";
import { usePlayerStore } from "../player";
import {
  readProjectFileContent,
  saveServerRewriteWithHistory,
  type DomEditCommitBaseParams,
} from "../utils/studioFileHistory";
import { createStudioSaveHttpError } from "../utils/studioSaveDiagnostics";
import {
  buildDomEditPatchTarget,
  readHfId,
  type DomEditSelection,
} from "../components/editor/domEditing";
import { LAYER_REVEAL_PRIOR_POSITION_ATTR } from "../player/lib/timelineElementHelpers";
import {
  beginLayerRevealCommit,
  beginLayerZPersist,
  completeLayerRevealCommit,
  rollbackLayerRevealCommit,
  type LayerRevealCommitOwnership,
} from "../components/editor/useLayerRevealOverride";
import type { CommitDomEditPatchBatches, DomEditPatchBatch } from "./domEditCommitTypes";
import { domEditCommitDeclined, type DomEditCommitOutcome } from "./domEditCommitRunner";
import { cutoverCommittedOrThrow, type CutoverResult } from "../utils/sdkCutover";
import { studioWriteHeaders } from "../utils/studioFileVersion";
import { studioApiFetch } from "../utils/studioApiFetch";

interface UseElementLifecycleOpsParams extends DomEditCommitBaseParams {
  /** Route delete through SDK when session resolves the hf-id. */
  onTrySdkDelete?: (
    hfId: string,
    originalContent: string,
    targetPath: string,
  ) => Promise<CutoverResult>;
  /** Resolver-shadow tripwire for the reordered targets (telemetry-only, decoupled from cutover). */
  onReorderShadow?: (targets: string[]) => void;
  /** Resync the SDK session after a server-fallback delete. */
  forceReloadSdkSession?: () => void;
  commitDomEditPatchBatches: CommitDomEditPatchBatches;
  /** Stage 7 Step 3b: called after a successful server-side element delete (shadow). */
  onElementDeleted?: (selection: DomEditSelection) => void;
}

// One coalesce key per z-reorder gesture. A monotonic counter — NOT Date.now()
// / Math.random(), which the determinism rules forbid — matches the
// laneChangeGestureSeq precedent in timelineClipDragCommit.ts: the key only has
// to be unique per gesture and identical across the gesture's records.
let zReorderGestureSeq = 0;

/**
 * Undo coalesce key for ONE z-reorder gesture — unique per call. The key
 * carries the action kind + element ids for debuggability, plus a gesture
 * sequence so two SEPARATE user actions (even the same action on the same
 * selection) never share a key. That uniqueness is what makes the unbounded
 * per-gesture coalesce window (see handleDomZIndexReorderCommit) safe: the
 * fold can only ever merge records of the SAME gesture.
 *
 * Exported as THE single implementation of the key: the canvas z-order wiring
 * (ConnectedDomEditOverlay) mints it once per gesture and passes the same instance to
 * both the z persist and the timeline lane mirror (useCanvasZOrderTimelineMirror)
 * so editHistory folds the z write and the track write into one undo entry —
 * recomputing the key per record would silently split the undo.
 */
export function zReorderCoalesceKey(
  entries: ReadonlyArray<{ element: HTMLElement; id?: string; selector?: string }>,
  actionKind?: string,
): string {
  const ids = entries
    .map((e) => e.id ?? e.selector ?? e.element.getAttribute("data-hf-id") ?? "el")
    .join(":");
  return `z-reorder:${actionKind ?? "reorder"}:${ids}:g${zReorderGestureSeq++}`;
}

export function useElementLifecycleOps({
  activeCompPath,
  showToast,
  writeProjectFile,
  editHistory,
  projectIdRef,
  reloadPreview,
  clearDomSelection,
  onTrySdkDelete,
  onReorderShadow,
  forceReloadSdkSession,
  commitDomEditPatchBatches,
  onElementDeleted,
}: UseElementLifecycleOpsParams) {
  // fallow-ignore-next-line complexity
  const handleDomEditElementsDelete = useCallback(
    // fallow-ignore-next-line complexity
    async (selections: DomEditSelection[]): Promise<DomEditCommitOutcome> => {
      const pid = projectIdRef.current;
      if (!pid) return domEditCommitDeclined("no-project");
      const [selection] = selections;
      if (!selection) return domEditCommitDeclined("no-selection");
      const label =
        selections.length === 1
          ? selection.label || selection.id || selection.selector || selection.tagName
          : `${selections.length} elements`;
      // Say the press landed before doing the work. Deleting a marquee selection
      // takes seconds — reading the file, removing every member, saving, then
      // reloading the preview — and until it finishes the canvas looks exactly
      // like it did before. With nothing acknowledging the key, that silence is
      // indistinguishable from Delete being broken, which is how it got read.
      if (selections.length > 1) showToast(`Deleting ${label}...`, "info");

      // One file per pass; anything authored elsewhere is dropped rather than
      // patched into the wrong document.
      const targetPath = selection.sourceFile || activeCompPath || "index.html";
      const sameFile = selections.filter(
        (candidate) => (candidate.sourceFile || activeCompPath || "index.html") === targetPath,
      );
      try {
        const patchTargets = sameFile.map((member) => buildDomEditPatchTarget(member));
        if (patchTargets.some((t) => !t.id && !t.selector && !t.hfId)) {
          throw new Error("Selected element has no patchable target");
        }

        // The SDK path can take the whole selection only when every member is
        // addressable in the SDK doc; otherwise fall through to REST for all of
        // them rather than deleting a subset through each route.
        const hfIds = sameFile
          .map((member) => member.hfId)
          .filter((hfId): hfId is string => Boolean(hfId));
        if (onTrySdkDelete && hfIds.length === sameFile.length) {
          const originalContent = await readProjectFileContent(pid, targetPath);
          let allHandled = true;
          for (const hfId of hfIds) {
            // The SDK owns the document it edits, so every member is removed
            // against the same starting content rather than a threaded copy.
            const handled = await onTrySdkDelete(hfId, originalContent, targetPath);
            if (!cutoverCommittedOrThrow(handled)) {
              allHandled = false;
              break;
            }
          }
          if (allHandled) {
            clearDomSelection();
            usePlayerStore.getState().setSelectedElementId(null);
            showToast(
              `Deleted ${label}. Use Undo to restore ${sameFile.length === 1 ? "it" : "them"}.`,
              "info",
            );
            return { ok: true } as const;
          }
        }

        // One request for the whole selection. Removing members one at a time
        // cost a round trip and a rewrite of the file EACH, and a canvas
        // selection runs to hundreds of members — the file ended up correct, but
        // only after long enough that Delete looked like it had done nothing.
        const deleted = await saveServerRewriteWithHistory({
          projectId: pid,
          path: targetPath,
          label: "Delete element",
          writeFile: writeProjectFile,
          recordEdit: editHistory.recordEdit,
          rewrite: async (originalContent) => {
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
              throw await createStudioSaveHttpError(
                removeResponse,
                `Failed to delete element from ${targetPath}`,
              );
            }
            const removeData = (await removeResponse.json()) as {
              changed?: boolean;
              content?: string;
            };
            if (!removeData.changed) return null;
            return {
              disk: typeof removeData.content === "string" ? removeData.content : originalContent,
            };
          },
        });
        if (!deleted) {
          // A member the file no longer holds simply does not match, which is
          // normal for one nested inside another member already removed. Nothing
          // matching at all means the preview is describing a document the file
          // does not have — say so rather than reporting a delete that happened.
          reloadPreview();
          showToast("Nothing to delete, the preview was out of date. Try again.");
          return domEditCommitDeclined("preview-stale");
        }

        clearDomSelection();
        usePlayerStore.getState().setSelectedElementId(null);
        // Server wrote the file; resync the stale in-memory SDK doc so a later
        // SDK edit doesn't resurrect the deleted element.
        forceReloadSdkSession?.();
        reloadPreview();
        for (const member of sameFile) onElementDeleted?.(member);
        showToast(
          `Deleted ${label}. Use Undo to restore ${sameFile.length === 1 ? "it" : "them"}.`,
          "info",
        );
        return { ok: true } as const;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete element";
        showToast(message);
        // The toast is what tells the human. The returned outcome is what tells
        // a caller that has no screen to read.
        return domEditCommitDeclined("persist-failed");
      }
    },
    [
      activeCompPath,
      clearDomSelection,
      editHistory.recordEdit,
      onTrySdkDelete,
      onElementDeleted,
      forceReloadSdkSession,
      projectIdRef,
      reloadPreview,
      showToast,
      writeProjectFile,
    ],
  );

  // Z-index reorder folds patches by source file, then sends one aggregate cross-file
  // patch-element-batches request. The server refuses the whole gesture on any unmatched
  // target and rolls back earlier file writes if a later write fails.
  // No SDK reorder/reparent op exists; DOM sibling order stays server-authoritative if ever needed.
  const handleDomZIndexReorderCommit = useCallback(
    (
      entries: Array<{
        element: HTMLElement;
        zIndex: number;
        id?: string;
        selector?: string;
        selectorIndex?: number;
        sourceFile: string;
        key?: string;
      }>,
      gestureCoalesceKey?: string,
      actionKind?: string,
    ) => {
      if (entries.length === 0) return Promise.resolve();
      // One async owner must bracket reveal tokens, optimistic DOM/store state,
      // atomic persistence, rollback, and the final persistence-count release.
      // Splitting those phases would make transaction ownership less explicit.
      // fallow-ignore-next-line complexity
      return (async () => {
        const releaseZPersists = entries.map((entry) => beginLayerZPersist(entry.element));
        try {
          // Resolver shadow (telemetry-only, decoupled from cutover): record whether
          // the SDK resolves each reordered element — the reorderElements op's targets.
          onReorderShadow?.(
            entries.map((e) => readHfId(e.element)).filter((id): id is string => id != null),
          );
          // The default key carries the action kind so two DIFFERENT actions on the
          // same element set (e.g. "bring-forward" then "send-backward" within the
          // coalesce window) never merge into one undo step. Callers that share a
          // gesture (lane moves) pass an explicit gestureCoalesceKey instead.
          const coalesceKey = gestureCoalesceKey ?? zReorderCoalesceKey(entries, actionKind);
          const patchesBySourceFile = new Map<string, DomEditPatchBatch["patches"]>();
          const rollbacks: Array<() => void> = [];
          const revealCommits: Array<{
            element: HTMLElement;
            ownership: LayerRevealCommitOwnership;
          }> = [];
          for (const entry of entries) {
            const priorZIndex = entry.element.style.zIndex;
            const priorPosition = entry.element.style.position;
            const priorStoreEntry = entry.key
              ? usePlayerStore.getState().elements.find((el) => (el.key ?? el.id) === entry.key)
              : undefined;
            let positionChanged = false;
            // An active Layers-panel reveal lift on this element is consumed by
            // this commit: the new z is the truth. Read the parked TRUE position
            // for the static check below (the lift set a temporary
            // position:relative that would otherwise mask the need to persist
            // one), then drop the lift attributes so z readers stop reporting the
            // stale prior (see useLayerRevealOverride / readLayerRevealPriorZ).
            const liftPriorPosition = entry.element.getAttribute(LAYER_REVEAL_PRIOR_POSITION_ATTR);
            const revealOwnership = beginLayerRevealCommit(entry.element);
            if (revealOwnership) {
              revealCommits.push({ element: entry.element, ownership: revealOwnership });
            }
            entry.element.style.zIndex = String(entry.zIndex);
            const patches: Array<{ type: "inline-style"; property: string; value: string }> = [
              { type: "inline-style", property: "z-index", value: String(entry.zIndex) },
            ];
            try {
              const win = entry.element.ownerDocument?.defaultView;
              const effectivePosition =
                liftPriorPosition ??
                (win ? win.getComputedStyle(entry.element).position : undefined);
              if (effectivePosition === "static") {
                entry.element.style.position = "relative";
                positionChanged = true;
                patches.push({ type: "inline-style", property: "position", value: "relative" });
              }
            } catch {
              /* cross-origin or detached — skip */
            }
            if (entry.key) {
              usePlayerStore
                .getState()
                .updateElement(entry.key, { zIndex: entry.zIndex, hasExplicitZIndex: true });
            }
            rollbacks.push(() => {
              if (revealOwnership) {
                rollbackLayerRevealCommit(entry.element, revealOwnership);
              } else {
                entry.element.style.zIndex = priorZIndex;
                if (positionChanged) entry.element.style.position = priorPosition;
              }
              if (entry.key && priorStoreEntry) {
                usePlayerStore.getState().updateElement(entry.key, {
                  zIndex: priorStoreEntry.zIndex,
                  hasExplicitZIndex: priorStoreEntry.hasExplicitZIndex,
                });
              }
            });
            const filePatches = patchesBySourceFile.get(entry.sourceFile) ?? [];
            filePatches.push({
              target: buildDomEditPatchTarget({
                id: entry.id,
                hfId: readHfId(entry.element),
                selector: entry.selector,
                selectorIndex: entry.selectorIndex,
              }),
              operations: patches,
            });
            patchesBySourceFile.set(entry.sourceFile, filePatches);
          }
          const batches = [...patchesBySourceFile].map(([sourceFile, patches]) => ({
            sourceFile,
            patches,
          }));
          // Live z state changed with NO reload coming (skipReload below) — nudge
          // DOM-derived views (Layers panel z-sort) to re-read the iframe.
          usePlayerStore.getState().bumpZEditVersion();
          const rollbackOptimisticState = () => {
            for (const rollback of rollbacks) rollback();
            usePlayerStore.getState().bumpZEditVersion();
          };
          // Resolves once every source-file batch is persisted so a same-file timing write
          // can be ordered after it (see applyTimelineStackingReorder callers).
          //
          // skipReload: the live iframe DOM and the player store already hold the
          // final z state (applied synchronously above), and the persisted patch is
          // inline-style-only — a full iframe remount would only blink the preview.
          // commitDomEditPatchBatches still falls back to reloading whenever the
          // server reports an unmatched patch target (live DOM ≠ disk).
          try {
            const result = await commitDomEditPatchBatches(batches, {
              label: "Reorder layers",
              coalesceKey,
              // Unbounded window: every key this commit records under is unique per
              // gesture (zReorderCoalesceKey's gesture seq, or the lane drag's
              // clip-lane-move:<seq>), so the fold can only merge records of the SAME
              // gesture — and those records are separated by a server round-trip
              // (move→z on a lane drag, z→lane-mirror on a canvas action), which
              // under real network latency exceeds the 300ms default window.
              coalesceMs: Number.POSITIVE_INFINITY,
              skipReload: true,
            });
            if (!result.durable) {
              rollbackOptimisticState();
              return result;
            }
            for (const { element, ownership } of revealCommits) {
              completeLayerRevealCommit(element, ownership);
            }
            return result;
          } catch (error) {
            rollbackOptimisticState();
            throw error;
          }
        } finally {
          for (const release of releaseZPersists) release();
        }
      })();
    },
    [commitDomEditPatchBatches, onReorderShadow],
  );

  return {
    handleDomEditElementsDelete,
    handleDomZIndexReorderCommit,
  };
}
