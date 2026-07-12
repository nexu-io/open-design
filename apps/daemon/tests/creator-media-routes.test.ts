import express from 'express';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerCreatorMediaRoutes } from '../src/routes/creator-media.js';
import { createCreatorTask } from '../src/creator-workbench-store.js';

let dataDir = '';
let mediaDir = '';

async function listen(app: express.Express) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing test port');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-creator-media-routes-'));
  mediaDir = mkdtempSync(path.join(os.tmpdir(), 'od-creator-media-files-'));
  writeFileSync(path.join(mediaDir, 'clip.mp4'), 'video');
});
afterEach(() => { rmSync(dataDir, { recursive: true, force: true }); rmSync(mediaDir, { recursive: true, force: true }); });

describe('creator media routes', () => {
  it('scans a project media root and rejects an unknown project', async () => {
    const app = express(); app.use(express.json());
    registerCreatorMediaRoutes(app, { db: {}, paths: { RUNTIME_DATA_DIR: dataDir }, projectStore: { getProject: (_db, id) => id === 'project-1' ? { id } : null } });
    const { server, baseUrl } = await listen(app);
    try {
      const taskId = (await createCreatorTask(dataDir, 'project-1', { title: '整理素材' })).id;
      const missing = await fetch(`${baseUrl}/api/projects/missing/creator-media-roots`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rootPath: mediaDir }) });
      expect(missing.status).toBe(404);
      const scanned = await fetch(`${baseUrl}/api/projects/project-1/creator-media-roots`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rootPath: mediaDir }) });
      expect(scanned.status).toBe(201);
      const body = await scanned.json() as { assets: Array<{ id: string; fileName: string }> };
      expect(body).toMatchObject({ assets: [expect.objectContaining({ fileName: 'clip.mp4' })] });
      const projectData = await fetch(`${baseUrl}/api/projects/project-1/creator-media-assets`);
      await expect(projectData.json()).resolves.toMatchObject({ roots: [{ rootPath: mediaDir, lastScannedAt: expect.any(String) }] });
      const linked = await fetch(`${baseUrl}/api/projects/project-1/creator-tasks/${taskId}/media-assets`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId: body.assets[0]!.id }) });
      expect(linked.status).toBe(201);
      const data = await fetch(`${baseUrl}/api/projects/project-1/creator-media-assets`);
      await expect(data.json()).resolves.toMatchObject({ taskLinks: [expect.objectContaining({ taskId, assetId: body.assets[0]!.id })] });
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});
