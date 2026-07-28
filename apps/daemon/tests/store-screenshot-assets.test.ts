import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createStoreScreenshotAssetStore,
  MAX_STORE_SCREENSHOT_ASSET_BYTES,
} from '../src/store-screenshots/assets.js';
import { migrateStoreScreenshots } from '../src/store-screenshots/persistence.js';
import { LocalProjectStorage } from '../src/storage/project-storage.js';

describe('store screenshot assets', () => {
  let db: Database.Database;
  let root: string;
  let storage: LocalProjectStorage;

  beforeEach(async () => {
    db = new Database(':memory:');
    migrateStoreScreenshots(db);
    db.prepare(`
      INSERT INTO store_screenshot_documents
        (project_id, document_id, current_version, relative_path, created_at, updated_at)
      VALUES (?, ?, 1, ?, 0, 0)
    `).run('project-1', 'document-1', 'store-screenshots/document.json');
    root = await mkdtemp(path.join(os.tmpdir(), 'od-store-asset-'));
    storage = new LocalProjectStorage(root);
  });

  afterEach(async () => {
    db.close();
    await rm(root, { recursive: true, force: true });
  });

  it.each([
    ['png', 'image/png'],
    ['jpeg', 'image/jpeg'],
    ['webp', 'image/webp'],
  ] as const)('decodes and saves a real %s image', async (format, mime) => {
    const data = await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 4,
        background: '#336699',
      },
    })[format]().toBuffer();
    const extension = format === 'jpeg' ? 'jpg' : format;
    const assetStore = createStoreScreenshotAssetStore(db, storage);

    const asset = await assetStore.save('project-1', 'document-1', {
      fileName: `screenshot.${extension}`,
      declaredMime: mime,
      data,
    });

    expect(asset).toMatchObject({
      mime,
      width: 3,
      height: 2,
      contentHash: createHash('sha256').update(data).digest('hex'),
    });
    expect(path.isAbsolute(asset.relativePath)).toBe(false);
    expect(asset.relativePath).not.toContain(root);
    expect(await storage.readFile('project-1', asset.relativePath)).toEqual(data);
  });

  it('deduplicates identical bytes by SHA-256 content hash', async () => {
    const data = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: '#ffffff',
      },
    }).png().toBuffer();
    const assetStore = createStoreScreenshotAssetStore(db, storage, {
      now: () => 1_700_000_000_000,
    });

    const first = await assetStore.save('project-1', 'document-1', {
      fileName: 'first.png',
      data,
    });
    const duplicate = await assetStore.save('project-1', 'document-1', {
      fileName: 'renamed.png',
      data,
    });

    expect(duplicate).toEqual(first);
    expect((db.prepare(`
      SELECT count(*) AS count FROM store_screenshot_assets
      WHERE document_id = ?
    `).get('document-1') as { count: number }).count).toBe(1);
    expect((await storage.listFiles('project-1')).map(({ path: filePath }) => filePath))
      .toEqual([first.relativePath]);
  });

  it('deduplicates concurrent uploads of identical bytes', async () => {
    const data = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: '#ffffff',
      },
    }).png().toBuffer();
    const assetStore = createStoreScreenshotAssetStore(db, storage);
    const input = { fileName: 'same.png', data };

    const [first, second] = await Promise.all([
      assetStore.save('project-1', 'document-1', input),
      assetStore.save('project-1', 'document-1', input),
    ]);

    expect(second).toEqual(first);
    expect((db.prepare(`
      SELECT count(*) AS count FROM store_screenshot_assets
      WHERE document_id = ?
    `).get('document-1') as { count: number }).count).toBe(1);
  });

  it('rejects a forged extension even when the bytes are a valid image', async () => {
    const jpeg = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: '#ffffff',
      },
    }).jpeg().toBuffer();
    const assetStore = createStoreScreenshotAssetStore(db, storage);

    await expect(assetStore.save('project-1', 'document-1', {
      fileName: 'forged.png',
      declaredMime: 'image/png',
      data: jpeg,
    })).rejects.toMatchObject({ code: 'INVALID_ASSET' });
  });

  it('rejects an image whose header parses but pixel data is truncated', async () => {
    const png = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: '#ffffff',
      },
    }).png().toBuffer();
    const truncated = png.subarray(0, png.byteLength - 20);
    expect((await sharp(truncated).metadata()).format).toBe('png');
    const assetStore = createStoreScreenshotAssetStore(db, storage);

    await expect(assetStore.save('project-1', 'document-1', {
      fileName: 'truncated.png',
      data: truncated,
    })).rejects.toMatchObject({ code: 'INVALID_ASSET' });
  });

  it.each([
    ['vector.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>')],
    ['animation.gif', Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')],
    ['movie.mp4', Buffer.from('00000018667479706d703432', 'hex')],
  ])('rejects unsupported input %s', async (fileName, data) => {
    const assetStore = createStoreScreenshotAssetStore(db, storage);

    await expect(assetStore.save('project-1', 'document-1', {
      fileName,
      data,
    })).rejects.toMatchObject({ code: 'INVALID_ASSET' });
  });

  it('rejects files larger than 20 MiB', async () => {
    const assetStore = createStoreScreenshotAssetStore(db, storage);

    await expect(assetStore.save('project-1', 'document-1', {
      fileName: 'too-large.png',
      data: Buffer.alloc(MAX_STORE_SCREENSHOT_ASSET_BYTES + 1),
    })).rejects.toMatchObject({ code: 'INVALID_ASSET' });
  });
});
