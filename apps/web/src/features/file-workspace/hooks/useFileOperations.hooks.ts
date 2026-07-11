// Feature-local hook for the file-workspace file-operations cluster: upload
// (picker + drag/drop-fed), delete (single + multi), rename, and
// "New Document" markdown creation. Transport is reached only through the
// injected `FileOperationsPort` (wraps `providers/registry`'s delete/
// rename/upload/write calls). Tab-state coordination (`workspaceTabsState`,
// `onTabsStateChange`, `setActiveTab`, `openFile`) and the sketch-entry
// cleanup callbacks are threaded through as PARAMS (deps-bag) — this
// cluster calls back into the not-yet-extracted tab-activation cluster and
// the already-extracted sketches cluster rather than reimplementing either.
import { useCallback } from 'react';
import type { TrackingProjectKind } from '@open-design/contracts/analytics';
import type { OpenTabsState, ProjectFile } from '../../../types';
import { deriveUploadCohort } from '../../../analytics/upload-tracking';
import { trackFileUploadResult } from '../../../analytics/events';
import { fileOperationsPort } from '../dependencies';
import type { FileOperationsPort } from '../ports';
import { initialMarkdownDocument, nextMarkdownDocumentPath, sameFileName } from '../rules';
import { DESIGN_FILES_TAB } from '../constants';
import type { SketchState, TranslateFn } from '../types';

type AnalyticsTrack = Parameters<typeof trackFileUploadResult>[0];

export interface UseFileOperationsParams {
  projectId: string;
  projectKind: TrackingProjectKind;
  files: ProjectFile[];
  uploadDir: string;
  sketches: Record<string, SketchState>;
  activeTab: string;
  persistedTabs: string[];
  tabsStateActive: string | null;
  t: TranslateFn;
  analyticsTrack: AnalyticsTrack;
  openFile: (name: string) => void;
  onRefreshFiles: () => Promise<void> | void;
  refreshProjectFolders: () => Promise<unknown>;
  onUploadError: (message: string | null) => void;
  onTabsStateChange: (next: OpenTabsState) => void;
  setActiveTab: (name: string) => void;
  workspaceTabsState: (tabs: string[], active: string | null) => OpenTabsState;
  removeSketchEntry: (name: string) => void;
  removeSketchEntries: (names: string[]) => void;
  renameSketchEntry: (oldName: string, renamed: ProjectFile) => void;
}

