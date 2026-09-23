import type { WorkspaceBillingSummary } from '@open-design/contracts';
import { createPartitionedRefreshCache } from '../services/partitioned-refresh-cache.js';

export interface AccountBillingSummaryCacheOptions {
  identity(): string;
  fetch(): Promise<WorkspaceBillingSummary | null>;
  ttlMs?: number;
  negativeTtlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

export interface AccountBillingSummaryCache {
  read(): Promise<WorkspaceBillingSummary | null>;
  invalidate(token?: string): void;
  clear(): void;
}

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_NEGATIVE_TTL_MS = 15_000;
const DEFAULT_MAX_ENTRIES = 8;

/**
 * Process-local account billing cache, partitioned by the current credential
 * revision. Concurrent readers share one command. If an SSE invalidation lands
 * during that command, readers wait for at most one sequential trailing fetch
 * instead of starting another process in parallel.
 */
export function createAccountBillingSummaryCache(
  options: AccountBillingSummaryCacheOptions,
): AccountBillingSummaryCache {
  const now = options.now ?? Date.now;
  const ttlMs = Math.max(0, options.ttlMs ?? DEFAULT_TTL_MS);
  const negativeTtlMs = Math.max(
    0,
    options.negativeTtlMs ?? DEFAULT_NEGATIVE_TTL_MS,
  );
  const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  const cache = createPartitionedRefreshCache<WorkspaceBillingSummary | null>({
    fetch: () => options.fetch(),
    ttlMs: (value) => value ? ttlMs : negativeTtlMs,
    maxEntries,
    now,
  });

  return {
    read: () => cache.read(options.identity(), {
      revalidateOnInvalidation: true,
    }),
    invalidate(tokenInput): void {
      cache.invalidate(options.identity(), tokenInput);
    },
    clear(): void {
      cache.clear();
    },
  };
}
