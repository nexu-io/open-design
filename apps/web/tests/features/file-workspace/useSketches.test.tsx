// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSketches } from '../../../src/features/file-workspace/hooks/useSketches.hooks';
import type { SketchesPort } from '../../../src/features/file-workspace/ports';
import type { UseSketchesParams } from '../../../src/features/file-workspace/hooks/useSketches.hooks';
import { emptySketchScene } from '../../../src/components/sketch-model';
import type { ProjectFile } from '../../../src/types';

function makeProjectFile(over: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name: 'sketch-a.sketch.json',
    path: 'sketch-a.sketch.json',
    type: 'file',
    size: 42,
    mtime: 1000,
    kind: 'sketch',
    mime: 'application/json',
    ...over,
  };
}

function makePort(over: Partial<SketchesPort> = {}): SketchesPort {
  return {
    fetchProjectFileText: vi.fn(async () => null),
    writeProjectTextFile: vi.fn(async (_projectId, name, content) =>
      makeProjectFile({ name, path: name, size: content.length, mtime: 2000 }),
    ),
    writeProjectBase64File: vi.fn(async (_projectId, name) => makeProjectFile({ name, path: name })),
    subscribePageUnload: vi.fn(() => () => {}),
    ...over,
  };
}

function makeParams(over: Partial<UseSketchesParams> = {}): UseSketchesParams {
  let tabs: string[] = [];
  let active: string | null = null;
  return {
    projectId: 'proj1',
    uploadDir: '',
    activeTab: '__design_files__',
    visibleFiles: [],
    t: ((key: string) => key) as UseSketchesParams['t'],
    setActiveTab: vi.fn(),
    onRefreshFiles: vi.fn(),
    refreshProjectFolders: vi.fn(async () => []),
    onUploadError: vi.fn(),
    getCurrentTabs: () => tabs,
    getCurrentActive: () => active,
    commitTabs: (nextTabs, nextActive) => {
      tabs = nextTabs;
      active = nextActive;
    },
    ...over,
  };
}

