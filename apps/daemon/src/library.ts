// OD Library orchestration — the single registration hook every ingest point
// calls, plus content-addressed owned storage and the programmatic enrichment
// layer (mime / size / image dimensions / derived tags).
//
// `registerLibraryAsset` is idempotent by content hash: the same bytes seen
// twice collapse to one asset row, and each call appends a source record so
// "this image was used in two tasks" becomes one asset with two back-links.
// It must never throw into a caller's main flow — every existing ingest point
// wraps it best-effort.
//
// AI enrichment (caption / OCR / embedding) is intentionally out of this first
// slice: the recorded enrichment task marks those stages `skipped` so the UI
// can later offer a reindex once a model is configured.

import type Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  LibraryAssetKind,
  LibraryStorage,
  LibrarySourceKind,
} from '@open-design/contracts';
import {
  addLibraryAssetSource,
  findLibraryAssetByHash,
  getLibraryAsset,
  insertLibraryAsset,
  insertLibraryTask,
  updateLibraryAsset,
  type LibraryAssetRecord,
} from './library-store.js';

type SqliteDb = Database.Database;

export function libraryObjectsDir(libraryDir: string): string {
  return path.join(libraryDir, 'objects');
}

/** Content-addressed path: <library>/objects/<hh>/<hash><ext>. */
export function libraryObjectPath(libraryDir: string, contentHash: string, ext: string): string {
  const shard = contentHash.slice(0, 2);
  return path.join(libraryObjectsDir(libraryDir), shard, `${contentHash}${ext}`);
}

// Sidecars live next to an owned content-addressed object, keyed by the same
// content hash with a distinguishing suffix. They hold derived data that should
// not bloat the asset row / list responses (the clipper's Figma capture IR and
// the picked-element outerHTML).
function resolveAssetSidecarPath(
  asset: LibraryAssetRecord,
  libraryDir: string,
  ext: string,
): string | null {
  if (asset.storage !== 'owned' || !asset.contentHash) return null;
  return libraryObjectPath(libraryDir, asset.contentHash, ext);
}

/** Write a sidecar next to an owned object. Best-effort, never throws. */
async function writeAssetSidecar(
  libraryDir: string,
  contentHash: string,
  ext: string,
  content: string,
): Promise<boolean> {
  try {
    const sidecar = libraryObjectPath(libraryDir, contentHash, ext);
    await mkdir(path.dirname(sidecar), { recursive: true });
    await writeFile(sidecar, content, 'utf8');
    return true;
  } catch {
    return false;
  }
}

const FIGMA_SIDECAR_EXT = '.od-figma.json';
const ELEMENT_SIDECAR_EXT = '.element.html';

/**
 * OD Figma capture IR sidecar for an owned `html` asset. The clipper produces
 * the IR (a JSON node-tree, see `figma-plugin/IR.md`) from the live page at
 * capture time; it lives next to the HTML object so the Library can export it
 * as Figma import JSON without re-rendering. Keyed by the HTML asset's content hash.
 */
export function resolveAssetFigmaSidecarPath(
  asset: LibraryAssetRecord,
  libraryDir: string,
): string | null {
  return resolveAssetSidecarPath(asset, libraryDir, FIGMA_SIDECAR_EXT);
}

/** Write a Figma IR sidecar next to an owned object. Best-effort, never throws. */
export function writeFigmaSidecar(libraryDir: string, contentHash: string, ir: string): Promise<boolean> {
  return writeAssetSidecar(libraryDir, contentHash, FIGMA_SIDECAR_EXT, ir);
}

/**
 * Picked-element `outerHTML` sidecar for an owned screenshot asset produced by
 * the clipper's element picker. Keeps potentially large markup out of the asset
 * row; the lightweight summary stays in `metadata.element`.
 */
export function resolveAssetElementSidecarPath(
  asset: LibraryAssetRecord,
  libraryDir: string,
): string | null {
  return resolveAssetSidecarPath(asset, libraryDir, ELEMENT_SIDECAR_EXT);
}

/** Write an element-HTML sidecar next to an owned object. Best-effort. */
export function writeElementSidecar(libraryDir: string, contentHash: string, html: string): Promise<boolean> {
  return writeAssetSidecar(libraryDir, contentHash, ELEMENT_SIDECAR_EXT, html);
}

/** Local `YYYY-MM-DD` for the daily archive feed. */
export function archivedDateFor(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const EXT_FOR_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'text/html': '.html',
  'text/plain': '.txt',
  'application/json': '.json',
};

export function extForMime(mime: string | undefined, filename?: string): string {
  if (filename) {
    const ext = path.extname(filename);
    if (ext) return ext.toLowerCase();
  }
  if (mime && EXT_FOR_MIME[mime]) return EXT_FOR_MIME[mime];
  return '.bin';
}

