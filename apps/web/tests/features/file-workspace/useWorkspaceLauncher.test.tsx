// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/state/projects', () => ({
  createTerminal: vi.fn(),
}));

import { createTerminal } from '../../../src/state/projects';
import {
  useWorkspaceLauncher,
  type UseWorkspaceLauncherParams,
} from '../../../src/features/file-workspace/hooks/useWorkspaceLauncher.hooks';
import type { TranslateFn } from '../../../src/features/file-workspace/types';

const t: TranslateFn = (key) => key;

function baseParams(over: Partial<UseWorkspaceLauncherParams> = {}): UseWorkspaceLauncherParams {
  return {
    projectId: 'proj1',
    openFile: vi.fn(),
    openBrowserTab: vi.fn(),
    startNewSketch: vi.fn(async () => {}),
    createMarkdownDocument: vi.fn(async () => {}),
    fileInputRef: { current: null },
    t,
    ...over,
  };
}

describe('useWorkspaceLauncher', () => {
  it('starts closed with no toast', () => {
    const { result } = renderHook(() => useWorkspaceLauncher(baseParams()));
    expect(result.current.launcherOpen).toBe(false);
    expect(result.current.launcherToast).toBeNull();
  });

  it('openWorkspaceTabLauncher opens the launcher', () => {
    const { result } = renderHook(() => useWorkspaceLauncher(baseParams()));
    act(() => result.current.openWorkspaceTabLauncher());
    expect(result.current.launcherOpen).toBe(true);
  });

  it('launcherContext.createBrowser delegates to openBrowserTab', () => {
    const openBrowserTab = vi.fn();
    const { result } = renderHook(() => useWorkspaceLauncher(baseParams({ openBrowserTab })));
    result.current.launcherContext.createBrowser!();
    expect(openBrowserTab).toHaveBeenCalledTimes(1);
  });

  it('launcherContext.createSketch/createDocument delegate through', () => {
    const startNewSketch = vi.fn(async () => {});
    const createMarkdownDocument = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useWorkspaceLauncher(baseParams({ startNewSketch, createMarkdownDocument })),
    );
    result.current.launcherContext.createSketch!();
    result.current.launcherContext.createDocument!();
    expect(startNewSketch).toHaveBeenCalledTimes(1);
    expect(createMarkdownDocument).toHaveBeenCalledTimes(1);
  });

  it('launcherContext.uploadDesignFiles clicks the file input', () => {
    const click = vi.fn();
    const fileInputRef = { current: { click } as unknown as HTMLInputElement };
    const { result } = renderHook(() => useWorkspaceLauncher(baseParams({ fileInputRef })));
    result.current.launcherContext.uploadDesignFiles!();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('createTerminal returns the new terminal id on success', async () => {
    (createTerminal as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'term-1' });
    const { result } = renderHook(() => useWorkspaceLauncher(baseParams()));
    let id: string | null = null;
    await act(async () => {
      id = await result.current.launcherContext.createTerminal!();
    });
    expect(id).toBe('term-1');
    expect(result.current.launcherToast).toBeNull();
  });

  it('createTerminal surfaces a toast and returns null when the daemon fails to start one', async () => {
    (createTerminal as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const { result } = renderHook(() => useWorkspaceLauncher(baseParams()));
    let id: string | null = 'unset';
    await act(async () => {
      id = await result.current.launcherContext.createTerminal!();
    });
    expect(id).toBeNull();
    expect(result.current.launcherToast).toBe('workspace.terminalStartFailed');
  });

  it('launcherActions is derived from launcherContext via buildLauncherActions', () => {
    const { result } = renderHook(() => useWorkspaceLauncher(baseParams()));
    expect(result.current.launcherActions.length).toBeGreaterThan(0);
  });
});
