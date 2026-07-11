// Feature-local hook for the file-workspace tab-list/workspace-context
// derivation cluster: the ordered tab list (files + embedded browser tabs),
// the synthetic tab-id list used for keyboard navigation, and the
// `WorkspaceContextItem` chips the composer reads for the active tab and the
// full open-tab set. Pure derivation only — no transport, so this hook takes
// no port; it just fires the two `onActiveContextChange` /
// `onWorkspaceContextsChange` callbacks the orchestrator forwards to its
// parent.
import { useEffect, useMemo } from 'react';
import type { WorkspaceContextItem } from '@open-design/contracts';
import type {
  Conversation,
  DesignSystemSummary,
  LiveArtifactWorkspaceEntry,
  ProjectFile,
} from '../../../types';
import {
  computeActiveWorkspaceContext,
  computeWorkspaceContexts,
  computeWorkspaceTabIds,
  computeWorkspaceTabNames,
  orderWorkspaceTabs,
} from '../rules';
import type { BrowserWorkspaceTab, SketchState, TranslateFn, WorkspaceOrderedTab } from '../types';

export interface WorkspaceContextTrackingParams {
  persistedTabs: string[];
  sketches: Record<string, SketchState>;
  browserTabs: BrowserWorkspaceTab[];
  designSystemProject: DesignSystemSummary | null;
  showQuestionsTab: boolean;
  activeTab: string;
  designFilesTabIsEmpty: boolean;
  uploadDir: string;
  resolvedDir?: string | null;
  t: TranslateFn;
  conversations: Conversation[];
  activeFile: ProjectFile | null;
  activeLiveArtifact: LiveArtifactWorkspaceEntry | null;
  visibleFiles: ProjectFile[];
  liveArtifactEntries: LiveArtifactWorkspaceEntry[];
  onActiveContextChange?: (context: WorkspaceContextItem | null) => void;
  onWorkspaceContextsChange?: (contexts: WorkspaceContextItem[]) => void;
}

export interface WorkspaceContextTrackingController {
  tabNames: string[];
  orderedWorkspaceTabs: WorkspaceOrderedTab[];
  workspaceTabIds: string[];
  activeWorkspaceContext: WorkspaceContextItem | null;
  workspaceContexts: WorkspaceContextItem[];
}

export function useWorkspaceContextTracking(
  params: WorkspaceContextTrackingParams,
): WorkspaceContextTrackingController {
  const {
    persistedTabs,
    sketches,
    browserTabs,
    designSystemProject,
    showQuestionsTab,
    activeTab,
    designFilesTabIsEmpty,
    uploadDir,
    resolvedDir,
    t,
    conversations,
    activeFile,
    activeLiveArtifact,
    visibleFiles,
    liveArtifactEntries,
    onActiveContextChange,
    onWorkspaceContextsChange,
  } = params;

  const tabNames = useMemo(
    () => computeWorkspaceTabNames(persistedTabs, sketches),
    [persistedTabs, sketches],
  );

  const orderedWorkspaceTabs = useMemo(
    () => orderWorkspaceTabs(tabNames, browserTabs),
    [browserTabs, tabNames],
  );

  const workspaceTabIds = useMemo(
    () => computeWorkspaceTabIds(designSystemProject, orderedWorkspaceTabs, showQuestionsTab),
    [designSystemProject, orderedWorkspaceTabs, showQuestionsTab],
  );

  const activeWorkspaceContext = useMemo(
    () => computeActiveWorkspaceContext({
      activeTab,
      designSystemProject,
      designFilesTabIsEmpty,
      uploadDir,
      resolvedDir,
      t,
      browserTabs,
      conversations,
      activeLiveArtifact,
      activeFile,
    }),
    [
      activeFile,
      activeLiveArtifact,
      activeTab,
      browserTabs,
      conversations,
      designFilesTabIsEmpty,
      designSystemProject,
      resolvedDir,
      t,
      uploadDir,
    ],
  );

  const workspaceContexts = useMemo(
    () => computeWorkspaceContexts({
      designSystemProject,
      uploadDir,
      resolvedDir,
      t,
      visibleFiles,
      liveArtifactEntries,
      tabNames,
      orderedWorkspaceTabs,
      conversations,
      sketches,
    }),
    [
      conversations,
      designSystemProject,
      liveArtifactEntries,
      orderedWorkspaceTabs,
      resolvedDir,
      sketches,
      t,
      tabNames,
      uploadDir,
      visibleFiles,
    ],
  );

  useEffect(() => {
    onActiveContextChange?.(activeWorkspaceContext);
  }, [activeWorkspaceContext, onActiveContextChange]);

  useEffect(() => {
    onWorkspaceContextsChange?.(workspaceContexts);
  }, [onWorkspaceContextsChange, workspaceContexts]);

  return { tabNames, orderedWorkspaceTabs, workspaceTabIds, activeWorkspaceContext, workspaceContexts };
}
