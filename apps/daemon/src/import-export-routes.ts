import type { Express, Response } from 'express';
import { PROJECT_EXPORT_MANIFEST_SCHEMA, isExportFormat } from '@open-design/contracts';
import nodePath from 'node:path';
import { readFile, rm } from 'node:fs/promises';
import type { RouteDeps } from './server-context.js';
import {
  InlineAssetsLimitError,
  MAX_INLINE_OWNER_BYTES,
  inlineRelativeAssets,
  type InlineAssetReader,
} from './inline-assets.js';
import {
  buildDeckRenderInput,
  buildScreenshotPdf,
  buildScreenshotPptx,
  decodeSlideDataUrls,
  readSlideFiles,
  type BuildDeckRenderInputOptions,
} from './deck-export.js';
import { readProjectFileVersion } from './project-file-versions.js';
import { authorizeReasoningEgress, sendReasoningEgressDenial } from './reasoning-egress.js';
import { sandboxImportedProjectRootUnavailableReason } from './sandbox-mode.js';
import { parseOrchestratorWorkspace } from './workspace-contract.js';

export interface RegisterImportRoutesDeps extends RouteDeps<'db' | 'http' | 'uploads' | 'node' | 'ids' | 'paths' | 'imports' | 'auth' | 'projectStore' | 'conversations' | 'projectFiles' | 'validation'> {}

