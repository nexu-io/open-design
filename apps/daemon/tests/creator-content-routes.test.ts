import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerCreatorContentRoutes } from '../src/routes/creator-content.js';
import { createCreatorTask, getCreatorWorkbenchProjectData } from '../src/creator-workbench-store.js';
import { getCreatorMediaProjectData, upsertCreatorMediaAssets } from '../src/creator-media/store.js';

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
  registerCreatorContentRoutes(app, {
    db: {},
    paths: { RUNTIME_DATA_DIR: dataDir },
    projectStore: {
      getProject: (_db, projectId) => projectIds.includes(projectId) ? { id: projectId } : null,
    },
  });
  return app;
}

async function createContent(baseUrl: string, title = '毕业季纪录片') {
  const response = await fetch(`${baseUrl}/api/projects/project-1/creator-content`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<{ content: { id: string; storyboardItems: Array<{ id: string }> } }>;
}

beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-creator-content-routes-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('creator content routes', () => {
  it('returns 404 for an unknown project before reading or creating content', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      await expect(fetch(`${baseUrl}/api/projects/missing/creator-content`)).resolves.toMatchObject({ status: 404 });
      const create = await fetch(`${baseUrl}/api/projects/missing/creator-content`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '不应创建' }),
      });
      expect(create.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('creates, reads, updates, and deletes content within its project', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const content = await createContent(baseUrl);
      expect(content.content).toMatchObject({ title: '毕业季纪录片', status: 'idea', taskIds: [] });

      const update = await fetch(`${baseUrl}/api/projects/project-1/creator-content/${content.content.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'drafting',
          brief: { topic: '毕业季', targetPlatform: 'bilibili' },
          storyboardItems: [{ position: 1, purpose: '宿舍清晨' }],
        }),
      });
      expect(update.status).toBe(200);
      await expect(update.json()).resolves.toMatchObject({
        content: { id: content.content.id, status: 'drafting', brief: { topic: '毕业季' }, storyboardItems: [{ position: 1, purpose: '宿舍清晨' }] },
      });

      const data = await fetch(`${baseUrl}/api/projects/project-1/creator-content`);
      expect(data.status).toBe(200);
      await expect(data.json()).resolves.toMatchObject({
        contentProjects: [expect.objectContaining({ id: content.content.id, title: '毕业季纪录片' })],
      });

      const remove = await fetch(`${baseUrl}/api/projects/project-1/creator-content/${content.content.id}`, { method: 'DELETE' });
      expect(remove.status).toBe(204);
      await expect(fetch(`${baseUrl}/api/projects/project-1/creator-content`)
        .then((response) => response.json())).resolves.toEqual({ contentProjects: [] });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('returns 404 for a content project that does not exist', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const patch = await fetch(`${baseUrl}/api/projects/project-1/creator-content/creator-content:missing`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '不存在' }),
      });
      expect(patch.status).toBe(404);
      const remove = await fetch(`${baseUrl}/api/projects/project-1/creator-content/creator-content:missing`, { method: 'DELETE' });
      expect(remove.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('links only a task from the same project and makes unlink idempotent', async () => {
    const { server, baseUrl } = await listen(buildApp(['project-1', 'project-2']));
    try {
      const content = await createContent(baseUrl);
      const task = await createCreatorTask(dataDir, 'project-1', { title: '粗剪第一版' });
      const otherTask = await createCreatorTask(dataDir, 'project-2', { title: '别的项目任务' });

      const linked = await fetch(`${baseUrl}/api/projects/project-1/creator-content/${content.content.id}/tasks`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskId: task.id }),
      });
      expect(linked.status).toBe(201);
      await expect(linked.json()).resolves.toMatchObject({ content: { taskIds: [task.id] } });

      const crossProject = await fetch(`${baseUrl}/api/projects/project-1/creator-content/${content.content.id}/tasks`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskId: otherTask.id }),
      });
      expect(crossProject.status).toBe(400);

      const unlink = `${baseUrl}/api/projects/project-1/creator-content/${content.content.id}/tasks/${task.id}`;
      expect((await fetch(unlink, { method: 'DELETE' })).status).toBe(204);
      expect((await fetch(unlink, { method: 'DELETE' })).status).toBe(204);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('links only available media from the same project and rejects missing or cross-project assets', async () => {
    const { server, baseUrl } = await listen(buildApp(['project-1', 'project-2']));
    try {
      const content = await createContent(baseUrl);
      const updated = await fetch(`${baseUrl}/api/projects/project-1/creator-content/${content.content.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storyboardItems: [{ position: 1, purpose: '校园航拍' }] }),
      }).then((response) => response.json()) as { content: { storyboardItems: Array<{ id: string }> } };
      const itemId = updated.content.storyboardItems[0]!.id;
      const [available] = await upsertCreatorMediaAssets(dataDir, 'project-1', [{
        rootPath: 'C:\\media', sourcePath: 'C:\\media\\campus.mp4', relativePath: 'campus.mp4', fileName: 'campus.mp4', extension: '.mp4', kind: 'video', sizeBytes: 100, modifiedAt: new Date().toISOString(), availability: 'available', thumbnailStatus: 'ready',
      }]);
      const [missing] = await upsertCreatorMediaAssets(dataDir, 'project-1', [{
        rootPath: 'C:\\media', sourcePath: 'C:\\media\\gone.mp4', relativePath: 'gone.mp4', fileName: 'gone.mp4', extension: '.mp4', kind: 'video', sizeBytes: 100, modifiedAt: new Date().toISOString(), availability: 'missing', thumbnailStatus: 'unavailable',
      }]);
      const [otherAsset] = await upsertCreatorMediaAssets(dataDir, 'project-2', [{
        rootPath: 'C:\\other', sourcePath: 'C:\\other\\clip.mp4', relativePath: 'clip.mp4', fileName: 'clip.mp4', extension: '.mp4', kind: 'video', sizeBytes: 100, modifiedAt: new Date().toISOString(), availability: 'available', thumbnailStatus: 'ready',
      }]);
      const linkUrl = `${baseUrl}/api/projects/project-1/creator-content/${content.content.id}/storyboard/${itemId}/media-assets`;

      const linked = await fetch(linkUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId: available!.id }) });
      expect(linked.status).toBe(201);
      await expect(linked.json()).resolves.toMatchObject({ content: { storyboardItems: [{ id: itemId, mediaAssetIds: [available!.id] }] } });
      expect((await fetch(linkUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId: missing!.id }) })).status).toBe(400);
      expect((await fetch(linkUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId: otherAsset!.id }) })).status).toBe(400);

      const unlink = `${linkUrl}/${available!.id}`;
      expect((await fetch(unlink, { method: 'DELETE' })).status).toBe(204);
      expect((await fetch(unlink, { method: 'DELETE' })).status).toBe(204);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('validates storyboard media in PATCH while preserving an existing link that becomes missing', async () => {
    const { server, baseUrl } = await listen(buildApp(['project-1', 'project-2']));
    try {
      const content = await createContent(baseUrl);
      const initial = await fetch(`${baseUrl}/api/projects/project-1/creator-content/${content.content.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storyboardItems: [{ position: 1, purpose: '操场远景' }] }),
      }).then((response) => response.json()) as { content: { storyboardItems: Array<{ id: string }> } };
      const itemId = initial.content.storyboardItems[0]!.id;
      const [available] = await upsertCreatorMediaAssets(dataDir, 'project-1', [{
        rootPath: 'C:\\media', sourcePath: 'C:\\media\\keep.mp4', relativePath: 'keep.mp4', fileName: 'keep.mp4', extension: '.mp4', kind: 'video', sizeBytes: 100, modifiedAt: new Date().toISOString(), availability: 'available', thumbnailStatus: 'ready',
      }]);
      const [missing] = await upsertCreatorMediaAssets(dataDir, 'project-1', [{
        rootPath: 'C:\\media', sourcePath: 'C:\\media\\missing.mp4', relativePath: 'missing.mp4', fileName: 'missing.mp4', extension: '.mp4', kind: 'video', sizeBytes: 100, modifiedAt: new Date().toISOString(), availability: 'missing', thumbnailStatus: 'unavailable',
      }]);
      const [otherAsset] = await upsertCreatorMediaAssets(dataDir, 'project-2', [{
        rootPath: 'C:\\other', sourcePath: 'C:\\other\\other.mp4', relativePath: 'other.mp4', fileName: 'other.mp4', extension: '.mp4', kind: 'video', sizeBytes: 100, modifiedAt: new Date().toISOString(), availability: 'available', thumbnailStatus: 'ready',
      }]);
      const contentUrl = `${baseUrl}/api/projects/project-1/creator-content/${content.content.id}`;
      const patchWith = (assetId: string) => fetch(contentUrl, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storyboardItems: [{ position: 1, purpose: '操场远景', mediaAssetIds: [assetId] }] }),
      });

      expect((await patchWith(otherAsset!.id)).status).toBe(400);
      expect((await patchWith(missing!.id)).status).toBe(400);

      const linkUrl = `${contentUrl}/storyboard/${itemId}/media-assets`;
      expect((await fetch(linkUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId: available!.id }) })).status).toBe(201);
      await upsertCreatorMediaAssets(dataDir, 'project-1', [{
        rootPath: 'C:\\media', sourcePath: 'C:\\media\\keep.mp4', relativePath: 'keep.mp4', fileName: 'keep.mp4', extension: '.mp4', kind: 'video', sizeBytes: 100, modifiedAt: new Date().toISOString(), availability: 'missing', thumbnailStatus: 'unavailable',
      }]);
      const moved = await fetch(contentUrl, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storyboardItems: [{ position: 2, purpose: '另一镜头', mediaAssetIds: [available!.id] }] }),
      });
      expect(moved.status).toBe(400);
      const retained = await patchWith(available!.id);
      expect(retained.status).toBe(200);
      await expect(retained.json()).resolves.toMatchObject({ content: { storyboardItems: [{ mediaAssetIds: [available!.id] }] } });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('deletes only content while preserving linked task and media records', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const content = await createContent(baseUrl);
      const task = await createCreatorTask(dataDir, 'project-1', { title: '保留的任务' });
      const [asset] = await upsertCreatorMediaAssets(dataDir, 'project-1', [{
        rootPath: 'C:\\media', sourcePath: 'C:\\media\\preserve.mp4', relativePath: 'preserve.mp4', fileName: 'preserve.mp4', extension: '.mp4', kind: 'video', sizeBytes: 100, modifiedAt: new Date().toISOString(), availability: 'available', thumbnailStatus: 'ready',
      }]);
      const updated = await fetch(`${baseUrl}/api/projects/project-1/creator-content/${content.content.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storyboardItems: [{ position: 1, purpose: '保留素材' }] }),
      }).then((response) => response.json()) as { content: { storyboardItems: Array<{ id: string }> } };
      const itemId = updated.content.storyboardItems[0]!.id;
      expect((await fetch(`${baseUrl}/api/projects/project-1/creator-content/${content.content.id}/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskId: task.id }) })).status).toBe(201);
      expect((await fetch(`${baseUrl}/api/projects/project-1/creator-content/${content.content.id}/storyboard/${itemId}/media-assets`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId: asset!.id }) })).status).toBe(201);

      expect((await fetch(`${baseUrl}/api/projects/project-1/creator-content/${content.content.id}`, { method: 'DELETE' })).status).toBe(204);
      await expect(fetch(`${baseUrl}/api/projects/project-1/creator-content`).then((response) => response.json())).resolves.toEqual({ contentProjects: [] });
      await expect(getCreatorWorkbenchProjectData(dataDir, 'project-1')).resolves.toMatchObject({ tasks: [expect.objectContaining({ id: task.id })] });
      await expect(getCreatorMediaProjectData(dataDir, 'project-1')).resolves.toMatchObject({ assets: [expect.objectContaining({ id: asset!.id })] });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('requires task, content, asset, and storyboard item ids for association routes', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const content = await createContent(baseUrl);
      const noTask = await fetch(`${baseUrl}/api/projects/project-1/creator-content/${content.content.id}/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      expect(noTask.status).toBe(400);
      const noContent = await fetch(`${baseUrl}/api/projects/project-1/creator-content/%20/tasks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskId: 'creator-task:any' }) });
      expect(noContent.status).toBe(400);
      const noStoryboard = await fetch(`${baseUrl}/api/projects/project-1/creator-content/${content.content.id}/storyboard/%20/media-assets`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId: 'creator-media:any' }) });
      expect(noStoryboard.status).toBe(400);
      const noAsset = await fetch(`${baseUrl}/api/projects/project-1/creator-content/${content.content.id}/storyboard/creator-storyboard:any/media-assets`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      expect(noAsset.status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
