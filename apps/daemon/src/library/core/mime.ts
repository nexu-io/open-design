/**
 * @module library/core/mime
 *
 * Pure, dependency-free media inspection for the OD Library: mime sniffing from
 * magic bytes / filename, extension mapping, Library-kind classification, and
 * best-effort raster dimensions. No SQLite, no filesystem, no siblings — this is
 * foundation the asset-orchestration layer builds on.
 */

import path from 'node:path';
import type { LibraryAssetKind } from '@open-design/contracts';

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

/**
 * File extension for a mime type, preferring an explicit filename extension.
 * @param mime - detected/declared mime type, if any.
 * @param filename - original filename whose extension wins when present.
 * @returns a dotted extension (e.g. `.png`), or `.bin` when unknown.
 */
export function extForMime(mime: string | undefined, filename?: string): string {
  if (filename) {
    const ext = path.extname(filename);
    if (ext) return ext.toLowerCase();
  }
  if (mime && EXT_FOR_MIME[mime]) return EXT_FOR_MIME[mime];
  return '.bin';
}

/**
 * Magic-byte + filename-extension mime sniffing for the common cases.
 * @param bytes - the asset's leading bytes.
 * @param filename - optional filename used as an extension fallback.
 * @returns a best-effort mime type, defaulting to `application/octet-stream`.
 */
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

/**
 * Map a mime type to its coarse Library asset kind (image / video / font /
 * html / text), defaulting unknowns to `image`.
 * @param mime - the asset's mime type.
 * @returns the {@link LibraryAssetKind} bucket.
 */
export function kindForMime(mime: string): LibraryAssetKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('font/') || mime === 'application/font-woff') return 'font';
  if (mime === 'text/html') return 'html';
  if (mime.startsWith('text/')) return 'text';
  return 'image';
}

/**
 * Best-effort raster dimensions for PNG / JPEG / GIF (no decode, no deps).
 * @param bytes - the image's leading bytes.
 * @returns `{ width, height }` when derivable, else `null`.
 */
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
