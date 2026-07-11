// Feature-local hook for the live-project-events cluster: a thin wrapper
// around the project's file-change SSE stream (bound through the port's
// `subscribeProjectFileEvents` bridge, replacing the direct
// `providers/project-events` React-hook import a feature file may not use
// under the slice-boundary guard). Owns `refreshFilesAndDesignMd` (the
// coalesced file-list + DESIGN.md-staleness refresh) and `handleProjectEvent`
// (the SSE event dispatcher for file-changed / conversation-created /
// live-artifact events).
//
// `iframeKeepAlivePool` (a component-level hook value, not a `providers/`
// adapter), `conversationsRefreshTokenRef`/`projectIdRef` (cross-cutting refs
// shared with other not-yet-extracted clusters), `setConversations`,
// `onProjectsRefresh`, `refreshLiveArtifacts` (Cluster 9), and
// `setLiveArtifactEvents`/`setFilesRefresh`/`setDesignMdRefreshKey`
// (cross-cutting setters) are taken as params rather than owned here.
import { useCallback, useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Conversation, LiveArtifactEventItem, LiveArtifactSummary } from '../../../types';
import { useCoalescedCallback } from '../../../hooks/useCoalescedCallback';
import type { useIframeKeepAlivePool } from '../../../components/IframeKeepAlivePool';
import { appendLiveArtifactEventItem, projectEventToAgentEvent } from '../rules';
import { projectViewTransportPort } from '../dependencies';
import type { ProjectViewTransportPort } from '../ports';
import type { ProjectLiveEvent } from '../types';

export function useProjectLiveEvents(
  port: ProjectViewTransportPort,
  projectId: string,
  enabled: boolean,
  iframeKeepAlivePool: ReturnType<typeof useIframeKeepAlivePool>,
  conversationsRefreshTokenRef: MutableRefObject<number>,
  projectIdRef: MutableRefObject<string>,
  setConversations: Dispatch<SetStateAction<Conversation[]>>,
  onProjectsRefresh: () => void,
  refreshLiveArtifacts: () => Promise<LiveArtifactSummary[]>,
  setLiveArtifactEvents: Dispatch<SetStateAction<LiveArtifactEventItem[]>>,
  setFilesRefresh: Dispatch<SetStateAction<number>>,
  setDesignMdRefreshKey: Dispatch<SetStateAction<number>>,
): void {
  // `unlink` + `add` (+ later `change`) burst within a single tick (#2195).
  // Refreshing the file list on the intermediate `unlink` makes the open
  // tab's active file vanish for one frame before the `add` restores it,
  // and FileWorkspace's "tab no longer on disk" path then drops the user
  // out of their preview. A short trailing wait absorbs the burst; the
  // maxWait cap stops a sustained edit storm from starving the UI.
  const refreshFilesAndDesignMd = useCallback(() => {
    setFilesRefresh((n) => n + 1);
    // Round 7 (mrcfps): file mutations are the dominant staleness signal
    // post-finalize — bump the refresh key so DESIGN.md staleness
    // recomputes against the new mtimes.
    setDesignMdRefreshKey((n) => n + 1);
  }, [setFilesRefresh, setDesignMdRefreshKey]);
  const coalescedFileChangedRefresh = useCoalescedCallback(
    refreshFilesAndDesignMd,
    { wait: 80, maxWait: 250 },
  );

  const handleProjectEvent = useCallback((evt: ProjectLiveEvent) => {
    if (evt.type === 'file-changed') {
      iframeKeepAlivePool.evictProject(projectId);
      coalescedFileChangedRefresh();
      return;
    }
    if (evt.type === 'conversation-created') {
      // A new conversation was inserted into this project by a path the
      // open project view can't observe through its own state (currently:
      // Routines "Run now" in reuse-an-existing-project mode, #1361).
      // Refetch the conversation list so the new entry becomes visible
      // without requiring the user to leave and re-enter the project.
      // Deliberately do NOT change the active conversation here — the
      // user keeps their current context. Auto-switch is a separate UX
      // decision tracked in #1361.
      if (evt.projectId !== projectId) return;
      const capturedProjectId = projectId;
      const myToken = ++conversationsRefreshTokenRef.current;
      void (async () => {
        try {
          const list = await port.listConversations(capturedProjectId);
          // Bail if the user switched projects while this request was in
          // flight (#1361 review, Codex P1). The captured project id is the
          // one we asked the daemon about; the live ref is the one the
          // user is looking at right now. If they don't match, applying
          // the list would overwrite the new project's sidebar with
          // stale data from the old one.
          if (projectIdRef.current !== capturedProjectId) return;
          // Bail if a newer conversation-created event already dispatched
          // its own refresh after us (#1361 review, lefarcen P2). With two
          // rapid events the later request may resolve first; if this
          // earlier request resolves afterwards it would drop the newer
          // conversation. Only the latest dispatch is allowed to apply.
          if (conversationsRefreshTokenRef.current !== myToken) return;
          setConversations(list);
        } catch {
          // Defensive: refresh failed (network blip, daemon gone). The
          // next project mount or another conversation-created event
          // will retry; no need to surface an error here.
        }
      })();
      return;
    }
    const agentEvent = projectEventToAgentEvent(evt);
    if (!agentEvent) return;
    setLiveArtifactEvents((prev) => appendLiveArtifactEventItem(prev, agentEvent));
    void refreshLiveArtifacts();
    onProjectsRefresh();
    // Live artifact events come from chat-turn-emitted artifacts; they
    // also imply the conversation transcript changed.
    setDesignMdRefreshKey((n) => n + 1);
  }, [
    coalescedFileChangedRefresh,
    conversationsRefreshTokenRef,
    iframeKeepAlivePool,
    onProjectsRefresh,
    port,
    projectId,
    projectIdRef,
    refreshLiveArtifacts,
    setConversations,
    setDesignMdRefreshKey,
    setLiveArtifactEvents,
  ]);

  useEffect(() => {
    if (!enabled || !projectId) return undefined;
    return port.subscribeProjectFileEvents(projectId, handleProjectEvent);
  }, [enabled, handleProjectEvent, port, projectId]);
}

/** Wirer: binds the real project-view transport port; swap in tests. */
export function useWiredProjectLiveEvents(
  projectId: string,
  enabled: boolean,
  iframeKeepAlivePool: ReturnType<typeof useIframeKeepAlivePool>,
  conversationsRefreshTokenRef: MutableRefObject<number>,
  projectIdRef: MutableRefObject<string>,
  setConversations: Dispatch<SetStateAction<Conversation[]>>,
  onProjectsRefresh: () => void,
  refreshLiveArtifacts: () => Promise<LiveArtifactSummary[]>,
  setLiveArtifactEvents: Dispatch<SetStateAction<LiveArtifactEventItem[]>>,
  setFilesRefresh: Dispatch<SetStateAction<number>>,
  setDesignMdRefreshKey: Dispatch<SetStateAction<number>>,
): void {
  useProjectLiveEvents(
    projectViewTransportPort,
    projectId,
    enabled,
    iframeKeepAlivePool,
    conversationsRefreshTokenRef,
    projectIdRef,
    setConversations,
    onProjectsRefresh,
    refreshLiveArtifacts,
    setLiveArtifactEvents,
    setFilesRefresh,
    setDesignMdRefreshKey,
  );
}
