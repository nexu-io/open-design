// Collab realtime hop-2 — daemon-side change source for the WORKSPACE-scoped
// thin invalidation events (`/api/workspace/events`).
//
// The daemon already learns cross-user workspace changes by reading Vela (team
// projects, member directory, workspace context). Today the web POLLS the daemon
// for each of those. This poller lets the daemon PUSH instead: it periodically
// reads the same sources the web reads, diffs them against the last-seen value,
// and emits a thin `{ type }` signal only when something actually changed. The
// web then re-fetches the affected resource through its existing loader.
//
// Design invariants:
//   - THIN events only. We diff to decide WHETHER to emit; we never ship the
//     diff or the list. The web re-fetches.
//   - Poll-as-floor safe. This runs in ADDITION to the web polls; a client whose
//     SSE never connects keeps polling with zero regression. This poller only
//     accelerates delivery, it is not the sole source of truth.
//   - Personal-user cheap. Team projects + members are only read when the
//     current context is a team workspace; off-team the poller only reads the
//     (already web-polled) workspace context to notice a team join.

import type {
  CollabCloudMemberDirectoryEntry,
  TeamProject,
  WorkspaceCollabContext,
  WorkspaceInvalidationSsePayload,
} from '@open-design/contracts';

export interface WorkspaceInvalidationPollerDeps {
  /** Current workspace context (proxies Vela/B in prod). Gates team reads and
   *  drives `workspace-context-changed`. Returns null off-team / signed out. */
  getWorkspaceContext: () => Promise<WorkspaceCollabContext | null>;
  /** Team-shared project discovery (resource hub). Only called on a team context. */
  listTeamProjects: (context: WorkspaceCollabContext) => Promise<TeamProject[]>;
  /** Team member directory. Only called on a team context. */
  listMembers: (
    context: WorkspaceCollabContext,
  ) => Promise<CollabCloudMemberDirectoryEntry[]>;
  /** Emit a thin workspace invalidation to the connected web sinks. */
  emit: (
    payload: WorkspaceInvalidationSsePayload,
    context: WorkspaceCollabContext | null,
  ) => void;
  /** Poll cadence; defaults to 15s (matches the web team-projects/members poll). */
  pollIntervalMs?: number;
  /** Ask the daemon recovery coordinator to inspect locally missing team
   * projects. This is a fire-and-forget request: a slow recovery must never
   * block workspace context, catalog, or member polling. `projects` is the
   * display-cache observation, not pull authorization: the recovery coordinator
   * must independently re-read authoritative identity + catalog state. */
  onTeamProjectsObserved?: (input: {
    workspaceId: string;
    projects: readonly TeamProject[];
  }) => void | Promise<void>;
  /** Minimum cadence for the missing-project recovery request. */
  recoveryFloorIntervalMs?: number;
  /** Injectable wall clock for deterministic recovery-floor tests. */
  now?: () => number;
  onError?: (error: unknown) => void;
}

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_RECOVERY_FLOOR_INTERVAL_MS = 30_000;

/** Stable signature of the workspace context — any change to these fields is a
 *  meaningful `workspace-context-changed`. Whole-object stringify is fine here:
 *  the context is small and we only need change-detection, not a minimal diff. */
function contextSignature(context: WorkspaceCollabContext | null): string {
  if (!context) return 'null';
  return JSON.stringify(context);
}

/** Is this a team workspace we should read team projects / members for? */
function isTeamContext(
  context: WorkspaceCollabContext | null,
): context is WorkspaceCollabContext {
  if (!context) return false;
  if (context.workspaceType === 'team') return true;
  return typeof context.teamId === 'string' && context.teamId.trim().length > 0;
}

/** Fail-closed prefilter for broad recovery. Keep this identity boundary
 * aligned with `activeTeamWorkspaceIdentity` in proactive-content-pull.ts
 * without changing `isTeamContext`'s existing invalidation/read semantics. */
function activeRecoveryWorkspaceId(context: WorkspaceCollabContext): string | null {
  const workspaceId = context.workspaceId?.trim() ?? '';
  const resourceTeamId = context.teamId?.trim() ?? '';
  const workspaceMemberId = context.workspaceMemberId?.trim() ?? '';
  if (
    context.workspaceType !== 'team' ||
    context.memberStatus !== 'active' ||
    context.lifecycleState !== 'active' ||
    !workspaceId ||
    !resourceTeamId ||
    !workspaceMemberId
  ) {
    return null;
  }
  return workspaceId;
}