export interface FileOperationsController {
  handleFilePicked: (ev: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  uploadFiles: (picked: File[]) => Promise<void>;
  handleDelete: (name: string) => Promise<void>;
  handleDeleteMany: (names: string[]) => Promise<void>;
  handleRename: (oldName: string, nextName: string) => Promise<ProjectFile | null>;
  createMarkdownDocument: () => Promise<void>;
}

export function useFileOperations(
  port: FileOperationsPort,
  params: UseFileOperationsParams,
): FileOperationsController {
  const {
    projectId,
    projectKind,
    files,
    uploadDir,
    sketches,
    activeTab,
    persistedTabs,
    tabsStateActive,
    t,
    analyticsTrack,
    openFile,
    onRefreshFiles,
    refreshProjectFolders,
    onUploadError,
    onTabsStateChange,
    setActiveTab,
    workspaceTabsState,
    removeSketchEntry,
    removeSketchEntries,
    renameSketchEntry,
  } = params;

  const uploadFiles = useCallback(
    async (picked: File[]) => {
      if (picked.length === 0) return;

      onUploadError(null);
      // Cohort math is shared across all three upload surfaces; see
      // `analytics/upload-tracking.ts` for the per-file → batch reduction.
      const cohort = deriveUploadCohort(picked);
      let result: Awaited<ReturnType<FileOperationsPort['uploadProjectFiles']>>;
      try {
        result = await port.uploadProjectFiles(projectId, picked, uploadDir);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        onUploadError(`Upload failed for ${picked.length} file(s) (${detail}).`);
        trackFileUploadResult(analyticsTrack, {
          page_name: 'file_manager',
          area: 'file_manager',
          project_id: projectId,
          ...cohort,
          result: 'failed',
          error_code: detail,
        });
        return;
      }
      if (result.uploaded.length > 0) {
        await onRefreshFiles();
        const lastUploaded = result.uploaded[result.uploaded.length - 1];
        if (lastUploaded?.path) openFile(lastUploaded.path);
      }

      if (result.failed.length > 0) {
        const failedCount = result.failed.length;
        const uploadedCount = result.uploaded.length;
        const detail = result.error ? ` (${result.error})` : '';
        onUploadError(
          uploadedCount > 0
            ? `Uploaded ${uploadedCount} file(s), but ${failedCount} failed${detail}.`
            : `Upload failed for ${failedCount} file(s)${detail}.`,
        );
        console.warn('Project upload had failures', result.failed);
        trackFileUploadResult(analyticsTrack, {
          page_name: 'file_manager',
          area: 'file_manager',
          project_id: projectId,
          ...cohort,
          result: 'failed',
          ...(result.error ? { error_code: result.error } : {}),
        });
      } else if (result.uploaded.length > 0) {
        trackFileUploadResult(analyticsTrack, {
          page_name: 'file_manager',
          area: 'file_manager',
          project_id: projectId,
          ...cohort,
          result: 'success',
        });
      }
    },
    [analyticsTrack, onRefreshFiles, onUploadError, openFile, port, projectId, uploadDir],
  );

  const handleFilePicked = useCallback(
    async (ev: React.ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(ev.target.files ?? []);
      ev.target.value = '';
      await uploadFiles(picked);
    },
    [uploadFiles],
  );

  const handleDelete = useCallback(
    async (name: string) => {
      if (!confirm(t('workspace.deleteFileConfirm', { name }))) return;
      const ok = await port.deleteProjectFile(projectId, name);
      if (ok) {
        await onRefreshFiles();
        const nextTabs = persistedTabs.filter((n) => n !== name);
        if (activeTab === name) {
          // User is viewing the file being deleted: fall back to another
          // open tab (or the Design Files panel if none remain).
          const nextActive = nextTabs[nextTabs.length - 1] ?? null;
          onTabsStateChange(workspaceTabsState(nextTabs, nextActive));
          setActiveTab(nextActive ?? DESIGN_FILES_TAB);
        } else {
          // Deletion was triggered from the Design Files panel (or another
          // tab). We preserve `activeTab` because the user is viewing a
          // different context (Design Files or another tab) and shouldn't
          // be navigated away. Only clear the persisted active reference
          // when it points at the deleted file so we don't leave a dangling
          // pointer behind.
          const nextActive = tabsStateActive === name ? null : tabsStateActive;
          onTabsStateChange(workspaceTabsState(nextTabs, nextActive));
        }
        removeSketchEntry(name);
      }
    },
    [
      activeTab,
      onRefreshFiles,
      onTabsStateChange,
      persistedTabs,
      port,
      projectId,
      removeSketchEntry,
      setActiveTab,
      t,
      tabsStateActive,
      workspaceTabsState,
    ],
  );

  const handleDeleteMany = useCallback(
    async (names: string[]) => {
      if (names.length === 0) return;
      if (!confirm(t('workspace.deleteSelectedFilesConfirm', { n: names.length }))) return;
      const deleted: string[] = [];
      const failed: string[] = [];
      for (const name of names) {
        const ok = await port.deleteProjectFile(projectId, name);
        if (ok) deleted.push(name);
        else failed.push(name);
      }
      if (deleted.length > 0) {
        await onRefreshFiles();
        const deletedSet = new Set(deleted);
        const nextTabs = persistedTabs.filter((n) => !deletedSet.has(n));
        if (activeTab && deletedSet.has(activeTab)) {
          const nextActive = nextTabs[nextTabs.length - 1] ?? null;
          onTabsStateChange(workspaceTabsState(nextTabs, nextActive));
          setActiveTab(nextActive ?? DESIGN_FILES_TAB);
        } else {
          const nextActive =
            tabsStateActive && deletedSet.has(tabsStateActive) ? null : tabsStateActive;
          onTabsStateChange(workspaceTabsState(nextTabs, nextActive));
        }
        removeSketchEntries(deleted);
      }
      if (failed.length > 0) {
        alert(t('workspace.deleteSelectedFilesPartial', { n: failed.length }));
      }
    },
    [
      activeTab,
      onRefreshFiles,
      onTabsStateChange,
      persistedTabs,
      port,
      projectId,
      removeSketchEntries,
      setActiveTab,
      t,
      tabsStateActive,
      workspaceTabsState,
    ],
  );

  const handleRename = useCallback(
    async (oldName: string, nextName: string): Promise<ProjectFile | null> => {
      const hasPendingSketchConflict = Object.entries(sketches).some(
        ([name, sketch]) => !sketch.persisted && sameFileName(name, nextName),
      );
      if (nextName !== oldName && hasPendingSketchConflict) {
        throw new Error(
          `A pending sketch named "${nextName}" is already open. Save or close it before renaming.`,
        );
      }

      const result = await port.renameProjectFile(projectId, oldName, nextName);
      const renamed = result.file;
      await onRefreshFiles();
      await refreshProjectFolders();

      const nextTabs = persistedTabs.map((name) => (name === oldName ? renamed.name : name));
      const nextActive = tabsStateActive === oldName ? renamed.name : tabsStateActive;
      onTabsStateChange(workspaceTabsState(nextTabs, nextActive));
      if (activeTab === oldName) setActiveTab(renamed.name);

      renameSketchEntry(oldName, renamed);

      return renamed;
    },
    [
      activeTab,
      onRefreshFiles,
      onTabsStateChange,
      persistedTabs,
      port,
      projectId,
      refreshProjectFolders,
      renameSketchEntry,
      setActiveTab,
      sketches,
      tabsStateActive,
      workspaceTabsState,
    ],
  );

  const createMarkdownDocument = useCallback(async () => {
    const target = nextMarkdownDocumentPath(files, uploadDir);
    const file = await port.writeProjectTextFile(
      projectId,
      target,
      initialMarkdownDocument(target, projectKind, t),
    );
    if (!file) return;
    await onRefreshFiles();
    await refreshProjectFolders();
    openFile(file.name);
  }, [files, onRefreshFiles, openFile, port, projectId, projectKind, refreshProjectFolders, t, uploadDir]);

  return {
    handleFilePicked,
    uploadFiles,
    handleDelete,
    handleDeleteMany,
    handleRename,
    createMarkdownDocument,
  };
}

/**
 * Wirer: binds the real file-operations transport and returns a
 * ready-to-call hook. This is the default the orchestrator injects; swap it
 * via the component prop in tests.
 */
export function useWiredFileOperations(
  params: UseFileOperationsParams,
): FileOperationsController {
  return useFileOperations(fileOperationsPort, params);
}
