import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCreatorContent,
  deleteCreatorContent,
  getCreatorContentProjectData,
  linkCreatorContentTask,
  linkCreatorStoryboardMedia,
  unlinkCreatorContentTask,
  unlinkCreatorStoryboardMedia,
  updateCreatorContent,
} from '../src/creator-content/store.js';

let dataDir = '';

beforeEach(async () => {
  dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-creator-content-store-'));
});

afterEach(async () => {
  await fsp.rm(dataDir, { recursive: true, force: true });
});

describe('creator content store', () => {
  it('returns empty data when the content file is absent or corrupt', async () => {
    await expect(getCreatorContentProjectData(dataDir, 'project-1')).resolves.toEqual({ contentProjects: [] });

    const file = path.join(dataDir, 'creator-content', 'project-1.json');
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, '{not-json', 'utf8');

    await expect(getCreatorContentProjectData(dataDir, 'project-1')).resolves.toEqual({ contentProjects: [] });

    await fsp.writeFile(file, JSON.stringify({ contentProjects: [{ id: 123 }] }), 'utf8');
    await expect(getCreatorContentProjectData(dataDir, 'project-1')).resolves.toEqual({ contentProjects: [] });
  });

  it('propagates filesystem read errors without writing replacement content', async () => {
    const readError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const readFile = vi.spyOn(fsp, 'readFile').mockRejectedValueOnce(readError);
    const writeFile = vi.spyOn(fsp, 'writeFile');

    try {
      await expect(createCreatorContent(dataDir, 'project-1', { title: '短片' })).rejects.toBe(readError);
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
      await expect(createCreatorContent(dataDir, 'project-1', { title: '短片' })).rejects.toBe(renameError);
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
    const finalFile = path.join(dataDir, 'creator-content', 'project-1.json');

    try {
      const content = await createCreatorContent(dataDir, 'project-1', { title: '短片' });
      const createTemporaryFile = writeFile.mock.calls[0]![0];
      expect(String(createTemporaryFile)).toContain('.tmp');
      expect(createTemporaryFile).not.toBe(finalFile);
      expect(rename).toHaveBeenCalledWith(createTemporaryFile, finalFile);

      writeFile.mockClear();
      rename.mockClear();
      await updateCreatorContent(dataDir, 'project-1', content.id, { title: '更新标题' });
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

  it('rejects traversal project ids before reading or writing outside the content directory', async () => {
    await expect(createCreatorContent(dataDir, '../escape', { title: '不应写入' })).rejects.toThrow('invalid project id');
    await expect(fsp.access(path.join(dataDir, 'escape.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('persists a complete content chain with ordered, server-owned storyboard metadata', async () => {
    const content = await createCreatorContent(dataDir, 'project-1', { title: '  校园纪录片  ' });
    const updated = await updateCreatorContent(dataDir, 'project-1', content.id, {
      brief: { topic: '毕业前的夏天', audience: '同学' },
      outline: { opening: '清晨的校园', sections: '课堂、操场、告别', editingIntent: '克制而温暖' },
      retrospective: { nextAction: '整理观众反馈' },
      storyboardItems: [
        { position: 2, purpose: '晚霞下的操场', mediaAssetIds: ['missing-media'] },
        { position: 1, purpose: '清晨空镜' },
      ],
    });

    expect(updated).toMatchObject({
      brief: { topic: '毕业前的夏天' },
      outline: { opening: '清晨的校园' },
      retrospective: { nextAction: '整理观众反馈' },
    });
    expect(updated!.storyboardItems).toEqual([
      expect.objectContaining({ position: 1, purpose: '清晨空镜', mediaAssetIds: [], id: expect.stringMatching(/^creator-storyboard:/), createdAt: expect.any(String), updatedAt: expect.any(String) }),
      expect.objectContaining({ position: 2, purpose: '晚霞下的操场', mediaAssetIds: ['missing-media'], id: expect.stringMatching(/^creator-storyboard:/), createdAt: expect.any(String), updatedAt: expect.any(String) }),
    ]);
    expect(await getCreatorContentProjectData(dataDir, 'project-1')).toEqual({ contentProjects: [updated] });
  });

  it('rejects empty titles, invalid statuses, and invalid storyboard positions', async () => {
    await expect(createCreatorContent(dataDir, 'project-1', { title: '  ' })).rejects.toThrow('content title is required');
    await expect(createCreatorContent(dataDir, 'project-1', { title: '短片', status: 'invalid' as never })).rejects.toThrow('invalid content status');

    const content = await createCreatorContent(dataDir, 'project-1', { title: '短片' });
    await expect(updateCreatorContent(dataDir, 'project-1', content.id, {
      storyboardItems: [{ position: 0, purpose: '开场' }],
    })).rejects.toThrow('storyboard position must be positive');
    await expect(updateCreatorContent(dataDir, 'project-1', content.id, {
      storyboardItems: [{ position: 1, purpose: '开场' }, { position: 1, purpose: '结尾' }],
    })).rejects.toThrow('storyboard position must be unique');
    await expect(updateCreatorContent(dataDir, 'project-1', content.id, {
      storyboardItems: [{ position: 1, purpose: '  ' }],
    })).rejects.toThrow('storyboard purpose is required');
    await expect(updateCreatorContent(dataDir, 'project-1', content.id, {
      storyboardItems: [{ position: 1, purpose: '开场', mediaAssetIds: ['asset-1', 'asset-1'] }],
    })).rejects.toThrow('storyboard media asset ids must be unique');
  });

  it('rejects non-array storyboard item patches', async () => {
    const content = await createCreatorContent(dataDir, 'project-1', { title: '短片' });

    await expect(updateCreatorContent(dataDir, 'project-1', content.id, {
      storyboardItems: { position: 1 } as never,
    })).rejects.toThrow('storyboard items must be an array');
  });

  it('ignores forged storyboard metadata and retains server metadata across updates', async () => {
    const content = await createCreatorContent(dataDir, 'project-1', { title: '短片' });
    const first = await updateCreatorContent(dataDir, 'project-1', content.id, {
      storyboardItems: [{
        position: 1,
        purpose: '开场',
        id: 'forged-id',
        createdAt: '2000-01-01T00:00:00.000Z',
        updatedAt: '2000-01-01T00:00:00.000Z',
      } as never],
    });
    const firstItem = first!.storyboardItems[0]!;
    const second = await updateCreatorContent(dataDir, 'project-1', content.id, {
      storyboardItems: [{
        position: 1,
        purpose: '更新后的开场',
        id: 'forged-id-2',
        createdAt: '1999-01-01T00:00:00.000Z',
        updatedAt: '1999-01-01T00:00:00.000Z',
      } as never],
    });

    expect(firstItem).toMatchObject({ id: expect.stringMatching(/^creator-storyboard:/), createdAt: expect.any(String) });
    expect(firstItem.id).not.toBe('forged-id');
    expect(second!.storyboardItems[0]).toMatchObject({
      id: firstItem.id,
      createdAt: firstItem.createdAt,
      purpose: '更新后的开场',
    });
    const persistedItem = (await getCreatorContentProjectData(dataDir, 'project-1')).contentProjects[0]!.storyboardItems[0]!;
    expect(persistedItem.updatedAt).not.toBe('1999-01-01T00:00:00.000Z');
    expect(persistedItem.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('links tasks and storyboard media idempotently while preserving missing media links', async () => {
    const content = await createCreatorContent(dataDir, 'project-1', { title: '短片' });
    const withStoryboard = await updateCreatorContent(dataDir, 'project-1', content.id, {
      storyboardItems: [{ position: 1, purpose: '开场' }],
    });
    const itemId = withStoryboard!.storyboardItems[0]!.id;

    await linkCreatorContentTask(dataDir, 'project-1', content.id, 'creator-task:1');
    await linkCreatorContentTask(dataDir, 'project-1', content.id, 'creator-task:1');
    await linkCreatorStoryboardMedia(dataDir, 'project-1', content.id, itemId, 'missing-media');
    await linkCreatorStoryboardMedia(dataDir, 'project-1', content.id, itemId, 'missing-media');

    const stored = (await getCreatorContentProjectData(dataDir, 'project-1')).contentProjects[0]!;
    expect(stored.taskIds).toEqual(['creator-task:1']);
    expect(stored.storyboardItems[0]!.mediaAssetIds).toEqual(['missing-media']);
  });

  it('rejects blank link identifiers without altering existing content', async () => {
    const content = await createCreatorContent(dataDir, 'project-1', { title: '短片' });
    const withStoryboard = await updateCreatorContent(dataDir, 'project-1', content.id, {
      storyboardItems: [{ position: 1, purpose: '开场' }],
    });
    const itemId = withStoryboard!.storyboardItems[0]!.id;

    await expect(linkCreatorContentTask(dataDir, 'project-1', content.id, '  ')).rejects.toThrow('task id is required');
    await expect(unlinkCreatorContentTask(dataDir, 'project-1', content.id, '  ')).rejects.toThrow('task id is required');
    await expect(linkCreatorStoryboardMedia(dataDir, 'project-1', content.id, '  ', 'asset-1')).rejects.toThrow('storyboard item id is required');
    await expect(unlinkCreatorStoryboardMedia(dataDir, 'project-1', content.id, '  ', 'asset-1')).rejects.toThrow('storyboard item id is required');
    await expect(linkCreatorStoryboardMedia(dataDir, 'project-1', content.id, itemId, '  ')).rejects.toThrow('media asset id is required');
    await expect(unlinkCreatorStoryboardMedia(dataDir, 'project-1', content.id, itemId, '  ')).rejects.toThrow('media asset id is required');

    await expect(getCreatorContentProjectData(dataDir, 'project-1')).resolves.toEqual({
      contentProjects: [expect.objectContaining({
        id: content.id,
        taskIds: [],
        storyboardItems: [expect.objectContaining({ id: itemId, mediaAssetIds: [] })],
      })],
    });
  });

  it('unlinks idempotently, deletes once, and keeps projects isolated', async () => {
    const first = await createCreatorContent(dataDir, 'project-1', { title: '项目一' });
    const second = await createCreatorContent(dataDir, 'project-2', { title: '项目二' });
    const withStoryboard = await updateCreatorContent(dataDir, 'project-1', first.id, {
      storyboardItems: [{ position: 1, purpose: '开场', mediaAssetIds: ['asset-1'] }],
    });
    const itemId = withStoryboard!.storyboardItems[0]!.id;
    await linkCreatorContentTask(dataDir, 'project-1', first.id, 'creator-task:1');

    await unlinkCreatorContentTask(dataDir, 'project-1', first.id, 'creator-task:1');
    await unlinkCreatorContentTask(dataDir, 'project-1', first.id, 'creator-task:1');
    await unlinkCreatorStoryboardMedia(dataDir, 'project-1', first.id, itemId, 'asset-1');
    await unlinkCreatorStoryboardMedia(dataDir, 'project-1', first.id, itemId, 'asset-1');

    await expect(deleteCreatorContent(dataDir, 'project-1', first.id)).resolves.toBe(true);
    await expect(deleteCreatorContent(dataDir, 'project-1', first.id)).resolves.toBe(false);
    await expect(getCreatorContentProjectData(dataDir, 'project-1')).resolves.toEqual({ contentProjects: [] });
    await expect(getCreatorContentProjectData(dataDir, 'project-2')).resolves.toEqual({
      contentProjects: [expect.objectContaining({ id: second.id, title: '项目二' })],
    });
  });
});
