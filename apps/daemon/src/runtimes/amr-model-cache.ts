import type { AmrModelsResponse } from '@open-design/contracts';
import {
  getRememberedLiveModels,
  getRememberedRemoteLiveModels,
  rememberLiveModels,
  rememberRemoteLiveModels,
} from './models.js';
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
  inFlightStartedAt: number;
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

// How long a run that asked for `default` waits for the caller's own catalog
// before settling for the preset seed. `vela model list` answers in well under
// this on a healthy network; the wait only applies while nothing is cached, is
// counted from the start of the remote refresh (so a run that looks the
// catalog up twice, or several runs at once, share one wait), and is skipped
// once the last refresh failed.
export const AMR_DEFAULT_MODEL_CATALOG_WAIT_MS = 12_000;

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

  /**
   * Like `get`, but when only the preset seed is available, waits up to
   * `waitMs` for the in-flight remote refresh. The preset is the same for every
   * account and carries no plan entitlement, so it must not decide a caller's
   * default model when the caller's own catalog is moments away.
   */
  async getAuthoritative(cacheKey: string, fetchers: Fetchers, waitMs: number): Promise<AmrModelsResponse> {
    const state = this.stateFor(cacheKey);
    // A failure seen before this call means the caller's catalog is not coming
    // soon; the refresh `get` restarts runs in the background without a wait.
    const lastRefreshFailed = !state.remote && !state.inFlight && state.lastRemoteError !== null;
    const first = await this.get(cacheKey, fetchers);
    if (first.source === 'remote' || lastRefreshFailed) return first;
    const remainingMs = state.inFlightStartedAt + waitMs - Date.now();
    if (state.inFlight && remainingMs > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        state.inFlight,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, remainingMs);
          timer.unref?.();
        }),
      ]);
      if (timer) clearTimeout(timer);
    }
    if (!state.remote) return first;
    return {
      source: 'remote',
      models: state.remote.models,
      refreshing: state.inFlight !== null,
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
      inFlightStartedAt: 0,
      lastRemoteError: null,
    };
    this.states.set(cacheKey, created);
    return created;
  }

  private startRefresh(state: CacheState, fetchRemote: () => Promise<RuntimeModelOption[]>): void {
    if (state.inFlight) return;
    state.inFlightStartedAt = Date.now();
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

/**
 * The models a run should resolve against. A caller's remote catalog is used
 * and remembered as such; the shared preset seed is used only when this daemon
 * has not yet seen a remote catalog for the scope, since the preset carries no
 * plan entitlement and would pick a default the caller may not be allowed.
 */
export function amrRunModels(
  agentId: string,
  scope: string | null | undefined,
  catalog: Pick<AmrModelsResponse, 'source' | 'models'>,
): RuntimeModelOption[] {
  const models = (catalog.models ?? []) as RuntimeModelOption[];
  if (catalog.source === 'remote' && models.length > 0) {
    rememberRemoteLiveModels(agentId, models, scope);
    return models;
  }
  const remote = getRememberedRemoteLiveModels(agentId, scope);
  if (remote.length > 0) return remote;
  if (models.length > 0) {
    rememberLiveModels(agentId, models, scope);
    return models;
  }
  return getRememberedLiveModels(agentId, scope);
}
