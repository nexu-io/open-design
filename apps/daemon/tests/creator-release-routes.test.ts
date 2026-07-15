import express from 'express';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerCreatorReleaseRoutes } from '../src/routes/creator-release.js';
import { createCreatorContent, getCreatorContentProjectData } from '../src/creator-content/store.js';
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
  registerCreatorReleaseRoutes(app, {
    db: {},
    paths: { RUNTIME_DATA_DIR: dataDir },
    projectStore: {
      getProject: (_db, projectId) => (projectIds.includes(projectId) ? { id: projectId } : null),
    },
  });
  return app;
}

async function makeContent(projectId: string, title = '发布内容'): Promise<string> {
  const content = await createCreatorContent(dataDir, projectId, { title });
  return content.id;
}

async function makeAsset(projectId: string, availability: 'available' | 'missing', tag: string): Promise<string> {
  const sourcePath = `C:\\media\\${projectId}-${tag}.mp4`;
  const [asset] = await upsertCreatorMediaAssets(dataDir, projectId, [{
    rootPath: 'C:\\media',
    sourcePath,
    relativePath: `${projectId}-${tag}.mp4`,
    fileName: `${projectId}-${tag}.mp4`,
    extension: '.mp4',
    kind: 'video',
    sizeBytes: 100,
    modifiedAt: new Date().toISOString(),
    availability,
    thumbnailStatus: availability === 'available' ? 'ready' : 'unavailable',
  }]);
  return asset!.id;
}

