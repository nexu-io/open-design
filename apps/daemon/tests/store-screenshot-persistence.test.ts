import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createStoreScreenshotPersistence,
  migrateStoreScreenshots,
} from '../src/store-screenshots/persistence.js';
import { LocalProjectStorage } from '../src/storage/project-storage.js';
import { closeDatabase, openDatabase } from '../src/db.js';

function makeDocument(version: number, headline: string) {
  return {
    schemaVersion: 1,
    id: 'document-1',
    projectId: 'project-1',
    version,
    product: {
      name: 'Focus',
      summary: '专注工具',
      audience: '创作者',
      features: ['番茄钟'],
    },
    designSystemId: 'clay',
    assets: [],
    pages: [{
      id: 'page-1',
      order: 0,
      templateId: 'minimal-center' as const,
      headline,
      overrides: {},
      lockedFields: [],
    }],
  };
}

describe('store screenshot persistence', () => {
  let db: Database.Database;
  let root: string;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    root = await mkdtemp(path.join(os.tmpdir(), 'od-store-screenshot-'));
  });

  afterEach(async () => {
    closeDatabase();
    db.close();
    await rm(root, { recursive: true, force: true });
  });

  it('runs its SQLite migration idempotently', () => {
    migrateStoreScreenshots(db);
    migrateStoreScreenshots(db);

    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'store_screenshot_%'
      ORDER BY name
    `).all() as Array<{ name: string }>;

    expect(tables.map(({ name }) => name)).toEqual([
      'store_screenshot_assets',
      'store_screenshot_documents',
      'store_screenshot_jobs',
      'store_screenshot_versions',
    ]);
  });

  it('runs the store screenshot migration from the daemon database bootstrap', () => {
    const bootDb = openDatabase(root, { dataDir: path.join(root, 'data') });
    const tables = bootDb.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'store_screenshot_%'
      ORDER BY name
    `).all() as Array<{ name: string }>;

    expect(tables.map(({ name }) => name)).toEqual([
      'store_screenshot_assets',
      'store_screenshot_documents',
      'store_screenshot_jobs',
      'store_screenshot_versions',
    ]);
  });

  it('writes canonical and version documents to project-relative paths', async () => {
    migrateStoreScreenshots(db);
    const storage = new LocalProjectStorage(root);
    const persistence = createStoreScreenshotPersistence(db, storage);

    const created = await persistence.create('project-1', makeDocument(1, '夺回注意力'));
    expect(created.version).toBe(1);

    const indexed = db.prepare(`
      SELECT relative_path AS relativePath
      FROM store_screenshot_documents
      WHERE project_id = ?
    `).get('project-1') as { relativePath: string };
    const version = db.prepare(`
      SELECT relative_path AS relativePath
      FROM store_screenshot_versions
      WHERE document_id = ? AND version = 1
    `).get('document-1') as { relativePath: string };

    expect(path.isAbsolute(indexed.relativePath)).toBe(false);
    expect(path.isAbsolute(version.relativePath)).toBe(false);
    expect(await storage.statFile('project-1', indexed.relativePath)).not.toBeNull();
    expect(await storage.statFile('project-1', version.relativePath)).not.toBeNull();
  });

  it('writes a new version and restores an old version as the next version', async () => {
    migrateStoreScreenshots(db);
    const storage = new LocalProjectStorage(root);
    const persistence = createStoreScreenshotPersistence(db, storage, {
      now: () => 1_700_000_000_000,
    });
    const documentV1 = makeDocument(1, '夺回注意力');
    const documentV2 = makeDocument(2, '专注完成每一天');
    const changeSet = {
      baseVersion: 1,
      operations: [{
        op: 'setText' as const,
        pageId: 'page-1',
        field: 'headline' as const,
        value: '专注完成每一天',
      }],
    };

    await persistence.create('project-1', documentV1);
    await persistence.save('project-1', documentV2, changeSet, 'manual');
    expect((await persistence.read('project-1')).version).toBe(2);

    const restored = await persistence.restore('project-1', 1);
    expect(restored.version).toBe(3);
    expect(restored.pages).toEqual(documentV1.pages);
    expect((await persistence.read('project-1')).version).toBe(3);
    expect(await persistence.listVersions('project-1')).toEqual([
      { version: 3, source: 'restore', createdAt: 1_700_000_000_000 },
      { version: 2, source: 'manual', createdAt: 1_700_000_000_000 },
      { version: 1, source: 'template', createdAt: 1_700_000_000_000 },
    ]);
  });

  it('rejects a save that skips the next version', async () => {
    migrateStoreScreenshots(db);
    const persistence = createStoreScreenshotPersistence(
      db,
      new LocalProjectStorage(root),
    );
    await persistence.create('project-1', makeDocument(1, '夺回注意力'));

    await expect(
      persistence.save('project-1', makeDocument(3, '跳过版本'), null, 'manual'),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('rejects a change set based on a stale document version', async () => {
    migrateStoreScreenshots(db);
    const persistence = createStoreScreenshotPersistence(
      db,
      new LocalProjectStorage(root),
    );
    await persistence.create('project-1', makeDocument(1, '夺回注意力'));

    await expect(persistence.save(
      'project-1',
      makeDocument(2, '过期修改'),
      {
        baseVersion: 2,
        operations: [{
          op: 'setText',
          pageId: 'page-1',
          field: 'headline',
          value: '过期修改',
        }],
      },
      'ai-change-set',
    )).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('does not let a rejected concurrent save overwrite the accepted version', async () => {
    migrateStoreScreenshots(db);
    const persistence = createStoreScreenshotPersistence(
      db,
      new LocalProjectStorage(root),
    );
    await persistence.create('project-1', makeDocument(1, '夺回注意力'));
    const first = makeDocument(2, '第一个更新');
    const second = makeDocument(2, '第二个更新');

    const outcomes = await Promise.allSettled([
      persistence.save('project-1', first, null, 'manual'),
      persistence.save('project-1', second, null, 'manual'),
    ]);
    const accepted = outcomes.find(
      (outcome): outcome is PromiseFulfilledResult<typeof first> => outcome.status === 'fulfilled',
    );

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect((await persistence.read('project-1')).pages).toEqual(accepted?.value.pages);
  });
});
