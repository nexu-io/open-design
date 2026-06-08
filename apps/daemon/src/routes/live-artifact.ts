import type { Express, Request, Response } from 'express';
import type { RouteDeps } from '../server-context.js';
import { connectorServiceForDataDir } from '../connectors/service.js';
import { ownerFieldsForRequest, ownerScopeForRequest } from '../project-owner-scope.js';

export interface RegisterLiveArtifactRoutesDeps extends RouteDeps<'db' | 'http' | 'paths' | 'auth' | 'liveArtifacts' | 'projectStore'> {}

export function registerLiveArtifactRoutes(app: Express, ctx: RegisterLiveArtifactRoutesDeps) {
  const { db } = ctx;
  const { sendApiError, sendLiveArtifactRouteError, requireLocalDaemonRequest } = ctx.http;
  const { projectsDirFor, runtimeDataDirFor } = ctx.paths;
  const { authorizeToolRequest, requestProjectOverride, requestRunOverride } = ctx.auth;
  const { createLiveArtifact, listLiveArtifacts, updateLiveArtifact, refreshLiveArtifact, emitLiveArtifactEvent, emitLiveArtifactRefreshEvent, readLiveArtifactCode, setLiveArtifactCodeHeaders, ensureLiveArtifactPreview, setLiveArtifactPreviewHeaders, getLiveArtifact, listLiveArtifactRefreshLogEntries, readLiveArtifactOwnerMetadata, deleteLiveArtifact } = ctx.liveArtifacts;
  const { getProject, updateProject } = ctx.projectStore;

  type ProjectVisibility = 'visible' | 'hidden' | 'missing';

  function liveArtifactProjectVisibilityForRequest(req: Request, projectId: string): ProjectVisibility {
    if (getProject(db, projectId, ownerScopeForRequest(req))) return 'visible';
    if (getProject(db, projectId)) return 'hidden';
    return 'missing';
  }

  async function liveArtifactOwnerVisibleToRequest(
    req: Request,
    projectId: string,
    artifactId: string,
  ): Promise<boolean | null> {
    const owner = await readLiveArtifactOwnerMetadata({
      projectsRoot: projectsDirFor(req),
      projectId,
      artifactId,
    });
    if (!owner?.ownerEmail) return null;
    return ownerScopeForRequest(req).ownerEmail === owner.ownerEmail;
  }

  async function requireVisibleLiveArtifactProject(
    req: Request,
    res: Response,
    artifactId?: string,
  ): Promise<string | null> {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    if (!projectId) {
      sendApiError(res, 400, 'BAD_REQUEST', 'projectId query parameter is required');
      return null;
    }
    const visibility = liveArtifactProjectVisibilityForRequest(req, projectId);
    if (visibility === 'visible') return projectId;
    if ((visibility === 'missing' || visibility === 'hidden') && artifactId) {
      const ownerVisible = await liveArtifactOwnerVisibleToRequest(req, projectId, artifactId);
      if (ownerVisible === true) return projectId;
      if (visibility === 'missing' && ownerVisible === null && ownerScopeForRequest(req).includeOwnerless) {
        return projectId;
      }
    }
    if (visibility === 'missing' && !artifactId && ownerScopeForRequest(req).includeOwnerless) {
      return projectId;
    }
    sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
    return null;
  }

  app.get('/api/live-artifacts', async (req, res) => {
    try {
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      if (!projectId) {
        sendApiError(res, 400, 'BAD_REQUEST', 'projectId query parameter is required');
        return;
      }
      const visibility = liveArtifactProjectVisibilityForRequest(req, projectId);
      let artifacts = await listLiveArtifacts({
        projectsRoot: projectsDirFor(req),
        projectId,
      });
      if (visibility !== 'visible' && !ownerScopeForRequest(req).includeOwnerless) {
        const filtered = [];
        for (const artifact of artifacts) {
          const ownerVisible = await liveArtifactOwnerVisibleToRequest(req, projectId, artifact.id);
          if (ownerVisible === true) filtered.push(artifact);
        }
        artifacts = filtered;
        if (visibility === 'hidden' && artifacts.length === 0) {
          sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
          return;
        }
      }
      res.json({ artifacts });
    } catch (err: any) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.options('/api/live-artifacts/:artifactId/preview', requireLocalDaemonRequest, (_req, res) => {
    res.status(204).end();
  });

  app.get('/api/live-artifacts/:artifactId/preview', requireLocalDaemonRequest, async (req, res) => {
    try {
      const projectId = await requireVisibleLiveArtifactProject(req, res, req.params.artifactId);
      if (!projectId) return;

      const variant = typeof req.query.variant === 'string' ? req.query.variant : 'rendered';
      if (variant === 'template' || variant === 'rendered-source') {
        const html = await readLiveArtifactCode({
          projectsRoot: projectsDirFor(req),
          projectId,
          artifactId: req.params.artifactId,
          variant: variant === 'template' ? 'template' : 'rendered',
        });
        setLiveArtifactCodeHeaders(res);
        return res.status(200).send(html);
      }
      if (variant !== 'rendered') {
        return sendApiError(res, 400, 'BAD_REQUEST', 'variant must be rendered, template, or rendered-source');
      }

      const record = await ensureLiveArtifactPreview({
        projectsRoot: projectsDirFor(req),
        projectId,
        artifactId: req.params.artifactId,
      });
      setLiveArtifactPreviewHeaders(res);
      res.status(200).send(record.html);
    } catch (err: any) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.get('/api/live-artifacts/:artifactId', async (req, res) => {
    try {
      const projectId = await requireVisibleLiveArtifactProject(req, res, req.params.artifactId);
      if (!projectId) return;

      const record = await getLiveArtifact({
        projectsRoot: projectsDirFor(req),
        projectId,
        artifactId: req.params.artifactId,
      });
      res.json({ artifact: record.artifact });
    } catch (err: any) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.get('/api/live-artifacts/:artifactId/refreshes', async (req, res) => {
    try {
      const projectId = await requireVisibleLiveArtifactProject(req, res, req.params.artifactId);
      if (!projectId) return;

      const refreshes = await listLiveArtifactRefreshLogEntries({
        projectsRoot: projectsDirFor(req),
        projectId,
        artifactId: req.params.artifactId,
      });
      res.json({ refreshes });
    } catch (err: any) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.post('/api/tools/live-artifacts/create', async (req, res) => {
    try {
      const toolGrant = authorizeToolRequest(req, res, 'live-artifacts:create');
      if (!toolGrant) return;
      const { projectId, input, templateHtml, provenanceJson, createdByRunId } = req.body || {};
      if (requestProjectOverride(projectId, toolGrant.projectId)) {
        return sendApiError(res, 403, 'FORBIDDEN', 'projectId is derived from the tool token', {
          details: { suppliedProjectId: projectId },
        });
      }
      if (requestRunOverride(createdByRunId, toolGrant.runId)) {
        return sendApiError(res, 403, 'FORBIDDEN', 'createdByRunId is derived from the tool token', {
          details: { suppliedRunId: createdByRunId },
        });
      }

      const record = await createLiveArtifact({
        projectsRoot: projectsDirFor(req),
        projectId: toolGrant.projectId,
        input: input ?? {},
        templateHtml,
        provenanceJson,
        createdByRunId: toolGrant.runId,
        ...ownerFieldsForRequest(req),
      });
      emitLiveArtifactEvent(toolGrant, 'created', record.artifact);
      res.json({ artifact: record.artifact });
    } catch (err: any) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.get('/api/tools/live-artifacts/list', async (req, res) => {
    try {
      const toolGrant = authorizeToolRequest(req, res, 'live-artifacts:list');
      if (!toolGrant) return;
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      if (requestProjectOverride(projectId, toolGrant.projectId)) {
        return sendApiError(res, 403, 'FORBIDDEN', 'projectId is derived from the tool token', {
          details: { suppliedProjectId: projectId },
        });
      }

      const artifacts = await listLiveArtifacts({
        projectsRoot: projectsDirFor(req),
        projectId: toolGrant.projectId,
      });
      res.json({ artifacts });
    } catch (err: any) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.post('/api/tools/live-artifacts/update', async (req, res) => {
    try {
      const toolGrant = authorizeToolRequest(req, res, 'live-artifacts:update');
      if (!toolGrant) return;
      const { projectId, artifactId, input, templateHtml, provenanceJson } = req.body || {};
      if (requestProjectOverride(projectId, toolGrant.projectId)) {
        return sendApiError(res, 403, 'FORBIDDEN', 'projectId is derived from the tool token', {
          details: { suppliedProjectId: projectId },
        });
      }
      if (typeof artifactId !== 'string' || artifactId.length === 0) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'artifactId is required');
      }

      const record = await updateLiveArtifact({
        projectsRoot: projectsDirFor(req),
        projectId: toolGrant.projectId,
        artifactId,
        input: input ?? {},
        templateHtml,
        provenanceJson,
      });
      emitLiveArtifactEvent(toolGrant, 'updated', record.artifact);
      res.json({ artifact: record.artifact });
    } catch (err: any) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.post('/api/tools/live-artifacts/refresh', async (req, res) => {
    try {
      const toolGrant = authorizeToolRequest(req, res, 'live-artifacts:refresh');
      if (!toolGrant) return;
      const { projectId, artifactId } = req.body || {};
      if (requestProjectOverride(projectId, toolGrant.projectId)) {
        return sendApiError(res, 403, 'FORBIDDEN', 'projectId is derived from the tool token', {
          details: { suppliedProjectId: projectId },
        });
      }
      if (typeof artifactId !== 'string' || artifactId.length === 0) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'artifactId is required');
      }

      let result;
      try {
        result = await refreshLiveArtifact({
          projectsRoot: projectsDirFor(req),
          projectId: toolGrant.projectId,
          artifactId,
          connectorService: connectorServiceForDataDir(runtimeDataDirFor(req)),
          onStarted: ({ refreshId }: any) => {
            emitLiveArtifactRefreshEvent(toolGrant, { phase: 'started', artifactId, refreshId });
          },
        });
      } catch (refreshErr) {
        emitLiveArtifactRefreshEvent(toolGrant, {
          phase: 'failed',
          artifactId,
          error: refreshErr instanceof Error ? refreshErr.message : String(refreshErr),
        });
        throw refreshErr;
      }
      emitLiveArtifactRefreshEvent(toolGrant, {
        phase: 'succeeded',
        artifactId,
        refreshId: result.refresh.id,
        title: result.artifact.title,
        refreshedSourceCount: result.refresh.refreshedSourceCount,
      });
      res.json(result);
    } catch (err: any) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.patch('/api/live-artifacts/:artifactId', async (req, res) => {
    try {
      const projectId = await requireVisibleLiveArtifactProject(req, res, req.params.artifactId);
      if (!projectId) return;

      const record = await updateLiveArtifact({
        projectsRoot: projectsDirFor(req),
        projectId,
        artifactId: req.params.artifactId,
        input: req.body ?? {},
      });
      emitLiveArtifactEvent({ projectId }, 'updated', record.artifact);
      res.json({ artifact: record.artifact });
    } catch (err: any) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.delete('/api/live-artifacts/:artifactId', async (req, res) => {
    try {
      const projectId = await requireVisibleLiveArtifactProject(req, res, req.params.artifactId);
      if (!projectId) return;

      const existing = await getLiveArtifact({
        projectsRoot: projectsDirFor(req),
        projectId,
        artifactId: req.params.artifactId,
      });
      await deleteLiveArtifact({
        projectsRoot: projectsDirFor(req),
        projectId,
        artifactId: req.params.artifactId,
      });
      updateProject(db, projectId, {}, ownerScopeForRequest(req));
      emitLiveArtifactEvent({ projectId }, 'deleted', existing.artifact);
      res.json({ ok: true });
    } catch (err: any) {
      sendLiveArtifactRouteError(res, err);
    }
  });

  app.options('/api/live-artifacts/:artifactId/refresh', requireLocalDaemonRequest, (_req, res) => {
    res.status(204).end();
  });

  app.post('/api/live-artifacts/:artifactId/refresh', requireLocalDaemonRequest, async (req, res) => {
    try {
      const projectId = await requireVisibleLiveArtifactProject(req, res, req.params.artifactId);
      if (!projectId) return;

      let result;
      try {
        result = await refreshLiveArtifact({
          projectsRoot: projectsDirFor(req),
          projectId,
          artifactId: req.params.artifactId,
          connectorService: connectorServiceForDataDir(runtimeDataDirFor(req)),
          onStarted: ({ refreshId }: any) => {
            emitLiveArtifactRefreshEvent({ projectId }, { phase: 'started', artifactId: req.params.artifactId, refreshId });
          },
        });
      } catch (refreshErr) {
        emitLiveArtifactRefreshEvent({ projectId }, {
          phase: 'failed',
          artifactId: req.params.artifactId,
          error: refreshErr instanceof Error ? refreshErr.message : String(refreshErr),
        });
        throw refreshErr;
      }
      emitLiveArtifactRefreshEvent({ projectId }, {
        phase: 'succeeded',
        artifactId: req.params.artifactId,
        refreshId: result.refresh.id,
        title: result.artifact.title,
        refreshedSourceCount: result.refresh.refreshedSourceCount,
      });
      res.json(result);
    } catch (err: any) {
      sendLiveArtifactRouteError(res, err);
    }
  });

}
