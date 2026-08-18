import type { Express, Request, Response } from 'express';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { RouteDeps } from '../server-context.js';
import type {
  DesignSystemFileDetail,
  DesignSystemFileSummary,
  DesignSystemPackageInfo,
  DesignSystemRevision,
  DesignSystemSummary,
  UserDesignSystemInput,
} from '../design-systems/index.js';
import type { DesignTokenContractRebuildPreparation } from '../design-systems/token-contract-rebuild.js';
import { workspaceTeamDesignSystemBindingResourceId } from '../design-systems/workspace-team-binding.js';
import { teamResourceWorkspaceRoot } from '../collab/team-resource-materialization.js';
import type {
  DesignSystemGenerationJob,
  DesignSystemRevisionInput,
  DesignSystemTokenContractRebuildInput,
} from '../design-systems/generation-jobs.js';
import { deleteWorkspaceResourceByResourceId, type openDatabase } from '../db.js';
import {
  enforceVerifiedWorkspaceResourceMutation,
  enforceVerifiedWorkspaceResourceRead,
  headerValue,
  isWorkspaceResourceLocked,
  requestWithWorkspaceNavigationScope,
  resolveOptionalWorkspaceRequestAuthority,
  workspaceResourceContextFromRequest,
  type VerifyWorkspaceRequestAuthority,
  type WorkspaceResourceAccessInput,
} from '../collab/workspace-resource-mutation.js';
import type { Project, ProjectFile } from '@open-design/contracts';

type DbHandle = ReturnType<typeof openDatabase>;

type DesignSystemWorkspaceProject = {
  project: Project;
  files: ProjectFile[];
};

type AvailableDesignSystemSummary = DesignSystemSummary & {
  source?: 'built-in' | 'installed' | 'user';
};

const PACKAGED_SHOWCASE_PATH = 'system/kit.html';

export interface RegisterDesignSystemRoutesDeps extends RouteDeps<'db' | 'paths' | 'projectFiles' | 'projectStore'> {
  verifyWorkspaceRequestAuthority: VerifyWorkspaceRequestAuthority;
  workspaceResources: {
    getWorkspaceResource: (
      db: DbHandle,
      resourceType: string,
      workspaceId: string,
      resourceId: string,
    ) => WorkspaceResourceAccessInput | null | undefined;
    getWorkspaceResourceByResourceId: (
      db: DbHandle,
      resourceType: string,
      resourceId: string,
    ) => WorkspaceResourceAccessInput | null | undefined;
  };
  designSystems: {
    buildUserDesignSystemArchive: (
      root: string,
      id: string,
    ) => Promise<{ buffer: Buffer; baseName: string; title: string } | null>;
    /**
     * Whether the caller may mutate (edit / publish-toggle / delete) `id`.
     * Always true for a system the caller authored themselves. For a system
     * materialized locally from a teammate's team share, true only when the
     * caller can manage that share — the original sharer, or a workspace
     * owner/admin (see `canManageSharedResource` in
     * `collab/team-resource-share.ts`) — mirroring the "who can unshare"
     * rule exactly. Without this gate, a plain member with a synced local
     * copy could PATCH/DELETE a design system that was never theirs
     * (recvqb6mfyqXLD): the UI hides the affordances, but nothing stopped a
     * direct API call.
     *
     * `req` (spec 9.2) lets the implementation also refuse when the caller's
     * own workspace is locked/deleted (billing lapse, deletion in progress)
     * — a check design system never had, unlike project/plugin.
     */
    canMutateUserDesignSystem: (root: string, id: string, req: any) => Promise<boolean>;
    createUserDesignSystem: (
      root: string,
      input: UserDesignSystemInput,
      req: any,
    ) => Promise<DesignSystemSummary>;
    deleteUserDesignSystem: (root: string, id: string) => Promise<boolean>;
    ensureUserDesignSystemWorkspaceProject: (
      db: DbHandle,
      id: string,
      options?: {
        workspaceId?: string | null;
        workspaceMemberId?: string | null;
        exactTeam?: boolean;
      },
    ) => Promise<DesignSystemWorkspaceProject | null>;
    listAllDesignSystems: (options?: {
      workspaceId?: string | null;
      workspaceMemberId?: string | null;
      exactTeam?: boolean;
    }) => Promise<AvailableDesignSystemSummary[]>;
    listUserDesignSystemFiles: (root: string, id: string) => Promise<DesignSystemFileSummary[] | null>;
    listUserDesignSystemRevisions: (root: string, id: string) => Promise<DesignSystemRevision[] | null>;
    prepareDesignTokenContractRebuild: (root: string, id: string, options?: { force?: boolean }) => Promise<DesignTokenContractRebuildPreparation>;
    readAvailableDesignSystem: (
      id: string,
      options?: { workspaceId?: string | null; workspaceMemberId?: string | null; exactTeam?: boolean },
    ) => Promise<string | null>;
    readAvailableDesignSystemPackageInfo: (
      id: string,
      options?: { workspaceId?: string | null; workspaceMemberId?: string | null; exactTeam?: boolean },
    ) => Promise<DesignSystemPackageInfo | null>;
    readAvailableDesignSystemStaticFile: (
      id: string,
      filePath: string,
      options?: { workspaceId?: string | null; workspaceMemberId?: string | null; exactTeam?: boolean },
    ) => Promise<{
      bytes: Buffer;
      contentType: string;
      updatedAt: string;
    } | null>;
    readDesignSystemWorkspaceTextFile: (db: DbHandle, summary: AvailableDesignSystemSummary | undefined, filePath: string) => Promise<string | null>;
    readUserDesignSystemFile: (root: string, id: string, filePath: string) => Promise<DesignSystemFileDetail | null>;
    renderDesignSystemPreview: (id: string, body: string) => string;
    renderDesignSystemShowcase: (id: string, body: string) => string;
    /**
     * Physically copies the real `assets/` files out of a user design
     * system's workspace project (where an agent's Write/Edit tool calls
     * actually land) into the canonical directory — the fix for spec 04
     * §9.3 (recvqb1t4FrckM): canonical is the only directory
     * `team-resource-share` and the download archive read from, and until
     * this existed nothing ever copied a regenerated logo back into it.
     */
    syncUserDesignSystemAssetsFromWorkspace: (
      db: DbHandle,
      id: string,
      options?: {
        workspaceId?: string | null;
        workspaceMemberId?: string | null;
        exactTeam?: boolean;
      },
    ) => Promise<{ ok: true; synced: string[] } | { ok: false; reason: 'not-found' | 'no-workspace-project' }>;
    updateUserDesignSystem: (root: string, id: string, input: UserDesignSystemInput) => Promise<DesignSystemSummary | null>;
    updateUserDesignSystemRevisionStatus: (root: string, id: string, revisionId: string, status: 'accepted' | 'rejected') => Promise<DesignSystemRevision | null>;
    /**
     * spec 04 §11: unshare `id` from the team hub BEFORE the local delete
     * proceeds, but only when it is CURRENTLY on the live team share list
     * (`designSystemsTeamShare.sharedResources()` in server.ts) — never on
     * `isTeamSyncedUserDesignSystem` alone. That flag is true only on a
     * teammate's PULLED copy; the sharer deleting their OWN original always
     * reads `teamSynced: false`, which is exactly why the hub index used to
     * survive this route untouched and teammates kept seeing the deleted
     * design system. Returns whether an unshare actually ran (false when the
     * system was never shared, or team sharing isn't configured) so tests can
     * assert on the real state transition instead of a call-was-made mock.
     */
    unshareTeamDesignSystemIfShared: (id: string, req: any) => Promise<boolean>;
  };
  generationJobs: {
    get: (jobId: string) => DesignSystemGenerationJob | null;
    rebuildTokenContract: (input: DesignSystemTokenContractRebuildInput) => DesignSystemGenerationJob;
    revise: (input: DesignSystemRevisionInput) => DesignSystemGenerationJob;
    start: (
      input: UserDesignSystemInput,
      createDesignSystemForJob?: (
        root: string,
        input: UserDesignSystemInput,
      ) => Promise<DesignSystemSummary>,
    ) => DesignSystemGenerationJob;
  };
};

