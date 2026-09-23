export type WorkspaceAuthorityCacheMode = 'legacy' | 'observe' | 'adaptive';

export function resolveWorkspaceAuthorityCacheMode(
  value: string | undefined,
): WorkspaceAuthorityCacheMode {
  if (value == null || value.trim() === '') return 'adaptive';
  const normalized = value.trim().toLowerCase();
  return normalized === 'observe' || normalized === 'adaptive'
    ? normalized
    : 'legacy';
}

export interface WorkspaceAuthorityHealthCoordinatorOptions {
  mode: WorkspaceAuthorityCacheMode;
  catchUp(workspaceId: string): Promise<void>;
  /** Bounded-cadence retry after a transient catch-up failure. */
  catchUpRetryMs?: number;
  setDirectoryPollingHealthy(workspaceId: string, healthy: boolean): void;
  setBillingPollingHealthy(workspaceId: string, healthy: boolean): void;
  setContextCachingHealthy?(workspaceId: string, healthy: boolean): void;
  onDecision?: (input: {
    source: 'sse';
    reason: 'mode_disabled' | 'unhealthy' | 'catch_up' | 'healthy';
    outcome: 'allow' | 'unavailable' | 'fallback';
  }) => void;
  onError?: (error: unknown) => void;
}

export interface WorkspaceAuthorityHealthCoordinator {
  update(input: { workspaceId?: string; healthy: boolean }): Promise<void>;
}

/**
 * Converts strict upstream health into permission to suppress legacy polls.
 * A healthy frame is only a candidate: adaptive mode remains on legacy
 * cadence until one exact-workspace catch-up completes. Generation fencing
 * prevents a late catch-up from re-enabling suppression after a disconnect.
 */
export function createWorkspaceAuthorityHealthCoordinator(
  options: WorkspaceAuthorityHealthCoordinatorOptions,
): WorkspaceAuthorityHealthCoordinator {
  const generations = new Map<string, number>();
  const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const catchUpRetryMs = Math.max(1, options.catchUpRetryMs ?? 30_000);

  const setHealthy = (workspaceId: string, healthy: boolean): void => {
    options.setDirectoryPollingHealthy(workspaceId, healthy);
    options.setBillingPollingHealthy(workspaceId, healthy);
    options.setContextCachingHealthy?.(workspaceId, healthy);
  };

  function clearRetry(workspaceId: string): void {
    const timer = retryTimers.get(workspaceId);
    if (!timer) return;
    clearTimeout(timer);
    retryTimers.delete(workspaceId);
  }

  async function update(input: {
    workspaceId?: string;
    healthy: boolean;
  }): Promise<void> {
    const workspaceId = input.workspaceId?.trim() ?? '';
    if (!workspaceId) return;
    clearRetry(workspaceId);
    const generation = (generations.get(workspaceId) ?? 0) + 1;
    generations.set(workspaceId, generation);

    if (options.mode !== 'adaptive' || !input.healthy) {
      setHealthy(workspaceId, false);
      options.onDecision?.({
        source: 'sse',
        reason: input.healthy ? 'mode_disabled' : 'unhealthy',
        outcome: 'fallback',
      });
      return;
    }

    // Keep legacy cadence through the catch-up window. Only a completed
    // catch-up in the still-current health generation may enable the floor.
    setHealthy(workspaceId, false);
    try {
      await options.catchUp(workspaceId);
    } catch (error) {
      options.onDecision?.({
        source: 'sse',
        reason: 'catch_up',
        outcome: 'unavailable',
      });
      options.onError?.(error);
      // The hub edge-publishes health, so another healthy heartbeat will not
      // re-notify us after a transient catch-up failure. Retry locally at a
      // bounded cadence; a disconnect/unhealthy update advances the generation
      // and cancels this recovery before it can re-enable suppression.
      if (generations.get(workspaceId) === generation) {
        const timer = setTimeout(() => {
          retryTimers.delete(workspaceId);
          if (generations.get(workspaceId) !== generation) return;
          void update({ workspaceId, healthy: true });
        }, catchUpRetryMs);
        timer.unref?.();
        retryTimers.set(workspaceId, timer);
      }
      return;
    }
    if (generations.get(workspaceId) !== generation) return;
    setHealthy(workspaceId, true);
    options.onDecision?.({
      source: 'sse',
      reason: 'healthy',
      outcome: 'allow',
    });
  }

  return {
    update,
  };
}
