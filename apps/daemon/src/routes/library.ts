// OD Library HTTP surface.
//
// Three classes of caller:
//   - The OD web UI (loopback / same-origin): list, detail, raw, delete,
//     pairing start, connection status, live events.
//   - The browser extension (cross-origin `chrome-extension://…`, library
//     token): ingest. Its origin is allowlisted at pairing time so the
//     global `/api` origin middleware lets the POST through.
//   - The pairing handshake (`/pair/confirm`): reachable from the not-yet-
//     allowlisted extension origin, gated by the short-lived pairing code.
//
// Routes that mutate stay token- or loopback-gated; reads ride the daemon's
// loopback binding + same-origin middleware like the rest of `/api`.

import { createReadStream } from 'node:fs';
import { copyFile, readFile, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import type {
  LibraryAsset,
  LibraryAssetFilter,
  LibraryAssetKind,
  LibraryEditAsPageResponse,
  LibrarySourceKind,
} from '@open-design/contracts';
import { LIBRARY_UPLOAD_MAX_BYTES, isLibraryUploadMimeAllowed } from '@open-design/contracts';
import type { RouteDeps } from '../server-context.js';
import {
  addLibraryAssetSource,
  deleteLibraryAsset,
  getLibraryAsset,
  listLibraryAssets,
  updateLibraryAsset,
  type LibraryAssetRecord,
} from '../library-store.js';
import {
  detectMime,
  extForMime,
  registerLibraryAsset,
  resolveAssetBytesPath,
  resolveAssetElementSidecarPath,
  resolveAssetFigmaSidecarPath,
  writeElementSidecar,
  writeFigmaSidecar,
} from '../library.js';
import { reconcileLibrary, type ReconcileLibraryResult } from '../library-sync.js';
import { fetchExternalBrandAsset } from '../brands/safe-fetch.js';
import { ensureProjectSubdir } from '../projects.js';
import {
  confirmPairing,
  libraryConnectionStatus,
  startPairing,
  validateLibraryToken,
} from '../library-tokens.js';

export interface RegisterLibraryRoutesDeps
  extends RouteDeps<
    'db' | 'http' | 'paths' | 'projectStore' | 'projectFiles' | 'conversations' | 'auth'
  > {}

const MAX_REMOTE_BYTES = 25 * 1024 * 1024;

/** Strip the internal absolute `filePath` before returning an asset to a client. */
function toPublicAsset(record: LibraryAssetRecord): LibraryAsset {
  const { filePath: _filePath, ...rest } = record;
  return rest;
}

function bearerToken(req: Request): string | undefined {
  const header = req.get('authorization') ?? '';
  return /^Bearer\s+(.+)$/i.exec(header.trim())?.[1];
}

/**
 * Echo an extension Origin back as the CORS allow-origin. MV3 service-worker
 * fetches with host_permissions bypass CORS, but desktop/Firefox paths and
 * preflights are happier with an explicit allow-origin, so set it whenever the
 * caller presents an extension origin.
 */
function applyExtensionCors(req: Request, res: Response): void {
  const origin = req.get('origin');
  if (origin && (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
}

/** A filesystem-safe `<title>.od-figma.json` download name for a capture. */
function figmaDownloadName(asset: LibraryAssetRecord): string {
  const raw = (asset.sourceTitle || asset.sourceDomain || 'capture').slice(0, 60);
  const slug = raw.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'capture';
  return `${slug}.od-figma.json`;
}

function parseDataUrl(dataUrl: string): { bytes: Buffer; mime: string | undefined } | null {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] || undefined;
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? '';
  const bytes = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8');
  return { bytes, mime };
}

async function fetchRemoteBytes(url: string): Promise<{ bytes: Buffer; mime: string | undefined }> {
  // Route the client-supplied URL through the same SSRF guard the brand-asset
  // path uses (assertPublicBrandUrl): reject cloud-metadata (169.254.169.254),
  // loopback, RFC1918/CGNAT, and link-local hosts, re-validating on every
  // redirect hop (redirect:'manual'). Without this a caller could make the
  // privileged daemon fetch an internal/loopback URL and read the response back
  // via GET /api/library/assets/:id/raw — SSRF + response exfiltration. Sibling
  // to the loopback-SSRF class in #5478.
  const resp = await fetchExternalBrandAsset(url);
  if (!resp.ok) throw new Error(`remote fetch failed: ${resp.status}`);
  const declared = Number(resp.headers.get('content-length') ?? '0');
  if (declared && declared > MAX_REMOTE_BYTES) throw new Error('remote resource too large');
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length > MAX_REMOTE_BYTES) throw new Error('remote resource too large');
  const mime = resp.headers.get('content-type')?.split(';')[0]?.trim() || undefined;
  return { bytes: buf, mime };
}

/**
 * Stream a file to the HTTP response with an `error` handler on the read stream.
 * `.pipe()` does NOT forward the source's errors, so without this a mid-stream
 * read failure (file deleted/truncated mid-read, EIO, an fd race) emits an
 * unhandled `error` on the Readable, which Node escalates to an uncaughtException
 * that takes the whole daemon down. On error we fall back to `onOpenError`
 * (a 404) when nothing has been written yet, else tear the response down.
 */
export function streamAssetFileToResponse(
  abs: string,
  res: Response,
  onOpenError: () => void,
): void {
  const stream = createReadStream(abs);
  stream.on('error', () => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    // The route sets success-only headers (Content-Type/-Length, Cache-Control,
    // Content-Disposition) before streaming. Strip them before the JSON error
    // fallback so a transient open/read failure isn't returned with stale asset
    // metadata — in particular the `max-age=3600` directive, which would cache
    // the 404 for an hour and mask the file once it becomes available again.
    for (const header of ['Cache-Control', 'Content-Disposition', 'Content-Type', 'Content-Length']) {
      res.removeHeader(header);
    }
    onOpenError();
  });
  stream.pipe(res);
}

