type HtmlSourceSnapshot = Readonly<{
  authorizationScopeKey: string;
  projectId: string;
  fileName: string;
  refreshKey: string;
  source: string;
}>;

type HtmlSourceSnapshotCacheLimits = Readonly<{
  maxEntries: number;
  maxUtf16Bytes: number;
}>;

type StoredHtmlSourceSnapshot = HtmlSourceSnapshot & {
  utf16Bytes: number;
};

const DEFAULT_MAX_ENTRIES = 16;
const DEFAULT_MAX_UTF16_BYTES = 32 * 1024 * 1024;

function identityKey(
  authorizationScopeKey: string,
  projectId: string,
  fileName: string,
): string {
  return `${authorizationScopeKey}\0${projectId}\0${fileName}`;
}

function sourceUtf16Bytes(source: string): number {
  return source.length * 2;
}

export function htmlSourceSnapshotRefreshKey(
  file: { mtime: number; size: number },
  filesRefreshKey: number,
): string {
  return `${file.mtime}:${file.size}:${filesRefreshKey}`;
}

/**
 * Small in-memory cache for already-rendered HTML sources.
 *
 * Map insertion order is the LRU order. A read moves the entry to the newest
 * position. Only one content version is retained per project/file identity;
 * asking for a different refresh key removes the old entry before returning a
 * miss, so callers never seed a remount from known-stale HTML.
 */
export class HtmlSourceSnapshotCache {
  readonly #entries = new Map<string, StoredHtmlSourceSnapshot>();
  readonly #limits: HtmlSourceSnapshotCacheLimits;
  #utf16Bytes = 0;

  constructor(limits: HtmlSourceSnapshotCacheLimits) {
    this.#limits = limits;
  }

  get size(): number {
    return this.#entries.size;
  }

  get utf16Bytes(): number {
    return this.#utf16Bytes;
  }

  get(
    authorizationScopeKey: string,
    projectId: string,
    fileName: string,
    refreshKey: string,
  ): HtmlSourceSnapshot | null {
    const key = identityKey(authorizationScopeKey, projectId, fileName);
    const entry = this.#entries.get(key);
    if (!entry) return null;
    if (entry.refreshKey !== refreshKey) {
      this.#delete(key);
      return null;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry;
  }

  set(snapshot: HtmlSourceSnapshot): void {
    const key = identityKey(
      snapshot.authorizationScopeKey,
      snapshot.projectId,
      snapshot.fileName,
    );
    this.#delete(key);
    const utf16Bytes = sourceUtf16Bytes(snapshot.source);
    if (utf16Bytes > this.#limits.maxUtf16Bytes) return;

    this.#entries.set(key, { ...snapshot, utf16Bytes });
    this.#utf16Bytes += utf16Bytes;
    this.#evictToLimits();
  }

  invalidateFile(
    authorizationScopeKey: string,
    projectId: string,
    fileName: string,
  ): void {
    this.#delete(identityKey(authorizationScopeKey, projectId, fileName));
  }

  invalidateProject(projectId: string): void {
    for (const [key, entry] of this.#entries) {
      if (entry.projectId === projectId) this.#delete(key);
    }
  }

  clear(): void {
    this.#entries.clear();
    this.#utf16Bytes = 0;
  }

  #delete(key: string): void {
    const entry = this.#entries.get(key);
    if (!entry) return;
    this.#entries.delete(key);
    this.#utf16Bytes -= entry.utf16Bytes;
  }

  #evictToLimits(): void {
    while (
      this.#entries.size > this.#limits.maxEntries ||
      this.#utf16Bytes > this.#limits.maxUtf16Bytes
    ) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#delete(oldest);
    }
  }
}

const htmlSourceSnapshotCache = new HtmlSourceSnapshotCache({
  maxEntries: DEFAULT_MAX_ENTRIES,
  maxUtf16Bytes: DEFAULT_MAX_UTF16_BYTES,
});

export function getHtmlSourceSnapshot(
  authorizationScopeKey: string,
  projectId: string,
  fileName: string,
  refreshKey: string,
): HtmlSourceSnapshot | null {
  return htmlSourceSnapshotCache.get(
    authorizationScopeKey,
    projectId,
    fileName,
    refreshKey,
  );
}

export function setHtmlSourceSnapshot(snapshot: HtmlSourceSnapshot): void {
  htmlSourceSnapshotCache.set(snapshot);
}

export function invalidateHtmlSourceSnapshotFile(
  authorizationScopeKey: string,
  projectId: string,
  fileName: string,
): void {
  htmlSourceSnapshotCache.invalidateFile(
    authorizationScopeKey,
    projectId,
    fileName,
  );
}

export function invalidateHtmlSourceSnapshotProject(projectId: string): void {
  htmlSourceSnapshotCache.invalidateProject(projectId);
}

export function resetHtmlSourceSnapshotCache(): void {
  htmlSourceSnapshotCache.clear();
}
