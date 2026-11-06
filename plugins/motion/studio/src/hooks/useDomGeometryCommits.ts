import type { DomEditPersistOutcome } from "./domEditCommitTypes";
import type { RotationCommit } from "../components/editor/rotationDraft";
import { useCallback } from "react";
import { getDomEditTargetKey, type DomEditSelection } from "../components/editor/domEditing";
import {
  applyStudioBoxSize,
  captureStudioPathOffset,
  captureStudioBoxSize,
  captureStudioRotation,
  restoreStudioPathOffset,
  restoreStudioBoxSize,
  restoreStudioRotation,
  clearStudioPathOffset,
  clearStudioBoxSize,
  clearStudioRotation,
} from "../components/editor/manualEdits";
import { stageElementOffset } from "./elementOffsetStager";
import { savePlainRotation } from "./plainRotation";
import { prepareCropResize } from "../components/editor/cropResize";
import { writePlainMove } from "../components/editor/plainTranslate";
import {
  buildBoxSizePatches,
  buildClearPathOffsetPatches,
  buildClearBoxSizePatches,
  buildClearRotationPatches,
} from "../components/editor/manualEditsDomPatches";
import type { PatchOperation } from "../utils/sourcePatcher";

let boxSizeCommitCounter = 0;

// ── Hook ──

export interface UseDomGeometryCommitsParams {
  showToast: (message: string, tone?: "error" | "info") => void;
  commitPositionPatchToHtml: (
    selection: DomEditSelection,
    patches: PatchOperation[],
    options: {
      label: string;
      coalesceKey: string;
      coalesceMs?: number;
      skipRefresh?: boolean;
      deferRender?: boolean;
    },
  ) => Promise<DomEditPersistOutcome | undefined>;
  readOnlyPreview: boolean;
}

export function useDomGeometryCommits({
  showToast,
  commitPositionPatchToHtml,
  readOnlyPreview,
}: UseDomGeometryCommitsParams) {
  const stageElementPositionOffset = useCallback(
    (
      selection: DomEditSelection,
      next: { x: number; y: number },
      plainTranslate: boolean,
      coalesceKey?: string,
    ) =>
      stageElementOffset(
        { commitPositionPatchToHtml, showToast, readOnlyPreview },
        selection,
        next,
        plainTranslate,
        coalesceKey,
      ),
    [commitPositionPatchToHtml, readOnlyPreview, showToast],
  );

  const handleDomBoxSizeCommit = useCallback(
    (
      selection: DomEditSelection,
      next: { width: number; height: number },
      offset?: { x: number; y: number },
      restore?: () => void,
      undoKey?: string,
    ) => {
      if (readOnlyPreview) return Promise.resolve(undefined);
      const element = selection.element;
      const beforeSize = captureStudioBoxSize(element);
      const beforeOffset = captureStudioPathOffset(element);
      const stageCrop = prepareCropResize(element);
      applyStudioBoxSize(element, next);
      const crop = stageCrop();
      // One commit, one undo entry: the size, the crop that follows it, and the translate
      // (as a move writes it) that keeps the centre planted.
      const patches = buildBoxSizePatches(element);
      if (crop) patches.push(crop.patch);
      if (offset) patches.push(...writePlainMove(element, offset));
      return commitPositionPatchToHtml(selection, patches, {
        label: "Resize layer box",
        ...(undoKey
          ? { coalesceKey: undoKey, coalesceMs: Number.POSITIVE_INFINITY, deferRender: true }
          : {
              coalesceKey: `box-size:${++boxSizeCommitCounter}`,
              coalesceMs: Number.POSITIVE_INFINITY,
            }),
      }).catch((error) => {
        restoreStudioBoxSize(element, beforeSize);
        if (offset) restoreStudioPathOffset(element, beforeOffset);
        crop?.revert();
        restore?.();
        throw error;
      });
    },
    [commitPositionPatchToHtml, readOnlyPreview],
  );

  const handleDomRotationCommit = useCallback(
    (selection: DomEditSelection, next: RotationCommit) =>
      savePlainRotation({ commitPositionPatchToHtml, readOnlyPreview }, selection, next),
    [commitPositionPatchToHtml, readOnlyPreview],
  );

  const handleDomManualEditsReset = useCallback(
    (selection: DomEditSelection) => {
      const element = selection.element;
      const beforeOffset = captureStudioPathOffset(element);
      const beforeSize = captureStudioBoxSize(element);
      const beforeRotation = captureStudioRotation(element);
      const clearPatches = [
        ...buildClearPathOffsetPatches(element),
        ...buildClearBoxSizePatches(element),
        ...buildClearRotationPatches(element),
      ];
      clearStudioPathOffset(element);
      clearStudioBoxSize(element);
      clearStudioRotation(element);
      // skipRefresh:false triggers reloadPreview() which re-syncs selection on load
      return commitPositionPatchToHtml(selection, clearPatches, {
        label: "Reset layer edits",
        coalesceKey: `manual-reset:${getDomEditTargetKey(selection)}`,
        skipRefresh: false,
      }).catch((error) => {
        restoreStudioPathOffset(element, beforeOffset);
        restoreStudioBoxSize(element, beforeSize);
        restoreStudioRotation(element, beforeRotation);
        throw error;
      });
    },
    [commitPositionPatchToHtml],
  );

  return {
    stageElementPositionOffset,
    handleDomBoxSizeCommit,
    handleDomRotationCommit,
    handleDomManualEditsReset,
  };
}
