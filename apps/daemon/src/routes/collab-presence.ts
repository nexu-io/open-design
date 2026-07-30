import type { Express, Request, Response } from 'express';
import type {
  CollabPresenceMember,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import type { CollabRuntime } from '../collab/runtime.js';
import type { PresenceMember } from '../collab/presence-tracker.js';
import type {
  VelaCliPresenceHeartbeatInput,
  VelaCliPresenceLeaveInput,
} from '../collab/vela-cli-collab-client.js';
import type {
  VerifiedWorkspaceRequestContextResult,
} from '../collab/request-workspace-context.js';

type PresenceActivity = Exclude<PresenceMember['activity'], undefined>;

export interface CollabPresenceCloudClient {
  heartbeatPresence(
    projectId: string,
    input: VelaCliPresenceHeartbeatInput,
    context?: WorkspaceCollabContext | null,
  ): Promise<CollabPresenceMember[]>;
  listPresence(
    projectId: string,
    context?: WorkspaceCollabContext | null,
  ): Promise<CollabPresenceMember[]>;
  leavePresence(
    projectId: string,
    input: VelaCliPresenceLeaveInput,
    context?: WorkspaceCollabContext | null,
  ): Promise<CollabPresenceMember[]>;
}

export interface RegisterCollabPresenceRoutesDeps {
  collab: Pick<CollabRuntime, 'presence'>;
  cloud?: CollabPresenceCloudClient | null;
  isProjectShared?: (
    projectId: string,
    context?: WorkspaceCollabContext | null,
  ) => Promise<boolean>;
  verifyWorkspaceRequest?: (
    req: Request,
    projectId: string,
  ) => Promise<
    | VerifiedWorkspaceRequestContextResult
    | WorkspaceCollabContext
    | null
  >;
  /**
   * Bounded successful authority lease for the idempotent GET surface.
   * Heartbeat and leave deliberately keep using `verifyWorkspaceRequest`.
   */
  verifyWorkspaceReadRequest?: RegisterCollabPresenceRoutesDeps['verifyWorkspaceRequest'];
  /** Test/operations seam for the short-lived cloud list cache. */
  presenceListCacheFreshMs?: number;
  /** Virtual clock seam for deterministic TTL coverage. */
  presenceListCacheNow?: () => number;
  /**
   * The configured cloud route authoritatively rejects projects outside the
   * requested workspace, so a separate remote team-project lookup is redundant.
   */
  cloudAuthorizesProjectPresence?: (projectId: string) => boolean;
}

export interface CollabPresenceRoutesControl {
  /**
   * Drop cached list results for one project after a hub presence-changed
   * signal. `workspaceId` keeps invalidation scoped when it is known.
   */
  invalidatePresence(projectId: string, workspaceId?: string): void;
}

const DEFAULT_PRESENCE_LIST_CACHE_FRESH_MS = 1_000;
const MAX_PRESENCE_LIST_CACHE_ENTRIES = 256;

interface PresenceListCacheEntry {
  projectId: string;
  workspaceId: string;
  value: CollabPresenceMember[] | null;
  settledAt: number;
  inflight: Promise<CollabPresenceMember[]> | null;
}

function presenceListCacheKey(
  projectId: string,
  context: WorkspaceCollabContext | null,
): string {
  const permissions = context?.permissions;
  return JSON.stringify([
    projectId,
    context?.workspaceId?.trim() ?? '',
    context?.workspaceMemberId?.trim() ?? '',
    context?.workspaceType ?? '',
    context?.role ?? '',
    context?.memberStatus ?? '',
    context?.lifecycleState ?? '',
    permissions?.canManageMembers ?? false,
    permissions?.canManageBilling ?? false,
    permissions?.canInviteMembers ?? false,
    permissions?.canManageAutoRecharge ?? false,
    permissions?.canShareProjects ?? false,
    permissions?.canWriteSyncedFiles ?? false,
    permissions?.canViewWorkspaceSettings ?? false,
    permissions?.canManageSharedResources ?? false,
  ]);
}

function createPresenceListCache(options: {
  freshMs: number;
  now: () => number;
}) {
  const entries = new Map<string, PresenceListCacheEntry>();
  const store = (key: string, entry: PresenceListCacheEntry) => {
    entries.delete(key);
    entries.set(key, entry);
    while (entries.size > MAX_PRESENCE_LIST_CACHE_ENTRIES) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      entries.delete(oldestKey);
    }
  };

  const refresh = (
    key: string,
    entry: PresenceListCacheEntry,
    fetcher: () => Promise<CollabPresenceMember[]>,
  ): Promise<CollabPresenceMember[]> => {
    const request = Promise.resolve().then(fetcher);
    entry.inflight = request;
    request.then(
      (value) => {
        if (entries.get(key) !== entry) return;
        entry.value = value;
        entry.settledAt = options.now();
        entry.inflight = null;
      },
      () => {
        if (entries.get(key) !== entry) return;
        // A failed cold read is not authority or presence evidence. A failed
        // background refresh also drops its old value after the one caller
        // that already received it, so an outage cannot display somebody as
        // online indefinitely.
        entries.delete(key);
      },
    );
    return request;
  };

  return {
    read(
      projectId: string,
      context: WorkspaceCollabContext | null,
      fetcher: () => Promise<CollabPresenceMember[]>,
    ): Promise<CollabPresenceMember[]> {
      const key = presenceListCacheKey(projectId, context);
      let entry = entries.get(key);
      if (!entry) {
        entry = {
          projectId,
          workspaceId: context?.workspaceId?.trim() ?? '',
          value: null,
          settledAt: 0,
          inflight: null,
        };
        store(key, entry);
        return refresh(key, entry, fetcher);
      }
      // Bounded LRU: a daemon that opens many historical projects must not
      // retain every short-lived roster forever.
      store(key, entry);
      if (entry.value !== null) {
        const value = entry.value;
        if (
          !entry.inflight
          && options.now() - entry.settledAt >= options.freshMs
        ) {
          // Polls never wait on a fresh Vela process once this exact viewer has
          // a value. Refresh in the background and keep concurrent callers on
          // the same process.
          void refresh(key, entry, fetcher).catch(() => undefined);
        }
        return Promise.resolve(value);
      }
      return entry.inflight ?? refresh(key, entry, fetcher);
    },

    publish(
      projectId: string,
      context: WorkspaceCollabContext | null,
      value: CollabPresenceMember[],
    ): void {
      const key = presenceListCacheKey(projectId, context);
      store(key, {
        projectId,
        workspaceId: context?.workspaceId?.trim() ?? '',
        value,
        settledAt: options.now(),
        inflight: null,
      });
    },

    invalidate(projectId: string, workspaceId?: string): void {
      const exactWorkspaceId = workspaceId?.trim();
      for (const [key, entry] of entries) {
        if (entry.projectId !== projectId) continue;
        if (exactWorkspaceId && entry.workspaceId !== exactWorkspaceId) continue;
        entries.delete(key);
      }
    },
  };
}

