import { useEffect, useRef, useState } from 'react';
import type { CollabMemberRole, CollabPresenceMember, WorkspaceCollabContext } from '@open-design/contracts';
import { resolveCollabSession } from './collab-session';
import { useCollab } from './useCollab';

export interface UseProjectCollabOptions {
  /** Injectable for tests. */
  fetch?: typeof fetch;
  baseUrl?: string;
  heartbeatMs?: number;
  statusPollMs?: number;
  presenceFilePath?: string | null;
  presenceActivity?: CollabPresenceMember['activity'];
}

interface WorkspaceContextState {
  context: WorkspaceCollabContext | null;
  loading: boolean;
}

function useWorkspaceContextState(options: UseProjectCollabOptions = {}): WorkspaceContextState {
  const [state, setState] = useState<WorkspaceContextState>({ context: null, loading: true });
  const baseUrl = options.baseUrl ?? '';
  const fetchImpl = options.fetch;

  useEffect(() => {
    let cancelled = false;
    const run = fetchImpl ?? globalThis.fetch.bind(globalThis);
    void (async () => {
      try {
        const response = await run(`${baseUrl}/api/workspace/context`);
        if (!response.ok) {
          if (!cancelled) setState({ context: null, loading: false });
          return;
        }
        const body = (await response.json()) as { context?: WorkspaceCollabContext | null };
        if (!cancelled) setState({ context: body?.context ?? null, loading: false });
      } catch {
        if (!cancelled) setState({ context: null, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, fetchImpl]);

  return state;
}

/**
 * Fetch the current workspace context (B-integration seam, GET /api/workspace/
 * context). Null until it loads, or when there is no team-workspace context
 * (personal / signed out / hub unavailable). The daemon serves a dev context
 * until B is wired; production proxies B.
 */
export function useWorkspaceContext(options: UseProjectCollabOptions = {}): WorkspaceCollabContext | null {
  return useWorkspaceContextState(options).context;
}

export interface ProjectCollab {
  /** Whether collab (presence + sync) is active for this project + viewer. */
  enabled: boolean;
  /** The viewer's presence identity, when enabled. */
  member: CollabPresenceMember | null;
  present: CollabPresenceMember[];
  publishedVersion: number | null;
  syncState: ReturnType<typeof useCollab>['syncState'];
  /**
   * Whether the viewer should see this project single-writer/read-only. Two
   * independent gates make it read-only:
   *  1. Workspace-level — the workspace is not writable (`permissions
   *     .canWriteSyncedFiles` is false: locked/frozen billing, or the member was
   *     removed). This freezes EVERYONE, the project owner included.
   *  2. Project-level — the project is shared to the team and the viewer is not
   *     its owner (the member who shared it). Ownership, not workspace role, is
   *     the determinant, so the sharer keeps editing while everyone else views.
   * A personal / unshared project in a writable workspace is never read-only.
   */
  viewerOnly: boolean;
  /**
   * Whether the viewer is this project's OWNER — the member who shared it (its
   * single writer). True only when the polled `ownerMemberId` explicitly matches
   * the current member; it fails closed during the status-load window and for
   * every non-owner. Distinct from `!viewerOnly`, which a workspace-level freeze
   * (locked billing / removed member) can also flip. Drives per-comment
   * permission gates (the owner may delete or send any member's comment) without
   * re-deriving ownership at the call site.
   */
  isOwner: boolean;
  /**
   * Display name of the member who shared this project (its owner), resolved
   * server-side from the collab-cloud member directory. Drives the "这是 {owner}
   * 创建的共享项目" read-only banner. Null when the project is unshared, off-team,
   * or the owner is not in the directory — the banner then falls back to its
   * name-less copy.
   */
  ownerDisplayName: string | null;
  /** The owner's team role (owner/admin/member); null when unresolved. */
  ownerRole: CollabMemberRole | null;
  reportChange: () => void;
  requestPublish: () => void;
}

/**
 * Real-product collab integration for a project : resolves the workspace
 * context → decides whether collab runs (team member of a live workspace) → runs
 * presence + sync for the viewer. Dormant (enabled=false, no heartbeat) when the
 * project is personal / the viewer is not a team member — so it is safe to mount
 * unconditionally in the project view.
 */
export function useProjectCollab(
  projectId: string | null | undefined,
  options: UseProjectCollabOptions = {},
): ProjectCollab {
  const { context, loading: workspaceContextLoading } = useWorkspaceContextState(options);
  const decision = resolveCollabSession(context);
  const member = decision.member
    ? {
        ...decision.member,
        ...(options.presenceFilePath ? { filePath: options.presenceFilePath } : {}),
        ...(options.presenceActivity !== undefined ? { activity: options.presenceActivity } : {}),
      }
    : null;
  const collab = useCollab({
    projectId: projectId ?? null,
    member,
    enabled: decision.enabled,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
    ...(options.heartbeatMs !== undefined ? { heartbeatMs: options.heartbeatMs } : {}),
    ...(options.statusPollMs !== undefined ? { statusPollMs: options.statusPollMs } : {}),
  });
  // Gate 1 (workspace-level): a non-writable workspace (locked/frozen billing or
  // a removed member) freezes everyone — consume B's `canWriteSyncedFiles` bit
  // rather than re-deriving from lifecycle so the two lanes cannot drift.
  const workspaceReadOnly = context != null && !context.permissions.canWriteSyncedFiles;
  // Context loading is not the same as confirmed off-team. Fail closed during
  // the initial workspace-context request so an already-pulled shared project
  // never flashes writable controls before B confirms the current member.
  const workspaceContextReadOnly = Boolean(projectId) && workspaceContextLoading;
  // Gate 2 (project-level): a project shared to the team (syncState past
  // `local_only`) is read-only for everyone except the member who shared it — the
  // single writer keeps editing their own project. This fails closed: it stays
  // read-only until the polled owner id EXPLICITLY matches the current member, so
  // a non-owner (of any workspace role — including admin/owner) never gets edit
  // affordances during the load window or when a `/collab/status` payload is
  // briefly missing `ownerMemberId`. The real owner sees a momentary read-only
  // state until their id is confirmed, then flips to editable. A personal /
  // unshared project is never read-only on this gate.
  const statusUnknown = decision.enabled && collab.syncState === null;
  const shared = collab.syncState !== 'local_only' && collab.syncState !== null;
  const collabEnabled = decision.enabled && (statusUnknown || shared);
  const isOwner = collab.ownerMemberId != null && collab.ownerMemberId === context?.workspaceMemberId;
  const sharedReadOnly = statusUnknown || (shared && !isOwner);
  const viewerOnly = workspaceContextReadOnly || workspaceReadOnly || sharedReadOnly;

  // Member content auto-sync (the last link): when a read-only member sees the
  // resource-hub head (`publishedVersion`) advance past what we last pulled,
  // pull the new content into the local project directory. The daemon
  // materializes it and its file watcher then fires the existing live-reload SSE
  // (`useProjectFileEvents` in ProjectView, gated on `daemonLive`), so the
  // FileViewer refreshes on its own — no extra reload wiring is needed here.
  //
  // Only non-owner members of a shared project pull. The owner is the single
  // writer; their local copy is already the newest, and pulling could clobber
  // unpublished edits. A workspace-level read-only freeze also must not make the
  // owner auto-pull over their own working tree, so this gate keys off explicit
  // project ownership instead of the broader `viewerOnly` flag.
  //
  // The cursor starts at 0 (not the first observed `publishedVersion`), so
  // entering a shared project pulls once to guarantee the member lands on the
  // latest head rather than trusting a possibly-stale local copy.
  const pulledVersionRef = useRef(0);
  const pullInFlightRef = useRef(false);
  // Bumped after each successful pull to re-evaluate immediately — this catches
  // a head that advanced while a pull was in flight (the plain publishedVersion
  // dep would otherwise not re-fire once it settles on the newer number).
  const [pullTick, setPullTick] = useState(0);
  // Reset the cursor when the project changes so switching to another shared
  // project pulls its latest head instead of inheriting the previous cursor.
  useEffect(() => {
    pulledVersionRef.current = 0;
    pullInFlightRef.current = false;
  }, [projectId]);
  const { publishedVersion } = collab;
  const pull = collab.pull;
  const shouldAutoPull = decision.enabled && shared && !isOwner;
  useEffect(() => {
    if (!shouldAutoPull) return;
    if (publishedVersion == null) return;
    if (publishedVersion <= pulledVersionRef.current) return;
    if (pullInFlightRef.current) return;
    const target = publishedVersion;
    pullInFlightRef.current = true;
    void (async () => {
      let advanced = false;
      try {
        await pull();
        // Advance only on success so a failed pull is retried, not skipped.
        pulledVersionRef.current = target;
        advanced = true;
      } catch {
        // Swallow: the ~5s status poll keeps publishedVersion fresh and the next
        // tick retries while the cursor is still behind. Deferring the retry to
        // the poll (rather than looping) avoids hammering a failing daemon.
      } finally {
        pullInFlightRef.current = false;
      }
      if (advanced) setPullTick((n) => n + 1);
    })();
  }, [shouldAutoPull, publishedVersion, pull, pullTick]);

  return {
    enabled: collabEnabled,
    member,
    present: collab.present,
    publishedVersion: collab.publishedVersion,
    syncState: collab.syncState,
    viewerOnly,
    isOwner,
    ownerDisplayName: collab.ownerDisplayName,
    ownerRole: collab.ownerRole,
    reportChange: collab.reportChange,
    requestPublish: collab.requestPublish,
  };
}
