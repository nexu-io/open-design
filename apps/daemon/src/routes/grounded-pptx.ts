import { constants } from 'node:fs';
import { lstat, open, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Express } from 'express';
import multer from 'multer';
import { groundedPptxAdmission, type GroundedPptxWorkLimiter } from '../pptx-grounded/capacity.js';
import {
  GroundedPptxClientInputError,
  GroundedPptxConflictError,
  GroundedPptxHttpError,
  GroundedPptxNotFoundError,
  GroundedPptxPayloadTooLargeError,
} from '../pptx-grounded/errors.js';

import {
  applyGroundedMutations,
  inspectGroundedPresentation,
  GROUNDED_PPTX_LIMITS,
  type GroundedMutation,
} from '../pptx-grounded/office-kit-adapter.js';
import { createGroundedPptxPreviewService } from '../pptx-grounded/preview-service.js';
import {
  commitGroundedPptxRevision,
  GroundedPptxManifestNotFoundError,
  GroundedPptxRevisionNotFoundError,
  importGroundedPptxSource,
  readGroundedPptxManifest,
  readGroundedPptxRevision,
  type GroundedPptxStorageLocation,
} from '../pptx-grounded/storage.js';

interface GroundedPptxRouteDeps {
  upload: multer.Multer;
  db: unknown;
  getProject: (db: unknown, id: string) => { id: string; metadata?: unknown } | null | undefined;
  resolveProjectDir: (projectsRoot: string, id: string, metadata?: unknown) => string;
  projectsRoot?: string;
  runtimeDataRoot?: string;
  groundedPptxDataRoot?: string;
  admission?: GroundedPptxWorkLimiter;
  authorizeProjectRequest: (
    req: unknown,
    res: unknown,
    projectId: string,
    options: { mode: 'read' | 'write'; capability?: 'writeFiles' },
  ) => Promise<boolean>;
}


async function uploadedBytes(file: Express.Multer.File): Promise<Uint8Array> {
  if (file.buffer) return new Uint8Array(file.buffer);
  if (file.path) return new Uint8Array(await readFile(file.path));
  throw new Error('uploaded PPTX has no readable bytes');
}

function parseMutations(value: unknown): GroundedMutation[] {
  if (!Array.isArray(value)) throw new GroundedPptxClientInputError('mutations must be an array');
  if (value.length === 0) throw new GroundedPptxClientInputError('mutations must not be empty');
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') throw new GroundedPptxClientInputError(`mutation ${index} must be an object`);
    const item = candidate as Record<string, unknown>;
    if (item.op !== 'duplicateSlide') throw new GroundedPptxClientInputError(`mutation ${index} has unsupported op`);
    if (!Number.isInteger(item.sourceIndex) || !Number.isInteger(item.insertAt)) {
      throw new GroundedPptxClientInputError(`mutation ${index} requires integer sourceIndex and insertAt`);
    }
    if (!Array.isArray(item.replacements)) throw new GroundedPptxClientInputError(`mutation ${index} replacements must be an array`);
    return {
      op: 'duplicateSlide',
      sourceIndex: item.sourceIndex as number,
      insertAt: item.insertAt as number,
      replacements: item.replacements.map((replacement, replacementIndex) => {
        if (!replacement || typeof replacement !== 'object') {
          throw new GroundedPptxClientInputError(`mutation ${index} replacement ${replacementIndex} must be an object`);
        }
        const record = replacement as Record<string, unknown>;
        if (typeof record.placeholder !== 'string' || typeof record.text !== 'string') {
          throw new GroundedPptxClientInputError(`mutation ${index} replacement ${replacementIndex} requires placeholder and text`);
        }
        return { placeholder: record.placeholder, text: record.text };
      }),
    };
  });
}

