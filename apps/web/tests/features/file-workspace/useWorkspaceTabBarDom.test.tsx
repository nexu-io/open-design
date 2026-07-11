// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useWorkspaceTabBarDom } from '../../../src/features/file-workspace/hooks/useWorkspaceTabBarDom.hooks';
import type {
  WorkspaceTabBarDomParams,
} from '../../../src/features/file-workspace/hooks/useWorkspaceTabBarDom.hooks';
import type { WorkspaceTabBarDomPort } from '../../../src/features/file-workspace/ports';
import { DESIGN_FILES_TAB } from '../../../src/features/file-workspace/constants';

function makePort(over: Partial<WorkspaceTabBarDomPort> = {}): WorkspaceTabBarDomPort {
  return {
    subscribeWindowFileDropGuard: vi.fn(() => () => {}),
    subscribeTabBarWheelScroll: vi.fn(() => () => {}),
    scrollActiveTabIntoView: vi.fn(),
    subscribeTabBarOverflowMeasure: vi.fn(() => () => {}),
    ...over,
  };
}

function makeParams(
  over: Partial<WorkspaceTabBarDomParams> = {},
): WorkspaceTabBarDomParams {
  const tabsBarRef = createRef<HTMLDivElement>();
  Object.defineProperty(tabsBarRef, 'current', { value: document.createElement('div'), writable: true });
  return {
    tabsBarRef,
    activeTab: 'a.md',
    browserTabsCount: 0,
    designSystemProject: null,
    tabNamesCount: 1,
    ...over,
  };
}

describe('useWorkspaceTabBarDom', () => {
  it('subscribes the window file-drop guard once on mount', () => {
    const subscribeWindowFileDropGuard = vi.fn(() => () => {});
    const port = makePort({ subscribeWindowFileDropGuard });
    renderHook(() => useWorkspaceTabBarDom(port, makeParams()));
    expect(subscribeWindowFileDropGuard).toHaveBeenCalledTimes(1);
  });

  it('subscribes a wheel listener on the tab bar element', () => {
    const subscribeTabBarWheelScroll = vi.fn(() => () => {});
    const port = makePort({ subscribeTabBarWheelScroll });
    const params = makeParams();
    renderHook(() => useWorkspaceTabBarDom(port, params));
    expect(subscribeTabBarWheelScroll).toHaveBeenCalledWith(params.tabsBarRef.current, expect.any(Function));
  });

  it('scrolls the active tab into view when activeTab changes to a real workspace tab', () => {
    const scrollActiveTabIntoView = vi.fn();
    const port = makePort({ scrollActiveTabIntoView });
    const params = makeParams({ activeTab: DESIGN_FILES_TAB });
    const { rerender } = renderHook((p: WorkspaceTabBarDomParams) => useWorkspaceTabBarDom(port, p), {
      initialProps: params,
    });
    // DESIGN_FILES_TAB is excluded — no scroll on mount.
    expect(scrollActiveTabIntoView).not.toHaveBeenCalled();
    rerender({ ...params, activeTab: 'a.md' });
    expect(scrollActiveTabIntoView).toHaveBeenCalledWith(params.tabsBarRef.current);
  });

  it('subscribes the overflow measurement scheduler and reflects the measured state', () => {
    let onMeasure: (() => void) | undefined;
    const port = makePort({
      subscribeTabBarOverflowMeasure: vi.fn((_tabBar, cb) => {
        onMeasure = cb;
        return () => {};
      }),
    });
    const params = makeParams();
    const tabBar = params.tabsBarRef.current!;
    Object.defineProperty(tabBar, 'scrollWidth', { value: 500, configurable: true });
    Object.defineProperty(tabBar, 'clientWidth', { value: 200, configurable: true });
    const { result } = renderHook(() => useWorkspaceTabBarDom(port, params));
    expect(result.current.tabsOverflowing).toBe(false);
    act(() => onMeasure!());
    expect(result.current.tabsOverflowing).toBe(true);
  });

  it('re-subscribes overflow measurement when browserTabsCount/designSystemProject/tabNamesCount change', () => {
    const subscribeTabBarOverflowMeasure = vi.fn(() => () => {});
    const port = makePort({ subscribeTabBarOverflowMeasure });
    const params = makeParams({ browserTabsCount: 0 });
    const { rerender } = renderHook((p: WorkspaceTabBarDomParams) => useWorkspaceTabBarDom(port, p), {
      initialProps: params,
    });
    const initialCalls = subscribeTabBarOverflowMeasure.mock.calls.length;
    rerender({ ...params, browserTabsCount: 1 });
    expect(subscribeTabBarOverflowMeasure.mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it('sets --ds-system-tab-w from the design-system tab width when present', () => {
    let onMeasure: (() => void) | undefined;
    const port = makePort({
      subscribeTabBarOverflowMeasure: vi.fn((_tabBar, cb) => {
        onMeasure = cb;
        return () => {};
      }),
    });
    const params = makeParams();
    const tabBar = params.tabsBarRef.current!;
    const systemTab = document.createElement('div');
    systemTab.className = 'ws-tab design-system-tab';
    Object.defineProperty(systemTab, 'offsetWidth', { value: 100, configurable: true });
    tabBar.appendChild(systemTab);
    renderHook(() => useWorkspaceTabBarDom(port, params));
    act(() => onMeasure!());
    expect(tabBar.style.getPropertyValue('--ds-system-tab-w')).toBe('102px');
  });
});
