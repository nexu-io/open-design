import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createStoreScreenshotPersistence,
  migrateStoreScreenshots,
} from '../src/store-screenshots/persistence.js';
import {
  LocalProjectStorage,
  type ProjectFileMeta,
  type ProjectStorage,
} from '../src/storage/project-storage.js';
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

class BlockingDocumentStorage implements ProjectStorage {
  readonly blocked: Promise<void>;
  private resolveBlocked = (): void => {};
  private resolveRelease = (): void => {};
  private readonly release: Promise<void>;
  private didBlock = false;

  constructor(
    private readonly delegate: ProjectStorage,
    private readonly blockedHeadline: string,
  ) {
    this.blocked = new Promise((resolve) => {
      this.resolveBlocked = resolve;
    });
    this.release = new Promise((resolve) => {
      this.resolveRelease = resolve;
    });
  }

  allowBlockedWrite(): void {
    this.resolveRelease();
  }

  async readFile(projectId: string, relpath: string): Promise<Buffer> {
    return this.delegate.readFile(projectId, relpath);
  }

  async writeFile(
    projectId: string,
    relpath: string,
    body: Buffer,
  ): Promise<ProjectFileMeta> {
    if (!this.didBlock && relpath.includes('store-screenshots/versions/')) {
      const parsed = JSON.parse(body.toString('utf8')) as {
        pages?: Array<{ headline?: string }>;
      };
      if (parsed.pages?.[0]?.headline === this.blockedHeadline) {
        this.didBlock = true;
        this.resolveBlocked();
        await this.release;
      }
    }
    return this.delegate.writeFile(projectId, relpath, body);
  }

  async listFiles(projectId: string): Promise<ProjectFileMeta[]> {
    return this.delegate.listFiles(projectId);
  }

  async deleteFile(projectId: string, relpath: string): Promise<void> {
    return this.delegate.deleteFile(projectId, relpath);
  }

  async statFile(projectId: string, relpath: string): Promise<ProjectFileMeta | null> {
    return this.delegate.statFile(projectId, relpath);
  }
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

