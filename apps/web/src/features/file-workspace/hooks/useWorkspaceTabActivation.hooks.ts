// Feature-local hook for the file-workspace tab-activation cluster (cluster
// 3's remaining "tab-state-primitive" half in EXTRACTION-PLAN.md): the
// primitives that OPEN/FOCUS/ACTIVATE/CLOSE a workspace tab and commit the
// result back to the parent-owned `tabsState`. `activeTab`/`setActiveTab`
// and the `tabsStateRef` prop-sync stay inline in the orchestrator (not
// here) — they are read by `useWiredSketches`/`useWiredFileOperations`/
// `useBrowserTabs`, all called BEFORE this hook, so they must exist before
// this hook's call site. See EXTRACTION-PLAN.md cluster 3 for the full
// hook-ordering write-up.
//
// This hook itself must be called AFTER `useBrowserTabs` and
// `useWorkspaceContextTracking` (it takes `browserTabs`/`closeBrowserTab`/
// `orderedWorkspaceTabs`/`workspaceTabIds`/`sketches` as plain-value params,
// not refs). The three earlier hooks that need this cluster's `openFile`/
// `commitTabsState`/`workspaceTabsState`/`setPersistedActive` before they
// exist go through the orchestrator's `openFileRef`-style stable-wrapper
// refs instead of calling this hook directly — see FileWorkspace.tsx.
import { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { DesignSystemSummary, OpenTabsState } from '../../../types';
import { isTerminalTabId, terminalIdFromTabId } from '../../../types';
import { killTerminal } from '../../../state/projects';
import { isBrowserTabId, reanchorBrowserTabsToCurrentOrder } from '../rules';
import { DESIGN_FILES_TAB, DESIGN_SYSTEM_TAB, QUESTIONS_TAB } from '../constants';
import type { BrowserWorkspaceTab, SketchState, TranslateFn, WorkspaceOrderedTab } from '../types';

export interface UseWorkspaceTabActivationParams {
  projectId: string;
  t: TranslateFn;
  tabsState: OpenTabsState;
  tabsStateRef: MutableRefObject<OpenTabsState>;
  defaultRootTab: string;
  persistedTabs: string[];
  activeTab: string;
  setActiveTab: (name: string) => void;
  onTabsStateChange: (next: OpenTabsState) => void;
  setUploadError: (message: string | null) => void;
  browserTabs: BrowserWorkspaceTab[];
  setBrowserTabs: (next: BrowserWorkspaceTab[]) => void;
  closeBrowserTab: (tabId: string) => void;
  orderedWorkspaceTabs: WorkspaceOrderedTab[];
  workspaceTabIds: string[];
  sketches: Record<string, SketchState>;
  discardPendingSketchEntry: (name: string) => void;
  pruneClosedSketchEntry: (name: string) => void;
  designSystemProject?: DesignSystemSummary | null;
}

export interface WorkspaceTabActivationController {
  workspaceTabsState: (
    tabs: string[],
    active: string | null,
    nextBrowserTabs?: BrowserWorkspaceTab[],
  ) => OpenTabsState;
  commitTabsState: (next: OpenTabsState) => void;
  setPersistedActive: (name: string | null) => void;
  activatePending: (name: string) => void;
  openFile: (name: string) => void;
  focusWorkspaceTab: (tabId: string) => void;
  activateWorkspaceTab: (tabId: string) => void;
  activateWorkspaceTabByOffset: (offset: number) => void;
  activateWorkspaceTabByIndex: (index: number) => void;
  closeActiveWorkspaceTab: () => void;
  openFileReplacing: (openName: string, closeName: string) => void;
  closeTab: (name: string) => void;
  handleTerminalSessionChange: (originalId: string, sessionId: string) => void;
}

export function useWorkspaceTabActivation(
  params: UseWorkspaceTabActivationParams,
): WorkspaceTabActivationController {
  const {
    projectId,
    t,
    tabsState,
    tabsStateRef,
    defaultRootTab,
    persistedTabs,
    activeTab,
    setActiveTab,
    onTabsStateChange,
    setUploadError,
    browserTabs,
    setBrowserTabs,
    closeBrowserTab,
    orderedWorkspaceTabs,
    workspaceTabIds,
    sketches,
    discardPendingSketchEntry,
    pruneClosedSketchEntry,
    designSystemProject,
  } = params;

  // Maps a terminal tab's original session id (the `terminal:<id>` suffix) to
  // the PTY session it is CURRENTLY bound to. Restart rebinds the surface to a
  // fresh session while the tab id stays constant, and the surface is unmounted
  // whenever its tab isn't active — so this ref (which survives the child's
  // unmount) is the only place that knows which PTY to kill on an explicit
  // Close. `<TerminalViewer onSessionIdChange>` keeps it current.
  const terminalLiveSessionsRef = useRef<Map<string, string>>(new Map());
  const handleTerminalSessionChange = useCallback(
    (originalId: string, sessionId: string) => {
      terminalLiveSessionsRef.current.set(originalId, sessionId);
    },
    [],
  );

  // These are mutually referential (focusWorkspaceTab -> openFile,
  // activateWorkspaceTab -> activatePending/focusWorkspaceTab,
  // activateWorkspaceTabByOffset/ByIndex -> activateWorkspaceTab,
  // closeActiveWorkspaceTab -> closeTab) so they stay plain function
  // declarations (hoisted, redefined fresh every render) instead of
  // useCallback — matching the pre-extraction orchestrator's shape and
  // `useSketches.hooks.ts`'s identical precedent for the same reason.
  function workspaceTabsState(
    tabs: string[],
    active: string | null,
    nextBrowserTabs = browserTabs,
  ): OpenTabsState {
    const state: OpenTabsState = { tabs, active };
    if (nextBrowserTabs.length > 0) state.browserTabs = nextBrowserTabs;
    return state;
  }

  // Single entry point for committing tab state: mirror it into the ref so
  // async launcher actions read the freshest tabs, then notify the parent.
  function commitTabsState(next: OpenTabsState) {
    tabsStateRef.current = next;
    onTabsStateChange(next);
  }

  function setPersistedActive(name: string | null) {
    const nextActive = name ?? defaultRootTab;
    setActiveTab(nextActive);
    commitTabsState(workspaceTabsState(persistedTabs, name));
  }

  function activatePending(name: string) {
    // Pending sketches are not in tabsState.tabs — flip the local
    // activeTab without round-tripping through the parent.
    setActiveTab(name);
  }

  function openFile(name: string) {
    setUploadError(null);
    // Read from the ref, not the `persistedTabs` prop closure: this path is
    // reached asynchronously from launcher "create" actions (after the daemon
    // resolves a new terminal/side-chat id), so the closure could be stale and
    // clobber tabs added in the meantime.
    const currentTabs = tabsStateRef.current.tabs;
    const isNewTab = !currentTabs.includes(name);
    const nextBrowserTabs = isNewTab
      ? reanchorBrowserTabsToCurrentOrder(orderedWorkspaceTabs, browserTabs)
      : browserTabs;
    const nextTabs = currentTabs.includes(name) ? currentTabs : [...currentTabs, name];
    if (nextBrowserTabs !== browserTabs) setBrowserTabs(nextBrowserTabs);
    commitTabsState(workspaceTabsState(nextTabs, name, nextBrowserTabs));
    setActiveTab(name);
  }

  function focusWorkspaceTab(tabId: string) {
    setUploadError(null);
    if (tabId === DESIGN_SYSTEM_TAB) {
      setPersistedActive(designSystemProject ? DESIGN_SYSTEM_TAB : DESIGN_FILES_TAB);
      return;
    }
    if (tabId === DESIGN_FILES_TAB) {
      setPersistedActive(DESIGN_FILES_TAB);
      return;
    }
    if (isBrowserTabId(tabId)) {
      if (!browserTabs.some((tab) => tab.id === tabId)) return;
      commitTabsState(workspaceTabsState(persistedTabs, tabId, browserTabs));
      setActiveTab(tabId);
      return;
    }
    openFile(tabId);
  }

  function activateWorkspaceTab(tabId: string) {
    if (tabId === QUESTIONS_TAB) {
      setUploadError(null);
      setActiveTab(tabId);
      return;
    }
    const sketchEntry = sketches[tabId];
    if (sketchEntry && !sketchEntry.persisted) {
      setUploadError(null);
      activatePending(tabId);
      return;
    }
    focusWorkspaceTab(tabId);
  }

  function activateWorkspaceTabByOffset(offset: number) {
    if (workspaceTabIds.length === 0) return;
    const activeIndex = workspaceTabIds.indexOf(activeTab);
    const startIndex = activeIndex >= 0 ? activeIndex : 0;
    const targetIndex =
      (startIndex + offset + workspaceTabIds.length) % workspaceTabIds.length;
    activateWorkspaceTab(workspaceTabIds[targetIndex]!);
  }

  function activateWorkspaceTabByIndex(index: number) {
    if (index < 0 || index >= workspaceTabIds.length) return;
    activateWorkspaceTab(workspaceTabIds[index]!);
  }

  function closeActiveWorkspaceTab() {
    if (!workspaceTabIds.includes(activeTab)) return;
    if (activeTab === DESIGN_FILES_TAB || activeTab === DESIGN_SYSTEM_TAB) return;
    if (activeTab === QUESTIONS_TAB) {
      setActiveTab(defaultRootTab);
      return;
    }
    if (isBrowserTabId(activeTab)) {
      closeBrowserTab(activeTab);
      return;
    }
    closeTab(activeTab);
  }

  // Open `openName` (focusing it) and close `closeName` in a single tab-state
  // update. Used by the React module pointer (issue #2744): once the user
  // jumps to the HTML entry that renders a module, the dead-end module tab is
  // dropped. Done atomically because calling openFile() then closeTab() would
  // each read the same stale `persistedTabs` prop and the second would clobber
  // the first.
  function openFileReplacing(openName: string, closeName: string) {
    setUploadError(null);
    const withoutClosed = persistedTabs.filter((tabName) => tabName !== closeName);
    const nextTabs = withoutClosed.includes(openName)
      ? withoutClosed
      : [...withoutClosed, openName];
    onTabsStateChange(workspaceTabsState(nextTabs, openName));
    setActiveTab(openName);
  }

  function closeTab(name: string) {
    // Terminal tabs own a daemon PTY that now outlives unmount (so tab switches
    // reattach cheaply). An explicit Close is the one place we terminate it —
    // kill the LIVE session (which may differ from the tab's original id after
    // a Restart), falling back to the tab id when the surface never reported.
    if (isTerminalTabId(name)) {
      const originalId = terminalIdFromTabId(name);
      const liveId = terminalLiveSessionsRef.current.get(originalId) ?? originalId;
      void killTerminal(projectId, liveId, { keepalive: true });
      terminalLiveSessionsRef.current.delete(originalId);
    }
    const sketchEntry = sketches[name];
    const isPending = sketchEntry && !sketchEntry.persisted;
    const hasUnsavedStrokes = sketchEntry && (sketchEntry.dirty || !sketchEntry.persisted);
    if (hasUnsavedStrokes && !confirm(t('sketch.closeConfirm'))) return;
    if (isPending) {
      discardPendingSketchEntry(name);
      if (activeTab === name) {
        setPersistedActive(persistedTabs[persistedTabs.length - 1] ?? null);
      }
      return;
    }
    const nextTabs = persistedTabs.filter((n) => n !== name);
    const nextActive =
      tabsState.active === name
        ? nextTabs[nextTabs.length - 1] ?? null
        : tabsState.active;
    onTabsStateChange(workspaceTabsState(nextTabs, nextActive));
    setActiveTab(nextActive ?? DESIGN_FILES_TAB);
    pruneClosedSketchEntry(name);
  }

  return {
    workspaceTabsState,
    commitTabsState,
    setPersistedActive,
    activatePending,
    openFile,
    focusWorkspaceTab,
    activateWorkspaceTab,
    activateWorkspaceTabByOffset,
    activateWorkspaceTabByIndex,
    closeActiveWorkspaceTab,
    openFileReplacing,
    closeTab,
    handleTerminalSessionChange,
  };
}
