import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import type {
  InstalledPluginRecord,
  PluginDuplicateProjectRequest,
  PluginDuplicateProjectResponse,
  Project,
  ProjectMetadata,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import { TeamResourceCopyForbiddenError } from '@open-design/contracts';
import {
  duplicatePluginExampleIntoProject,
  PluginDuplicateProjectError,
} from '../../plugins/duplicate-project.js';
import {
  enforceTeamResourceCopyAllowed,
  type TeamResourceStateProvider,
} from '../../collab/team-resource-state.js';
import {
  enforceVerifiedWorkspaceResourceMutation,
  resolveOptionalWorkspaceRequestAuthority,
  type VerifyWorkspaceRequestAuthority,
} from '../../collab/workspace-resource-mutation.js';
import {
  authorizeCreatedProjectWorkspace,
  bindCreatedProjectToWorkspace,
  sendCreatedProjectWorkspaceError,
} from '../../collab/created-project-workspace.js';
import type { WorkspaceDirectoryFetchResult } from '../../collab/vela-workspace-context.js';
import type { PluginShareAction } from '../../services/plugin-share-tasks.js';
import type { AuthorizeProjectRequest } from '../../collab/project-request-authority.js';
import { workspaceTeamPluginBindingResourceId } from '../../plugins/registry.js';

export interface RegisterPluginEventRoutesDeps {
  http: {
    requireLocalDaemonRequest: RequestHandler;
    sendApiError: (res: Response, status: number, code: string, message: string) => unknown;
  };
  verifyWorkspaceRequestAuthority?: VerifyWorkspaceRequestAuthority;
  plugins: {
    listVisiblePluginIds(
      workspaceId: string | null,
      workspaceMemberId: string | null,
    ): Promise<ReadonlySet<string>>;
  };
}

interface SqliteRowId {
  id: string;
}

interface SqliteDbLike {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
  transaction<T>(run: () => T): () => T;
}

interface InstalledPluginLike {
  id?: string;
  title?: string;
  manifest?: Record<string, unknown>;
  fsPath?: string;
  capabilitiesGranted?: string[];
  appliedPlugin?: { capabilitiesGranted?: string[]; [key: string]: unknown };
  assistantMessageId?: string;
  [key: string]: unknown;
}

interface AppliedPluginSnapshotLike {
  snapshotId: string;
  pluginId: string;
  [key: string]: unknown;
}

interface WorkspaceProjectBindingRow {
  workspaceId?: string | null;
  visibility?: string | null;
  resourceState?: string | null;
  createdByWorkspaceMemberId?: string | null;
}

// The narrow slice of a `workspace_resources` row the mutation gate needs —
// see collab/workspace-resource-mutation.ts's `WorkspaceResourceAccessInput`,
// which this mirrors so `enforceWorkspaceResourceMutation` accepts it as-is.
interface WorkspaceResourceBindingRow {
  visibility?: string | null;
  resourceState?: string | null;
  createdByWorkspaceMemberId?: string | null;
}

interface MissingInputErrorLike extends Error {
  fields: string[];
}

interface PluginApplyResult {
  result: {
    capabilitiesGranted: string[];
    appliedPlugin: { capabilitiesGranted: string[]; [key: string]: unknown };
    [key: string]: unknown;
  };
  warnings: unknown[];
  manifestSourceDigest?: string;
}

interface PluginShareTaskLike {
  projectId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: string[];
  waiters: Set<() => void>;
}

interface PluginRouteHelpers {
  PLUGIN_PREVIEWS_DIR: string;
  pluginUpload: {
    single(field: string): RequestHandler;
    array(field: string, maxCount?: number): RequestHandler;
  };
  pluginInstallation: {
    stageUploadedPluginZip(buffer: Buffer, source: string): Promise<unknown>;
    stageUploadedPluginFolder(files: Array<{ buffer: Buffer; originalname: string }>, rawPaths: unknown): Promise<unknown>;
  };
  connectorService: unknown;
  resolvedPortRef: { current: number | null | undefined };
  pluginShareTaskStore: {
    get(id: string): PluginShareTaskLike | null;
    snapshot(task: PluginShareTaskLike, since?: number): unknown;
  };
  applyBakedPreviews(plugins: InstalledPluginLike[], previewsDir: string): unknown;
  assembleExample(templateHtml: string, slidesHtml: string, title: string): string;
  sendMulterError(res: Response, err: unknown): unknown;
  decodeMultipartFilename(name: string): string;
  installOrUpgradePlugin(
    req: Request,
    res: Response,
    mode: 'install' | 'upgrade',
    authority: WorkspaceCollabContext | null,
  ): Promise<unknown>;
  loadPluginRegistryView(options?: {
    workspaceId?: string | null;
    workspaceMemberId?: string | null;
  }): Promise<unknown>;
  buildConnectorProbe(service: unknown): unknown;
  handleShareProject(
    req: Request,
    res: Response,
    sourcePlugin: InstalledPluginLike,
  ): Promise<unknown>;
  handlePluginTrust(
    req: Request,
    res: Response,
    plugin: InstalledPluginLike,
  ): Promise<unknown>;
  handlePluginStats(
    res: Response,
    installed?: InstalledPluginLike[],
    snapshotRows?: unknown[],
  ): Promise<unknown> | unknown;
  requireLocalDaemonRequest: RequestHandler;
  handleAppliedPluginExport(req: Request, res: Response): Promise<unknown>;
  handleProjectInstallFolder(req: Request, res: Response): Promise<unknown>;
  handleProjectPluginCli(req: Request, res: Response, action: PluginShareAction): Promise<unknown>;
  getProject(db: SqliteDbLike, id: string): unknown;
  sendApiError(res: Response, status: number, code: string, message: string): unknown;
  isLocalSameOrigin(req: Request, port: number | null | undefined): boolean;
  handleCandidateDraft(req: Request, res: Response): Promise<unknown>;
  handleCandidateShareTask(req: Request, res: Response): Promise<unknown>;
  handleProjectShareTask(req: Request, res: Response): Promise<unknown>;
}

export interface RegisterPluginRoutesDeps {
  db: SqliteDbLike;
  authorizeProjectRequest: AuthorizeProjectRequest;
  /** Team-resource copy red-line (D3). When present, a frozen team plugin cannot
   *  be duplicated into a personal project. Omit to skip the guard (no-op). */
  teamResources?: TeamResourceStateProvider;
  paths: { PROJECTS_DIR: string; PLUGIN_REGISTRY_ROOTS: string[]; PLUGIN_LOCKFILE_PATH: string };
  ids: { randomId(): string };
  projectStore: {
    insertProject(db: SqliteDbLike, project: unknown): Project | null;
    getProject(db: SqliteDbLike, id: string): Project | null;
    ensureWorkspaceProject(db: SqliteDbLike, input: unknown): unknown;
    dbDeleteProject(db: SqliteDbLike, id: string): unknown;
    removeProjectDir(projectsRoot: string, projectId: string): Promise<unknown>;
  };
  fetchProjectCreationWorkspaceDirectory?: () => Promise<WorkspaceDirectoryFetchResult>;
  verifyWorkspaceRequestAuthority?: VerifyWorkspaceRequestAuthority;
  conversations: {
    insertConversation(db: SqliteDbLike, conversation: unknown): unknown;
  };
  /**
   * Read access to the generic `workspace_resources` binding table (db.ts),
   * pre-bound to no particular resource type — routes below pass `'plugin'`
   * explicitly so a future skill/design-system route can reuse the exact
   * same deps shape. Optional so callers that never reach the uninstall
   * route (`registerProjectPluginRoutes`, existing narrow-scope tests) don't
   * have to wire it; `registerPluginRoutes`'s uninstall handler treats an
   * absent value as "no gate" rather than crashing.
   */
  workspaceResources?: {
    getWorkspaceResource: (
      db: SqliteDbLike,
      resourceType: string,
      workspaceId: string,
      resourceId: string,
    ) => WorkspaceResourceBindingRow | null | undefined;
    getWorkspaceResourceByResourceId: (
      db: SqliteDbLike,
      resourceType: string,
      resourceId: string,
    ) => WorkspaceResourceBindingRow | null | undefined;
    workspaceTeamPluginBindingAllowsRead?: (
      db: SqliteDbLike,
      workspaceId: string,
      pluginId: string,
    ) => boolean;
    getWorkspaceProjectByProjectId?: (
      db: SqliteDbLike,
      projectId: string,
    ) => WorkspaceProjectBindingRow | null | undefined;
  };
  plugins: {
    listInstalledPlugins: (
      db: SqliteDbLike,
      workspaceId?: string | null,
      workspaceMemberId?: string | null,
    ) => InstalledPluginLike[] | Promise<InstalledPluginLike[]>;
    getInstalledPlugin: (db: SqliteDbLike, id: string) => InstalledPluginLike | null;
    getWorkspacePlugin?: (
      db: SqliteDbLike,
      id: string,
      workspaceId: string | null,
      workspaceMemberId?: string | null,
    ) => InstalledPluginLike | null | Promise<InstalledPluginLike | null>;
    installPlugin: (db: SqliteDbLike, args: unknown) => AsyncIterable<unknown>;
    isSafePluginId: (id: string) => boolean;
    uninstallPlugin: (db: SqliteDbLike, id: string, roots: string[]) => Promise<{ ok: boolean; removedFolder?: boolean; warning?: string }>;
    installFromLocalFolder: (db: SqliteDbLike, args: unknown) => AsyncIterable<unknown>;
    applyPlugin: (args: unknown) => PluginApplyResult;
    doctorPlugin: (plugin: InstalledPluginLike, registry: unknown, extras: unknown) => unknown;
    getSnapshot: (db: SqliteDbLike, id: string) => AppliedPluginSnapshotLike | null;
    pruneExpiredSnapshots: (db: SqliteDbLike, opts?: { before?: number }) => { removed: number; ids: string[] };
    readPluginLockfile: (path: string) => Promise<unknown>;
    resolvePluginSnapshot: (args: unknown) => unknown;
    MissingInputError: new (...args: unknown[]) => MissingInputErrorLike;
    pluginPromptBlock: (snap: AppliedPluginSnapshotLike) => string;
    listSkillPluginCandidates: (db: SqliteDbLike, projectId: string, includeDismissed?: boolean) => InstalledPluginLike[];
    dismissSkillPluginCandidate: (db: SqliteDbLike, projectId: string, candidateId: string) => InstalledPluginLike | null;
    generateSkillPluginDraft: (db: SqliteDbLike, projectRoot: string, projectId: string, candidateId: string) => Promise<unknown>;
    FIRST_PARTY_ATOMS: unknown[];
  };
  helpers: PluginRouteHelpers;
}

export function registerPluginEventRoutes(app: Express, deps: RegisterPluginEventRoutesDeps): void {
  const resolveEventScope = async (req: Request, res: Response) => {
    const authority = await resolveOptionalWorkspaceRequestAuthority(
      req,
      deps.verifyWorkspaceRequestAuthority,
    );
    if (!authority.ok) {
      deps.http.sendApiError(
        res,
        authority.status,
        authority.code,
        authority.message,
      );
      return null;
    }
    return {
      workspaceId: authority.context?.workspaceId ?? null,
      workspaceMemberId: authority.context?.workspaceMemberId ?? null,
    };
  };
  const visibleEvents = async <T extends { pluginId: string }>(
    scope: { workspaceId: string | null; workspaceMemberId: string | null },
    events: ReadonlyArray<T>,
  ) => {
    // Plugin events predate Workspace bindings and carry no trustworthy scope
    // of their own. Prove visibility against the current scoped catalog; an
    // empty-id or already-uninstalled event cannot be proven and is hidden.
    const visibleIds = await deps.plugins.listVisiblePluginIds(
      scope.workspaceId,
      scope.workspaceMemberId,
    );
    return events.filter((event): event is T => Boolean(
      event.pluginId && visibleIds.has(event.pluginId),
    ));
  };
  app.get('/api/plugins/events/snapshot', async (req, res) => {
    const scope = await resolveEventScope(req, res);
    if (!scope) return;
    const since = Number(typeof req.query.since === 'string' ? req.query.since : 0);
    const { pluginEventSnapshot } = await import('../../plugins/events.js');
    const events = await visibleEvents(
      scope,
      pluginEventSnapshot(Number.isFinite(since) && since > 0 ? since : 0),
    );
    res.json({ events, count: events.length, generatedAt: Date.now() });
  });
  app.get('/api/plugins/events/stats', async (req, res) => {
    const scope = await resolveEventScope(req, res);
    if (!scope) return;
    const { pluginEventSnapshot, summarisePluginEvents } = await import('../../plugins/events.js');
    const events = await visibleEvents(scope, pluginEventSnapshot());
    res.json({ stats: summarisePluginEvents(events), generatedAt: Date.now() });
  });
  app.post('/api/plugins/events/purge', deps.http.requireLocalDaemonRequest, async (_req, res) => {
    try {
      const { purgePluginEventBuffer } = await import('../../plugins/events.js');
      res.json({ ok: true, ...purgePluginEventBuffer() });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });
  app.get('/api/plugins/events', async (req, res) => {
    const scope = await resolveEventScope(req, res);
    if (!scope) return;
    const since = Number(typeof req.query.since === 'string' ? req.query.since : 0);
    const { pluginEventSnapshot, subscribePluginEvents } = await import('../../plugins/events.js');
    let closed = false;
    let ready = false;
    const pending: Array<{ pluginId: string }> = [];
    const emitIfVisible = (ev: { pluginId: string }) => {
      void visibleEvents(scope, [ev]).then(([visible]) => {
        if (!closed && visible) {
          res.write(`event: plugin\ndata: ${JSON.stringify(visible)}\n\n`);
        }
      }).catch(() => {
        // Fail closed: an unreadable catalog cannot prove event visibility.
      });
    };
    const unsubscribe = subscribePluginEvents((ev) => {
      if (!ready) pending.push(ev);
      else emitIfVisible(ev);
    });
    const backlog = await visibleEvents(
      scope,
      pluginEventSnapshot(Number.isFinite(since) && since > 0 ? since : 0),
    );
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    for (const ev of backlog) res.write(`event: backlog\ndata: ${JSON.stringify(ev)}\n\n`);
    ready = true;
    for (const ev of pending.splice(0)) emitIfVisible(ev);
    // The request stream may close as soon as its body is consumed; the SSE
    // subscription belongs to the response lifetime instead.
    res.on('close', () => { closed = true; unsubscribe(); });
  });
}

export function registerPluginRoutes(app: Express, deps: RegisterPluginRoutesDeps): void {
  const { db, paths, ids, projectStore, conversations, plugins, helpers, teamResources, workspaceResources } = deps;
  const resolveWorkspaceAuthority = async (
    req: Request,
    res: Response,
  ): Promise<WorkspaceCollabContext | null | undefined> => {
    const authority = await resolveOptionalWorkspaceRequestAuthority(
      req,
      deps.verifyWorkspaceRequestAuthority,
    );
    if (!authority.ok) {
      helpers.sendApiError(
        res,
        authority.status,
        authority.code,
        authority.message,
      );
      return undefined;
    }
    return authority.context;
  };
  const resolveRequestPlugin = async (
    id: string,
    authority: WorkspaceCollabContext | null,
  ) => {
    const workspaceId = authority?.workspaceId ?? null;
    return plugins.getWorkspacePlugin
      ? plugins.getWorkspacePlugin(db, id, workspaceId, authority?.workspaceMemberId ?? null)
      : plugins.getInstalledPlugin(db, id);
  };
  const isTeamPlugin = (plugin: InstalledPluginLike | null | undefined): boolean =>
    typeof plugin?.source === 'string' && plugin.source.startsWith('team:plugin:');
  const hasActiveTeamPluginBinding = (
    id: string,
    authority: WorkspaceCollabContext | null,
  ): boolean => {
    const workspaceId = authority?.workspaceId?.trim();
    if (!workspaceId || !workspaceResources) return false;
    const binding = workspaceResources.getWorkspaceResource(
      db,
      'plugin',
      workspaceId,
      workspaceTeamPluginBindingResourceId(workspaceId, id),
    );
    return binding?.visibility === 'team' && binding.resourceState !== 'deleted';
  };
  const denyTeamPluginMutation = (
    res: Response,
    id: string,
    authority: WorkspaceCollabContext | null,
    plugin?: InstalledPluginLike | null,
  ): boolean => {
    if (!hasActiveTeamPluginBinding(id, authority) && !isTeamPlugin(plugin)) {
      return false;
    }
    res.status(403).json({ error: 'WORKSPACE_RESOURCE_MANAGE_DENIED' });
    return true;
  };
  const snapshotVisibleToAuthority = (
    row: { projectId?: string },
    authority: WorkspaceCollabContext | null,
  ): boolean => {
    if (!row.projectId || !workspaceResources?.getWorkspaceProjectByProjectId) {
      return false;
    }
    const binding = workspaceResources.getWorkspaceProjectByProjectId(db, row.projectId);
    // Headerless local compatibility is deliberately limited to a snapshot
    // whose project is provably unbound. A Workspace-bound snapshot may hold
    // prompts and connector inputs and must not leak through this global lane.
    if (!authority) return !binding;
    if (
      !binding
      || binding.workspaceId !== authority.workspaceId
      || binding.resourceState === 'deleted'
    ) return false;
    return binding.visibility === 'team'
      || binding.createdByWorkspaceMemberId === authority.workspaceMemberId;
  };
  app.get('/api/plugins', async (req, res) => { try { const authority = await resolveWorkspaceAuthority(req, res); if (authority === undefined) return; const visible = await plugins.listInstalledPlugins(db, authority?.workspaceId ?? null, authority?.workspaceMemberId ?? null); res.json({ plugins: helpers.applyBakedPreviews(visible, helpers.PLUGIN_PREVIEWS_DIR) }); } catch (err) { res.status(500).json({ error: String(err) }); } });
  // Keep this static route before /api/plugins/:id; Express matches in
  // registration order and would otherwise interpret "stats" as a plugin id.
  app.get('/api/plugins/stats', async (req, res) => {
    const authority = await resolveWorkspaceAuthority(req, res);
    if (authority === undefined) return;
    const installed = await plugins.listInstalledPlugins(
      db,
      authority?.workspaceId ?? null,
      authority?.workspaceMemberId ?? null,
    );
    const snapshotRows = db.prepare(
      `SELECT status, project_id, project_id AS projectId, run_id, applied_at
         FROM applied_plugin_snapshots`,
    ).all() as Array<{ projectId?: string }>;
    const visibleSnapshots = snapshotRows.filter((row) =>
      snapshotVisibleToAuthority(row, authority));
    return helpers.handlePluginStats(res, installed, visibleSnapshots);
  });
  app.get('/api/plugins/:id', async (req, res) => { try { const authority = await resolveWorkspaceAuthority(req, res); if (authority === undefined) return; const plugin = await resolveRequestPlugin(req.params.id, authority); if (!plugin) return res.status(404).json({ error: 'plugin not found' }); res.json(plugin); } catch (err) { res.status(500).json({ error: String(err) }); } });
  app.post('/api/plugins/upload-zip', (req, res) => helpers.pluginUpload.single('file')(req, res, async (err: unknown) => { if (err) return helpers.sendMulterError(res, err); try { const file = req.file; if (!file?.buffer) return res.status(400).json({ error: 'file is required' }); const result = await helpers.pluginInstallation.stageUploadedPluginZip(file.buffer, `upload:zip:${helpers.decodeMultipartFilename(file.originalname || 'plugin.zip')}`); res.status((result as { ok?: boolean }).ok ? 200 : 400).json(result); } catch (uploadErr: unknown) { res.status(400).json({ ok: false, warnings: [], message: uploadErr instanceof Error ? uploadErr.message : String(uploadErr), log: [] }); } }));
  app.post('/api/plugins/upload-folder', (req, res) => helpers.pluginUpload.array('files', 500)(req, res, async (err: unknown) => { if (err) return helpers.sendMulterError(res, err); try { const files = Array.isArray(req.files) ? req.files as Array<{ buffer: Buffer; originalname: string }> : []; if (files.length === 0) return res.status(400).json({ error: 'files are required' }); const result = await helpers.pluginInstallation.stageUploadedPluginFolder(files, req.body?.paths); res.status((result as { ok?: boolean } | null)?.ok ? 200 : 400).json(result); } catch (uploadErr: unknown) { res.status(400).json({ ok: false, warnings: [], message: uploadErr instanceof Error ? uploadErr.message : String(uploadErr), log: [] }); } }));
  app.post('/api/plugins/install', async (req, res) => {
    const authority = await resolveWorkspaceAuthority(req, res);
    if (authority === undefined) return;
    return helpers.installOrUpgradePlugin(req, res, 'install', authority);
  });
  // This route used to carry NO permission check at all: any caller (any
  // workspace, any role) could uninstall any plugin. Now gated the same way
  // project mutations are, via the shared
  // `enforceWorkspaceResourceMutation` (collab/workspace-resource-mutation.ts).
  //
  // The scoped resolver runs before the mutation gate. It quarantines an
  // unbound user plugin from an explicitly scoped caller and hides Personal
  // plugins from every non-creator, including Workspace owner/admin. The
  // headerless local lane can still manage genuinely unbound legacy plugins.
  app.post('/api/plugins/:id/uninstall', async (req, res) => {
    try {
      if (!plugins.isSafePluginId(req.params.id)) return res.status(400).json({ error: 'invalid plugin id' });
      const authority = await resolveWorkspaceAuthority(req, res);
      if (authority === undefined) return;
      const requestedPlugin = await resolveRequestPlugin(req.params.id, authority);
      if (!requestedPlugin) return res.status(404).json({ error: 'plugin not found' });
      if (
        typeof requestedPlugin?.source === 'string' &&
        requestedPlugin.source.startsWith('team:plugin:')
      ) {
        return res.status(403).json({ error: 'WORKSPACE_RESOURCE_MANAGE_DENIED' });
      }
      const binding = workspaceResources?.getWorkspaceResourceByResourceId(db, 'plugin', req.params.id);
      if (binding && workspaceResources && !await enforceVerifiedWorkspaceResourceMutation(
        'plugin',
        req,
        res,
        helpers.sendApiError,
        (dbArg, workspaceId, resourceId) => workspaceResources.getWorkspaceResource(dbArg as SqliteDbLike, 'plugin', workspaceId, resourceId),
        (dbArg, resourceId) => workspaceResources.getWorkspaceResourceByResourceId(dbArg as SqliteDbLike, 'plugin', resourceId),
        db,
        req.params.id,
        'delete',
        deps.verifyWorkspaceRequestAuthority,
      )) return;
      const result = await plugins.uninstallPlugin(db, req.params.id, paths.PLUGIN_REGISTRY_ROOTS); if (!result.ok && !result.removedFolder) return res.status(404).json({ error: 'plugin not found', warning: result.warning }); res.json(result);
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });
  app.post('/api/plugins/:id/upgrade', async (req, res) => {
    const authority = await resolveWorkspaceAuthority(req, res);
    if (authority === undefined) return;
    // A live exact-Workspace Team binding is the mutation target even while
    // its local mirror is temporarily missing. Reject before resolving the
    // plugin so the resolver cannot fall through to a same-id Personal row
    // (or turn the Team mutation into a misleading 404 when none exists).
    if (denyTeamPluginMutation(res, req.params.id, authority)) return;
    const requestedPlugin = await resolveRequestPlugin(req.params.id, authority);
    if (!requestedPlugin) return res.status(404).json({ error: 'plugin not found' });
    if (denyTeamPluginMutation(res, req.params.id, authority, requestedPlugin)) return;
    const binding = workspaceResources?.getWorkspaceResourceByResourceId(db, 'plugin', req.params.id);
    if (binding && workspaceResources && !await enforceVerifiedWorkspaceResourceMutation(
      'plugin',
      req,
      res,
      helpers.sendApiError,
      (dbArg, workspaceId, resourceId) => workspaceResources.getWorkspaceResource(dbArg as SqliteDbLike, 'plugin', workspaceId, resourceId),
      (dbArg, resourceId) => workspaceResources.getWorkspaceResourceByResourceId(dbArg as SqliteDbLike, 'plugin', resourceId),
      db,
      req.params.id,
      'writeFiles',
      deps.verifyWorkspaceRequestAuthority,
    )) return;
    return helpers.installOrUpgradePlugin(req, res, 'upgrade', authority);
  });
  app.post('/api/plugins/:id/apply', async (req, res) => {
    try {
      const authority = await resolveWorkspaceAuthority(req, res);
      if (authority === undefined) return;
      const plugin = await resolveRequestPlugin(req.params.id, authority);
      if (!plugin) return res.status(404).json({ error: 'plugin not found' });
      const body = req.body && typeof req.body === 'object'
        ? req.body as Record<string, unknown>
        : {};
      const inputs = body.inputs && typeof body.inputs === 'object' ? body.inputs : {};
      const grantCaps = Array.isArray(body.grantCaps)
        ? body.grantCaps.filter((c: unknown): c is string => typeof c === 'string')
        : [];
      const locale = typeof body.locale === 'string' ? body.locale : undefined;
      const registry = await helpers.loadPluginRegistryView({
        workspaceId: authority?.workspaceId ?? null,
        workspaceMemberId: authority?.workspaceMemberId ?? null,
      });
      const exactWorkspaceId = authority?.workspaceId?.trim();
      if (
        typeof plugin.source === 'string' &&
        plugin.source.startsWith('team:plugin:') &&
        (
          !exactWorkspaceId ||
          !workspaceResources?.workspaceTeamPluginBindingAllowsRead ||
          !workspaceResources.workspaceTeamPluginBindingAllowsRead(
            db,
            exactWorkspaceId,
            req.params.id,
          )
        )
      ) {
        return res.status(404).json({ error: 'plugin not found' });
      }
      const connectorProbe = helpers.buildConnectorProbe(helpers.connectorService);
      const computed = plugins.applyPlugin({ plugin, inputs, registry, locale, connectorProbe });
      if (grantCaps.length > 0) {
        const merged = new Set([...computed.result.capabilitiesGranted, ...grantCaps]);
        computed.result.capabilitiesGranted = Array.from(merged);
        computed.result.appliedPlugin.capabilitiesGranted = Array.from(merged);
      }
      res.json({
        ok: true,
        ...computed.result,
        warnings: computed.warnings,
        manifestSourceDigest: computed.manifestSourceDigest,
      });
    } catch (err: unknown) {
      if (err instanceof plugins.MissingInputError) {
        return res.status(422).json({ error: 'missing_inputs', fields: err.fields });
      }
      res.status(500).json({ error: String(err) });
    }
  });
  app.post('/api/plugins/:id/duplicate-project', helpers.requireLocalDaemonRequest, async (req, res) => {
    let cleanupProjectId: string | null = null;
    let insertedProject = false;
    try {
      const pluginId = Array.isArray(req.params.id) ? req.params.id[0] ?? '' : req.params.id ?? '';
      const authority = await resolveWorkspaceAuthority(req, res);
      if (authority === undefined) return;
      const plugin = await resolveRequestPlugin(pluginId, authority);
      if (!plugin) return res.status(404).json({ error: { code: 'plugin-not-found', message: 'plugin not found' } });
      if (typeof plugin.id !== 'string' || typeof plugin.fsPath !== 'string') {
        return res.status(422).json({ error: { code: 'plugin-not-duplicable', message: 'plugin record is missing a filesystem source' } });
      }
      // AC-9 copy red-line (D3): a frozen team plugin cannot be duplicated into a
      // personal project. Runs before any project is created (nothing to clean up
      // if it throws). No-op until the resource-hub reports this plugin as a
      // frozen team resource.
      if (teamResources) {
        await enforceTeamResourceCopyAllowed(teamResources, { kind: 'plugin', resourceId: plugin.id });
      }
      const createWorkspace = await authorizeCreatedProjectWorkspace(
        req,
        deps.fetchProjectCreationWorkspaceDirectory,
      );
      if (!createWorkspace.ok) {
        return sendCreatedProjectWorkspaceError(res, createWorkspace);
      }
      const body = req.body && typeof req.body === 'object'
        ? req.body as PluginDuplicateProjectRequest
        : {};
      const projectName = typeof body.name === 'string' && body.name.trim().length > 0
        ? body.name.trim().slice(0, 120)
        : `${plugin.title || plugin.id}`;
      const now = Date.now();
      const projectId = ids.randomId();
      const conversationId = ids.randomId();
      cleanupProjectId = projectId;
      const metadata: ProjectMetadata = {
        kind: 'prototype',
        templateId: `plugin:${plugin.id}`,
        templateLabel: plugin.title || plugin.id,
        duplicatedFromPluginId: plugin.id,
        skipDiscoveryBrief: true,
      };
      const duplicate = await duplicatePluginExampleIntoProject({
        plugin: plugin as InstalledPluginRecord,
        projectsRoot: paths.PROJECTS_DIR,
        projectId,
        metadata,
        assembleExample: helpers.assembleExample,
      });
      metadata.duplicatedFromPluginEntry = duplicate.sourceEntry;
      metadata.entryFile = duplicate.relPath;
      const project = db.transaction(() => {
        const createdProject = projectStore.insertProject(db, {
          id: projectId,
          name: projectName,
          skillId: null,
          designSystemId: null,
          pendingPrompt: null,
          metadata,
          createdAt: now,
          updatedAt: now,
        });
        insertedProject = true;
        conversations.insertConversation(db, {
          id: conversationId,
          projectId,
          title: null,
          createdAt: now,
          updatedAt: now,
        });
        bindCreatedProjectToWorkspace(
          (input) => projectStore.ensureWorkspaceProject(db, input),
          createWorkspace.context,
          projectId,
          now,
        );
        return createdProject;
      })();
      const loadedProject = projectStore.getProject(db, projectId) ?? project;
      if (!loadedProject) {
        throw new PluginDuplicateProjectError(
          500,
          'project-load-failed',
          'created project could not be loaded',
        );
      }
      const response: PluginDuplicateProjectResponse = {
        ok: true,
        projectId,
        conversationId,
        relPath: duplicate.relPath,
        project: loadedProject,
        sourcePluginId: plugin.id,
        sourceEntry: duplicate.sourceEntry,
        copiedFiles: duplicate.copiedFiles,
        skippedFiles: duplicate.skippedFiles,
        warnings: duplicate.warnings,
      };
      res.status(201).json(response);
    } catch (err: unknown) {
      if (cleanupProjectId) {
        try {
          if (insertedProject) projectStore.dbDeleteProject(db, cleanupProjectId);
        } catch {
          // The transaction normally rolled the rows back already. A failed
          // compensating DELETE must never strand the managed filesystem copy.
        } finally {
          await projectStore.removeProjectDir(paths.PROJECTS_DIR, cleanupProjectId).catch(() => {});
        }
      }
      if (err instanceof TeamResourceCopyForbiddenError) {
        return res.status(403).json({ error: { code: err.code, message: err.message } });
      }
      if (err instanceof PluginDuplicateProjectError) {
        return res.status(err.status).json({ error: { code: err.code, message: err.message } });
      }
      res.status(500).json({ error: { code: 'plugin-duplicate-failed', message: err instanceof Error ? err.message : String(err) } });
    }
  });
  app.post('/api/plugins/:id/share-project', async (req, res) => {
    const authority = await resolveWorkspaceAuthority(req, res);
    if (authority === undefined) return;
    if (denyTeamPluginMutation(res, req.params.id, authority)) return;
    const plugin = await resolveRequestPlugin(req.params.id, authority);
    if (!plugin) return res.status(404).json({ error: 'plugin not found' });
    if (denyTeamPluginMutation(res, req.params.id, authority, plugin)) return;
    return helpers.handleShareProject(req, res, plugin);
  });
  app.post('/api/plugins/:id/doctor', async (req, res) => { try { const authority = await resolveWorkspaceAuthority(req, res); if (authority === undefined) return; const plugin = await resolveRequestPlugin(req.params.id, authority); if (!plugin) return res.status(404).json({ error: 'plugin not found' }); const registry = await helpers.loadPluginRegistryView({ workspaceId: authority?.workspaceId ?? null, workspaceMemberId: authority?.workspaceMemberId ?? null }); const connectorProbe = helpers.buildConnectorProbe(helpers.connectorService); res.json(plugins.doctorPlugin(plugin, registry, { connectorProbe })); } catch (err) { res.status(500).json({ error: String(err) }); } });
  app.post('/api/plugins/:id/trust', async (req, res) => {
    const authority = await resolveWorkspaceAuthority(req, res);
    if (authority === undefined) return;
    const plugin = await resolveRequestPlugin(req.params.id, authority);
    if (!plugin) return res.status(404).json({ error: 'plugin not found' });
    if (typeof plugin.source === 'string' && plugin.source.startsWith('team:plugin:')) {
      return res.status(403).json({ error: 'WORKSPACE_RESOURCE_MANAGE_DENIED' });
    }
    return helpers.handlePluginTrust(req, res, plugin);
  });
  const authorizeSnapshotRead = async (
    req: Request,
    res: Response,
    snapshotId: string,
  ): Promise<AppliedPluginSnapshotLike | null> => {
    const snap = plugins.getSnapshot(db, snapshotId);
    if (!snap) {
      res.status(404).json({ error: 'snapshot not found' });
      return null;
    }
    const row = db.prepare(
      `SELECT project_id AS projectId FROM applied_plugin_snapshots WHERE id = ?`,
    ).get(snapshotId) as { projectId?: unknown } | undefined;
    const projectId = typeof row?.projectId === 'string' ? row.projectId : '';
    if (!projectId || !await deps.authorizeProjectRequest(
      req,
      res,
      projectId,
      { mode: 'read' },
    )) return null;
    return snap;
  };
  app.get('/api/applied-plugins/:snapshotId', async (req, res) => {
    try {
      const snap = await authorizeSnapshotRead(req, res, req.params.snapshotId);
      if (snap) res.json(snap);
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });
  app.get('/api/applied-plugins/:snapshotId/canon', async (req, res) => {
    try {
      const snap = await authorizeSnapshotRead(req, res, req.params.snapshotId);
      if (!snap) return;
      const block = plugins.pluginPromptBlock(snap);
      const accepts = String(req.headers.accept ?? '').toLowerCase();
      if (accepts.includes('text/plain')) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(block);
        return;
      }
      res.json({ snapshotId: snap.snapshotId, pluginId: snap.pluginId, block });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });
  app.get('/api/applied-plugins', async (req, res) => {
    try {
      const authority = await resolveWorkspaceAuthority(req, res);
      if (authority === undefined) return;
      const rows = db.prepare(
        `SELECT id, project_id AS projectId
           FROM applied_plugin_snapshots
          ORDER BY applied_at DESC
          LIMIT 500`,
      ).all() as Array<SqliteRowId & { projectId?: string }>;
      const visibleRows = rows.filter((row) =>
        snapshotVisibleToAuthority(row, authority));
      res.json({
        snapshots: visibleRows
          .map((row) => plugins.getSnapshot(db, row.id))
          .filter((snapshot): snapshot is AppliedPluginSnapshotLike => snapshot !== null),
      });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });
  app.get('/api/projects/:projectId/applied-plugins', async (req, res) => {
    try {
      if (!await deps.authorizeProjectRequest(
        req,
        res,
        req.params.projectId,
        { mode: 'read' },
      )) return;
      const rows = db.prepare(
        `SELECT id FROM applied_plugin_snapshots WHERE project_id = ? ORDER BY applied_at DESC`,
      ).all(req.params.projectId) as SqliteRowId[];
      res.json({
        snapshots: rows
          .map((row) => plugins.getSnapshot(db, row.id))
          .filter((snapshot): snapshot is AppliedPluginSnapshotLike => snapshot !== null),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
  app.post(
    '/api/applied-plugins/export',
    helpers.requireLocalDaemonRequest,
    async (req, res) => {
      const body = req.body && typeof req.body === 'object'
        ? req.body as Record<string, unknown>
        : {};
      if (typeof body.snapshotId === 'string' && body.snapshotId.length > 0) {
        if (!await authorizeSnapshotRead(req, res, body.snapshotId)) return;
      } else if (typeof body.projectId === 'string' && body.projectId.length > 0) {
        if (!await deps.authorizeProjectRequest(
          req,
          res,
          body.projectId,
          { mode: 'read' },
        )) return;
      } else {
        return helpers.sendApiError(
          res,
          400,
          'PLUGIN_EXPORT_TARGET_REQUIRED',
          'snapshotId or projectId is required',
        );
      }
      return helpers.handleAppliedPluginExport(req, res);
    },
  );
  app.post('/api/applied-plugins/prune', helpers.requireLocalDaemonRequest, async (req, res) => { try { const body = req.body && typeof req.body === 'object' ? req.body : {}; const before = typeof body.before === 'number' ? body.before : undefined; const result = plugins.pruneExpiredSnapshots(db, before ? { before } : {}); if (result.removed > 0) { try { const { recordPluginEvent } = await import('../../plugins/events.js'); recordPluginEvent({ kind: 'plugin.snapshot-pruned', pluginId: '', details: { removed: result.removed, ...(before ? { before } : {}) } }); } catch {} } res.json({ ok: true, removed: result.removed, ids: result.ids }); } catch (err) { res.status(500).json({ error: String(err) }); } });
}

export function registerProjectPluginRoutes(app: Express, deps: RegisterPluginRoutesDeps): void {
  const { db, paths, plugins, helpers } = deps;
  const authorizeWrite = (req: Request, res: Response, projectId: string) =>
    deps.authorizeProjectRequest(
      req,
      res,
      projectId,
      { mode: 'write', capability: 'writeFiles' },
    );
  app.post('/api/projects/:id/plugins/install-folder', async (req, res) => {
    if (!await authorizeWrite(req, res, req.params.id)) return;
    return helpers.handleProjectInstallFolder(req, res);
  });
  app.post('/api/projects/:id/plugins/publish-github', async (req, res) => {
    if (!await authorizeWrite(req, res, req.params.id)) return;
    return helpers.handleProjectPluginCli(req, res, 'publish-github');
  });
  app.get('/api/projects/:id/plugin-candidates', async (req, res) => {
    try {
      const project = helpers.getProject(db, req.params.id);
      if (!project) {
        return helpers.sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await deps.authorizeProjectRequest(req, res, req.params.id, { mode: 'read' })) return;
      const includeDismissed = req.query.includeDismissed === 'true';
      res.json({
        candidates: plugins.listSkillPluginCandidates(db, req.params.id, includeDismissed),
      });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
  app.post('/api/projects/:id/plugin-candidates/:candidateId/dismiss', async (req, res) => {
    if (!helpers.isLocalSameOrigin(req, helpers.resolvedPortRef.current)) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    if (!await authorizeWrite(req, res, req.params.id)) return;
    const candidate = plugins.dismissSkillPluginCandidate(
      db,
      req.params.id,
      req.params.candidateId,
    );
    if (!candidate) {
      return helpers.sendApiError(res, 404, 'NOT_FOUND', 'plugin candidate not found');
    }
    if (candidate.assistantMessageId) {
      db.prepare(`DELETE FROM messages WHERE id = ?`).run(candidate.assistantMessageId);
    }
    res.json({ ok: true, candidate });
  });
  app.post('/api/projects/:id/plugin-candidates/:candidateId/draft', async (req, res) => {
    if (!await authorizeWrite(req, res, req.params.id)) return;
    return helpers.handleCandidateDraft(req, res);
  });
  app.post('/api/projects/:id/plugin-candidates/:candidateId/share-tasks', async (req, res) => {
    if (!await authorizeWrite(req, res, req.params.id)) return;
    return helpers.handleCandidateShareTask(req, res);
  });
  app.post('/api/projects/:id/plugins/contribute-open-design', async (req, res) => {
    if (!await authorizeWrite(req, res, req.params.id)) return;
    return helpers.handleProjectPluginCli(req, res, 'contribute-open-design');
  });
  app.post('/api/projects/:id/plugins/share-tasks', async (req, res) => {
    if (!await authorizeWrite(req, res, req.params.id)) return;
    return helpers.handleProjectShareTask(req, res);
  });
  app.post('/api/plugins/share-tasks/:id/wait', async (req, res) => {
    if (!helpers.isLocalSameOrigin(req, helpers.resolvedPortRef.current)) return res.status(403).json({ error: 'cross-origin request rejected' });
    const task = helpers.pluginShareTaskStore.get(req.params.id);
    if (!task) return res.status(404).json({ error: 'task not found' });
    if (!await deps.authorizeProjectRequest(req, res, task.projectId, { mode: 'read' })) return;
    const since = Number.isFinite(req.body?.since) ? Number(req.body.since) : 0;
    const requestedTimeout = Number.isFinite(req.body?.timeoutMs) ? Number(req.body.timeoutMs) : 25_000;
    const timeoutMs = Math.min(Math.max(requestedTimeout, 0), 25_000);
    const respond = () => { if (!res.writableEnded) res.json(helpers.pluginShareTaskStore.snapshot(task, since)); };
    if (task.status === 'done' || task.status === 'failed' || task.progress.length > since) return respond();
    let resolved = false;
    const wake = () => { if (resolved) return; resolved = true; task.waiters.delete(wake); clearTimeout(timer); respond(); };
    task.waiters.add(wake);
    const timer = setTimeout(wake, timeoutMs);
    res.on('close', wake);
  });
}