/**
 * The workspace-scoped presence surface of the collab transport, as this route
 * module needs it. `VelaCliCollabClient` satisfies it structurally.
 */
export interface CollabPresenceCloudTransport {
  heartbeatPresence(
    projectId: string,
    input: VelaCliPresenceHeartbeatInput,
    workspaceId: string,
  ): Promise<CollabPresenceMember[]>;
  listPresence(
    projectId: string,
    workspaceId: string,
  ): Promise<CollabPresenceMember[]>;
  leavePresence(
    projectId: string,
    input: VelaCliPresenceLeaveInput,
    workspaceId: string,
  ): Promise<CollabPresenceMember[]>;
}

/**
 * Bind a collab transport to a per-project workspace scope, producing the
 * `cloud` dependency below — or nothing when this run has no cloud transport.
 *
 * The invariant: **a `cloud` dependency exists if and only if a transport
 * exists.** Every endpoint below reads a present `cloud` as "the cloud owns
 * presence for this run" and stops consulting the process-local tracker
 * entirely. So a relay built over an absent transport is not merely useless —
 * it turns the in-process fallback into dead code and every gated presence
 * request into a 502. Returning `null` is what keeps that fallback reachable
 * for the runs that have no transport, which is every build that has not
 * opted into the vela-cli collab transport: all stable/prod packaged builds
 * and every plain `tools-dev` run.
 *
 * Callers must route through this rather than assembling an object literal of
 * arrow functions, because a literal is unconditionally truthy no matter what
 * the transport turned out to be.
 */
export function createCollabPresenceCloudClient(
  transport: CollabPresenceCloudTransport | null | undefined,
  workspaceScopeFor: (projectId: string) => string | undefined,
): CollabPresenceCloudClient | null {
  if (!transport) return null;
  const exactWorkspaceId = (
    projectId: string,
    context?: WorkspaceCollabContext | null,
  ): string => {
    const workspaceId =
      context?.workspaceId?.trim() || workspaceScopeFor(projectId)?.trim() || '';
    if (!workspaceId) {
      throw new Error('explicit workspace scope is required');
    }
    return workspaceId;
  };
  return {
    heartbeatPresence: (projectId, input, context) =>
      transport.heartbeatPresence(
        projectId,
        input,
        exactWorkspaceId(projectId, context),
      ),
    listPresence: (projectId, context) =>
      transport.listPresence(
        projectId,
        exactWorkspaceId(projectId, context),
      ),
    leavePresence: (projectId, input, context) =>
      transport.leavePresence(
        projectId,
        input,
        exactWorkspaceId(projectId, context),
      ),
  };
}