describe('useSketches', () => {
  it('starts with no sketch entries', () => {
    const { result } = renderHook(() => useSketches(makePort(), makeParams()));
    expect(result.current.sketches).toEqual({});
  });

  it('startNewSketch creates a pending entry, activates it, then persists it', async () => {
    const setActiveTab = vi.fn();
    const onRefreshFiles = vi.fn();
    const writeProjectTextFile = vi.fn(async (_projectId: string, name: string, content: string) =>
      makeProjectFile({ name, path: name, size: content.length, mtime: 3000 }),
    );
    const port = makePort({ writeProjectTextFile });
    const { result } = renderHook(() =>
      useSketches(port, makeParams({ setActiveTab, onRefreshFiles })),
    );

    await act(async () => {
      await result.current.startNewSketch();
    });

    const createdName = Object.keys(result.current.sketches)[0]!;
    expect(createdName).toMatch(/^sketch-.*\.sketch\.json$/);
    expect(setActiveTab).toHaveBeenCalledWith(createdName);
    expect(writeProjectTextFile).toHaveBeenCalledWith('proj1', createdName, expect.any(String));
    expect(onRefreshFiles).toHaveBeenCalled();
    expect(result.current.sketches[createdName]?.persisted).toBe(true);
    expect(result.current.sketches[createdName]?.dirty).toBe(false);
  });

  it('startNewSketch marks the entry dirty/unpersisted when the save fails', async () => {
    const port = makePort({ writeProjectTextFile: vi.fn(async () => null) });
    const { result } = renderHook(() => useSketches(port, makeParams()));

    await act(async () => {
      await result.current.startNewSketch();
    });

    const createdName = Object.keys(result.current.sketches)[0]!;
    expect(result.current.sketches[createdName]?.persisted).toBe(false);
    expect(result.current.sketches[createdName]?.dirty).toBe(true);
    expect(result.current.sketches[createdName]?.saving).toBe(false);
  });

  it('setSketchScene marks the scene dirty and schedules a debounced autosave', async () => {
    vi.useFakeTimers();
    try {
      const writeProjectTextFile = vi.fn(async (_projectId: string, name: string, content: string) =>
        makeProjectFile({ name, path: name, size: content.length, mtime: 4000 }),
      );
      const port = makePort({ writeProjectTextFile });
      const { result } = renderHook(() => useSketches(port, makeParams()));

      act(() => {
        result.current.setSketchScene('sketch-a.sketch.json', emptySketchScene('sketch-a.sketch.json'));
      });
      expect(result.current.sketches['sketch-a.sketch.json']?.dirty).toBe(true);
      expect(writeProjectTextFile).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(800);
      });
      expect(writeProjectTextFile).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clearSketch resets scene/items and marks dirty', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useSketches(makePort(), makeParams()));
      act(() => {
        result.current.setSketchScene('sketch-a.sketch.json', emptySketchScene('sketch-a.sketch.json'), {
          markDirty: false,
        });
      });
      act(() => {
        result.current.clearSketch('sketch-a.sketch.json');
      });
      const entry = result.current.sketches['sketch-a.sketch.json'];
      expect(entry?.items).toEqual([]);
      expect(entry?.dirty).toBe(true);
      expect(entry?.discardRawItemsOnSave).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('exportSketchImage reports the parent-dir-joined path on success and clears the upload error', async () => {
    const onUploadError = vi.fn();
    const writeProjectBase64File = vi.fn(async () => makeProjectFile({ name: 'folder/shot.png', kind: 'image' }));
    const port = makePort({ writeProjectBase64File });
    const { result } = renderHook(() => useSketches(port, makeParams({ onUploadError })));

    const outcome = await result.current.exportSketchImage('folder/sketch-a.sketch.json', 'base64data', 'shot.png');

    expect(writeProjectBase64File).toHaveBeenCalledWith('proj1', 'folder/shot.png', 'base64data');
    expect(outcome).toEqual({ fileName: 'folder/shot.png' });
    expect(onUploadError).toHaveBeenCalledWith(null);
  });

  it('exportSketchImage surfaces a translated error and returns false on failure', async () => {
    const onUploadError = vi.fn();
    const port = makePort({ writeProjectBase64File: vi.fn(async () => null) });
    const { result } = renderHook(() =>
      useSketches(port, makeParams({ onUploadError, t: ((key: string) => `t:${key}`) as UseSketchesParams['t'] })),
    );

    const outcome = await result.current.exportSketchImage('sketch-a.sketch.json', 'base64data', 'shot.png');

    expect(outcome).toBe(false);
    expect(onUploadError).toHaveBeenCalledWith('t:common.exportImageFailed');
  });

  it('discardPendingSketchEntry drops the entry', () => {
    const { result } = renderHook(() => useSketches(makePort(), makeParams()));
    act(() => {
      result.current.setSketchScene('sketch-a.sketch.json', emptySketchScene('sketch-a.sketch.json'), {
        markDirty: false,
      });
    });
    expect(result.current.sketches['sketch-a.sketch.json']).toBeDefined();
    act(() => {
      result.current.discardPendingSketchEntry('sketch-a.sketch.json');
    });
    expect(result.current.sketches['sketch-a.sketch.json']).toBeUndefined();
  });

  it('pruneClosedSketchEntry only removes an unpersisted entry', () => {
    const { result } = renderHook(() => useSketches(makePort(), makeParams()));
    act(() => {
      result.current.setSketchScene('sketch-a.sketch.json', emptySketchScene('sketch-a.sketch.json'), {
        markDirty: false,
      });
    });
    act(() => {
      result.current.pruneClosedSketchEntry('sketch-a.sketch.json');
    });
    // The entry is unpersisted (never saved), so it is dropped.
    expect(result.current.sketches['sketch-a.sketch.json']).toBeUndefined();
  });

  it('removeSketchEntry and removeSketchEntries drop the named entries', () => {
    const { result } = renderHook(() => useSketches(makePort(), makeParams()));
    act(() => {
      result.current.setSketchScene('a.sketch.json', emptySketchScene('a.sketch.json'), { markDirty: false });
      result.current.setSketchScene('b.sketch.json', emptySketchScene('b.sketch.json'), { markDirty: false });
      result.current.setSketchScene('c.sketch.json', emptySketchScene('c.sketch.json'), { markDirty: false });
    });
    act(() => {
      result.current.removeSketchEntry('a.sketch.json');
    });
    expect(result.current.sketches['a.sketch.json']).toBeUndefined();
    act(() => {
      result.current.removeSketchEntries(['b.sketch.json', 'c.sketch.json']);
    });
    expect(result.current.sketches['b.sketch.json']).toBeUndefined();
    expect(result.current.sketches['c.sketch.json']).toBeUndefined();
  });

  it('renameSketchEntry moves the entry to the new name with an updated source key', () => {
    const { result } = renderHook(() => useSketches(makePort(), makeParams()));
    act(() => {
      result.current.setSketchScene('old.sketch.json', emptySketchScene('old.sketch.json'), { markDirty: false });
    });
    act(() => {
      result.current.renameSketchEntry('old.sketch.json', makeProjectFile({ name: 'new.sketch.json', path: 'new.sketch.json' }));
    });
    expect(result.current.sketches['old.sketch.json']).toBeUndefined();
    expect(result.current.sketches['new.sketch.json']).toBeDefined();
  });

  it('renameSketchEntry is a no-op when there is no entry for the old name', () => {
    const { result } = renderHook(() => useSketches(makePort(), makeParams()));
    act(() => {
      result.current.renameSketchEntry('missing.sketch.json', makeProjectFile({ name: 'new.sketch.json' }));
    });
    expect(result.current.sketches).toEqual({});
  });

  it('subscribes to page-unload via the port and unsubscribes on unmount', () => {
    const unsubscribe = vi.fn();
    const subscribePageUnload = vi.fn(() => unsubscribe);
    const port = makePort({ subscribePageUnload });
    const { unmount } = renderHook(() => useSketches(port, makeParams()));
    expect(subscribePageUnload).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('flushes a pending autosave when the page-unload callback fires', async () => {
    const writeProjectTextFile = vi.fn(async (_projectId: string, name: string, content: string) =>
      makeProjectFile({ name, path: name, size: content.length, mtime: 5000 }),
    );
    const port = makePort({ writeProjectTextFile });
    let unloadCallback: (() => void) | undefined;
    port.subscribePageUnload = vi.fn((cb) => {
      unloadCallback = cb;
      return () => {};
    });
    const { result } = renderHook(() => useSketches(port, makeParams()));

    act(() => {
      result.current.setSketchScene('sketch-a.sketch.json', emptySketchScene('sketch-a.sketch.json'));
    });
    expect(writeProjectTextFile).not.toHaveBeenCalled();

    await act(async () => {
      unloadCallback?.();
    });
    expect(writeProjectTextFile).toHaveBeenCalledTimes(1);
  });

  it('loads a sketch file from disk when it becomes the active tab and is not yet loaded', async () => {
    const doc = JSON.stringify({ version: 1, items: [] });
    const fetchProjectFileText = vi.fn(async () => doc);
    const port = makePort({ fetchProjectFileText });
    const file = makeProjectFile();
    const { result, rerender } = renderHook(
      (props: { activeTab: string }) =>
        useSketches(port, makeParams({ activeTab: props.activeTab, visibleFiles: [file] })),
      { initialProps: { activeTab: '__design_files__' } },
    );

    rerender({ activeTab: file.name });
    await waitFor(() => expect(fetchProjectFileText).toHaveBeenCalledWith('proj1', file.name));
    await waitFor(() => expect(result.current.sketches[file.name]?.loaded).toBe(true));
    expect(result.current.sketches[file.name]?.persisted).toBe(true);
  });
});
