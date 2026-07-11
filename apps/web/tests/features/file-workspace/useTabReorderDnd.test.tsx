// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { DragEvent as ReactDragEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  useTabReorderDnd,
  type UseTabReorderDndParams,
} from '../../../src/features/file-workspace/hooks/useTabReorderDnd.hooks';
import type { OpenTabsState } from '../../../src/types';

function workspaceTabsState(tabs: string[], active: string | null): OpenTabsState {
  return { tabs, active };
}

function makeDragEvent(over: Partial<ReactDragEvent<HTMLDivElement>> = {}): ReactDragEvent<HTMLDivElement> {
  return {
    dataTransfer: { effectAllowed: '', dropEffect: '', setData: vi.fn() },
    preventDefault: vi.fn(),
    clientX: 0,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 100 }) },
    ...over,
  } as unknown as ReactDragEvent<HTMLDivElement>;
}

function baseParams(over: Partial<UseTabReorderDndParams> = {}): UseTabReorderDndParams {
  return {
    persistedTabs: ['a.md', 'b.md', 'c.md'],
    tabsStateActive: 'a.md',
    onTabsStateChange: vi.fn(),
    workspaceTabsState,
    ...over,
  };
}

describe('useTabReorderDnd', () => {
  it('starts with no dragged tab', () => {
    const { result } = renderHook(() => useTabReorderDnd(baseParams()));
    expect(result.current.draggedTabName).toBeNull();
    expect(result.current.dragOverTab).toBeNull();
  });

  it('handleTabDragStart records the dragged tab name', () => {
    const { result } = renderHook(() => useTabReorderDnd(baseParams()));
    act(() => result.current.handleTabDragStart('a.md', makeDragEvent()));
    expect(result.current.draggedTabName).toBe('a.md');
  });

  it('handleTabDragOver sets dragOverTab for a different persisted tab and calls preventDefault', () => {
    const { result } = renderHook(() => useTabReorderDnd(baseParams()));
    act(() => result.current.handleTabDragStart('a.md', makeDragEvent()));

    const event = makeDragEvent({ clientX: 60 });
    act(() => result.current.handleTabDragOver('b.md', event));

    expect(event.preventDefault).toHaveBeenCalled();
    expect(result.current.dragOverTab?.name).toBe('b.md');
  });

  it('handleTabDragOver is a no-op when hovering the dragged tab itself', () => {
    const { result } = renderHook(() => useTabReorderDnd(baseParams()));
    act(() => result.current.handleTabDragStart('a.md', makeDragEvent()));

    const event = makeDragEvent();
    act(() => result.current.handleTabDragOver('a.md', event));

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(result.current.dragOverTab).toBeNull();
  });

  it('handleTabDragLeave clears dragOverTab only for the matching tab', () => {
    const { result } = renderHook(() => useTabReorderDnd(baseParams()));
    act(() => result.current.handleTabDragStart('a.md', makeDragEvent()));
    act(() => result.current.handleTabDragOver('b.md', makeDragEvent({ clientX: 60 })));
    expect(result.current.dragOverTab?.name).toBe('b.md');

    act(() => result.current.handleTabDragLeave('c.md'));
    expect(result.current.dragOverTab?.name).toBe('b.md');

    act(() => result.current.handleTabDragLeave('b.md'));
    expect(result.current.dragOverTab).toBeNull();
  });

  it('handleTabDrop reorders persisted tabs via onTabsStateChange and clears drag state', () => {
    const onTabsStateChange = vi.fn();
    const { result } = renderHook(() => useTabReorderDnd(baseParams({ onTabsStateChange })));
    act(() => result.current.handleTabDragStart('c.md', makeDragEvent()));

    act(() => result.current.handleTabDrop('a.md', makeDragEvent({ clientX: 10 })));

    expect(onTabsStateChange).toHaveBeenCalledWith(workspaceTabsState(['c.md', 'a.md', 'b.md'], 'a.md'));
    expect(result.current.draggedTabName).toBeNull();
  });

  it('reorder is a no-op when the resulting order is unchanged', () => {
    const onTabsStateChange = vi.fn();
    const params = baseParams({ persistedTabs: ['a.md'], onTabsStateChange });
    const { result } = renderHook(() => useTabReorderDnd(params));
    act(() => result.current.handleTabDragStart('a.md', makeDragEvent()));
    act(() => result.current.handleTabDrop('a.md', makeDragEvent()));
    expect(onTabsStateChange).not.toHaveBeenCalled();
  });

  it('handleTabDragEnd clears all drag state', () => {
    const { result } = renderHook(() => useTabReorderDnd(baseParams()));
    act(() => result.current.handleTabDragStart('a.md', makeDragEvent()));
    act(() => result.current.handleTabDragOver('b.md', makeDragEvent({ clientX: 60 })));
    act(() => result.current.handleTabDragEnd());
    expect(result.current.draggedTabName).toBeNull();
    expect(result.current.dragOverTab).toBeNull();
  });

  it('handleTabBarDragLeave clears dragOverTab only when leaving the whole bar', () => {
    const { result } = renderHook(() => useTabReorderDnd(baseParams()));
    act(() => result.current.handleTabDragStart('a.md', makeDragEvent()));
    act(() => result.current.handleTabDragOver('b.md', makeDragEvent({ clientX: 60 })));

    const insideLeaveEvent = makeDragEvent({
      currentTarget: { contains: () => true } as unknown as ReactDragEvent<HTMLDivElement>['currentTarget'],
      relatedTarget: {} as unknown as EventTarget,
    });
    act(() => result.current.handleTabBarDragLeave(insideLeaveEvent));
    expect(result.current.dragOverTab?.name).toBe('b.md');

    const outsideLeaveEvent = makeDragEvent({
      currentTarget: { contains: () => false } as unknown as ReactDragEvent<HTMLDivElement>['currentTarget'],
      relatedTarget: {} as unknown as EventTarget,
    });
    act(() => result.current.handleTabBarDragLeave(outsideLeaveEvent));
    expect(result.current.dragOverTab).toBeNull();
  });

  it('handleTabBarDrop clears drag state only when the drop lands on the bar itself', () => {
    const { result } = renderHook(() => useTabReorderDnd(baseParams()));
    act(() => result.current.handleTabDragStart('a.md', makeDragEvent()));

    const target = {} as unknown as EventTarget;
    const bubbledDrop = makeDragEvent({
      target: {} as unknown as EventTarget,
      currentTarget: target as ReactDragEvent<HTMLDivElement>['currentTarget'],
    });
    act(() => result.current.handleTabBarDrop(bubbledDrop));
    expect(result.current.draggedTabName).toBe('a.md');

    const directDrop = makeDragEvent({ target, currentTarget: target as ReactDragEvent<HTMLDivElement>['currentTarget'] });
    act(() => result.current.handleTabBarDrop(directDrop));
    expect(result.current.draggedTabName).toBeNull();
  });
});
