import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { linkCreatorTaskMediaAsset, upsertCreatorMediaAssets } from '../src/creator-media/store.js';

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
});
