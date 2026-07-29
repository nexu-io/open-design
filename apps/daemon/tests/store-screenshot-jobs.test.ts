import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { StoreScreenshotDocument } from '@launch-studio/store-screenshot';
import {
  createStoreScreenshotJobs,
  reconcileStoreScreenshotJobsOnBoot,
  type StoreScreenshotJobTask,
} from '../src/store-screenshots/jobs.js';
import { createStoreScreenshotAssetStore } from '../src/store-screenshots/assets.js';
import {
  createStoreScreenshotPersistence,
  migrateStoreScreenshots,
} from '../src/store-screenshots/persistence.js';
import { createStoreScreenshotService } from '../src/store-screenshots/service.js';
import { LocalProjectStorage } from '../src/storage/project-storage.js';

function documentFixture(
  projectId = 'project-1',
  documentId = 'document-1',
): StoreScreenshotDocument {
  return {
    schemaVersion: 1,
    id: documentId,
    projectId,
    version: 1,
    product: {
      name: 'Focus',
      summary: 'Make time for meaningful work',
      audience: 'Creators',
      features: ['Plan', 'Focus', 'Review', 'Improve'],
    },
    designSystemId: 'clay',
    assets: [],
    pages: Array.from({ length: 4 }, (_, index) => ({
      id: `page-${index + 1}`,
      order: index,
      templateId: index === 1 ? 'gradient-device' as const : 'minimal-center' as const,
      headline: `Feature ${index + 1}`,
      overrides: {},
      lockedFields: [],
    })),
  };
}

