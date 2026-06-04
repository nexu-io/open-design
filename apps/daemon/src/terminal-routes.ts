import type { Express } from 'express';
import type { RouteDeps } from './server-context.js';
import type { createTerminalService } from './terminals.js';

export interface RegisterTerminalRoutesDeps
  extends RouteDeps<'db' | 'http' | 'paths' | 'projectStore' | 'projectFiles'> {
  terminals: ReturnType<typeof createTerminalService>;
}

/**
 * Interactive Terminal HTTP surface under `/api/projects/:id/terminals`.
 *
 * The transport deliberately mirrors the chat-run lifecycle: output streams
 * down over SSE (reusing `createSseResponse` with `Last-Event-ID` replay),
 * keystrokes and resizes flow back up over plain POST. No WebSocket. The
 * PTY runs the user's shell rooted at the project working directory, so both
 * the web `<TerminalViewer>` and `od shell` get the same shell as a hand-off
 * editor would open.
 */
export function registerTerminalRoutes(app: Express, ctx: RegisterTerminalRoutesDeps) {
  const { db, terminals } = ctx;
  const { sendApiError, createSseResponse } = ctx.http;
  const { PROJECTS_DIR } = ctx.paths;
  const { getProject } = ctx.projectStore;
  const { resolveProjectDir } = ctx.projectFiles;

  // Resolve the session and assert it belongs to the path project. Returns
  // null and sends a 404 when missing/foreign so callers can early-return.
  const resolveSession = (req: any, res: any) => {
    if (!getProject(db, req.params.id)) {
      sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      return null;
    }
    const session = terminals.get(req.params.tid);
    if (!session || session.projectId !== req.params.id) {
      sendApiError(res, 404, 'TERMINAL_NOT_FOUND', 'terminal not found');
      return null;
    }
    return session;
  };

  app.get('/api/projects/:id/terminals', (req, res) => {
    if (!getProject(db, req.params.id)) {
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
    }
    res.json({ terminals: terminals.list({ projectId: req.params.id }).map((s) => terminals.statusBody(s)) });
  });

  app.post('/api/projects/:id/terminals', async (req, res) => {
    const project = getProject(db, req.params.id);
    if (!project) {
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
    }
    const body = req.body || {};
    const cwd = resolveProjectDir(PROJECTS_DIR, project.id, project.metadata);
    try {
      const session = await terminals.create({
        projectId: project.id,
        cwd,
        cols: body.cols,
        rows: body.rows,
        shell: typeof body.shell === 'string' ? body.shell : null,
      });
      res.json({ terminal: terminals.statusBody(session) });
    } catch (err: any) {
      // The most common failure is a missing/uncompiled node-pty native
      // addon — surface it as a 500 with the underlying message so the
      // operator knows to re-run `pnpm install`.
      sendApiError(res, 500, 'TERMINAL_SPAWN_FAILED', err instanceof Error ? err.message : String(err));
    }
  });

  app.get('/api/projects/:id/terminals/:tid/stream', (req, res) => {
    const session = resolveSession(req, res);
    if (!session) return;
    terminals.stream(session, req, res, createSseResponse);
  });

  app.post('/api/projects/:id/terminals/:tid/stdin', (req, res) => {
    const session = resolveSession(req, res);
    if (!session) return;
    const data = req.body?.data;
    if (typeof data !== 'string') {
      return sendApiError(res, 400, 'BAD_REQUEST', 'data (string) is required');
    }
    const ok = terminals.write(session, data);
    res.json({ ok });
  });

  app.post('/api/projects/:id/terminals/:tid/resize', (req, res) => {
    const session = resolveSession(req, res);
    if (!session) return;
    const { cols, rows } = req.body || {};
    if (!Number.isFinite(Number(cols)) || !Number.isFinite(Number(rows))) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'cols and rows (numbers) are required');
    }
    const ok = terminals.resize(session, Number(cols), Number(rows));
    res.json({ ok, terminal: terminals.statusBody(session) });
  });

  const handleKill = (req: any, res: any) => {
    const session = resolveSession(req, res);
    if (!session) return;
    terminals.kill(session, 'SIGTERM');
    res.json({ terminal: terminals.statusBody(session) });
  };
  app.post('/api/projects/:id/terminals/:tid/kill', handleKill);
  app.delete('/api/projects/:id/terminals/:tid', handleKill);
}
