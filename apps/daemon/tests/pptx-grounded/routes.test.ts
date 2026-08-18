import http from 'node:http';
import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  addTitleSlide,
  createPresentation,
  findSlidePlaceholder,
  savePresentation,
  setShapeText,
} from '@office-kit/pptx';
import express, { type RequestHandler } from 'express';
import multer from 'multer';
import { afterEach, describe, expect, it } from 'vitest';

import {
  groundedPptxErrorStatus,
  readProjectPptxFileSafely,
  registerGroundedPptxRoutes,
} from '../../src/routes/grounded-pptx.js';
import {
  GroundedPptxClientInputError,
  GroundedPptxConflictError,
  GroundedPptxOverloadError,
  GroundedPptxPayloadTooLargeError,
  GroundedPptxStorageCapacityError,
} from '../../src/pptx-grounded/errors.js';
import { groundedPptxStorageProjectRoot, GROUNDED_PPTX_STORAGE_LIMITS } from '../../src/pptx-grounded/storage.js';
import { createGroundedPptxWorkLimiter } from '../../src/pptx-grounded/capacity.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

describe('grounded PPTX routes', () => {
  it('requires an explicit daemon-owned grounded data root', () => {
    const app = express();
    expect(() => registerGroundedPptxRoutes(app, {
      upload: multer({ storage: multer.memoryStorage() }),
      getProject: () => null,
      resolveProjectDir: () => '/project-workspace',
      authorizeProjectRequest: async () => true,
      db: { missingDataRoot: true },
    })).toThrow('grounded PPTX data root is required');
  });

  it('maps typed failures without classifying corruption and parser errors as client input', () => {
    expect(groundedPptxErrorStatus(new GroundedPptxClientInputError('bad'))).toBe(400);
    expect(groundedPptxErrorStatus(new GroundedPptxConflictError('stale'))).toBe(409);
    expect(groundedPptxErrorStatus(new GroundedPptxPayloadTooLargeError('large'))).toBe(413);
    expect(groundedPptxErrorStatus(new GroundedPptxOverloadError())).toBe(429);
    expect(groundedPptxErrorStatus(new GroundedPptxStorageCapacityError('full'))).toBe(507);
    expect(groundedPptxErrorStatus(new Error('invalid ZIP parser failure'))).toBe(500);
  });
  it('authorizes before multipart parsing and cleans rejected upload files', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'open-design-pptx-routes-'));
    const uploadDir = await mkdtemp(path.join(tmpdir(), 'open-design-pptx-upload-'));
    let parsed = false;
    const app = express();
    registerGroundedPptxRoutes(app, {
      upload: { single: () => ((_: unknown, __: unknown, next: () => void) => { parsed = true; next(); }) as RequestHandler } as unknown as multer.Multer,
      getProject: (_db, id) => id === 'denied' ? { id } : null,
      resolveProjectDir: () => projectDir,
      authorizeProjectRequest: async (_req, res) => { (res as express.Response).sendStatus(403); return false; },
      db: {},
      groundedPptxDataRoot: path.join(projectDir, '.grounded-data'),
    });
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(projectDir, { recursive: true, force: true });
      await rm(uploadDir, { recursive: true, force: true });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing address');
    await fetch(`http://127.0.0.1:${address.port}/api/projects/denied/pptx/import`, { method: 'POST' });
    expect(parsed).toBe(false);
  });

  it('releases upload admission when a client disconnects during multipart parsing', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'open-design-pptx-routes-'));
    const admission = createGroundedPptxWorkLimiter({ maxConcurrency: 1, maxQueue: 0 });
    let parsing!: () => void;
    const parsingStarted = new Promise<void>((resolve) => { parsing = resolve; });
    const app = express();
    registerGroundedPptxRoutes(app, {
      admission,
      upload: { single: () => ((_req: unknown, _res: unknown, _next: () => void) => {
        parsing();
      }) as RequestHandler } as unknown as multer.Multer,
      getProject: () => ({ id: 'deck-1' }), resolveProjectDir: () => projectDir,
      authorizeProjectRequest: async () => true, db: {},
      groundedPptxDataRoot: path.join(projectDir, '.grounded-data'),
    });
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(projectDir, { recursive: true, force: true });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing address');
    const controller = new AbortController();
    const request = fetch(`http://127.0.0.1:${address.port}/api/projects/deck-1/pptx/import`, {
      method: 'POST', body: new Uint8Array([1]), signal: controller.signal,
    });
    await parsingStarted;
    controller.abort();
    await expect(request).rejects.toThrow();
    await expect.poll(async () => {
      try {
        const release = await admission.acquire();
        release();
        return true;
      } catch {
        return false;
      }
    }).toBe(true);
  });

  it('rejects overload before multipart upload bytes are parsed or allocated', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'open-design-pptx-routes-'));
    const admission = createGroundedPptxWorkLimiter({ maxConcurrency: 1, maxQueue: 0 });
    const release = await admission.acquire();
    let parsed = false;
    const app = express();
    registerGroundedPptxRoutes(app, {
      admission,
      upload: { single: () => ((_: unknown, __: unknown, next: () => void) => { parsed = true; next(); }) as RequestHandler } as unknown as multer.Multer,
      getProject: () => ({ id: 'deck-1' }), resolveProjectDir: () => projectDir,
      authorizeProjectRequest: async () => true, db: {},
      groundedPptxDataRoot: path.join(projectDir, '.grounded-data'),
    });
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(async () => {
      release();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(projectDir, { recursive: true, force: true });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing address');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/projects/deck-1/pptx/import`, { method: 'POST' });
    expect(response.status).toBe(429);
    expect(parsed).toBe(false);
  });

  it('imports, inspects, mutates, previews, and downloads a native revision', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'open-design-pptx-routes-'));
    const secondProjectDir = await mkdtemp(path.join(tmpdir(), 'open-design-pptx-routes-'));
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    registerGroundedPptxRoutes(app, {
      upload: multer({ storage: multer.memoryStorage() }),
      getProject: (_db, id) =>
        id === 'deck-1' || id === 'deck-2' ? { id, metadata: {} } : null,
      resolveProjectDir: (_root, id) => (id === 'deck-2' ? secondProjectDir : projectDir),
      authorizeProjectRequest: async () => true,
      db: {},
      groundedPptxDataRoot: path.join(projectDir, '.grounded-data'),
    });
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(projectDir, { recursive: true, force: true });
      await rm(secondProjectDir, { recursive: true, force: true });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing address');
    const base = `http://127.0.0.1:${address.port}/api/projects/deck-1/pptx`;

    const presentation = createPresentation();
    const source = addTitleSlide(presentation, 'Original');
    setShapeText(findSlidePlaceholder(source, 'subTitle')!, 'Source subtitle');
    const sourceBytes = await savePresentation(presentation);
    await writeFile(path.join(secondProjectDir, 'uploaded.pptx'), sourceBytes);
    const importedFile = await fetch(
      `http://127.0.0.1:${address.port}/api/projects/deck-2/pptx/import-file`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileName: 'uploaded.pptx' }),
      },
    );
    expect(importedFile.status).toBe(201);
    const traversed = await fetch(
      `http://127.0.0.1:${address.port}/api/projects/deck-2/pptx/import-file`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileName: '../outside.pptx' }),
      },
    );
    expect(traversed.status).toBe(400);
    expect((await traversed.json()) as { error: string }).toEqual({
      error: 'fileName escapes the project directory',
    });

    const malformedForm = new FormData();
    malformedForm.append('file', new Blob([new Uint8Array([1, 2, 3])]), 'malformed.pptx');
    expect((await fetch(`${base}/import`, { method: 'POST', body: malformedForm })).status).toBe(400);

    const emptyPresentation = await savePresentation(createPresentation());
    const emptyForm = new FormData();
    emptyForm.append('file', new Blob([Uint8Array.from(emptyPresentation).buffer]), 'empty.pptx');
    const emptyImport = await fetch(`${base}/import`, { method: 'POST', body: emptyForm });
    expect(emptyImport.status).toBe(400);
    expect(await emptyImport.json()).toEqual({ error: 'PPTX must contain at least one slide' });

    const form = new FormData();
    form.append('file', new Blob([Uint8Array.from(sourceBytes).buffer], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), 'source.pptx');

    const imported = await fetch(`${base}/import`, { method: 'POST', body: form });
    expect(imported.status).toBe(201);
    const importedBody = (await imported.json()) as {
      manifest: { currentRevisionId: string; source: { projectFilePath?: string } };
    };
    expect(importedBody.manifest.currentRevisionId).toBe('r0001');
    expect(importedBody.manifest.source.projectFilePath).toBeUndefined();

    const emptyApply = await fetch(`${base}/apply`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRevisionId: 'r0001', mutations: [] }),
    });
    expect(emptyApply.status).toBe(400);
    expect(await emptyApply.json()).toEqual({ error: 'mutations must not be empty' });

    const inspected = await fetch(base);
    expect(inspected.status).toBe(200);
    const inspectedBody = (await inspected.json()) as { structure: { slides: Array<{ title: string | null }> } };
    expect(inspectedBody.structure.slides[0]?.title).toBe('Original');

    const applied = await fetch(`${base}/apply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        expectedRevisionId: 'r0001',
        mutations: [{
          op: 'duplicateSlide', sourceIndex: 0, insertAt: 1,
          replacements: [{ placeholder: 'ctrTitle', text: 'Generated' }],
        }],
      }),
    });
    expect(applied.status).toBe(201);
    const appliedBody = (await applied.json()) as { manifest: { currentRevisionId: string } };
    expect(appliedBody.manifest.currentRevisionId).toBe('r0002');

    const stale = await fetch(`${base}/apply`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        expectedRevisionId: 'r0001',
        mutations: [{ op: 'duplicateSlide', sourceIndex: 0, insertAt: 1, replacements: [] }],
      }),
    });
    expect(stale.status).toBe(409);

    const preview = await fetch(`${base}/revisions/r0002/slides/1/preview`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await preview.arrayBuffer()).subarray(1, 4)).toEqual(
      new Uint8Array([0x50, 0x4e, 0x47]),
    );

    const downloaded = await fetch(`${base}/revisions/r0002/download`);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers.get('content-type')).toContain('presentationml.presentation');
    expect((await downloaded.arrayBuffer()).byteLength).toBeGreaterThan(1000);

    const canonical = groundedPptxStorageProjectRoot({
      dataRoot: path.join(projectDir, '.grounded-data'), projectId: 'deck-1',
    });
    await writeFile(path.join(canonical, 'revisions/r0002.pptx'), new Uint8Array([9]));
    expect((await fetch(`${base}/revisions/r0002/slides/0/preview`)).status).toBe(500);
    expect((await fetch(`${base}/revisions/r0002/download`)).status).toBe(500);
  });

  it('rejects symlink imports and reports corrupt manifests as server errors', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'open-design-pptx-routes-'));
    const outside = path.join(await mkdtemp(path.join(tmpdir(), 'open-design-pptx-outside-')), 'secret.pptx');
    await writeFile(outside, new Uint8Array([0x50, 0x4b]));
    await symlink(outside, path.join(projectDir, 'linked.pptx'));
    const app = express();
    app.use(express.json());
    registerGroundedPptxRoutes(app, {
      upload: multer({ storage: multer.memoryStorage() }),
      getProject: () => ({ id: 'deck-1' }),
      resolveProjectDir: () => projectDir,
      authorizeProjectRequest: async () => true,
      db: {},
      groundedPptxDataRoot: path.join(projectDir, '.grounded-data'),
    });
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(path.dirname(outside), { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing address');
    const base = `http://127.0.0.1:${address.port}/api/projects/deck-1/pptx`;
    const escaped = await fetch(`${base}/import-file`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileName: 'linked.pptx' }),
    });
    expect(escaped.status).toBe(400);
    expect(await readFile(outside)).toEqual(Buffer.from([0x50, 0x4b]));

    const canonical = groundedPptxStorageProjectRoot({
      dataRoot: path.join(projectDir, '.grounded-data'), projectId: 'deck-1',
    });
    await import('node:fs/promises').then(async ({ mkdir }) => {
      await mkdir(path.join(canonical, 'source'), { recursive: true });
      await mkdir(path.join(canonical, 'revisions'), { recursive: true });
    });
    await writeFile(path.join(canonical, 'manifest.json'), '{broken');
    expect((await fetch(base)).status).toBe(500);

    await writeFile(path.join(canonical, 'manifest.json'), Buffer.alloc(GROUNDED_PPTX_STORAGE_LIMITS.maxManifestBytes + 1));
    expect((await fetch(base)).status).toBe(500);
  });

  it('maps multipart limits to a bounded JSON 413 response', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'open-design-pptx-routes-'));
    const app = express();
    registerGroundedPptxRoutes(app, {
      upload: multer({ storage: multer.memoryStorage(), limits: { fileSize: 4, files: 1 } }),
      getProject: () => ({ id: 'deck-1' }), resolveProjectDir: () => projectDir,
      authorizeProjectRequest: async () => true, db: {},
      groundedPptxDataRoot: path.join(projectDir, '.grounded-data'),
    });
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(projectDir, { recursive: true, force: true });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing address');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(8)]), 'large.pptx');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/projects/deck-1/pptx/import`, { method: 'POST', body: form });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: 'LIMIT_FILE_SIZE' });
  });

  it('cleans a multipart temp file when Multer rejects the upload', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'open-design-pptx-routes-'));
    const temporary = path.join(projectDir, 'partial-upload');
    await writeFile(temporary, new Uint8Array([1]));
    const app = express();
    const upload = {
      single: () => ((req: express.Request, _res: express.Response, next: (error: unknown) => void) => {
        req.file = { path: temporary } as Express.Multer.File;
        next(new multer.MulterError('LIMIT_FILE_SIZE'));
      }) as RequestHandler,
    } as unknown as multer.Multer;
    registerGroundedPptxRoutes(app, {
      upload, getProject: () => ({ id: 'deck-1' }), resolveProjectDir: () => projectDir,
      authorizeProjectRequest: async () => true, db: {},
      groundedPptxDataRoot: path.join(projectDir, '.grounded-data'),
    });
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(projectDir, { recursive: true, force: true });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing address');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/projects/deck-1/pptx/import`, { method: 'POST' });
    expect(response.status).toBe(413);
    await expect(lstat(temporary)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('enforces the import-file size cap through the opened handle', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'open-design-pptx-routes-'));
    cleanups.push(async () => rm(projectDir, { recursive: true, force: true }));
    await writeFile(path.join(projectDir, 'large.pptx'), new Uint8Array(5));
    await expect(readProjectPptxFileSafely(projectDir, 'large.pptx', 4))
      .rejects.toThrow('compressed size exceeds limit');
  });

  it('rejects an import-file path with a symlinked child directory', async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), 'open-design-pptx-routes-'));
    const outsideDir = await mkdtemp(path.join(tmpdir(), 'open-design-pptx-outside-'));
    await writeFile(path.join(outsideDir, 'secret.pptx'), new Uint8Array([0x50, 0x4b]));
    await symlink(outsideDir, path.join(projectDir, 'linked'));
    const app = express();
    app.use(express.json());
    registerGroundedPptxRoutes(app, {
      upload: multer({ storage: multer.memoryStorage() }), getProject: () => ({ id: 'deck-1' }),
      resolveProjectDir: () => projectDir, authorizeProjectRequest: async () => true, db: {},
      groundedPptxDataRoot: path.join(projectDir, '.grounded-data'),
    });
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(projectDir, { recursive: true, force: true });
      await rm(outsideDir, { recursive: true, force: true });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing address');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/projects/deck-1/pptx/import-file`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileName: 'linked/secret.pptx' }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'fileName must not contain symlinks' });
  });
});
