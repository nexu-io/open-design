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
      res.json({ browserSession: await browserSessions.create() });
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
    res.json({ closed: await browserSessions.close(req.params.sessionId) });
  });
}
