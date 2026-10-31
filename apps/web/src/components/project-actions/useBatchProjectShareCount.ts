import { useEffect, useState } from 'react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import {
  currentWorkspaceAccountGeneration,
  workspaceAccountScopedCacheKey,
  workspaceProjectHeaders,
} from '../../collab/workspace-identity';
import { AMR_LOGIN_STATUS_EVENT } from '../amrLoginPolling';
import { isProjectShareHistory } from '../share/useProjectShareHistory';

type BatchRead = { scope: string; count: number | null; failed: boolean };

/**
 * A batch confirmation cannot claim zero shared links until every selected
 * project's authoritative history has been read for the same account. A failed
 * read keeps the destructive confirmation locked; closing/reopening retries.
 * Without a workspace identity no count is known (as for single-card delete);
 * the daemon still owns the final stop-before-delete authorization.
 */
export function useBatchProjectShareCount(
  ids: readonly string[],
  context: WorkspaceCollabContext | null | undefined,
) {
  const generation = currentWorkspaceAccountGeneration();
  const scope = JSON.stringify([ids, workspaceAccountScopedCacheKey(context)]);
  const [result, setResult] = useState<BatchRead | null>(null);
  useEffect(() => {
    let disposed = false;
    let attempt = 0;
    let controller: AbortController | undefined;
    const refresh = () => {
      const request = ++attempt;
      controller?.abort();
      setResult(null);
      if (ids.length === 0 || !context) return;
      const account = currentWorkspaceAccountGeneration();
      controller = new AbortController();
      void (async () => {
        try {
          const counts = await Promise.all(ids.map(async (projectId) => {
            const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/share-state`, {
              cache: 'no-store', signal: controller?.signal, headers: workspaceProjectHeaders(context),
            });
            const value: unknown = response.ok ? await response.json() : null;
            if (!isProjectShareHistory(value, projectId)) throw new Error('share-state unavailable');
            return value.publications.filter(row => row.status === 'active').length;
          }));
          if (!disposed && request === attempt && account === currentWorkspaceAccountGeneration()) {
            setResult({ scope, count: counts.reduce((sum, count) => sum + count, 0), failed: false });
          }
        } catch {
          if (!disposed && request === attempt && account === currentWorkspaceAccountGeneration()) {
            setResult({ scope, count: null, failed: true });
          }
        }
      })();
    };
    refresh();
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, refresh);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener(AMR_LOGIN_STATUS_EVENT, refresh);
    };
  }, [scope, context, generation]);
  const needsRead = ids.length > 0;
  const current = result?.scope === scope ? result : null;
  return {
    count: current?.count ?? null,
    pending: needsRead && !!context && !current,
    failed: needsRead && (!context || current?.failed === true),
    generation: current?.count !== null && current?.count !== undefined ? generation : null,
  };
}