export function groundedPptxErrorStatus(error: unknown): number {
  if (error instanceof GroundedPptxHttpError) return error.status;
  if (error instanceof GroundedPptxManifestNotFoundError || error instanceof GroundedPptxRevisionNotFoundError) return 404;
  const message = error instanceof Error ? error.message : String(error);
  return /(?:revision|slide index).*not found|slide index is out of bounds/.test(message) ? 404 : 500;
}

export async function readProjectPptxFileSafely(
  projectDir: string,
  fileName: string,
  maximumBytes = GROUNDED_PPTX_LIMITS.maxCompressedBytes,
): Promise<{ bytes: Uint8Array; projectFilePath: string }> {
  if (!constants.O_NOFOLLOW) throw new Error('symlink-safe project file import is unsupported on this platform');
  const root = await realpath(projectDir);
  const target = path.resolve(root, fileName);
  if (!target.startsWith(`${root}${path.sep}`)) throw new GroundedPptxClientInputError('fileName escapes the project directory');
  const relative = path.relative(root, target);
  let cursor = root;
  for (const component of relative.split(path.sep)) {
    cursor = path.join(cursor, component);
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) throw new GroundedPptxClientInputError('fileName must not contain symlinks');
  }
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw new GroundedPptxClientInputError('fileName must identify a regular file');
    if (opened.size > maximumBytes) throw new GroundedPptxPayloadTooLargeError('PPTX compressed size exceeds limit');
    const resolvedTarget = await realpath(target);
    if (!resolvedTarget.startsWith(`${root}${path.sep}`)) throw new GroundedPptxClientInputError('fileName escapes the project directory');
    const named = await lstat(target);
    if (named.isSymbolicLink() || named.dev !== opened.dev || named.ino !== opened.ino) throw new GroundedPptxClientInputError('project file changed during import');
    const bytes = new Uint8Array(opened.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.byteLength - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const after = await handle.stat();
    const namedAfter = await lstat(target);
    if (
      after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size ||
      offset !== opened.size || bytes.byteLength !== opened.size || namedAfter.isSymbolicLink() ||
      namedAfter.dev !== opened.dev || namedAfter.ino !== opened.ino
    ) {
      throw new GroundedPptxClientInputError('project file changed during import');
    }
    return { bytes, projectFilePath: relative.split(path.sep).join('/') };
  } finally {
    await handle.close();
  }
}

