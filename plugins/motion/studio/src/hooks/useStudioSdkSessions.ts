import { useEffect } from "react";
import { useSdkSession } from "./useSdkSession";
import { usePreviewVariablesStore } from "./previewVariablesStore";
import { useStableHandlers } from "./useStableHandlers";

/**
 * Open the studio's SDK session with master-view semantics.
 *
 * The master view has no explicit comp path, but the session must still model
 * the project's main composition so schema-level panels (Variables, Slideshow)
 * work there. Edit-flow consumers keep the legacy "no session on master view"
 * gating via `editFlowSdkSession` so cutover behavior is unchanged.
 *
 * Also clears preview variable overrides whenever the composition or project
 * changes — overrides are per-composition and must never leak into another
 * composition's preview or render.
 */
export function useStudioSdkSessions(
  projectId: string | null,
  activeCompPath: string | null,
  masterCompPath: string | null,
  fileTree: readonly string[] = [],
  fileTreeLoaded = false,
  refreshFileTree?: () => void | Promise<void>,
) {
  // On the master view (no explicit comp) the schema panels target the project's
  // resolved main composition — the first `.html` in the tree, not a hardcoded
  // "index.html" that may not exist. `null` when the project has no composition
  // yet, which correctly leaves the session (and the panels) empty.
  const sdkHandle = useSdkSession(
    projectId,
    activeCompPath ?? masterCompPath,
    fileTree,
    fileTreeLoaded,
    refreshFileTree,
  );
  const editFlowSdkSession = activeCompPath ? sdkHandle.session : null;
  useEffect(() => {
    usePreviewVariablesStore.getState().setValues(null);
  }, [projectId, activeCompPath]);
  return { sdkHandle: useStableHandlers(sdkHandle, projectId), editFlowSdkSession };
}
