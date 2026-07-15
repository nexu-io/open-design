import type { Express } from 'express';
import type {
  CreateCreatorContentRequest,
  UpdateCreatorContentRequest,
} from '@open-design/contracts';

import {
  createCreatorContent,
  deleteCreatorContent,
  getCreatorContentProjectData,
  linkCreatorContentTask,
  linkCreatorStoryboardMedia,
  unlinkCreatorContentTask,
  unlinkCreatorStoryboardMedia,
  updateCreatorContent,
} from '../creator-content/store.js';
import { getCreatorMediaProjectData } from '../creator-media/store.js';
import { getCreatorWorkbenchProjectData } from '../creator-workbench-store.js';

export interface RegisterCreatorContentRoutesDeps {
  paths: { RUNTIME_DATA_DIR: string };
  projectStore: { getProject: (db: unknown, projectId: string) => unknown };
  db: unknown;
}

function errorMessage(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message || error);
}

function requireId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value;
}

export function registerCreatorContentRoutes(
  app: Express,
  deps: RegisterCreatorContentRoutesDeps,
): void {
  const { RUNTIME_DATA_DIR } = deps.paths;
  const requireProject = (projectId: string) => {
    if (!deps.projectStore.getProject(deps.db, projectId)) {
      const error = new Error('project not found') as Error & { status?: number };
      error.status = 404;
      throw error;
    }
  };
  const requireContentId = (contentId: string) => requireId(contentId, 'content id');
  const requireStoryboardItemId = (itemId: string) => requireId(itemId, 'storyboard item id');
  const validateStoryboardMediaPatch = async (projectId: string, contentId: string, patch: Record<string, unknown>) => {
    if (patch.storyboardItems === undefined) return;
    if (!Array.isArray(patch.storyboardItems)) throw new Error('storyboard items must be an array');

    const contentData = await getCreatorContentProjectData(RUNTIME_DATA_DIR, projectId);
    const current = contentData.contentProjects.find((content) => content.id === contentId);
    if (!current) {
      const error = new Error('creator content not found') as Error & { status?: number };
      error.status = 404;
      throw error;
    }
    const media = await getCreatorMediaProjectData(RUNTIME_DATA_DIR, projectId);
    for (const item of patch.storyboardItems) {
      const inputItem = item as { position?: unknown; mediaAssetIds?: unknown } | null;
      const mediaAssetIds = inputItem?.mediaAssetIds;
      if (mediaAssetIds === undefined || !Array.isArray(mediaAssetIds)) continue;
      const existingItem = current.storyboardItems.find((entry) => entry.position === inputItem?.position);
      for (const assetId of mediaAssetIds) {
        const asset = media.assets.find((entry) => entry.id === assetId);
        if (asset?.availability === 'available') continue;
        if (asset?.availability === 'missing' && existingItem?.mediaAssetIds.includes(assetId)) continue;
        throw new Error('creator media asset must be available in this project');
      }
    }
  };

  app.get('/api/projects/:id/creator-content', async (req, res) => {
    try {
      requireProject(req.params.id);
      res.json(await getCreatorContentProjectData(RUNTIME_DATA_DIR, req.params.id));
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });

  app.post('/api/projects/:id/creator-content', async (req, res) => {
    try {
      requireProject(req.params.id);
      const content = await createCreatorContent(
        RUNTIME_DATA_DIR,
        req.params.id,
        (req.body ?? {}) as CreateCreatorContentRequest,
      );
      res.status(201).json({ content });
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });

  app.patch('/api/projects/:id/creator-content/:contentId', async (req, res) => {
    try {
      requireProject(req.params.id);
      const contentId = requireContentId(req.params.contentId);
      const patch = (req.body ?? {}) as Record<string, unknown>;
      await validateStoryboardMediaPatch(req.params.id, contentId, patch);
      const content = await updateCreatorContent(
        RUNTIME_DATA_DIR,
        req.params.id,
        contentId,
        patch as UpdateCreatorContentRequest,
      );
      if (!content) return res.status(404).json({ error: 'creator content not found' });
      res.json({ content });
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });

  app.delete('/api/projects/:id/creator-content/:contentId', async (req, res) => {
    try {
      requireProject(req.params.id);
      const deleted = await deleteCreatorContent(
        RUNTIME_DATA_DIR,
        req.params.id,
        requireContentId(req.params.contentId),
      );
      if (!deleted) return res.status(404).json({ error: 'creator content not found' });
      res.status(204).end();
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });

  app.post('/api/projects/:id/creator-content/:contentId/tasks', async (req, res) => {
    try {
      requireProject(req.params.id);
      const contentId = requireContentId(req.params.contentId);
      const taskId = requireId(req.body?.taskId, 'task id');
      const workbench = await getCreatorWorkbenchProjectData(RUNTIME_DATA_DIR, req.params.id);
      if (!workbench.tasks.some((task) => task.id === taskId)) throw new Error('creator task not found');
      const content = await linkCreatorContentTask(RUNTIME_DATA_DIR, req.params.id, contentId, taskId);
      res.status(201).json({ content });
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });

  app.delete('/api/projects/:id/creator-content/:contentId/tasks/:taskId', async (req, res) => {
    try {
      requireProject(req.params.id);
      await unlinkCreatorContentTask(
        RUNTIME_DATA_DIR,
        req.params.id,
        requireContentId(req.params.contentId),
        requireId(req.params.taskId, 'task id'),
      );
      res.status(204).end();
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });

  app.post('/api/projects/:id/creator-content/:contentId/storyboard/:itemId/media-assets', async (req, res) => {
    try {
      requireProject(req.params.id);
      const contentId = requireContentId(req.params.contentId);
      const itemId = requireStoryboardItemId(req.params.itemId);
      const assetId = requireId(req.body?.assetId, 'media asset id');
      const media = await getCreatorMediaProjectData(RUNTIME_DATA_DIR, req.params.id);
      const asset = media.assets.find((entry) => entry.id === assetId);
      if (!asset) throw new Error('creator media asset not found');
      if (asset.availability !== 'available') throw new Error('creator media asset is not available');
      const content = await linkCreatorStoryboardMedia(RUNTIME_DATA_DIR, req.params.id, contentId, itemId, assetId);
      res.status(201).json({ content });
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });

  app.delete('/api/projects/:id/creator-content/:contentId/storyboard/:itemId/media-assets/:assetId', async (req, res) => {
    try {
      requireProject(req.params.id);
      await unlinkCreatorStoryboardMedia(
        RUNTIME_DATA_DIR,
        req.params.id,
        requireContentId(req.params.contentId),
        requireStoryboardItemId(req.params.itemId),
        requireId(req.params.assetId, 'media asset id'),
      );
      res.status(204).end();
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });
}
