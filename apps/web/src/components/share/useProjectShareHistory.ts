import { useEffect, useState } from 'react';
import type { ProjectShareHistoryResponse, WorkspaceCollabContext } from '@open-design/contracts';
import { currentWorkspaceAccountGeneration, workspaceAccountScopedCacheKey, workspaceProjectHeaders } from '../../collab/workspace-identity';
import { AMR_LOGIN_STATUS_EVENT } from '../amrLoginPolling';

function isHistory(value: unknown, projectId: string): value is ProjectShareHistoryResponse {
  if (!value || typeof value !== 'object') return false;
  return 'projectId' in value && value.projectId === projectId
    && 'hasEverShared' in value && typeof value.hasEverShared === 'boolean'
    && 'bindingExists' in value && value.bindingExists === value.hasEverShared
    && 'publications' in value && Array.isArray(value.publications)
    && (value.hasEverShared || value.publications.length === 0)
    && value.publications.every(row => row && typeof row === 'object'
      && typeof row.sourceFilePath === 'string' && typeof row.slug === 'string'
      && (row.status === 'active' || row.status === 'stopped'));
}

/** Includes stopped bindings. Failed reads are unknown, never "never shared". */
export function useProjectShareHistory(projectId: string | undefined, context: WorkspaceCollabContext | null | undefined, publicationKey: string) {
  const generation = currentWorkspaceAccountGeneration();
  const scope = JSON.stringify([projectId, workspaceAccountScopedCacheKey(context), publicationKey]);
  const [result, setResult] = useState<{ scope: string; history: ProjectShareHistoryResponse } | null>(null);
  useEffect(() => {
    let disposed = false;
    let attempt = 0;
    let controller: AbortController | undefined;
    const refresh = () => {
      const request = ++attempt;
      const account = currentWorkspaceAccountGeneration();
      controller?.abort();
      setResult(null);
      if (!projectId) return;
      controller = new AbortController();
      void (async () => {
        let value: unknown;
        try {
          const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/share-state`, {
            cache: 'no-store', signal: controller?.signal,
            ...(context ? { headers: workspaceProjectHeaders(context) } : {}),
          });
          value = response.ok ? await response.json() : null;
        } catch {
          value = null; // Do not convert an authorization/transport failure to false.
        }
        if (disposed || attempt !== request || account !== currentWorkspaceAccountGeneration()) return;
        setResult(isHistory(value, projectId) ? { scope, history: value } : null);
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
  }, [projectId, context, generation, scope]);
  return result?.scope === scope ? result.history : null;
}