describe('store screenshot export jobs', () => {
  let db: Database.Database;
  let root: string;
  let storage: LocalProjectStorage;
  let persistence: ReturnType<typeof createStoreScreenshotPersistence>;
  let scheduled: StoreScreenshotJobTask[];
  let clock: number;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migrateStoreScreenshots(db);
    root = await mkdtemp(path.join(os.tmpdir(), 'od-store-screenshot-jobs-'));
    storage = new LocalProjectStorage(root);
    persistence = createStoreScreenshotPersistence(db, storage, {
      now: () => 1_700_000_000_000,
    });
    await persistence.create('project-1', documentFixture());
    scheduled = [];
    clock = Date.parse('2026-07-29T08:00:00.000Z');
  });

  afterEach(async () => {
    db.close();
    await rm(root, { recursive: true, force: true });
  });

  function jobs() {
    return createStoreScreenshotJobs({
      db,
      persistence,
      projectStorage: storage,
      createId: () => 'job-1',
      now: () => clock++,
      schedule: (task) => {
        scheduled.push(task);
      },
    });
  }

  it('persists queued, running, and done states and writes the complete export under its job path', async () => {
    const operations = jobs();
    const queued = await operations.startExport(
      { projectId: 'project-1', documentId: 'document-1', documentVersion: 1 },
      { platforms: ['appStore', 'googlePlay'] },
    );

    expect(queued).toMatchObject({
      id: 'job-1',
      type: 'export',
      status: 'queued',
      progress: { completed: 0, total: 8 },
    });
    expect(scheduled).toHaveLength(1);

    const run = scheduled[0]!();
    expect(await operations.get('project-1', 'document-1', 'job-1')).toMatchObject({
      status: 'running',
    });
    await run;

    const done = await operations.get('project-1', 'document-1', 'job-1');
    expect(done).toMatchObject({
      status: 'done',
      progress: { completed: 8, total: 8 },
      result: {
        downloadPath: 'store-screenshots/exports/job-1/store-screenshots.zip',
      },
    });
    expect(await operations.resolveDownload('project-1', 'document-1', 'job-1')).toEqual({
      relativePath: 'store-screenshots/exports/job-1/store-screenshots.zip',
    });

    const files = (await storage.listFiles('project-1'))
      .filter(({ path: filePath }) => filePath.includes('/exports/'));
    expect(files.length).toBe(10);
    expect(files.every(({ path: filePath }) => (
      filePath.startsWith('store-screenshots/exports/job-1/')
    ))).toBe(true);
    const zip = await JSZip.loadAsync(await storage.readFile(
      'project-1',
      'store-screenshots/exports/job-1/store-screenshots.zip',
    ));
    expect(Object.keys(zip.files).sort()).toEqual([
      'app-store/01.png',
      'app-store/02.png',
      'app-store/03.png',
      'app-store/04.png',
      'google-play/01.png',
      'google-play/02.png',
      'google-play/03.png',
      'google-play/04.png',
      'manifest.json',
    ]);
  });

  it('persists validation failures and never exposes an incomplete download', async () => {
    const document = await persistence.read('project-1');
    await persistence.save('project-1', {
      ...document,
      version: 2,
      pages: document.pages.map((page, index) => (
        index === 3
          ? { ...page, overrides: { googlePlay: { hidden: true } } }
          : page
      )),
    }, null, 'manual');
    const operations = jobs();
    await operations.startExport(
      { projectId: 'project-1', documentId: 'document-1', documentVersion: 2 },
      { platforms: ['googlePlay'] },
    );
    await scheduled[0]!();

    expect(await operations.get('project-1', 'document-1', 'job-1')).toMatchObject({
      status: 'failed',
      error: {
        code: 'VALIDATION_FAILED',
      },
    });
    expect(await operations.resolveDownload('project-1', 'document-1', 'job-1')).toBeNull();
  });

  it('marks queued and running rows interrupted on daemon restart while preserving terminal rows', async () => {
    const insert = db.prepare(`
      INSERT INTO store_screenshot_jobs
        (id, project_id, document_id, type, status, progress_json,
         result_json, error_json, created_at, started_at, ended_at, updated_at)
      VALUES (?, 'project-1', 'document-1', 'export', ?, '{"completed":0,"total":4}',
              NULL, NULL, 100, ?, ?, 100)
    `);
    insert.run('queued', 'queued', null, null);
    insert.run('running', 'running', 110, null);
    insert.run('done', 'done', 110, 120);

    expect(reconcileStoreScreenshotJobsOnBoot(db, { now: 1_000 })).toEqual({
      interrupted: 2,
    });
    const rows = db.prepare(`
      SELECT id, status, error_json AS errorJson, ended_at AS endedAt
      FROM store_screenshot_jobs
      ORDER BY id
    `).all() as Array<{
      id: string;
      status: string;
      errorJson: string | null;
      endedAt: number | null;
    }>;
    expect(rows.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: 'done', status: 'done' },
      { id: 'queued', status: 'interrupted' },
      { id: 'running', status: 'interrupted' },
    ]);
    for (const row of rows.filter(({ id }) => id !== 'done')) {
      expect(row.endedAt).toBe(1_000);
      expect(JSON.parse(row.errorJson!)).toEqual({
        code: 'DAEMON_RESTART',
        message: 'Store screenshot job interrupted by daemon restart',
      });
    }
  });

  it('scopes job and download lookup to project and document ownership', async () => {
    const operations = jobs();
    await operations.startExport(
      { projectId: 'project-1', documentId: 'document-1', documentVersion: 1 },
      { platforms: ['appStore'] },
    );
    await scheduled[0]!();

    await expect(operations.get('project-2', 'document-1', 'job-1')).resolves.toBeNull();
    await expect(operations.get('project-1', 'document-2', 'job-1')).resolves.toBeNull();
    await expect(
      operations.resolveDownload('project-2', 'document-1', 'job-1'),
    ).resolves.toBeNull();
  });

  it('closes the task-5 service export, job, and download operation boundary', async () => {
    const operations = jobs();
    const service = createStoreScreenshotService({
      persistence,
      assets: createStoreScreenshotAssetStore(db, storage),
      projectStorage: storage,
      createId: () => 'unused-document-id',
      jobs: operations,
    });

    expect(await service.export('project-1', {
      platforms: ['appStore'],
    })).toMatchObject({
      id: 'job-1',
      status: 'queued',
    });
    await scheduled[0]!();
    expect(await service.getJob('project-1', 'job-1')).toMatchObject({
      status: 'done',
    });
    const download = await service.readJobDownload('project-1', 'job-1');
    expect(download.fileName).toBe('store-screenshots.zip');
    expect(await JSZip.loadAsync(download.body)).toBeInstanceOf(JSZip);
  });

  it('renders persisted uploaded asset bytes through the production export job', async () => {
    const body = await sharp({
      create: {
        width: 40,
        height: 80,
        channels: 3,
        background: '#F02030',
      },
    }).png().toBuffer();
    const contentHash = createHash('sha256').update(body).digest('hex');
    const relativePath = `store-screenshots/assets/${contentHash}.png`;
    await storage.writeFile('project-1', relativePath, body);
    db.prepare(`
      INSERT INTO store_screenshot_assets
        (id, document_id, relative_path, mime, width, height, content_hash, created_at)
      VALUES ('asset-1', 'document-1', ?, 'image/png', 40, 80, ?, 100)
    `).run(relativePath, contentHash);
    const document = await persistence.read('project-1');
    await persistence.save('project-1', {
      ...document,
      version: 2,
      assets: [{ id: 'asset-1' }],
      pages: document.pages.map((page, index) => (
        index === 0 ? { ...page, screenshotAssetId: 'asset-1' } : page
      )),
    }, null, 'manual');

    const operations = jobs();
    await operations.startExport(
      { projectId: 'project-1', documentId: 'document-1', documentVersion: 2 },
      { platforms: ['appStore'] },
    );
    await scheduled[0]!();

    expect(await operations.get('project-1', 'document-1', 'job-1')).toMatchObject({
      status: 'done',
    });
    const png = await storage.readFile(
      'project-1',
      'store-screenshots/exports/job-1/app-store/01.png',
    );
    const pixel = await sharp(png)
      .extract({ left: 640, top: 1800, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect(pixel[0]).toBeGreaterThan(220);
    expect(pixel[1]).toBeLessThan(80);
    expect(pixel[2]).toBeLessThan(100);
  });

  it.each([
    ['cross-document asset', 'ASSET_OWNER_MISMATCH'],
    ['missing asset file', 'ASSET_FILE_MISSING'],
    ['unsafe asset path', 'UNSAFE_ASSET_PATH'],
  ])('fails the export job with a structured error for %s', async (scenario, expectedCode) => {
    if (scenario === 'cross-document asset') {
      await persistence.create('project-2', documentFixture('project-2', 'document-2'));
    }
    const document = await persistence.read('project-1');
    await persistence.save('project-1', {
      ...document,
      version: 2,
      assets: [{ id: 'asset-1' }],
      pages: document.pages.map((page, index) => (
        index === 0 ? { ...page, screenshotAssetId: 'asset-1' } : page
      )),
    }, null, 'manual');
    const ownerDocumentId = scenario === 'cross-document asset'
      ? 'document-2'
      : 'document-1';
    const relativePath = scenario === 'unsafe asset path'
      ? 'store-screenshots/assets/../escape.png'
      : 'store-screenshots/assets/asset-1.png';
    db.prepare(`
      INSERT INTO store_screenshot_assets
        (id, document_id, relative_path, mime, width, height, content_hash, created_at)
      VALUES ('asset-1', ?, ?, 'image/png', 10, 20, ?, 100)
    `).run(ownerDocumentId, relativePath, 'a'.repeat(64));

    const operations = jobs();
    await operations.startExport(
      { projectId: 'project-1', documentId: 'document-1', documentVersion: 2 },
      { platforms: ['appStore'] },
    );
    await scheduled[0]!();

    expect(await operations.get('project-1', 'document-1', 'job-1')).toMatchObject({
      status: 'failed',
      error: {
        code: expectedCode,
      },
    });
    expect(await operations.resolveDownload('project-1', 'document-1', 'job-1')).toBeNull();
  });
});
