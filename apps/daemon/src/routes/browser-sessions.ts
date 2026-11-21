import type { Express } from 'express';
import type { BrowserSessionService } from '../browser-sessions.js';
import type { AuthorizeProjectRequest } from '../collab/project-request-authority.js';
import type { RouteDeps } from '../server-context.js';

export interface RegisterBrowserSessionRoutesDeps extends RouteDeps<'db' | 'http' | 'projectStore'> {
  browserSessions: BrowserSessionService;
  authorizeProjectRequest: AuthorizeProjectRequest;
}

export function registerBrowserSessionRoutes(app: Express, ctx: RegisterBrowserSessionRoutesDeps): void {
  const { db, browserSessions, authorizeProjectRequest } = ctx;
  const { getProject } = ctx.projectStore;
  const { sendApiError } = ctx.http;

  app.post('/api/projects/:id/browser-sessions', async (req, res) => {
    if (!getProject(db, req.params.id)) {
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
    }
    if (!await authorizeProjectRequest(req, res, req.params.id, { mode: 'read' })) return;
    try {
      res.json({ browserSession: await browserSessions.create(req.params.id) });
    } catch (error) {
      sendApiError(
        res,
        503,
        'BROWSER_SESSION_START_FAILED',
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  app.delete('/api/projects/:id/browser-sessions/:sessionId', async (req, res) => {
    if (!getProject(db, req.params.id)) {
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
    }
    if (!await authorizeProjectRequest(req, res, req.params.id, { mode: 'read' })) return;
    res.json({ closed: await browserSessions.close(req.params.id, req.params.sessionId) });
  });

  app.post('/api/projects/:id/browser-sessions/:sessionId/pages', async (req, res) => {
    if (!getProject(db, req.params.id)) {
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
    }
    if (!await authorizeProjectRequest(req, res, req.params.id, { mode: 'read' })) return;
    try {
      const page = await browserSessions.createPage(req.params.id, req.params.sessionId);
      if (!page) return sendApiError(res, 404, 'BROWSER_SESSION_NOT_FOUND', 'browser session not found');
      res.json({ page });
    } catch (error) {
      sendApiError(res, 503, 'BROWSER_PAGE_START_FAILED', error instanceof Error ? error.message : String(error));
    }
  });

  app.post('/api/projects/:id/browser-sessions/:sessionId/pages/:pageId/commands', async (req, res) => {
    if (!getProject(db, req.params.id)) {
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
    }
    if (!await authorizeProjectRequest(req, res, req.params.id, { mode: 'read' })) return;
    const method = typeof req.body?.method === 'string' ? req.body.method : '';
    const params = req.body?.params && typeof req.body.params === 'object' && !Array.isArray(req.body.params)
      ? req.body.params as Record<string, unknown>
      : {};
    try {
      const result = await browserSessions.command(
        req.params.id,
        req.params.sessionId,
        req.params.pageId,
        method,
        params,
      );
      if (!result) return sendApiError(res, 404, 'BROWSER_PAGE_NOT_FOUND', 'browser page not found');
      res.json({ result });
    } catch (error) {
      sendApiError(res, 400, 'BROWSER_COMMAND_REJECTED', error instanceof Error ? error.message : String(error));
    }
  });

  app.get('/api/projects/:id/browser-sessions/:sessionId/pages/:pageId/events', async (req, res) => {
    if (!getProject(db, req.params.id)) {
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
    }
    if (!await authorizeProjectRequest(req, res, req.params.id, { mode: 'read' })) return;
    const after = Math.max(0, Number.parseInt(String(req.query.after ?? '0'), 10) || 0);
    const timeoutMs = Math.min(25_000, Math.max(0, Number.parseInt(String(req.query.timeout ?? '20000'), 10) || 0));
    const events = await browserSessions.events(
      req.params.id,
      req.params.sessionId,
      req.params.pageId,
      after,
      timeoutMs,
    );
    if (!events) return sendApiError(res, 404, 'BROWSER_PAGE_NOT_FOUND', 'browser page not found');
    res.json({ events });
  });

  app.delete('/api/projects/:id/browser-sessions/:sessionId/pages/:pageId', async (req, res) => {
    if (!getProject(db, req.params.id)) {
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
    }
    if (!await authorizeProjectRequest(req, res, req.params.id, { mode: 'read' })) return;
    res.json({ closed: await browserSessions.closePage(
      req.params.id,
      req.params.sessionId,
      req.params.pageId,
    ) });
  });
}