/** Magic-byte + filename-extension mime sniffing for the common cases. */
export function detectMime(bytes: Buffer, filename?: string): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  const head = bytes.toString('utf8', 0, Math.min(bytes.length, 256)).trimStart().toLowerCase();
  if (head.startsWith('<svg') || head.startsWith('<?xml')) return 'image/svg+xml';
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'text/html';
  if (filename) {
    const ext = path.extname(filename).toLowerCase();
    for (const [mime, candidate] of Object.entries(EXT_FOR_MIME)) {
      if (candidate === ext) return mime;
    }
  }
  return 'application/octet-stream';
}

export function kindForMime(mime: string): LibraryAssetKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('font/') || mime === 'application/font-woff') return 'font';
  if (mime === 'text/html') return 'html';
  if (mime.startsWith('text/')) return 'text';
  return 'image';
}

/** Best-effort raster dimensions for PNG / JPEG / GIF (no decode, no deps). */
export function sniffImageDimensions(bytes: Buffer): { width: number; height: number } | null {
  // PNG: IHDR width/height are big-endian uint32 at offset 16/20.
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  // GIF: logical screen descriptor at offset 6/8, little-endian uint16.
  if (bytes.length >= 10 && bytes.toString('ascii', 0, 3) === 'GIF') {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  // JPEG: walk segments to the first Start-Of-Frame marker.
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === undefined) break;
      // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC).
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      const segLen = bytes.readUInt16BE(offset + 2);
      if (segLen < 2) break;
      offset += 2 + segLen;
    }
  }
  return null;
}

function domainFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host || undefined;
  } catch {
    return undefined;
  }
}

