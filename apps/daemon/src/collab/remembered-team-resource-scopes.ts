import type { TeamResourceRequestScope } from './team-resource-share.js';

const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_MAX_ENTRIES = 64;

interface RememberedScopeEntry {
  scope: TeamResourceRequestScope;
  expiresAt: number;
  generation: number;
}

export interface RememberedTeamResourceScopeLease {
  workspaceId: string;
  /** Opaque principal key used only to reject stale background work. */
  key: string;
  generation: number;
}

export interface RememberedTeamResourceScopes {
  remember(scope: TeamResourceRequestScope): TeamResourceRequestScope;
  activeWorkspaceLeases(): RememberedTeamResourceScopeLease[];
  isLeaseCurrent(lease: RememberedTeamResourceScopeLease): boolean;
  has(scope: TeamResourceRequestScope): boolean;
}

function principalKey(scope: TeamResourceRequestScope): string {
  return `${scope.principal.teamId}\u0000${scope.principal.memberId}`;
}

/**
 * Bounded, timer-free compatibility lease for Team resource prewarming.
 *
 * A foreground request renews its exact workspace/member principal. Reads only
 * prune expired entries; no per-scope timer can keep an offscreen workspace
 * alive. Map insertion order is the LRU order, and every renewal receives a
 * new generation so an async poll captured before eviction cannot become
 * current again if the same principal is later revisited.
 */
export function createRememberedTeamResourceScopes(options: {
  leaseMs?: number;
  maxEntries?: number;
  now?: () => number;
} = {}): RememberedTeamResourceScopes {
  const leaseMs = Math.max(1, options.leaseMs ?? DEFAULT_LEASE_MS);
  const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  const now = options.now ?? Date.now;
  const entries = new Map<string, RememberedScopeEntry>();
  let nextGeneration = 0;

  const pruneExpired = (): void => {
    const currentTime = now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= currentTime) entries.delete(key);
    }
  };

  const remember = (
    scope: TeamResourceRequestScope,
  ): TeamResourceRequestScope => {
    pruneExpired();
    const key = principalKey(scope);
    entries.delete(key);
    entries.set(key, {
      scope,
      expiresAt: now() + leaseMs,
      generation: ++nextGeneration,
    });
    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey == null) break;
      entries.delete(oldestKey);
    }
    return scope;
  };

  return {
    remember,
    activeWorkspaceLeases: () => {
      pruneExpired();
      const byWorkspace = new Map<string, RememberedTeamResourceScopeLease>();
      for (const [key, entry] of entries) {
        byWorkspace.set(entry.scope.principal.teamId, {
          workspaceId: entry.scope.principal.teamId,
          key,
          generation: entry.generation,
        });
      }
      return [...byWorkspace.values()];
    },
    isLeaseCurrent: (lease) => {
      pruneExpired();
      const entry = entries.get(lease.key);
      return Boolean(
        entry &&
        entry.generation === lease.generation &&
        entry.scope.principal.teamId === lease.workspaceId,
      );
    },
    has: (scope) => {
      pruneExpired();
      return entries.has(principalKey(scope));
    },
  };
}
