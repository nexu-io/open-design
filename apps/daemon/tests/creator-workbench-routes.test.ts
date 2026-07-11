import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerCreatorWorkbenchRoutes } from '../src/routes/creator-workbench.js';

let dataDir = '';

async function listen(app: express.Express) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing test port');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function buildApp(projectIds = ['project-1']) {
  const app = express();
  app.use(express.json());
  registerCreatorWorkbenchRoutes(app, {
    db: {},
    paths: { RUNTIME_DATA_DIR: dataDir },
    projectStore: {
      getProject: (_db, projectId) => projectIds.includes(projectId) ? { id: projectId } : null,
    },
  });
  return app;
}

beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-creator-workbench-routes-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('creator workbench routes', () => {
  it('returns 404 instead of creating data for an unknown project', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const response = await fetch(`${baseUrl}/api/projects/missing/creator-tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '不应创建' }),
      });

      expect(response.status).toBe(404);
      await expect(fetch(`${baseUrl}/api/projects/missing/creator-workbench`)).resolves.toMatchObject({ status: 404 });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('creates, updates, and reads back creator task data', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const create = await fetch(`${baseUrl}/api/projects/project-1/creator-tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '整理素材', stage: 'material', priority: 'high' }),
      });
      expect(create.status).toBe(201);
      const created = await create.json() as { task: { id: string; stage: string; status: string } };
      expect(created.task).toMatchObject({ stage: 'material', status: 'todo' });

      const patch = await fetch(`${baseUrl}/api/projects/project-1/creator-tasks/${created.task.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stage: 'editing', status: 'ready' }),
      });
      expect(patch.status).toBe(200);
      await expect(patch.json()).resolves.toMatchObject({
        task: { id: created.task.id, stage: 'editing', status: 'ready' },
      });

      const data = await fetch(`${baseUrl}/api/projects/project-1/creator-workbench`);
      expect(data.status).toBe(200);
      await expect(data.json()).resolves.toMatchObject({
        tasks: [expect.objectContaining({ id: created.task.id, stage: 'editing', status: 'ready' })],
        activities: [],
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects a blocked task without a reason and returns its reason after a valid update', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const created = await fetch(`${baseUrl}/api/projects/project-1/creator-tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '补拍夜景' }),
      }).then((response) => response.json()) as { task: { id: string } };

      const rejected = await fetch(`${baseUrl}/api/projects/project-1/creator-tasks/${created.task.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'blocked' }),
      });
      expect(rejected.status).toBe(400);

      const accepted = await fetch(`${baseUrl}/api/projects/project-1/creator-tasks/${created.task.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'blocked', blockerNote: '缺少夜景素材' }),
      });
      expect(accepted.status).toBe(200);
      await expect(accepted.json()).resolves.toMatchObject({
        task: { status: 'blocked', blockerNote: '缺少夜景素材' },
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('records activity only for a task in the same project', async () => {
    const { server, baseUrl } = await listen(buildApp(['project-1', 'project-2']));
    try {
      const created = await fetch(`${baseUrl}/api/projects/project-1/creator-tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '剪辑第一版' }),
      }).then((response) => response.json()) as { task: { id: string } };

      const wrongProject = await fetch(`${baseUrl}/api/projects/project-2/creator-activities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskId: created.task.id, category: 'editing', title: '不能跨项目' }),
      });
      expect(wrongProject.status).toBe(400);

      const activity = await fetch(`${baseUrl}/api/projects/project-1/creator-activities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskId: created.task.id, category: 'editing', title: '开始粗剪' }),
      });
      expect(activity.status).toBe(201);
      await expect(activity.json()).resolves.toMatchObject({
        activity: { taskId: created.task.id, category: 'editing', title: '开始粗剪' },
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
