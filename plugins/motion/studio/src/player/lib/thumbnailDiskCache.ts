import type { SourceInfo } from "./thumbnailSourcePool";

/** A video as the server serves it now: its URL and the ETag of this version of its file. */
export interface StoredSource {
  source: string;
  etag: string;
}

interface StoredFrame {
  blob: Blob;
  decodedAt: number;
}

const CACHE_PREFIX = "hf-thumbnails:";
const INDEX_KEY = "hf-thumbnails-index";
const ENTRY_ORIGIN = "https://hf-thumbnail.invalid/";
export const STORED_THUMBNAIL_BYTES = 256 * 1024 * 1024;

interface Index {
  etags: Record<string, string>;
  caches: Record<string, { usedAt: number; bytes: number }>;
}

let index: Index | undefined;
// caches this tab dropped since its last save, which another tab's older snapshot must not bring back
const dropped = new Set<string>();
const sourcesThisTabMovedOn = new Set<string>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let warned = false;

const available = () => typeof caches !== "undefined" && typeof crypto?.subtle !== "undefined";

/** Disk is a shortcut, never a reason a thumbnail fails: a broken store says so once and is skipped. */
async function quietly<T>(work: () => Promise<T>): Promise<T | undefined> {
  if (!available()) return undefined;
  try {
    return await work();
  } catch (error) {
    if (!warned) console.warn("[Studio] timeline thumbnails stay in memory:", error);
    warned = true;
    return undefined;
  }
}

async function digest(text: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  );
  return Array.from(bytes.subarray(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const cacheNameOf = async ({ source, etag }: StoredSource) =>
  `${CACHE_PREFIX}${await digest(source)}:${await digest(etag)}`;

function savedIndex(): Index | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "null") as Index | null;
    return saved?.etags && saved.caches ? saved : undefined;
  } catch {
    return undefined; // expected: no storage (a private window) or a value this version can't read
  }
}

function loadIndex(): Index {
  return (index ??= savedIndex() ?? { etags: {}, caches: {} });
}

type CacheEntry = Index["caches"][string];

/** Another tab's entry when it was used later than this tab's, with the larger count of bytes. */
function laterOf(own: CacheEntry | undefined, theirs: CacheEntry): CacheEntry | undefined {
  if (own && own.usedAt >= theirs.usedAt) return undefined;
  return { usedAt: theirs.usedAt, bytes: Math.max(theirs.bytes, own?.bytes ?? 0) };
}

function savedEtagsButThisTabsMoves(mine: Index["etags"], theirs: Index["etags"]): Index["etags"] {
  const etags = { ...mine, ...theirs };
  for (const key of sourcesThisTabMovedOn) etags[key] = mine[key]!;
  sourcesThisTabMovedOn.clear();
  return etags;
}

/** This tab's index with what other tabs saved since: each cache at its latest use, none this tab dropped. */
function mergedIndex(): Index {
  const mine = loadIndex();
  const theirs = savedIndex() ?? { etags: {}, caches: {} };
  for (const [name, entry] of Object.entries(theirs.caches)) {
    const later = dropped.has(name) ? undefined : laterOf(mine.caches[name], entry);
    if (later) mine.caches[name] = later;
  }
  mine.etags = savedEtagsButThisTabsMoves(mine.etags, theirs.etags);
  dropped.clear();
  return mine;
}

function saveIndexSoon(): void {
  saveTimer ??= setTimeout(() => {
    saveTimer = undefined;
    try {
      localStorage.setItem(INDEX_KEY, JSON.stringify(mergedIndex()));
    } catch {
      // expected: storage refused; the caches still hold the frames, only their order of use is lost
    }
  }, 1000);
}

function used(name: string, addedBytes = 0): void {
  const caches = loadIndex().caches;
  caches[name] = { usedAt: Date.now(), bytes: (caches[name]?.bytes ?? 0) + addedBytes };
  saveIndexSoon();
}

/** The version stored for `source`, when one conditional one-byte read says the server still has it (304). */
export const storedVersion = (source: string) =>
  quietly(async (): Promise<StoredSource | undefined> => {
    const etag = loadIndex().etags[await digest(source)];
    if (!etag) return undefined;
    // oxlint-disable-next-line no-restricted-globals -- one validation read, on the media's own route like mediabunny's
    const response = await fetch(source, {
      headers: { Range: "bytes=0-0", "If-None-Match": etag },
    });
    await response.body?.cancel();
    return response.status === 304 ? { source, etag } : undefined;
  });

