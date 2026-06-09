import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request } from 'express';
import type { MediaExecutionPolicy } from '@open-design/contracts';
import { defaultMediaExecutionPolicy, mediaPolicyDenial } from './media-policy.js';
import { ownerScopedProjectId, type ProjectOwnerScope } from './db.js';
import type { RouteDeps } from './server-context.js';
import { proxyDispatcherRequestInit } from './connectionTest.js';
import { ownerFieldsForRequest, ownerScopeForRequest } from './project-owner-scope.js';
import {
  aihubmixCatalogUrl,
  parseAIHubMixCatalog,
  AIHUBMIX_DEFAULT_BASE_URL,
  type AIHubMixCatalogType,
} from './aihubmix.js';
import { isSandboxModeEnabled } from './sandbox-mode.js';
import type { ToolTokenGrant } from './tool-tokens.js';

const LONG_MEDIA_PROXY_TIMEOUT_MS = 10 * 60 * 1000;

// Short in-memory cache for the AIHubMix media catalogue so the picker can
// refresh without hammering the upstream public endpoint. Keyed by
// `${baseUrl}|${type}`. Values expire after AIHUBMIX_CATALOG_TTL_MS.
const AIHUBMIX_CATALOG_TTL_MS = 5 * 60 * 1000;
const aihubmixCatalogCache = new Map<string, { at: number; models: Array<{ id: string; label: string }> }>();

export interface RegisterMediaRoutesDeps extends RouteDeps<'db' | 'design' | 'http' | 'paths' | 'ids' | 'auth' | 'media' | 'appConfig' | 'orbit' | 'nativeDialogs' | 'projectStore' | 'projectFiles' | 'conversations' | 'research'> {}

export type LegacyMediaRouteGrantDecision =
  | { ok: true; grant: ToolTokenGrant | null }
  | {
      ok: false;
      code: string;
      details?: Record<string, unknown>;
      message: string;
      status: number;
    };

export function resolveLegacyMediaRouteGrant(input: {
  grant: ToolTokenGrant | null;
  projectId: string;
  requestProjectOverride: (projectId: string, tokenProjectId: string) => boolean;
  sandboxMode: boolean;
}): LegacyMediaRouteGrantDecision {
  if (
    input.sandboxMode &&
    input.grant &&
    input.requestProjectOverride(input.projectId, input.grant.projectId)
  ) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      details: { suppliedProjectId: input.projectId },
      message: 'projectId is derived from the tool token',
      status: 403,
    };
  }

  if (!input.grant && input.sandboxMode) {
    return {
      ok: false,
      code: 'TOOL_TOKEN_MISSING',
      message: 'tool token is required for media generation in sandbox mode',
      status: 401,
    };
  }

  return { ok: true, grant: input.grant };
}

