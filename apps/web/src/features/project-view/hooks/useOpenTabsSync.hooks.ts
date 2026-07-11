// Feature-local hook for the open-tabs cluster: the persisted set of open
// file/artifact tabs (local cache + debounced daemon PUT), the workspace-
// context state FileWorkspace threads through comments/tools, the header's
// artifact-tracking derivation, the initial "open the primary file" effect,
// and the URL <-> active-tab/conversation sync effect.
//
// `projectFiles`/`projectFileNames` (Cluster 9, not yet extracted) and
// `activeConversationId` (Cluster 4) are cross-cutting state this cluster
// only READS — they stay orchestrator-owned and are taken as params, per the
// vertical-slice pattern's "one owning cluster" rule. `lastSyncedConversationIdRef`
// is this cluster's own write target, but stays declared in the orchestrator
// and is taken as a param too: `useConversationMessages` (Cluster 4, already
// landed) reads it and is wired up earlier in the render than this hook, so
// keeping the ref's declaration where it already is avoids reordering an
// already-stable call site.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { TrackingArtifactKind } from '@open-design/contracts/analytics';
import { anonymizeArtifactId, artifactKindToTracking } from '@open-design/contracts/analytics';
import type { WorkspaceContextItem } from '@open-design/contracts';
import { isLiveArtifactTabId, type OpenTabsState, type ProjectFile } from '../../../types';
import { navigate } from '../../../router';
import { TAB_PERSIST_DEBOUNCE_MS } from '../constants';
import { selectPrimaryProjectFile, workspaceContextItemEqual, workspaceContextItemsEqual } from '../rules';
import { projectViewTransportPort } from '../dependencies';
import type { ProjectViewTransportPort } from '../ports';

export interface OpenTabsSyncController {
  openTabsState: OpenTabsState;
  headerArtifact: { artifact_id?: string; artifact_kind?: TrackingArtifactKind };
  activeWorkspaceContext: WorkspaceContextItem | null;
  workspaceContexts: WorkspaceContextItem[];
  handleActiveWorkspaceContextChange: (next: WorkspaceContextItem | null) => void;
  handleWorkspaceContextsChange: (next: WorkspaceContextItem[]) => void;
  persistTabsState: (next: OpenTabsState) => void;
  tabsLoadedRef: MutableRefObject<boolean>;
  tabsHydratedFromSavedStateRef: MutableRefObject<boolean>;
  tabsHydrationVersion: number;
}

