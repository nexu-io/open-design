/**
 * Wires the Design panel's promote-to-variable context. Promote/bind operates
 * on the file the selected element actually lives in — a sub-composition file
 * when you select an element inside an inlined sub-comp, not the host. So we
 * open (and persist to) an SDK session keyed on `selection.sourceFile`, not the
 * host `activeCompPath`. Declaring a variable therefore lands in the sub-comp's
 * own file, making it a knob on that reusable frame everywhere it is used. When
 * nothing is selected (or the element is top-level) the target is the active
 * composition, so behavior there is unchanged.
 */

import { useCallback, type ReactNode } from "react";
import type { Composition } from "@hyperframes/sdk";
import type { DomEditSelection } from "./editor/domEditingTypes";
import { useSdkSession } from "../hooks/useSdkSession";
import { useVariablesPersist, type UseVariablesPersistParams } from "../hooks/useVariablesPersist";
import { VariablePromoteProvider } from "../contexts/VariablePromoteContext";
import { getStudioSaveErrorMessage } from "../utils/studioSaveDiagnostics";

/** Persist wiring minus the target — this provider derives the target from the selection. */
type PersistDeps = Omit<UseVariablesPersistParams, "sdkSession" | "activeCompPath">;

export function DesignPanelPromoteProvider({
  selection,
  projectId,
  activeCompPath,
  showToast,
  forceReloadSharedSdkSession,
  children,
  ...persistDeps
}: PersistDeps & {
  selection: DomEditSelection | null;
  projectId: string | null;
  activeCompPath: string | null;
  showToast: (message: string, tone?: "error" | "info") => void;
  /**
   * Forces the app's SHARED SDK session (Variables tab, Slideshow, etc.) to
   * re-open from disk. This provider opens its OWN session, separate from
   * that shared one, so a persist through it never fires the shared session's
   * own "change" event. When the target happens to be the same file the
   * shared session already has open, that session is left holding stale
   * in-memory content after a successful persist — worse, the self-write-echo
   * registry that would normally reload it on the next file-change
   * notification is keyed by file path only (not by session instance), so it
   * mistakes this provider's write for its own echo and stays stale
   * indefinitely. Called unconditionally (not gated on targetPath matching
   * activeCompPath): re-opening a file that didn't change is a harmless
   * no-op re-parse, cheaper than the bug class a subtly-wrong path guard
   * could reintroduce.
   */
  forceReloadSharedSdkSession?: () => void;
  children: ReactNode;
}) {
  const targetPath = selection?.sourceFile || activeCompPath || "index.html";
  const handle = useSdkSession(projectId, targetPath);
  const rawPersist = useVariablesPersist({
    ...persistDeps,
    sdkSession: handle.session,
    publishSdkSession: handle.publish,
    activeCompPath: targetPath,
  });
  const persist = useCallback(
    async (label: string, mutate: (session: Composition) => void) => {
      const committed = await rawPersist(label, mutate);
      if (committed) forceReloadSharedSdkSession?.();
      return committed;
    },
    [rawPersist, forceReloadSharedSdkSession],
  );
  const handlePersistError = useCallback(
    (error: unknown) => showToast(getStudioSaveErrorMessage(error), "error"),
    [showToast],
  );
  return (
    <VariablePromoteProvider
      session={handle.session}
      selection={selection}
      persist={persist}
      onPersistError={handlePersistError}
    >
      {children}
    </VariablePromoteProvider>
  );
}
