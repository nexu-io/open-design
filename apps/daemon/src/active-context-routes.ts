import type { Express } from 'express';
import { ACTIVE_CONTEXT_TTL_MS } from './constants.js';
import type { RouteDeps } from './server-context.js';

export interface RegisterActiveContextRoutesDeps extends RouteDeps<'db' | 'http' | 'projectStore'> {}

export function registerActiveContextRoutes(app: Express, ctx: RegisterActiveContextRoutesDeps) {
  const { db } = ctx;
  const { sendApiError, isLocalSameOrigin, resolvedPortRef } = ctx.http;
  const { getProject } = ctx.projectStore;
  const getResolvedPort = () => resolvedPortRef.current;

  // Soft "what is the user looking at right now in Open Design?" channel. The
  // web UI POSTs the current project + file on every route change; the MCP
  // surface reads it so a coding agent in another repo can resolve "the design
  // I have open" without the user typing the project id. In-memory only -
  // daemon restart clears it.
  let activeContext: { projectId: string; fileName: string | null; ts: number } | null = null;

  // Active context is private to the local machine. The daemon may bind beyond
  // loopback, so without an origin check a peer on the LAN could read what the
  // user is currently looking at (GET) or spoof it to redirect MCP fallbacks
  // (POST). The web proxies same-origin and MCP runs in-process via 127.0.0.1,
  // so both legitimate callers pass the check.
  app.post('/api/active', (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    try {
      const body = req.body || {};
      if (body.active === false) {
        activeContext = null;
        res.json({ active: false });
        return;
      }
      const projectId = typeof body.projectId === 'string' ? body.projectId : '';
      if (!projectId) {
        sendApiError(res, 400, 'BAD_REQUEST', 'projectId is required');
        return;
      }
      const fileName =
        typeof body.fileName === 'string' && body.fileName.length > 0
          ? body.fileName
          : null;
      activeContext = { projectId, fileName, ts: Date.now() };
      res.json({ active: true, ...activeContext });
    } catch (err) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get('/api/active', (req, res) => {
    if (!isLocalSameOrigin(req, getResolvedPort())) {
      return res.status(403).json({ error: 'cross-origin request rejected' });
    }
    if (!activeContext || Date.now() - activeContext.ts > ACTIVE_CONTEXT_TTL_MS) {
      activeContext = null;
      res.json({ active: false });
      return;
    }
    const project = getProject(db, activeContext.projectId);
    res.json({
      active: true,
      projectId: activeContext.projectId,
      projectName: project?.name ?? null,
      fileName: activeContext.fileName,
      ts: activeContext.ts,
      ageMs: Date.now() - activeContext.ts,
    });
  });
}
