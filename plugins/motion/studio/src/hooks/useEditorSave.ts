import { useCallback, useRef } from "react";
import { saveProjectFilesWithHistory } from "../utils/studioFileHistory";
import {
  StudioFileConflictError,
  buildStudioSaveFailureProperties,
  trackStudioSaveFailure,
  type StudioSaveDrainResult,
} from "../utils/studioSaveDiagnostics";

const FAILURE_BURST_MS = 5_000;

interface RecordEditInput {
  label: string;
  coalesceKey?: string;
  files: Record<string, { before: string; after: string }>;
}

interface UseEditorSaveOptions {
  editingPathRef: React.RefObject<string | undefined>;
  projectIdRef: React.RefObject<string | null>;
  readProjectFile: (path: string) => Promise<string>;
  writeProjectFile: (path: string, content: string, expectedContent?: string) => Promise<void>;
  recordEdit: (input: RecordEditInput) => Promise<void>;
  setRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  showToast: (message: string, tone?: "error" | "info") => void;
}

export interface EditorSaveCandidate {
  projectId: string;
  path: string;
  content: string;
}

export type EditorSaveDrainResult = StudioSaveDrainResult;

export interface EditorSaveHandle {
  saveRafRef: React.MutableRefObject<number | null>;
  handleContentChange: (content: string) => void;
  /** Read by the external-reload reconciliation introduced in stack PR #2993. */
  getPendingCandidate: () => EditorSaveCandidate | null;
  /** Wired into the external-reload drain by stack PR #2993. */
  flushPendingSave: () => Promise<EditorSaveDrainResult>;
  /** Used by PR #2993 when the external version wins. */
  discardPendingSave: () => void;
}

export function useEditorSave({
  editingPathRef,
  projectIdRef,
  readProjectFile,
  writeProjectFile,
  recordEdit,
  setRefreshKey,
  showToast,
}: UseEditorSaveOptions): EditorSaveHandle {
  const saveRafRef = useRef<number | null>(null);
  const refreshRafRef = useRef<number | null>(null);
  // One error toast per burst of failures — every keystroke retries the save,
  // and error toasts persist until dismissed, so don't stack duplicates.
  const lastFailureToastAtRef = useRef<number | null>(null);
  const lastFailureReportRef = useRef<{ fingerprint: string; emittedAt: number } | null>(null);
  const pendingCandidateRef = useRef<EditorSaveCandidate | null>(null);
  const inFlightRef = useRef<Promise<EditorSaveDrainResult> | null>(null);
  const inFlightCandidateRef = useRef<EditorSaveCandidate | null>(null);

  const reportFailure = useCallback(
    (path: string, error: unknown) => {
      const now = Date.now();
      const properties = buildStudioSaveFailureProperties({
        source: "code_editor",
        error,
        filePath: path,
      });
      const errorName = error instanceof Error ? error.name : typeof error;
      const fingerprint = JSON.stringify([
        path,
        errorName,
        properties.error_message,
        properties.status_code,
      ]);
      const previous = lastFailureReportRef.current;
      if (
        previous === null ||
        previous.fingerprint !== fingerprint ||
        now - previous.emittedAt >= FAILURE_BURST_MS
      ) {
        trackStudioSaveFailure({ source: "code_editor", error, filePath: path });
        lastFailureReportRef.current = { fingerprint, emittedAt: now };
      }
      if (
        lastFailureToastAtRef.current === null ||
        now - lastFailureToastAtRef.current >= FAILURE_BURST_MS
      ) {
        lastFailureToastAtRef.current = now;
        showToast(
          `Couldn't save ${path}. Your latest edits are NOT persisted. Check the preview server; editing again retries the save.`,
          "error",
        );
      }
    },
    [showToast],
  );

  const persistCandidate = useCallback(
    (candidate: EditorSaveCandidate): Promise<EditorSaveDrainResult> => {
      const task = saveProjectFilesWithHistory({
        projectId: candidate.projectId,
        label: "Edit source",
        coalesceKey: `source:${candidate.path}`,
        files: { [candidate.path]: () => candidate.content },
        readFile: readProjectFile,
        writeFile: writeProjectFile,
        recordEdit,
      })
        .then<EditorSaveDrainResult>(() => {
          if (pendingCandidateRef.current === candidate) pendingCandidateRef.current = null;
          lastFailureReportRef.current = null;
          if (refreshRafRef.current != null) cancelAnimationFrame(refreshRafRef.current);
          refreshRafRef.current = requestAnimationFrame(() => setRefreshKey((k) => k + 1));
          return { status: "clean" };
        })
        .catch<EditorSaveDrainResult>((error: unknown) => {
          reportFailure(candidate.path, error);
          return error instanceof StudioFileConflictError
            ? { status: "conflict", error }
            : { status: "failed", error };
        })
        .finally(() => {
          if (inFlightRef.current === task) {
            inFlightRef.current = null;
            inFlightCandidateRef.current = null;
          }
        });
      inFlightRef.current = task;
      inFlightCandidateRef.current = candidate;
      return task;
    },
    [readProjectFile, recordEdit, reportFailure, setRefreshKey, writeProjectFile],
  );

  const handleContentChange = useCallback(
    (content: string) => {
      const pid = projectIdRef.current;
      if (!pid) return;
      const path = editingPathRef.current;
      if (!path) return;

      const candidate = { projectId: pid, path, content };
      pendingCandidateRef.current = candidate;

      if (saveRafRef.current != null) cancelAnimationFrame(saveRafRef.current);
      saveRafRef.current = requestAnimationFrame(() => {
        saveRafRef.current = null;
        void persistCandidate(candidate);
      });
    },
    [editingPathRef, projectIdRef, persistCandidate],
  );

  const flushPendingSave = useCallback(async (): Promise<EditorSaveDrainResult> => {
    if (saveRafRef.current != null) {
      cancelAnimationFrame(saveRafRef.current);
      saveRafRef.current = null;
    }
    const candidate = pendingCandidateRef.current;
    if (candidate && candidate === inFlightCandidateRef.current && inFlightRef.current) {
      return inFlightRef.current;
    }
    if (candidate) {
      return persistCandidate(candidate);
    }
    return (await inFlightRef.current) ?? { status: "clean" };
  }, [persistCandidate]);

  const discardPendingSave = useCallback(() => {
    if (saveRafRef.current != null) cancelAnimationFrame(saveRafRef.current);
    saveRafRef.current = null;
    pendingCandidateRef.current = null;
  }, []);

  return {
    saveRafRef,
    handleContentChange,
    getPendingCandidate: () => pendingCandidateRef.current,
    flushPendingSave,
    discardPendingSave,
  };
}