  it('creates foreign keys with cascade semantics for every child table', () => {
    migrateStoreScreenshots(db);

    const foreignKeys = (table: string) => db.prepare(
      `PRAGMA foreign_key_list(${table})`,
    ).all() as Array<{
      table: string;
      from: string;
      to: string;
      on_delete: string;
      id: number;
      seq: number;
    }>;

    expect(foreignKeys('store_screenshot_versions')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'store_screenshot_documents',
        from: 'document_id',
        to: 'document_id',
        on_delete: 'CASCADE',
      }),
    ]));
    expect(foreignKeys('store_screenshot_assets')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'store_screenshot_documents',
        from: 'document_id',
        to: 'document_id',
        on_delete: 'CASCADE',
      }),
    ]));
    expect(foreignKeys('store_screenshot_jobs')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'store_screenshot_documents',
        from: 'project_id',
        to: 'project_id',
        on_delete: 'CASCADE',
      }),
      expect.objectContaining({
        table: 'store_screenshot_documents',
        from: 'document_id',
        to: 'document_id',
        on_delete: 'CASCADE',
      }),
    ]));
  });

  it('rejects orphan rows and cascades child rows when a document is deleted', () => {
    migrateStoreScreenshots(db);

    expect(() => db.prepare(`
      INSERT INTO store_screenshot_versions
        (document_id, version, source, relative_path, created_at)
      VALUES ('missing', 1, 'manual', 'missing.json', 0)
    `).run()).toThrow(/FOREIGN KEY constraint failed/);
    expect(() => db.prepare(`
      INSERT INTO store_screenshot_assets
        (id, document_id, relative_path, mime, width, height, content_hash, created_at)
      VALUES ('asset-orphan', 'missing', 'missing.png', 'image/png', 1, 1, 'hash', 0)
    `).run()).toThrow(/FOREIGN KEY constraint failed/);
    expect(() => db.prepare(`
      INSERT INTO store_screenshot_jobs
        (id, project_id, document_id, type, status, progress_json, created_at, updated_at)
      VALUES ('job-orphan', 'project-1', 'missing', 'render', 'queued', '{}', 0, 0)
    `).run()).toThrow(/FOREIGN KEY constraint failed/);

    db.prepare(`
      INSERT INTO store_screenshot_documents
        (project_id, document_id, current_version, relative_path, created_at, updated_at)
      VALUES ('project-1', 'document-1', 1, 'document.json', 0, 0)
    `).run();
    db.prepare(`
      INSERT INTO store_screenshot_documents
        (project_id, document_id, current_version, relative_path, created_at, updated_at)
      VALUES ('project-2', 'document-2', 1, 'document-2.json', 0, 0)
    `).run();
    expect(() => db.prepare(`
      INSERT INTO store_screenshot_jobs
        (id, project_id, document_id, type, status, progress_json, created_at, updated_at)
      VALUES ('job-mismatch', 'project-1', 'document-2', 'render', 'queued', '{}', 0, 0)
    `).run()).toThrow(/FOREIGN KEY constraint failed/);
    db.prepare(`
      INSERT INTO store_screenshot_versions
        (document_id, version, source, relative_path, created_at)
      VALUES ('document-1', 1, 'manual', 'version.json', 0)
    `).run();
    db.prepare(`
      INSERT INTO store_screenshot_assets
        (id, document_id, relative_path, mime, width, height, content_hash, created_at)
      VALUES ('asset-1', 'document-1', 'asset.png', 'image/png', 1, 1, 'hash', 0)
    `).run();
    db.prepare(`
      INSERT INTO store_screenshot_jobs
        (id, project_id, document_id, type, status, progress_json, created_at, updated_at)
      VALUES ('job-1', 'project-1', 'document-1', 'render', 'queued', '{}', 0, 0)
    `).run();

    db.prepare(`DELETE FROM store_screenshot_documents WHERE project_id = 'project-1'`).run();
    for (const table of [
      'store_screenshot_versions',
      'store_screenshot_assets',
      'store_screenshot_jobs',
    ]) {
      expect((db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count)
        .toBe(0);
    }
  });

  it('upgrades legacy child tables without foreign keys and preserves valid rows', () => {
    db.exec(`
      CREATE TABLE store_screenshot_documents (
        project_id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        current_version INTEGER NOT NULL,
        relative_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE store_screenshot_versions (
        document_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        source TEXT NOT NULL,
        changeset_json TEXT,
        relative_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (document_id, version)
      );
      CREATE TABLE store_screenshot_assets (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        mime TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE store_screenshot_jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        progress_json TEXT NOT NULL,
        result_json TEXT,
        error_json TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        ended_at INTEGER,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO store_screenshot_documents
        VALUES ('project-1', 'document-1', 1, 'document.json', 0, 0);
      INSERT INTO store_screenshot_versions
        VALUES ('document-1', 1, 'manual', NULL, 'version.json', 0);
      INSERT INTO store_screenshot_versions
        VALUES ('missing', 1, 'manual', NULL, 'orphan.json', 0);
      INSERT INTO store_screenshot_assets
        VALUES ('asset-1', 'document-1', 'asset.png', 'image/png', 1, 1, 'hash', 0);
      INSERT INTO store_screenshot_assets
        VALUES ('asset-orphan', 'missing', 'orphan.png', 'image/png', 1, 1, 'orphan', 0);
      INSERT INTO store_screenshot_jobs
        VALUES ('job-1', 'project-1', 'document-1', 'render', 'queued', '{}', NULL, NULL, 0, NULL, NULL, 0);
      INSERT INTO store_screenshot_jobs
        VALUES ('job-orphan', 'wrong-project', 'document-1', 'render', 'queued', '{}', NULL, NULL, 0, NULL, NULL, 0);
    `);

    migrateStoreScreenshots(db);
    migrateStoreScreenshots(db);

    expect((db.prepare(`SELECT count(*) AS count FROM store_screenshot_versions`).get() as { count: number }).count)
      .toBe(1);
    expect((db.prepare(`SELECT count(*) AS count FROM store_screenshot_assets`).get() as { count: number }).count)
      .toBe(1);
    expect((db.prepare(`SELECT count(*) AS count FROM store_screenshot_jobs`).get() as { count: number }).count)
      .toBe(1);
    expect(() => db.prepare(`
      INSERT INTO store_screenshot_versions
        (document_id, version, source, relative_path, created_at)
      VALUES ('missing-again', 1, 'manual', 'missing.json', 0)
    `).run()).toThrow(/FOREIGN KEY constraint failed/);
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

  it('keeps the winning save in canonical and snapshot files across persistence instances', async () => {
    migrateStoreScreenshots(db);
    const local = new LocalProjectStorage(root);
    const storage = new BlockingDocumentStorage(local, 'rejected-slow');
    const seed = createStoreScreenshotPersistence(db, storage);
    await seed.create('project-1', makeDocument(1, 'seed'));
    const slowPersistence = createStoreScreenshotPersistence(db, storage);
    const fastPersistence = createStoreScreenshotPersistence(db, storage);

    const slow = slowPersistence.save(
      'project-1',
      makeDocument(2, 'rejected-slow'),
      null,
      'manual',
    );
    await storage.blocked;
    const fast = await fastPersistence.save(
      'project-1',
      makeDocument(2, 'accepted-fast'),
      null,
      'manual',
    );
    storage.allowBlockedWrite();

    await expect(slow).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(fast.pages[0]?.headline).toBe('accepted-fast');
    const indexed = db.prepare(`
      SELECT relative_path AS relativePath
      FROM store_screenshot_versions
      WHERE document_id = 'document-1' AND version = 2
    `).get() as { relativePath: string };
    const snapshot = JSON.parse(
      (await local.readFile('project-1', indexed.relativePath)).toString('utf8'),
    ) as ReturnType<typeof makeDocument>;
    const canonical = JSON.parse(
      (await local.readFile('project-1', 'store-screenshots/document.json')).toString('utf8'),
    ) as ReturnType<typeof makeDocument>;
    expect(snapshot.pages[0]?.headline).toBe('accepted-fast');
    expect(canonical.pages[0]?.headline).toBe('accepted-fast');
    const versionFiles = (await local.listFiles('project-1'))
      .filter(({ path: filePath }) => filePath.startsWith('store-screenshots/versions/'));
    const storedHeadlines = await Promise.all(versionFiles.map(async ({ path: filePath }) => {
      const stored = JSON.parse(
        (await local.readFile('project-1', filePath)).toString('utf8'),
      ) as ReturnType<typeof makeDocument>;
      return stored.pages[0]?.headline;
    }));
    expect(storedHeadlines).not.toContain('rejected-slow');
  });

  it('keeps the winning create in canonical and snapshot files across persistence instances', async () => {
    migrateStoreScreenshots(db);
    const local = new LocalProjectStorage(root);
    const storage = new BlockingDocumentStorage(local, 'rejected-slow-create');
    const slowPersistence = createStoreScreenshotPersistence(db, storage);
    const fastPersistence = createStoreScreenshotPersistence(db, storage);

    const slow = slowPersistence.create(
      'project-1',
      makeDocument(1, 'rejected-slow-create'),
    );
    await storage.blocked;
    const fast = await fastPersistence.create(
      'project-1',
      makeDocument(1, 'accepted-fast-create'),
    );
    storage.allowBlockedWrite();

    await expect(slow).rejects.toMatchObject({ code: 'DOCUMENT_EXISTS' });
    expect(fast.pages[0]?.headline).toBe('accepted-fast-create');
    const indexed = db.prepare(`
      SELECT relative_path AS relativePath
      FROM store_screenshot_versions
      WHERE document_id = 'document-1' AND version = 1
    `).get() as { relativePath: string };
    const snapshot = JSON.parse(
      (await local.readFile('project-1', indexed.relativePath)).toString('utf8'),
    ) as ReturnType<typeof makeDocument>;
    const canonical = JSON.parse(
      (await local.readFile('project-1', 'store-screenshots/document.json')).toString('utf8'),
    ) as ReturnType<typeof makeDocument>;
    expect(snapshot.pages[0]?.headline).toBe('accepted-fast-create');
    expect(canonical.pages[0]?.headline).toBe('accepted-fast-create');
    const versionFiles = (await local.listFiles('project-1'))
      .filter(({ path: filePath }) => filePath.startsWith('store-screenshots/versions/'));
    const storedHeadlines = await Promise.all(versionFiles.map(async ({ path: filePath }) => {
      const stored = JSON.parse(
        (await local.readFile('project-1', filePath)).toString('utf8'),
      ) as ReturnType<typeof makeDocument>;
      return stored.pages[0]?.headline;
    }));
    expect(storedHeadlines).not.toContain('rejected-slow-create');
  });
});
