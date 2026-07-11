// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  useBrowserTabs,
  type UseBrowserTabsParams,
} from '../../../src/features/file-workspace/hooks/useBrowserTabs.hooks';
import { BROWSER_KEEPALIVE_CAP } from '../../../src/features/file-workspace/constants';
import type {
  BrowserWorkspaceTab,
  TranslateFn,
  WorkspaceOrderedTab,
} from '../../../src/features/file-workspace/types';
import type { OpenTabsState } from '../../../src/types';

const t: TranslateFn = (key) => key;

function workspaceTabsState(
  tabs: string[],
  active: string | null,
  nextBrowserTabs: BrowserWorkspaceTab[] = [],
): OpenTabsState {
  const state: OpenTabsState = { tabs, active };
  if (nextBrowserTabs.length > 0) state.browserTabs = nextBrowserTabs;
  return state;
}

type HarnessParams = Omit<UseBrowserTabsParams, 'orderedWorkspaceTabsRef' | 'openFileRef'> & {
  orderedWorkspaceTabs?: WorkspaceOrderedTab[];
  openFile?: (name: string) => void;
};

function useHarness(params: HarnessParams) {
  const orderedWorkspaceTabsRef = useRef<WorkspaceOrderedTab[]>(params.orderedWorkspaceTabs ?? []);
  orderedWorkspaceTabsRef.current = params.orderedWorkspaceTabs ?? [];
  const openFileRef = useRef<(name: string) => void>(params.openFile ?? (() => {}));
  openFileRef.current = params.openFile ?? (() => {});
  return useBrowserTabs({ ...params, orderedWorkspaceTabsRef, openFileRef });
}

function baseParams(over: Partial<HarnessParams> = {}): HarnessParams {
  return {
    projectId: 'proj1',
    tabsState: { tabs: ['cover.html'], active: 'cover.html' },
    activeTab: 'cover.html',
    setActiveTab: vi.fn(),
    persistedTabs: ['cover.html'],
    onTabsStateChange: vi.fn(),
    commitTabsState: vi.fn(),
    workspaceTabsState,
    setUploadError: vi.fn(),
    setPersistedActive: vi.fn(),
    t,
    ...over,
  };
}

