// Feature-local hook for the file-workspace tab-bar drag-reorder cluster:
// dragging a persisted tab to reorder the open-tabs list. Pure state/dispatch
// only — no transport/DOM beyond the native HTML5 drag events React already
// hands the JSX, so this hook takes no port.
import { useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import type { OpenTabsState } from '../../../types';
import { arraysEqual, tabDropEdgeFromEvent } from '../rules';
import type { TabDropEdge } from '../types';

export interface UseTabReorderDndParams {
  persistedTabs: string[];
  tabsStateActive: string | null;
  onTabsStateChange: (next: OpenTabsState) => void;
  workspaceTabsState: (tabs: string[], active: string | null) => OpenTabsState;
}

export interface TabReorderDndController {
  draggedTabName: string | null;
  dragOverTab: { name: string; edge: TabDropEdge } | null;
  handleTabDragStart: (name: string, event: ReactDragEvent<HTMLDivElement>) => void;
  handleTabDragOver: (name: string, event: ReactDragEvent<HTMLDivElement>) => void;
  handleTabDragLeave: (name: string) => void;
  handleTabDrop: (name: string, event: ReactDragEvent<HTMLDivElement>) => void;
  handleTabDragEnd: () => void;
  handleTabBarDragLeave: (event: ReactDragEvent<HTMLDivElement>) => void;
  handleTabBarDrop: (event: ReactDragEvent<HTMLDivElement>) => void;
}

export function useTabReorderDnd(params: UseTabReorderDndParams): TabReorderDndController {
  const { persistedTabs, tabsStateActive, onTabsStateChange, workspaceTabsState } = params;

  const [draggedTabName, setDraggedTabName] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<{
    name: string;
    edge: TabDropEdge;
  } | null>(null);
  const draggedTabNameRef = useRef<string | null>(null);

  function reorderPersistedTab(
    draggedName: string,
    targetName: string,
    edge: TabDropEdge,
  ) {
    if (draggedName === targetName) return;
    if (!persistedTabs.includes(draggedName)) return;
    if (!persistedTabs.includes(targetName)) return;

    const nextTabs = persistedTabs.filter((name) => name !== draggedName);
    const targetIndex = nextTabs.indexOf(targetName);
    if (targetIndex === -1) return;
    nextTabs.splice(edge === 'after' ? targetIndex + 1 : targetIndex, 0, draggedName);
    if (arraysEqual(nextTabs, persistedTabs)) return;
    onTabsStateChange(workspaceTabsState(nextTabs, tabsStateActive));
  }

  function handleTabDragEnd() {
    draggedTabNameRef.current = null;
    setDraggedTabName(null);
    setDragOverTab(null);
  }

  function handleTabDragStart(name: string, event: ReactDragEvent<HTMLDivElement>) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', name);
    draggedTabNameRef.current = name;
    setDraggedTabName(name);
  }

  function handleTabDragOver(name: string, event: ReactDragEvent<HTMLDivElement>) {
    const currentDraggedName = draggedTabNameRef.current ?? draggedTabName;
    if (!currentDraggedName || currentDraggedName === name) return;
    if (!persistedTabs.includes(currentDraggedName)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const edge = tabDropEdgeFromEvent(event);
    setDragOverTab((current) =>
      current?.name === name && current.edge === edge
        ? current
        : { name, edge },
    );
  }

  function handleTabDragLeave(name: string) {
    setDragOverTab((current) => (current?.name === name ? null : current));
  }

  function handleTabDrop(name: string, event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
    const draggedName = draggedTabNameRef.current || draggedTabName;
    if (draggedName) {
      reorderPersistedTab(draggedName, name, tabDropEdgeFromEvent(event));
    }
    handleTabDragEnd();
  }

  function handleTabBarDragLeave(event: ReactDragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragOverTab(null);
  }

  function handleTabBarDrop(event: ReactDragEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    handleTabDragEnd();
  }

  return {
    draggedTabName,
    dragOverTab,
    handleTabDragStart,
    handleTabDragOver,
    handleTabDragLeave,
    handleTabDrop,
    handleTabDragEnd,
    handleTabBarDragLeave,
    handleTabBarDrop,
  };
}