export function registerImportRoutes(app: Express, ctx: RegisterImportRoutesDeps) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { importUpload } = ctx.uploads;
  const { fs, path } = ctx.node;
  const { randomId } = ctx.ids;
  const { PROJECTS_DIR, RUNTIME_DATA_DIR_CANONICAL } = ctx.paths;
  const { importClaudeDesignZip, projectDir, detectEntryFile } = ctx.imports;
  const {
    consumedImportNonces,
    desktopAuthSecret,
    isDesktopAuthGateActive,
    pruneExpiredImportNonces,
    verifyDesktopImportToken,
  } = ctx.auth;
  const { getProject, insertProject, updateProject } = ctx.projectStore;
  const { insertConversation } = ctx.conversations;
  const { setTabs } = ctx.projectFiles;
  const { validateProjectDesignSystemId } = ctx.validation;
  app.post(
    '/api/import/claude-design',
    importUpload.single('file'),
    async (req, res) => {
      try {
        if (!req.file)
          return res.status(400).json({ error: 'zip file required' });
        const originalName =
          req.file.originalname || 'Claude Design export.zip';
        if (!/\.zip$/i.test(originalName)) {
          fs.promises.unlink(req.file.path).catch(() => {});
          return res.status(400).json({ error: 'expected a .zip file' });
        }
        const id = randomId();
        const now = Date.now();
        const baseName =
          originalName.replace(/\.zip$/i, '').trim() || 'Claude Design import';
        const imported = await importClaudeDesignZip(
          req.file.path,
          projectDir(PROJECTS_DIR, id),
        );
        fs.promises.unlink(req.file.path).catch(() => {});

        const project = insertProject(db, {
          id,
          name: baseName,
          skillId: null,
          designSystemId: null,
          pendingPrompt: `Imported from Claude Design ZIP: ${originalName}. Continue editing ${imported.entryFile}.`,
          metadata: {
            kind: 'prototype',
            importedFrom: 'claude-design',
            entryFile: imported.entryFile,
            sourceFileName: originalName,
          },
          createdAt: now,
          updatedAt: now,
        });
        const cid = randomId();
        insertConversation(db, {
          id: cid,
          projectId: id,
          title: 'Imported Claude Design project',
          createdAt: now,
          updatedAt: now,
        });
        setTabs(db, id, [imported.entryFile], imported.entryFile);
        res.json({
          project,
          conversationId: cid,
          entryFile: imported.entryFile,
          files: imported.files,
        });
      } catch (err: any) {
        if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
        res.status(400).json({ error: String(err) });
      }
    },
  );

  // Import an existing local folder as a project. The user picks a folder
  // and OD works inside it directly: every write goes to metadata.baseDir.
  // No copy, no shadow tree — the user owns the workspace and is
  // responsible for their own version control (git, time machine, etc.),
  // mirroring how Cursor / Claude Code / Aider behave.
  // Replace an existing project's working directory in-place. Mirrors
  // the same trust-gate, realpath, and data-dir checks as folder import,
  // but updates metadata.baseDir on an existing project record.
  app.post('/api/projects/:id/working-dir', async (req, res) => {
    try {
      const projectId = req.params.id;
      const existing = getProject(db, projectId);
      if (!existing) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      const { baseDir, orchestratorWorkspace } = req.body || {};
      if (typeof baseDir !== 'string' || !baseDir.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'baseDir required');
      }
      const parsedOrchestratorWorkspace =
        parseOrchestratorWorkspace(orchestratorWorkspace);
      if (!parsedOrchestratorWorkspace.ok) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          parsedOrchestratorWorkspace.message,
        );
      }
      const normalizedOrchestratorWorkspace = parsedOrchestratorWorkspace.value;
      let trustedPickerImport = false;
      if (isDesktopAuthGateActive()) {
        const secret = desktopAuthSecret();
        if (secret == null) {
          return sendApiError(
            res,
            503,
            'DESKTOP_AUTH_PENDING',
            'desktop auth required but secret not yet registered',
            {
              details: { hint: 'restart desktop or wait for sidecar registration' },
              retryable: true,
            },
          );
        }
        const headerValue = req.get('x-od-desktop-import-token');
        const token = typeof headerValue === 'string' ? headerValue : '';
        const now = Date.now();
        pruneExpiredImportNonces(now);
        const verification = verifyDesktopImportToken(
          secret,
          baseDir,
          token,
          now,
          consumedImportNonces,
        );
        if (!verification.ok) {
          return sendApiError(
            res,
            403,
            'FORBIDDEN',
            'desktop import token rejected',
            { details: { reason: verification.reason } },
          );
        }
        consumedImportNonces.set(verification.nonce, verification.exp);
        trustedPickerImport = true;
      }

      const trimmedInput = baseDir.trim();
      if (!path.isAbsolute(path.normalize(trimmedInput))) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'baseDir must be absolute');
      }
      let normalizedPath: string;
      try {
        normalizedPath = await fs.promises.realpath(trimmedInput);
      } catch {
        return sendApiError(res, 400, 'BAD_REQUEST', 'folder not found');
      }
      let dirStat;
      try {
        dirStat = await fs.promises.lstat(normalizedPath);
      } catch {
        return sendApiError(res, 400, 'BAD_REQUEST', 'folder not found');
      }
      if (!dirStat.isDirectory()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'path must be a directory');
      }
      if (path.parse(normalizedPath).root === normalizedPath) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'cannot point at the filesystem root');
      }
      if (
        normalizedPath === RUNTIME_DATA_DIR_CANONICAL ||
        normalizedPath.startsWith(RUNTIME_DATA_DIR_CANONICAL + path.sep)
      ) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'cannot point at the data directory');
      }
      const sandboxReason = normalizedOrchestratorWorkspace && trustedPickerImport
        ? null
        : sandboxImportedProjectRootUnavailableReason(normalizedPath);
      if (sandboxReason) {
        return sendApiError(res, 400, 'BAD_REQUEST', sandboxReason);
      }

      const entryFile = await detectEntryFile(normalizedPath);
      const existingMeta = existing.metadata ?? {};
      const { orchestratorWorkspace: _existingOrchestratorWorkspace, ...preservedMeta } =
        existingMeta;
      const nextMeta = {
        ...preservedMeta,
        kind: existingMeta.kind ?? 'prototype',
        baseDir: normalizedPath,
        importedFrom: 'folder' as const,
        entryFile,
        ...(normalizedOrchestratorWorkspace
          ? { orchestratorWorkspace: normalizedOrchestratorWorkspace }
          : {}),
        ...(trustedPickerImport ? { fromTrustedPicker: true as const } : {}),
      };
      const updated = updateProject(db, projectId, { metadata: nextMeta });
      if (!updated) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      // Folder imports should land on Design Files so users can choose from
      // the imported folder's artifacts. Persist an empty saved tab state so
      // ProjectView does not auto-open the detected primary file on hydration.
      setTabs(db, projectId, [], null);
      /** @type {import('@open-design/contracts').ReplaceProjectWorkingDirResponse} */
      const body = { project: updated, baseDir: normalizedPath, entryFile };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  app.post('/api/import/folder', async (req, res) => {
    try {
      const { baseDir, name, skillId, designSystemId, orchestratorWorkspace } = req.body || {};
      if (typeof baseDir !== 'string' || !baseDir.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'baseDir required');
      }
      const parsedOrchestratorWorkspace =
        parseOrchestratorWorkspace(orchestratorWorkspace);
      if (!parsedOrchestratorWorkspace.ok) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          parsedOrchestratorWorkspace.message,
        );
      }
      const normalizedOrchestratorWorkspace = parsedOrchestratorWorkspace.value;
      let trustedPickerImport = false;
      if (isDesktopAuthGateActive()) {
        const secret = desktopAuthSecret();
        if (secret == null) {
          return sendApiError(
            res,
            503,
            'DESKTOP_AUTH_PENDING',
            'desktop auth required but secret not yet registered',
            {
              details: { hint: 'restart desktop or wait for sidecar registration' },
              retryable: true,
            },
          );
        }
        const headerValue = req.get('x-od-desktop-import-token');
        const token = typeof headerValue === 'string' ? headerValue : '';
        const now = Date.now();
        pruneExpiredImportNonces(now);
        const verification = verifyDesktopImportToken(
          secret,
          baseDir,
          token,
          now,
          consumedImportNonces,
        );
        if (!verification.ok) {
          return sendApiError(
            res,
            403,
            'FORBIDDEN',
            'desktop import token rejected',
            { details: { reason: verification.reason } },
          );
        }
        consumedImportNonces.set(verification.nonce, verification.exp);
        trustedPickerImport = true;
      }
      const trimmedInput = baseDir.trim();
      if (!path.isAbsolute(path.normalize(trimmedInput))) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'baseDir must be absolute');
      }
      // Resolve symlinks once at import and persist the canonical path.
      // Without this, a user-controlled symlink (e.g. ~/sneaky → /etc) at
      // baseDir would let writeProjectFile escape the project sandbox at
      // every later call: resolveSafe checks the *literal* baseDir, but
      // the OS follows the symlink at write time. realpath() collapses
      // the chain so the stored baseDir == what the kernel will write to.
      let normalizedPath: string;
      try {
        normalizedPath = await fs.promises.realpath(trimmedInput);
      } catch {
        return sendApiError(res, 400, 'BAD_REQUEST', 'folder not found');
      }
      // realpath resolved → lstat the canonical path to ensure it's a
      // real directory, not another symlink (defense-in-depth).
      let dirStat;
      try {
        dirStat = await fs.promises.lstat(normalizedPath);
      } catch {
        return sendApiError(res, 400, 'BAD_REQUEST', 'folder not found');
      }
      if (!dirStat.isDirectory()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'path must be a directory');
      }
      if (path.parse(normalizedPath).root === normalizedPath) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'cannot import the filesystem root');
      }
      // Prevent importing the data directory into itself (post-realpath so
      // a symlink pointing into RUNTIME_DATA_DIR is also caught). Compare
      // against the canonical alias because `normalizedPath` is the import
      // folder's realpath; on macOS the data dir at /var/... resolves to
      // /private/var/... and would never start-with the user-shaped path.
      if (
        normalizedPath === RUNTIME_DATA_DIR_CANONICAL ||
        normalizedPath.startsWith(RUNTIME_DATA_DIR_CANONICAL + path.sep)
      ) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'cannot import the data directory');
      }
      const sandboxReason = normalizedOrchestratorWorkspace && trustedPickerImport
        ? null
        : sandboxImportedProjectRootUnavailableReason(normalizedPath);
      if (sandboxReason) {
        return sendApiError(res, 400, 'BAD_REQUEST', sandboxReason);
      }

      const id = randomId();
      const now = Date.now();
      const projectName =
        typeof name === 'string' && name.trim()
          ? name.trim()
          : path.basename(normalizedPath);
      const entryFile = await detectEntryFile(normalizedPath);
      const designSystemValidation = await validateProjectDesignSystemId(designSystemId);
      if (!designSystemValidation.ok) {
        return sendApiError(
          res,
          400,
          designSystemValidation.code,
          designSystemValidation.message,
        );
      }
      const project = insertProject(db, {
        id,
        name: projectName,
        skillId: skillId ?? null,
        designSystemId: designSystemValidation.id,
        pendingPrompt: null,
        metadata: {
          kind: 'prototype',
          baseDir: normalizedPath,
          importedFrom: 'folder',
          entryFile,
          ...(normalizedOrchestratorWorkspace
            ? { orchestratorWorkspace: normalizedOrchestratorWorkspace }
            : {}),
          ...(trustedPickerImport ? { fromTrustedPicker: true as const } : {}),
        },
        createdAt: now,
        updatedAt: now,
      });

      const cid = randomId();
      insertConversation(db, {
        id: cid,
        projectId: id,
        title: `Imported from ${projectName}`,
        createdAt: now,
        updatedAt: now,
      });
      // Folder imports should land on Design Files so users can choose from
      // the imported folder's artifacts. Persist an empty saved tab state so
      // ProjectView does not auto-open the detected primary file on hydration.
      setTabs(db, id, [], null);
      /** @type {import('@open-design/contracts').ImportFolderResponse} */
      const body = { project, conversationId: cid, entryFile };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

}

export interface RegisterProjectExportRoutesDeps extends RouteDeps<'db' | 'http' | 'paths' | 'node' | 'ids' | 'projectStore' | 'exports' | 'projectFiles' | 'validation'> {}

