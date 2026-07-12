import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getCreatorMediaProjectData, linkCreatorTaskMediaAsset, upsertCreatorMediaAssets } from '../src/creator-media/store.js';

let dataDir = '';

beforeEach(async () => { dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-creator-media-store-')); });
afterEach(async () => { await fsp.rm(dataDir, { recursive: true, force: true }); });

describe('creator media store', () => {
  it('upserts a path and links its asset to a task idempotently', async () => {
    const candidate = { rootPath: 'C:\\media', sourcePath: 'C:\\media\\clip.mp4', relativePath: 'clip.mp4', fileName: 'clip.mp4', extension: '.mp4', kind: 'video' as const, sizeBytes: 12, modifiedAt: '2025-01-01T00:00:00.000Z', availability: 'available' as const, thumbnailStatus: 'unavailable' as const };
    const [asset] = await upsertCreatorMediaAssets(dataDir, 'project-1', [candidate]);
    const [again] = await upsertCreatorMediaAssets(dataDir, 'project-1', [candidate]);
    await linkCreatorTaskMediaAsset(dataDir, 'project-1', 'creator-task:1', asset!.id);
    await linkCreatorTaskMediaAsset(dataDir, 'project-1', 'creator-task:1', asset!.id);

    expect(again!.id).toBe(asset!.id);
    await expect(linkCreatorTaskMediaAsset(dataDir, 'project-2', 'creator-task:2', asset!.id)).rejects.toThrow('creator media asset not found');
  });

  it('records roots and marks disappeared files missing without removing links', async () => {
    const first = { rootPath: 'C:\\media', sourcePath: 'C:\\media\\gone.mp4', relativePath: 'gone.mp4', fileName: 'gone.mp4', extension: '.mp4', kind: 'video' as const, sizeBytes: 12, modifiedAt: '2025-01-01T00:00:00.000Z', availability: 'available' as const, thumbnailStatus: 'unavailable' as const };
    const second = { ...first, sourcePath: 'C:\\media\\kept.mp4', relativePath: 'kept.mp4', fileName: 'kept.mp4' };
    const [gone, kept] = await upsertCreatorMediaAssets(dataDir, 'project-1', [first, second], { rootPath: first.rootPath, complete: true, scannedAt: '2025-01-02T00:00:00.000Z' });
    await linkCreatorTaskMediaAsset(dataDir, 'project-1', 'creator-task:1', gone!.id);
    await upsertCreatorMediaAssets(dataDir, 'project-1', [second], { rootPath: first.rootPath, complete: true, scannedAt: '2025-01-03T00:00:00.000Z' });

    const data = await getCreatorMediaProjectData(dataDir, 'project-1');
    expect(data.roots).toEqual([{ rootPath: first.rootPath, addedAt: expect.any(String), lastScannedAt: '2025-01-03T00:00:00.000Z' }]);
    expect(data.assets.find((asset) => asset.id === gone!.id)).toMatchObject({ availability: 'missing' });
    expect(data.assets.find((asset) => asset.id === kept!.id)).toMatchObject({ availability: 'available' });
    expect(data.taskLinks).toEqual([expect.objectContaining({ taskId: 'creator-task:1', assetId: gone!.id })]);
  });

  it('does not mark a root incomplete when the scan reports errors', async () => {
    const candidate = { rootPath: 'C:\\media', sourcePath: 'C:\\media\\clip.mp4', relativePath: 'clip.mp4', fileName: 'clip.mp4', extension: '.mp4', kind: 'video' as const, sizeBytes: 12, modifiedAt: '2025-01-01T00:00:00.000Z', availability: 'available' as const, thumbnailStatus: 'unavailable' as const };
    const [asset] = await upsertCreatorMediaAssets(dataDir, 'project-1', [candidate], { rootPath: candidate.rootPath, complete: true });
    await upsertCreatorMediaAssets(dataDir, 'project-1', [], { rootPath: candidate.rootPath, complete: false });
    const data = await getCreatorMediaProjectData(dataDir, 'project-1');
    expect(data.assets.find((item) => item.id === asset!.id)).toMatchObject({ availability: 'available' });
  });
});
