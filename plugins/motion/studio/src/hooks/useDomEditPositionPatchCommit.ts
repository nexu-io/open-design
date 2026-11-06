import { useCallback } from "react";
import type { DomEditSelection } from "../components/editor/domEditing";
import type { PatchOperation } from "../utils/sourcePatcher";
import { trackStudioSaveFailure } from "../utils/studioSaveDiagnostics";
import { DomEditSaveQueueOpenError } from "../utils/domEditSaveQueue";
import type { PersistDomEditOperations } from "./domEditCommitTypes";
import { wasAlreadyToasted } from "./domEditPersistFailure";

interface UseDomEditPositionPatchCommitParams {
  activeCompPath: string | null;
  persistDomEditOperations: PersistDomEditOperations;
  showToast: (message: string, tone?: "error" | "info") => void;
}

type PositionPatchOptions = {
  label: string;
  coalesceKey: string;
  coalesceMs?: number;
  skipRefresh?: boolean;
  deferRender?: boolean;
};

export function useDomEditPositionPatchCommit({
  activeCompPath,
  persistDomEditOperations,
  showToast,
}: UseDomEditPositionPatchCommitParams) {
  return useCallback(
    (selection: DomEditSelection, patches: PatchOperation[], options: PositionPatchOptions) => {
      return persistDomEditOperations(selection, patches, {
        label: options.label,
        coalesceKey: options.coalesceKey,
        coalesceMs: options.coalesceMs,
        skipRefresh: options.skipRefresh ?? true,
        deferRender: options.deferRender,
      }).catch((error) => {
        // The paused-save banner already explains this refusal. Rethrow so the
        // caller reverts the preview instead of treating an unsaved edit as committed.
        if (error instanceof DomEditSaveQueueOpenError) throw error;
        if (!wasAlreadyToasted(error)) {
          showToast(error instanceof Error ? error.message : "Failed to save position");
        }
        trackStudioSaveFailure({
          source: "dom_edit",
          error,
          filePath: selection.sourceFile ?? activeCompPath ?? "index.html",
          mutationType: "position",
          label: options.label,
          targetId: selection.id,
          targetSelector: selection.selector,
          targetSourceFile: selection.sourceFile,
        });
        throw error;
      });
    },
    [activeCompPath, persistDomEditOperations, showToast],
  );
}