// Strip a brand title down to a safe download filename stem (no path
// separators, control chars, or trailing dashes; capped so the OS accepts it).
function sanitizeArchiveFilename(raw: string): string {
  return String(raw ?? '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export interface DesignSystemRouteServices {
  authorizeDesignSystemRead: (
    req: any,
    res: Response,
    id: string,
    allowNavigationQuery?: boolean,
  ) => Promise<boolean>;
  deleteDesignSystemForRequest: (
    req: Request,
    res: Response,
    id: string,
    options?: { beforeDelete?: () => Promise<boolean> },
  ) => Promise<boolean>;
}

export function registerDesignSystemRoutes(
  app: Express,
  ctx: RegisterDesignSystemRoutesDeps,
): DesignSystemRouteServices {
  const { db } = ctx;
  const { CRAFT_DIR, USER_DESIGN_SYSTEMS_DIR } = ctx.paths;
  const {
    buildUserDesignSystemArchive,
    canMutateUserDesignSystem,
    createUserDesignSystem,
    deleteUserDesignSystem,
    ensureUserDesignSystemWorkspaceProject,
    listAllDesignSystems,
    listUserDesignSystemFiles,
    listUserDesignSystemRevisions,
    prepareDesignTokenContractRebuild,
    readAvailableDesignSystem,
    readAvailableDesignSystemPackageInfo,
    readAvailableDesignSystemStaticFile,
    readDesignSystemWorkspaceTextFile,
    readUserDesignSystemFile,
    renderDesignSystemPreview,
    renderDesignSystemShowcase,
    syncUserDesignSystemAssetsFromWorkspace,
    unshareTeamDesignSystemIfShared,
    updateUserDesignSystem,
    updateUserDesignSystemRevisionStatus,
  } = ctx.designSystems;
  const designSystemGenerationJobs = ctx.generationJobs;
  const generationJobScopes = new Map<
    string,
    { workspaceId: string; workspaceMemberId: string } | null
  >();

  const getBoundDesignSystem = (
    dbHandle: unknown,
    workspaceId: string,
    resourceId: string,
  ) => ctx.workspaceResources.getWorkspaceResource(
    dbHandle as DbHandle,
    'design_system',
    workspaceId,
    resourceId,
  );
  const getDesignSystemBinding = (
    dbHandle: unknown,
    resourceId: string,
  ) => ctx.workspaceResources.getWorkspaceResourceByResourceId(
    dbHandle as DbHandle,
    'design_system',
    resourceId,
  );

  function resolveDesignSystemStorage(
    req: any,
    id: string,
    allowNavigationQuery = false,
  ): { root: string; bindingResourceId: string; exactTeam: boolean } {
    const workspaceId = (
      headerValue(req, 'x-od-workspace-id')
      ?? (allowNavigationQuery
        ? designSystemNavigationWorkspaceQuery(req)?.workspaceId
        : null)
      ?? ''
    ).trim();
    if (!workspaceId) {
      return { root: USER_DESIGN_SYSTEMS_DIR, bindingResourceId: id, exactTeam: false };
    }
    const teamBindingResourceId = workspaceTeamDesignSystemBindingResourceId(
      workspaceId,
      id,
    );
    const teamBinding = getBoundDesignSystem(db, workspaceId, teamBindingResourceId);
    return teamBinding?.visibility === 'team'
      ? {
          root: teamResourceWorkspaceRoot(USER_DESIGN_SYSTEMS_DIR, workspaceId),
          bindingResourceId: teamBindingResourceId,
          exactTeam: true,
        }
      : { root: USER_DESIGN_SYSTEMS_DIR, bindingResourceId: id, exactTeam: false };
  }

  async function authorizeDesignSystemRead(
    req: any,
    res: Response,
    id: string,
    allowNavigationQuery = false,
  ): Promise<boolean> {
    const scopedRequest = allowNavigationQuery
      ? requestWithWorkspaceNavigationScope(req)
      : req;
    if (scopedRequest === 'conflict') {
      res.status(400).json({
        error: 'WORKSPACE_CONTEXT_CONFLICT',
        message: 'workspace header and navigation scope must match',
      });
      return false;
    }
    const resolution = await resolveOptionalWorkspaceRequestAuthority(
      scopedRequest,
      ctx.verifyWorkspaceRequestAuthority,
    );
    if (!resolution.ok) {
      res.status(resolution.status).json({
        error: resolution.code,
        message: resolution.message,
        ...(resolution.retryable ? { retryable: true } : {}),
      });
      return false;
    }
    let bindingResourceId = id;
    let binding = getDesignSystemBinding(db, id);
    if (resolution.context) {
      const teamBindingResourceId = workspaceTeamDesignSystemBindingResourceId(
        resolution.context.workspaceId,
        id,
      );
      const teamBinding = getBoundDesignSystem(
        db,
        resolution.context.workspaceId,
        teamBindingResourceId,
      );
      const personalBinding = getBoundDesignSystem(
        db,
        resolution.context.workspaceId,
        id,
      );
      if (teamBinding?.visibility === 'team') {
        bindingResourceId = teamBindingResourceId;
        binding = teamBinding;
      } else {
        binding = personalBinding;
      }
    }
    const isPublicBuiltIn = resolution.context && !binding
      ? (await listAllDesignSystems({
          workspaceId: resolution.context.workspaceId,
        })).some((system) => system.id === id && system.source === 'built-in')
      : false;
    // Explicit Workspace requests never inherit ownerless legacy resources.
    // A Personal design system is private to its exact persisted creator even
    // when the caller is an owner/admin in the same Workspace. Team resources
    // remain readable by every verified active member through the shared gate.
    if (resolution.context && (
      (!binding && !isPublicBuiltIn)
      || (
        binding
        && binding.visibility !== 'team'
        && binding.createdByWorkspaceMemberId !== resolution.context.workspaceMemberId
      )
    )) {
      res.status(403).json({
        error: 'WORKSPACE_DESIGN_SYSTEM_PERMISSION_DENIED',
        message: 'workspace design_system read is not allowed',
      });
      return false;
    }
    if (binding && !resolution.context) {
      res.status(400).json({
        error: 'WORKSPACE_CONTEXT_REQUIRED',
        message: 'an explicit workspace context is required',
      });
      return false;
    }
    return enforceVerifiedWorkspaceResourceRead(
      'design_system',
      req,
      res,
      (_res, status, code, message, details) =>
        res.status(status).json({ error: code, message, ...details }),
      getBoundDesignSystem,
      getDesignSystemBinding,
      db,
      bindingResourceId,
      resolution.context
        ? async () => ({ ok: true as const, context: resolution.context! })
        : ctx.verifyWorkspaceRequestAuthority,
      { allowNavigationQuery },
    );
  }

  async function authorizeDesignSystemMutation(
    req: any,
    res: Response,
    id: string,
  ): Promise<boolean> {
    const resolution = await resolveOptionalWorkspaceRequestAuthority(
      req,
      ctx.verifyWorkspaceRequestAuthority,
    );
    if (!resolution.ok) {
      res.status(resolution.status).json({
        error: resolution.code,
        message: resolution.message,
        ...(resolution.retryable ? { retryable: true } : {}),
      });
      return false;
    }
    let bindingResourceId = id;
    let binding = getDesignSystemBinding(db, id);
    if (resolution.context) {
      const teamBindingResourceId = workspaceTeamDesignSystemBindingResourceId(
        resolution.context.workspaceId,
        id,
      );
      const teamBinding = getBoundDesignSystem(
        db,
        resolution.context.workspaceId,
        teamBindingResourceId,
      );
      const personalBinding = getBoundDesignSystem(
        db,
        resolution.context.workspaceId,
        id,
      );
      if (teamBinding?.visibility === 'team') {
        bindingResourceId = teamBindingResourceId;
        binding = teamBinding;
      } else {
        binding = personalBinding;
      }
    }
    if (resolution.context && (
      !binding
      || (
        binding.visibility !== 'team'
        && binding.createdByWorkspaceMemberId !== resolution.context.workspaceMemberId
      )
    )) {
      res.status(403).json({
        error: 'WORKSPACE_DESIGN_SYSTEM_PERMISSION_DENIED',
        message: 'workspace design_system mutation is not allowed',
      });
      return false;
    }
    if (binding && !resolution.context) {
      res.status(400).json({
        error: 'WORKSPACE_CONTEXT_REQUIRED',
        message: 'an explicit workspace context is required',
      });
      return false;
    }
    return enforceVerifiedWorkspaceResourceMutation(
      'design_system',
      req,
      res,
      (_res, status, code, message) =>
        res.status(status).json({ error: code, message }),
      getBoundDesignSystem,
      getDesignSystemBinding,
      db,
      bindingResourceId,
      'writeFiles',
      resolution.context
        ? async () => ({ ok: true as const, context: resolution.context! })
        : ctx.verifyWorkspaceRequestAuthority,
    );
  }

  async function resolveGenerationJobScope(
    req: any,
    res: Response,
  ): Promise<{ workspaceId: string; workspaceMemberId: string } | null | 'denied'> {
    const resolution = await resolveOptionalWorkspaceRequestAuthority(
      req,
      ctx.verifyWorkspaceRequestAuthority,
    );
    if (!resolution.ok) {
      res.status(resolution.status).json({
        error: resolution.code,
        message: resolution.message,
        ...(resolution.retryable ? { retryable: true } : {}),
      });
      return 'denied';
    }
    return resolution.context
      ? {
          workspaceId: resolution.context.workspaceId,
          workspaceMemberId: resolution.context.workspaceMemberId,
        }
      : null;
  }

  async function authorizeGenerationJobRead(
    req: any,
    res: Response,
    job: DesignSystemGenerationJob,
  ): Promise<boolean> {
    const scope = generationJobScopes.get(job.id);
    if (scope) {
      const resolution = await resolveGenerationJobScope(req, res);
      if (resolution === 'denied') return false;
      if (
        !resolution
        || resolution.workspaceId !== scope.workspaceId
        || resolution.workspaceMemberId !== scope.workspaceMemberId
      ) {
        res.status(403).json({ error: 'WORKSPACE_DESIGN_SYSTEM_PERMISSION_DENIED' });
        return false;
      }
      return true;
    }
    return job.designSystemId
      ? authorizeDesignSystemRead(req, res, job.designSystemId)
      : true;
  }

  // Workspace-lock gate (spec 9.2), unconditional and independent of
  // `canMutateUserDesignSystem`'s own teamSynced/canUnshare verdict — a
  // locked/deleted workspace (billing lapse, deletion in progress) must
  // refuse every PATCH/DELETE regardless of who the caller is, the same
  // guarantee `enforceWorkspaceResourceMutation` gives project/plugin/skill.
  // Reuses that module's own `workspaceResourceContextFromRequest`/
  // `isWorkspaceResourceLocked` rather than re-deriving the header contract
  // here. Checked at the route rather than folded silently into
  // `canMutateUserDesignSystem`'s boolean so it applies no matter what a
  // caller-supplied implementation of that hook decides.
  function isRequestWorkspaceLocked(req: any): boolean {
    const requestCtx = workspaceResourceContextFromRequest(req);
    return Boolean(requestCtx && requestCtx !== 'missing' && isWorkspaceResourceLocked(requestCtx));
  }

  function sendWorkspaceScopeError(res: Response, error: unknown): boolean {
    if (
      !error ||
      typeof error !== 'object' ||
      !('status' in error) ||
      (error.status !== 400 && error.status !== 403 && error.status !== 503) ||
      !('code' in error) ||
      typeof error.code !== 'string'
    ) {
      return false;
    }
    res.status(error.status).json({
      error: error.code,
      message: error instanceof Error ? error.message : String(error.code),
      ...('retryable' in error && error.retryable === true ? { retryable: true } : {}),
    });
    return true;
  }

  app.post('/api/design-systems', async (req, res) => {
    try {
      const created = await createUserDesignSystem(
        USER_DESIGN_SYSTEMS_DIR,
        req.body || {},
        req,
      );
      res.status(201).json({ ...created as object, designSystem: created });
    } catch (err) {
      if (sendWorkspaceScopeError(res, err)) return;
      res.status(400).json({ error: String(err) });
    }
  });

  app.post('/api/design-systems/generation-jobs', async (req, res) => {
    try {
      const scope = await resolveGenerationJobScope(req, res);
      if (scope === 'denied') return;
      const job = designSystemGenerationJobs.start(
        req.body || {},
        (root, input) => createUserDesignSystem(root, input, req),
      );
      generationJobScopes.set(job.id, scope);
      res.status(202).json({ job });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.get('/api/design-systems/generation-jobs/:jobId', async (req, res) => {
    try {
      const job = designSystemGenerationJobs.get(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: 'design system generation job not found' });
      }
      if (!(await authorizeGenerationJobRead(req, res, job))) return;
      res.json({ job });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/design-systems/:id/revision-jobs', async (req, res) => {
    try {
      if (!(await authorizeDesignSystemMutation(req, res, req.params.id))) return;
      const scope = await resolveGenerationJobScope(req, res);
      if (scope === 'denied') return;
      const storage = resolveDesignSystemStorage(req, req.params.id);
      const feedback = typeof req.body?.feedback === 'string' ? req.body.feedback : '';
      if (!feedback.trim()) return res.status(400).json({ error: 'feedback is required' });
      const job = designSystemGenerationJobs.revise({
        root: storage.root,
        designSystemId: req.params.id,
        feedback,
        sectionTitle: typeof req.body?.sectionTitle === 'string' ? req.body.sectionTitle : undefined,
        body: typeof req.body?.body === 'string' ? req.body.body : undefined,
      });
      generationJobScopes.set(job.id, scope);
      res.status(202).json({ job });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.post('/api/design-systems/:id/token-contract/rebuild-jobs', async (req, res) => {
    try {
      if (!(await authorizeDesignSystemMutation(req, res, req.params.id))) return;
      const scope = await resolveGenerationJobScope(req, res);
      if (scope === 'denied') return;
      const storage = resolveDesignSystemStorage(req, req.params.id);
      const preparation = await prepareDesignTokenContractRebuild(
        storage.root,
        req.params.id,
        { force: req.body?.force === true },
      );
      if (!preparation.decision.available) {
        return res.status(200).json({ decision: preparation.decision });
      }
      if (!preparation.revision) {
        return res.status(200).json({ decision: preparation.decision });
      }
      const job = designSystemGenerationJobs.rebuildTokenContract({
        root: storage.root,
        designSystemId: req.params.id,
        decision: preparation.decision,
        ...preparation.revision,
      });
      generationJobScopes.set(job.id, scope);
      res.status(202).json({ decision: preparation.decision, job });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.get('/api/design-systems/:id/revisions', async (req, res) => {
    try {
      if (!(await authorizeDesignSystemRead(req, res, req.params.id))) return;
      const storage = resolveDesignSystemStorage(req, req.params.id);
      const revisions = await listUserDesignSystemRevisions(
        storage.root,
        req.params.id,
      );
      if (!revisions) {
        return res.status(404).json({ error: 'editable design system not found' });
      }
      res.json({ revisions });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.patch('/api/design-systems/:id/revisions/:revisionId', async (req, res) => {
    try {
      if (!(await authorizeDesignSystemMutation(req, res, req.params.id))) return;
      // recvqb6mfyqXLD: accepting a revision commits its proposed body onto
      // the canonical design system — the same "edit" this route family
      // gates everywhere else (PATCH/DELETE/sync-assets above). Without this,
      // a plain member viewing a teammate's team-synced design system could
      // accept/reject its pending revision (surfaced to anyone who can read
      // the system, not just the owner) with no server-side check at all,
      // even after the UI stopped showing it as editable.
      if (isRequestWorkspaceLocked(req)) {
        return res.status(403).json({ error: 'WORKSPACE_LOCKED' });
      }
      const storage = resolveDesignSystemStorage(req, req.params.id);
      if (!(await canMutateUserDesignSystem(storage.root, req.params.id, req))) {
        return res.status(403).json({ error: 'WORKSPACE_RESOURCE_MANAGE_DENIED' });
      }
      const status = typeof req.body?.status === 'string' ? req.body.status : '';
      if (status !== 'accepted' && status !== 'rejected') {
        return res.status(400).json({ error: 'status must be accepted or rejected' });
      }
      const revision = await updateUserDesignSystemRevisionStatus(
        storage.root,
        req.params.id,
        req.params.revisionId,
        status,
      );
      if (!revision) {
        return res.status(404).json({ error: 'design system revision not found' });
      }
      res.json({ revision });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.get('/api/design-systems/:id', async (req, res) => {
    try {
      if (!(await authorizeDesignSystemRead(req, res, req.params.id))) return;
      const workspaceId = headerValue(req, 'x-od-workspace-id');
      const workspaceMemberId = headerValue(req, 'x-od-workspace-member-id');
      const storage = resolveDesignSystemStorage(req, req.params.id);
      const systems = await listAllDesignSystems({
        workspaceId,
        workspaceMemberId,
        exactTeam: storage.exactTeam,
      });
      const summary = systems.find((s) => s.id === req.params.id);
      const projectBody = await readDesignSystemWorkspaceTextFile(db, summary, 'DESIGN.md');
      const body = projectBody ?? await readAvailableDesignSystem(req.params.id, {
        workspaceId,
        workspaceMemberId,
        exactTeam: storage.exactTeam,
      });
      if (body === null || !summary) {
        return res.status(404).json({ error: 'design system not found' });
      }
      const packageInfo = await readAvailableDesignSystemPackageInfo(req.params.id, {
        workspaceId,
        workspaceMemberId,
        exactTeam: storage.exactTeam,
      });
      // recvqb6mfyqXLD: mirror the exact PATCH/DELETE verdict onto the read
      // path too. `DesignSystemsTab` already re-derives an equivalent verdict
      // from the separate `/team` share listing for its own list+detail pane,
      // but a design system reached any other way — e.g. the direct
      // `/design-systems/:id` route the Library's "Open design system" link
      // and `LibrarySection` navigate to, which renders `DesignSystemFlow`
      // directly — had no ownership signal at all and fell back to treating
      // any non-built-in system as fully editable. Computing it once here,
      // from the same `canMutateUserDesignSystem` the mutation routes below
      // already gate on, means every detail surface can hide/disable its
      // Publish toggle and Save button on the same authority the backend
      // enforces, instead of each surface re-deriving (or forgetting to
      // derive) its own verdict.
      const canMutate = await canMutateUserDesignSystem(storage.root, req.params.id, req);
      const detail = { ...summary, body, canMutate, ...(packageInfo ? { packageInfo } : {}) };
      res.json({ ...detail, designSystem: detail });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/design-systems/:id/preview', async (req, res) => {
    try {
      if (!(await authorizeDesignSystemRead(req, res, req.params.id, true))) return;
      const workspaceId =
        headerValue(req, 'x-od-workspace-id')
        ?? designSystemNavigationWorkspaceQuery(req)?.workspaceId
        ?? null;
      const workspaceMemberId =
        headerValue(req, 'x-od-workspace-member-id')
        ?? designSystemNavigationWorkspaceQuery(req)?.workspaceMemberId
        ?? null;
      const storage = resolveDesignSystemStorage(req, req.params.id, true);
      const body = await readAvailableDesignSystem(req.params.id, {
        workspaceId,
        workspaceMemberId,
        exactTeam: storage.exactTeam,
      });
      if (body === null) return res.status(404).type('text/plain').send('not found');
      const html = renderDesignSystemPreview(req.params.id, body);
      res.type('text/html').send(html);
    } catch (err) {
      res.status(500).type('text/plain').send(String(err));
    }
  });

  app.get('/api/design-systems/:id/showcase', async (req, res) => {
    try {
      if (!(await authorizeDesignSystemRead(req, res, req.params.id, true))) return;
      const workspaceId =
        headerValue(req, 'x-od-workspace-id')
        ?? designSystemNavigationWorkspaceQuery(req)?.workspaceId
        ?? null;
      const workspaceMemberId =
        headerValue(req, 'x-od-workspace-member-id')
        ?? designSystemNavigationWorkspaceQuery(req)?.workspaceMemberId
        ?? null;
      const storage = resolveDesignSystemStorage(req, req.params.id, true);
      const packaged = await readAvailableDesignSystemStaticFile(
        req.params.id,
        PACKAGED_SHOWCASE_PATH,
        { workspaceId, workspaceMemberId, exactTeam: storage.exactTeam },
      );
      if (packaged?.contentType.startsWith('text/html')) {
        const workspaceQuery = designSystemNavigationWorkspaceQuery(req);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Last-Modified', packaged.updatedAt);
        return res.type('text/html').send(
          rewriteDesignSystemShowcaseAssetUrls(
            packaged.bytes.toString('utf8'),
            req.params.id,
            path.posix.dirname(PACKAGED_SHOWCASE_PATH),
            workspaceQuery,
          ),
        );
      }
      const body = await readAvailableDesignSystem(req.params.id, {
        workspaceId,
        workspaceMemberId,
        exactTeam: storage.exactTeam,
      });
      if (body === null) return res.status(404).type('text/plain').send('not found');
      const html = renderDesignSystemShowcase(req.params.id, body);
      res.type('text/html').send(html);
    } catch (err) {
      res.status(500).type('text/plain').send(String(err));
    }
  });

  app.get('/api/design-systems/:id/static', async (req, res) => {
    try {
      if (!(await authorizeDesignSystemRead(req, res, req.params.id, true))) return;
      const workspaceId =
        headerValue(req, 'x-od-workspace-id')
        ?? designSystemNavigationWorkspaceQuery(req)?.workspaceId
        ?? null;
      const workspaceMemberId =
        headerValue(req, 'x-od-workspace-member-id')
        ?? designSystemNavigationWorkspaceQuery(req)?.workspaceMemberId
        ?? null;
      const storage = resolveDesignSystemStorage(req, req.params.id, true);
      const requestedPath = typeof req.query.path === 'string' ? req.query.path : '';
      const file = await readAvailableDesignSystemStaticFile(
        req.params.id,
        requestedPath,
        { workspaceId, workspaceMemberId, exactTeam: storage.exactTeam },
      );
      if (!file) return res.status(404).type('text/plain').send('not found');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Last-Modified', file.updatedAt);
      res.type(file.contentType).send(file.bytes);
    } catch (err) {
      res.status(500).type('text/plain').send(String(err));
    }
  });

  app.post('/api/design-systems/:id/workspace', async (req, res) => {
    try {
      if (!(await authorizeDesignSystemMutation(req, res, req.params.id))) return;
      const workspaceId = headerValue(req, 'x-od-workspace-id');
      const workspaceMemberId = headerValue(req, 'x-od-workspace-member-id');
      const storage = resolveDesignSystemStorage(req, req.params.id);
      const workspace = await ensureUserDesignSystemWorkspaceProject(
        db,
        req.params.id,
        workspaceId || workspaceMemberId
          ? { workspaceId, workspaceMemberId, exactTeam: storage.exactTeam }
          : undefined,
      );
      if (!workspace) {
        return res.status(404).json({ error: 'editable design system not found' });
      }
      res.status(201).json(workspace);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.get('/api/design-systems/:id/files', async (req, res) => {
    try {
      if (!(await authorizeDesignSystemRead(req, res, req.params.id))) return;
      const storage = resolveDesignSystemStorage(req, req.params.id);
      const files = await listUserDesignSystemFiles(storage.root, req.params.id);
      if (!files) {
        return res.status(404).json({ error: 'editable design system not found' });
      }
      res.json({ files });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/design-systems/:id/file', async (req, res) => {
    try {
      if (!(await authorizeDesignSystemRead(req, res, req.params.id, true))) return;
      const storage = resolveDesignSystemStorage(req, req.params.id, true);
      const requestedPath = typeof req.query.path === 'string' ? req.query.path : '';
      const file = await readUserDesignSystemFile(
        storage.root,
        req.params.id,
        requestedPath,
      );
      if (!file) return res.status(404).json({ error: 'design system file not found' });
      res.json({ file });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Streams a .zip of the whole user design system directory plus a generated
  // SKILLS.md usage guide, so the "Download brand" action (and `od
  // design-systems download`) hand the recipient a self-contained, shareable
  // brand package. Only user systems have an editable dir; presets resolve to
  // null and surface as 404.
  app.get('/api/design-systems/:id/archive', async (req, res) => {
    try {
      if (!(await authorizeDesignSystemRead(req, res, req.params.id, true))) return;
      const storage = resolveDesignSystemStorage(req, req.params.id, true);
      const archive = await buildUserDesignSystemArchive(storage.root, req.params.id);
      if (!archive) {
        return res.status(404).json({ error: 'downloadable design system not found' });
      }
      const fileSlug = sanitizeArchiveFilename(archive.baseName) || 'design-system';
      const filename = `${fileSlug}.zip`;
      // RFC 5987: ASCII `filename=` fallback plus UTF-8 `filename*=` so brand
      // names with non-ASCII characters (CJK, accents) download without mojibake.
      const asciiFallback =
        filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '_') || 'design-system.zip';
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      res.send(archive.buffer);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.patch('/api/design-systems/:id', async (req, res) => {
    try {
      if (!(await authorizeDesignSystemMutation(req, res, req.params.id))) return;
      if (isRequestWorkspaceLocked(req)) {
        return res.status(403).json({ error: 'WORKSPACE_LOCKED' });
      }
      const storage = resolveDesignSystemStorage(req, req.params.id);
      if (!(await canMutateUserDesignSystem(storage.root, req.params.id, req))) {
        return res.status(403).json({ error: 'WORKSPACE_RESOURCE_MANAGE_DENIED' });
      }
      const updated = await updateUserDesignSystem(
        storage.root,
        req.params.id,
        req.body || {},
      );
      if (!updated) {
        return res.status(404).json({ error: 'editable design system not found' });
      }
      res.json({ ...updated as object, designSystem: updated });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // Asset sync (spec 04 §9.3, recvqb1t4FrckM): a signal-only endpoint — the
  // browser never uploads file bytes here. The daemon locates the design
  // system's workspace project itself (same lookup
  // `ensureUserDesignSystemWorkspaceProject` uses) and copies real files
  // under that project's `assets/` directory into the canonical design
  // system directory, entirely on the daemon side of the data-directory
  // boundary. Gated the same way as PATCH/DELETE: a locked workspace or a
  // caller who cannot manage the (possibly team-synced) design system may
  // not trigger a write to canonical.
  app.post('/api/design-systems/:id/sync-assets', async (req, res) => {
    try {
      if (!(await authorizeDesignSystemMutation(req, res, req.params.id))) return;
      if (isRequestWorkspaceLocked(req)) {
        return res.status(403).json({ error: 'WORKSPACE_LOCKED' });
      }
      const storage = resolveDesignSystemStorage(req, req.params.id);
      if (!(await canMutateUserDesignSystem(storage.root, req.params.id, req))) {
        return res.status(403).json({ error: 'WORKSPACE_RESOURCE_MANAGE_DENIED' });
      }
      const workspaceId = headerValue(req, 'x-od-workspace-id');
      const workspaceMemberId = headerValue(req, 'x-od-workspace-member-id');
      const outcome = await syncUserDesignSystemAssetsFromWorkspace(
        db,
        req.params.id,
        workspaceId || workspaceMemberId
          ? { workspaceId, workspaceMemberId, exactTeam: storage.exactTeam }
          : undefined,
      );
      if (!outcome.ok) {
        if (outcome.reason === 'not-found') {
          return res.status(404).json({ error: 'editable design system not found' });
        }
        // No workspace project to sync from yet — a benign no-op, not an
        // error; the trigger sites call this speculatively on every asset
        // write and run-end.
        return res.json({ synced: [] });
      }
      res.json({ synced: outcome.synced });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  async function deleteDesignSystemForRequest(
    req: Request,
    res: Response,
    id: string,
    options: { beforeDelete?: () => Promise<boolean> } = {},
  ): Promise<boolean> {
    try {
      if (!(await authorizeDesignSystemMutation(req, res, id))) return false;
      if (isRequestWorkspaceLocked(req)) {
        res.status(403).json({ error: 'WORKSPACE_LOCKED' });
        return false;
      }
      const storage = resolveDesignSystemStorage(req, id);
      if (!(await canMutateUserDesignSystem(storage.root, id, req))) {
        res.status(403).json({ error: 'WORKSPACE_RESOURCE_MANAGE_DENIED' });
        return false;
      }
      if (options.beforeDelete && !(await options.beforeDelete())) return false;
      // spec 04 §11: drop the hub-side share BEFORE the local delete, so a
      // sharer deleting their OWN design system does not leave the hub index
      // pointing at a canonical directory that is about to stop existing —
      // otherwise `syncSharedTeamDesignSystem` (server.ts) keeps re-stamping
      // `markTeamSynced()` onto every teammate's already-synced local copy
      // forever, because the hub still reports the resource as shared. A
      // thrown error here (e.g. the caller cannot actually manage the share)
      // aborts before `deleteUserDesignSystem` runs, matching "unshare must
      // succeed before the local delete proceeds".
      await unshareTeamDesignSystemIfShared(id, req);
      const ok = await deleteUserDesignSystem(storage.root, id);
      if (!ok) {
        res.status(404).json({ error: 'editable design system not found' });
        return false;
      }
      // Envelope cleanup (spec 9.2): drop the `workspace_resources` binding
      // row too, mirroring skill's DELETE route (routes/static-resource.ts)
      // and plugin uninstall (plugins/installer.ts) — the generic table has
      // no ON DELETE CASCADE, so skipping this leaves an orphan row pointing
      // at a design system that no longer exists on disk.
      deleteWorkspaceResourceByResourceId(db, 'design_system', storage.bindingResourceId);
      return true;
    } catch (err) {
      if (sendWorkspaceScopeError(res, err)) return false;
      res.status(500).json({ error: String(err) });
      return false;
    }
  }

  app.delete('/api/design-systems/:id', async (req, res) => {
    if (!(await deleteDesignSystemForRequest(req, res, req.params.id))) return;
    res.status(204).end();
  });

  app.get('/api/craft', async (_req, res) => {
    try {
      let entries;
      try {
        entries = await fsp.readdir(CRAFT_DIR, { withFileTypes: true });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return res.json({ craft: [] });
        }
        throw err;
      }
      const out = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const slug = entry.name.replace(/\.md$/, '');
        try {
          const fullPath = `${CRAFT_DIR}/${entry.name}`;
          const text = await fsp.readFile(fullPath, 'utf8');
          const heading = text.split('\n').find((line) => line.startsWith('# '));
          out.push({
            id: slug,
            label: heading ? heading.replace(/^#+\s*/, '').trim() : slug,
            bytes: Buffer.byteLength(text, 'utf8'),
          });
        } catch {
          // Skip unreadable files; surface what we can.
        }
      }
      res.json({ craft: out });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/craft/:id', async (req, res) => {
    try {
      const slug = req.params.id;
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
        return res.status(400).json({ error: 'invalid craft id' });
      }
      try {
        const text = await fsp.readFile(`${CRAFT_DIR}/${slug}.md`, 'utf8');
        res.json({ id: slug, body: text });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return res.status(404).json({ error: 'craft section not found' });
        }
        throw err;
      }
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return { authorizeDesignSystemRead, deleteDesignSystemForRequest };
}

export function rewriteDesignSystemShowcaseAssetUrls(
  html: string,
  designSystemId: string,
  baseDir: string,
  workspaceQuery?: { workspaceId: string; workspaceMemberId: string } | null,
): string {
  if (!html) return html;
  return html
    .replace(/\b(src|href)=(["'])([^"']+)\2/gi, (match, attr: string, quote: string, raw: string) => {
      const rewritten = rewriteDesignSystemShowcaseAssetUrl(
        raw,
        designSystemId,
        baseDir,
        workspaceQuery,
      );
      return rewritten === raw ? match : `${attr}=${quote}${rewritten}${quote}`;
    })
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (match, quote: string, raw: string) => {
      const rewritten = rewriteDesignSystemShowcaseAssetUrl(
        raw,
        designSystemId,
        baseDir,
        workspaceQuery,
      );
      return rewritten === raw ? match : `url(${quote}${rewritten}${quote})`;
    });
}

function rewriteDesignSystemShowcaseAssetUrl(
  rawUrl: string,
  designSystemId: string,
  baseDir: string,
  workspaceQuery?: { workspaceId: string; workspaceMemberId: string } | null,
): string {
  const value = rawUrl.trim();
  if (
    value.length === 0
    || value.startsWith('#')
    || value.startsWith('/')
    || /^[a-z][a-z0-9+.-]*:/i.test(value)
  ) {
    return rawUrl;
  }

  const match = /^([^?#]+)([?#].*)?$/.exec(value);
  if (!match) return rawUrl;
  const [, rawPath, suffix = ''] = match;
  if (!rawPath) return rawUrl;
  const relativePath = path.posix.normalize(path.posix.join(baseDir, rawPath));
  if (
    relativePath === '.'
    || relativePath.startsWith('../')
    || path.posix.isAbsolute(relativePath)
  ) {
    return rawUrl;
  }

  const staticUrl =
    `/api/design-systems/${encodeURIComponent(designSystemId)}/static`
    + `?path=${encodeURIComponent(relativePath)}`
    + (workspaceQuery
      ? `&workspaceId=${encodeURIComponent(workspaceQuery.workspaceId)}`
        + `&workspaceMemberId=${encodeURIComponent(workspaceQuery.workspaceMemberId)}`
      : '');
  if (suffix.startsWith('?')) return `${staticUrl}&${suffix.slice(1)}`;
  return `${staticUrl}${suffix}`;
}

function designSystemNavigationWorkspaceQuery(
  req: any,
): { workspaceId: string; workspaceMemberId: string } | null {
  const workspaceId =
    typeof req.query?.workspaceId === 'string' ? req.query.workspaceId.trim() : '';
  const workspaceMemberId =
    typeof req.query?.workspaceMemberId === 'string'
      ? req.query.workspaceMemberId.trim()
      : '';
  return workspaceId && workspaceMemberId
    ? { workspaceId, workspaceMemberId }
    : null;
}