function postRelease(baseUrl: string, body: unknown) {
  return fetch(`${baseUrl}/api/projects/project-1/creator-release-packages`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-creator-release-routes-'));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('creator release routes', () => {
  it('returns 404 JSON for an unknown project on GET and POST', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const list = await fetch(`${baseUrl}/api/projects/missing/creator-release-packages`);
      expect(list.status).toBe(404);
      await expect(list.json()).resolves.toMatchObject({ error: expect.any(String) });

      const contentId = await makeContent('project-1');
      const create = await fetch(`${baseUrl}/api/projects/missing/creator-release-packages`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contentId, platform: 'bilibili', title: '应被拒' }),
      });
      expect(create.status).toBe(404);
      await expect(create.json()).resolves.toMatchObject({ error: expect.any(String) });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('creates two releases for the same content with different platforms', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const contentId = await makeContent('project-1');
      const first = await postRelease(baseUrl, { contentId, platform: 'bilibili', title: 'B 站版' });
      expect(first.status).toBe(201);
      const second = await postRelease(baseUrl, { contentId, platform: 'youtube', title: 'YouTube 版' });
      expect(second.status).toBe(201);

      const list = await (await fetch(`${baseUrl}/api/projects/project-1/creator-release-packages`)).json() as {
        releasePackages: Array<{ id: string; platform: string; contentId: string }>;
      };
      expect(list.releasePackages).toHaveLength(2);
      expect(list.releasePackages.map((r) => r.platform).sort()).toEqual(['bilibili', 'youtube']);
      expect(list.releasePackages.every((r) => r.contentId === contentId)).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects unknown or cross-project content id on POST and PATCH', async () => {
    const { server, baseUrl } = await listen(buildApp(['project-1', 'project-2']));
    try {
      const ownContent = await makeContent('project-1');
      const otherContent = await makeContent('project-2');

      const unknown = await postRelease(baseUrl, { contentId: 'creator-content:ghost', platform: 'bilibili', title: '未知内容' });
      expect(unknown.status).toBe(400);
      const cross = await postRelease(baseUrl, { contentId: otherContent, platform: 'bilibili', title: '跨项目内容' });
      expect(cross.status).toBe(400);

      const created = await postRelease(baseUrl, { contentId: ownContent, platform: 'bilibili', title: '自有内容' });
      const releaseId = ((await created.json()) as { releasePackage: { id: string } }).releasePackage.id;

      const patchUnknown = await fetch(`${baseUrl}/api/projects/project-1/creator-release-packages/${releaseId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contentId: 'creator-content:ghost' }),
      });
      expect(patchUnknown.status).toBe(400);
      const patchCross = await fetch(`${baseUrl}/api/projects/project-1/creator-release-packages/${releaseId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contentId: otherContent }),
      });
      expect(patchCross.status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects unknown, cross-project, or new missing media on POST and PATCH', async () => {
    const { server, baseUrl } = await listen(buildApp(['project-1', 'project-2']));
    try {
      const contentId = await makeContent('project-1');
      const available = await makeAsset('project-1', 'available', 'avail');
      const missing = await makeAsset('project-1', 'missing', 'miss');
      const otherAsset = await makeAsset('project-2', 'available', 'other');

      const unknownMedia = await postRelease(baseUrl, { contentId, platform: 'bilibili', title: '未知素材', coverAssetId: 'creator-media:ghost' });
      expect(unknownMedia.status).toBe(400);
      const crossMedia = await postRelease(baseUrl, { contentId, platform: 'bilibili', title: '跨项目素材', coverAssetId: otherAsset });
      expect(crossMedia.status).toBe(400);
      const missingMedia = await postRelease(baseUrl, { contentId, platform: 'bilibili', title: '新引用 missing', coverAssetId: missing });
      expect(missingMedia.status).toBe(400);

      const created = await postRelease(baseUrl, { contentId, platform: 'bilibili', title: '合法创建', coverAssetId: available });
      expect(created.status).toBe(201);
      const releaseId = ((await created.json()) as { releasePackage: { id: string } }).releasePackage.id;

      const patchUnknown = await fetch(`${baseUrl}/api/projects/project-1/creator-release-packages/${releaseId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ coverAssetId: 'creator-media:ghost' }),
      });
      expect(patchUnknown.status).toBe(400);
      const patchCross = await fetch(`${baseUrl}/api/projects/project-1/creator-release-packages/${releaseId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ coverAssetId: otherAsset }),
      });
      expect(patchCross.status).toBe(400);
      const patchMissing = await fetch(`${baseUrl}/api/projects/project-1/creator-release-packages/${releaseId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ coverAssetId: missing }),
      });
      expect(patchMissing.status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('preserves a cover reference that becomes missing across GET, PATCH, and export', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const contentId = await makeContent('project-1');
      const cover = await makeAsset('project-1', 'available', 'cover');
      const created = await postRelease(baseUrl, { contentId, platform: 'bilibili', title: '封面会变 missing', coverAssetId: cover });
      const releaseId = ((await created.json()) as { releasePackage: { id: string } }).releasePackage.id;

      // 让该素材在后续扫描中变为 missing，但 release 不应被改动。
      await upsertCreatorMediaAssets(dataDir, 'project-1', [{
        rootPath: 'C:\\media', sourcePath: `C:\\media\\project-1-cover.mp4`, relativePath: 'project-1-cover.mp4',
        fileName: 'project-1-cover.mp4', extension: '.mp4', kind: 'video', sizeBytes: 100, modifiedAt: new Date().toISOString(), availability: 'missing', thumbnailStatus: 'unavailable',
      }]);

      const list = await (await fetch(`${baseUrl}/api/projects/project-1/creator-release-packages`)).json() as {
        releasePackages: Array<{ id: string; coverAssetId: string }>;
      };
      const found = list.releasePackages.find((r) => r.id === releaseId)!;
      expect(found.coverAssetId).toBe(cover);

      // PATCH 不涉及 cover 字段，不得因为已 missing 而失败。
      const patch = await fetch(`${baseUrl}/api/projects/project-1/creator-release-packages/${releaseId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '改名后仍保留封面' }),
      });
      expect(patch.status).toBe(200);
      await expect(patch.json()).resolves.toMatchObject({ releasePackage: { coverAssetId: cover } });

      // export 必须保留引用并标记 missing。
      const exp = await (await fetch(`${baseUrl}/api/projects/project-1/creator-release-packages/${releaseId}/export`)).json() as {
        coverAsset: { id: string; availability: string } | null;
      };
      expect(exp.coverAsset).toEqual({ id: cover, availability: 'missing' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects replacing an existing missing reference with another missing asset', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const contentId = await makeContent('project-1');
      const cover = await makeAsset('project-1', 'available', 'cover');
      const created = await postRelease(baseUrl, { contentId, platform: 'bilibili', title: '封面', coverAssetId: cover });
      const releaseId = ((await created.json()) as { releasePackage: { id: string } }).releasePackage.id;

      // 当前封面变 missing。
      await upsertCreatorMediaAssets(dataDir, 'project-1', [{
        rootPath: 'C:\\media', sourcePath: `C:\\media\\project-1-cover.mp4`, relativePath: 'project-1-cover.mp4',
        fileName: 'project-1-cover.mp4', extension: '.mp4', kind: 'video', sizeBytes: 100, modifiedAt: new Date().toISOString(), availability: 'missing', thumbnailStatus: 'unavailable',
      }]);
      const otherMissing = await makeAsset('project-1', 'missing', 'othermissing');

      // 把既有 missing 封面替换为另一个 missing 素材 → 拒绝。
      const patch = await fetch(`${baseUrl}/api/projects/project-1/creator-release-packages/${releaseId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ coverAssetId: otherMissing }),
      });
      expect(patch.status).toBe(400);

      // 但再次显式提交同一个 missing ID 视为保留，可以成功。
      const keep = await fetch(`${baseUrl}/api/projects/project-1/creator-release-packages/${releaseId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ coverAssetId: cover }),
      });
      expect(keep.status).toBe(200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('enforces ready/published gates over HTTP, including clearing published fields', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const contentId = await makeContent('project-1');
      const allDone = { contentComplete: true, exportConfirmed: true, coverConfirmed: true, metadataConfirmed: true, platformConfirmed: true };
      const incomplete = { contentComplete: false, exportConfirmed: true, coverConfirmed: true, metadataConfirmed: true, platformConfirmed: true };

      // ready 需要全 checklist。
      const readyBad = await postRelease(baseUrl, { contentId, platform: 'bilibili', title: '未完成的 ready', status: 'ready', checklist: incomplete });
      expect(readyBad.status).toBe(400);
      const readyOk = await postRelease(baseUrl, { contentId, platform: 'bilibili', title: '完成的 ready', status: 'ready', checklist: allDone });
      expect(readyOk.status).toBe(201);

      // published 还需要 publishedAt + publishedUrl。
      const pubBad = await postRelease(baseUrl, { contentId, platform: 'bilibili', title: '缺 URL', status: 'published', checklist: allDone, publishedAt: new Date().toISOString() });
      expect(pubBad.status).toBe(400);
      const pubOk = await postRelease(baseUrl, {
        contentId, platform: 'bilibili', title: '完成发布', status: 'published', checklist: allDone,
        publishedAt: new Date().toISOString(), publishedUrl: 'https://www.bilibili.com/video/BV1xx',
      });
      expect(pubOk.status).toBe(201);
      const pubId = ((await pubOk.json()) as { releasePackage: { id: string } }).releasePackage.id;

      // 已 published 时清空 publishedAt → 拒绝。
      const clearAt = await fetch(`${baseUrl}/api/projects/project-1/creator-release-packages/${pubId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publishedAt: null }),
      });
      expect(clearAt.status).toBe(400);
      // 清空 publishedUrl 同样拒绝。
      const clearUrl = await fetch(`${baseUrl}/api/projects/project-1/creator-release-packages/${pubId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ publishedUrl: null }),
      });
      expect(clearUrl.status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('deletes only the target release, leaving content and media intact', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const contentId = await makeContent('project-1');
      const cover = await makeAsset('project-1', 'available', 'cover');
      const first = await postRelease(baseUrl, { contentId, platform: 'bilibili', title: '保留这个' });
      const firstId = ((await first.json()) as { releasePackage: { id: string } }).releasePackage.id;
      const second = await postRelease(baseUrl, { contentId, platform: 'youtube', title: '删掉这个', coverAssetId: cover });
      const secondId = ((await second.json()) as { releasePackage: { id: string } }).releasePackage.id;

      const remove = await fetch(`${baseUrl}/api/projects/project-1/creator-release-packages/${secondId}`, { method: 'DELETE' });
      expect(remove.status).toBe(204);

      const list = await (await fetch(`${baseUrl}/api/projects/project-1/creator-release-packages`)).json() as {
        releasePackages: Array<{ id: string }>;
      };
      expect(list.releasePackages).toHaveLength(1);
      expect(list.releasePackages[0]!.id).toBe(firstId);

      // 关联 content 与 media 仍存在。
      const media = await getCreatorMediaProjectData(dataDir, 'project-1');
      expect(media.assets.some((a) => a.id === cover)).toBe(true);
      const contentData = await getCreatorContentProjectData(dataDir, 'project-1');
      expect(contentData.contentProjects.some((c) => c.id === contentId)).toBe(true);

      // 删除不存在的 release → 404。
      const missing = await fetch(`${baseUrl}/api/projects/project-1/creator-release-packages/creator-release:ghost`, { method: 'DELETE' });
      expect(missing.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('exports stable JSON with checklist, content id/title, and asset availability states', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      const contentId = await makeContent('project-1', '我的纪录片');
      const available = await makeAsset('project-1', 'available', 'avail');
      const exportAvail = await makeAsset('project-1', 'available', 'exportavail');
      const created = await postRelease(baseUrl, {
        contentId, platform: 'bilibili', title: '导出测试', coverAssetId: available, exportAssetId: exportAvail,
        checklist: { contentComplete: true, exportConfirmed: false, coverConfirmed: true, metadataConfirmed: true, platformConfirmed: false },
      });
      const releaseId = ((await created.json()) as { releasePackage: { id: string } }).releasePackage.id;

      const exportOnce = () => fetch(`${baseUrl}/api/projects/project-1/creator-release-packages/${releaseId}/export`).then((r) => r.json());
      const a = (await exportOnce()) as Record<string, unknown>;
      const b = (await exportOnce()) as Record<string, unknown>;
      // 同状态连续两次请求必须稳定（字段与顺序一致）。
      expect(a).toEqual(b);

      expect(a).toMatchObject({
        id: releaseId,
        contentId,
        platform: 'bilibili',
        title: '导出测试',
        checklist: { contentComplete: true, exportConfirmed: false, coverConfirmed: true, metadataConfirmed: true, platformConfirmed: false },
        content: { id: contentId, title: '我的纪录片' },
        coverAsset: { id: available, availability: 'available' },
        exportAsset: { id: exportAvail, availability: 'available' },
      });

      // 让导出素材在后续扫描中变为 missing → 导出标记 missing，且仍保留 id。
      await upsertCreatorMediaAssets(dataDir, 'project-1', [{
        rootPath: 'C:\\media', sourcePath: `C:\\media\\project-1-exportavail.mp4`, relativePath: 'project-1-exportavail.mp4',
        fileName: 'project-1-exportavail.mp4', extension: '.mp4', kind: 'video', sizeBytes: 100, modifiedAt: new Date().toISOString(), availability: 'missing', thumbnailStatus: 'unavailable',
      }]);
      const afterMissing = (await exportOnce()) as { exportAsset: { id: string; availability: string } | null };
      expect(afterMissing.exportAsset).toEqual({ id: exportAvail, availability: 'missing' });

      // 把封面素材从媒体数据中移除 → 导出标记 unavailable，且仍保留 id。
      const mediaFile = path.join(dataDir, 'creator-media', 'project-1.json');
      const mediaRaw = JSON.parse(readFileSync(mediaFile, 'utf8'));
      mediaRaw.assets = mediaRaw.assets.filter((asset: { id: string }) => asset.id !== available);
      writeFileSync(mediaFile, `${JSON.stringify(mediaRaw, null, 2)}\n`);
      const after = (await exportOnce()) as { coverAsset: { id: string; availability: string } | null };
      expect(after.coverAsset).toEqual({ id: available, availability: 'unavailable' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('returns 404 JSON for export of a missing release', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      await makeContent('project-1');
      const exp = await fetch(`${baseUrl}/api/projects/project-1/creator-release-packages/creator-release:ghost/export`);
      expect(exp.status).toBe(404);
      await expect(exp.json()).resolves.toMatchObject({ error: expect.any(String) });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects invalid path id and missing required body fields with 400 JSON', async () => {
    const { server, baseUrl } = await listen(buildApp());
    try {
      // 非法路径 ID（空格，被内容 store / requireId 拒绝）。
      const spaceId = await fetch(`${baseUrl}/api/projects/project-1/creator-release-packages/%20/export`);
      expect(spaceId.status).toBe(400);

      // 缺少必要 body 字段（contentId / title）。
      const noBody = await postRelease(baseUrl, {});
      expect(noBody.status).toBe(400);
      await expect(noBody.json()).resolves.toMatchObject({ error: expect.any(String) });

      const noTitle = await postRelease(baseUrl, { contentId: 'creator-content:any', platform: 'bilibili' });
      expect(noTitle.status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
