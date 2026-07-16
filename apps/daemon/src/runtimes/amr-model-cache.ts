import type { AmrModelsResponse } from '@open-design/contracts';
import type { RuntimeModelOption } from './types.js';

type RemoteCacheEntry = {
  models: RuntimeModelOption[];
  fetchedAt: number;
};

type Fetchers = {
  fetchPreset: () => Promise<RuntimeModelOption[]>;
  fetchRemote: () => Promise<RuntimeModelOption[]>;
};

type CacheState = {
  remote: RemoteCacheEntry | null;
  inFlight: Promise<void> | null;
  lastRemoteError: string | null;
};

// The AMR model catalog changes rarely (new models land on the order of days),
// and a cached remote list is returned immediately while a refresh runs in the
// background — `get()` never blocks on the network when a cached entry exists.
// The per-run preflight now also reads this cache, so a tight interval would
// spawn `vela model list` far more often than the catalog actually changes.
// Refresh at most once every 10 minutes per cache key; callers always get the
// last-known catalog instantly in between.
const DEFAULT_REMOTE_REFRESH_INTERVAL_MS = 10 * 60_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'unknown error');
}

export class AmrModelLoadingCache {
  private readonly states = new Map<string, CacheState>();

  constructor(private readonly refreshIntervalMs = DEFAULT_REMOTE_REFRESH_INTERVAL_MS) {}

  async get(cacheKey: string, fetchers: Fetchers): Promise<AmrModelsResponse> {
    const state = this.stateFor(cacheKey);
    const now = Date.now();
    if (state.remote) {
      const staleByAge = now - state.remote.fetchedAt >= this.refreshIntervalMs;
      if (staleByAge) this.startRefresh(state, fetchers.fetchRemote);
      return {
        source: 'remote',
        models: state.remote.models,
        refreshing: state.inFlight !== null,
        ...(state.inFlight || state.lastRemoteError ? { stale: true } : {}),
        ...(state.lastRemoteError ? { remoteError: state.lastRemoteError } : {}),
      };
    }

    const preset = await fetchers.fetchPreset();
    this.startRefresh(state, fetchers.fetchRemote);
    return {
      source: 'preset',
      models: preset,
      refreshing: state.inFlight !== null,
      ...(state.lastRemoteError ? { remoteError: state.lastRemoteError } : {}),
    };
  }

  warm(cacheKey: string, fetchRemote: () => Promise<RuntimeModelOption[]>): void {
    this.startRefresh(this.stateFor(cacheKey), fetchRemote);
  }

  invalidate(cacheKey: string): void {
    this.states.delete(cacheKey);
  }

  resetForTests(): void {
    this.states.clear();
  }

  private stateFor(cacheKey: string): CacheState {
    const existing = this.states.get(cacheKey);
    if (existing) return existing;
    const created: CacheState = {
      remote: null,
      inFlight: null,
      lastRemoteError: null,
    };
    this.states.set(cacheKey, created);
    return created;
  }

  private startRefresh(state: CacheState, fetchRemote: () => Promise<RuntimeModelOption[]>): void {
    if (state.inFlight) return;
    state.inFlight = (async () => {
      try {
        const models = await fetchRemote();
        if (models.length === 0) {
          throw new Error('AMR remote model list returned no chat models');
        }
        state.remote = { models, fetchedAt: Date.now() };
        state.lastRemoteError = null;
      } catch (error) {
        state.lastRemoteError = errorMessage(error);
      } finally {
        state.inFlight = null;
      }
    })();
  }
}

export const amrModelLoadingCache = new AmrModelLoadingCache();
