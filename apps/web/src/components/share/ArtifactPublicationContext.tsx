import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useProjectCollabContext } from '../../collab/collab-context';
import { currentWorkspaceAccountGeneration, workspaceAccountScopedCacheKey } from '../../collab/workspace-identity';
import { useProjectShareHistoryState } from './useProjectShareHistory';
import { PROJECT_SHARE_HISTORY_CHANGED_EVENT, type ConfirmedProjectShareStop, type ConfirmedProjectSharePublication } from './share-publication-events';

/** Null means the server has not confirmed this project/account's state. */
export const ArtifactPublicationContext = createContext<ReadonlySet<string> | null>(new Set());

/** One account-scoped history read per chat pane, never per message or card. */
export function ArtifactPublicationProvider({ projectId, children }: {
  projectId: string | null;
  children: ReactNode;
}) {
  const { workspaceContext } = useProjectCollabContext();
  const scope = JSON.stringify([projectId, workspaceAccountScopedCacheKey(workspaceContext), currentWorkspaceAccountGeneration()]);
  const { history } = useProjectShareHistoryState(projectId ?? undefined, workspaceContext, 'artifact-cards');
  const [lastConfirmed, setLastConfirmed] = useState<{ scope: string; paths: ReadonlySet<string> } | null>(null);
  const [confirmedMutations, setConfirmedMutations] = useState<{ scope: string; states: ReadonlyMap<string, 'active' | 'stopped'> } | null>(null);
  const currentPaths = useMemo(() => history ? new Set(
    history.publications.filter((publication) => publication.status === 'active')
      .map((publication) => publication.sourceFilePath),
  ) : null, [history]);
  useEffect(() => {
    if (currentPaths) setLastConfirmed({ scope, paths: currentPaths });
  }, [currentPaths, scope]);
  useEffect(() => {
    if (!history) return;
    const states = new Map(history.publications.map(row => [row.sourceFilePath, row.status]));
    setConfirmedMutations(previous => previous?.scope === scope
      ? { scope, states: new Map([...previous.states].filter(([path, status]) => states.get(path) !== status)) }
      : previous);
  }, [history, scope]);
  useEffect(() => {
    const applyConfirmedMutation = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail?.projectId !== projectId) return;
      const stop = event.detail?.confirmedStop as ConfirmedProjectShareStop | undefined;
      const publication = event.detail?.confirmedPublication as ConfirmedProjectSharePublication | undefined;
      const receipt = stop ?? publication;
      if (!receipt || receipt.accountScope !== workspaceAccountScopedCacheKey(workspaceContext)
        || receipt.generation !== currentWorkspaceAccountGeneration()) return;
      const status = stop ? 'stopped' : 'active';
      setConfirmedMutations(previous => ({ scope, states: new Map([
        ...(previous?.scope === scope ? previous.states : []), [receipt.sourceFilePath, status],
      ]) }));
      setLastConfirmed(previous => {
        const paths = previous?.scope === scope ? previous.paths : currentPaths;
        if (!paths) return previous;
        const next = new Set(paths);
        if (stop) next.delete(receipt.sourceFilePath);
        else next.add(receipt.sourceFilePath);
        return { scope, paths: next };
      });
    };
    window.addEventListener(PROJECT_SHARE_HISTORY_CHANGED_EVENT, applyConfirmedMutation);
    return () => window.removeEventListener(PROJECT_SHARE_HISTORY_CHANGED_EVENT, applyConfirmedMutation);
  }, [projectId, scope, workspaceContext, currentPaths]);
  // A failed refresh cannot prove that an active share stopped. Reuse only the
  // last confirmed result in this exact account/project; unknown is not unshared.
  const confirmedPaths = currentPaths ?? (lastConfirmed?.scope === scope ? lastConfirmed.paths : null);
  // Successful mutations are newer evidence than lagging reads. Only a
  // matching server acknowledgement or a later scoped mutation supersedes them.
  const publishedFilePaths = useMemo(() => {
    if (confirmedMutations?.scope !== scope) return confirmedPaths;
    const paths = new Set(confirmedPaths ?? []);
    for (const [path, status] of confirmedMutations.states) {
      if (status === 'active') paths.add(path);
      else paths.delete(path);
    }
    return paths;
  }, [confirmedPaths, confirmedMutations, scope]);
  return <ArtifactPublicationContext.Provider value={publishedFilePaths}>{children}</ArtifactPublicationContext.Provider>;
}
