import { useState, useCallback, useRef } from "react";
import type { EditingFile } from "../utils/studioHelpers";
import { FONT_EXT, isMediaFile } from "../utils/mediaTypes";
import { fontFamilyFromAssetPath, type ImportedFontAsset } from "../components/editor/fontAssets";
import { findTagByTarget, type PatchTarget } from "../utils/sourcePatcher";
import { StudioFileConflictError } from "../utils/studioSaveDiagnostics";
import { serializeStudioFileMutation } from "../utils/studioFileMutationCoordinator";
import { useFileTree } from "./useFileTree";
import { useEditorSave } from "./useEditorSave";
import { useProjectFileWriter } from "./useProjectFileWriter";
import { studioApiFetch } from "../utils/studioApiFetch";
import { encodeUrlPath } from "@hyperframes/parsers";

// ── Types ──

interface RecordEditInput {
  label: string;
  coalesceKey?: string;
  files: Record<string, { before: string; after: string }>;
}

interface UseFileManagerOptions {
  projectId: string | null;
  showToast: (message: string, tone?: "error" | "info") => void;
  recordEdit: (input: RecordEditInput) => Promise<void>;
  setRefreshKey: React.Dispatch<React.SetStateAction<number>>;
}

// ── Hook ──

export function useFileManager({
  projectId,
  showToast,
  recordEdit,
  setRefreshKey,
}: UseFileManagerOptions) {
  // ── Shared refs ──

  const [editingFile, setEditingFile] = useState<EditingFile | null>(null);
  const [revealSourceOffset, setRevealSourceOffset] = useState<number | null>(null);

  const editingPathRef = useRef(editingFile?.path);
  editingPathRef.current = editingFile?.path;

  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  const importedFontAssetsRef = useRef<ImportedFontAsset[]>([]);
  const {
    fileVersions,
    readProjectFile,
    writeProjectFile: writeProjectFileRaw,
    readOptionalProjectFile,
    observeProjectFileVersion,
  } = useProjectFileWriter({ projectId });

  // ── File tree ──

  const {
    projectDir,
    fileTree,
    fileTreeLoaded,
    refreshFileTree,
    compositions,
    assets,
    fontAssets,
  } = useFileTree({ projectId, projectIdRef });

  const updateEditingFileContent = useCallback((path: string, content: string) => {
    if (editingPathRef.current === path) {
      setEditingFile({ path, content });
    }
  }, []);

  // Studio's own editor tab mirrors whatever it just wrote, on top of the
  // shared writer — a host mounting useProjectFileWriter directly has no
  // editor tab and does not need this.
  const writeProjectFile = useCallback(
    async (path: string, content: string, expectedContent?: string): Promise<void> => {
      const writeProjectId = projectIdRef.current;
      await writeProjectFileRaw(path, content, expectedContent);
      if (projectIdRef.current === writeProjectId && editingPathRef.current === path) {
        setEditingFile({ path, content });
      }
    },
    [writeProjectFileRaw],
  );

  // ── Editor save (debounced content change) ──

  const editorSave = useEditorSave({
    editingPathRef,
    projectIdRef,
    readProjectFile,
    writeProjectFile,
    recordEdit,
    setRefreshKey,
    showToast,
  });
  const { saveRafRef, handleContentChange } = editorSave;

  const overwriteExternalConflict = useCallback(
    async (conflict: StudioFileConflictError) => {
      await serializeStudioFileMutation(writeProjectFile, conflict.filePath, async () => {
        if (conflict.currentContent != null) {
          await writeProjectFile(
            conflict.filePath,
            conflict.attemptedContent,
            conflict.currentContent,
          );
        } else {
          fileVersions.set(conflict.filePath, conflict.currentVersion);
          await writeProjectFile(conflict.filePath, conflict.attemptedContent);
        }
      });
      updateEditingFileContent(conflict.filePath, conflict.attemptedContent);
    },
    [fileVersions, updateEditingFileContent, writeProjectFile],
  );

  // ── File select ──

  const revealRequestIdRef = useRef(0);
  const revealAbortRef = useRef<AbortController | null>(null);

  const handleFileSelect = useCallback(
    (path: string) => {
      const pid = projectIdRef.current;
      if (!pid) return;
      revealAbortRef.current?.abort();
      revealAbortRef.current = null;
      revealRequestIdRef.current++;
      // Skip fetching binary content for media files — just set the path for preview
      if (isMediaFile(path)) {
        setEditingFile({ path, content: null });
        return;
      }
      studioApiFetch(`/api/projects/${encodeURIComponent(pid)}/files/${encodeURIComponent(path)}`)
        .then((r) => {
          if (!r.ok) throw new Error(`Failed to load ${path} (${r.status})`);
          return r.json();
        })
        .then((data: { content?: string; version?: string }) => {
          if (data.content != null) {
            fileVersions.set(path, data.version ?? null);
            setEditingFile({ path, content: data.content });
          }
        })
        .catch((err: unknown) => {
          showToast(err instanceof Error ? err.message : `Failed to load ${path}`, "error");
        });
    },
    [fileVersions, showToast],
  );

  // ── Click-to-source ──

  const openSourceForSelection = useCallback(
    (sourceFile: string, target: PatchTarget) => {
      const pid = projectIdRef.current;
      if (!pid || !sourceFile) return;
      revealAbortRef.current?.abort();
      revealAbortRef.current = null;
      if (editingPathRef.current === sourceFile && editingFile?.content != null) {
        const match = findTagByTarget(editingFile.content, target);
        setRevealSourceOffset(match ? match.start : null);
        return;
      }
      const requestId = ++revealRequestIdRef.current;
      const controller = new AbortController();
      revealAbortRef.current = controller;
      studioApiFetch(
        `/api/projects/${encodeURIComponent(pid)}/files/${encodeURIComponent(sourceFile)}`,
        {
          signal: controller.signal,
        },
      )
        .then((r) => r.json())
        .then((data: { content?: string; version?: string }) => {
          if (requestId !== revealRequestIdRef.current) return;
          if (data.content != null) {
            fileVersions.set(sourceFile, data.version ?? null);
            setEditingFile({ path: sourceFile, content: data.content });
            const match = findTagByTarget(data.content, target);
            setRevealSourceOffset(match ? match.start : null);
          }
        })
        .catch(() => {});
    },
    [editingFile?.content, fileVersions],
  );

  // ── Upload ──

  const uploadProjectFiles = useCallback(
    async (files: Iterable<File>, dir?: string): Promise<string[]> => {
      const pid = projectIdRef.current;
      const fileList = Array.from(files);
      if (!pid || fileList.length === 0) return [];

      const formData = new FormData();
      for (const file of fileList) {
        formData.append("file", file);
      }

      const qs = dir ? `?dir=${encodeURIComponent(dir)}` : "";
      try {
        const res = await studioApiFetch(`/api/projects/${encodeURIComponent(pid)}/upload${qs}`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          if (data.skipped?.length) {
            showToast(`Skipped (too large): ${data.skipped.join(", ")}`);
          }
          if (data.invalid?.length) {
            const why = data.invalid
              .map((entry: { name: string; reason: string }) => `${entry.name} (${entry.reason})`)
              .join(", ");
            showToast(`Not added: ${why}`);
          }
          if (data.unchecked?.length) {
            const names = data.unchecked.map((entry: { name: string }) => entry.name).join(", ");
            showToast(`Added ${names}, ${data.unchecked[0].reason}`, "info");
          }
          await refreshFileTree();
          setRefreshKey((k) => k + 1);
          return Array.isArray(data.files) ? data.files : [];
        } else if (res.status === 413) {
          showToast("Upload rejected: payload too large");
        } else {
          showToast(`Upload failed (${res.status})`);
        }
      } catch {
        showToast("Upload failed: network error");
      }
      return [];
    },
    [refreshFileTree, setRefreshKey, showToast],
  );

  // ── File CRUD ──

  const handleCreateFile = useCallback(
    async (path: string) => {
      const pid = projectIdRef.current;
      if (!pid) return;
      let content = "";
      if (path.endsWith(".html")) {
        content =
          '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n</head>\n<body>\n\n</body>\n</html>\n';
      }
      const res = await studioApiFetch(
        `/api/projects/${encodeURIComponent(pid)}/files/${encodeURIComponent(path)}`,
        {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: content,
        },
      );
      if (res.ok) {
        await refreshFileTree();
        handleFileSelect(path);
      } else {
        const err = await res.json().catch(() => ({ error: "unknown" }));
        console.error(`Create file failed: ${err.error}`);
        showToast(`Couldn't create ${path}: ${err.error}`, "error");
      }
    },
    [refreshFileTree, handleFileSelect, showToast],
  );

  const handleCreateFolder = useCallback(
    async (path: string) => {
      const pid = projectIdRef.current;
      if (!pid) return;
      const res = await studioApiFetch(
        `/api/projects/${encodeURIComponent(pid)}/files/${encodeURIComponent(path + "/.gitkeep")}`,
        {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: "",
        },
      );
      if (res.ok) {
        await refreshFileTree();
      } else {
        const err = await res.json().catch(() => ({ error: "unknown" }));
        console.error(`Create folder failed: ${err.error}`);
        showToast(`Couldn't create folder ${path}: ${err.error}`, "error");
      }
    },
    [refreshFileTree, showToast],
  );

  const handleDeleteFile = useCallback(
    async (path: string) => {
      const pid = projectIdRef.current;
      if (!pid) return;
      const res = await studioApiFetch(
        `/api/projects/${encodeURIComponent(pid)}/files/${encodeURIComponent(path)}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) {
        if (editingPathRef.current === path) setEditingFile(null);
        await refreshFileTree();
      } else {
        const err = await res.json().catch(() => ({ error: "unknown" }));
        console.error(`Delete failed: ${err.error}`);
        showToast(`Couldn't delete ${path}: ${err.error}`, "error");
      }
    },
    [refreshFileTree, showToast],
  );

  const handleRenameFile = useCallback(
    async (oldPath: string, newPath: string) => {
      const pid = projectIdRef.current;
      if (!pid) return;
      const res = await studioApiFetch(
        `/api/projects/${encodeURIComponent(pid)}/files/${encodeURIComponent(oldPath)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPath }),
        },
      );
      if (res.ok) {
        if (editingPathRef.current === oldPath) {
          handleFileSelect(newPath);
        }
        await refreshFileTree();
        setRefreshKey((k) => k + 1);
      } else {
        const err = await res.json().catch(() => ({ error: "unknown" }));
        console.error(`Rename failed: ${err.error}`);
        showToast(`Couldn't rename ${oldPath}: ${err.error}`, "error");
      }
    },
    [refreshFileTree, handleFileSelect, setRefreshKey, showToast],
  );

  const handleDuplicateFile = useCallback(
    async (path: string) => {
      const pid = projectIdRef.current;
      if (!pid) return;
      const res = await studioApiFetch(`/api/projects/${encodeURIComponent(pid)}/duplicate-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (res.ok) {
        const data = await res.json();
        await refreshFileTree();
        if (data.path) handleFileSelect(data.path);
      } else {
        const err = await res.json().catch(() => ({ error: "unknown" }));
        console.error(`Duplicate failed: ${err.error}`);
        showToast(`Couldn't duplicate ${path}: ${err.error}`, "error");
      }
    },
    [refreshFileTree, handleFileSelect, showToast],
  );

  const handleMoveFile = handleRenameFile;

  const handleImportFiles = useCallback(
    async (files: FileList | File[], dir?: string) => {
      return uploadProjectFiles(Array.from(files), dir);
    },
    [uploadProjectFiles],
  );

  const handleImportFonts = useCallback(
    async (files: FileList | File[]): Promise<ImportedFontAsset[]> => {
      const pid = projectIdRef.current;
      if (!pid) return [];
      const uploaded = await uploadProjectFiles(
        Array.from(files).filter((file) => FONT_EXT.test(file.name)),
        "assets/fonts",
      );
      const imported = uploaded
        .filter((asset) => FONT_EXT.test(asset))
        .map((asset) => ({
          family: fontFamilyFromAssetPath(asset),
          path: asset,
          url: `/api/projects/${encodeURIComponent(pid)}/preview/${encodeUrlPath(asset)}`,
        }));
      importedFontAssetsRef.current = [
        ...imported,
        ...importedFontAssetsRef.current.filter(
          (existing) =>
            !imported.some((font) => font.family.toLowerCase() === existing.family.toLowerCase()),
        ),
      ];
      return imported;
    },
    [uploadProjectFiles],
  );

  // ── Return ──

  return {
    // State
    editingFile,
    setEditingFile,
    projectDir,
    fileTree,
    fileTreeLoaded,

    // Refs
    editingPathRef,
    projectIdRef,
    saveRafRef,
    flushPendingSourceSave: editorSave.flushPendingSave,
    discardPendingSourceSave: editorSave.discardPendingSave,
    getPendingSourceCandidate: editorSave.getPendingCandidate,
    importedFontAssetsRef,

    // Core I/O
    readProjectFile,
    writeProjectFile,
    overwriteExternalConflict,
    readOptionalProjectFile,
    observeProjectFileVersion,
    updateEditingFileContent,

    // Click-to-source
    revealSourceOffset,
    openSourceForSelection,

    // Callbacks
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

    // Derived
    compositions,
    assets,
    fontAssets,
  };
}