function teamProjectsSignature(projects: TeamProject[]): string {
  // Sort by id so hub ordering churn does not read as a change; include the
  // fields whose change the "全部项目" view must reflect (membership in the list =
  // share/unshare, owner, display name, last update).
  const rows = projects
    .map((p) => ({
      id: p.projectId,
      name: p.name ?? '',
      owner: p.ownerMemberId ?? '',
      updatedAt: p.updatedAt ?? 0,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify(rows);
}

function membersSignature(members: CollabCloudMemberDirectoryEntry[]): string {
  const rows = members
    .map((m) => ({ id: m.memberId, name: m.displayName ?? '', role: m.role ?? '' }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify(rows);
}

export interface WorkspaceInvalidationPoller {
  /** Run one diff cycle (context → team reads → emit on change). */
  pollOnce(): Promise<void>;
  start(): void;
  stop(): void;
}

export function createWorkspaceInvalidationPoller(
  deps: WorkspaceInvalidationPollerDeps,
): WorkspaceInvalidationPoller {
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const recoveryFloorIntervalMs =
    deps.recoveryFloorIntervalMs ?? DEFAULT_RECOVERY_FLOOR_INTERVAL_MS;
  const now = deps.now ?? Date.now;
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let recoveryWorkspaceId: string | null = null;
  let recoveryRequestedAt: number | null = null;

  // `undefined` = never observed (first cycle establishes the baseline WITHOUT
  // emitting, so a fresh daemon does not spam a synthetic "changed" on boot).
  let contextSig: string | undefined;
  let teamProjectsSig: string | undefined;
  let membersSig: string | undefined;

  const emitIfChanged = (
    previous: string | undefined,
    next: string,
    payload: WorkspaceInvalidationSsePayload,
    context: WorkspaceCollabContext | null,
  ): string => {
    if (previous !== undefined && previous !== next) deps.emit(payload, context);
    return next;
  };

  const requestMissingProjectRecovery = (
    context: WorkspaceCollabContext,
    projects: readonly TeamProject[],
    at: number,
  ): void => {
    if (!deps.onTeamProjectsObserved) return;
    const workspaceId = activeRecoveryWorkspaceId(context);
    if (!workspaceId) return;
    if (
      recoveryWorkspaceId === workspaceId &&
      recoveryRequestedAt != null &&
      at - recoveryRequestedAt < recoveryFloorIntervalMs
    ) {
      return;
    }
    recoveryWorkspaceId = workspaceId;
    recoveryRequestedAt = at;
    try {
      void Promise.resolve(
        deps.onTeamProjectsObserved({ workspaceId, projects }),
      ).catch((error) => deps.onError?.(error));
    } catch (error) {
      deps.onError?.(error);
    }
  };

  async function pollOnce(): Promise<void> {
    const observedAt = now();
    const context = await deps.getWorkspaceContext().catch((error) => {
      deps.onError?.(error);
      return null;
    });
    contextSig = emitIfChanged(contextSig, contextSignature(context), {
      type: 'workspace-context-changed',
      at: observedAt,
    }, context);

    if (!isTeamContext(context)) {
      recoveryWorkspaceId = null;
      recoveryRequestedAt = null;
      // Off-team: fold team projects / members to empty so RE-entering a team
      // re-emits, but never spawn the team reads for a personal user.
      teamProjectsSig = emitIfChanged(teamProjectsSig, teamProjectsSignature([]), {
        type: 'team-projects-changed',
        at: observedAt,
      }, context);
      membersSig = emitIfChanged(membersSig, membersSignature([]), {
        type: 'members-changed',
        at: observedAt,
      }, context);
      return;
    }

    const [projects, members] = await Promise.all([
      deps.listTeamProjects(context).catch((error) => {
        deps.onError?.(error);
        return null;
      }),
      deps.listMembers(context).catch((error) => {
        deps.onError?.(error);
        return null;
      }),
    ]);
    // A transient read failure returns null — keep the last baseline rather than
    // emitting a spurious "changed" or clearing the view.
    if (projects) {
      teamProjectsSig = emitIfChanged(teamProjectsSig, teamProjectsSignature(projects), {
        type: 'team-projects-changed',
        at: observedAt,
      }, context);
      requestMissingProjectRecovery(context, projects, observedAt);
    }
    if (members) {
      membersSig = emitIfChanged(membersSig, membersSignature(members), {
        type: 'members-changed',
        at: observedAt,
      }, context);
    }
  }

  function tick(): void {
    if (running) return;
    running = true;
    void pollOnce()
      .catch((error) => deps.onError?.(error))
      .finally(() => {
        running = false;
      });
  }

  return {
    pollOnce,
    start(): void {
      if (timer) return;
      timer = setInterval(tick, pollIntervalMs);
      // Do not keep the event loop alive solely for polling.
      timer.unref?.();
    },
    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