/** Records the version the server now has, dropping what was stored for the source's earlier versions. */
export const rememberVersion = (stored: StoredSource) =>
  quietly(async () => {
    const key = await digest(stored.source);
    const saved = loadIndex();
    if (saved.etags[key] === stored.etag) return;
    saved.etags[key] = stored.etag;
    sourcesThisTabMovedOn.add(key);
    saveIndexSoon();
    const keep = await cacheNameOf(stored);
    for (const name of await caches.keys()) {
      if (!name.startsWith(`${CACHE_PREFIX}${key}:`) || name === keep) continue;
      await caches.delete(name);
      delete saved.caches[name];
      dropped.add(name);
    }
  });

async function entry(stored: StoredSource, path: string) {
  const name = await cacheNameOf(stored);
  return { name, cache: await caches.open(name), url: `${ENTRY_ORIGIN}${path}` };
}

/** A read opens nothing: opening a cache creates it, and an empty one for a gone version would never be dropped. */
async function storedEntry(stored: StoredSource, path: string) {
  const name = await cacheNameOf(stored);
  return (await caches.has(name)) ? entry(stored, path) : undefined;
}

export const readStoredInfo = (stored: StoredSource) =>
  quietly(async (): Promise<SourceInfo | undefined> => {
    const found = await storedEntry(stored, "info");
    if (!found) return undefined;
    const { name, cache, url } = found;
    const info = (await (await cache.match(url))?.json()) as SourceInfo | undefined;
    if (!(info && info.aspect > 0)) return undefined;
    used(name);
    return info;
  });

export const storeInfo = (stored: StoredSource, info: SourceInfo) =>
  quietly(async () => {
    const { name, cache, url } = await entry(stored, "info");
    await cache.put(url, new Response(JSON.stringify(info)));
    used(name);
  });

/** `frame` names one picture of the source: its fit, size and the time it was asked for. */
export const readStoredFrame = (stored: StoredSource, frame: string) =>
  quietly(async (): Promise<StoredFrame | undefined> => {
    const found = await storedEntry(stored, `frame?${encodeURIComponent(frame)}`);
    if (!found) return undefined;
    const { name, cache, url } = found;
    const response = await cache.match(url);
    const decodedAt = Number(response?.headers.get("x-decoded-at"));
    if (!response || !Number.isFinite(decodedAt)) return undefined;
    used(name);
    return { blob: await response.blob(), decodedAt };
  });

export const storeFrame = (stored: StoredSource, frame: string, decodedAt: number, blob: Blob) =>
  quietly(async () => {
    const { name, cache, url } = await entry(stored, `frame?${encodeURIComponent(frame)}`);
    const replaced = Number((await cache.match(url))?.headers.get("x-bytes")) || 0;
    const headers = {
      "content-type": blob.type,
      "x-decoded-at": String(decodedAt),
      "x-bytes": String(blob.size),
    };
    await cache.put(url, new Response(blob, { headers }));
    used(name, blob.size - replaced);
    await dropLeastUsed(STORED_THUMBNAIL_BYTES);
  });

/** Whole sources go, least recently used first, until what is stored fits `budgetBytes`. */
async function dropLeastUsed(budgetBytes: number): Promise<void> {
  const saved = loadIndex();
  let total = Object.values(saved.caches).reduce((sum, { bytes }) => sum + bytes, 0);
  const oldestFirst = Object.entries(saved.caches).sort(([, a], [, b]) => a.usedAt - b.usedAt);
  for (const [name, { bytes }] of oldestFirst) {
    if (total <= budgetBytes) break;
    await caches.delete(name);
    delete saved.caches[name];
    dropped.add(name);
    total -= bytes;
  }
  saveIndexSoon();
}

/** Tests only: forget the in-memory index and any pending save. */
export function resetStoredThumbnailsForTests(): void {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  index = undefined;
  warned = false;
  dropped.clear();
  sourcesThisTabMovedOn.clear();
}
