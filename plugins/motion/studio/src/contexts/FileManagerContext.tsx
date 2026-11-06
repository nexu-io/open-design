import type { useFileManager } from "../hooks/useFileManager";
import { useContext, useMemo, type ReactNode } from "react";
import { createStableContext } from "../utils/hmrStableContext";

type FileManagerValue = ReturnType<typeof useFileManager>;

const FileManagerContext = createStableContext<FileManagerValue | null>("FileManagerContext", null);

export function useFileManagerContext(): FileManagerValue {
  const ctx = useContext(FileManagerContext);
  if (!ctx) throw new Error("useFileManagerContext must be used within FileManagerProvider");
  return ctx;
}

export function useFileManagerContextOptional(): FileManagerValue | null {
  return useContext(FileManagerContext);
}

export function FileManagerProvider({
  value: {
    // fallow-ignore-next-line code-duplication
    editingFile,
    setEditingFile,
    projectDir,
    fileTree,
    fileTreeLoaded,
    editingPathRef,
    projectIdRef,
    saveRafRef,
    flushPendingSourceSave,
    discardPendingSourceSave,
    getPendingSourceCandidate,
    importedFontAssetsRef,
    readProjectFile,
    writeProjectFile,
    overwriteExternalConflict,
    readOptionalProjectFile,
    observeProjectFileVersion,
    updateEditingFileContent,
    revealSourceOffset,
    openSourceForSelection,
    handleFileSelect,
    handleContentChange,
    refreshFileTree,
    uploadProjectFiles,
    handleCreateFile,
    handleCreateFolder,
    handleDeleteFile,
    handleRenameFile,
    handleDuplicateFile,
    handleMoveFile,
    handleImportFiles,
    handleImportFonts,
    compositions,
    assets,
    fontAssets,
  },
  children,
}: {
  value: FileManagerValue;
  children: ReactNode;
}) {
  const stable = useMemo<FileManagerValue>(
    () => ({
      editingFile,
      setEditingFile,
      projectDir,
      fileTree,
      fileTreeLoaded,
      editingPathRef,
      projectIdRef,
      saveRafRef,
      flushPendingSourceSave,
      discardPendingSourceSave,
      getPendingSourceCandidate,
      importedFontAssetsRef,
      readProjectFile,
      writeProjectFile,
      overwriteExternalConflict,
      readOptionalProjectFile,
      observeProjectFileVersion,
      updateEditingFileContent,
      revealSourceOffset,
      openSourceForSelection,
      handleFileSelect,
      handleContentChange,
      refreshFileTree,
      uploadProjectFiles,
      handleCreateFile,
      handleCreateFolder,
      handleDeleteFile,
      handleRenameFile,
      handleDuplicateFile,
      handleMoveFile,
      handleImportFiles,
      handleImportFonts,
      compositions,
      assets,
      fontAssets,
    }),
    [
      editingFile,
      setEditingFile,
      projectDir,
      fileTree,
      fileTreeLoaded,
      editingPathRef,
      projectIdRef,
      saveRafRef,
      flushPendingSourceSave,
      discardPendingSourceSave,
      getPendingSourceCandidate,
      importedFontAssetsRef,
      readProjectFile,
      writeProjectFile,
      overwriteExternalConflict,
      readOptionalProjectFile,
      observeProjectFileVersion,
      updateEditingFileContent,
      revealSourceOffset,
      openSourceForSelection,
      handleFileSelect,
      handleContentChange,
      refreshFileTree,
      uploadProjectFiles,
      handleCreateFile,
      handleCreateFolder,
      handleDeleteFile,
      handleRenameFile,
      handleDuplicateFile,
      handleMoveFile,
      handleImportFiles,
      handleImportFonts,
      compositions,
      assets,
      fontAssets,
    ],
  );
  return <FileManagerContext value={stable}>{children}</FileManagerContext>;
}
