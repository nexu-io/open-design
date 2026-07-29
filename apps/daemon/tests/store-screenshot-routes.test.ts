import Database from 'better-sqlite3';
import express from 'express';
import type { Response } from 'express';
import multer from 'multer';
import type http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sendApiError } from '../src/http/api-errors.js';
import { requireLocalDaemonRequest } from '../src/http/local-daemon-request.js';
import {
  getRouteRegistrationInventory,
  installRouteRegistrationGuard,
} from '../src/route-registration-guard.js';
import {
  registerStoreScreenshotRoutes,
  type RegisterStoreScreenshotRoutesDeps,
} from '../src/routes/store-screenshots.js';
import {
  createStoreScreenshotService,
  StoreScreenshotServiceError,
} from '../src/store-screenshots/service.js';
import {
  createStoreScreenshotPersistence,
  migrateStoreScreenshots,
} from '../src/store-screenshots/persistence.js';
import { createStoreScreenshotAssetStore } from '../src/store-screenshots/assets.js';
import { LocalProjectStorage } from '../src/storage/project-storage.js';

const PROJECT_ID = 'project-1';

const createBody = {
  product: {
    name: 'Focus',
    summary: '专注工具',
    audience: '创作者',
    features: ['计时', '统计', '复盘', '提醒'],
  },
  designSystemId: 'clay',
  templateId: 'minimal-center',
  pageCount: 4,
  platforms: ['appStore', 'googlePlay'],
};

type JsonResponse = {
  status: number;
  body: Record<string, any>;
};

