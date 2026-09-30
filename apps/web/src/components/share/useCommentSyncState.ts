import { useEffect, useRef, useState } from 'react';
import type { CommentSyncState, WorkspaceCollabContext } from '@open-design/contracts';
import { currentWorkspaceAccountGeneration, workspaceAccountScopedCacheKey, workspaceProjectHeaders } from '../../collab/workspace-identity';
import { AMR_LOGIN_STATUS_EVENT } from '../amrLoginPolling';

const COMMENT_SYNC_STATUS_CHANGED_EVENT = 'od:comment-sync-status-changed';

/** A settled share mutation only invalidates the exact currently viewed file. */
export function invalidateCommentSyncState(projectId: string, filePath: string) {
  window.dispatchEvent(new CustomEvent(COMMENT_SYNC_STATUS_CHANGED_EVENT, { detail: { projectId, filePath } }));
}

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
  const refreshRef = useRef<((clearCurrent?: boolean) => void) | null>(null);
  useEffect(() => {
    let disposed = false;
    let attempt = 0;
    let controller: AbortController | undefined;
    let inFlight = false;
    const refresh = (clearCurrent = true) => {
      if (inFlight && !clearCurrent) return;
      if (clearCurrent) {
        controller?.abort();
        inFlight = false;
        setObservation(null);
      }
      const request = ++attempt;
      const account = currentWorkspaceAccountGeneration();
      if (!projectId) return;
      controller = new AbortController();
      inFlight = true;
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
        const parsed = isCommentSyncState(value) ? value : null;
        if (parsed) setObservation({ scope, value: parsed });
        else if (clearCurrent) setObservation(null);
        inFlight = false;
      })();
    };
    const refreshOnLogin = () => refresh();
    const refreshOnFocus = () => refresh(false);
    refreshRef.current = refresh;
    refresh();
    const refreshOnPublication = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId: string; filePath: string }>).detail;
      if (detail?.projectId === projectId && detail.filePath === filePath) refresh();
    };
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, refreshOnLogin);
    window.addEventListener('focus', refreshOnFocus);
    window.addEventListener(COMMENT_SYNC_STATUS_CHANGED_EVENT, refreshOnPublication);
    return () => {
      disposed = true;
      if (refreshRef.current === refresh) refreshRef.current = null;
      controller?.abort();
      window.removeEventListener(AMR_LOGIN_STATUS_EVENT, refreshOnLogin);
      window.removeEventListener('focus', refreshOnFocus);
      window.removeEventListener(COMMENT_SYNC_STATUS_CHANGED_EVENT, refreshOnPublication);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshToken intentionally forces a re-run without joining `scope`.
  }, [projectId, context, generation, scope, refreshToken]);

  const current = observation?.scope === scope ? observation.value : null;
  const pollBackfill = Boolean(current && current.sessionMissing === false && current.shareStopped !== true
    && (current.backfill?.state === 'pending' || (current.backfill?.state === 'failed' && current.backfill.retryable)));
  useEffect(() => {
    if (!pollBackfill) return;
    const timer = window.setInterval(() => refreshRef.current?.(false), 2_000);
    return () => window.clearInterval(timer);
  }, [pollBackfill, scope]);
  return current;
}
