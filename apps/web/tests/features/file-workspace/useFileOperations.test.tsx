// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { useFileOperations } from '../../../src/features/file-workspace/hooks/useFileOperations.hooks';
import type { UseFileOperationsParams } from '../../../src/features/file-workspace/hooks/useFileOperations.hooks';
import type { FileOperationsPort } from '../../../src/features/file-workspace/ports';
import { DESIGN_FILES_TAB } from '../../../src/features/file-workspace/constants';
import type { OpenTabsState, ProjectFile } from '../../../src/types';
import type { SketchState } from '../../../src/features/file-workspace/types';

function makeProjectFile(over: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name: 'a.md',
    path: 'a.md',
    type: 'file',
    size: 10,
    mtime: 1000,
    kind: 'text',
    mime: 'text/markdown',
    ...over,
  };
}

function makePort(over: Partial<FileOperationsPort> = {}): FileOperationsPort {
  return {
    deleteProjectFile: vi.fn(async () => true),
    renameProjectFile: vi.fn(async (_projectId, _from, to) => ({
      file: makeProjectFile({ name: to, path: to }),
      oldName: _from,
      newName: to,
    })),
    uploadProjectFiles: vi.fn(async () => ({ uploaded: [], failed: [] })),
    writeProjectTextFile: vi.fn(async (_projectId, name) => makeProjectFile({ name, path: name })),
    ...over,
  };
}

