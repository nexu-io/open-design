import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { coalescedGet } from '../lib/coalesced-get';
import type {
  CollabCloudMemberDirectoryEntry,
  CollabCloudMembersResponse,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import { useWorkspaceContext } from './useWorkspaceContext';
import { useWorkspaceInvalidation } from './workspace-events';
import {
  beginWorkspaceScopedRead,
  workspaceIdentityCacheKey,
  workspaceProjectHeaders,
} from './workspace-identity';

// Poll cadence for the collab-cloud member directory. ~15s is light enough to
// keep a comment author's name / role fresh (a member registers on join) without
// a heavy loop; it mirrors `useTeamProjects`'s cadence. The read is daemon-local
// (the daemon caches the directory) so the poll just refetches the whole list.
const TEAM_MEMBERS_POLL_MS = 15_000;
// Poll-as-floor cadence while the workspace SSE is connected.
const TEAM_MEMBERS_SSE_FLOOR_MS = 60_000;

export interface TeamMembersState {
  members: CollabCloudMemberDirectoryEntry[];
  /** memberId → directory entry, for O(1) author/owner resolution. */
  byId: Map<string, CollabCloudMemberDirectoryEntry>;
  /**
   * Turn an opaque `authorMemberId` / `ownerMemberId` into a `{displayName,
   * role}` entry. Resolution order: the roster entry → the CURRENT USER when the
   * id is theirs → null.
   *
   * The current-user arm is an INVARIANT, not an optimization: the signed-in
   * user must always resolve to themselves whether or not a roster exists.
   * `GET /api/workspace/members` answers `{"members":[]}` on a personal
   * workspace, and starts empty on a team workspace during the cold window
   * before the first roster load returns — in both cases the viewer's own
   * comment rendered with no avatar and no name. That fallback lives here so
   * every caller inherits it instead of re-patching each card.
   *
   * Null now means only: no id, or a genuinely unknown OTHER member (off team,
   * or one the daemon has not seen register yet). Callers keep their existing
   * id-only rendering for that case.
   */
  resolve: (memberId: string | null | undefined) => CollabCloudMemberDirectoryEntry | null;
}

/**
 * The signed-in user's own directory entry, synthesized from the workspace
 * context the caller ALREADY holds. Pass it to `useTeamMembers` so the viewer
 * resolves to themselves even when the roster is empty.
 *
 * This deliberately takes an existing `WorkspaceCollabContext` rather than
 * fetching one: `/api/workspace/context` is already read by the nav shell and by
 * every viewer that needs it, and duplicating GETs is what saturated HTTP/1.1's
 * six-connection budget on this branch.
 */
export function currentUserDirectoryEntry(
  context: WorkspaceCollabContext | null | undefined,
): CollabCloudMemberDirectoryEntry | null {
  const memberId = context?.workspaceMemberId?.trim();
  if (!context || !memberId) return null;
  return {
    memberId,
    // Same fallback the daemon uses when it registers an identity into the
    // directory (`collab-cloud-service.ts`): an unnamed identity reads as its
    // id rather than as a blank card.
    displayName: context.displayName?.trim() || memberId,
    role: context.role,
  };
}

/**
 * Collab-cloud member directory read (`GET /api/workspace/members`). Returns the
 * team roster the client uses to render "琼羽 · Owner" on a comment card and the
 * owner name on the shared-project banner. Off-team / 404 degrades to an empty
 * map (never throws), so this is safe to mount unconditionally. Lightly polled so
 * a member who joins mid-session resolves without a refresh.
 *
 * `currentUser` is the viewer's own entry (see {@link currentUserDirectoryEntry}),
 * which `resolve` falls back to so the signed-in user is resolvable with or
 * without a roster. Callers that cannot cheaply supply it may omit it; they then
 * get roster-only resolution, exactly as before.
 */
export function useTeamMembers(
  currentUser?: CollabCloudMemberDirectoryEntry | null,
): TeamMembersState {
  const [roster, setRoster] = useState<{
    identity: string;
    members: CollabCloudMemberDirectoryEntry[];
  }>({ identity: 'none', members: [] });
  const mountedRef = useRef(true);
  // A workspace switch makes an in-flight roster read describe an identity the
  // user has left. Ordering is local to this hook instance so the late answer
  // cannot redefine the roster the newer read already resolved.
  const requestEpochRef = useRef(0);

  // The identity lives both on the request and in its cache key. When it
  // changes, the hook immediately re-reads that workspace's roster instead of
  // waiting out the 15-60s poll or relying on daemon-global active state.
  //
  // This is not the duplicate GET `currentUserDirectoryEntry` warns about —
  // `useWorkspaceContext` shares one coalesced request and one module-level cache
  // across every mounted consumer, and both call sites of this hook already mount
  // it themselves.
  const {
    context: workspaceContext,
    identityChangePending,
  } = useWorkspaceContext();
  const workspaceContextRef = useRef(workspaceContext);
  workspaceContextRef.current = workspaceContext;
  const membersCacheKey = `workspace-members:${workspaceIdentityCacheKey(workspaceContext)}`;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestEpochRef.current += 1;
    };
  }, []);

  const load = useCallback(async () => {
    const read = beginWorkspaceScopedRead(workspaceContextRef.current);
    const requestEpoch = ++requestEpochRef.current;
    const settle = (next: CollabCloudMemberDirectoryEntry[]) => {
      if (
        mountedRef.current &&
        requestEpochRef.current === requestEpoch &&
        read.isStillCurrent(workspaceContextRef.current)
      ) {
        setRoster({
          identity: workspaceIdentityCacheKey(read.context),
          members: next,
        });
      }
    };
    const requestContext = read.context;
    if (!requestContext) {
      settle([]);
      return;
    }
    try {
      const members = await coalescedGet(membersCacheKey, async () => {
        const res = await fetch('/api/workspace/members', {
          headers: workspaceProjectHeaders(requestContext),
        });
        if (!res.ok) throw new Error(`members ${res.status}`);
        const body = (await res.json()) as CollabCloudMembersResponse;
        return body.members ?? [];
      });
      settle(members);
    } catch {
      // Personal / offline / daemon without the collab cloud: no directory.
      settle([]);
    }
  }, [membersCacheKey]);

  // Collab realtime hop-2: subscribe to the workspace SSE and re-fetch on a
  // pushed `members-changed` (someone joined/left/changed role). The daemon's
  // workspace-invalidation poller diffs the roster and pushes only on an actual
  // change. `connected` drives poll-as-floor below.
  const { connected: sseConnected } = useWorkspaceInvalidation(
    { 'members-changed': () => void load() },
    {
      workspaceContext,
      onActive: () => void load(),
    },
  );

  useEffect(() => {
    void load();
    // Poll-as-floor: slow the poll while the SSE is delivering, full cadence when
    // the stream is unavailable so a non-SSE client has zero regression.
    const intervalMs = sseConnected ? TEAM_MEMBERS_SSE_FLOOR_MS : TEAM_MEMBERS_POLL_MS;
    const interval = setInterval(() => {
      // Skip the poll while the tab is hidden — no point refreshing the member
      // directory for a backgrounded window.
      if (document.visibilityState === 'visible') void load();
    }, intervalMs);
    return () => clearInterval(interval);
  }, [load, sseConnected]);

  const members =
    !identityChangePending && roster.identity === workspaceIdentityCacheKey(workspaceContext)
      ? roster.members
      : [];
  const byId = useMemo(() => {
    const map = new Map<string, CollabCloudMemberDirectoryEntry>();
    for (const entry of members) map.set(entry.memberId, entry);
    return map;
  }, [members]);

  // Field-wise memo so a caller passing a fresh object literal every render does
  // not churn `resolve`'s identity (and every consumer that depends on it).
  const currentUserMemberId = currentUser?.memberId ?? null;
  const currentUserDisplayName = currentUser?.displayName ?? null;
  const currentUserRole = currentUser?.role ?? null;
  const self = useMemo<CollabCloudMemberDirectoryEntry | null>(
    () =>
      currentUserMemberId && currentUserDisplayName && currentUserRole
        ? {
            memberId: currentUserMemberId,
            displayName: currentUserDisplayName,
            role: currentUserRole,
          }
        : null,
    [
      currentUserMemberId,
      currentUserDisplayName,
      currentUserRole,
    ],
  );

  const resolve = useCallback(
    (memberId: string | null | undefined): CollabCloudMemberDirectoryEntry | null => {
      if (!memberId) return null;
      // The roster wins when it has the member: it is the authoritative name and
      // role, and it stays right when the viewer's own role changes mid-session.
      const entry = byId.get(memberId);
      if (entry) return entry;
      // Me, with no roster (personal workspace) or before it lands.
      if (self && self.memberId === memberId) return self;
      return null;
    },
    [byId, self],
  );

  return { members, byId, resolve };
}
