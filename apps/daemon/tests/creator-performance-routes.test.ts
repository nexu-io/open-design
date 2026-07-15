import express from 'express';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CreatorReleaseChecklist } from '@open-design/contracts';

import { registerCreatorPerformanceRoutes } from '../src/routes/creator-performance.js';
import { createCreatorContent, getCreatorContentProjectData } from '../src/creator-content/store.js';
import {
  createCreatorReleasePackage,
  getCreatorReleaseProjectData,
} from '../src/creator-release/store.js';
import { getCreatorPerformanceProjectData } from '../src/creator-performance/store.js';

let dataDir = '';

const FULL_CHECKLIST: CreatorReleaseChecklist = {
  contentComplete: true,
  exportConfirmed: true,
  coverConfirmed: true,
  metadataConfirmed: true,
  platformConfirmed: true,
};

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
  registerCreatorPerformanceRoutes(app, {
    db: {},
    paths: { RUNTIME_DATA_DIR: dataDir },
    projectStore: {
      getProject: (_db, projectId) => (projectIds.includes(projectId) ? { id: projectId } : null),
    },
  });
  return app;
}

async function makeRelease(
  projectId: string,
  status: 'draft' | 'ready' | 'published' | 'archived' = 'published',
): Promise<string> {
  const content = await createCreatorContent(dataDir, projectId, { title: '发布内容' });
  const release = await createCreatorReleasePackage(dataDir, projectId, {
    contentId: content.id,
    platform: 'bilibili',
    title: '交付包',
    ...(status === 'ready' ? { status: 'ready', checklist: FULL_CHECKLIST } : {}),
    ...(status === 'published' ? {
      status: 'published',
      checklist: FULL_CHECKLIST,
      publishedAt: new Date().toISOString(),
      publishedUrl: 'https://www.bilibili.com/video/BV1xx',
    } : {}),
    ...(status === 'archived' ? {
      status: 'archived',
      checklist: FULL_CHECKLIST,
      publishedAt: new Date().toISOString(),
      publishedUrl: 'https://www.bilibili.com/video/BV1xx',
    } : {}),
  });
  return release.id;
}

