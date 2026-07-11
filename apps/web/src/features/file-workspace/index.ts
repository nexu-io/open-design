// Public barrel for the file-workspace slice (ADR-0002 vertical-slice
// decomposition of `components/FileWorkspace.tsx`). This is the ONLY import
// path other slices and the orchestrator may use — deep imports into
// `features/file-workspace/**` are rejected by `scripts/check-web-slice-boundaries.ts`.
export { Tab } from './components/Tab';
export {
  arraysEqual,
  browserTabIndex,
  browserTabsFromState,
  isBrowserTabId,
  isLiveArtifactImplementationPath,
  isSketchName,
  lastWorkspaceTabId,
  maxBrowserTabSequence,
  orderWorkspaceTabs,
  parentDirForProjectFile,
  reanchorBrowserTabsToCurrentOrder,
  sameFileName,
  scrollWorkspaceTabsWithWheel,
  tabDropEdgeFromEvent,
} from './rules';
export { BROWSER_TAB_PREFIX, DESIGN_FILES_TAB, DESIGN_SYSTEM_TAB } from './constants';
export type { BrowserWorkspaceTab, TabDropEdge, WorkspaceOrderedTab } from './types';
