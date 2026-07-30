import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ProjectContentTransferState,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import {
  CollabClient,
  type CollabClientOptions,
  type CollabPresenceMember,
  type CollabSnapshot,
} from './collab-client';
import { workspaceIdentityCacheKey } from './workspace-identity';

export interface UseCollabOptions {
  projectId: string | null | undefined;
  member: CollabPresenceMember | null | undefined;
  /**
   * Workspace authority for every collab request. `null` means unresolved and
   * blocks the client; omitted is retained only for isolated legacy consumers.
   */
  workspaceContext?: WorkspaceCollabContext | null;
  /**
   * Presence gate: heartbeat + leave. Requires both this AND a resolved
   * `member` — sending presence with no identity is meaningless and could
   * error server-side, so it never runs ahead of `member`.
   */
  enabled?: boolean;
  /**
   * Status-poll gate. It may run before the separate presence `member` object
   * resolves, but a real workspace caller must already provide
   * `workspaceContext` because `/collab/status` is an identity-scoped
   * data-plane read. Defaults to `enabled`.
   */
  statusEnabled?: boolean;
  baseUrl?: string;
  heartbeatMs?: number;
  statusPollMs?: number;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

export interface UseCollabResult {
  present: CollabPresenceMember[];
  publishedVersion: number | null;
  materializedVersion: number | null;
  contentTransferState: ProjectContentTransferState | null;
  awaitingFirstMaterialization: boolean;
  statusPollGeneration: number;
  syncState: CollabSnapshot['syncState'];
  ownerMemberId: CollabSnapshot['ownerMemberId'];
  ownerDisplayName: CollabSnapshot['ownerDisplayName'];
  ownerRole: CollabSnapshot['ownerRole'];
  reportChange: () => void;
  requestPublish: () => void;
  /** Member side — pull the published head into the local project directory. */
  pull: () => Promise<number | null>;
  /** Refresh the presence roster now (hub push-channel consumer). */
  refreshPresence: () => void;
  /** Run one status check now (hub push-channel consumer). */
  checkStatusNow: () => void;
  /** Apply an inbound-transfer lifecycle update from the project SSE. */
  applyContentTransferState: (state: ProjectContentTransferState) => void;
}

const EMPTY: CollabSnapshot = {
  present: [],
  publishedVersion: null,
  materializedVersion: null,
  contentTransferState: null,
  awaitingFirstMaterialization: false,
  statusPollGeneration: 0,
  syncState: null,
  ownerMemberId: null,
  ownerDisplayName: null,
  ownerRole: null,
};

interface ProjectScopedSnapshot {
  sourceProjectId: string | null;
  sourceWorkspaceIdentity: string;
  snapshot: CollabSnapshot;
}

const EMPTY_SCOPED_SNAPSHOT: ProjectScopedSnapshot = {
  sourceProjectId: null,
  sourceWorkspaceIdentity: 'none',
  snapshot: EMPTY,
};

/**
 * React seam over {@link CollabClient} (C lane). Starts a presence heartbeat +
 * sync-status poll for the current shared project and re-renders as the present
 * set / published head version change. Members drive the read-only collab view
 * from this; the author additionally calls reportChange / requestPublish.
 */
export function useCollab(options: UseCollabOptions): UseCollabResult {
  const { projectId, member, enabled = true } = options;
  const statusEnabled = options.statusEnabled ?? enabled;
  const workspaceIdentity =
    options.workspaceContext === undefined
      ? 'legacy'
      : workspaceIdentityCacheKey(options.workspaceContext);
  const active = Boolean(
    statusEnabled && projectId && options.workspaceContext !== null,
  );
  const [scopedSnapshot, setScopedSnapshot] =
    useState<ProjectScopedSnapshot>(EMPTY_SCOPED_SNAPSHOT);
  // Effects clean up only after render commits. When projectId changes, the
  // state still contains the prior client's last snapshot during that render;
  // synchronously mask it so no consumer can seed a new-project cursor or
  // start a pull from old-project published/sync state.
  const snapshot =
    active
      && scopedSnapshot.sourceProjectId === (projectId ?? null)
      && scopedSnapshot.sourceWorkspaceIdentity === workspaceIdentity
      ? scopedSnapshot.snapshot
      : EMPTY;
  const clientRef = useRef<CollabClient | null>(null);

  // The client's lifecycle (create/destroy) is gated on status-poll
  // eligibility ONLY — `member` is deliberately absent here. Presence
  // (heartbeat/leave) needs `member` too, but that requirement is enforced
  // below via CollabClient.setMember, not by delaying client creation, so a
  // late-resolving identity announces itself without restarting a status poll
  // that's already progressed.
  // Restart only on identity changes, not on every render of a fresh member object.
  const memberKey = member
    ? JSON.stringify([
        member.memberId,
        member.name ?? '',
        member.role ?? '',
        member.filePath ?? '',
        member.activity ?? null,
      ])
    : '';

  useEffect(() => {
    if (!active || !projectId) {
      setScopedSnapshot(EMPTY_SCOPED_SNAPSHOT);
      return;
    }
    let disposed = false;
    // Always start with no identity — see the member-sync effect below,
    // which runs after this one on every render (including this mount) and
    // is the single place that calls setMember. This keeps "does presence
    // have an identity yet" logic in one spot instead of duplicating the
    // enabled+member check at both construction time and in setMember.
    const clientOptions: CollabClientOptions = {
      projectId,
      member: null,
      ...(options.workspaceContext
        ? { workspaceContext: options.workspaceContext }
        : {}),
      onUpdate: (nextSnapshot) => {
        // stop() cannot cancel a status request already in flight. Ignore that
        // old client's late response instead of letting it overwrite the new
        // project's scoped snapshot.
        if (!disposed) {
          setScopedSnapshot({
            sourceProjectId: projectId,
            sourceWorkspaceIdentity: workspaceIdentity,
            snapshot: nextSnapshot,
          });
        }
      },
    };
    if (options.baseUrl !== undefined) clientOptions.baseUrl = options.baseUrl;
    if (options.heartbeatMs !== undefined) clientOptions.heartbeatMs = options.heartbeatMs;
    if (options.statusPollMs !== undefined) clientOptions.statusPollMs = options.statusPollMs;
    if (options.fetch !== undefined) clientOptions.fetch = options.fetch;

    const client = new CollabClient(clientOptions);
    clientRef.current = client;
    client.start();
    // A hard tab close skips React unmount, so `stop()`'s fetch leave never
    // sends. `pagehide` fires on close/navigation and lets the client hand off a
    // beacon that survives the unload, so the present set drops promptly.
    const onPageHide = () => client.leaveBeacon();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      disposed = true;
      window.removeEventListener('pagehide', onPageHide);
      client.stop();
      clientRef.current = null;
      setScopedSnapshot(EMPTY_SCOPED_SNAPSHOT);
    };
    // fetch is intentionally not a restart trigger (a fresh reference every
    // render must not tear down a running client).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active,
    projectId,
    workspaceIdentity,
    options.baseUrl,
    options.heartbeatMs,
    options.statusPollMs,
  ]);