function readHeartbeat(body: unknown): {
  member: PresenceMember;
  clientId?: string;
  filePath?: string | null;
  activity?: PresenceMember['activity'];
} | null {
  const raw = (body ?? {}) as Record<string, unknown>;
  const memberId = typeof raw.memberId === 'string' ? raw.memberId.trim() : '';
  if (!memberId) return null;
  const member: PresenceMember = { memberId };
  if (typeof raw.name === 'string' && raw.name.trim()) member.name = raw.name.trim();
  if (raw.role === 'owner' || raw.role === 'admin' || raw.role === 'member') member.role = raw.role;
  if (typeof raw.avatarUrl === 'string' || raw.avatarUrl === null) member.avatarUrl = raw.avatarUrl;
  if (typeof raw.filePath === 'string' || raw.filePath === null) member.filePath = raw.filePath;
  if (raw.activity !== undefined) member.activity = raw.activity as PresenceActivity;
  const clientId = typeof raw.clientId === 'string' && raw.clientId.trim()
    ? raw.clientId.trim()
    : memberId;
  const filePath = typeof raw.filePath === 'string' || raw.filePath === null
    ? raw.filePath
    : undefined;
  return {
    member,
    clientId,
    ...(filePath !== undefined ? { filePath } : {}),
    ...(member.activity !== undefined ? { activity: member.activity } : {}),
  };
}

function readLeave(body: unknown): { memberId: string; clientId?: string } | null {
  const raw = (body ?? {}) as Record<string, unknown>;
  const memberId = typeof raw.memberId === 'string' ? raw.memberId.trim() : '';
  if (!memberId) return null;
  const clientId = typeof raw.clientId === 'string' && raw.clientId.trim()
    ? raw.clientId.trim()
    : memberId;
  return { memberId, clientId };
}

function cloudError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return res.status(502).json({ error: 'collab_presence_unavailable', message });
}

type PresenceWorkspaceVerification =
  | { ok: true; context: WorkspaceCollabContext | null }
  | Exclude<VerifiedWorkspaceRequestContextResult, { ok: true }>;

function normalizeWorkspaceVerification(
  value:
    | VerifiedWorkspaceRequestContextResult
    | WorkspaceCollabContext
    | null,
): PresenceWorkspaceVerification {
  if (value && 'ok' in value) return value;
  if (value) return { ok: true, context: value };
  // Legacy injected test adapters used null as a route-specific denial.
  // Production supplies the structured verifier result above.
  return { ok: true, context: null };
}

function sendWorkspaceVerificationFailure(
  res: Response,
  verification: Exclude<PresenceWorkspaceVerification, { ok: true }>,
) {
  return res.status(verification.status).json({
    error: verification.code,
    message: verification.message,
    ...(verification.retryable ? { retryable: true } : {}),
  });
}

/**
 * Team collaboration presence (presence) capability. Members heartbeat while viewing a
 * shared project; clients poll the present set (live cursors were cut, content
 * is polled — the spec). The set is process-local in {@link CollabRuntime}.
 */