describe('store screenshot routes', () => {
  let db: Database.Database;
  let root: string;
  let server: http.Server;
  let baseUrl: string;
  let inventory: ReturnType<typeof getRouteRegistrationInventory>;
  let downloadPath: string | undefined;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migrateStoreScreenshots(db);
    root = await mkdtemp(path.join(os.tmpdir(), 'od-store-screenshot-routes-'));
    const projectStorage = new LocalProjectStorage(root);
    const persistence = createStoreScreenshotPersistence(db, projectStorage, {
      now: () => 1_700_000_000_000,
    });
    const assets = createStoreScreenshotAssetStore(db, projectStorage, {
      now: () => 1_700_000_000_000,
    });
    downloadPath = undefined;
    let id = 0;
    const storeScreenshots = createStoreScreenshotService({
      persistence,
      assets,
      projectStorage,
      createId: () => `document-${++id}`,
      jobs: {
        startExport: async () => {
          throw new StoreScreenshotServiceError(
            'NOT_IMPLEMENTED',
            'Store screenshot export is not implemented',
          );
        },
        get: async () => {
          throw new StoreScreenshotServiceError(
            'NOT_IMPLEMENTED',
            'Store screenshot jobs are not implemented',
          );
        },
        resolveDownload: async () => {
          if (downloadPath) return { relativePath: downloadPath };
          throw new StoreScreenshotServiceError(
            'NOT_IMPLEMENTED',
            'Store screenshot downloads are not implemented',
          );
        },
      },
    });
    const app = express();
    installRouteRegistrationGuard(app);
    app.use(express.json());
    registerStoreScreenshotRoutes(app, {
      db,
      http: {
        requireLocalDaemonRequest,
        sendApiError,
        sendMulterError: (res: Response, error: unknown) => sendApiError(
          res,
          400,
          'BAD_REQUEST',
          error instanceof Error ? error.message : String(error),
        ),
      },
      projectStore: {
        getProject: (_db: Database.Database, projectId: string) => (
          projectId === PROJECT_ID ? { id: PROJECT_ID } : null
        ),
      },
      uploads: {
        storeScreenshotUpload: multer({
          storage: multer.memoryStorage(),
          limits: { fileSize: 20 * 1024 * 1024, files: 1 },
        }),
      },
      storeScreenshots,
    } as unknown as RegisterStoreScreenshotRoutesDeps);
    inventory = getRouteRegistrationInventory(app);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    db.close();
    await rm(root, { recursive: true, force: true });
  });

  async function json(
    method: string,
    pathname: string,
    body?: Record<string, unknown>,
  ): Promise<JsonResponse> {
    const response = await fetch(`${baseUrl}${pathname}`, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    return {
      status: response.status,
      body: await response.json() as Record<string, any>,
    };
  }

  it('creates, reads, previews, applies, validates, versions, and restores through HTTP', async () => {
    const basePath = `/api/projects/${PROJECT_ID}/store-screenshots`;
    const created = await json('POST', basePath, createBody);
    expect(created.status).toBe(201);
    expect(created.body.document).toMatchObject({
      id: 'document-1',
      projectId: PROJECT_ID,
      version: 1,
    });
    expect(created.body.document.pages).toHaveLength(4);

    const read = await json('GET', basePath);
    expect(read.status).toBe(200);
    expect(read.body).toEqual(created.body);

    const renamePage = {
      op: 'setText',
      pageId: 'page-2',
      field: 'headline',
      value: '看见进展',
    };
    const preview = await json('POST', `${basePath}/changes/preview`, {
      baseVersion: 1,
      operations: [renamePage],
    });
    expect(preview.status).toBe(200);
    expect(preview.body.affectedPageIds).toEqual(['page-2']);
    expect((await json('GET', basePath)).body.document.version).toBe(1);

    const applied = await json('POST', `${basePath}/changes/apply`, {
      baseVersion: 1,
      operations: [renamePage],
    });
    expect(applied.status).toBe(200);
    expect(applied.body.document).toMatchObject({ version: 2 });
    expect(applied.body.document.pages[1].headline).toBe('看见进展');

    const conflict = await json('POST', `${basePath}/changes/apply`, {
      baseVersion: 1,
      operations: [renamePage],
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toMatchObject({ code: 'VERSION_CONFLICT' });

    const validation = await json('POST', `${basePath}/validate`, {
      platforms: ['appStore', 'googlePlay'],
    });
    expect(validation).toEqual({
      status: 200,
      body: { valid: true, issues: [] },
    });

    const versions = await json('GET', `${basePath}/versions`);
    expect(versions.status).toBe(200);
    expect(versions.body.versions.map(({ version }: { version: number }) => version))
      .toEqual([2, 1]);

    const restored = await json('POST', `${basePath}/versions/1/restore`, {});
    expect(restored.status).toBe(200);
    expect(restored.body.document.version).toBe(3);
    expect(restored.body.document.pages[1].headline).toBe('统计');

    expect(inventory).toEqual(expect.arrayContaining([
      { method: 'POST', path: '/api/projects/:projectId/store-screenshots' },
      { method: 'GET', path: '/api/projects/:projectId/store-screenshots' },
      { method: 'POST', path: '/api/projects/:projectId/store-screenshots/assets' },
      { method: 'POST', path: '/api/projects/:projectId/store-screenshots/changes/preview' },
      { method: 'POST', path: '/api/projects/:projectId/store-screenshots/changes/apply' },
      { method: 'GET', path: '/api/projects/:projectId/store-screenshots/versions' },
      { method: 'POST', path: '/api/projects/:projectId/store-screenshots/versions/:version/restore' },
      { method: 'POST', path: '/api/projects/:projectId/store-screenshots/validate' },
      { method: 'POST', path: '/api/projects/:projectId/store-screenshots/generate' },
      { method: 'POST', path: '/api/projects/:projectId/store-screenshots/export' },
      { method: 'GET', path: '/api/projects/:projectId/store-screenshots/jobs/:jobId' },
      { method: 'GET', path: '/api/projects/:projectId/store-screenshots/jobs/:jobId/download' },
    ]));
  });

  it('uploads a decoded image through multipart and versions the document', async () => {
    const basePath = `/api/projects/${PROJECT_ID}/store-screenshots`;
    expect((await json('POST', basePath, createBody)).status).toBe(201);
    const png = await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 3,
        background: '#336699',
      },
    }).png().toBuffer();
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), 'screen.png');

    const response = await fetch(`${baseUrl}${basePath}/assets`, {
      method: 'POST',
      body: form,
    });
    expect(response.status).toBe(201);
    const uploaded = await response.json() as Record<string, any>;
    expect(uploaded.asset).toMatchObject({
      mime: 'image/png',
      width: 3,
      height: 2,
    });
    expect(uploaded.asset.relativePath).toMatch(
      /^store-screenshots\/assets\/[a-f0-9]{64}\.png$/,
    );

    const document = (await json('GET', basePath)).body.document;
    expect(document.version).toBe(2);
    expect(document.assets).toEqual([{ id: uploaded.asset.id }]);
  });

  it('validates multipart asset metadata with the shared request schema', async () => {
    const basePath = `/api/projects/${PROJECT_ID}/store-screenshots`;
    expect((await json('POST', basePath, createBody)).status).toBe(201);
    const png = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: '#ffffff',
      },
    }).png().toBuffer();
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/gif' }), 'screen.gif');

    const response = await fetch(`${baseUrl}${basePath}/assets`, {
      method: 'POST',
      body: form,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'BAD_REQUEST',
        details: {
          kind: 'validation',
          issues: expect.arrayContaining([
            expect.objectContaining({ path: 'mime' }),
          ]),
        },
      },
    });
  });

  it('returns structured project, validation, document, and conflict errors', async () => {
    const missingProject = await json(
      'POST',
      '/api/projects/missing/store-screenshots',
      createBody,
    );
    expect(missingProject).toEqual({
      status: 404,
      body: {
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found',
        },
      },
    });

    const malformed = await json(
      'POST',
      `/api/projects/${PROJECT_ID}/store-screenshots`,
      { ...createBody, pageCount: 0 },
    );
    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toMatchObject({
      code: 'BAD_REQUEST',
      details: {
        kind: 'validation',
        issues: expect.arrayContaining([
          expect.objectContaining({ path: 'pageCount' }),
        ]),
      },
    });

    const missingDocument = await json(
      'GET',
      `/api/projects/${PROJECT_ID}/store-screenshots`,
    );
    expect(missingDocument.status).toBe(404);
    expect(missingDocument.body.error.code).toBe('DOCUMENT_NOT_FOUND');

    expect((await json(
      'POST',
      `/api/projects/${PROJECT_ID}/store-screenshots`,
      createBody,
    )).status).toBe(201);
    const duplicate = await json(
      'POST',
      `/api/projects/${PROJECT_ID}/store-screenshots`,
      createBody,
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');
  });

  it('reports future generate, export, job, and download boundaries as not implemented', async () => {
    const basePath = `/api/projects/${PROJECT_ID}/store-screenshots`;
    expect((await json('POST', basePath, createBody)).status).toBe(201);

    for (const [method, pathname, body] of [
      ['POST', `${basePath}/generate`, {}],
      ['POST', `${basePath}/export`, { platforms: ['appStore'] }],
      ['GET', `${basePath}/jobs/job-1`, undefined],
      ['GET', `${basePath}/jobs/job-1/download`, undefined],
    ] as const) {
      const response = await json(method, pathname, body);
      expect(response.status).toBe(501);
      expect(response.body.error).toMatchObject({ code: 'NOT_IMPLEMENTED' });
    }
  });

  it('returns platform validation issues without turning them into transport errors', async () => {
    const basePath = `/api/projects/${PROJECT_ID}/store-screenshots`;
    expect((await json('POST', basePath, {
      ...createBody,
      pageCount: 1,
      platforms: ['appStore'],
    })).status).toBe(201);

    const response = await json('POST', `${basePath}/validate`, {
      platforms: ['googlePlay'],
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      valid: false,
      issues: [{
        severity: 'error',
        code: 'PAGE_COUNT_OUT_OF_RANGE',
        message: 'googlePlay requires 4 to 8 visible screenshots',
        platform: 'googlePlay',
      }],
    });
  });

  it('rejects non-local writes before parsing the request body', async () => {
    const response = await fetch(
      `${baseUrl}/api/projects/${PROJECT_ID}/store-screenshots`,
      {
        method: 'POST',
        headers: {
          origin: 'https://example.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify(createBody),
      },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'FORBIDDEN',
        details: { header: 'origin' },
      },
    });
  });

  it('rejects unsafe download paths supplied by the future job boundary', async () => {
    const basePath = `/api/projects/${PROJECT_ID}/store-screenshots`;
    expect((await json('POST', basePath, createBody)).status).toBe(201);
    for (const unsafePath of [
      'store-screenshots/exports/../../outside.zip',
      'store-screenshots/exports/bad".zip',
    ]) {
      downloadPath = unsafePath;
      const response = await json('GET', `${basePath}/jobs/job-1/download`);
      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Store screenshot download path is not a controlled export path',
      });
    }
  });
});
