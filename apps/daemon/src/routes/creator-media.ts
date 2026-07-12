import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import { scanCreatorMediaRoot } from '../creator-media/scanner.js';
import { getCreatorMediaProjectData, linkCreatorTaskMediaAsset, unlinkCreatorTaskMediaAsset, upsertCreatorMediaAssets } from '../creator-media/store.js';
import { getCreatorWorkbenchProjectData } from '../creator-workbench-store.js';

export interface RegisterCreatorMediaRoutesDeps {
  paths: { RUNTIME_DATA_DIR: string };
  projectStore: { getProject: (db: unknown, projectId: string) => unknown };
  db: unknown;
}

export function registerCreatorMediaRoutes(app: Express, deps: RegisterCreatorMediaRoutesDeps): void {
  const requireProject = (projectId: string) => {
    if (!deps.projectStore.getProject(deps.db, projectId)) { const error = new Error('project not found') as Error & { status?: number }; error.status = 404; throw error; }
  };
  app.get('/api/projects/:id/creator-media-assets', async (req, res) => {
    try { requireProject(req.params.id); res.json(await getCreatorMediaProjectData(deps.paths.RUNTIME_DATA_DIR, req.params.id)); }
    catch (error) { res.status((error as { status?: number }).status ?? 400).json({ error: String((error as Error).message) }); }
  });
  app.post('/api/projects/:id/creator-media-roots', async (req, res) => {
    try {
      requireProject(req.params.id);
      const requested = typeof req.body?.rootPath === 'string' ? req.body.rootPath : '';
      if (!path.isAbsolute(requested)) throw new Error('rootPath must be an absolute directory');
      const rootPath = await fsp.realpath(requested);
      if (!(await fsp.stat(rootPath)).isDirectory()) throw new Error('rootPath must be a directory');
      const scan = await scanCreatorMediaRoot(rootPath);
      const assets = await upsertCreatorMediaAssets(deps.paths.RUNTIME_DATA_DIR, req.params.id, scan.discovered, { rootPath, complete: scan.errors.length === 0 });
      res.status(201).json({ assets, skipped: scan.skipped, errors: scan.errors });
    } catch (error) { res.status((error as { status?: number }).status ?? 400).json({ error: String((error as Error).message) }); }
  });
  app.post('/api/projects/:id/creator-tasks/:taskId/media-assets', async (req, res) => {
    try {
      requireProject(req.params.id);
      const assetId = typeof req.body?.assetId === 'string' ? req.body.assetId : '';
      if (!assetId) throw new Error('assetId is required');
      const tasks = await getCreatorWorkbenchProjectData(deps.paths.RUNTIME_DATA_DIR, req.params.id);
      if (!tasks.tasks.some((task) => task.id === req.params.taskId)) throw new Error('creator task not found');
      await linkCreatorTaskMediaAsset(deps.paths.RUNTIME_DATA_DIR, req.params.id, req.params.taskId, assetId);
      res.status(201).json({ ok: true });
    } catch (error) { res.status((error as { status?: number }).status ?? 400).json({ error: String((error as Error).message) }); }
  });
  app.delete('/api/projects/:id/creator-tasks/:taskId/media-assets/:assetId', async (req, res) => {
    try { requireProject(req.params.id); await unlinkCreatorTaskMediaAsset(deps.paths.RUNTIME_DATA_DIR, req.params.id, req.params.taskId, req.params.assetId); res.status(204).end(); }
    catch (error) { res.status((error as { status?: number }).status ?? 400).json({ error: String((error as Error).message) }); }
  });
}