export function registerGroundedPptxRoutes(app: Express, deps: GroundedPptxRouteDeps): void {
  if (!deps.groundedPptxDataRoot) throw new Error('grounded PPTX data root is required');
  const groundedPptxDataRoot = deps.groundedPptxDataRoot;
  const previews = createGroundedPptxPreviewService();
  const admission = deps.admission ?? groundedPptxAdmission;
  const project = (id: string) => deps.getProject(deps.db, id);
  const directory = (record: { id: string; metadata?: unknown }) =>
    deps.resolveProjectDir(deps.projectsRoot ?? '', record.id, record.metadata);
  const storage = (record: { id: string }): GroundedPptxStorageLocation => ({
    ...(deps.runtimeDataRoot ? { runtimeRoot: deps.runtimeDataRoot } : {}),
    dataRoot: groundedPptxDataRoot,
    projectId: record.id,
  });
  const uploadRecords = new WeakMap<object, { id: string; metadata?: unknown }>();
  const uploadReleases = new WeakMap<object, () => void>();
  const cleanupUpload = (req: import('express').Request): void => {
    uploadRecords.delete(req);
    uploadReleases.get(req)?.();
    uploadReleases.delete(req);
    if (req.file?.path) void rm(req.file.path, { force: true }).catch(() => undefined);
  };
  const acquireOrRespond = async (res: import('express').Response): Promise<(() => void) | null> => {
    try {
      return await admission.acquire();
    } catch (error) {
      res.status(groundedPptxErrorStatus(error)).json({ error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  };
  const authorizeUpload: import('express').RequestHandler = async (req, res, next) => {
    const record = project(String(req.params.id));
    if (!record) { res.status(404).json({ error: 'project not found' }); return; }
    if (!(await deps.authorizeProjectRequest(req, res, record.id, { mode: 'write', capability: 'writeFiles' }))) return;
    uploadRecords.set(req, record);
    next();
  };
  const admitUpload: import('express').RequestHandler = async (req, res, next) => {
    try {
      const release = await admission.acquire();
      let released = false;
      uploadReleases.set(req, () => {
        if (released) return;
        released = true;
        release();
      });
      res.once('close', () => cleanupUpload(req));
      next();
    } catch (error) {
      uploadRecords.delete(req);
      res.status(groundedPptxErrorStatus(error)).json({ error: error instanceof Error ? error.message : String(error) });
    }
  };
  const parseUpload: import('express').RequestHandler = (req, res, next) => {
    deps.upload.single('file')(req, res, (error: unknown) => {
      if (!error) { next(); return; }
      const temporaryPath = req.file?.path;
      void (async () => {
        if (temporaryPath) await rm(temporaryPath, { force: true }).catch(() => undefined);
        cleanupUpload(req);
        if (error instanceof multer.MulterError) {
          const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
          res.status(status).json({ error: error.message, code: error.code });
          return;
        }
        next(error);
      })();
    });
  };

  app.post(
    '/api/projects/:id/pptx/import',
    authorizeUpload,
    admitUpload,
    parseUpload,
    async (req, res) => {
      try {
        const record = uploadRecords.get(req);
        if (!record) throw new Error('project authorization context missing');
        if (!req.file) return res.status(400).json({ error: 'file required' });
        if (!req.file.originalname.toLowerCase().endsWith('.pptx')) {
          return res.status(400).json({ error: 'file must be a .pptx' });
        }
        const bytes = await uploadedBytes(req.file);
        if (bytes.byteLength > GROUNDED_PPTX_LIMITS.maxCompressedBytes) throw new GroundedPptxPayloadTooLargeError('PPTX compressed size exceeds limit');
        let structure;
        try {
          structure = await inspectGroundedPresentation(bytes);
        } catch (error) {
          if (error instanceof GroundedPptxHttpError) throw error;
          throw new GroundedPptxClientInputError(error instanceof Error ? error.message : 'invalid PPTX');
        }
        const manifest = await importGroundedPptxSource(
          storage(record),
          bytes,
          req.file.originalname,
        );
        res.status(201).json({ manifest, structure });
      } catch (error) {
        res.status(groundedPptxErrorStatus(error)).json({ error: error instanceof Error ? error.message : String(error) });
      } finally {
        if (req.file?.path) await rm(req.file.path, { force: true }).catch(() => undefined);
        cleanupUpload(req);
      }
    },
  );

  app.post('/api/projects/:id/pptx/import-file', async (req, res) => {
    const record = project(String(req.params.id));
    if (!record) return res.status(404).json({ error: 'project not found' });
    if (!(await deps.authorizeProjectRequest(req, res, record.id, { mode: 'write', capability: 'writeFiles' }))) return;
    const release = await acquireOrRespond(res);
    if (!release) return;
    try {
      const fileName = req.body?.fileName;
      if (typeof fileName !== 'string' || !fileName.toLowerCase().endsWith('.pptx')) {
        throw new GroundedPptxClientInputError('fileName must identify a .pptx project file');
      }
      const dir = directory(record);
      const { bytes, projectFilePath } = await readProjectPptxFileSafely(dir, fileName);
      let structure;
      try {
        structure = await inspectGroundedPresentation(bytes);
      } catch (error) {
        if (error instanceof GroundedPptxHttpError) throw error;
        throw new GroundedPptxClientInputError(error instanceof Error ? error.message : 'invalid PPTX');
      }
      const manifest = await importGroundedPptxSource(storage(record), bytes, path.basename(fileName), projectFilePath);
      res.status(201).json({ manifest, structure });
    } catch (error) {
      const responseError = (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? new GroundedPptxNotFoundError('project PPTX file not found')
        : error;
      res.status(groundedPptxErrorStatus(responseError)).json({
        error: responseError instanceof Error ? responseError.message : String(responseError),
      });
    } finally {
      release();
    }
  });

  app.get('/api/projects/:id/pptx', async (req, res) => {
    const record = project(String(req.params.id));
    if (!record) return res.status(404).json({ error: 'project not found' });
    if (!(await deps.authorizeProjectRequest(req, res, record.id, { mode: 'read' }))) return;
    const release = await acquireOrRespond(res);
    if (!release) return;
    try {
      const manifest = await readGroundedPptxManifest(storage(record));
      const bytes = await readGroundedPptxRevision(storage(record), manifest.currentRevisionId);
      const structure = await inspectGroundedPresentation(bytes);
      res.json({ manifest, structure });
    } catch (error) {
      res.status(groundedPptxErrorStatus(error)).json({
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      release();
    }
  });

  app.post('/api/projects/:id/pptx/apply', async (req, res) => {
    const record = project(String(req.params.id));
    if (!record) return res.status(404).json({ error: 'project not found' });
    if (!(await deps.authorizeProjectRequest(req, res, record.id, { mode: 'write', capability: 'writeFiles' }))) return;
    const release = await acquireOrRespond(res);
    if (!release) return;
    try {
      const expectedRevisionId = req.body?.expectedRevisionId;
      if (typeof expectedRevisionId !== 'string') throw new GroundedPptxClientInputError('expectedRevisionId required');
      const mutations = parseMutations(req.body?.mutations);
      const manifest = await readGroundedPptxManifest(storage(record));
      if (manifest.currentRevisionId !== expectedRevisionId) {
        throw new GroundedPptxConflictError(`stale grounded PPTX revision: expected ${expectedRevisionId}, current is ${manifest.currentRevisionId}`);
      }
      const input = await readGroundedPptxRevision(storage(record), expectedRevisionId);
      const result = await applyGroundedMutations(input, mutations);
      const errors = result.validationIssues.filter((issue) => issue.severity === 'error');
      if (errors.length > 0) throw new Error(`PPTX validation failed with ${errors.length} errors`);
      const next = await commitGroundedPptxRevision(storage(record), result.bytes, {
        expectedCurrentRevisionId: expectedRevisionId,
      });
      res.status(201).json({ manifest: next, validationIssues: result.validationIssues });
    } catch (error) {
      res.status(groundedPptxErrorStatus(error)).json({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      release();
    }
  });

  app.get('/api/projects/:id/pptx/revisions/:revisionId/slides/:slideIndex/preview', async (req, res) => {
    const record = project(String(req.params.id));
    if (!record) return res.status(404).json({ error: 'project not found' });
    if (!(await deps.authorizeProjectRequest(req, res, record.id, { mode: 'read' }))) return;
    const release = await acquireOrRespond(res);
    if (!release) return;
    try {
      const index = Number(req.params.slideIndex);
      if (!Number.isInteger(index) || index < 0) return res.status(404).json({ error: 'slide not found' });
      const preview = await previews.preview(storage(record), String(req.params.revisionId), index);
      res.type('png').send(Buffer.from(preview));
    } catch (error) {
      res.status(groundedPptxErrorStatus(error)).json({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      release();
    }
  });

  app.get('/api/projects/:id/pptx/revisions/:revisionId/download', async (req, res) => {
    const record = project(String(req.params.id));
    if (!record) return res.status(404).json({ error: 'project not found' });
    if (!(await deps.authorizeProjectRequest(req, res, record.id, { mode: 'read' }))) return;
    const release = await acquireOrRespond(res);
    if (!release) return;
    try {
      const bytes = await readGroundedPptxRevision(storage(record), String(req.params.revisionId));
      res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      res.setHeader('content-disposition', `attachment; filename="${String(req.params.revisionId)}.pptx"`);
      res.send(bytes);
    } catch (error) {
      res.status(groundedPptxErrorStatus(error)).json({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      release();
    }
  });
}
