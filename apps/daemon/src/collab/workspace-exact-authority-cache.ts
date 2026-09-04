import type { WorkspaceDirectoryItem } from '@open-design/contracts';

export interface WorkspaceExactAuthorityCacheOptions {
  identity(): string;
  ttlMs?: number;
  now?: () => number;
}

export interface WorkspaceExactAuthorityCache {
  /** Observe one successful, complete account-directory snapshot. */
  observe(
    identity: string,
    items: readonly WorkspaceDirectoryItem[],
  ): void;
  /** Read only while this exact workspace's strict realtime grant is healthy. */
  cached(
    workspaceId: string,
    workspaceMemberId: string,
  ): WorkspaceDirectoryItem | null;
  setRealtimeHealthy(workspaceId: string, healthy: boolean): void;
  /** Retire every row and health grant across a credential transition. */
  resetIdentity(): void;
  invalidate(workspaceId?: string): void;
}

interface Entry {
  item: WorkspaceDirectoryItem;
  observedAt: number;
}

const DEFAULT_TTL_MS = 5 * 60_000;

/**
 * Directory-sourced authority for one exact Workspace/member pair.
 *
 * An upstream Workspace SSE stream is scoped, while `/api/v1/workspaces` is an
 * account-wide directory. A healthy stream therefore grants reuse only for its
 * own membership row; it can never make the entire directory immortal or hide
 * a newly-added workspace. A successful full directory read seeds rows, and a
 * separate strict-health grant decides which row may suppress another read.
 */
export function createWorkspaceExactAuthorityCache(
  options: WorkspaceExactAuthorityCacheOptions,
): WorkspaceExactAuthorityCache {
  const now = options.now ?? Date.now;
  const ttlMs = Math.max(1, options.ttlMs ?? DEFAULT_TTL_MS);
  const entries = new Map<string, Entry>();
  const healthyIdentities = new Map<string, string>();

  const key = (identity: string, workspaceId: string) =>
    `${identity}\0${workspaceId}`;
  const resetIdentity = (): void => {
    entries.clear();
    healthyIdentities.clear();
  };

  return {
    observe(identity, items): void {
      const seen = new Set<string>();
      const observedAt = now();
      for (const item of items) {
        const workspaceId = item.workspaceId.trim();
        if (!workspaceId) continue;
        const entryKey = key(identity, workspaceId);
        seen.add(entryKey);
        entries.set(entryKey, { item: { ...item }, observedAt });
      }
      // The source was a complete successful directory snapshot. Absence is
      // authoritative for this identity, so retire rows it no longer lists.
      const prefix = `${identity}\0`;
      for (const entryKey of entries.keys()) {
        if (entryKey.startsWith(prefix) && !seen.has(entryKey)) {
          entries.delete(entryKey);
        }
      }
    },

    cached(workspaceIdInput, workspaceMemberIdInput) {
      const workspaceId = workspaceIdInput.trim();
      const workspaceMemberId = workspaceMemberIdInput.trim();
      const identity = options.identity();
      if (
        !workspaceId
        || !workspaceMemberId
      ) {
        return null;
      }
      if (healthyIdentities.get(workspaceId) !== identity) {
        // Credential identity changed underneath the health grant. Retire it
        // so switching back cannot revive a snapshot without a new catch-up.
        healthyIdentities.delete(workspaceId);
        return null;
      }
      const entry = entries.get(key(identity, workspaceId));
      if (!entry || now() - entry.observedAt >= ttlMs) return null;
      const item = entry.item;
      return item.workspaceMemberId === workspaceMemberId
        && item.memberStatus === 'active'
        && item.lifecycleState !== 'deleted'
        ? { ...item }
        : null;
    },

    setRealtimeHealthy(workspaceIdInput, healthy): void {
      const workspaceId = workspaceIdInput.trim();
      if (!workspaceId) return;
      if (healthy) {
        healthyIdentities.set(workspaceId, options.identity());
        return;
      }
      healthyIdentities.delete(workspaceId);
      const suffix = `\0${workspaceId}`;
      for (const entryKey of entries.keys()) {
        if (entryKey.endsWith(suffix)) entries.delete(entryKey);
      }
    },

    resetIdentity,

    invalidate(workspaceIdInput): void {
      const workspaceId = workspaceIdInput?.trim() ?? '';
      if (!workspaceId) {
        resetIdentity();
        return;
      }
      const suffix = `\0${workspaceId}`;
      for (const entryKey of entries.keys()) {
        if (entryKey.endsWith(suffix)) entries.delete(entryKey);
      }
    },
  };
}