export function registerCollabPresenceRoutes(
  app: Express,
  deps: RegisterCollabPresenceRoutesDeps,
): CollabPresenceRoutesControl {
  const { presence } = deps.collab;
  const cloud = deps.cloud ?? null;
  const presenceLists = createPresenceListCache({
    freshMs: Math.max(
      0,
      deps.presenceListCacheFreshMs ?? DEFAULT_PRESENCE_LIST_CACHE_FRESH_MS,
    ),
    now: deps.presenceListCacheNow ?? Date.now,
  });

  async function projectIsShared(
    projectId: string,
    context: WorkspaceCollabContext | null,
  ): Promise<boolean> {
    if (!deps.isProjectShared) return true;
    try {
      return await deps.isProjectShared(projectId, context);
    } catch (error) {
      return false;
    }
  }

  function cloudAuthorizesProject(projectId: string): boolean {
    if (!cloud || !deps.cloudAuthorizesProjectPresence) return false;
    try {
      return deps.cloudAuthorizesProjectPresence(projectId);
    } catch {
      return false;
    }
  }

  async function verifiedContext(
    req: Request,
    projectId: string,
    mode: 'read' | 'write',
  ): Promise<PresenceWorkspaceVerification> {
    const verify =
      mode === 'read'
        ? deps.verifyWorkspaceReadRequest ?? deps.verifyWorkspaceRequest
        : deps.verifyWorkspaceRequest;
    if (!verify) {
      return { ok: true, context: null };
    }
    try {
      return normalizeWorkspaceVerification(
        await verify(req, projectId),
      );
    } catch {
      return {
        ok: false,
        status: 503,
        code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
        message: 'workspace membership authority is temporarily unavailable',
        retryable: true,
      };
    }
  }

  app.get('/api/projects/:id/presence', async (req, res) => {
    const verification = await verifiedContext(req, req.params.id, 'read');
    if (cloud && !verification.ok) {
      return sendWorkspaceVerificationFailure(res, verification);
    }
    const context = verification.ok ? verification.context : null;
    if (cloud) {
      try {
        return res.json({
          present: await presenceLists.read(
            req.params.id,
            context,
            async () => {
              // When the upstream hub subscription cannot authoritatively
              // vouch for this Workspace, resolving the project owner is part
              // of the SAME expensive Vela read as the roster. Keeping this
              // check outside `presenceLists` made every hot GET spawn a
              // second CLI/catalog read even while the roster itself was
              // cached. Explicit share/unshare and hub invalidation drop this
              // entry, while the exact authority verification above still
              // runs before every read and fails closed on membership loss.
              if (
                !cloudAuthorizesProject(req.params.id)
                && !(await projectIsShared(req.params.id, context))
              ) {
                return [];
              }
              return cloud.listPresence(req.params.id, context);
            },
          ),
        });
      } catch (error) {
        return cloudError(res, error);
      }
    }
    if (!(await projectIsShared(req.params.id, context))) {
      return res.json({ present: [] });
    }
    res.json({ present: presence.present(req.params.id) });
  });

  app.post('/api/projects/:id/presence/heartbeat', async (req, res) => {
    const heartbeat = readHeartbeat(req.body);
    if (!heartbeat) return res.status(400).json({ error: 'memberId required' });
    const verification = await verifiedContext(req, req.params.id, 'write');
    if (cloud && !verification.ok) {
      return sendWorkspaceVerificationFailure(res, verification);
    }
    const context = verification.ok ? verification.context : null;
    if (
      cloud
      && deps.verifyWorkspaceRequest
      && (
        !verification.ok
        || !context
        || heartbeat.member.memberId !== context.workspaceMemberId
      )
    ) {
      return res.status(403).json({ error: 'WORKSPACE_PROJECT_PRESENCE_DENIED' });
    }
    if (
      !cloudAuthorizesProject(req.params.id) &&
      !(await projectIsShared(req.params.id, context))
    ) {
      if (cloud) presenceLists.publish(req.params.id, context, []);
      return res.json({ present: [] });
    }
    if (cloud) {
      try {
        const present = await cloud.heartbeatPresence(
          req.params.id,
          heartbeat,
          context,
        );
        presenceLists.publish(req.params.id, context, present);
        return res.json({
          present,
        });
      } catch (error) {
        return cloudError(res, error);
      }
    }
    presence.heartbeat(req.params.id, heartbeat.member);
    res.json({ present: presence.present(req.params.id) });
  });

  app.post('/api/projects/:id/presence/leave', async (req, res) => {
    const leave = readLeave(req.body);
    if (!leave) return res.status(400).json({ error: 'memberId required' });
    const verification = await verifiedContext(req, req.params.id, 'write');
    if (cloud && !verification.ok) {
      return sendWorkspaceVerificationFailure(res, verification);
    }
    const context = verification.ok ? verification.context : null;
    if (
      cloud
      && deps.verifyWorkspaceRequest
      && (!verification.ok || !context || leave.memberId !== context.workspaceMemberId)
    ) {
      return res.status(403).json({ error: 'WORKSPACE_PROJECT_PRESENCE_DENIED' });
    }
    if (cloud) {
      try {
        const present = await cloud.leavePresence(
          req.params.id,
          leave,
          context,
        );
        presenceLists.publish(req.params.id, context, present);
        return res.json({
          ok: true,
          present,
        });
      } catch (error) {
        return cloudError(res, error);
      }
    }
    presence.leave(req.params.id, leave.memberId);
    res.json({ ok: true, present: presence.present(req.params.id) });
  });

  return {
    invalidatePresence: (projectId, workspaceId) =>
      presenceLists.invalidate(projectId, workspaceId),
  };
}