export function useOpenTabsSync(
  port: ProjectViewTransportPort,
  projectId: string,
  routeFileName: string | null,
  projectFiles: ProjectFile[],
  projectFileNames: Set<string>,
  activeConversationId: string | null,
  lastSyncedConversationIdRef: MutableRefObject<string | null>,
): OpenTabsSyncController {
  // The persisted set of open tabs + active tab. Persisted via PUT on every
  // change; loaded once when the project mounts.
  const [openTabsState, setOpenTabsState] = useState<OpenTabsState>({
    tabs: [],
    active: null,
  });
  const routeFileNameRef = useRef(routeFileName);
  routeFileNameRef.current = routeFileName;
  const [activeWorkspaceContext, setActiveWorkspaceContext] =
    useState<WorkspaceContextItem | null>(null);
  const [workspaceContexts, setWorkspaceContexts] = useState<WorkspaceContextItem[]>([]);
  const tabsLoadedRef = useRef(false);
  const tabsHydratedFromSavedStateRef = useRef(false);
  const [tabsHydrationVersion, setTabsHydrationVersion] = useState(0);
  const hasAppliedInitialPrimaryOpenRef = useRef(false);

  // Artifact context for the header actions (settings gear, handoff) that live
  // in this workspace's header alongside FileViewer's present/share/download.
  // Mirrors the artifact_id / artifact_kind that FileViewer attaches, derived
  // from the currently-active file tab, so all artifact_header analytics carry
  // the same dimensions. Undefined on non-file tabs (e.g. the file list).
  const headerArtifact = useMemo<{
    artifact_id?: string;
    artifact_kind?: TrackingArtifactKind;
  }>(() => {
    const activeName = openTabsState.active;
    const file = activeName
      ? projectFiles.find((entry) => entry.name === activeName) ?? null
      : null;
    if (!file) return {};
    return {
      artifact_id: anonymizeArtifactId({ projectId, fileName: file.name }),
      artifact_kind: artifactKindToTracking({ fileKind: file.kind ?? null }),
    };
  }, [openTabsState.active, projectFiles, projectId]);

  // Hydrate the open-tabs state once per project. After this initial
  // load, every mutation flows through persistTabsState() which keeps DB +
  // local state coherent.
  useEffect(() => {
    let cancelled = false;
    tabsLoadedRef.current = false;
    tabsHydratedFromSavedStateRef.current = false;
    hasAppliedInitialPrimaryOpenRef.current = false;
    setOpenTabsState({ tabs: [], active: null });
    (async () => {
      const state = await port.loadOpenTabs(projectId);
      if (cancelled) return;
      const routeActive = routeFileNameRef.current;
      let nextState = routeActive
        ? {
            ...state,
            tabs: state.tabs.includes(routeActive)
              ? state.tabs
              : [...state.tabs, routeActive],
            active: routeActive,
          }
        : state;
      if (routeActive) {
        nextState = port.cacheOpenTabsLocally(projectId, nextState);
        void port.persistOpenTabsToDaemon(projectId, nextState);
      }
      tabsHydratedFromSavedStateRef.current = state.hasSavedState === true;
      setOpenTabsState(nextState);
      tabsLoadedRef.current = true;
      setTabsHydrationVersion((version) => version + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [port, projectId]);

  // Debounce the canonical (daemon + SQLite) tab-state write. The embedded
  // browser fans out url/title/favicon updates in bursts on a single page load
  // (did-navigate, did-navigate-in-page, page-title-updated, favicon), and each
  // used to be a localStorage write + HTTP PUT + SQLite UPDATE + re-render.
  // We keep React state and the local cache IMMEDIATE (so the UI and a reload
  // are never stale) and coalesce only the daemon PUT.
  const tabsDaemonSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDaemonTabsRef = useRef<OpenTabsState | null>(null);
  const flushTabsDaemonSave = useCallback(() => {
    if (tabsDaemonSaveTimerRef.current != null) {
      clearTimeout(tabsDaemonSaveTimerRef.current);
      tabsDaemonSaveTimerRef.current = null;
    }
    const pending = pendingDaemonTabsRef.current;
    pendingDaemonTabsRef.current = null;
    if (pending) void port.persistOpenTabsToDaemon(projectId, pending);
  }, [port, projectId]);

  const persistTabsState = useCallback(
    (next: OpenTabsState) => {
      setOpenTabsState(next);
      if (!tabsLoadedRef.current) return;
      // Immediate, cheap, synchronous — keeps the cache canonical for reload.
      const stamped = port.cacheOpenTabsLocally(projectId, next);
      pendingDaemonTabsRef.current = stamped;
      if (tabsDaemonSaveTimerRef.current != null) {
        clearTimeout(tabsDaemonSaveTimerRef.current);
      }
      tabsDaemonSaveTimerRef.current = setTimeout(() => {
        tabsDaemonSaveTimerRef.current = null;
        const pending = pendingDaemonTabsRef.current;
        pendingDaemonTabsRef.current = null;
        if (pending) void port.persistOpenTabsToDaemon(projectId, pending);
      }, TAB_PERSIST_DEBOUNCE_MS);
    },
    [port, projectId],
  );

  // Flush any pending tab write when the project changes or the view unmounts,
  // so a fast project switch / close doesn't leave the daemon a debounce behind.
  useEffect(() => flushTabsDaemonSave, [flushTabsDaemonSave]);

  const handleActiveWorkspaceContextChange = useCallback((next: WorkspaceContextItem | null) => {
    setActiveWorkspaceContext((current) =>
      workspaceContextItemEqual(current, next) ? current : next,
    );
  }, []);

  const handleWorkspaceContextsChange = useCallback((next: WorkspaceContextItem[]) => {
    setWorkspaceContexts((current) =>
      workspaceContextItemsEqual(current, next) ? current : next,
    );
  }, []);

  useEffect(() => {
    if (!tabsLoadedRef.current) return;
    if (hasAppliedInitialPrimaryOpenRef.current) return;
    if (routeFileName) return;
    if (openTabsState.active || openTabsState.tabs.length > 0) {
      hasAppliedInitialPrimaryOpenRef.current = true;
      return;
    }
    if (tabsHydratedFromSavedStateRef.current) {
      hasAppliedInitialPrimaryOpenRef.current = true;
      return;
    }
    const primaryFile = selectPrimaryProjectFile(projectFiles);
    if (!primaryFile) return;
    hasAppliedInitialPrimaryOpenRef.current = true;
    persistTabsState({ tabs: [primaryFile.name], active: primaryFile.name });
  }, [openTabsState.active, openTabsState.tabs.length, persistTabsState, projectFiles, routeFileName]);

  // Sync the URL when the active tab changes, so reload + share-link both
  // land back on the same view. Replace (not push) on tab activation so the
  // history stack doesn't fill with every tab click.
  // Composite sync key: tracks BOTH the active file target AND the active
  // conversation id, so a conversation-only change (e.g. `listConversations`
  // resolves after `loadOpenTabs` hydrated the active tab, or the user picks a
  // different conversation under the same tab) still triggers the navigate
  // and pushes `/conversations/:cid` into the URL. Keying only on the file
  // target lost that update because the early-return saw `target` unchanged
  // and skipped the navigate (lefarcen P1 on PR #1508).
  const lastSyncedRouteKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const target = openTabsState.active && (
      openTabsState.tabs.includes(openTabsState.active)
      || projectFileNames.has(openTabsState.active)
      || isLiveArtifactTabId(openTabsState.active)
    )
      ? openTabsState.active
      : null;
    const nextKey = `${activeConversationId ?? ''}:${target ?? ''}`;
    if (nextKey === lastSyncedRouteKeyRef.current) return;
    lastSyncedRouteKeyRef.current = nextKey;
    lastSyncedConversationIdRef.current = activeConversationId;
    // PerishCode + Codex P1 on PR #1508: the prior version of this
    // sync stripped any `/conversations/:cid` segment from the URL as
    // soon as a tab became active, which regressed the deep-link
    // behavior the parent commit was meant to add (reload / share
    // would fall back to `list[0]` instead of the routed run's
    // conversation). Thread the active conversation id so the URL
    // always reflects the conversation the project view is actually
    // showing, matching how `fileName` already tracks the active tab.
    navigate(
      {
        kind: 'project',
        projectId,
        conversationId: activeConversationId,
        fileName: target,
      },
      { replace: true },
    );
  }, [openTabsState.active, projectFileNames, projectId, activeConversationId]);

  return {
    openTabsState,
    headerArtifact,
    activeWorkspaceContext,
    workspaceContexts,
    handleActiveWorkspaceContextChange,
    handleWorkspaceContextsChange,
    persistTabsState,
    tabsLoadedRef,
    tabsHydratedFromSavedStateRef,
    tabsHydrationVersion,
  };
}

/** Wirer: binds the real project-view transport port; swap in tests. */
export function useWiredOpenTabsSync(
  projectId: string,
  routeFileName: string | null,
  projectFiles: ProjectFile[],
  projectFileNames: Set<string>,
  activeConversationId: string | null,
  lastSyncedConversationIdRef: MutableRefObject<string | null>,
): OpenTabsSyncController {
  return useOpenTabsSync(
    projectViewTransportPort,
    projectId,
    routeFileName,
    projectFiles,
    projectFileNames,
    activeConversationId,
    lastSyncedConversationIdRef,
  );
}
