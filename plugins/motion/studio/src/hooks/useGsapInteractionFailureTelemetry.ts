import { useCallback } from "react";
import type { DomEditSelection } from "../components/editor/domEditing";
import { trackStudioEditBlocked, trackStudioSaveFailure } from "../utils/studioSaveDiagnostics";
import { isGsapEditBlockedError } from "./gsapEditOutcome";
import { wasAlreadyToasted } from "./domEditPersistFailure";

function failureToast(error: unknown, toast: boolean): string | null {
  if (!toast || wasAlreadyToasted(error)) return null;
  return isGsapEditBlockedError(error) ? error.message : "Failed to save animated edit.";
}

export function useGsapInteractionFailureTelemetry(
  activeCompPath: string | null,
  showToast: (message: string, tone?: "error" | "info") => void,
) {
  return useCallback(
    (
      error: unknown,
      selection: DomEditSelection | null,
      mutationType: string,
      label: string,
      toast?: boolean,
    ) => {
      const report = isGsapEditBlockedError(error)
        ? trackStudioEditBlocked
        : trackStudioSaveFailure;
      report({
        source: "gsap_commit",
        error,
        filePath: selection?.sourceFile ?? activeCompPath ?? "index.html",
        mutationType,
        label,
        targetId: selection?.id,
        targetSelector: selection?.selector,
        targetSourceFile: selection?.sourceFile,
      });
      const message = failureToast(error, toast !== false);
      if (message) showToast(message, "error");
    },
    [activeCompPath, showToast],
  );
}
