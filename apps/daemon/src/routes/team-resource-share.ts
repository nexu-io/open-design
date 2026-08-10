import type { Express, Request, Response } from 'express';
import {
  TeamResourceAuthorityUnavailableError,
  TeamResourceShareForbiddenError,
  type TeamResourceRequestScope,
  type TeamResourceShareRecord,
  type TeamResourceShareService,
} from '../collab/team-resource-share.js';

export interface TeamResourceShareListing {
  ids: string[];
  resources: TeamResourceShareRecord[];
}

export type TeamResourceScopeResolution =
  | { ok: true; scope: TeamResourceRequestScope }
  | {
      ok: false;
      status: 400 | 403 | 503;
      code: string;
      message: string;
      retryable?: true;
    };

export interface RegisterTeamResourceShareRoutesDeps {
  /** URL segment for this resource kind: `design-systems` | `plugins` | `skills`. */
  basePath: string;
  share: TeamResourceShareService;
  /** Resolve the request's explicit Workspace against authoritative membership. */
  resolveScope: (req: Request) => Promise<TeamResourceScopeResolution>;
  /** Optional resource-owner gate applied after Workspace authority succeeds. */
  authorizeShare?: (
    resourceId: string,
    scope: TeamResourceRequestScope,
  ) => boolean | Promise<boolean>;
  /** Optional materialization hook for shared team resources. */
  syncSharedResource?: (
    resource: TeamResourceShareRecord,
    scope: TeamResourceRequestScope,
  ) => Promise<void>;
  /**
   * Optional stale-while-revalidate provider for the `/team` list. Each GET
   * otherwise hits the resource hub (and re-materializes every shared resource)
   * on the request path — slow when the workspace shell re-reads all three kinds
   * on navigation. When provided, the route serves this cached listing instead,
   * so warm reads return instantly and refresh in the background.
   *
   * When the provider also exposes `invalidate()` (see `createSwrCache` /
   * `cachedTeamResourceList` in server.ts), the share/unshare handlers below
   * call it on success so the client's immediate refetch reads the new state
   * instead of the pre-change list the cache would otherwise keep serving for
   * up to its freshMs (or the client's slower background poll once SSE lowers
   * its cadence). Best-effort and optional: a `listTeam` with no `invalidate`
   * just falls back to the old behavior of catching up on the next refresh.
   */
  listTeam?: ((scope: TeamResourceRequestScope) => Promise<TeamResourceShareListing>) & {
    invalidate?: (scope: TeamResourceRequestScope) => void;
  };
  /**
   * Local fan-out after the authoritative mutation and the list-cache
   * invalidation have both completed. Linked resources use this to invalidate
   * every projection before the success response escapes.
   */
  onMutationCommitted?: (
    resourceId: string,
    scope: TeamResourceRequestScope,
    visibility: 'personal' | 'team',
  ) => void;
}

/**
 * Team resource sharing routes for one resource kind. A member promotes a
 * personal resource into the team scope; the share service packs its directory
 * and pushes it to the resource hub so teammates can pull it. Every route first
 * verifies the request's explicit Workspace/member selector against the
 * authoritative directory. A verified request still returns `shared: false`
 * when the hub transport is not configured. Mounted once per kind (design
 * systems, plugins, skills).
 */
export function registerTeamResourceShareRoutes(
  app: Express,
  deps: RegisterTeamResourceShareRoutesDeps,
): void {
  const { basePath, share } = deps;
  const root = `/api/workspace/${basePath}`;

  // The mutation itself already succeeded by the time this runs — a cache seam
  // failing here must not turn a successful share/unshare into a reported
  // failure, so this is best-effort and swallows its own errors.
  function invalidateListTeam(scope: TeamResourceRequestScope): void {
    try {
      deps.listTeam?.invalidate?.(scope);
    } catch {
      // ignore
    }
  }

  async function resolveScope(
    req: Request,
    res: Response,
  ): Promise<TeamResourceRequestScope | null> {
    let resolution: TeamResourceScopeResolution;
    try {
      resolution = await deps.resolveScope(req);
    } catch {
      res.status(503).json({
        error: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
        message: 'workspace membership authority is temporarily unavailable',
        retryable: true,
      });
      return null;
    }
    if (resolution.ok) return resolution.scope;
    res.status(resolution.status).json({
      error: resolution.code,
      message: resolution.message,
      ...(resolution.retryable ? { retryable: true } : {}),
    });
    return null;
  }

  // Ids shared to the team — drives the "team" collection for this kind.
  app.get(`${root}/team`, async (req, res) => {
    const scope = await resolveScope(req, res);
    if (!scope) return;
    if (deps.listTeam) {
      res.json(await deps.listTeam(scope));
      return;
    }
    const resources = await share.sharedResources(scope);
    if (deps.syncSharedResource) {
      await Promise.all(resources.map((resource) => deps.syncSharedResource?.(resource, scope)));
    }
    res.json({ ids: resources.map((resource) => resource.id), resources });
  });

  // Share a personal resource to the team.
  app.post(`${root}/:id/share`, async (req, res) => {
    const id = typeof req.params.id === 'string' ? decodeURIComponent(req.params.id) : '';
    if (!id) return res.status(400).json({ error: 'invalid resource id' });
    const scope = await resolveScope(req, res);
    if (!scope) return;
    try {
      if (deps.authorizeShare && !await deps.authorizeShare(id, scope)) {
        return res.status(403).json({ error: 'WORKSPACE_RESOURCE_SHARE_DENIED' });
      }
      const result = await share.share(id, scope);
      if (!result) return res.json({ shared: false });
      // The cached `/team` listing is now stale by construction — drop it so
      // the client's immediate refetch (it fires one right after this
      // response) reads the new state instead of waiting out the cache's
      // freshMs, or worse, the client's slower background poll once SSE
      // lowers its cadence.
      invalidateListTeam(scope);
      deps.onMutationCommitted?.(id, scope, 'team');
      res.json({ shared: true, version: result.version });
    } catch (error) {
      if (error instanceof TeamResourceShareForbiddenError) {
        return res.status(403).json({ error: 'WORKSPACE_RESOURCE_SHARE_DENIED' });
      }
      res.status(500).json({ error: error instanceof Error ? error.message : 'share failed' });
    }
  });

  // Remove a resource from the team index. Vela remains the permission source of
  // truth: only the resource owner can edit/remove the shared resource.
  app.delete(`${root}/:id/share`, async (req, res) => {
    const id = typeof req.params.id === 'string' ? decodeURIComponent(req.params.id) : '';
    if (!id) return res.status(400).json({ error: 'invalid resource id' });
    const scope = await resolveScope(req, res);
    if (!scope) return;
    try {
      const unshared = await share.unshare(id, scope);
      if (unshared) {
        invalidateListTeam(scope);
        deps.onMutationCommitted?.(id, scope, 'personal');
      }
      res.json({ unshared });
    } catch (error) {
      if (error instanceof TeamResourceShareForbiddenError) {
        return res.status(403).json({ error: 'WORKSPACE_RESOURCE_UNSHARE_DENIED' });
      }
      if (error instanceof TeamResourceAuthorityUnavailableError) {
        return res.status(503).json({
          error: error.code,
          message: error.message,
          retryable: true,
        });
      }
      res.status(500).json({ error: error instanceof Error ? error.message : 'unshare failed' });
    }
  });
}