  // Presence identity: resolves independently of (and typically later than)
  // status-poll eligibility above — `member` needs the workspace-context
  // round-trip to land, while the status client may already be running.
  // Sync it into the live client instead of tearing the whole client down;
  // this is what lets presence come online without restarting a status poll
  // that's already progressed. Both `enabled` (the ORIGINAL, member-gated
  // condition — not the wider `statusEnabled` above) and a non-null `member`
  // are required, so a permission-denied decision (member-removed, frozen
  // workspace, no workspace context) never announces presence even though it
  // may have briefly kept status polling alive while the decision itself was
  // still in flight. Deps mirror the client-lifecycle effect's recreation
  // triggers so a freshly (re)created client is synced in the same commit.
  useEffect(() => {
    clientRef.current?.setMember(enabled && member ? member : null);
    // memberKey stands in for `member`; fetch is intentionally excluded, same
    // as the client-lifecycle effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active,
    projectId,
    workspaceIdentity,
    enabled,
    memberKey,
    options.baseUrl,
    options.heartbeatMs,
    options.statusPollMs,
  ]);

  const reportChange = useCallback(() => {
    void clientRef.current?.reportChange();
  }, []);
  const requestPublish = useCallback(() => {
    void clientRef.current?.requestPublish();
  }, []);
  // Returns the promise (unlike reportChange/requestPublish) so the member
  // auto-pull can await a successful pull before advancing its version cursor.
  const pull = useCallback(async () => {
    return (await clientRef.current?.pull()) ?? null;
  }, []);
  // Hub push-channel consumers: `presence-changed` / `project-metadata-changed`
  // thin events trigger these instead of waiting for the next 10s heartbeat /
  // 5s status tick, so joins, leaves, renames, and fresh publishes surface
  // near-instantly while the poll loops stay as the fallback cadence.
  const refreshPresence = useCallback(() => {
    void clientRef.current?.refreshPresence();
  }, []);
  const checkStatusNow = useCallback(() => {
    void clientRef.current?.pollStatus();
  }, []);
  const applyContentTransferState = useCallback(
    (state: ProjectContentTransferState) => {
      clientRef.current?.applyContentTransferState(state);
    },
    [],
  );

  return {
    present: snapshot.present,
    publishedVersion: snapshot.publishedVersion,
    materializedVersion: snapshot.materializedVersion,
    contentTransferState: snapshot.contentTransferState,
    awaitingFirstMaterialization: snapshot.awaitingFirstMaterialization,
    statusPollGeneration: snapshot.statusPollGeneration,
    syncState: snapshot.syncState,
    ownerMemberId: snapshot.ownerMemberId,
    ownerDisplayName: snapshot.ownerDisplayName,
    ownerRole: snapshot.ownerRole,
    reportChange,
    requestPublish,
    pull,
    refreshPresence,
    checkStatusNow,
    applyContentTransferState,
  };
}
