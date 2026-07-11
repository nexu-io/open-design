// Pure logic for the file-workspace slice: tab-bar drag/order/scroll math,
// browser-tab id/state helpers, and small file-name predicates. No React, no
// transport, no DOM — these test with zero doubles. Moved out of
// `components/FileWorkspace.tsx` as part of the ADR-0002 vertical-slice
// decomposition.
import type { DragEvent as ReactDragEvent } from 'react';
import { isSketchJsonFileName } from '../../components/sketch-model';
import type { OpenTabsState } from '../../types';
import { BROWSER_TAB_PREFIX, DESIGN_FILES_TAB, DESIGN_SYSTEM_TAB } from './constants';
import type { BrowserWorkspaceTab, TabDropEdge, WorkspaceOrderedTab } from './types';

export function tabDropEdgeFromEvent(event: ReactDragEvent<HTMLDivElement>): TabDropEdge {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX > rect.left + rect.width / 2 ? 'after' : 'before';
}

export function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function scrollWorkspaceTabsWithWheel(
  tabBar: Pick<HTMLDivElement, 'clientWidth' | 'scrollLeft' | 'scrollWidth'>,
  event: Pick<globalThis.WheelEvent, 'ctrlKey' | 'deltaMode' | 'deltaX' | 'deltaY' | 'preventDefault'>,
) {
  if (event.ctrlKey) return;
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  if (tabBar.scrollWidth <= tabBar.clientWidth) return;

  const before = tabBar.scrollLeft;
  tabBar.scrollLeft += wheelDeltaToPixels(event.deltaY, event.deltaMode);
  if (tabBar.scrollLeft === before) return;

  event.preventDefault();
}

function wheelDeltaToPixels(delta: number, deltaMode: number): number {
  const WHEEL_DELTA_LINE = 1;
  const WHEEL_DELTA_PAGE = 2;

  if (deltaMode === WHEEL_DELTA_LINE) return delta * 16;
  if (deltaMode === WHEEL_DELTA_PAGE) return delta * 160;
  return delta;
}

export function kindIconName(
  kind?: string,
):
  | 'file-code'
  | 'globe'
  | 'image'
  | 'pencil'
  | 'file'
  | null {
  if (kind === 'browser') return 'globe';
  if (kind === 'live-artifact') return 'file-code';
  if (kind === 'html') return 'file-code';
  if (kind === 'image') return 'image';
  if (kind === 'sketch') return 'pencil';
  if (kind === 'code') return 'file-code';
  if (kind === 'text') return 'file';
  return 'file';
}

export function isBrowserTabId(tabId: string): boolean {
  return tabId.startsWith(BROWSER_TAB_PREFIX);
}

export function browserTabIndex(tabId: string): number {
  if (!isBrowserTabId(tabId)) return 0;
  const value = Number.parseInt(tabId.slice(BROWSER_TAB_PREFIX.length), 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function browserTabsFromState(value: OpenTabsState['browserTabs']): BrowserWorkspaceTab[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tabs: BrowserWorkspaceTab[] = [];
  for (const item of value) {
    if (!item || typeof item.id !== 'string' || seen.has(item.id)) continue;
    if (!item.id.startsWith(BROWSER_TAB_PREFIX)) continue;
    const label = item.label?.trim() || 'Browser';
    const tab: BrowserWorkspaceTab = {
      id: item.id,
      label,
    };
    if (item.insertAfter === null) tab.insertAfter = null;
    else if (typeof item.insertAfter === 'string') tab.insertAfter = item.insertAfter;
    if (item.title?.trim()) tab.title = item.title.trim();
    if (item.url?.trim()) tab.url = item.url.trim();
    if (item.iconUrl?.trim()) tab.iconUrl = item.iconUrl.trim();
    seen.add(item.id);
    tabs.push(tab);
  }
  return tabs;
}

export function maxBrowserTabSequence(tabs: BrowserWorkspaceTab[]): number {
  let max = 0;
  for (const tab of tabs) {
    const suffix = tab.id.slice(BROWSER_TAB_PREFIX.length);
    const value = Number.parseInt(suffix, 10);
    if (Number.isFinite(value)) max = Math.max(max, value);
  }
  return max;
}

export function lastWorkspaceTabId(tabs: WorkspaceOrderedTab[]): string | null {
  return tabs[tabs.length - 1]?.id ?? null;
}

export function reanchorBrowserTabsToCurrentOrder(
  orderedTabs: WorkspaceOrderedTab[],
  browserTabs: BrowserWorkspaceTab[],
): BrowserWorkspaceTab[] {
  if (browserTabs.length === 0) return browserTabs;
  const anchorByBrowserId = new Map<string, string | null>();
  let previousId: string | null = DESIGN_FILES_TAB;
  for (const entry of orderedTabs) {
    if (entry.kind === 'browser') {
      anchorByBrowserId.set(entry.browserTab.id, previousId);
      previousId = entry.browserTab.id;
    } else {
      previousId = entry.name;
    }
  }

  let changed = false;
  const nextTabs = browserTabs.map((tab) => {
    if (!anchorByBrowserId.has(tab.id)) return tab;
    const nextInsertAfter = anchorByBrowserId.get(tab.id) ?? null;
    const currentInsertAfter = tab.insertAfter ?? null;
    if (currentInsertAfter === nextInsertAfter) return tab;
    changed = true;
    return { ...tab, insertAfter: nextInsertAfter };
  });
  return changed ? nextTabs : browserTabs;
}

export function orderWorkspaceTabs(
  fileTabNames: string[],
  browserTabs: BrowserWorkspaceTab[],
): WorkspaceOrderedTab[] {
  const ordered: WorkspaceOrderedTab[] = fileTabNames.map((name) => ({
    id: name,
    kind: 'file',
    name,
  }));
  let rootAnchorInsertIndex = 0;

  for (const browserTab of browserTabs) {
    const entry: WorkspaceOrderedTab = {
      id: browserTab.id,
      kind: 'browser',
      browserTab,
    };
    const anchor = browserTab.insertAfter;
    if (!anchor || anchor === DESIGN_FILES_TAB || anchor === DESIGN_SYSTEM_TAB) {
      ordered.splice(rootAnchorInsertIndex, 0, entry);
      rootAnchorInsertIndex += 1;
      continue;
    }
    const anchorIndex = ordered.findIndex((candidate) => candidate.id === anchor);
    if (anchorIndex === -1) {
      ordered.push(entry);
      continue;
    }
    ordered.splice(anchorIndex + 1, 0, entry);
  }

  return ordered;
}

export function isSketchName(name: string): boolean {
  return isSketchJsonFileName(name);
}

export function parentDirForProjectFile(name: string): string {
  const normalized = name.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  return slash > 0 ? normalized.slice(0, slash) : '';
}

export function sameFileName(a: string, b: string): boolean {
  return a === b || a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

export function isLiveArtifactImplementationPath(name: string): boolean {
  if (name === '.live-artifacts') return true;
  if (!name.startsWith('.live-artifacts/')) return false;
  // Live artifacts are exposed through virtual tree nodes only. In
  // particular, keep implementation-only snapshot and tile files hidden even
  // if a generic project-files endpoint returns them in older daemon builds.
  return true;
}
