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
   * The configured cloud route authoritatively rejects projects outside the
   * requested workspace, so a separate remote team-project lookup is redundant.
   */
  cloudAuthorizesProjectPresence?: (projectId: string) => boolean;
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
export function registerCollabPresenceRoutes(app: Express, deps: RegisterCollabPresenceRoutesDeps): void {
  const { presence } = deps.collab;
  const cloud = deps.cloud ?? null;

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
  ): Promise<PresenceWorkspaceVerification> {
    if (!deps.verifyWorkspaceRequest) {
      return { ok: true, context: null };
    }
    try {
      return normalizeWorkspaceVerification(
        await deps.verifyWorkspaceRequest(req, projectId),
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
    const verification = await verifiedContext(req, req.params.id);
    if (cloud && !verification.ok) {
      return sendWorkspaceVerificationFailure(res, verification);
    }
    const context = verification.ok ? verification.context : null;
    if (
      !cloudAuthorizesProject(req.params.id) &&
      !(await projectIsShared(req.params.id, context))
    ) {
      return res.json({ present: [] });
    }
    if (cloud) {
      try {
        return res.json({
          present: await cloud.listPresence(req.params.id, context),
        });
      } catch (error) {
        return cloudError(res, error);
      }
    }
    res.json({ present: presence.present(req.params.id) });
  });

  app.post('/api/projects/:id/presence/heartbeat', async (req, res) => {
    const heartbeat = readHeartbeat(req.body);
    if (!heartbeat) return res.status(400).json({ error: 'memberId required' });
    const verification = await verifiedContext(req, req.params.id);
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
      return res.json({ present: [] });
    }
    if (cloud) {
      try {
        return res.json({
          present: await cloud.heartbeatPresence(
            req.params.id,
            heartbeat,
            context,
          ),
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
    const verification = await verifiedContext(req, req.params.id);
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
        return res.json({
          ok: true,
          present: await cloud.leavePresence(req.params.id, leave, context),
        });
      } catch (error) {
        return cloudError(res, error);
      }
    }
    presence.leave(req.params.id, leave.memberId);
    res.json({ ok: true, present: presence.present(req.params.id) });
  });
}
