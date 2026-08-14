import type { WorkspaceCollabContext } from '@open-design/contracts';
import type {
  WorkspaceContextProvider,
  WorkspaceContextRequest,
} from './workspace-context.js';

export interface WorkspaceExactContextCacheOptions {
  provider: WorkspaceContextProvider;
  identity(): string;
  realtimeTtlMs?: number;
  now?: () => number;
  onDecision?: (input: {
    source: 'cache' | 'current';
    reason: 'cold' | 'lease_hit' | 'lease_expired' | 'catch_up';
    outcome: 'allow' | 'deny' | 'unavailable' | 'fallback';
    ageMs?: number;
  }) => void;
  onSuppressedRequest?: (input: {
    source: 'current';
    reason: 'lease_hit';
  }) => void;
  onInvalidation?: (input: {
    source: 'current';
    reason: 'event_dirty' | 'auth_reject' | 'catch_up' | 'unhealthy';
  }) => void;
}

export interface WorkspaceExactContextCache {
  provider: WorkspaceContextProvider;
  refresh(
    request: WorkspaceContextRequest & { workspaceId: string },
    reason?: 'cold' | 'lease_expired' | 'catch_up',
  ): Promise<WorkspaceCollabContext | null>;
  cached(workspaceId: string): WorkspaceCollabContext | null;
  setRealtimeHealthy(workspaceId: string, healthy: boolean): void;
  /** Retire every snapshot and health grant across a credential transition. */
  resetIdentity(): void;
  invalidate(
    workspaceId?: string,
    reason?: 'event_dirty' | 'auth_reject' | 'catch_up',
  ): void;
}

interface Entry {
  context: WorkspaceCollabContext;
  observedAt: number;
}

const DEFAULT_REALTIME_TTL_MS = 5 * 60_000;

/** Exact-workspace cache for Vela's authenticated `/workspaces/current` read. */
export function createWorkspaceExactContextCache(
  options: WorkspaceExactContextCacheOptions,
): WorkspaceExactContextCache {
  const now = options.now ?? Date.now;
  const realtimeTtlMs = Math.max(1, options.realtimeTtlMs ?? DEFAULT_REALTIME_TTL_MS);
  const entries = new Map<string, Entry>();
  const generations = new Map<string, number>();
  const healthyIdentities = new Map<string, string>();

  const cacheKey = (identity: string, workspaceId: string) =>
    `${identity}\0${workspaceId}`;
  const currentKey = (workspaceId: string) =>
    cacheKey(options.identity(), workspaceId);
  const advanceGeneration = (key: string): number => {
    const generation = (generations.get(key) ?? 0) + 1;
    generations.set(key, generation);
    return generation;
  };
  const resetIdentity = (): void => {
    // Keep generation tombstones so an old identity's in-flight response can
    // never reseed its partition after A -> B -> A returns to the same key.
    for (const key of generations.keys()) advanceGeneration(key);
    entries.clear();
    healthyIdentities.clear();
  };

  const refresh = async (
    request: WorkspaceContextRequest & { workspaceId: string },
    reason: 'cold' | 'lease_expired' | 'catch_up' = 'cold',
  ): Promise<WorkspaceCollabContext | null> => {
    const workspaceId = request.workspaceId.trim();
    if (!workspaceId || !options.provider.resolveExact) return null;
    const key = currentKey(workspaceId);
    if (!generations.has(key)) generations.set(key, 0);
    const generation = generations.get(key) ?? 0;
    let context: WorkspaceCollabContext | null;
    try {
      context = await options.provider.resolveExact({
        ...request,
        workspaceId,
      });
    } catch (error) {
      options.onDecision?.({
        source: 'current',
        reason,
        outcome: 'unavailable',
      });
      throw error;
    }
    if (
      context &&
      context.workspaceId === workspaceId &&
      (generations.get(key) ?? 0) === generation
    ) {
      entries.set(key, { context, observedAt: now() });
    }
    options.onDecision?.({
      source: 'current',
      reason,
      // The provider intentionally collapses signed-out, denied, and transport
      // failures to null. Do not manufacture a deny label without evidence.
      outcome: context ? 'allow' : 'unavailable',
    });
    return context;
  };

  const cached = (workspaceIdInput: string): WorkspaceCollabContext | null => {
    const workspaceId = workspaceIdInput.trim();
    const identity = options.identity();
    if (!workspaceId || healthyIdentities.get(workspaceId) !== identity) return null;
    const key = cacheKey(identity, workspaceId);
    const entry = entries.get(key);
    if (!entry) {
      options.onDecision?.({
        source: 'cache',
        reason: 'cold',
        outcome: 'fallback',
      });
      return null;
    }
    const ageMs = Math.max(0, now() - entry.observedAt);
    if (ageMs >= realtimeTtlMs) {
      options.onDecision?.({
        source: 'cache',
        reason: 'lease_expired',
        outcome: 'fallback',
        ageMs,
      });
      return null;
    }
    options.onDecision?.({
      source: 'cache',
      reason: 'lease_hit',
      outcome: 'allow',
      ageMs,
    });
    options.onSuppressedRequest?.({ source: 'current', reason: 'lease_hit' });
    return entry.context;
  };

  const provider: WorkspaceContextProvider = {
    ...options.provider,
    ...(options.provider.resolveExact
      ? {
          resolveExact: async (
            request: WorkspaceContextRequest & { workspaceId: string },
          ): Promise<WorkspaceCollabContext | null> =>
            cached(request.workspaceId) ?? refresh(request, 'cold'),
        }
      : {}),
  };

  return {
    provider,
    refresh,
    cached,
    setRealtimeHealthy(workspaceIdInput, healthy): void {
      const workspaceId = workspaceIdInput.trim();
      if (!workspaceId) return;
      if (healthy) {
        healthyIdentities.set(workspaceId, options.identity());
        return;
      }
      options.onInvalidation?.({ source: 'current', reason: 'unhealthy' });
      healthyIdentities.delete(workspaceId);
      const suffix = `\0${workspaceId}`;
      for (const key of generations.keys()) {
        if (!key.endsWith(suffix)) continue;
        advanceGeneration(key);
        entries.delete(key);
      }
    },
    resetIdentity,
    invalidate(workspaceIdInput, reason = 'event_dirty'): void {
      const workspaceId = workspaceIdInput?.trim() ?? '';
      options.onInvalidation?.({ source: 'current', reason });
      if (workspaceId) {
        // A thin event dirties the exact snapshot, not the proven health of
        // the still-open realtime channel. Keep that health grant so a fresh
        // post-event read can reseat the lease without waiting for a transport
        // flap. Terminal backend rejection remains a hard health revocation.
        if (reason === 'auth_reject') healthyIdentities.delete(workspaceId);
        const suffix = `\0${workspaceId}`;
        for (const key of generations.keys()) {
          if (!key.endsWith(suffix)) continue;
          advanceGeneration(key);
          entries.delete(key);
        }
        return;
      }
      if (reason === 'auth_reject') healthyIdentities.clear();
      for (const key of generations.keys()) advanceGeneration(key);
      entries.clear();
    },
  };
}
