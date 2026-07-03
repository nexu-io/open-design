/**
 * @module library/core/paths
 *
 * Pure path + date helpers for the Library's content-addressed object store.
 * These derive deterministic on-disk locations from a content hash and bucket
 * timestamps into the daily archive feed. No filesystem access, no siblings.
 */

import path from 'node:path';

/** Root directory holding all content-addressed Library objects. */
export function libraryObjectsDir(libraryDir: string): string {
  return path.join(libraryDir, 'objects');
}

/**
 * Content-addressed path: `<library>/objects/<hh>/<hash><ext>`.
 * @param libraryDir - the Library data root.
 * @param contentHash - the object's SHA-256 hex digest (also the shard key).
 * @param ext - dotted file extension for the object.
 */
export function libraryObjectPath(libraryDir: string, contentHash: string, ext: string): string {
  const shard = contentHash.slice(0, 2);
  return path.join(libraryObjectsDir(libraryDir), shard, `${contentHash}${ext}`);
}

/**
 * Local `YYYY-MM-DD` for the daily archive feed.
 * @param ts - unix-ms timestamp to bucket.
 */
export function archivedDateFor(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