export function registerMediaRoutes(app: Express, ctx: RegisterMediaRoutesDeps) {
  const { db, design } = ctx;
  const { sendApiError, requireLocalDaemonRequest, isLocalSameOrigin, resolvedPortRef } = ctx.http;
  const { PROJECT_ROOT, RUNTIME_DATA_DIR, projectsDirFor, runtimeDataDirFor } = ctx.paths;
  const { authorizeToolRequest, optionalToolGrantFromRequest, requestProjectOverride } = ctx.auth;
  const { randomUUID } = ctx.ids;
  const { MEDIA_PROVIDERS, IMAGE_MODELS, VIDEO_MODELS, AUDIO_MODELS_BY_KIND, MEDIA_ASPECTS, VIDEO_LENGTHS_SEC, AUDIO_DURATIONS_SEC, readMaskedConfig, writeConfig, generateMedia, createMediaTask, persistMediaTask, appendTaskProgress, notifyTaskWaiters, getLiveMediaTask, mediaTaskSnapshot, listMediaTasksByProject, listElevenLabsVoiceOptions } = ctx.media;
  const { readAppConfig, writeAppConfig } = ctx.appConfig;
  const { orbitServiceForRequest } = ctx.orbit;
  const { openNativeFolderDialog } = ctx.nativeDialogs;
  const { getProject } = ctx.projectStore;
  const { insertConversation, upsertMessage } = ctx.conversations;
  const { searchResearch, ResearchError } = ctx.research;
  const getResolvedPort = () => resolvedPortRef.current;
  const mediaConfigDataDirFor = (req: Request): string | undefined => {
    const requestDataDir = runtimeDataDirFor(req);
    return path.resolve(requestDataDir) === path.resolve(RUNTIME_DATA_DIR)
      ? undefined
      : requestDataDir;
  };

  function getProjectForRequest(
    req: Request,
    projectId: string,
    scope: ProjectOwnerScope = ownerScopeForRequest(req),
  ) {
    const project = getProject(db, projectId, scope);
    if (project) return project;
    const scopedProjectId = ownerScopedProjectId(projectId, ownerFieldsForRequest(req));
    return scopedProjectId === projectId ? null : getProject(db, scopedProjectId, scope);
  }

  function mediaTaskVisibleToRequest(
    req: Request,
    task: { projectId?: unknown; ownerEmail?: unknown },
  ): boolean {
    const ownerEmail = typeof task.ownerEmail === 'string' && task.ownerEmail.length > 0
      ? task.ownerEmail
      : null;
    if (ownerEmail) return ownerScopeForRequest(req).ownerEmail === ownerEmail;
    const projectId = typeof task.projectId === 'string' ? task.projectId : '';
    if (!projectId) return false;
    if (getProjectForRequest(req, projectId)) return true;
    return !getProject(db, projectId);
  }

  const mediaPolicyForGrant = (grant: ToolTokenGrant | null):
    | { ok: true; policy: MediaExecutionPolicy }
    | { ok: false; code: string; message: string } => {
    if (!grant?.runId) return { ok: true, policy: defaultMediaExecutionPolicy() };
    const run = design.runs.get(grant.runId);
    if (!run) {
      return {
        ok: false,
        code: 'MEDIA_POLICY_UNAVAILABLE',
        message: 'media generation policy is unavailable for this run',
      };
    }
    return { ok: true, policy: run.mediaExecution ?? defaultMediaExecutionPolicy() };
  };

  const handleGenerate = async (
    req: any,
    res: any,
    options: { projectId: string; grant: ToolTokenGrant | null; projectScope?: ProjectOwnerScope },
  ) => {
    const projectId = options.projectId;
    const project = getProjectForRequest(req, projectId, options.projectScope);
    if (!project) return res.status(404).json({ error: 'project not found' });
    const resolvedProjectId = project.id;

    const surface = req.body?.surface;
    if (surface !== 'image' && surface !== 'video' && surface !== 'audio') {
      return sendApiError(res, 400, 'BAD_REQUEST', 'surface must be image, video, or audio');
    }
    const model = typeof req.body?.model === 'string' ? req.body.model : '';
    if (!model) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'model is required');
    }

    const policy = mediaPolicyForGrant(options.grant);
    if (!policy.ok) {
      return sendApiError(res, 403, policy.code, policy.message);
    }
    const denial = mediaPolicyDenial(policy.policy, { surface, model });
    if (denial) {
      return sendApiError(res, 403, denial.code, denial.message);
    }

    let task: ReturnType<typeof createMediaTask> | null = null;
    try {
      const taskId = randomUUID();
      task = createMediaTask(taskId, resolvedProjectId, {
        surface: req.body?.surface,
        model: req.body?.model,
        ...ownerFieldsForRequest(req),
      });
      console.error(
        `[task ${taskId.slice(0, 8)}] queued model=${req.body?.model} ` +
          `surface=${req.body?.surface} ` +
          `image=${req.body?.image ? 'yes' : 'no'} ` +
          `compositionDir=${req.body?.compositionDir ? 'yes' : 'no'}`,
      );

      const proxyDispatcher = proxyDispatcherRequestInit(process.env, {
        headersTimeout: LONG_MEDIA_PROXY_TIMEOUT_MS,
        bodyTimeout: LONG_MEDIA_PROXY_TIMEOUT_MS,
      });
      task.status = 'running';
      persistMediaTask(task);
      generateMedia({
        projectRoot: PROJECT_ROOT,
        projectsRoot: projectsDirFor(req),
        mediaConfigDataDir: mediaConfigDataDirFor(req),
        projectId: resolvedProjectId,
        surface: req.body?.surface,
        model: req.body?.model,
        prompt: req.body?.prompt,
        output: req.body?.output,
        aspect: req.body?.aspect,
        length:
          typeof req.body?.length === 'number' ? req.body.length : undefined,
        duration:
          typeof req.body?.duration === 'number'
            ? req.body.duration
            : undefined,
        voice: req.body?.voice,
        audioKind: req.body?.audioKind,
        language: typeof req.body?.language === 'string' ? req.body.language : undefined,
        loop: typeof req.body?.loop === 'boolean' ? req.body.loop : undefined,
        promptInfluence: typeof req.body?.promptInfluence === 'number'
          ? req.body.promptInfluence
          : undefined,
        compositionDir: req.body?.compositionDir,
        image: req.body?.image,
        images: Array.isArray(req.body?.images) ? req.body.images : undefined,
        onProgress: (line: any) => appendTaskProgress(task, line),
        requestInit: proxyDispatcher.requestInit,
      })
        .then((meta: any) => {
          task.status = 'done';
          task.file = meta;
          task.endedAt = Date.now();
          persistMediaTask(task);
          notifyTaskWaiters(task);
          console.error(
            `[task ${taskId.slice(0, 8)}] done size=${meta?.size} mime=${meta?.mime} ` +
              `elapsed=${Math.round((task.endedAt - task.startedAt) / 1000)}s`,
          );
        })
        .catch((err: any) => {
          task.status = 'failed';
          task.error = {
            message: String(err && err.message ? err.message : err),
            status: typeof err?.status === 'number' ? err.status : 400,
            code: err?.code,
          };
          task.endedAt = Date.now();
          persistMediaTask(task);
          notifyTaskWaiters(task);
          console.error(
            `[task ${taskId.slice(0, 8)}] failed status=${task.error.status} ` +
              `message=${(task.error.message || '').slice(0, 240)}`,
          );
        })
        .finally(() => proxyDispatcher.close());

      return res.status(202).json({
        taskId,
        status: task.status,
        startedAt: task.startedAt,
      });
    } catch (err: any) {
      if (task) {
        task.status = 'failed';
        task.error = {
          message: String(err && err.message ? err.message : err),
          status: typeof err?.status === 'number' ? err.status : 400,
          code: err?.code,
        };
        task.endedAt = Date.now();
        persistMediaTask(task);
        notifyTaskWaiters(task);
      }
      throw err;
    }
  };
  app.get('/api/media/models', (_req, res) => {
    res.json({
      providers: MEDIA_PROVIDERS,
      image: IMAGE_MODELS,
      video: VIDEO_MODELS,
      audio: AUDIO_MODELS_BY_KIND,
      aspects: MEDIA_ASPECTS,
      videoLengthsSec: VIDEO_LENGTHS_SEC,
      audioDurationsSec: AUDIO_DURATIONS_SEC,
    });
  });

  // Live AIHubMix media catalogue. The static IMAGE_MODELS registry only
  // seeds a couple of AIHubMix entries; the picker calls this to list the full
  // image-generation catalogue straight from AIHubMix
  // (GET /api/v1/models?type=image_generation, public). Ids are prefixed
  // `aihubmix-` so they stay unique and route through the AIHubMix renderer
  // (which strips the prefix to the wire name). Falls back to the cached copy
  // on upstream failure so a transient blip doesn't empty the picker.
  app.get('/api/media/providers/aihubmix/models', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const raw = req.query.type;
    const type: AIHubMixCatalogType =
      raw === 'llm' || raw === 'video' || raw === 'tts'
        ? raw
        : 'image_generation';
    // This is an unauthenticated, public GET. The AIHubMix catalogue lives at a
    // single fixed origin, so we deliberately do NOT honour a caller-supplied
    // `baseUrl` here — letting the caller pick the fetch target would open an
    // SSRF hole (e.g. pointing the daemon at http://169.254.169.254/ cloud
    // metadata). Hard-code the official origin instead; a custom BYOK base URL
    // only ever needs to differ for authenticated chat/media calls, not for
    // browsing the public model catalogue.
    const baseUrl = AIHUBMIX_DEFAULT_BASE_URL;
    const cacheKey = `${baseUrl}|${type}`;
    const cached = aihubmixCatalogCache.get(cacheKey);
    if (cached && Date.now() - cached.at < AIHUBMIX_CATALOG_TTL_MS) {
      return res.json({ ok: true, cached: true, models: cached.models });
    }
    const dispatcher = proxyDispatcherRequestInit();
    try {
      const resp = await fetch(aihubmixCatalogUrl(baseUrl, type), {
        ...dispatcher.requestInit,
        method: 'GET',
        // The catalogue endpoint is public — no auth header (sending an empty
        // Bearer would be rejected by some gateways).
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) {
        if (cached) return res.json({ ok: true, stale: true, models: cached.models });
        return res.status(502).json({ ok: false, detail: `aihubmix catalog ${resp.status}` });
      }
      const data = await resp.json();
      const models = parseAIHubMixCatalog(data).map((m) => ({
        id: `aihubmix-${m.id}`,
        label: m.label,
      }));
      aihubmixCatalogCache.set(cacheKey, { at: Date.now(), models });
      return res.json({ ok: true, models });
    } catch (err: any) {
      if (cached) return res.json({ ok: true, stale: true, models: cached.models });
      return res
        .status(502)
        .json({ ok: false, detail: String(err && err.message ? err.message : err) });
    } finally {
      await dispatcher.close();
    }
  });

  app.get('/api/media/config', async (req, res) => {
    try {
      const cfg = await readMaskedConfig(PROJECT_ROOT, mediaConfigDataDirFor(req));
      res.json(cfg);
    } catch (err: any) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.put('/api/media/config', async (req, res) => {
    try {
      const cfg = await writeConfig(PROJECT_ROOT, req.body, mediaConfigDataDirFor(req));
      res.json(cfg);
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 400;
      res
        .status(status)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.get('/api/media/providers/elevenlabs/voices', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const rawLimit = Number(req.query.limit);
      const limit = Number.isFinite(rawLimit) ? rawLimit : undefined;
      const proxyDispatcher = proxyDispatcherRequestInit(process.env);
      try {
        const voices = await listElevenLabsVoiceOptions(PROJECT_ROOT, {
          limit,
          mediaConfigDataDir: mediaConfigDataDirFor(req),
          requestInit: proxyDispatcher.requestInit,
        });
        res.json({ voices });
      } finally {
        await proxyDispatcher.close();
      }
    } catch (err: any) {
      const message = String(err && err.message ? err.message : err);
      const status = message.includes('no ElevenLabs API key') ? 400 : 502;
      res.status(status).json({ error: message });
    }
  });

  app.get('/api/app-config', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const config = await readAppConfig(runtimeDataDirFor(req));
      res.json({ config });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.put('/api/app-config', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const config = await writeAppConfig(runtimeDataDirFor(req), req.body);
      orbitServiceForRequest(req).configure(config.orbit);
      res.json({ config });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  // Lightweight existence probe for a single directory, used by the composer
  // to flag a working directory in red the moment its folder is gone (the
  // composer re-checks on focus / picker-open, so deletions reflect live).
  app.post('/api/dir-exists', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const dir = typeof req.body?.path === 'string' ? req.body.path : '';
    let exists = false;
    if (dir) {
      try {
        exists = fs.statSync(dir).isDirectory();
      } catch {
        exists = false;
      }
    }
    res.json({ exists });
  });

  // Recent working directories, pruned to those that still exist on disk. A
  // folder the user deleted (or an external drive that's gone) drops out of
  // the list here and the pruned list is persisted back, so the picker's
  // "recent folders" never offers a path that no longer resolves.
  app.get('/api/recent-dirs', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const config = await readAppConfig(RUNTIME_DATA_DIR);
      const recents = Array.isArray(config.recentLinkedDirs)
        ? config.recentLinkedDirs
        : [];
      const existing = recents.filter((dir: string) => {
        try {
          return fs.statSync(dir).isDirectory();
        } catch {
          return false;
        }
      });
      if (existing.length !== recents.length) {
        await writeAppConfig(RUNTIME_DATA_DIR, { recentLinkedDirs: existing });
      }
      /** @type {import('@open-design/contracts').RecentLinkedDirsResponse} */
      const body = { dirs: existing };
      res.json(body);
    } catch (err: any) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.get('/api/orbit/status', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const config = await readAppConfig(runtimeDataDirFor(req));
      const service = orbitServiceForRequest(req);
      service.configure(config.orbit);
      res.json(await service.status());
    } catch (err: any) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.post('/api/orbit/run', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const locale = typeof req.body?.locale === 'string' ? req.body.locale : null;
      const config = await readAppConfig(runtimeDataDirFor(req));
      const service = orbitServiceForRequest(req);
      service.configure(config.orbit);
      res.json(await service.start('manual', { locale }));
    } catch (err: any) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  // Native OS folder picker dialog. Returns { path: string | null }.
  app.post('/api/dialog/open-folder', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const selected = await openNativeFolderDialog();
      res.json({ path: selected });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: String(err && err.message ? err.message : err) });
    }
  });

  app.post('/api/projects/:id/media/generate', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({
        error:
          'cross-origin request rejected: media generation is restricted to the local UI / CLI',
      });
    }

    try {
      const grant = optionalToolGrantFromRequest(req, { operation: 'media:generate' });
      const grantDecision = resolveLegacyMediaRouteGrant({
        grant,
        projectId: req.params.id,
        requestProjectOverride,
        sandboxMode: isSandboxModeEnabled(process.env),
      });
      if (!grantDecision.ok) {
        return sendApiError(
          res,
          grantDecision.status,
          grantDecision.code,
          grantDecision.message,
          grantDecision.details ? { details: grantDecision.details } : {},
        );
      }
      await handleGenerate(req, res, {
        projectId: req.params.id,
        grant: grantDecision.grant,
        projectScope: ownerScopeForRequest(req),
      });
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 400;
      const code = err?.code;
      const body: any = { error: String(err && err.message ? err.message : err) };
      if (code) body.code = code;
      res.status(status).json(body);
    }
  });

  app.post('/api/tools/media/generate', async (req, res) => {
    const grant = authorizeToolRequest(req, res, 'media:generate');
    if (!grant) return;
    try {
      await handleGenerate(req, res, {
        projectId: grant.projectId,
        grant,
        projectScope: ownerScopeForRequest(req),
      });
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 400;
      const code = err?.code;
      const body: any = { error: String(err && err.message ? err.message : err) };
      if (code) body.code = code;
      res.status(status).json(body);
    }
  });

  app.post('/api/research/search', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({
        error:
          'cross-origin request rejected: research search is restricted to the local UI / CLI',
      });
    }

    try {
      const proxyDispatcher = proxyDispatcherRequestInit(process.env);
      try {
        const result = await searchResearch({
          projectRoot: PROJECT_ROOT,
          mediaConfigDataDir: mediaConfigDataDirFor(req),
          query: req.body?.query,
          maxSources:
            typeof req.body?.maxSources === 'number'
              ? req.body.maxSources
              : undefined,
          providers: Array.isArray(req.body?.providers)
            ? req.body.providers
            : undefined,
          requestInit: proxyDispatcher.requestInit,
        });
        res.json(result);
      } finally {
        await proxyDispatcher.close();
      }
    } catch (err: any) {
      if (err instanceof ResearchError) {
        return res.status(err.status).json({
          error: { code: err.code, message: err.message },
        });
      }
      res.status(500).json({
        error: {
          code: 'RESEARCH_FAILED',
          message: String(err && err.message ? err.message : err),
        },
      });
    }
  });

  app.post('/api/media/tasks/:id/wait', async (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const taskId = req.params.id;
    const task = getLiveMediaTask(taskId);
    if (!task) return res.status(404).json({ error: 'task not found' });
    if (!mediaTaskVisibleToRequest(req, task)) {
      return res.status(404).json({ error: 'task not found' });
    }

    const since = Number.isFinite(req.body?.since) ? Number(req.body.since) : 0;
    const requestedTimeout = Number.isFinite(req.body?.timeoutMs)
      ? Number(req.body.timeoutMs)
      : 25_000;
    const timeoutMs = Math.min(Math.max(requestedTimeout, 0), 25_000);

    const respond = () => {
      if (res.writableEnded) return;
      res.json(mediaTaskSnapshot(task, since));
    };

    if (
      task.status === 'done' ||
      task.status === 'failed' ||
      task.status === 'interrupted' ||
      task.progress.length > since
    ) {
      return respond();
    }

    let resolved = false;
    const wake = () => {
      if (resolved) return;
      resolved = true;
      task.waiters.delete(wake);
      clearTimeout(timer);
      respond();
    };
    task.waiters.add(wake);
    const timer = setTimeout(wake, timeoutMs);
    res.on('close', wake);
  });

  app.get('/api/projects/:id/media/tasks', (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    const projectId = req.params.id;
    const project = getProjectForRequest(req, projectId);
    if (!project) return res.status(404).json({ error: 'project not found' });
    const includeDone =
      req.query.includeDone === '1' || req.query.includeDone === 'true';
    const tasks = listMediaTasksByProject(db, project.id, {
      includeTerminal: includeDone,
    }).map((t: any) => ({
        taskId: t.id,
        status: t.status,
        startedAt: t.startedAt,
        endedAt: t.endedAt,
        elapsed: Math.round(((t.endedAt ?? Date.now()) - t.startedAt) / 1000),
        surface: t.surface,
        model: t.model,
        progress: t.progress.slice(-3),
        progressCount: t.progress.length,
        ...(t.status === 'done' ? { file: t.file } : {}),
        ...(t.status === 'failed' || t.status === 'interrupted' ? { error: t.error } : {}),
      }));
    res.json({ tasks });
  });

  // Multi-file upload that the chat composer uses for paste/drop/picker.
  // Files land flat in the project folder; the response carries the same
  // metadata as listFiles so the client can stage them as ChatAttachments
  // without a separate refetch.

}