export function registerProjectExportRoutes(app: Express, ctx: RegisterProjectExportRoutesDeps) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { PROJECTS_DIR, RUNTIME_DATA_DIR_CANONICAL } = ctx.paths;
  const { fs, path } = ctx.node;
  const { randomId } = ctx.ids;
  const { getProject } = ctx.projectStore;
  const { listFiles, readProjectFile, resolveProjectFilePath } = ctx.projectFiles;
  const { isSafeId } = ctx.validation;
  const {
    buildProjectArchive,
    buildBatchArchive,
    buildDesktopPdfExportInput,
    buildDesktopArtifactExportInput,
    desktopPdfExporter,
    desktopSlideRenderer,
    desktopArtifactExporter,
    daemonUrlRef,
    sanitizeArchiveFilename,
  } = ctx.exports;

  function isNoSlideDeckRenderError(rendered: { ok: boolean; error?: string }): boolean {
    return !rendered.ok && typeof rendered.error === 'string' && /no slide surfaces found/i.test(rendered.error);
  }

  function normalizeExportVersionId(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    const value = raw.trim();
    return value.length > 0 ? value : undefined;
  }

  async function readExportVersionSource(
    projectId: string,
    fileName: string,
    versionId: string | undefined,
    metadata: unknown,
  ): Promise<string | undefined> {
    if (!versionId) return undefined;
    const result = await readProjectFileVersion(
      PROJECTS_DIR,
      projectId,
      fileName,
      versionId,
      metadata,
    );
    return result.content;
  }

  function screenshotRenderClientError(
    rendered: { ok: boolean; error?: string; errorCode?: string },
    format: 'pptx' | 'pdf' | 'image',
  ): { message: string; status: 400 | 422 } | null {
    if (rendered.ok) return null;
    if (rendered.errorCode === 'NO_SLIDES' || (format === 'pptx' && isNoSlideDeckRenderError(rendered))) {
      return {
        status: 422,
        message: 'this artifact is not a slide deck — export it as PDF or an image instead',
      };
    }
    if (rendered.errorCode === 'SLIDE_INDEX_OUT_OF_RANGE') {
      return {
        status: 422,
        message: rendered.error || 'slide index is out of range',
      };
    }
    if (rendered.errorCode === 'PAGE_TOO_TALL') {
      return {
        status: 422,
        message: rendered.error || 'page is too tall to export as one image',
      };
    }
    return null;
  }

  // Shared screenshot-export flow: render the deck to one PNG per slide via the
  // desktop's Electron Chromium, then assemble the requested binary. Both the
  // .pptx and raster-.pdf routes funnel through here. Like the PDF route, it
  // requires the desktop runtime — there is no headless renderer in a bare
  // daemon yet, so a web-only deployment gets a clear 501.
  async function handleScreenshotExport(
    res: Response,
    format: 'pptx' | 'pdf' | 'image',
    projectId: string,
    body: any,
  ) {
    let renderOutputDir: string | null = null;
    try {
      const { fileName, title, index, imageFormat, width, height } = body || {};
      if (typeof fileName !== 'string' || fileName.length === 0) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'fileName required');
      }
      const project = getProject(db, projectId);
      const metadata = project?.metadata ?? null;
      const versionId = normalizeExportVersionId(body?.versionId);
      const sourceHtml = await readExportVersionSource(projectId, fileName, versionId, metadata);
      if (format === 'image' && imageFormat != null && imageFormat !== 'png' && imageFormat !== 'jpeg') {
        return sendApiError(res, 400, 'BAD_REQUEST', 'imageFormat must be png or jpeg');
      }
      if (width != null && (typeof width !== 'number' || !Number.isFinite(width) || width <= 0)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'width must be a positive number');
      }
      if (height != null && (typeof height !== 'number' || !Number.isFinite(height) || height <= 0)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'height must be a positive number');
      }
      if (typeof desktopSlideRenderer !== 'function') {
        if (format === 'image' && typeof desktopArtifactExporter === 'function') {
          const input = await buildDesktopArtifactExportInput({
            daemonUrl: daemonUrlRef.current,
            fileName,
            format,
            metadata,
            projectId,
            projectsRoot: PROJECTS_DIR,
            ...(sourceHtml !== undefined ? { sourceHtml } : {}),
            ...(typeof title === 'string' ? { title } : {}),
            ...(typeof body?.deck === 'boolean' ? { deck: body.deck } : {}),
            ...(format === 'image' && imageFormat === 'jpeg' ? { imageFormat: 'jpeg' } : {}),
            ...(typeof width === 'number' ? { width } : {}),
            ...(typeof height === 'number' ? { height } : {}),
          });
          let result;
          try {
            result = await desktopArtifactExporter(input);
          } catch (err: any) {
            return sendApiError(
              res,
              502,
              'UPSTREAM_UNAVAILABLE',
              `desktop renderer unavailable: ${err?.message || String(err)}`,
            );
          }
          if (!result.ok || typeof result.path !== 'string') {
            return sendApiError(
              res,
              502,
              'UPSTREAM_UNAVAILABLE',
              result.error || 'desktop renderer returned no artifact',
            );
          }
          try {
            const buffer = await fs.promises.readFile(result.path);
            const contentType =
              result.mime || (imageFormat === 'jpeg' ? 'image/jpeg' : 'image/png');
            const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
            const titleBase =
              typeof title === 'string' && title.trim().length > 0
                ? title.trim()
                : path.basename(fileName, path.extname(fileName)) || 'artifact';
            const filename = `${sanitizeArchiveFilename(titleBase) || 'artifact'}.${ext}`;
            const asciiFallback =
              filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '_') || `artifact.${ext}`;
            res.setHeader('Content-Type', contentType);
            res.setHeader(
              'Content-Disposition',
              `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
            );
            return res.send(buffer);
          } finally {
            await fs.promises.rm(result.path, { force: true }).catch(() => {});
          }
        }
        return sendApiError(
          res,
          501,
          'UPSTREAM_UNAVAILABLE',
          'screenshot export is only available in the desktop runtime',
        );
      }
      // Scratch dir under the daemon data root: the desktop renderer writes the
      // rendered images here and returns their file paths, so large images never
      // cross the JSON IPC channel as base64. The daemon owns it and deletes it in
      // the finally below. Derived from RUNTIME_DATA_DIR per the data-dir contract.
      const outputDir = path.join(RUNTIME_DATA_DIR_CANONICAL, 'export-render', randomId());
      renderOutputDir = outputDir;
      const renderOptions: BuildDeckRenderInputOptions = {
        daemonUrl: daemonUrlRef.current,
        fileName,
        // Imported-folder projects keep their workspace under metadata.baseDir;
        // thread it through so readProjectFile resolves the real file instead of
        // 404ing on <data>/projects/:id.
        metadata,
        outputDir,
        projectId,
        projectsRoot: PROJECTS_DIR,
      };
      if (sourceHtml !== undefined) renderOptions.sourceHtml = sourceHtml;
      if (typeof title === 'string') renderOptions.title = title;
      if (typeof width === 'number') renderOptions.width = width;
      if (typeof height === 'number') renderOptions.height = height;
      // Page-vs-deck is the caller's call, not a `.slide`-count guess: PPTX is
      // deck-only; image/PDF take the web's `effectiveDeck` signal so an ordinary
      // page that happens to contain `.slide` markup is still captured full-page.
      if (format === 'pptx') {
        renderOptions.deck = true;
        // Editable PPTX (native shapes/text via dom-to-pptx) vs the default
        // screenshot PPTX (one image per slide).
        if (body?.editable === true) renderOptions.editable = true;
      } else if (typeof body?.deck === 'boolean') {
        renderOptions.deck = body.deck;
      }
      // Image export = "the whole artifact as one picture": a deck becomes all
      // slides stitched into one tall image; an ordinary page is its full-page
      // capture. (A specific slide index is still honored if explicitly given.)
      if (format === 'image') {
        if (typeof index === 'number' && Number.isInteger(index) && index >= 0) {
          renderOptions.index = index;
        } else {
          renderOptions.stitch = true;
        }
      }
      // A non-deck page exported to PDF paginates into one PDF page per viewport
      // (a long scrolling site becomes a readable multi-page PDF instead of one
      // giant page). The desktop renderer uses JPEG only after it has decided
      // page mode; auto-detected decks stay PNG for crisp slide text.
      if (format === 'pdf' && body?.deck !== true) renderOptions.paginate = true;
      // Image export defaults to PNG unless the caller explicitly asks for JPEG
      // (CLI --image-format).
      if (format === 'image' && imageFormat === 'jpeg') renderOptions.pageImageFormat = 'jpeg';
      const tStart = Date.now();
      const { input, title: resolvedTitle, defaultFilename } =
        await buildDeckRenderInput(renderOptions);
      // The renderer call is a cross-process IPC (requestJsonIpc, 600s). A
      // missing desktop process, broken socket, or timeout is an upstream
      // renderer outage — surface it as 502 UPSTREAM_UNAVAILABLE (matching the
      // `!rendered.ok` branch below), not the outer 400 BAD_REQUEST which is for
      // genuine request-validation / assembly errors.
      let rendered;
      try {
        rendered = await desktopSlideRenderer(input);
      } catch (err: any) {
        return sendApiError(
          res,
          502,
          'UPSTREAM_UNAVAILABLE',
          `desktop renderer unavailable: ${err?.message || String(err)}`,
        );
      }
      const tRendered = Date.now();

      const clientError = screenshotRenderClientError(rendered, format);
      if (clientError) {
        return sendApiError(res, clientError.status, 'BAD_REQUEST', clientError.message);
      }

      // Editable PPTX: the renderer wrote a finished .pptx (native shapes/text)
      // to the scratch dir. Stream it directly — no image assembly. Confine the
      // path to the scratch dir, same defense as the image handoff.
      if (renderOptions.editable) {
        if (!rendered.ok || typeof rendered.pptxFile !== 'string') {
          return sendApiError(
            res,
            502,
            'UPSTREAM_UNAVAILABLE',
            rendered.error || 'editable PPTX renderer returned no file',
          );
        }
        const canonicalDir = await fs.promises.realpath(renderOutputDir).catch(() => renderOutputDir);
        const realPptx = await fs.promises.realpath(rendered.pptxFile).catch(() => null);
        if (!realPptx || (realPptx !== canonicalDir && !realPptx.startsWith(canonicalDir + path.sep))) {
          return sendApiError(
            res,
            502,
            'UPSTREAM_UNAVAILABLE',
            'renderer returned a pptx path outside the export scratch directory',
          );
        }
        const pptxBuffer = await fs.promises.readFile(realPptx);
        // eslint-disable-next-line no-console
        console.info('[od-export] assemble', {
          format: 'pptx-editable',
          via: 'file',
          bytes: pptxBuffer.length,
          rendererMs: tRendered - tStart,
          totalMs: Date.now() - tStart,
        });
        const editableName = `${defaultFilename}.pptx`;
        const editableAscii =
          editableName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '_') || 'deck.pptx';
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${editableAscii}"; filename*=UTF-8''${encodeURIComponent(editableName)}`,
        );
        return res.send(pptxBuffer);
      }

      const hasFiles = Array.isArray(rendered.slideFiles) && rendered.slideFiles.length > 0;
      const hasDataUrls = Array.isArray(rendered.slides) && rendered.slides.length > 0;
      if (!rendered.ok || (!hasFiles && !hasDataUrls)) {
        return sendApiError(
          res,
          502,
          'UPSTREAM_UNAVAILABLE',
          rendered.error || 'desktop renderer returned no slides',
        );
      }
      // PPTX is slide-based: an ordinary page (no `.slide` sections) has no
      // slide model, so refuse rather than emit a one-giant-slide deck.
      if (format === 'pptx' && rendered.mode === 'page') {
        return sendApiError(
          res,
          422,
          'BAD_REQUEST',
          'this artifact is not a slide deck — export it as PDF or an image instead',
        );
      }
      // Prefer the on-disk file handoff; fall back to base64 data URLs for older
      // desktop builds that don't honor outputDir. Confine the handoff files to
      // the canonical scratch dir before reading — a malformed renderer response
      // must not make the daemon read & stream back arbitrary files (path
      // traversal / symlink escape), since cleanup only removes renderOutputDir.
      let images: Awaited<ReturnType<typeof readSlideFiles>>;
      if (hasFiles) {
        const canonicalDir = await fs.promises.realpath(renderOutputDir).catch(() => renderOutputDir);
        const safeFiles: string[] = [];
        for (const candidate of rendered.slideFiles as string[]) {
          const real =
            typeof candidate === 'string'
              ? await fs.promises.realpath(candidate).catch(() => null)
              : null;
          if (!real || (real !== canonicalDir && !real.startsWith(canonicalDir + path.sep))) {
            return sendApiError(
              res,
              502,
              'UPSTREAM_UNAVAILABLE',
              'renderer returned a slide path outside the export scratch directory',
            );
          }
          safeFiles.push(real);
        }
        images = await readSlideFiles(safeFiles);
      } else {
        images = decodeSlideDataUrls(rendered.slides as string[]);
      }
      const tRead = Date.now();
      let buffer: Buffer;
      let contentType: string;
      let ext: string;
      if (format === 'pptx') {
        // Derive the slide aspect from the rendered pixel dims so non-16:9 decks
        // get a correctly-proportioned PPTX layout instead of a forced 16:9 one.
        const aspect =
          typeof rendered.width === 'number' &&
          typeof rendered.height === 'number' &&
          rendered.height > 0
            ? rendered.width / rendered.height
            : undefined;
        buffer = await buildScreenshotPptx(images, {
          title: resolvedTitle,
          ...(aspect ? { aspect } : {}),
        });
        contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        ext = 'pptx';
      } else if (format === 'pdf') {
        buffer = await buildScreenshotPdf(images);
        contentType = 'application/pdf';
        ext = 'pdf';
      } else {
        // image: exactly one image (the requested slide, stitched deck, or whole
        // page). A multi-image renderer result is a contract violation; never
        // silently stream images[0], which would truncate a too-tall JPEG page to
        // its first chunk.
        if (images.length !== 1) {
          return sendApiError(
            res,
            502,
            'UPSTREAM_UNAVAILABLE',
            `image renderer returned ${images.length} images for a single-image export`,
          );
        }
        const first = images[0]!;
        buffer = first.buffer;
        contentType = first.jpeg ? 'image/jpeg' : 'image/png';
        ext = first.jpeg ? 'jpg' : 'png';
      }
      // One-line export timing: renderer (desktop capture+encode+IPC) vs read
      // (file handoff / base64 decode) vs assemble (pptx/pdf build). Pair with
      // the desktop `[od-export] render` line for the full picture.
      // eslint-disable-next-line no-console
      console.info('[od-export] assemble', {
        format,
        via: hasFiles ? 'file' : 'dataurl',
        slides: images.length,
        bytes: buffer.length,
        rendererMs: tRendered - tStart,
        readMs: tRead - tRendered,
        assembleMs: Date.now() - tRead,
        totalMs: Date.now() - tStart,
      });
      const filename = `${defaultFilename}.${ext}`;
      const asciiFallback =
        filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '_') || `deck.${ext}`;
      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      res.send(buffer);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    } finally {
      // Remove the scratch render dir regardless of success — these files are
      // pure transient handoff, never served or persisted.
      if (renderOutputDir) {
        await fs.promises.rm(renderOutputDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
  // Streams a ZIP of the project's on-disk tree so the "Download as .zip"
  // share menu can hand the user the actual files they uploaded — e.g. the
  // imported `ui-design/` folder — instead of a one-file snapshot of the
  // rendered HTML. `root` scopes the archive to a subdirectory; without
  // it, the whole project is packed.
  app.get('/api/projects/:id/archive', async (req, res) => {
    try {
      const root = typeof req.query?.root === 'string' ? req.query.root : '';
      const project = getProject(db, req.params.id);
      const { buffer, baseName } = await buildProjectArchive(
        PROJECTS_DIR,
        req.params.id,
        root,
        project?.metadata,
      );
      const fallbackName = project?.name || req.params.id;
      const fileSlug = sanitizeArchiveFilename(baseName || fallbackName) || 'project';
      const filename = `${fileSlug}.zip`;
      // RFC 5987 dance: legacy `filename=` carries an ASCII fallback, while
      // `filename*=UTF-8''…` lets modern browsers pick up project names
      // with non-ASCII characters (accents, CJK, etc.) without mojibake.
      const asciiFallback =
        filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '_') || 'project.zip';
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      res.send(buffer);
    } catch (err: any) {
      const code = err && err.code;
      const status = code === 'ENOENT' || code === 'ENOTDIR' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

  // Batch archive: accepts a list of file names and returns a ZIP of just
  // those files. Used by the Design Files panel multi-select download.
  app.post('/api/projects/:id/archive/batch', async (req, res) => {
    try {
      const { files } = req.body || {};
      if (!Array.isArray(files) || files.length === 0) {
        sendApiError(res, 400, 'BAD_REQUEST', 'files must be a non-empty array');
        return;
      }
      const project = getProject(db, req.params.id);
      const { buffer } = await buildBatchArchive(
        PROJECTS_DIR,
        req.params.id,
        files,
        project?.metadata,
      );
      const fileSlug = sanitizeArchiveFilename(project?.name || req.params.id) || 'project';
      const filename = `${fileSlug}.zip`;
      const asciiFallback =
        filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '_') || 'project.zip';
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      res.send(buffer);
    } catch (err: any) {
      const code = err && err.code;
      const status = code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

  app.get('/api/projects/:id/export/manifest', async (req, res) => {
    try {
      if (!isSafeId(req.params.id)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid project id');
      }
      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      const files = await listFiles(PROJECTS_DIR, req.params.id, {
        metadata: project.metadata,
      });
      /** @type {import('@open-design/contracts').ProjectExportManifestResponse} */
      const body = buildProjectExportManifestResponse({
        project,
        projectId: req.params.id,
        files,
      });
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  app.post('/api/projects/:id/export/pdf', async (req, res) => {
    if (typeof desktopPdfExporter !== 'function') {
      return sendApiError(
        res,
        501,
        'UPSTREAM_UNAVAILABLE',
        'desktop PDF export is only available in the desktop runtime',
      );
    }
    try {
      const { fileName, title, deck } = req.body || {};
      if (typeof fileName !== 'string' || fileName.length === 0) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'fileName required');
      }
      const project = getProject(db, req.params.id);
      const metadata = project?.metadata ?? null;
      const versionId = normalizeExportVersionId(req.body?.versionId);
      const sourceHtml = await readExportVersionSource(req.params.id, fileName, versionId, metadata);
      const input = await buildDesktopPdfExportInput({
        daemonUrl: daemonUrlRef.current,
        deck: deck === true,
        fileName,
        metadata,
        projectId: req.params.id,
        projectsRoot: PROJECTS_DIR,
        ...(sourceHtml !== undefined ? { sourceHtml } : {}),
        title: typeof title === 'string' ? title : undefined,
      });
      const result = await desktopPdfExporter(input);
      res.json(result);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

  // Programmatic screenshot-based PPTX: render each deck slide to a pixel-perfect
  // PNG and assemble a one-image-per-slide .pptx. Replaces the old "send a prompt
  // to the agent and hope it runs python-pptx" path with a deterministic export.
  app.post('/api/projects/:id/export/pptx', async (req, res) => {
    await handleScreenshotExport(res, 'pptx', req.params.id, req.body);
  });

  // Programmatic screenshot-based (raster) PDF: one pixel-perfect page per slide.
  // The print-ready vector PDF stays on POST /export/pdf; this is the "exactly
  // what you see" counterpart that shares the slide renderer with PPTX.
  app.post('/api/projects/:id/export/pdf-image', async (req, res) => {
    await handleScreenshotExport(res, 'pdf', req.params.id, req.body);
  });

  // Programmatic image export: a single pixel-perfect PNG. For a deck it renders
  // the requested slide (`index`) at 1920x1080; for an ordinary page it renders
  // the whole document at natural size. Viewport-independent — unlike the
  // host-compositor snapshot, the size never depends on the preview pane.
  app.post('/api/projects/:id/export/image', async (req, res) => {
    await handleScreenshotExport(res, 'image', req.params.id, req.body);
  });

  // Generic programmatic export (PDF / image / PPTX) for the `od export` CLI and
  // any caller using the shared `ExportRequest` contract. EVERY format rasterizes
  // through the desktop screenshot renderer — `pdf` is the raster screenshot PDF
  // (one page per deck slide / per viewport for a long page), exactly like the
  // dedicated /export/{pptx,pdf-image,image} routes and what the web UI uses.
  // There is deliberately NO vector printToPDF path here: it drops CJK glyphs in
  // the packaged runtime, which is the fidelity bug this feature exists to avoid.
  // handleScreenshotExport owns validation, the 404/400/422 error mapping, and
  // scratch-dir cleanup.
  app.post('/api/projects/:id/export', async (req, res) => {
    const { fileName, title, deck, format, imageFormat, width, height, versionId } = req.body || {};
    if (typeof fileName !== 'string' || fileName.length === 0) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'fileName required');
    }
    if (!isExportFormat(format)) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'invalid export format');
    }
    await handleScreenshotExport(res, format, req.params.id, {
      fileName,
      // pptx is deck-only (handleScreenshotExport forces it); pdf/image honor the
      // caller's deck flag when one is supplied. Omitted stays omitted so the
      // renderer can auto-detect deck artifacts.
      ...(typeof deck === 'boolean' ? { deck } : {}),
      ...(typeof imageFormat === 'string' ? { imageFormat } : {}),
      ...(width != null ? { width } : {}),
      ...(height != null ? { height } : {}),
      ...(typeof title === 'string' ? { title } : {}),
      ...(typeof versionId === 'string' ? { versionId } : {}),
    });
  });

  // Export endpoint: serves an HTML body with every same-project
  // top-level `<link rel=stylesheet>` / `<script src>` inlined.
  // Counterpart to GET /api/projects/:id/raw/* — that route stays
  // URL-load (one request per asset; FileViewer's default since
  // PR #384). This route exists for explicit "Inline top-level
  // CSS/JS" exports + the screenshot path where the headless browser
  // fetches the response and renders it.
  //
  // Scope is intentionally narrow: only `<link rel=stylesheet>` and
  // `<script src>` are rewritten. `<img src>`, CSS `url(...)` refs,
  // `@import`, ES module imports, font sources, and similar remain
  // external in the response — see the docstring on
  // `apps/daemon/src/inline-assets.ts` for the full not-rewritten list
  // and rationale. A fully offline "self-contained" export with image
  // and font bundling would be a follow-up issue.
  //
  // Null-origin (sandboxed iframe srcdoc) callers are intentionally
  // NOT supported — the only consumers are the daemon UI (same-origin)
  // and server-side screenshot tooling (no Origin header). The
  // response also carries `Content-Security-Policy: sandbox
  // allow-scripts` so top-level browser navigation (no Origin header,
  // would otherwise pass the daemon middleware) cannot escalate to
  // daemon-origin privileges through script execution.
  //
  // See nexu-io/open-design#368 and the architecture lock at
  // https://github.com/nexu-io/open-design/issues/368#issuecomment-4366243218.
  app.get('/api/projects/:id/export/*splat', async (req, res) => {
    try {
      if (!isSafeId(req.params.id)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid project id');
      }

      const inlineRaw =
        typeof req.query.inline === 'string' ? req.query.inline.trim().toLowerCase() : '';
      if (!['1', 'true', 'yes', 'on'].includes(inlineRaw)) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          "query parameter 'inline=1' is required",
        );
      }

      const project = getProject(db, req.params.id);
      const splatParam = (req.params as { splat?: string | string[] }).splat;
      const relPath = Array.isArray(splatParam) ? splatParam.join('/') : String(splatParam ?? '');
      const versionId = normalizeExportVersionId(req.query.versionId);

      // PR #1312 round-5 (lefarcen P2): stat the owner file BEFORE
      // readProjectFile so a 100 MiB owner HTML is rejected after a
      // cheap stat() call, not after a 100 MiB readFile() into memory.
      // The size check + mime check both run pre-buffer here, mirroring
      // the sibling-asset stat-then-read contract round 4 already
      // applied via AssetHandle. Size fires before mime so an oversize
      // non-HTML file returns 413 (not 415) — that ordering is the
      // observable Red→Green for this round.
      //
      // The helper's ownerBytes check (inline-assets.ts:127-133) stays
      // as defense-in-depth: it still catches direct in-process callers
      // that skip the route and any future drift in the size reported
      // by stat vs the bytes actually returned by readFile.
      let ownerHtml: string;
      if (versionId) {
        try {
          ownerHtml = await readExportVersionSource(
            req.params.id,
            relPath,
            versionId,
            project?.metadata,
          ) ?? '';
        } catch (err: any) {
          const status = err && err.code === 'ENOENT' ? 404 : 400;
          return sendApiError(
            res,
            status,
            status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
            String(err),
          );
        }
        const ownerBytes = Buffer.byteLength(ownerHtml, 'utf8');
        if (ownerBytes > MAX_INLINE_OWNER_BYTES) {
          return sendApiError(
            res,
            413,
            'PAYLOAD_TOO_LARGE',
            `owner html ${ownerBytes} bytes exceeds MAX_INLINE_OWNER_BYTES ${MAX_INLINE_OWNER_BYTES}`,
          );
        }
      } else {
        let ownerMeta;
        try {
          ownerMeta = await resolveProjectFilePath(
            PROJECTS_DIR,
            req.params.id,
            relPath,
            project?.metadata,
          );
        } catch (err: any) {
          const status = err && err.code === 'ENOENT' ? 404 : 400;
          return sendApiError(
            res,
            status,
            status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
            String(err),
          );
        }

        if (ownerMeta.size > MAX_INLINE_OWNER_BYTES) {
          return sendApiError(
            res,
            413,
            'PAYLOAD_TOO_LARGE',
            `owner html ${ownerMeta.size} bytes exceeds MAX_INLINE_OWNER_BYTES ${MAX_INLINE_OWNER_BYTES}`,
          );
        }

        if (!ownerMeta.mime.startsWith('text/html')) {
          return sendApiError(
            res,
            415,
            'UNSUPPORTED_MEDIA_TYPE',
            'export endpoint only supports HTML files',
          );
        }

        try {
          const file = await readProjectFile(PROJECTS_DIR, req.params.id, relPath, project?.metadata);
          ownerHtml = file.buffer.toString('utf8');
        } catch (err: any) {
          const status = err && err.code === 'ENOENT' ? 404 : 400;
          return sendApiError(
            res,
            status,
            status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
            String(err),
          );
        }
      }

      // PR #1312 round-4 (lefarcen P2): stat first, then read. This
      // lets the helper short-circuit on maxAssetBytes / maxTotalBytes
      // BEFORE the buffer is materialized into memory. A 100 MiB
      // sibling file is rejected after the cheap stat call, not after
      // a 100 MiB readFile.
      const fileReader: InlineAssetReader = async (sibling) => {
        let meta;
        try {
          meta = await resolveProjectFilePath(
            PROJECTS_DIR,
            req.params.id,
            sibling,
            project?.metadata,
          );
        } catch {
          return null;
        }
        return {
          size: meta.size,
          read: async () => {
            try {
              const siblingFile = await readProjectFile(
                PROJECTS_DIR,
                req.params.id,
                sibling,
                project?.metadata,
              );
              return siblingFile.buffer.toString('utf8');
            } catch {
              return null;
            }
          },
        };
      };

      const exportSource = await resolveHtmlExportSource({
        projectId: req.params.id,
        projectsRoot: PROJECTS_DIR,
        relPath,
        html: ownerHtml,
        metadata: project?.metadata,
        readProjectFile,
        resolveProjectFilePath,
      });
      const rendered = await inlineRelativeAssets(
        exportSource.html,
        exportSource.relPath,
        fileReader,
      );
      // PR #1312 round-2 (lefarcen P2): top-level browser navigation to
      // this URL sends no Origin header, so the /api middleware lets it
      // through. Without a CSP, any JS in the exported document would
      // run at daemon origin with access to /api/, cookies, localStorage,
      // etc. `sandbox allow-scripts` treats the response like a sandboxed
      // iframe with an opaque origin — scripts execute (that's the point
      // of inlining JS for screenshot tooling), but cannot read cookies,
      // hit /api/, or escalate to daemon-origin privileges.
      res.setHeader('Content-Security-Policy', 'sandbox allow-scripts');
      res.type('text/html').send(rendered);
    } catch (err: any) {
      // PR #1312 round-3 (lefarcen P2): the inliner's cap-enforcement
      // throws InlineAssetsLimitError when the owner HTML, candidate
      // count, or assembled output exceeds the module-level limits.
      // Map every such throw to a 413 PAYLOAD_TOO_LARGE envelope so
      // callers see a structured error rather than a generic 400.
      if (err instanceof InlineAssetsLimitError || err?.name === 'InlineAssetsLimitError') {
        return sendApiError(res, 413, 'PAYLOAD_TOO_LARGE', String(err));
      }
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

}

async function resolveHtmlExportSource({
  projectId,
  projectsRoot,
  relPath,
  html,
  metadata,
  readProjectFile,
  resolveProjectFilePath,
}: {
  projectId: string;
  projectsRoot: string;
  relPath: string;
  html: string;
  metadata: unknown;
  readProjectFile: (projectsRoot: string, projectId: string, relPath: string, metadata?: unknown) => Promise<{ buffer: Buffer }>;
  resolveProjectFilePath: (projectsRoot: string, projectId: string, relPath: string, metadata?: unknown) => Promise<{ size: number; mime: string }>;
}): Promise<{ html: string; relPath: string }> {
  if (!isViteDevHtmlEntry(html)) return { html, relPath };

  const ownerDir = nodePath.posix.dirname(relPath);
  const distRelPath = ownerDir === '.' ? 'dist/index.html' : `${ownerDir}/dist/index.html`;
  try {
    const distMeta = await resolveProjectFilePath(projectsRoot, projectId, distRelPath, metadata);
    if (distMeta.size > MAX_INLINE_OWNER_BYTES || !distMeta.mime.startsWith('text/html')) {
      return { html, relPath };
    }
    const distFile = await readProjectFile(projectsRoot, projectId, distRelPath, metadata);
    return {
      html: rewriteViteDistRootAssetUrls(distFile.buffer.toString('utf8')),
      relPath: distRelPath,
    };
  } catch {
    return { html, relPath };
  }
}

function isViteDevHtmlEntry(html: string): boolean {
  return /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*\bsrc\s*=\s*["']\/src\/[^"']+["'][^>]*>\s*<\/script>/i.test(html);
}

function rewriteViteDistRootAssetUrls(html: string): string {
  return html.replace(
    /\b(href|src)\s*=\s*(["'])\/assets\//gi,
    (_match, attr: string, quote: string) => `${attr}=${quote}assets/`,
  );
}

function buildProjectExportManifestResponse({
  project,
  projectId,
  files,
}: {
  project: any;
  projectId: string;
  files: any[];
}) {
  const sortedFiles = [...files].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const filesByName = new Map(sortedFiles.map((file) => [file.name, file]));
  const reasons = new Map<string, Set<string>>();
  const supportingNames = new Set<string>();
  const artifactNames = new Set<string>();
  const artifacts = [];

  const note = (name: unknown, reason: string) => {
    if (typeof name !== 'string' || !filesByName.has(name)) return;
    if (!reasons.has(name)) reasons.set(name, new Set());
    reasons.get(name)?.add(reason);
  };

  for (const file of sortedFiles) {
    const manifest = file.artifactManifest && typeof file.artifactManifest === 'object'
      ? file.artifactManifest
      : null;
    if (!manifest) continue;
    if (isInferredArtifactManifest(manifest)) continue;
    artifactNames.add(file.name);
    note(file.name, 'artifact-manifest');

    const artifactSupporting = new Set<string>();
    const addManifestRef = (
      ref: unknown,
      reason: string,
      options: { allowProjectRootFallback?: boolean; preferProjectRoot?: boolean } = {},
    ) => {
      const ownerRelative = normalizeManifestProjectRef(ref, file.name);
      const projectRoot = normalizeManifestProjectRootRef(ref);
      const candidates = options.preferProjectRoot
        ? [projectRoot, ownerRelative]
        : [
            ownerRelative,
            ...(options.allowProjectRootFallback ? [projectRoot] : []),
          ];
      const normalized = candidates.find((candidate) => candidate && filesByName.has(candidate));
      if (!normalized) return;
      if (normalized === file.name) return;
      supportingNames.add(normalized);
      artifactSupporting.add(normalized);
      note(normalized, reason);
    };
    addManifestRef(manifest.entry, 'artifact-entry', { preferProjectRoot: true });
    if (typeof manifest.primary === 'string') {
      addManifestRef(manifest.primary, 'artifact-primary', { preferProjectRoot: true });
    }
    if (Array.isArray(manifest.supportingFiles)) {
      for (const ref of manifest.supportingFiles) {
        addManifestRef(ref, 'artifact-supporting-file', { allowProjectRootFallback: true });
      }
    }

    artifacts.push({
      file: file.name,
      title: typeof manifest.title === 'string' && manifest.title.trim()
        ? manifest.title
        : file.name,
      kind: typeof manifest.kind === 'string' ? manifest.kind : (file.artifactKind ?? null),
      renderer: typeof manifest.renderer === 'string' ? manifest.renderer : null,
      status: typeof manifest.status === 'string' ? manifest.status : null,
      exports: Array.isArray(manifest.exports)
        ? manifest.exports.filter((value: unknown): value is string => typeof value === 'string')
        : [],
      supportingFiles: Array.from(artifactSupporting).sort((a, b) => a.localeCompare(b)),
      updatedAt: typeof manifest.updatedAt === 'string' ? manifest.updatedAt : null,
    });
  }

  const entryFile = chooseExportManifestEntryFile(project, sortedFiles, filesByName);
  note(entryFile, 'project-entry-file');

  return {
    schema: PROJECT_EXPORT_MANIFEST_SCHEMA,
    projectId,
    projectName: typeof project?.name === 'string' ? project.name : null,
    generatedAt: new Date().toISOString(),
    entryFile,
    files: sortedFiles.map((file) => ({
      ...file,
      included: true,
      role: roleForExportManifestFile(file, {
        entryFile,
        artifactNames,
        supportingNames,
      }),
      reasons: Array.from(reasons.get(file.name) ?? ['visible-project-file']).sort((a, b) => a.localeCompare(b)),
    })),
    artifacts,
  };
}

function isInferredArtifactManifest(manifest: any): boolean {
  return manifest?.metadata &&
    typeof manifest.metadata === 'object' &&
    manifest.metadata.inferred === true;
}

function chooseExportManifestEntryFile(
  project: any,
  files: any[],
  filesByName: Map<string, any>,
): string | null {
  const metadataEntry = typeof project?.metadata?.entryFile === 'string'
    ? project.metadata.entryFile
    : null;
  if (metadataEntry && filesByName.has(metadataEntry)) return metadataEntry;
  for (const file of files) {
    const manifest = file.artifactManifest;
    if (!manifest || typeof manifest !== 'object') continue;
    if (isInferredArtifactManifest(manifest)) continue;
    if (manifest.primary === true) return file.name;
    if (typeof manifest.primary === 'string') {
      const rootPrimary = normalizeManifestProjectRootRef(manifest.primary);
      if (rootPrimary && filesByName.has(rootPrimary)) return rootPrimary;
      const ownerRelativePrimary = normalizeManifestProjectRef(manifest.primary, file.name);
      if (ownerRelativePrimary && filesByName.has(ownerRelativePrimary)) return ownerRelativePrimary;
    }
    const rootEntry = normalizeManifestProjectRootRef(manifest.entry);
    if (rootEntry && filesByName.has(rootEntry)) return rootEntry;
    const ownerRelativeEntry = normalizeManifestProjectRef(manifest.entry, file.name);
    if (ownerRelativeEntry && filesByName.has(ownerRelativeEntry)) return ownerRelativeEntry;
  }
  return files.find((file) => /(^|\/)index\.html?$/i.test(file.name))?.name
    ?? files.find((file) => file.kind === 'html')?.name
    ?? files[0]?.name
    ?? null;
}

function normalizeManifestProjectRootRef(ref: unknown): string | null {
  return normalizeManifestProjectRef(ref, '');
}

function normalizeManifestProjectRef(ref: unknown, ownerFile: string): string | null {
  if (typeof ref !== 'string' || !ref.trim()) return null;
  const value = ref.trim();
  if (value.includes('\0') || value.startsWith('/')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  const ownerDir = nodePath.posix.dirname(ownerFile);
  const joined = ownerDir === '.' ? value : `${ownerDir}/${value}`;
  const normalized = nodePath.posix.normalize(joined).replace(/^\.\//, '');
  if (!normalized || normalized === '.' || normalized.startsWith('../')) return null;
  if (normalized.split('/').some((segment) => segment === '..' || segment === '.')) return null;
  return normalized;
}

function roleForExportManifestFile(
  file: any,
  refs: {
    entryFile: string | null;
    artifactNames: Set<string>;
    supportingNames: Set<string>;
  },
) {
  if (file.name === refs.entryFile) return 'entry';
  if (refs.artifactNames.has(file.name)) return 'artifact';
  if (refs.supportingNames.has(file.name)) return 'supporting';
  if (file.kind === 'image' || file.kind === 'video' || file.kind === 'audio') return 'asset';
  if (file.kind === 'code' || file.kind === 'text') return 'source';
  return 'other';
}

export interface RegisterFinalizeRoutesDeps extends RouteDeps<'db' | 'http' | 'paths' | 'projectStore' | 'validation' | 'finalize'> {}

export function registerFinalizeRoutes(app: Express, ctx: RegisterFinalizeRoutesDeps) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { PROJECTS_DIR, DESIGN_SYSTEMS_DIR } = ctx.paths;
  const { getProject } = ctx.projectStore;
  const { isSafeId, validateExternalApiBaseUrl } = ctx.validation;
  const {
    defaultBaseUrlForFinalizeProtocol,
    finalizeDesignPackage,
    FinalizePackageLockedError,
    FinalizeUpstreamError,
    isFinalizeProviderProtocol,
    redactSecrets,
  } = ctx.finalize;
  app.post('/api/projects/:id/finalize/:provider', async (req, res) => {
    const { apiKey, baseUrl, model, maxTokens, apiVersion, protocol: bodyProtocol, reasoningExecution } = req.body || {};
    try {
      // Centralized path-traversal guard. `isSafeId` (apps/daemon/src/projects.ts)
      // rejects pure-dot ids (`.`, `..`, etc.) which would otherwise pass
      // the char-class regex and resolve to the parent directory under
      // path.join. Express decodes percent-encoded `%2e%2e` to `..` before
      // we see it, so this check covers both URL-supplied and stored-row
      // attack vectors.
      if (!isSafeId(req.params.id)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid project id');
      }

      const protocol = req.params.provider;
      if (!isFinalizeProviderProtocol(protocol)) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          'provider must be one of anthropic|openai|azure|google|ollama',
        );
      }
      if (bodyProtocol !== undefined && bodyProtocol !== protocol) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'body protocol must match route provider');
      }

      if (typeof apiKey !== 'string' || !apiKey.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'apiKey is required');
      }
      if (typeof model !== 'string' || !model.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'model is required');
      }
      let effectiveBaseUrl = defaultBaseUrlForFinalizeProtocol(protocol);
      if (baseUrl !== undefined) {
        if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
          return sendApiError(res, 400, 'BAD_REQUEST', 'baseUrl must be a non-empty string when provided');
        }
        effectiveBaseUrl = baseUrl.trim();
      }
      if (!effectiveBaseUrl) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'baseUrl is required for this provider');
      }
      const validated = await validateExternalApiBaseUrl(effectiveBaseUrl);
      if (validated.error) {
        return sendApiError(
          res,
          validated.forbidden ? 403 : 400,
          validated.forbidden ? 'FORBIDDEN' : 'BAD_REQUEST',
          validated.error,
        );
      }
      const reasoningDenial = authorizeReasoningEgress({
        policy: reasoningExecution,
        routeKind: 'finalize',
        provider: protocol,
        resolvedBaseUrl: effectiveBaseUrl,
        model,
      });
      if (reasoningDenial) return sendReasoningEgressDenial(res, reasoningDenial);
      if (maxTokens !== undefined && (typeof maxTokens !== 'number' || maxTokens <= 0)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'maxTokens must be a positive number when provided');
      }
      if (apiVersion !== undefined && typeof apiVersion !== 'string') {
        return sendApiError(res, 400, 'BAD_REQUEST', 'apiVersion must be a string when provided');
      }

      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }

      const finalizeAbort = new AbortController();
      const abortFromRequest = (): void => {
        if (!finalizeAbort.signal.aborted) finalizeAbort.abort();
      };
      res.on('close', abortFromRequest);

      let result;
      try {
        result = await finalizeDesignPackage(
          db,
          PROJECTS_DIR,
          DESIGN_SYSTEMS_DIR,
          req.params.id,
          {
            protocol,
            apiKey,
            baseUrl: effectiveBaseUrl,
            model,
            maxTokens,
            ...(typeof apiVersion === 'string' && apiVersion.trim()
              ? { apiVersion: apiVersion.trim() }
              : {}),
            signal: finalizeAbort.signal,
          },
        );
      } finally {
        res.off('close', abortFromRequest);
      }
      res.json(result);
    } catch (err: any) {
      // Concurrent finalize - the lockfile was already held by another
      // call. Caller can retry after a short wait; not a client error.
      // Maps to the shared CONFLICT code per @lefarcen P2 on PR #832.
      if (err instanceof FinalizePackageLockedError) {
        return sendApiError(res, 409, 'CONFLICT', err.message);
      }

      // Upstream provider error - status-aware mapping using shared
      // ApiErrorCode values. Run the raw upstream body through
      // redactSecrets so the API key cannot leak even if the provider
      // echoes the inbound headers. Codes per @lefarcen P2 on PR #832:
      // 401 -> UNAUTHORIZED, 429 -> RATE_LIMITED, others -> UPSTREAM_UNAVAILABLE.
      if (err instanceof FinalizeUpstreamError) {
        const safeDetails = redactSecrets(err.rawText || '', [apiKey]);
        const init = safeDetails ? { details: safeDetails } : {};
        if (err.status === 401) {
          return sendApiError(res, 401, 'UNAUTHORIZED', err.message, init);
        }
        if (err.status === 429) {
          return sendApiError(res, 429, 'RATE_LIMITED', err.message, init);
        }
        return sendApiError(res, 502, 'UPSTREAM_UNAVAILABLE', err.message, init);
      }

      // The blocking call hit our 120s AbortController timeout - or the
      // caller passed an already-aborted signal. Either way, surface as
      // 503 with the shared UPSTREAM_UNAVAILABLE code (no dedicated
      // TIMEOUT code in the contracts ApiErrorCode union).
      const errName =
        err && typeof err === 'object' && 'name' in err ? (err as { name?: unknown }).name : '';
      if (errName === 'AbortError') {
        return sendApiError(res, 503, 'UPSTREAM_UNAVAILABLE', 'finalize timed out');
      }

      // Unexpected runtime failure (file IO, db access, prompt build).
      // Log via console.error per the daemon convention; client sees a
      // generic 500 with the shared INTERNAL_ERROR code. Run the message
      // through redactSecrets defensively.
      console.error('[finalize]', err);
      const safeMsg = redactSecrets(String(err?.message || err), [apiKey]);
      return sendApiError(res, 500, 'INTERNAL_ERROR', safeMsg);
    }
  });

}
