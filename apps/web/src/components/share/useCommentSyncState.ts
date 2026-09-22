import { useEffect, useState } from 'react';
import type { CommentSyncState, WorkspaceCollabContext } from '@open-design/contracts';
import { currentWorkspaceAccountGeneration, workspaceAccountScopedCacheKey, workspaceProjectHeaders } from '../../collab/workspace-identity';
import { AMR_LOGIN_STATUS_EVENT } from '../amrLoginPolling';

function isCommentSyncState(value: unknown): value is CommentSyncState {
  if (!value || typeof value !== 'object') return false;
  return 'pending' in value && Number.isSafeInteger(value.pending) && Number(value.pending) >= 0
    && 'sessionMissing' in value && typeof value.sessionMissing === 'boolean'
    && 'lastError' in value && (value.lastError === null || typeof value.lastError === 'string')
    && 'shareStopped' in value && (value.shareStopped === null || typeof value.shareStopped === 'boolean');
}

/**
 * A missing/failed read is unknown. Neither history nor login state substitutes for the server conjunction.
 *
 * `filePath` scopes the per-file `backfill` answer (the endpoint requires it
 * to compute one; without it `backfill` is always absent, not because nothing
 * failed but because nothing was asked). `refreshToken` is a caller-owned
 * counter that forces a re-fetch of the SAME scope — e.g. after a manual
 * retry action posts to the server and wants the next read to reflect it —
 * without changing what is being asked for.
 */
export function useCommentSyncState(
  projectId: string | undefined,
  context: WorkspaceCollabContext | null | undefined,
  options?: { filePath?: string; refreshToken?: number },
) {
  const filePath = options?.filePath;
  const refreshToken = options?.refreshToken ?? 0;
  const generation = currentWorkspaceAccountGeneration();
  const scope = JSON.stringify([projectId, workspaceAccountScopedCacheKey(context), filePath ?? null]);
  const [observation, setObservation] = useState<{ scope: string; value: CommentSyncState } | null>(null);
  useEffect(() => {
    let disposed = false;
    let attempt = 0;
    let controller: AbortController | undefined;
    const refresh = () => {
      const request = ++attempt;
      const account = currentWorkspaceAccountGeneration();
      controller?.abort();
      setObservation(null);
      if (!projectId) return;
      controller = new AbortController();
      void (async () => {
        let value: unknown;
        try {
          const query = filePath ? `?filePath=${encodeURIComponent(filePath)}` : '';
          const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/comment-sync-state${query}`, {
            cache: 'no-store', signal: controller?.signal,
            ...(context ? { headers: workspaceProjectHeaders(context) } : {}),
          });
          value = response.ok ? await response.json() : null;
        } catch {
          value = null; // Transport/parse failure remains unknown, never healthy.
        }
        if (disposed || request !== attempt || account !== currentWorkspaceAccountGeneration()) return;
        setObservation(isCommentSyncState(value) ? { scope, value } : null);
      })();
    };
    refresh();
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener(AMR_LOGIN_STATUS_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshToken intentionally forces a re-run without joining `scope`.
  }, [projectId, context, generation, scope, refreshToken]);
  return observation?.scope === scope ? observation.value : null;
}