function makeParams(over: Partial<UseFileOperationsParams> = {}): UseFileOperationsParams {
  return {
    projectId: 'proj1',
    projectKind: 'canvas' as UseFileOperationsParams['projectKind'],
    files: [],
    uploadDir: '',
    sketches: {} as Record<string, SketchState>,
    activeTab: DESIGN_FILES_TAB,
    persistedTabs: ['a.md', 'b.md'],
    tabsStateActive: null,
    t: ((key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key) as UseFileOperationsParams['t'],
    analyticsTrack: vi.fn(),
    openFile: vi.fn(),
    onRefreshFiles: vi.fn(),
    refreshProjectFolders: vi.fn(async () => []),
    onUploadError: vi.fn(),
    onTabsStateChange: vi.fn(),
    setActiveTab: vi.fn(),
    workspaceTabsState: (tabs: string[], active: string | null): OpenTabsState => ({ tabs, active }),
    removeSketchEntry: vi.fn(),
    removeSketchEntries: vi.fn(),
    renameSketchEntry: vi.fn(),
    ...over,
  };
}

describe('useFileOperations', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;
  let alertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    confirmSpy.mockRestore();
    alertSpy.mockRestore();
  });

  describe('uploadFiles', () => {
    it('does nothing for an empty file list', async () => {
      const port = makePort();
      const params = makeParams();
      const { result } = renderHook(() => useFileOperations(port, params));
      await act(async () => result.current.uploadFiles([]));
      expect(port.uploadProjectFiles).not.toHaveBeenCalled();
    });

    it('opens the last uploaded file and refreshes on success', async () => {
      const port = makePort({
        uploadProjectFiles: vi.fn(async () => ({
          uploaded: [{ path: 'x.png' }, { path: 'y.png' }] as never,
          failed: [],
        })),
      });
      const openFile = vi.fn();
      const onRefreshFiles = vi.fn();
      const params = makeParams({ openFile, onRefreshFiles });
      const { result } = renderHook(() => useFileOperations(port, params));
      const file = new File(['x'], 'x.png');
      await act(async () => result.current.uploadFiles([file]));
      expect(onRefreshFiles).toHaveBeenCalledTimes(1);
      expect(openFile).toHaveBeenCalledWith('y.png');
    });

    it('sets an upload error and skips opening a file when the transport throws', async () => {
      const port = makePort({
        uploadProjectFiles: vi.fn(async () => {
          throw new Error('network down');
        }),
      });
      const onUploadError = vi.fn();
      const openFile = vi.fn();
      const params = makeParams({ onUploadError, openFile });
      const { result } = renderHook(() => useFileOperations(port, params));
      const file = new File(['x'], 'x.png');
      await act(async () => result.current.uploadFiles([file]));
      expect(onUploadError).toHaveBeenCalledWith(expect.stringContaining('network down'));
      expect(openFile).not.toHaveBeenCalled();
    });
  });

  describe('handleFilePicked', () => {
    it('reads picked files from the input event, clears the input, and uploads', async () => {
      const port = makePort({
        uploadProjectFiles: vi.fn(async () => ({ uploaded: [], failed: [] })),
      });
      const params = makeParams();
      const { result } = renderHook(() => useFileOperations(port, params));
      const file = new File(['x'], 'x.png');
      const input = document.createElement('input');
      input.type = 'file';
      Object.defineProperty(input, 'files', { value: [file] });
      const ev = { target: input } as unknown as React.ChangeEvent<HTMLInputElement>;
      await act(async () => result.current.handleFilePicked(ev));
      expect(port.uploadProjectFiles).toHaveBeenCalledWith('proj1', [file], '');
      expect(input.value).toBe('');
    });
  });

  describe('handleDelete', () => {
    it('does nothing when the user cancels the confirm dialog', async () => {
      confirmSpy.mockReturnValue(false);
      const port = makePort();
      const params = makeParams();
      const { result } = renderHook(() => useFileOperations(port, params));
      await act(async () => result.current.handleDelete('a.md'));
      expect(port.deleteProjectFile).not.toHaveBeenCalled();
    });

    it('falls back to DESIGN_FILES_TAB when deleting the active tab leaves no tabs', async () => {
      const port = makePort();
      const onTabsStateChange = vi.fn();
      const setActiveTab = vi.fn();
      const removeSketchEntry = vi.fn();
      const params = makeParams({
        persistedTabs: ['a.md'],
        activeTab: 'a.md',
        onTabsStateChange,
        setActiveTab,
        removeSketchEntry,
      });
      const { result } = renderHook(() => useFileOperations(port, params));
      await act(async () => result.current.handleDelete('a.md'));
      expect(port.deleteProjectFile).toHaveBeenCalledWith('proj1', 'a.md');
      expect(onTabsStateChange).toHaveBeenCalledWith({ tabs: [], active: null });
      expect(setActiveTab).toHaveBeenCalledWith(DESIGN_FILES_TAB);
      expect(removeSketchEntry).toHaveBeenCalledWith('a.md');
    });

    it('preserves activeTab when deleting a different, non-active file', async () => {
      const port = makePort();
      const onTabsStateChange = vi.fn();
      const setActiveTab = vi.fn();
      const params = makeParams({
        persistedTabs: ['a.md', 'b.md'],
        activeTab: 'b.md',
        tabsStateActive: 'b.md',
        onTabsStateChange,
        setActiveTab,
      });
      const { result } = renderHook(() => useFileOperations(port, params));
      await act(async () => result.current.handleDelete('a.md'));
      expect(setActiveTab).not.toHaveBeenCalled();
      expect(onTabsStateChange).toHaveBeenCalledWith({ tabs: ['b.md'], active: 'b.md' });
    });
  });

  describe('handleDeleteMany', () => {
    it('shows a partial-failure alert when some deletions fail', async () => {
      const port = makePort({
        deleteProjectFile: vi.fn(async (_projectId, name) => name !== 'b.md'),
      });
      const removeSketchEntries = vi.fn();
      const params = makeParams({
        persistedTabs: ['a.md', 'b.md'],
        activeTab: DESIGN_FILES_TAB,
        removeSketchEntries,
      });
      const { result } = renderHook(() => useFileOperations(port, params));
      await act(async () => result.current.handleDeleteMany(['a.md', 'b.md']));
      expect(removeSketchEntries).toHaveBeenCalledWith(['a.md']);
      expect(alertSpy).toHaveBeenCalled();
    });
  });

  describe('handleRename', () => {
    it('throws when a pending (unpersisted) sketch already owns the target name', async () => {
      const port = makePort();
      const params = makeParams({
        sketches: { 'b.sketch.json': { persisted: false } as SketchState },
      });
      const { result } = renderHook(() => useFileOperations(port, params));
      await expect(result.current.handleRename('a.md', 'b.sketch.json')).rejects.toThrow(
        /already open/,
      );
      expect(port.renameProjectFile).not.toHaveBeenCalled();
    });

    it('renames, refreshes files/folders, and updates the active tab when renaming the active file', async () => {
      const port = makePort();
      const setActiveTab = vi.fn();
      const onTabsStateChange = vi.fn();
      const renameSketchEntry = vi.fn();
      const onRefreshFiles = vi.fn();
      const refreshProjectFolders = vi.fn(async () => []);
      const params = makeParams({
        persistedTabs: ['a.md'],
        activeTab: 'a.md',
        tabsStateActive: 'a.md',
        setActiveTab,
        onTabsStateChange,
        renameSketchEntry,
        onRefreshFiles,
        refreshProjectFolders,
      });
      const { result } = renderHook(() => useFileOperations(port, params));
      const renamed = await act(async () => result.current.handleRename('a.md', 'a2.md'));
      expect(port.renameProjectFile).toHaveBeenCalledWith('proj1', 'a.md', 'a2.md');
      expect(onRefreshFiles).toHaveBeenCalledTimes(1);
      expect(refreshProjectFolders).toHaveBeenCalledTimes(1);
      expect(onTabsStateChange).toHaveBeenCalledWith({ tabs: ['a2.md'], active: 'a2.md' });
      expect(setActiveTab).toHaveBeenCalledWith('a2.md');
      expect(renameSketchEntry).toHaveBeenCalledWith('a.md', expect.objectContaining({ name: 'a2.md' }));
      expect(renamed?.name).toBe('a2.md');
    });
  });

  describe('createMarkdownDocument', () => {
    it('writes a new markdown file, refreshes, and opens it', async () => {
      const port = makePort({
        writeProjectTextFile: vi.fn(async (_projectId, name) => makeProjectFile({ name, path: name })),
      });
      const openFile = vi.fn();
      const onRefreshFiles = vi.fn();
      const refreshProjectFolders = vi.fn(async () => []);
      const params = makeParams({ openFile, onRefreshFiles, refreshProjectFolders, files: [] });
      const { result } = renderHook(() => useFileOperations(port, params));
      await act(async () => result.current.createMarkdownDocument());
      expect(port.writeProjectTextFile).toHaveBeenCalled();
      expect(onRefreshFiles).toHaveBeenCalledTimes(1);
      expect(refreshProjectFolders).toHaveBeenCalledTimes(1);
      expect(openFile).toHaveBeenCalled();
    });

    it('does nothing when the write fails (returns null)', async () => {
      const port = makePort({ writeProjectTextFile: vi.fn(async () => null) });
      const openFile = vi.fn();
      const onRefreshFiles = vi.fn();
      const params = makeParams({ openFile, onRefreshFiles });
      const { result } = renderHook(() => useFileOperations(port, params));
      await act(async () => result.current.createMarkdownDocument());
      expect(onRefreshFiles).not.toHaveBeenCalled();
      expect(openFile).not.toHaveBeenCalled();
    });
  });
});
