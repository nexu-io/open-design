import { useEffect, useState } from 'react';
import type { ProjectShareHistoryResponse, WorkspaceCollabContext } from '@open-design/contracts';
import { currentWorkspaceAccountGeneration, workspaceAccountScopedCacheKey, workspaceProjectHeaders } from '../../collab/workspace-identity';
import { AMR_LOGIN_STATUS_EVENT } from '../amrLoginPolling';
import { PROJECT_SHARE_HISTORY_CHANGED_EVENT } from './share-publication-events';

export function isProjectShareHistory(value: unknown, projectId: string): value is ProjectShareHistoryResponse {
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
export type ProjectShareReadStatus = 'idle' | 'loading' | 'ready' | 'error';

export function useProjectShareHistoryState(projectId: string | undefined, context: WorkspaceCollabContext | null | undefined, publicationKey: string) {
  const generation = currentWorkspaceAccountGeneration();
  const scope = JSON.stringify([projectId, workspaceAccountScopedCacheKey(context), publicationKey]);
  const [result, setResult] = useState<{ scope: string; history: ProjectShareHistoryResponse | null } | null>(null);
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
        setResult({ scope, history: isProjectShareHistory(value, projectId) ? value : null });
      })();
    };
    refresh();
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, refresh);
    window.addEventListener('focus', refresh);
    const refreshChangedProject = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.projectId === projectId) refresh();
    };
    window.addEventListener(PROJECT_SHARE_HISTORY_CHANGED_EVENT, refreshChangedProject);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener(AMR_LOGIN_STATUS_EVENT, refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(PROJECT_SHARE_HISTORY_CHANGED_EVENT, refreshChangedProject);
    };
  }, [projectId, context, generation, scope]);
  const current = result?.scope === scope ? result : null;
  const status: ProjectShareReadStatus = !projectId ? 'idle' : !current ? 'loading' : current.history ? 'ready' : 'error';
  return { history: current?.history ?? null, status };
}

export function useProjectShareHistory(projectId: string | undefined, context: WorkspaceCollabContext | null | undefined, publicationKey: string) {
  return useProjectShareHistoryState(projectId, context, publicationKey).history;
}