function dedupeTags(tags: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = (raw ?? '').trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export interface RegisterLibrarySource {
  sourceKind: LibrarySourceKind;
  projectId?: string | undefined;
  conversationId?: string | undefined;
  runId?: string | undefined;
  designSystemId?: string | undefined;
  relPath?: string | undefined;
}

export interface RegisterLibraryAssetInput {
  db: SqliteDb;
  libraryDir: string;
  storage: LibraryStorage;
  source: RegisterLibrarySource;
  kind?: LibraryAssetKind | undefined;
  /** Owned: the raw bytes to store. */
  bytes?: Buffer | undefined;
  /** Referenced: an existing on-disk file (also read for hashing/dims). */
  absPath?: string | undefined;
  /** Text-like asset payload. */
  text?: string | undefined;
  mime?: string | undefined;
  filename?: string | undefined;
  sourceUrl?: string | undefined;
  sourceTitle?: string | undefined;
  tags?: string[] | undefined;
  /**
   * When the asset was originally captured/produced (unix ms). Drives
   * `capturedAt` + the `archivedDate` timeline bucket. Defaults to now; the
   * reconcile sync passes a design system's update time or a project file's
   * mtime so the timeline reflects when the artifact was made, not synced.
   */
  capturedAt?: number | undefined;
  /** referenced-only metadata. */
  originProjectId?: string | undefined;
  relPath?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface RegisterLibraryAssetResult {
  asset: LibraryAssetRecord;
  deduped: boolean;
  taskId?: string;
}

/** Append this ingest's source + tags onto an asset that already holds these
 * exact bytes (either a prior ingest, or a concurrent one that won the insert
 * race). This is the single idempotent-by-content-hash convergence point. */
function dedupIntoExistingAsset(
  db: SqliteDb,
  existing: LibraryAssetRecord,
  input: RegisterLibraryAssetInput,
): RegisterLibraryAssetResult {
  addLibraryAssetSource(db, { assetId: existing.id, ...input.source });
  if (input.tags && input.tags.length) {
    const merged = dedupeTags([...existing.tags, ...input.tags]);
    updateLibraryAsset(db, existing.id, { tags: merged });
  }
  const refreshed = getLibraryAsset(db, existing.id) ?? existing;
  return { asset: refreshed, deduped: true };
}

/** True when `err` is the UNIQUE(content_hash) constraint firing on insert. */
function isUniqueContentHashViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  const message = (err as { message?: unknown }).message;
  return (
    code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    (typeof message === 'string' &&
      message.includes('UNIQUE constraint failed') &&
      message.includes('content_hash'))
  );
}

/**
 * Index an asset into the library. Idempotent by content hash. Owned assets
 * are written content-addressed under LIBRARY_DIR; referenced assets only
 * store a pointer. Always appends a source record for the back-link graph.
 */
export async function registerLibraryAsset(
  input: RegisterLibraryAssetInput,
): Promise<RegisterLibraryAssetResult> {
  const { db, libraryDir } = input;

  let bytes = input.bytes ?? null;
  let mime = input.mime;
  if (!bytes && typeof input.text === 'string') {
    bytes = Buffer.from(input.text, 'utf8');
    if (!mime) mime = 'text/plain';
  }
  if (!bytes && input.absPath) {
    bytes = await readFile(input.absPath);
  }
  if (!bytes) {
    throw new Error('registerLibraryAsset requires bytes, text, or absPath');
  }

  const contentHash = createHash('sha256').update(bytes).digest('hex');

  // Dedup: same bytes already indexed → append source, union tags.
  const existing = findLibraryAssetByHash(db, contentHash);
  if (existing) {
    return dedupIntoExistingAsset(db, existing, input);
  }

  if (!mime) mime = detectMime(bytes, input.filename);
  const kind = input.kind ?? kindForMime(mime);
  const dims = kind === 'image' ? sniffImageDimensions(bytes) : null;
  const now = Date.now();
  // The artifact's own time (DS update / file mtime) when the caller supplies
  // it, so the timeline buckets by creation rather than sync time; else now.
  const capturedAt = Number.isFinite(input.capturedAt) ? Number(input.capturedAt) : now;
  const id = randomUUID();

  let filePath: string | undefined;
  if (input.storage === 'owned') {
    const ext = extForMime(mime, input.filename);
    filePath = libraryObjectPath(libraryDir, contentHash, ext);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
  } else {
    // referenced: the bytes already live somewhere; point at the existing file.
    filePath = input.absPath;
  }

  const domain = domainFromUrl(input.sourceUrl);
  const tags = dedupeTags([...(input.tags ?? []), domain]);

  try {
    insertLibraryAsset(db, {
      id,
      kind,
      storage: input.storage,
      sourceUrl: input.sourceUrl,
      sourceTitle: input.sourceTitle,
      sourceDomain: domain,
      capturedAt,
      archivedDate: archivedDateFor(capturedAt),
      filePath,
      originProjectId: input.originProjectId,
      relPath: input.relPath,
      mime,
      width: dims?.width,
      height: dims?.height,
      size: bytes.length,
      contentHash,
      tags,
      metadata: input.metadata,
    });
  } catch (err) {
    // A concurrent ingest of the same bytes won the UNIQUE(content_hash) race in
    // the window between our findLibraryAssetByHash SELECT above and this INSERT
    // (the `await mkdir`/`await writeFile` yield lets a sibling request slip
    // through the same not-found check). registerLibraryAsset is idempotent by
    // content hash, so fold into the dedup branch rather than surfacing a 500.
    if (isUniqueContentHashViolation(err)) {
      const winner = findLibraryAssetByHash(db, contentHash);
      if (winner) return dedupIntoExistingAsset(db, winner, input);
    }
    throw err;
  }
  addLibraryAssetSource(db, { assetId: id, ...input.source });

  const taskId = recordEnrichmentTask(db, id, kind);

  const asset = getLibraryAsset(db, id);
  if (!asset) throw new Error(`library asset vanished after insert: ${id}`);
  return { asset, deduped: false, taskId };
}

/**
 * Record the enrichment task. The programmatic layer (size / mime / dims /
 * tags) already ran inline above, so it lands `done`; the AI layer (caption /
 * OCR / embedding) is recorded `skipped` until a model is configured — a
 * future `od library reindex` can re-run it.
 */
function recordEnrichmentTask(db: SqliteDb, assetId: string, kind: LibraryAssetKind): string {
  const id = randomUUID();
  const now = Date.now();
  const progress = [
    'programmatic: hashed + sized + mime detected',
    kind === 'image' ? 'programmatic: image dimensions read' : 'programmatic: text/metadata captured',
    'ai: caption/ocr/embedding skipped (no model configured)',
  ];
  insertLibraryTask(db, {
    id,
    assetId,
    status: 'skipped',
    progress,
    error: null,
    startedAt: now,
    endedAt: now,
  });
  return id;
}

/**
 * Resolve the absolute on-disk path for an asset's raw bytes.
 * Owned assets store an absolute path; referenced assets resolve their
 * project-relative path against the projects root.
 */
export function resolveAssetBytesPath(
  asset: LibraryAssetRecord,
  projectsDir: string,
): string | null {
  if (asset.filePath && path.isAbsolute(asset.filePath)) return asset.filePath;
  if (asset.storage === 'referenced' && asset.originProjectId && asset.relPath) {
    return path.join(projectsDir, asset.originProjectId, asset.relPath);
  }
  if (asset.filePath) return asset.filePath;
  return null;
}