describe('useBrowserTabs', () => {
  it('initializes browserTabs from tabsState.browserTabs', () => {
    const browserTabs: BrowserWorkspaceTab[] = [{ id: '__browser__:1', label: 'Browser' }];
    const params = baseParams({ tabsState: { tabs: ['cover.html'], active: 'cover.html', browserTabs } });
    const { result } = renderHook(() => useHarness(params));
    expect(result.current.browserTabs).toEqual(browserTabs);
  });

  it('openBrowserTab creates a tab anchored after the last ordered tab and activates it', () => {
    const setActiveTab = vi.fn();
    const commitTabsState = vi.fn();
    const params = baseParams({
      setActiveTab,
      commitTabsState,
      orderedWorkspaceTabs: [{ id: 'cover.html', kind: 'file', name: 'cover.html' }],
    });
    const { result } = renderHook(() => useHarness(params));

    act(() => result.current.openBrowserTab());

    expect(result.current.browserTabs).toEqual([
      { id: '__browser__:1', insertAfter: 'cover.html', label: 'Browser' },
    ]);
    expect(setActiveTab).toHaveBeenCalledWith('__browser__:1');
    expect(commitTabsState).toHaveBeenCalledWith(
      workspaceTabsState(['cover.html'], '__browser__:1', [
        { id: '__browser__:1', insertAfter: 'cover.html', label: 'Browser' },
      ]),
    );
  });

  it('openBrowserTab numbers subsequent tabs', () => {
    const params = baseParams();
    const { result } = renderHook(() => useHarness(params));

    act(() => result.current.openBrowserTab());
    act(() => result.current.openBrowserTab());

    expect(result.current.browserTabs.map((tab) => tab.label)).toEqual(['Browser', 'Browser 2']);
  });

  it('closeBrowserTab removes the tab and falls back to a neighbor via onTabsStateChange (not commitTabsState)', () => {
    const onTabsStateChange = vi.fn();
    const commitTabsState = vi.fn();
    const browserTabs: BrowserWorkspaceTab[] = [
      { id: '__browser__:1', label: 'Browser' },
      { id: '__browser__:2', label: 'Browser 2' },
    ];
    const params = baseParams({
      tabsState: { tabs: ['cover.html'], active: '__browser__:1', browserTabs },
      activeTab: '__browser__:1',
      persistedTabs: ['cover.html'],
      onTabsStateChange,
      commitTabsState,
    });
    const { result } = renderHook(() => useHarness(params));

    act(() => result.current.closeBrowserTab('__browser__:1'));

    expect(result.current.browserTabs).toEqual([{ id: '__browser__:2', label: 'Browser 2' }]);
    expect(onTabsStateChange).toHaveBeenCalledWith(
      workspaceTabsState(['cover.html'], '__browser__:2', [{ id: '__browser__:2', label: 'Browser 2' }]),
    );
    expect(commitTabsState).not.toHaveBeenCalled();
  });

  it('updateBrowserTabInfo updates title/url and calls onTabsStateChange only when something changed', () => {
    const onTabsStateChange = vi.fn();
    const browserTabs: BrowserWorkspaceTab[] = [{ id: '__browser__:1', label: 'Browser' }];
    const params = baseParams({
      tabsState: { tabs: ['cover.html'], active: '__browser__:1', browserTabs },
      activeTab: '__browser__:1',
      onTabsStateChange,
    });
    const { result, rerender } = renderHook((p: HarnessParams) => useHarness(p), { initialProps: params });

    act(() => {
      result.current.updateBrowserTabInfo('__browser__:1', { title: 'Economist', url: 'https://economist.com/' });
    });

    expect(result.current.browserTabs).toEqual([
      { id: '__browser__:1', label: 'Browser', title: 'Economist', url: 'https://economist.com/' },
    ]);
    expect(onTabsStateChange).toHaveBeenCalledTimes(1);

    // Re-render with the updated browserTabs threaded back in (mirrors the
    // orchestrator re-rendering with fresh state) so the no-op check below
    // diffs against the tab's now-current title/url.
    rerender({
      ...params,
      tabsState: { tabs: ['cover.html'], active: '__browser__:1', browserTabs: result.current.browserTabs },
    });
    onTabsStateChange.mockClear();
    act(() => {
      result.current.updateBrowserTabInfo('__browser__:1', { title: 'Economist', url: 'https://economist.com/' });
    });
    expect(onTabsStateChange).not.toHaveBeenCalled();
  });

  it('handleBrowserPageSnapshotToast sets a toast with the design-files action', () => {
    const setPersistedActive = vi.fn();
    const params = baseParams({ setPersistedActive });
    const { result } = renderHook(() => useHarness(params));

    act(() => {
      result.current.handleBrowserPageSnapshotToast({
        actionLabel: 'View Design Files',
        actionTarget: 'design-files',
        elapsedSeconds: 2,
        message: 'Saved page snapshot (HTML + CSS).',
        status: 'success',
        tabId: '__browser__:1',
      });
    });

    expect(result.current.browserSnapshotToast?.message).toBe('Saved page snapshot (HTML + CSS).');
    expect(result.current.browserSnapshotToast?.tone).toBe('success');

    act(() => result.current.browserSnapshotToast?.onAction?.());
    expect(setPersistedActive).toHaveBeenCalledWith('__design_files__');
    expect(result.current.browserSnapshotToast).toBeNull();
  });

  it('handleBrowserPageSnapshotToast routes the file action through openFileRef', () => {
    const openFile = vi.fn();
    const params = baseParams({ openFile });
    const { result } = renderHook(() => useHarness(params));

    act(() => {
      result.current.handleBrowserPageSnapshotToast({
        actionFileName: 'browser-archive/example/manifest.json',
        actionTarget: 'file',
        message: 'Saved page snapshot (HTML + CSS).',
        status: 'success',
        tabId: '__browser__:1',
      });
    });

    act(() => result.current.browserSnapshotToast?.onAction?.());
    expect(openFile).toHaveBeenCalledWith('browser-archive/example/manifest.json');
  });

  it('opens and navigates a browser tab from a browserOpenRequest prop', () => {
    const setActiveTab = vi.fn();
    const commitTabsState = vi.fn();
    const params = baseParams({
      setActiveTab,
      commitTabsState,
      browserOpenRequest: { tabId: '__browser__:1', url: 'https://economist.com/', nonce: 7 },
    });
    const { result } = renderHook(() => useHarness(params));

    expect(result.current.browserTabs).toEqual([
      {
        id: '__browser__:1',
        insertAfter: 'cover.html',
        label: 'Browser',
        title: 'economist.com',
        url: 'https://economist.com/',
      },
    ]);
    expect(result.current.browserNavigateRequests['__browser__:1']).toEqual({
      url: 'https://economist.com/',
      nonce: 7,
    });
    expect(setActiveTab).toHaveBeenCalledWith('__browser__:1');
    expect(commitTabsState).toHaveBeenCalled();
  });

  it('a focusOnly browserOpenRequest activates an existing tab without issuing a navigate request', () => {
    const setActiveTab = vi.fn();
    const browserTabs: BrowserWorkspaceTab[] = [{ id: '__browser__:1', label: 'Browser' }];
    const params = baseParams({
      tabsState: { tabs: ['cover.html'], active: 'cover.html', browserTabs },
      setActiveTab,
      browserOpenRequest: { tabId: '__browser__:1', url: 'https://economist.com/', nonce: 1, focusOnly: true },
    });
    const { result } = renderHook(() => useHarness(params));

    expect(setActiveTab).toHaveBeenCalledWith('__browser__:1');
    expect(result.current.browserNavigateRequests).toEqual({});
  });

  it('mountedBrowserTabIds includes the pinned tab even without activation', () => {
    const browserTabs: BrowserWorkspaceTab[] = [{ id: '__browser__:1', label: 'Browser' }];
    const params = baseParams({
      tabsState: { tabs: ['cover.html'], active: 'cover.html', browserTabs },
      pinnedBrowserTabId: '__browser__:1',
    });
    const { result } = renderHook(() => useHarness(params));
    expect(result.current.mountedBrowserTabIds.has('__browser__:1')).toBe(true);
  });

  it('caps the mounted-tab LRU at BROWSER_KEEPALIVE_CAP as tabs are activated', () => {
    const browserTabs: BrowserWorkspaceTab[] = Array.from({ length: BROWSER_KEEPALIVE_CAP + 1 }, (_, i) => ({
      id: `__browser__:${i + 1}`,
      label: `Browser ${i + 1}`,
    }));
    const params = baseParams({
      tabsState: { tabs: ['cover.html'], active: 'cover.html', browserTabs },
      activeTab: 'cover.html',
    });
    const { result, rerender } = renderHook((p: HarnessParams) => useHarness(p), { initialProps: params });

    for (let i = 1; i <= BROWSER_KEEPALIVE_CAP + 1; i += 1) {
      rerender({ ...params, activeTab: `__browser__:${i}` });
    }

    expect(result.current.mountedBrowserTabIds.size).toBe(BROWSER_KEEPALIVE_CAP);
    expect(result.current.mountedBrowserTabIds.has('__browser__:1')).toBe(false);
    expect(result.current.mountedBrowserTabIds.has(`__browser__:${BROWSER_KEEPALIVE_CAP + 1}`)).toBe(true);
  });

  it('resets browserTabs on projectId change', () => {
    const browserTabs: BrowserWorkspaceTab[] = [{ id: '__browser__:1', label: 'Browser' }];
    const params = baseParams({
      tabsState: { tabs: ['cover.html'], active: '__browser__:1', browserTabs },
    });
    const { result, rerender } = renderHook((p: HarnessParams) => useHarness(p), { initialProps: params });
    expect(result.current.browserTabs).toEqual(browserTabs);

    rerender({ ...params, projectId: 'proj2' });
    expect(result.current.browserTabs).toEqual([]);
  });
});
