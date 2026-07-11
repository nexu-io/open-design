// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Conversation, LiveArtifactWorkspaceEntry, ProjectFile } from '../../../src/types';

import {
  useWorkspaceContextTracking,
  type WorkspaceContextTrackingParams,
} from '../../../src/features/file-workspace/hooks/useWorkspaceContextTracking.hooks';
import type { BrowserWorkspaceTab, SketchState, TranslateFn } from '../../../src/features/file-workspace/types';

const t: TranslateFn = (key) => key;

function baseParams(over: Partial<WorkspaceContextTrackingParams> = {}): WorkspaceContextTrackingParams {
  return {
    persistedTabs: [],
    sketches: {} as Record<string, SketchState>,
    browserTabs: [] as BrowserWorkspaceTab[],
    designSystemProject: null,
    showQuestionsTab: false,
    activeTab: '__design_files__',
    designFilesTabIsEmpty: true,
    uploadDir: '',
    resolvedDir: null,
    t,
    conversations: [] as Conversation[],
    activeFile: null,
    activeLiveArtifact: null,
    visibleFiles: [] as ProjectFile[],
    liveArtifactEntries: [] as LiveArtifactWorkspaceEntry[],
    ...over,
  };
}

describe('useWorkspaceContextTracking', () => {
  it('derives tabNames/orderedWorkspaceTabs/workspaceTabIds from persisted tabs and browser tabs', () => {
    const params = baseParams({
      persistedTabs: ['a.md'],
      browserTabs: [{ id: '__browser__:1', label: 'Browser' }],
    });
    const { result } = renderHook(() => useWorkspaceContextTracking(params));
    expect(result.current.tabNames).toEqual(['a.md']);
    expect(result.current.orderedWorkspaceTabs.map((entry) => entry.id)).toEqual(['__browser__:1', 'a.md']);
    expect(result.current.workspaceTabIds).toEqual(['__design_files__', '__browser__:1', 'a.md']);
  });

  it('adds a pending sketch to tabNames and workspaceTabIds', () => {
    const params = baseParams({
      persistedTabs: [],
      sketches: {
        'pending.sketch.json': {
          version: 1,
          rawItems: [],
          discardRawItemsOnSave: false,
          items: [],
          scene: {} as SketchState['scene'],
          dirty: false,
          persisted: false,
          loaded: false,
          saving: false,
        },
      },
    });
    const { result } = renderHook(() => useWorkspaceContextTracking(params));
    expect(result.current.tabNames).toEqual(['pending.sketch.json']);
    expect(result.current.workspaceTabIds).toContain('pending.sketch.json');
  });

  it('calls onActiveContextChange with the computed active context', () => {
    const onActiveContextChange = vi.fn();
    const params = baseParams({
      activeTab: '__design_files__',
      designFilesTabIsEmpty: false,
      uploadDir: 'assets',
      onActiveContextChange,
    });
    renderHook(() => useWorkspaceContextTracking(params));
    expect(onActiveContextChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'folder:assets', kind: 'folder', tabId: '__design_files__' }),
    );
  });

  it('calls onWorkspaceContextsChange with the computed context list', () => {
    const onWorkspaceContextsChange = vi.fn();
    const params = baseParams({ onWorkspaceContextsChange });
    renderHook(() => useWorkspaceContextTracking(params));
    expect(onWorkspaceContextsChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'workspace:design-files' }),
    ]);
  });

  it('does not re-fire onActiveContextChange on a re-render with unchanged inputs', () => {
    const onActiveContextChange = vi.fn();
    const params = baseParams({ onActiveContextChange });
    const { rerender } = renderHook((p: WorkspaceContextTrackingParams) => useWorkspaceContextTracking(p), {
      initialProps: params,
    });
    expect(onActiveContextChange).toHaveBeenCalledTimes(1);
    rerender(params);
    expect(onActiveContextChange).toHaveBeenCalledTimes(1);
  });
});
