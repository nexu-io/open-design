import { useEffect, useRef, type MutableRefObject } from "react";
import type { DomEditSelection } from "../components/editor/domEditing";
import { usePlayerStore } from "../player";
import { buildStudioSelectionSnapshot } from "../utils/studioSelectionSnapshot";
import { trackStudioEvent } from "../utils/studioTelemetry";
import { studioApiFetch } from "../utils/studioApiFetch";

interface UseStudioSelectionPublisherParams {
  projectId: string | null;
  domEditSelection: DomEditSelection | null;
  domEditSelectionRef: MutableRefObject<DomEditSelection | null>;
  refreshKey: number;
  previewDocumentVersion: number;
  refreshDomEditSelectionFromPreview: (selection: DomEditSelection) => Promise<void>;
}

function reportSelectionPublishError(error: unknown): void {
  if (error instanceof Error && error.name === "AbortError") return;
  const errorName = error instanceof Error ? error.name : typeof error;
  const errorMessage = error instanceof Error ? error.message : String(error);
  trackStudioEvent("studio_selection_publish_failed", {
    error_name: errorName,
    error_message: errorMessage.slice(0, 500),
  });
  // eslint-disable-next-line no-console
  console.warn("[Studio] Failed to update agent selection context", error);
}

function putSelection(projectId: string, selection: unknown, signal?: AbortSignal): Promise<void> {
  return studioApiFetch(`/api/projects/${encodeURIComponent(projectId)}/selection`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selection }),
    signal,
  }).then(() => undefined);
}

export function useStudioSelectionPublisher({
  projectId,
  domEditSelection,
  domEditSelectionRef,
  refreshKey,
  previewDocumentVersion,
  refreshDomEditSelectionFromPreview,
}: UseStudioSelectionPublisherParams): void {
  const lastSelectionRefreshKeyRef = useRef(refreshKey);
  const pendingSelectionRefreshKeyRef = useRef<number | null>(null);

  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    if (!projectId) return;
    const selection = domEditSelection?.element.isConnected
      ? buildStudioSelectionSnapshot({
          projectId,
          selection: domEditSelection,
          currentTime: usePlayerStore.getState().currentTime,
        })
      : null;
    const controller = new AbortController();
    void putSelection(projectId, selection, controller.signal).catch(reportSelectionPublishError);
    return () => controller.abort();
  }, [domEditSelection, projectId]);

  // Clear server-side agent context when Studio leaves a project. Without this,
  // a long-running multi-project preview server can keep serving the last
  // selected element for a project after its tab/session unmounts.
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    if (!projectId) return;
    return () => {
      void putSelection(projectId, null).catch(reportSelectionPublishError);
    };
  }, [projectId]);

  // On external file edits, the iframe reloads while React keeps the previous
  // DOM selection object alive. Clear the agent-facing snapshot immediately so
  // `preview --context` never serves a detached or stale target, then let the
  // post-load preview document refresh below re-resolve the selection if it
  // still exists in the new document.
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    if (lastSelectionRefreshKeyRef.current === refreshKey) return;
    lastSelectionRefreshKeyRef.current = refreshKey;
    pendingSelectionRefreshKeyRef.current = domEditSelectionRef.current ? refreshKey : null;
    if (!projectId || !domEditSelectionRef.current) return;
    const controller = new AbortController();
    void putSelection(projectId, null, controller.signal).catch(reportSelectionPublishError);
    return () => controller.abort();
  }, [domEditSelectionRef, projectId, refreshKey]);

  // `refreshPreviewDocumentVersion` ticks after iframe load and shortly after.
  // Consume one pending refresh per external reload: enough to re-resolve the
  // selected element once the new document is queryable, without republishing
  // the same snapshot on every follow-up 80/300ms tick.
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    if (pendingSelectionRefreshKeyRef.current === null) return;
    pendingSelectionRefreshKeyRef.current = null;
    const selection = domEditSelectionRef.current;
    if (!selection) return;
    void refreshDomEditSelectionFromPreview(selection);
  }, [domEditSelectionRef, previewDocumentVersion, refreshDomEditSelectionFromPreview]);
}
