import { useCallback, type MutableRefObject } from "react";
import { usePlayerStore } from "../player/store/playerStore";
import {
  deleteExternalConflictSnapshot,
  loadExternalConflictSnapshot,
  persistExternalConflictSnapshot,
  persistExternalFailureSnapshot,
} from "../utils/externalConflictStorage";
import { notifyExternalFileReload } from "./externalFileReloadBus";
import { useExternalFileChangeCoordinator } from "./useExternalFileChangeCoordinator";
import type { useFileManager } from "./useFileManager";
import type { usePreviewPersistence } from "./usePreviewPersistence";

type FileManager = Pick<
  ReturnType<typeof useFileManager>,
  | "editingFile"
  | "flushPendingSourceSave"
  | "discardPendingSourceSave"
  | "getPendingSourceCandidate"
  | "overwriteExternalConflict"
  | "readProjectFile"
  | "updateEditingFileContent"
  | "refreshFileTree"
>;

type PreviewPersistence = Pick<
  ReturnType<typeof usePreviewPersistence>,
  "drainPendingDomEditSaves" | "resetDomEditSaveQueueBreaker"
>;

interface UseStudioExternalFileChangesOptions {
  projectId: string | null;
  activeCompPath: string | null;
  masterCompPath: string | null;
  fileManager: FileManager;
  previewPersistence: PreviewPersistence;
  pendingTimelineEditPathRef: MutableRefObject<Set<string>>;
  reloadPreview: () => void;
  onOutsideChange?: () => void;
}

/** Connects the app's save queues, recovery storage, and reload surfaces to one owner. */
export function useStudioExternalFileChanges({
  projectId,
  activeCompPath,
  masterCompPath,
  fileManager,
  previewPersistence,
  pendingTimelineEditPathRef,
  reloadPreview,
  onOutsideChange,
}: UseStudioExternalFileChangesOptions) {
  const { flushPendingSourceSave, discardPendingSourceSave } = fileManager;
  const { drainPendingDomEditSaves, resetDomEditSaveQueueBreaker } = previewPersistence;
  const bumpThumbnailRevisions = usePlayerStore((state) => state.bumpThumbnailRevisions);
  const onAcceptedPersistedFileChange = useCallback(
    (_path: string, affectedCompositions: readonly string[] | null) => {
      onOutsideChange?.();
      bumpThumbnailRevisions(affectedCompositions);
    },
    [bumpThumbnailRevisions, onOutsideChange],
  );
  const drainPendingChanges = useCallback(async () => {
    const source = await flushPendingSourceSave();
    if (source.status !== "clean") return source;
    return drainPendingDomEditSaves();
  }, [drainPendingDomEditSaves, flushPendingSourceSave]);

  const discardPendingChanges = useCallback(() => {
    discardPendingSourceSave();
    resetDomEditSaveQueueBreaker();
  }, [discardPendingSourceSave, resetDomEditSaveQueueBreaker]);

  return useExternalFileChangeCoordinator({
    projectId,
    activeCompPath,
    recoveryFilePath: fileManager.editingFile?.path ?? activeCompPath ?? masterCompPath,
    pendingTimelineEditPathRef,
    drainPendingChanges,
    getPendingCandidate: fileManager.getPendingSourceCandidate,
    discardPendingChanges,
    reloadPreview,
    reloadSdkSession: notifyExternalFileReload,
    persistConflictSnapshot: persistExternalConflictSnapshot,
    persistFailureSnapshot: persistExternalFailureSnapshot,
    loadConflictSnapshot: loadExternalConflictSnapshot,
    deleteConflictSnapshot: deleteExternalConflictSnapshot,
    overwriteConflict: fileManager.overwriteExternalConflict,
    readProjectFile: fileManager.readProjectFile,
    onUseExternalFile: fileManager.updateEditingFileContent,
    resetSaveQueues: resetDomEditSaveQueueBreaker,
    onAcceptedPersistedFileChange,
    refreshFileTree: fileManager.refreshFileTree,
  });
}
