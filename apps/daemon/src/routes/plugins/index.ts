import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import type {
  InstalledPluginRecord,
  PluginDuplicateProjectRequest,
  PluginDuplicateProjectResponse,
  Project,
  ProjectMetadata,
} from '@open-design/contracts';
import {
  duplicatePluginExampleIntoProject,
  PluginDuplicateProjectError,
} from '../../plugins/duplicate-project.js';
import type { PluginShareAction } from '../../services/plugin-share-tasks.js';

export interface RegisterPluginEventRoutesDeps {
  http: { requireLocalDaemonRequest: RequestHandler };
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
  installOrUpgradePlugin(req: Request, res: Response, mode: 'install' | 'upgrade'): Promise<unknown>;
  loadPluginRegistryView(): Promise<unknown>;
  buildConnectorProbe(service: unknown): unknown;
  handleShareProject(req: Request, res: Response): Promise<unknown>;
  handlePluginTrust(req: Request, res: Response): Promise<unknown>;
  handlePluginStats(res: Response): Promise<unknown> | unknown;
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
  paths: { PROJECTS_DIR: string; PLUGIN_REGISTRY_ROOTS: string[]; PLUGIN_LOCKFILE_PATH: string };
  ids: { randomId(): string };
  projectStore: {
    insertProject(db: SqliteDbLike, project: unknown): Project | null;
    getProject(db: SqliteDbLike, id: string): Project | null;
    dbDeleteProject(db: SqliteDbLike, id: string): unknown;
    removeProjectDir(projectsRoot: string, projectId: string): Promise<unknown>;
  };
  conversations: {
    insertConversation(db: SqliteDbLike, conversation: unknown): unknown;
  };
  plugins: {
    listInstalledPlugins: (db: SqliteDbLike) => InstalledPluginLike[];
    getInstalledPlugin: (db: SqliteDbLike, id: string) => InstalledPluginLike | null;
    installPlugin: (db: SqliteDbLike, args: unknown) => AsyncIterable<unknown>;
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
  app.get('/api/plugins/events/snapshot', async (req, res) => {
    const since = Number(typeof req.query.since === 'string' ? req.query.since : 0);
    const { pluginEventSnapshot } = await import('../../plugins/events.js');
    const events = pluginEventSnapshot(Number.isFinite(since) && since > 0 ? since : 0);
    res.json({ events, count: events.length, generatedAt: Date.now() });
  });
  app.get('/api/plugins/events/stats', async (_req, res) => {
    const { pluginEventSnapshot, summarisePluginEvents } = await import('../../plugins/events.js');
    res.json({ stats: summarisePluginEvents(pluginEventSnapshot()), generatedAt: Date.now() });
  });
  app.post('/api/plugins/events/purge', deps.http.requireLocalDaemonRequest, async (_req, res) => {
    try {
      const { purgePluginEventBuffer } = await import('../../plugins/events.js');
      res.json({ ok: true, ...purgePluginEventBuffer() });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });
  app.get('/api/plugins/events', async (req, res) => {
    const since = Number(typeof req.query.since === 'string' ? req.query.since : 0);
    const { pluginEventSnapshot, subscribePluginEvents } = await import('../../plugins/events.js');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    for (const ev of pluginEventSnapshot(Number.isFinite(since) && since > 0 ? since : 0)) res.write(`event: backlog\ndata: ${JSON.stringify(ev)}\n\n`);
    const unsubscribe = subscribePluginEvents((ev) => res.write(`event: plugin\ndata: ${JSON.stringify(ev)}\n\n`));
    req.on('close', () => { unsubscribe(); });
  });
}

export function registerPluginRoutes(app: Express, deps: RegisterPluginRoutesDeps): void {
  const { db, paths, ids, projectStore, conversations, plugins, helpers } = deps;
  app.get('/api/plugins', async (_req, res) => { try { res.json({ plugins: helpers.applyBakedPreviews(plugins.listInstalledPlugins(db), helpers.PLUGIN_PREVIEWS_DIR) }); } catch (err) { res.status(500).json({ error: String(err) }); } });
  app.get('/api/plugins/:id', async (req, res) => { try { const plugin = plugins.getInstalledPlugin(db, req.params.id); if (!plugin) return res.status(404).json({ error: 'plugin not found' }); res.json(plugin); } catch (err) { res.status(500).json({ error: String(err) }); } });
  app.post('/api/plugins/upload-zip', (req, res) => helpers.pluginUpload.single('file')(req, res, async (err: unknown) => { if (err) return helpers.sendMulterError(res, err); try { const file = req.file; if (!file?.buffer) return res.status(400).json({ error: 'file is required' }); const result = await helpers.pluginInstallation.stageUploadedPluginZip(file.buffer, `upload:zip:${helpers.decodeMultipartFilename(file.originalname || 'plugin.zip')}`); res.status((result as { ok?: boolean }).ok ? 200 : 400).json(result); } catch (uploadErr: unknown) { res.status(400).json({ ok: false, warnings: [], message: uploadErr instanceof Error ? uploadErr.message : String(uploadErr), log: [] }); } }));
  app.post('/api/plugins/upload-folder', (req, res) => helpers.pluginUpload.array('files', 500)(req, res, async (err: unknown) => { if (err) return helpers.sendMulterError(res, err); try { const files = Array.isArray(req.files) ? req.files as Array<{ buffer: Buffer; originalname: string }> : []; if (files.length === 0) return res.status(400).json({ error: 'files are required' }); const result = await helpers.pluginInstallation.stageUploadedPluginFolder(files, req.body?.paths); res.status((result as { ok?: boolean } | null)?.ok ? 200 : 400).json(result); } catch (uploadErr: unknown) { res.status(400).json({ ok: false, warnings: [], message: uploadErr instanceof Error ? uploadErr.message : String(uploadErr), log: [] }); } }));
  app.post('/api/plugins/install', async (req, res) => helpers.installOrUpgradePlugin(req, res, 'install'));
  app.post('/api/plugins/:id/uninstall', async (req, res) => { try { const result = await plugins.uninstallPlugin(db, req.params.id, paths.PLUGIN_REGISTRY_ROOTS); if (!result.ok && !result.removedFolder) return res.status(404).json({ error: 'plugin not found', warning: result.warning }); res.json(result); } catch (err) { res.status(500).json({ error: String(err) }); } });
  app.post('/api/plugins/:id/upgrade', async (req, res) => helpers.installOrUpgradePlugin(req, res, 'upgrade'));
  app.post('/api/plugins/:id/apply', async (req, res) => { try { const plugin = plugins.getInstalledPlugin(db, req.params.id); if (!plugin) return res.status(404).json({ error: 'plugin not found' }); const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}; const inputs = body.inputs && typeof body.inputs === 'object' ? body.inputs : {}; const grantCaps = Array.isArray(body.grantCaps) ? body.grantCaps.filter((c: unknown): c is string => typeof c === 'string') : []; const locale = typeof body.locale === 'string' ? body.locale : undefined; const registry = await helpers.loadPluginRegistryView(); const connectorProbe = helpers.buildConnectorProbe(helpers.connectorService); const computed = plugins.applyPlugin({ plugin, inputs, registry, locale, connectorProbe }); if (grantCaps.length > 0) { const merged = new Set([...computed.result.capabilitiesGranted, ...grantCaps]); computed.result.capabilitiesGranted = Array.from(merged); computed.result.appliedPlugin.capabilitiesGranted = Array.from(merged); } res.json({ ok: true, ...computed.result, warnings: computed.warnings, manifestSourceDigest: computed.manifestSourceDigest }); } catch (err: unknown) { if (err instanceof plugins.MissingInputError) return res.status(422).json({ error: 'missing_inputs', fields: err.fields }); res.status(500).json({ error: String(err) }); } });
  app.post('/api/plugins/:id/duplicate-project', helpers.requireLocalDaemonRequest, async (req, res) => {
    let cleanupProjectId: string | null = null;
    let insertedProject = false;
    try {
      const pluginId = Array.isArray(req.params.id) ? req.params.id[0] ?? '' : req.params.id ?? '';
      const plugin = plugins.getInstalledPlugin(db, pluginId);
      if (!plugin) return res.status(404).json({ error: { code: 'plugin-not-found', message: 'plugin not found' } });
      if (typeof plugin.id !== 'string' || typeof plugin.fsPath !== 'string') {
        return res.status(422).json({ error: { code: 'plugin-not-duplicable', message: 'plugin record is missing a filesystem source' } });
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
      const project = projectStore.insertProject(db, {
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
        if (insertedProject) projectStore.dbDeleteProject(db, cleanupProjectId);
        await projectStore.removeProjectDir(paths.PROJECTS_DIR, cleanupProjectId).catch(() => {});
      }
      if (err instanceof PluginDuplicateProjectError) {
        return res.status(err.status).json({ error: { code: err.code, message: err.message } });
      }
      res.status(500).json({ error: { code: 'plugin-duplicate-failed', message: err instanceof Error ? err.message : String(err) } });
    }
  });
  app.post('/api/plugins/:id/share-project', async (req, res) => helpers.handleShareProject(req, res));
  app.post('/api/plugins/:id/doctor', async (req, res) => { try { const plugin = plugins.getInstalledPlugin(db, req.params.id); if (!plugin) return res.status(404).json({ error: 'plugin not found' }); const registry = await helpers.loadPluginRegistryView(); const connectorProbe = helpers.buildConnectorProbe(helpers.connectorService); res.json(plugins.doctorPlugin(plugin, registry, { connectorProbe })); } catch (err) { res.status(500).json({ error: String(err) }); } });
  app.post('/api/plugins/:id/trust', async (req, res) => helpers.handlePluginTrust(req, res));
  app.get('/api/plugins/stats', async (_req, res) => helpers.handlePluginStats(res));
  app.get('/api/applied-plugins/:snapshotId', (req, res) => { try { const snap = plugins.getSnapshot(db, req.params.snapshotId); if (!snap) return res.status(404).json({ error: 'snapshot not found' }); res.json(snap); } catch (err) { res.status(500).json({ error: String(err) }); } });
  app.get('/api/applied-plugins/:snapshotId/canon', (req, res) => { try { const snap = plugins.getSnapshot(db, req.params.snapshotId); if (!snap) return res.status(404).json({ error: 'snapshot not found' }); const block = plugins.pluginPromptBlock(snap); const accepts = String(req.headers.accept ?? '').toLowerCase(); if (accepts.includes('text/plain')) { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.send(block); return; } res.json({ snapshotId: snap.snapshotId, pluginId: snap.pluginId, block }); } catch (err) { res.status(500).json({ error: String(err) }); } });
  app.get('/api/applied-plugins', (_req, res) => { try { const rows = db.prepare(`SELECT id FROM applied_plugin_snapshots ORDER BY applied_at DESC LIMIT 500`).all() as SqliteRowId[]; res.json({ snapshots: rows.map((r) => plugins.getSnapshot(db, r.id)).filter((x): x is AppliedPluginSnapshotLike => x !== null) }); } catch (err) { res.status(500).json({ error: String(err) }); } });
  app.get('/api/projects/:projectId/applied-plugins', (req, res) => { try { const rows = db.prepare(`SELECT id FROM applied_plugin_snapshots WHERE project_id = ? ORDER BY applied_at DESC`).all(req.params.projectId) as SqliteRowId[]; res.json({ snapshots: rows.map((r) => plugins.getSnapshot(db, r.id)).filter((x): x is AppliedPluginSnapshotLike => x !== null) }); } catch (err) { res.status(500).json({ error: String(err) }); } });
  app.post('/api/applied-plugins/export', helpers.requireLocalDaemonRequest, async (req, res) => helpers.handleAppliedPluginExport(req, res));
  app.post('/api/applied-plugins/prune', async (req, res) => { try { const body = req.body && typeof req.body === 'object' ? req.body : {}; const before = typeof body.before === 'number' ? body.before : undefined; const result = plugins.pruneExpiredSnapshots(db, before ? { before } : {}); if (result.removed > 0) { try { const { recordPluginEvent } = await import('../../plugins/events.js'); recordPluginEvent({ kind: 'plugin.snapshot-pruned', pluginId: '', details: { removed: result.removed, ...(before ? { before } : {}) } }); } catch {} } res.json({ ok: true, removed: result.removed, ids: result.ids }); } catch (err) { res.status(500).json({ error: String(err) }); } });
}

export function registerProjectPluginRoutes(app: Express, deps: RegisterPluginRoutesDeps): void {
  const { db, paths, plugins, helpers } = deps;
  app.post('/api/projects/:id/plugins/install-folder', async (req, res) => helpers.handleProjectInstallFolder(req, res));
  app.post('/api/projects/:id/plugins/publish-github', async (req, res) => helpers.handleProjectPluginCli(req, res, 'publish-github'));
  app.get('/api/projects/:id/plugin-candidates', (req, res) => { try { const project = helpers.getProject(db, req.params.id); if (!project) return helpers.sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found'); const includeDismissed = req.query.includeDismissed === 'true'; res.json({ candidates: plugins.listSkillPluginCandidates(db, req.params.id, includeDismissed) }); } catch (err: unknown) { res.status(400).json({ error: err instanceof Error ? err.message : String(err) }); } });
  app.post('/api/projects/:id/plugin-candidates/:candidateId/dismiss', (req, res) => { if (!helpers.isLocalSameOrigin(req, helpers.resolvedPortRef.current)) return res.status(403).json({ error: 'cross-origin request rejected' }); const candidate = plugins.dismissSkillPluginCandidate(db, req.params.id, req.params.candidateId); if (!candidate) return helpers.sendApiError(res, 404, 'NOT_FOUND', 'plugin candidate not found'); if (candidate.assistantMessageId) db.prepare(`DELETE FROM messages WHERE id = ?`).run(candidate.assistantMessageId); res.json({ ok: true, candidate }); });
  app.post('/api/projects/:id/plugin-candidates/:candidateId/draft', async (req, res) => helpers.handleCandidateDraft(req, res));
  app.post('/api/projects/:id/plugin-candidates/:candidateId/share-tasks', async (req, res) => helpers.handleCandidateShareTask(req, res));
  app.post('/api/projects/:id/plugins/contribute-open-design', async (req, res) => helpers.handleProjectPluginCli(req, res, 'contribute-open-design'));
  app.post('/api/projects/:id/plugins/share-tasks', async (req, res) => helpers.handleProjectShareTask(req, res));
  app.post('/api/plugins/share-tasks/:id/wait', (req, res) => {
    if (!helpers.isLocalSameOrigin(req, helpers.resolvedPortRef.current)) return res.status(403).json({ error: 'cross-origin request rejected' });
    const task = helpers.pluginShareTaskStore.get(req.params.id);
    if (!task) return res.status(404).json({ error: 'task not found' });
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
