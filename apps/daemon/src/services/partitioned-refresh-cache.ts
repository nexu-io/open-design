export interface PartitionedRefreshCacheOptions<T> {
  fetch(key: string): Promise<T>;
  /** Return null when this result must not be cached. */
  ttlMs(value: T): number | null;
  maxEntries?: number;
  now?: () => number;
}

export interface PartitionedRefreshReadOptions {
  /** Ignore a settled value, while still joining current-generation work. */
  force?: boolean;
  /**
   * If invalidated while a read is in flight, join that read and perform at
   * most one current-generation trailing refresh before answering.
   */
  revalidateOnInvalidation?: boolean;
}

export interface PartitionedRefreshCache<T> {
  read(key: string, options?: PartitionedRefreshReadOptions): Promise<T>;
  invalidate(key: string, token?: string): void;
  clear(): void;
}

interface CacheEntry<T> {
  generation: number;
  hasValue: boolean;
  value: T | undefined;
  expiresAt: number;
  inFlightByGeneration: Map<number, Promise<T>>;
  lastInvalidationToken: string | null;
  touchedAt: number;
}

const DEFAULT_MAX_ENTRIES = 32;

/**
 * Small process-local primitive for event-invalidated upstream snapshots.
 *
 * Keys normally represent credential identity plus resource scope. Settled
 * values and in-flight reads never cross keys. Invalidation advances an opaque
 * generation, so work started before an event may finish for its original
 * caller but cannot seed the post-event cache.
 */
export function createPartitionedRefreshCache<T>(
  options: PartitionedRefreshCacheOptions<T>,
): PartitionedRefreshCache<T> {
  const now = options.now ?? Date.now;
  const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  const entries = new Map<string, CacheEntry<T>>();

  const touch = (key: string, entry: CacheEntry<T>): void => {
    entry.touchedAt = now();
    entries.delete(key);
    entries.set(key, entry);
  };

  const trim = (targetSize: number): void => {
    if (entries.size <= targetSize) return;
    for (const [key, entry] of entries) {
      if (entry.inFlightByGeneration.size > 0) continue;
      entries.delete(key);
      if (entries.size <= targetSize) return;
    }
  };

  const entryFor = (key: string): CacheEntry<T> => {
    const existing = entries.get(key);
    if (existing) {
      touch(key, existing);
      return existing;
    }
    trim(maxEntries - 1);
    const entry: CacheEntry<T> = {
      generation: 0,
      hasValue: false,
      value: undefined,
      expiresAt: 0,
      inFlightByGeneration: new Map(),
      lastInvalidationToken: null,
      touchedAt: now(),
    };
    entries.set(key, entry);
    return entry;
  };

  const hasFreshValue = (entry: CacheEntry<T>): boolean =>
    entry.hasValue && now() < entry.expiresAt;

  const latestInFlight = (entry: CacheEntry<T>): Promise<T> | undefined => {
    let latest: Promise<T> | undefined;
    for (const request of entry.inFlightByGeneration.values()) latest = request;
    return latest;
  };

  const start = (
    key: string,
    entry: CacheEntry<T>,
    generation: number,
  ): Promise<T> => {
    const existing = entry.inFlightByGeneration.get(generation);
    if (existing) return existing;
    const request = options.fetch(key)
      .then((value) => {
        if (entry.generation === generation) {
          const ttlMs = options.ttlMs(value);
          if (ttlMs != null) {
            entry.hasValue = true;
            entry.value = value;
            entry.expiresAt = now() + Math.max(0, ttlMs);
            touch(key, entry);
          }
        }
        return value;
      })
      .finally(() => {
        if (entry.inFlightByGeneration.get(generation) === request) {
          entry.inFlightByGeneration.delete(generation);
        }
        trim(maxEntries);
      });
    entry.inFlightByGeneration.set(generation, request);
    return request;
  };

  return {
    async read(keyInput, readOptions = {}): Promise<T> {
      const key = keyInput.trim();
      if (!key) throw new Error('partitioned refresh cache key is required');
      const entry = entryFor(key);
      if (!readOptions.force && hasFreshValue(entry)) return entry.value as T;

      const attempts = readOptions.revalidateOnInvalidation ? 2 : 1;
      let latest: T | undefined;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const generation = entry.generation;
        const request = readOptions.revalidateOnInvalidation
          ? latestInFlight(entry) ?? start(key, entry, generation)
          : start(key, entry, generation);
        latest = await request;
        if (
          entry.generation === generation
          && hasFreshValue(entry)
        ) {
          return entry.value as T;
        }
      }
      return entry.hasValue ? entry.value as T : latest as T;
    },

    invalidate(keyInput, tokenInput): void {
      const key = keyInput.trim();
      if (!key) return;
      const entry = entryFor(key);
      const token = tokenInput?.trim() || null;
      if (token && entry.lastInvalidationToken === token) return;
      entry.lastInvalidationToken = token;
      entry.generation += 1;
      entry.hasValue = false;
      entry.value = undefined;
      entry.expiresAt = 0;
      touch(key, entry);
    },

    clear(): void {
      // Fence in-flight completions before dropping the entries. Otherwise a
      // request that settles after clear() could touch itself back into the map.
      for (const entry of entries.values()) entry.generation += 1;
      entries.clear();
    },
  };
}
