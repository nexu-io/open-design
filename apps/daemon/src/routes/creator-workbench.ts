import type { Express } from 'express';
import type {
  CreateCreatorActivityRequest,
  CreateCreatorTaskRequest,
  UpdateCreatorTaskRequest,
} from '@open-design/contracts';

import {
  createCreatorActivity,
  createCreatorTask,
  getCreatorWorkbenchProjectData,
  updateCreatorTask,
} from '../creator-workbench-store.js';

export interface RegisterCreatorWorkbenchRoutesDeps {
  paths: { RUNTIME_DATA_DIR: string };
  projectStore: { getProject: (db: unknown, projectId: string) => unknown };
  db: unknown;
}

function errorMessage(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message || error);
}

export function registerCreatorWorkbenchRoutes(
  app: Express,
  deps: RegisterCreatorWorkbenchRoutesDeps,
): void {
  const { RUNTIME_DATA_DIR } = deps.paths;
  const requireProject = (projectId: string) => {
    if (!deps.projectStore.getProject(deps.db, projectId)) {
      const error = new Error('project not found');
      (error as Error & { status?: number }).status = 404;
      throw error;
    }
  };

  app.get('/api/projects/:id/creator-workbench', async (req, res) => {
    try {
      requireProject(req.params.id);
      res.json(await getCreatorWorkbenchProjectData(RUNTIME_DATA_DIR, req.params.id));
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });

  app.post('/api/projects/:id/creator-tasks', async (req, res) => {
    try {
      requireProject(req.params.id);
      const task = await createCreatorTask(
        RUNTIME_DATA_DIR,
        req.params.id,
        (req.body ?? {}) as CreateCreatorTaskRequest,
      );
      res.status(201).json({ task });
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });

  app.patch('/api/projects/:id/creator-tasks/:taskId', async (req, res) => {
    try {
      requireProject(req.params.id);
      const task = await updateCreatorTask(
        RUNTIME_DATA_DIR,
        req.params.id,
        req.params.taskId,
        (req.body ?? {}) as UpdateCreatorTaskRequest,
      );
      if (!task) return res.status(404).json({ error: 'creator task not found' });
      res.json({ task });
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });

  app.post('/api/projects/:id/creator-activities', async (req, res) => {
    try {
      requireProject(req.params.id);
      const activity = await createCreatorActivity(
        RUNTIME_DATA_DIR,
        req.params.id,
        (req.body ?? {}) as CreateCreatorActivityRequest,
      );
      res.status(201).json({ activity });
    } catch (error) {
      res.status((error as { status?: number }).status ?? 400).json({ error: errorMessage(error) });
    }
  });
}
