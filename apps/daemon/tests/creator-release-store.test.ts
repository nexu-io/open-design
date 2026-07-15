import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatorReleaseChecklist } from '@open-design/contracts';

import {
  createCreatorReleasePackage,
  deleteCreatorReleasePackage,
  getCreatorReleaseProjectData,
  updateCreatorReleasePackage,
} from '../src/creator-release/store.js';

let dataDir = '';

const FULL_CHECKLIST: CreatorReleaseChecklist = {
  contentComplete: true,
  exportConfirmed: true,
  coverConfirmed: true,
  metadataConfirmed: true,
  platformConfirmed: true,
};

// 构造一条完整且合法的持久化记录，便于手工写入文件后验证读取校验。
function baseRelease(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'creator-release:seed',
    projectId: 'project-1',
    contentId: 'creator-content:1',
    platform: 'bilibili',
    status: 'draft',
    title: 'B站首发',
    description: '',
    tags: [],
    checklist: {
      contentComplete: false, exportConfirmed: false, coverConfirmed: false,
      metadataConfirmed: false, platformConfirmed: false,
    },
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    ...overrides,
  };
}

async function writeReleaseFile(dataDir: string, projectId: string, records: unknown[]): Promise<string> {
  const file = path.join(dataDir, 'creator-release', `${projectId}.json`);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify({ releasePackages: records }, null, 2)}\n`, 'utf8');
  return file;
}


beforeEach(async () => {
  dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-creator-release-store-'));
});

afterEach(async () => {
  await fsp.rm(dataDir, { recursive: true, force: true });
});

describe('creator release store', () => {
  it('returns empty data when the release file is absent or corrupt', async () => {
    await expect(getCreatorReleaseProjectData(dataDir, 'project-1')).resolves.toEqual({ releasePackages: [] });

    const file = path.join(dataDir, 'creator-release', 'project-1.json');
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, '{not-json', 'utf8');

    await expect(getCreatorReleaseProjectData(dataDir, 'project-1')).resolves.toEqual({ releasePackages: [] });

    await fsp.writeFile(file, JSON.stringify({ releasePackages: [{ id: 123 }] }), 'utf8');
    await expect(getCreatorReleaseProjectData(dataDir, 'project-1')).resolves.toEqual({ releasePackages: [] });
  });

  it('propagates filesystem read errors without writing replacement content', async () => {
    const readError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const readFile = vi.spyOn(fsp, 'readFile').mockRejectedValueOnce(readError);
    const writeFile = vi.spyOn(fsp, 'writeFile');

    try {
      await expect(createCreatorReleasePackage(dataDir, 'project-1', {
        contentId: 'creator-content:1', platform: 'bilibili', title: 'B站首发',
      })).rejects.toBe(readError);
      expect(writeFile).not.toHaveBeenCalled();
    } finally {
      readFile.mockRestore();
      writeFile.mockRestore();
    }
  });

  it('removes the temporary file and preserves the rename error when atomic replacement fails', async () => {
    const renameError = new Error('rename failed');
    const rename = vi.spyOn(fsp, 'rename').mockRejectedValueOnce(renameError);
    const unlink = vi.spyOn(fsp, 'unlink');

    try {
      await expect(createCreatorReleasePackage(dataDir, 'project-1', {
        contentId: 'creator-content:1', platform: 'bilibili', title: 'B站首发',
      })).rejects.toBe(renameError);
      const temporaryFile = rename.mock.calls[0]![0];
      expect(String(temporaryFile)).toContain('.tmp');
      expect(unlink).toHaveBeenCalledWith(temporaryFile);
    } finally {
      rename.mockRestore();
      unlink.mockRestore();
    }
  });

  it('writes create and update data through a temporary file before renaming it into place', async () => {
    const writeFile = vi.spyOn(fsp, 'writeFile');
    const rename = vi.spyOn(fsp, 'rename');
    const finalFile = path.join(dataDir, 'creator-release', 'project-1.json');

    try {
      const release = await createCreatorReleasePackage(dataDir, 'project-1', {
        contentId: 'creator-content:1', platform: 'bilibili', title: 'B站首发',
      });
      const createTemporaryFile = writeFile.mock.calls[0]![0];
      expect(String(createTemporaryFile)).toContain('.tmp');
      expect(createTemporaryFile).not.toBe(finalFile);
      expect(rename).toHaveBeenCalledWith(createTemporaryFile, finalFile);

      writeFile.mockClear();
      rename.mockClear();
      await updateCreatorReleasePackage(dataDir, 'project-1', release.id, { title: '更新标题' });
      const updateTemporaryFile = writeFile.mock.calls[0]![0];
      expect(String(updateTemporaryFile)).toContain('.tmp');
      expect(updateTemporaryFile).not.toBe(finalFile);
      expect(rename).toHaveBeenCalledWith(updateTemporaryFile, finalFile);

      await expect(fsp.access(finalFile)).resolves.toBeUndefined();
      expect((await fsp.readdir(path.dirname(finalFile))).filter((file) => file.endsWith('.tmp'))).toEqual([]);
    } finally {
      writeFile.mockRestore();
      rename.mockRestore();
    }
  });

  it('rejects traversal project ids before reading or writing outside the release directory', async () => {
    await expect(createCreatorReleasePackage(dataDir, '../escape', {
      contentId: 'creator-content:1', platform: 'bilibili', title: '不应写入',
    })).rejects.toThrow('invalid project id');
    await expect(fsp.access(path.join(dataDir, 'escape.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('applies server-owned defaults for a new release package', async () => {
    const release = await createCreatorReleasePackage(dataDir, 'project-1', {
      contentId: 'creator-content:1', platform: 'bilibili', title: '  校园纪录片  ',
    });
    expect(release).toMatchObject({
      id: expect.stringMatching(/^creator-release:/),
      projectId: 'project-1',
      contentId: 'creator-content:1',
      platform: 'bilibili',
      status: 'draft',
      title: '校园纪录片',
      description: '',
      tags: [],
      checklist: {
        contentComplete: false,
        exportConfirmed: false,
        coverConfirmed: false,
        metadataConfirmed: false,
        platformConfirmed: false,
      },
    });
    expect(release.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/);
    expect(release.updatedAt).toBe(release.createdAt);
  });

  it('persists a release package and restores it after a reload', async () => {
    const release = await createCreatorReleasePackage(dataDir, 'project-1', {
      contentId: 'creator-content:1',
      platform: 'bilibili',
      title: 'B站首发',
      description: '高考纪录',
      tags: ['校园', '纪录'],
      coverAssetId: 'creator-media:cover',
      publishedUrl: 'https://www.bilibili.com/video/BV1',
    });
    expect(await getCreatorReleaseProjectData(dataDir, 'project-1')).toEqual({ releasePackages: [release] });

    const updated = await updateCreatorReleasePackage(dataDir, 'project-1', release.id, {
      title: '更新标题',
      tags: ['校园', '纪录', '青春'],
    });
    expect(updated!.title).toBe('更新标题');
    expect(updated!.tags).toEqual(['校园', '纪录', '青春']);
    expect(updated!.id).toBe(release.id);
    expect(updated!.createdAt).toBe(release.createdAt);
    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(release.updatedAt).getTime());
    await expect(getCreatorReleaseProjectData(dataDir, 'project-1')).resolves.toEqual({ releasePackages: [updated] });
  });

  it('keeps two releases for the same project independent', async () => {
    const first = await createCreatorReleasePackage(dataDir, 'project-1', {
      contentId: 'creator-content:1', platform: 'bilibili', title: 'B站首发',
    });
    const second = await createCreatorReleasePackage(dataDir, 'project-1', {
      contentId: 'creator-content:1', platform: 'youtube', title: 'YouTube版',
    });
    expect(first.id).not.toBe(second.id);

    const data = await getCreatorReleaseProjectData(dataDir, 'project-1');
    expect(data.releasePackages.map((release) => release.id).sort()).toEqual([first.id, second.id].sort());

    await updateCreatorReleasePackage(dataDir, 'project-1', first.id, { title: '改了第一个' });
    const reloaded = await getCreatorReleaseProjectData(dataDir, 'project-1');
    expect(reloaded.releasePackages.find((release) => release.id === first.id)!.title).toBe('改了第一个');
    expect(reloaded.releasePackages.find((release) => release.id === second.id)!.title).toBe('YouTube版');
  });

  it('ignores forged identity and audit fields from the request', async () => {
    const release = await createCreatorReleasePackage(dataDir, 'project-1', {
      contentId: 'creator-content:1', platform: 'bilibili', title: 'B站首发',
    } as never);
    const forged = await updateCreatorReleasePackage(dataDir, 'project-1', release.id, {
      id: 'forged-id',
      projectId: 'other-project',
      createdAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
      title: '仍保持身份',
    } as never);

    expect(forged!.id).toBe(release.id);
    expect(forged!.projectId).toBe('project-1');
    expect(forged!.createdAt).toBe(release.createdAt);
    expect(forged!.updatedAt).not.toBe('2000-01-01T00:00:00.000Z');
  });

  it('rejects invalid project ids, empty titles, invalid platform/status, bad tags, dates and urls', async () => {
    await expect(createCreatorReleasePackage(dataDir, '', {
      contentId: 'creator-content:1', platform: 'bilibili', title: 'x',
    })).rejects.toThrow('invalid project id');
    await expect(createCreatorReleasePackage(dataDir, 'project-1', {
      contentId: 'creator-content:1', platform: 'bilibili', title: '  ',
    })).rejects.toThrow('release title is required');
    await expect(createCreatorReleasePackage(dataDir, 'project-1', {
      contentId: 'creator-content:1', platform: 'tiktok' as never, title: 'x',
    })).rejects.toThrow('invalid release platform');
    await expect(createCreatorReleasePackage(dataDir, 'project-1', {
      contentId: 'creator-content:1', platform: 'bilibili', title: 'x', status: 'live' as never,
    })).rejects.toThrow('invalid release status');
    await expect(createCreatorReleasePackage(dataDir, 'project-1', {
      contentId: 'creator-content:1', platform: 'bilibili', title: 'x',
      tags: Array.from({ length: 21 }, (_, index) => `t${index}`),
    })).rejects.toThrow('tags must not exceed 20');
    await expect(createCreatorReleasePackage(dataDir, 'project-1', {
      contentId: 'creator-content:1', platform: 'bilibili', title: 'x', scheduledAt: 'not-a-date',
    })).rejects.toThrow('date must be a valid ISO string');
    await expect(createCreatorReleasePackage(dataDir, 'project-1', {
      contentId: 'creator-content:1', platform: 'bilibili', title: 'x', publishedUrl: 'ftp://example.com',
    })).rejects.toThrow('published url must be http or https');
  });

  it('dedupes tags and accepts valid http/https urls and ISO dates', async () => {
    const release = await createCreatorReleasePackage(dataDir, 'project-1', {
      contentId: 'creator-content:1',
      platform: 'bilibili',
      title: 'B站首发',
      tags: ['a', 'a', 'b', ''],
      scheduledAt: '2026-08-01T10:00:00.000Z',
      publishedUrl: 'https://www.bilibili.com/video/BV1',
    });
    expect(release.tags).toEqual(['a', 'b']);
    expect(release.scheduledAt).toBe('2026-08-01T10:00:00.000Z');
  });

  it('enforces the ready and published gates and supports valid stepwise patches', async () => {
    const release = await createCreatorReleasePackage(dataDir, 'project-1', {
      contentId: 'creator-content:1', platform: 'bilibili', title: 'B站首发',
    });

    // ready 在 checklist 完成前被拦截。
    await expect(updateCreatorReleasePackage(dataDir, 'project-1', release.id, { status: 'ready' }))
      .rejects.toThrow('ready requires all checklist items complete');

    // 完成 checklist 后 ready 合法。
    const ready = await updateCreatorReleasePackage(dataDir, 'project-1', release.id, {
      checklist: {
        contentComplete: true,
        exportConfirmed: true,
        coverConfirmed: true,
        metadataConfirmed: true,
        platformConfirmed: true,
      },
      status: 'ready',
    });
    expect(ready!.status).toBe('ready');

    // published 即便 checklist 完成，缺少 publishedAt/publishedUrl 也被拦截。
    await expect(updateCreatorReleasePackage(dataDir, 'project-1', release.id, { status: 'published' }))
      .rejects.toThrow('published requires a valid publishedAt');

    // 局部 PATCH 不能绕过门禁：只设 status+url 而缺 publishedAt。
    await expect(updateCreatorReleasePackage(dataDir, 'project-1', release.id, {
      status: 'published', publishedUrl: 'https://www.bilibili.com/video/BV1',
    })).rejects.toThrow('published requires a valid publishedAt');

    // 合法的 published 转换。
    const published = await updateCreatorReleasePackage(dataDir, 'project-1', release.id, {
      status: 'published',
      publishedAt: '2026-08-02T09:00:00.000Z',
      publishedUrl: 'https://www.bilibili.com/video/BV1xx',
    });
    expect(published!.status).toBe('published');
    expect(published!.publishedAt).toBe('2026-08-02T09:00:00.000Z');

    // archived 始终允许。
    const archived = await updateCreatorReleasePackage(dataDir, 'project-1', release.id, { status: 'archived' });
    expect(archived!.status).toBe('archived');
  });

  it('returns null when updating a missing release and false when deleting a missing release', async () => {
    await expect(updateCreatorReleasePackage(dataDir, 'project-1', 'creator-release:missing', { title: 'x' }))
      .resolves.toBeNull();
    await expect(deleteCreatorReleasePackage(dataDir, 'project-1', 'creator-release:missing'))
      .resolves.toBe(false);
  });

  it('deletes only the target release and leaves other data untouched', async () => {
    const first = await createCreatorReleasePackage(dataDir, 'project-1', {
      contentId: 'creator-content:1', platform: 'bilibili', title: 'B站首发',
    });
    const second = await createCreatorReleasePackage(dataDir, 'project-1', {
      contentId: 'creator-content:1', platform: 'youtube', title: 'YouTube版',
    });
    await expect(deleteCreatorReleasePackage(dataDir, 'project-1', first.id)).resolves.toBe(true);
    await expect(deleteCreatorReleasePackage(dataDir, 'project-1', first.id)).resolves.toBe(false);
    const remaining = await getCreatorReleaseProjectData(dataDir, 'project-1');
    expect(remaining.releasePackages.map((release) => release.id)).toEqual([second.id]);
  });

  describe('persisted record validation', () => {
    it('filters persisted releases whose projectId does not match the requested project', async () => {
      await writeReleaseFile(dataDir, 'project-1', [
        baseRelease(),
        baseRelease({ id: 'creator-release:other', projectId: 'project-2' }),
      ]);
      const data = await getCreatorReleaseProjectData(dataDir, 'project-1');
      expect(data.releasePackages).toHaveLength(1);
      expect(data.releasePackages[0]!.projectId).toBe('project-1');
    });

    it('filters releases with invalid dates or urls while keeping valid neighbors', async () => {
      await writeReleaseFile(dataDir, 'project-1', [
        baseRelease({ id: 'creator-release:ok', publishedUrl: 'https://www.bilibili.com/video/BV1' }),
        baseRelease({ id: 'creator-release:bad-date', scheduledAt: 'next-tuesday' }),
        baseRelease({ id: 'creator-release:bad-pubat', publishedAt: '2026/08/01' }),
        baseRelease({ id: 'creator-release:bad-url', publishedUrl: 'ftp://example.com' }),
      ]);
      const data = await getCreatorReleaseProjectData(dataDir, 'project-1');
      expect(data.releasePackages.map((release) => release.id)).toEqual(['creator-release:ok']);
    });

    it('filters ready releases whose checklist is incomplete', async () => {
      await writeReleaseFile(dataDir, 'project-1', [
        baseRelease({ id: 'creator-release:ok' }),
        baseRelease({
          id: 'creator-release:bad-ready',
          status: 'ready',
          checklist: {
            contentComplete: false, exportConfirmed: false, coverConfirmed: false,
            metadataConfirmed: false, platformConfirmed: false,
          },
        }),
      ]);
      const data = await getCreatorReleaseProjectData(dataDir, 'project-1');
      expect(data.releasePackages.map((release) => release.id)).toEqual(['creator-release:ok']);
    });

    it('filters published releases missing or with invalid publishedAt/publishedUrl', async () => {
      await writeReleaseFile(dataDir, 'project-1', [
        baseRelease({ id: 'creator-release:ok' }),
        baseRelease({
          id: 'creator-release:no-pubat',
          status: 'published',
          checklist: FULL_CHECKLIST,
          publishedUrl: 'https://www.bilibili.com/video/BV1',
        }),
        baseRelease({
          id: 'creator-release:bad-url',
          status: 'published',
          checklist: FULL_CHECKLIST,
          publishedAt: '2026-08-02T09:00:00.000Z',
          publishedUrl: 'ftp://example.com',
        }),
      ]);
      const data = await getCreatorReleaseProjectData(dataDir, 'project-1');
      expect(data.releasePackages.map((release) => release.id)).toEqual(['creator-release:ok']);
    });
  });

  describe('nullable field clearing on update', () => {
    it('removes optional fields when the update patch sets them to null', async () => {
      const release = await createCreatorReleasePackage(dataDir, 'project-1', {
        contentId: 'creator-content:1',
        platform: 'bilibili',
        title: 'B站首发',
        coverAssetId: 'creator-media:cover',
        exportAssetId: 'creator-media:export',
        scheduledAt: '2026-08-01T10:00:00.000Z',
        publishedUrl: 'https://www.bilibili.com/video/BV1',
      });
      const cleared = await updateCreatorReleasePackage(dataDir, 'project-1', release.id, {
        coverAssetId: null,
        exportAssetId: null,
        scheduledAt: null,
        publishedAt: null,
        publishedUrl: null,
      });
      expect(cleared!.coverAssetId).toBeUndefined();
      expect(cleared!.exportAssetId).toBeUndefined();
      expect(cleared!.scheduledAt).toBeUndefined();
      expect(cleared!.publishedAt).toBeUndefined();
      expect(cleared!.publishedUrl).toBeUndefined();
      const reloaded = await getCreatorReleaseProjectData(dataDir, 'project-1');
      const stored = reloaded.releasePackages[0]!;
      expect(stored.coverAssetId).toBeUndefined();
      expect(stored.exportAssetId).toBeUndefined();
      expect(stored.scheduledAt).toBeUndefined();
      expect(stored.publishedAt).toBeUndefined();
      expect(stored.publishedUrl).toBeUndefined();
    });

    it('rejects clearing publishedAt or publishedUrl while the status remains published', async () => {
      const release = await createCreatorReleasePackage(dataDir, 'project-1', {
        contentId: 'creator-content:1', platform: 'bilibili', title: 'B站首发',
      });
      await updateCreatorReleasePackage(dataDir, 'project-1', release.id, {
        checklist: FULL_CHECKLIST, status: 'ready',
      });
      await updateCreatorReleasePackage(dataDir, 'project-1', release.id, {
        status: 'published',
        publishedAt: '2026-08-02T09:00:00.000Z',
        publishedUrl: 'https://www.bilibili.com/video/BV1xx',
      });
      await expect(updateCreatorReleasePackage(dataDir, 'project-1', release.id, { publishedUrl: null }))
        .rejects.toThrow();
      await expect(updateCreatorReleasePackage(dataDir, 'project-1', release.id, { publishedAt: null }))
        .rejects.toThrow();
    });

    it('allows clearing published fields when the same patch downgrades the status', async () => {
      const release = await createCreatorReleasePackage(dataDir, 'project-1', {
        contentId: 'creator-content:1', platform: 'bilibili', title: 'B站首发',
      });
      await updateCreatorReleasePackage(dataDir, 'project-1', release.id, {
        checklist: FULL_CHECKLIST, status: 'ready',
      });
      const published = await updateCreatorReleasePackage(dataDir, 'project-1', release.id, {
        status: 'published',
        publishedAt: '2026-08-02T09:00:00.000Z',
        publishedUrl: 'https://www.bilibili.com/video/BV1xx',
      });
      const archived = await updateCreatorReleasePackage(dataDir, 'project-1', release.id, {
        status: 'archived',
        publishedAt: null,
        publishedUrl: null,
      });
      expect(archived!.status).toBe('archived');
      expect(archived!.publishedAt).toBeUndefined();
      expect(archived!.publishedUrl).toBeUndefined();
      expect(archived!.id).toBe(published!.id);
    });

    it('rejects empty strings for nullable fields instead of treating them as clear', async () => {
      const release = await createCreatorReleasePackage(dataDir, 'project-1', {
        contentId: 'creator-content:1', platform: 'bilibili', title: 'B站首发',
        coverAssetId: 'creator-media:cover',
      });
      await expect(updateCreatorReleasePackage(dataDir, 'project-1', release.id, { coverAssetId: '' }))
        .rejects.toThrow();
      await expect(updateCreatorReleasePackage(dataDir, 'project-1', release.id, { publishedUrl: '' }))
        .rejects.toThrow();
    });
  });
});
