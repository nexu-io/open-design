import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
