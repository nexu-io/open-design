import { useCallback } from "react";
import type { Composition } from "@hyperframes/sdk";
import { cutoverCommittedOrThrow, persistSdkCandidateMutation } from "../utils/sdkCutover";
import type { UseSlideshowPersistParams } from "./useSlideshowPersist";

/** Same single-writer dependency set the slideshow persist path uses. */
export type UseVariablesPersistParams = Omit<UseSlideshowPersistParams, "coalesceKey">;

/**
 * Persist a variable-schema edit: run `mutate` (SDK declaration/value ops)
 * against the session, then write the serialized composition through the
 * standard single-writer path (undo history + self-write echo suppression +
 * preview reload). Mutations that end up changing nothing are skipped, so a
 * no-op dispatch (e.g. declaring a duplicate id) never pollutes undo history.
 */
export function useVariablesPersist({
  sdkSession,
  activeCompPath,
  readProjectFile,
  writeProjectFile,
  recordEdit,
  reloadPreview,
  publishSdkSession,
}: UseVariablesPersistParams): (
  label: string,
  mutate: (session: Composition) => void,
) => Promise<boolean> {
  return useCallback(
    async (label: string, mutate: (session: Composition) => void) => {
      if (!sdkSession) return false;
      const path = activeCompPath ?? "index.html";
      const originalContent = await readProjectFile(path);
      const result = await persistSdkCandidateMutation(
        sdkSession,
        path,
        originalContent,
        {
          editHistory: { recordEdit },
          writeProjectFile,
          reloadPreview,
          compositionPath: activeCompPath,
          readProjectFile,
          publishSession: publishSdkSession,
        },
        mutate,
        { label },
      );
      return cutoverCommittedOrThrow(result);
    },
    [
      sdkSession,
      activeCompPath,
      readProjectFile,
      writeProjectFile,
      recordEdit,
      reloadPreview,
      publishSdkSession,
    ],
  );
}
