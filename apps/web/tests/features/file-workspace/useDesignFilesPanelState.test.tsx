// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LibraryAsset } from '@open-design/contracts';

import {
  useDesignFilesPanelState,
  type UseDesignFilesPanelStateParams,
} from '../../../src/features/file-workspace/hooks/useDesignFilesPanelState.hooks';
import type { DesignFilesLibraryPort } from '../../../src/features/file-workspace/ports';
import { createDefaultDesignFilesNavState } from '../../../src/features/file-workspace/rules';

function makePort(over: Partial<DesignFilesLibraryPort> = {}): DesignFilesLibraryPort {
  return {
    applyLibraryAsset: vi.fn(async () => ({ relPath: 'library/asset.png' })),
    ...over,
  };
}

function baseParams(over: Partial<UseDesignFilesPanelStateParams> = {}): UseDesignFilesPanelStateParams {
  return {
    projectId: 'proj1',
    uploadDir: '',
    onRefreshFiles: vi.fn(async () => {}),
    openFile: vi.fn(),
    ...over,
  };
}

function makeAsset(id: string): LibraryAsset {
  return { id } as LibraryAsset;
}

describe('useDesignFilesPanelState', () => {
  it('starts with a default nav state and the library picker closed', () => {
    const { result } = renderHook(() => useDesignFilesPanelState(makePort(), baseParams()));
    expect(result.current.designFilesNavRef.current).toEqual(createDefaultDesignFilesNavState());
    expect(result.current.showLibraryPicker).toBe(false);
  });

  it('onDesignFilesNavStateChange mutates the ref without triggering a re-render', () => {
    const port = makePort();
    const params = baseParams();
    const { result } = renderHook(() => useDesignFilesPanelState(port, params));
    const next = { ...createDefaultDesignFilesNavState(), currentDir: 'assets' };
    act(() => result.current.onDesignFilesNavStateChange(next));
    expect(result.current.designFilesNavRef.current).toEqual(next);
  });

  it('resets the nav state when projectId changes', () => {
    const port = makePort();
    const params = baseParams({ projectId: 'proj1' });
    const { result, rerender } = renderHook(
      (p: UseDesignFilesPanelStateParams) => useDesignFilesPanelState(port, p),
      { initialProps: params },
    );
    const next = { ...createDefaultDesignFilesNavState(), currentDir: 'assets' };
    act(() => result.current.onDesignFilesNavStateChange(next));
    expect(result.current.designFilesNavRef.current).toEqual(next);

    rerender({ ...params, projectId: 'proj2' });
    expect(result.current.designFilesNavRef.current).toEqual(createDefaultDesignFilesNavState());
  });

  it('setShowLibraryPicker toggles the picker open', () => {
    const { result } = renderHook(() => useDesignFilesPanelState(makePort(), baseParams()));
    act(() => result.current.setShowLibraryPicker(true));
    expect(result.current.showLibraryPicker).toBe(true);
  });

  it('handleLibraryPickerConfirm applies every asset, refreshes files, and opens the last relPath', async () => {
    const applyLibraryAsset = vi.fn(async (assetId: string) =>
      assetId === 'a2' ? { relPath: 'library/second.png' } : { relPath: 'library/first.png' },
    );
    const onRefreshFiles = vi.fn(async () => {});
    const openFile = vi.fn();
    const params = baseParams({ projectId: 'proj1', uploadDir: 'assets', onRefreshFiles, openFile });
    const { result } = renderHook(() => useDesignFilesPanelState(makePort({ applyLibraryAsset }), params));

    await act(async () => {
      await result.current.handleLibraryPickerConfirm([makeAsset('a1'), makeAsset('a2')]);
    });

    expect(applyLibraryAsset).toHaveBeenNthCalledWith(1, 'a1', 'proj1', 'assets', { includeElement: true });
    expect(applyLibraryAsset).toHaveBeenNthCalledWith(2, 'a2', 'proj1', 'assets', { includeElement: true });
    expect(onRefreshFiles).toHaveBeenCalledTimes(1);
    expect(openFile).toHaveBeenCalledWith('library/second.png');
  });

  it('handleLibraryPickerConfirm prefers elementRelPath over relPath as the last opened file', async () => {
    const applyLibraryAsset = vi.fn(async () => ({ relPath: 'library/a.png', elementRelPath: 'library/a.element.html' }));
    const openFile = vi.fn();
    const params = baseParams({ openFile });
    const { result } = renderHook(() => useDesignFilesPanelState(makePort({ applyLibraryAsset }), params));

    await act(async () => {
      await result.current.handleLibraryPickerConfirm([makeAsset('a1')]);
    });

    expect(openFile).toHaveBeenCalledWith('library/a.element.html');
  });

  it('handleLibraryPickerConfirm does not open a file when nothing was applied', async () => {
    const applyLibraryAsset = vi.fn(async () => null);
    const openFile = vi.fn();
    const onRefreshFiles = vi.fn(async () => {});
    const params = baseParams({ openFile, onRefreshFiles });
    const { result } = renderHook(() => useDesignFilesPanelState(makePort({ applyLibraryAsset }), params));

    await act(async () => {
      await result.current.handleLibraryPickerConfirm([makeAsset('a1')]);
    });

    expect(onRefreshFiles).toHaveBeenCalledTimes(1);
    expect(openFile).not.toHaveBeenCalled();
  });
});