export function registerLibraryRoutes(app: Express, ctx: RegisterLibraryRoutesDeps): void {
  const { db } = ctx;
  const { sendApiError, createSseResponse, requireLocalDaemonRequest, isLocalSameOrigin, resolvedPortRef } =
    ctx.http;
  const { LIBRARY_DIR, PROJECTS_DIR, USER_DESIGN_SYSTEMS_DIR } = ctx.paths;
  const { getProject, insertProject } = ctx.projectStore;
  const { writeProjectFile } = ctx.projectFiles;
  const { insertConversation } = ctx.conversations;
  const { authorizeToolRequest } = ctx.auth;

  // Copy an asset's bytes into a project (under a `library/` subdir) and record
  // the project usage as a source back-link. Shared by the loopback apply route
  // and the agent tool-token route.
  async function applyAssetToProject(
    asset: LibraryAssetRecord,
    projectId: string,
    sourceKind: LibrarySourceKind,
    dir?: string,
    includeElement = false,
  ): Promise<{ relPath: string; elementRelPath?: string }> {
    const bytesPath = resolveAssetBytesPath(asset, PROJECTS_DIR);
    if (!bytesPath) throw new Error('asset bytes not available');
    const project = getProject(db, projectId);
    if (!project) throw new Error('project not found');
    const subdir = dir && dir.trim() ? dir.trim() : 'library';
    const { absDir, relDir } = await ensureProjectSubdir(
      PROJECTS_DIR,
      projectId,
      subdir,
      project.metadata,
    );
    const stem = asset.contentHash.slice(0, 12);
    const ext = extForMime(asset.mime, undefined);
    const name = `${stem}${ext}`;
    await copyFile(bytesPath, path.join(absDir, name));
    addLibraryAssetSource(db, { assetId: asset.id, sourceKind, projectId });
    const relPath = relDir ? `${relDir}/${name}` : name;

    // Element-pick captures carry the picked node's outerHTML in a sidecar.
    // When requested, materialize it next to the screenshot so the element's
    // markup is consumable as a file (not just the flat image).
    let elementRelPath: string | undefined;
    if (includeElement) {
      const sidecar = resolveAssetElementSidecarPath(asset, LIBRARY_DIR);
      if (sidecar) {
        const elName = `${stem}.element.html`;
        try {
          await copyFile(sidecar, path.join(absDir, elName));
          elementRelPath = relDir ? `${relDir}/${elName}` : elName;
        } catch {
          // No stored markup (older capture / missing sidecar) — image only.
        }
      }
    }
    return elementRelPath ? { relPath, elementRelPath } : { relPath };
  }

  // Reconcile design systems + agent project deliverables into the Library as
  // referenced rows. Throttled so opening the Library (which lists assets) keeps
  // it current without re-scanning on every keystroke-driven re-fetch; a single
  // in-flight pass is shared by concurrent callers. `force` (the Sync button /
  // `od library sync`) bypasses the throttle.
  const RECONCILE_THROTTLE_MS = 10_000;
  let lastReconcileAt = 0;
  let reconcileInFlight: Promise<ReconcileLibraryResult> | null = null;
  const EMPTY_RECONCILE: ReconcileLibraryResult = {
    designSystems: 0,
    projectAssets: 0,
    deduped: 0,
    total: 0,
  };
  async function runReconcile(force: boolean): Promise<ReconcileLibraryResult> {
    if (reconcileInFlight) return reconcileInFlight;
    if (!force && Date.now() - lastReconcileAt < RECONCILE_THROTTLE_MS) {
      return EMPTY_RECONCILE;
    }
    reconcileInFlight = reconcileLibrary(db, {
      LIBRARY_DIR,
      PROJECTS_DIR,
      USER_DESIGN_SYSTEMS_DIR,
    }).finally(() => {
      lastReconcileAt = Date.now();
      reconcileInFlight = null;
    });
    return reconcileInFlight;
  }

  // Live ingest/enrichment feed. Clipper captures flow through this route, so
  // the web grid can update without polling.
  const sseClients = new Set<(event: string, data: unknown) => void>();
  const emit = (event: string, data: unknown) => {
    for (const send of sseClients) {
      try {
        send(event, data);
      } catch {
        // a dead client must not block the rest
      }
    }
  };

  // --- pairing -------------------------------------------------------------

  // Loopback-only: the OD UI mints a pairing code to show the user.
  app.post('/api/library/pair', requireLocalDaemonRequest, (_req, res) => {
    const { code, expiresAt } = startPairing();
    res.json({ code, expiresAt });
  });

  // Reachable from the (not-yet-allowlisted) extension origin — gated by the
  // pairing code. server.ts exempts this exact path from the global origin
  // middleware. CORS preflight handled below.
  app.options('/api/library/pair/confirm', (req, res) => {
    applyExtensionCors(req, res);
    res.status(204).end();
  });
  app.post('/api/library/pair/confirm', (req, res) => {
    applyExtensionCors(req, res);
    const body = req.body ?? {};
    const code = String(body.code ?? '');
    const extensionOrigin = String(body.extensionOrigin ?? '');
    if (!code || !extensionOrigin) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'code and extensionOrigin are required');
    }
    const result = confirmPairing(db, { code, extensionOrigin, label: body.label });
    if (!result.ok) {
      return sendApiError(res, 401, 'PAIRING_FAILED', result.error);
    }
    res.json({ token: result.token, label: result.label });
  });

  // Loopback-only: web UI connection status.
  app.get('/api/library/connection', requireLocalDaemonRequest, (_req, res) => {
    res.json(libraryConnectionStatus(db));
  });

  // --- ingest --------------------------------------------------------------

  app.options('/api/library/ingest', (req, res) => {
    applyExtensionCors(req, res);
    res.status(204).end();
  });
  app.post('/api/library/ingest', async (req, res) => {
    applyExtensionCors(req, res);
    // Trusted callers, no pairing required. A browser-extension origin can only
    // be presented by a locally-installed extension reaching the loopback
    // daemon (a web page cannot forge it), so it's trusted as 'clipper'. The
    // local CLI / web UI (loopback / same-origin) → 'manual-upload'. A legacy
    // library token, if one is still present, also counts as 'clipper'.
    const origin = req.get('origin') ?? '';
    const isExtensionOrigin =
      origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://');
    let sourceKind: LibrarySourceKind;
    if (isExtensionOrigin || validateLibraryToken(db, bearerToken(req)).ok) {
      sourceKind = 'clipper';
    } else if (isLocalSameOrigin(req, resolvedPortRef.current)) {
      sourceKind = 'manual-upload';
    } else {
      return sendApiError(
        res,
        401,
        'LIBRARY_INGEST_FORBIDDEN',
        'ingest must come from the local UI/CLI or the browser extension',
      );
    }

    const body = req.body ?? {};
    let bytes: Buffer | undefined;
    let mime: string | undefined = typeof body.mime === 'string' ? body.mime : undefined;
    const text = typeof body.text === 'string' ? body.text : undefined;
    const filename = typeof body.filename === 'string' ? body.filename : undefined;

    // Clipper page captures may ship an OD Figma capture IR (a JSON node-tree)
    // alongside the HTML. It is stored as a sidecar of the HTML asset and a
    // marker is stamped onto the asset metadata so the Library can offer a
    // Figma export. The daemon never parses the (potentially large) IR — the
    // clipper supplies the node count.
    const figmaIr =
      typeof body.figmaCapture === 'string' && body.figmaCapture ? body.figmaCapture : undefined;
    const figmaMeta = figmaIr
      ? {
          version: 1,
          size: Buffer.byteLength(figmaIr, 'utf8'),
          nodeCount: Number.isFinite(body.figmaNodeCount) ? Number(body.figmaNodeCount) : 0,
        }
      : undefined;
    const reqMetadata =
      body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : undefined;
    const metadata =
      reqMetadata || figmaMeta
        ? { ...(reqMetadata ?? {}), ...(figmaMeta ? { figmaCapture: figmaMeta } : {}) }
        : undefined;
    // Element-pick captures ship the element's outerHTML; it is stored as a
    // sidecar of the screenshot (the summary travels in metadata.element).
    const elementHtml =
      typeof body.elementHtml === 'string' && body.elementHtml ? body.elementHtml : undefined;

    try {
      if (typeof body.dataUrl === 'string') {
        const parsed = parseDataUrl(body.dataUrl);
        if (!parsed) return sendApiError(res, 400, 'BAD_REQUEST', 'invalid dataUrl');
        bytes = parsed.bytes;
        mime = mime ?? parsed.mime;
      } else if (typeof body.url === 'string') {
        const fetched = await fetchRemoteBytes(body.url);
        bytes = fetched.bytes;
        mime = mime ?? fetched.mime;
      } else if (text === undefined) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'one of dataUrl, url, or text is required');
      }
    } catch (err) {
      return sendApiError(res, 502, 'INGEST_FETCH_FAILED', err instanceof Error ? err.message : String(err));
    }

    // Manual uploads (local web UI / `od library import`) are restricted to a
    // safe inline size and design-relevant formats — images, fonts, text/HTML,
    // and JSON/design data. Audio, video, and other binaries are turned away.
    // Clipper captures are exempt: the extension curates its own payloads
    // (including page video) and arrives on a trusted extension origin. Text-
    // only payloads are always a text-family asset, so they skip the check.
    if (sourceKind === 'manual-upload' && bytes) {
      if (bytes.length > LIBRARY_UPLOAD_MAX_BYTES) {
        return sendApiError(
          res,
          413,
          'PAYLOAD_TOO_LARGE',
          `file is too large to upload (max ${Math.round(LIBRARY_UPLOAD_MAX_BYTES / 1_000_000)} MB)`,
        );
      }
      const effectiveMime = mime ?? detectMime(bytes, filename);
      if (!isLibraryUploadMimeAllowed(effectiveMime, filename)) {
        return sendApiError(
          res,
          415,
          'UNSUPPORTED_MEDIA_TYPE',
          'this file type cannot be uploaded to the Library — images, fonts, text, HTML, and JSON/design data only',
        );
      }
    }

    try {
      const result = await registerLibraryAsset({
        db,
        libraryDir: LIBRARY_DIR,
        storage: 'owned',
        bytes,
        text,
        kind: typeof body.kind === 'string' ? (body.kind as LibraryAssetKind) : undefined,
        mime,
        filename,
        sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : undefined,
        sourceTitle: typeof body.sourceTitle === 'string' ? body.sourceTitle : undefined,
        tags: Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : undefined,
        metadata,
        source: { sourceKind },
      });

      // Persist derived sidecars (idempotent overwrite). On dedup the registrar
      // ignores `metadata`, so stamp the marker explicitly when an existing
      // asset gains a capture it didn't have before.
      let assetRecord = result.asset;
      if (figmaIr) {
        await writeFigmaSidecar(LIBRARY_DIR, assetRecord.contentHash, figmaIr);
        if (result.deduped && !assetRecord.metadata?.figmaCapture && figmaMeta) {
          updateLibraryAsset(db, assetRecord.id, {
            metadata: { ...(assetRecord.metadata ?? {}), figmaCapture: figmaMeta },
          });
          assetRecord = getLibraryAsset(db, assetRecord.id) ?? assetRecord;
        }
      }
      if (elementHtml) {
        await writeElementSidecar(LIBRARY_DIR, assetRecord.contentHash, elementHtml);
        if (result.deduped && !assetRecord.metadata?.element && reqMetadata?.element) {
          updateLibraryAsset(db, assetRecord.id, {
            metadata: { ...(assetRecord.metadata ?? {}), element: reqMetadata.element },
          });
          assetRecord = getLibraryAsset(db, assetRecord.id) ?? assetRecord;
        }
      }

      const asset = toPublicAsset(assetRecord);
      emit('ingest', { assetId: asset.id, deduped: result.deduped });
      res.json({ asset, taskId: result.taskId, deduped: result.deduped });
    } catch (err) {
      return sendApiError(res, 500, 'INGEST_FAILED', err instanceof Error ? err.message : String(err));
    }
  });

  app.get('/api/library/clipper-probe', (_req, res) => {
    res.json({ ok: true });
  });

  // --- assets --------------------------------------------------------------

  app.get('/api/library/assets', async (req, res) => {
    // Keep the Library current with design systems / agent output before
    // listing, so an opened grid already shows them. Throttled + best-effort —
    // never blocks the list on a reconcile error.
    await runReconcile(false).catch(() => {});
    const q = req.query;
    const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length ? v : undefined);
    // Build conditionally — exactOptionalPropertyTypes rejects explicit
    // `undefined` on the optional filter fields.
    const filter: LibraryAssetFilter = {};
    if (str(q.kind)) filter.kind = str(q.kind) as LibraryAssetKind;
    if (str(q.tag)) filter.tag = str(q.tag)!;
    if (str(q.domain)) filter.domain = str(q.domain)!;
    if (str(q.date)) filter.date = str(q.date)!;
    if (str(q.q)) filter.q = str(q.q)!;
    if (str(q.source)) filter.source = str(q.source) as LibrarySourceKind;
    if (str(q.projectId)) filter.projectId = str(q.projectId)!;
    if (str(q.designSystemId)) filter.designSystemId = str(q.designSystemId)!;
    if (q.limit) filter.limit = Number(q.limit);
    const assets = listLibraryAssets(db, filter).map(toPublicAsset);
    res.json({ assets });
  });

  // Force a full reconcile pass (the web "Sync" button + `od library sync`).
  // Backfills design systems and agent deliverables that predate this feature,
  // and is the explicit "pull in everything now" entry point. Loopback-only.
  app.post('/api/library/sync', requireLocalDaemonRequest, async (_req, res) => {
    try {
      const summary = await runReconcile(true);
      res.json(summary);
    } catch (err) {
      return sendApiError(res, 500, 'LIBRARY_SYNC_FAILED', err instanceof Error ? err.message : String(err));
    }
  });

  app.get('/api/library/assets/:id', (req, res) => {
    const asset = getLibraryAsset(db, req.params.id);
    if (!asset) return sendApiError(res, 404, 'NOT_FOUND', 'asset not found');
    res.json({ asset: toPublicAsset(asset) });
  });

  app.delete('/api/library/assets/:id', requireLocalDaemonRequest, async (req, res) => {
    const asset = getLibraryAsset(db, req.params.id);
    if (!asset) return sendApiError(res, 404, 'NOT_FOUND', 'asset not found');
    // Only unlink bytes we own and that live under LIBRARY_DIR.
    if (asset.storage === 'owned' && asset.filePath) {
      const abs = path.resolve(asset.filePath);
      if (abs.startsWith(path.resolve(LIBRARY_DIR))) {
        await unlink(abs).catch(() => {});
      }
    }
    deleteLibraryAsset(db, asset.id);
    emit('delete', { assetId: asset.id });
    res.json({ ok: true });
  });

  app.get('/api/library/assets/:id/raw', async (req, res) => {
    const asset = getLibraryAsset(db, req.params.id);
    if (!asset) return sendApiError(res, 404, 'NOT_FOUND', 'asset not found');
    const abs = resolveAssetBytesPath(asset, PROJECTS_DIR);
    if (!abs) return sendApiError(res, 404, 'NOT_FOUND', 'asset bytes not available');
    try {
      const info = await stat(abs);
      if (!info.isFile()) return sendApiError(res, 404, 'NOT_FOUND', 'asset bytes not available');
      res.setHeader('Content-Type', asset.mime ?? 'application/octet-stream');
      res.setHeader('Content-Length', String(info.size));
      res.setHeader('Cache-Control', 'private, max-age=3600');
      streamAssetFileToResponse(abs, res, () =>
        sendApiError(res, 404, 'NOT_FOUND', 'asset bytes not available'),
      );
    } catch {
      return sendApiError(res, 404, 'NOT_FOUND', 'asset bytes not available');
    }
  });

  // --- figma capture export ------------------------------------------------
  // Serve the OD Figma capture IR sidecar (clipper-captured `html` assets) as a
  // downloadable JSON, importable via the OD Figma plugin. Reads ride loopback
  // same-origin like /raw; the clipper downloads its own captures directly.
  app.get('/api/library/assets/:id/figma', async (req, res) => {
    const asset = getLibraryAsset(db, req.params.id);
    if (!asset) return sendApiError(res, 404, 'NOT_FOUND', 'asset not found');
    const sidecar = resolveAssetFigmaSidecarPath(asset, LIBRARY_DIR);
    if (!sidecar) return sendApiError(res, 404, 'NOT_FOUND', 'no figma capture for this asset');
    try {
      const info = await stat(sidecar);
      if (!info.isFile()) return sendApiError(res, 404, 'NOT_FOUND', 'no figma capture for this asset');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Length', String(info.size));
      res.setHeader('Content-Disposition', `attachment; filename="${figmaDownloadName(asset)}"`);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      streamAssetFileToResponse(sidecar, res, () =>
        sendApiError(res, 404, 'NOT_FOUND', 'no figma capture for this asset'),
      );
    } catch {
      return sendApiError(res, 404, 'NOT_FOUND', 'no figma capture for this asset');
    }
  });

  // --- captured element markup --------------------------------------------
  // Serve the outerHTML sidecar of an element-pick screenshot. Read on demand
  // by the Library preview's "Element HTML" panel.
  app.get('/api/library/assets/:id/element', async (req, res) => {
    const asset = getLibraryAsset(db, req.params.id);
    if (!asset) return sendApiError(res, 404, 'NOT_FOUND', 'asset not found');
    const sidecar = resolveAssetElementSidecarPath(asset, LIBRARY_DIR);
    if (!sidecar) return sendApiError(res, 404, 'NOT_FOUND', 'no element markup for this asset');
    try {
      const info = await stat(sidecar);
      if (!info.isFile()) return sendApiError(res, 404, 'NOT_FOUND', 'no element markup for this asset');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Length', String(info.size));
      res.setHeader('Cache-Control', 'private, max-age=3600');
      streamAssetFileToResponse(sidecar, res, () =>
        sendApiError(res, 404, 'NOT_FOUND', 'no element markup for this asset'),
      );
    } catch {
      return sendApiError(res, 404, 'NOT_FOUND', 'no element markup for this asset');
    }
  });

  // --- apply to project (web / Insert from Library) ------------------------

  app.post('/api/library/assets/:id/apply', requireLocalDaemonRequest, async (req, res) => {
    const asset = getLibraryAsset(db, req.params.id);
    if (!asset) return sendApiError(res, 404, 'NOT_FOUND', 'asset not found');
    const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId : '';
    if (!projectId) return sendApiError(res, 400, 'BAD_REQUEST', 'projectId is required');
    try {
      const includeElement = req.body?.includeElement === true;
      const result = await applyAssetToProject(asset, projectId, 'manual-upload', req.body?.dir, includeElement);
      res.json({
        relPath: result.relPath,
        ...(result.elementRelPath ? { elementRelPath: result.elementRelPath } : {}),
      });
    } catch (err) {
      return sendApiError(res, 500, 'APPLY_FAILED', err instanceof Error ? err.message : String(err));
    }
  });

  // --- edit as page (clipper capture → editable OD project) ----------------
  // Turn a captured `html` asset into a brand-new project whose `index.html`
  // is the captured page, seed a conversation, and back-link the asset to the
  // new project. The web client then opens the project on `index.html` so the
  // user can edit it (srcDoc bridge + agent surgical edits) right away. This is
  // the clipper "capture → editable OD page" exit, driven from the Library.
  app.post('/api/library/assets/:id/edit-as-page', requireLocalDaemonRequest, async (req, res) => {
    const asset = getLibraryAsset(db, req.params.id);
    if (!asset) return sendApiError(res, 404, 'NOT_FOUND', 'asset not found');
    if (asset.kind !== 'html') {
      return sendApiError(res, 400, 'NOT_HTML', 'only html captures can be opened as an editable page');
    }
    const bytesPath = resolveAssetBytesPath(asset, PROJECTS_DIR);
    if (!bytesPath) return sendApiError(res, 404, 'NOT_FOUND', 'asset bytes not available');
    try {
      const html = await readFile(bytesPath, 'utf8');
      const now = Date.now();
      const projectId = randomUUID();
      const conversationId = randomUUID();
      const baseName = (asset.sourceTitle || asset.sourceDomain || 'Captured page').trim().slice(0, 80);
      // `prototype` keeps the new project in the design/canvas surface; the
      // back-link to the source asset rides on metadata so the asset's "Open
      // project" affordance can resolve it.
      const metadata = { kind: 'prototype', odLibraryAssetId: asset.id };
      insertProject(db, {
        id: projectId,
        name: baseName || 'Captured page',
        skillId: null,
        designSystemId: null,
        pendingPrompt: null,
        metadata,
        createdAt: now,
        updatedAt: now,
      });
      insertConversation(db, {
        id: conversationId,
        projectId,
        title: null,
        sessionMode: 'design',
        createdAt: now,
        updatedAt: now,
      });
      // writeProjectFile ensures the project dir; write the capture as the
      // editable entry file. No artifact manifest — a plain HTML file avoids
      // the publication/stub guards (a captured page is arbitrary markup) while
      // still rendering and editing like any project HTML.
      await writeProjectFile(PROJECTS_DIR, projectId, 'index.html', Buffer.from(html, 'utf8'), {}, metadata);
      addLibraryAssetSource(db, { assetId: asset.id, sourceKind: 'manual-upload', projectId });
      const body: LibraryEditAsPageResponse = { projectId, conversationId, relPath: 'index.html' };
      res.json(body);
    } catch (err) {
      return sendApiError(res, 500, 'EDIT_AS_PAGE_FAILED', err instanceof Error ? err.message : String(err));
    }
  });

  // --- agent tool track (tool-token) ---------------------------------------
  // Lets a chat agent search and apply library assets mid-task. Mirrors the
  // /api/tools/media/* authorizer shape.

  app.post('/api/tools/library/search', async (req, res) => {
    const grant = authorizeToolRequest(req, res, 'library:search');
    if (!grant) return;
    const body = req.body ?? {};
    const filter: LibraryAssetFilter = {};
    if (typeof body.query === 'string' && body.query.trim()) filter.q = body.query.trim();
    if (typeof body.kind === 'string') filter.kind = body.kind as LibraryAssetKind;
    if (typeof body.date === 'string') filter.date = body.date;
    filter.limit = Number.isFinite(body.limit) ? Number(body.limit) : 20;
    const results = listLibraryAssets(db, filter).map((asset) => ({ asset: toPublicAsset(asset), score: 0 }));
    res.json({ results, semantic: false });
  });

  app.post('/api/tools/library/apply', async (req, res) => {
    const grant = authorizeToolRequest(req, res, 'library:apply');
    if (!grant) return;
    const assetId = typeof req.body?.assetId === 'string' ? req.body.assetId : '';
    if (!assetId) return sendApiError(res, 400, 'BAD_REQUEST', 'assetId is required');
    const asset = getLibraryAsset(db, assetId);
    if (!asset) return sendApiError(res, 404, 'NOT_FOUND', 'asset not found');
    const projectId = grant.projectId ?? (typeof req.body?.projectId === 'string' ? req.body.projectId : '');
    if (!projectId) return sendApiError(res, 400, 'BAD_REQUEST', 'projectId is required');
    try {
      const includeElement = req.body?.includeElement === true;
      const result = await applyAssetToProject(asset, projectId, 'agent-task', req.body?.dir, includeElement);
      res.json({
        relPath: result.relPath,
        ...(result.elementRelPath ? { elementRelPath: result.elementRelPath } : {}),
      });
    } catch (err) {
      return sendApiError(res, 500, 'APPLY_FAILED', err instanceof Error ? err.message : String(err));
    }
  });

  // --- live events ---------------------------------------------------------

  app.get('/api/library/events', (req, res) => {
    const sse = createSseResponse(res);
    const listener = (event: string, data: unknown) => sse.send(event, data);
    sseClients.add(listener);
    sse.send('ready', { ok: true });
    req.on('close', () => {
      sseClients.delete(listener);
      sse.cleanup();
    });
  });
}