function postSnapshot(baseUrl: string, projectId: string, body: unknown) {
  return fetch(`${baseUrl}/api/projects/${projectId}/creator-performance-snapshots`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-creator-performance-routes-'));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('creator performance routes', () => {
  it('returns 404 JSON for an unknown project on GET and POST', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const list = await fetch(`${baseUrl}/api/projects/missing/creator-performance-snapshots`);
      expect(list.status).toBe(404);
      await expect(list.json()).resolves.toMatchObject({ error: expect.any(String) });

      const create = await postSnapshot(baseUrl, 'missing', {
        releaseId: 'creator-release:1', metrics: { views: 1 },
      });
      expect(create.status).toBe(404);
      await expect(create.json()).resolves.toMatchObject({ error: expect.any(String) });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects an unsafe optional releaseId query with 400 JSON', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const list = await fetch(`${baseUrl}/api/projects/project-1/creator-performance-snapshots?releaseId=%20`);
      expect(list.status).toBe(400);
      await expect(list.json()).resolves.toMatchObject({ error: expect.any(String) });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects an unknown or cross-project release id on POST with 400', async () => {
    const { server, baseUrl } = await listen(buildApp(['project-1', 'project-2']));
    try {
      const unknown = await postSnapshot(baseUrl, 'project-1', {
        releaseId: 'creator-release:ghost', metrics: { views: 1 },
      });
      expect(unknown.status).toBe(400);

      const otherRelease = await makeRelease('project-2', 'published');
      const cross = await postSnapshot(baseUrl, 'project-1', {
        releaseId: otherRelease, metrics: { views: 1 },
      });
      expect(cross.status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects draft, ready, and archived releases with 400 on POST', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const draft = await makeRelease('project-1', 'draft');
      const ready = await makeRelease('project-1', 'ready');
      const archived = await makeRelease('project-1', 'archived');

      expect((await postSnapshot(baseUrl, 'project-1', { releaseId: draft, metrics: { views: 1 } })).status).toBe(400);
      expect((await postSnapshot(baseUrl, 'project-1', { releaseId: ready, metrics: { views: 1 } })).status).toBe(400);
      expect((await postSnapshot(baseUrl, 'project-1', { releaseId: archived, metrics: { views: 1 } })).status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('creates a snapshot for a published release with 201', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const published = await makeRelease('project-1', 'published');
      const created = await postSnapshot(baseUrl, 'project-1', {
        releaseId: published,
        capturedAt: '2026-07-10T00:00:00.000Z',
        metrics: { views: 100, likes: 10 },
        note: '首条',
      });
      expect(created.status).toBe(201);
      const body = (await created.json()) as { snapshot: { id: string; releaseId: string; source: string; metrics: object } };
      expect(body.snapshot.releaseId).toBe(published);
      expect(body.snapshot.source).toBe('manual');
      expect(body.snapshot.metrics).toEqual({ views: 100, likes: 10 });

      const list = await (await fetch(`${baseUrl}/api/projects/project-1/creator-performance-snapshots`)).json() as {
        snapshots: Array<{ id: string }>;
      };
      expect(list.snapshots).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('returns all snapshots without a query and only one release snapshots with a releaseId query, descending by capturedAt', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const published = await makeRelease('project-1', 'published');
      const other = await makeRelease('project-1', 'published');

      await postSnapshot(baseUrl, 'project-1', { releaseId: published, metrics: { views: 1 }, capturedAt: '2026-07-01T00:00:00.000Z' });
      await postSnapshot(baseUrl, 'project-1', { releaseId: published, metrics: { views: 2 }, capturedAt: '2026-07-03T00:00:00.000Z' });
      await postSnapshot(baseUrl, 'project-1', { releaseId: other, metrics: { views: 9 }, capturedAt: '2026-07-02T00:00:00.000Z' });

      const all = (await (await fetch(`${baseUrl}/api/projects/project-1/creator-performance-snapshots`)).json()) as {
        snapshots: Array<{ releaseId: string; capturedAt: string }>;
      };
      expect(all.snapshots).toHaveLength(3);

      const filtered = (await (await fetch(`${baseUrl}/api/projects/project-1/creator-performance-snapshots?releaseId=${published}`)).json()) as {
        snapshots: Array<{ releaseId: string; capturedAt: string }>;
      };
      expect(filtered.snapshots).toHaveLength(2);
      expect(filtered.snapshots.every((s) => s.releaseId === published)).toBe(true);
      expect(filtered.snapshots.map((s) => s.capturedAt)).toEqual([
        '2026-07-03T00:00:00.000Z',
        '2026-07-01T00:00:00.000Z',
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects invalid metrics with 400 JSON on POST', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const published = await makeRelease('project-1', 'published');

      const empty = await postSnapshot(baseUrl, 'project-1', { releaseId: published, metrics: {} });
      expect(empty.status).toBe(400);
      await expect(empty.json()).resolves.toMatchObject({ error: expect.stringContaining('at least one metric') });

      const negative = await postSnapshot(baseUrl, 'project-1', { releaseId: published, metrics: { views: -1 } });
      expect(negative.status).toBe(400);

      const unknown = await postSnapshot(baseUrl, 'project-1', { releaseId: published, metrics: { weird: 1 } });
      expect(unknown.status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('deletes only the target snapshot and does not alter the release or other snapshots', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const published = await makeRelease('project-1', 'published');
      const first = await postSnapshot(baseUrl, 'project-1', { releaseId: published, metrics: { views: 1 }, capturedAt: '2026-07-01T00:00:00.000Z' });
      const firstId = ((await first.json()) as { snapshot: { id: string } }).snapshot.id;
      const second = await postSnapshot(baseUrl, 'project-1', { releaseId: published, metrics: { views: 2 }, capturedAt: '2026-07-02T00:00:00.000Z' });
      const secondId = ((await second.json()) as { snapshot: { id: string } }).snapshot.id;

      const remove = await fetch(`${baseUrl}/api/projects/project-1/creator-performance-snapshots/${secondId}`, { method: 'DELETE' });
      expect(remove.status).toBe(204);

      const list = await (await fetch(`${baseUrl}/api/projects/project-1/creator-performance-snapshots`)).json() as {
        snapshots: Array<{ id: string }>;
      };
      expect(list.snapshots.map((s) => s.id)).toEqual([firstId]);

      // 关联 release 仍存在且未受影响。
      const release = (await getCreatorReleaseProjectData(dataDir, 'project-1')).releasePackages
        .find((entry) => entry.id === published);
      expect(release).toBeDefined();
      expect(release!.status).toBe('published');

      // 删除不存在的快照 → 404。
      const missing = await fetch(`${baseUrl}/api/projects/project-1/creator-performance-snapshots/creator-performance:ghost`, { method: 'DELETE' });
      expect(missing.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('permits GET and DELETE of historical snapshots after a release becomes archived', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const published = await makeRelease('project-1', 'published');
      const created = await postSnapshot(baseUrl, 'project-1', {
        releaseId: published, metrics: { views: 5 }, capturedAt: '2026-07-05T00:00:00.000Z',
      });
      const snapshotId = ((await created.json()) as { snapshot: { id: string } }).snapshot.id;

      // 将 release 降级为 archived（直接改持久化，模拟事后状态变化）。
      const releaseFile = path.join(dataDir, 'creator-release', 'project-1.json');
      const releaseData = JSON.parse(readFileSync(releaseFile, 'utf8'));
      releaseData.releasePackages = releaseData.releasePackages.map((entry: { id: string; status: string }) =>
        entry.id === published ? { ...entry, status: 'archived' } : entry);
      writeFileSync(releaseFile, `${JSON.stringify(releaseData, null, 2)}\n`, 'utf8');

      // GET 历史快照仍可读取（不被 archived 拒绝）。
      const list = (await (await fetch(`${baseUrl}/api/projects/project-1/creator-performance-snapshots`)).json()) as {
        snapshots: Array<{ id: string }>;
      };
      expect(list.snapshots.map((s) => s.id)).toEqual([snapshotId]);

      // DELETE 历史快照仍可执行（不级联删除 release）。
      const remove = await fetch(`${baseUrl}/api/projects/project-1/creator-performance-snapshots/${snapshotId}`, { method: 'DELETE' });
      expect(remove.status).toBe(204);
      const after = await getCreatorPerformanceProjectData(dataDir, 'project-1');
      expect(after.snapshots).toHaveLength(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});