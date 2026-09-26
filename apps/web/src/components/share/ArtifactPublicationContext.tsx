import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useProjectCollabContext } from '../../collab/collab-context';
import { currentWorkspaceAccountGeneration, workspaceAccountScopedCacheKey } from '../../collab/workspace-identity';
import { useProjectShareHistoryState } from './useProjectShareHistory';
import { PROJECT_SHARE_HISTORY_CHANGED_EVENT, type ConfirmedProjectShareStop } from './share-publication-events';

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
  const currentPaths = useMemo(() => history ? new Set(
    history.publications.filter((publication) => publication.status === 'active')
      .map((publication) => publication.sourceFilePath),
  ) : null, [history]);
  useEffect(() => {
    if (currentPaths) setLastConfirmed({ scope, paths: currentPaths });
  }, [currentPaths, scope]);
  useEffect(() => {
    const applyConfirmedStop = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail?.projectId !== projectId) return;
      const receipt = event.detail?.confirmedStop as ConfirmedProjectShareStop | undefined;
      if (!receipt || receipt.accountScope !== workspaceAccountScopedCacheKey(workspaceContext)
        || receipt.generation !== currentWorkspaceAccountGeneration()) return;
      setLastConfirmed(previous => {
        const paths = previous?.scope === scope ? previous.paths : currentPaths;
        if (!paths) return previous;
        return { scope, paths: new Set([...paths].filter(path => path !== receipt.sourceFilePath)) };
      });
    };
    window.addEventListener(PROJECT_SHARE_HISTORY_CHANGED_EVENT, applyConfirmedStop);
    return () => window.removeEventListener(PROJECT_SHARE_HISTORY_CHANGED_EVENT, applyConfirmedStop);
  }, [projectId, scope, workspaceContext, currentPaths]);
  // A failed refresh cannot prove that an active share stopped. Reuse only the
  // last confirmed result in this exact account/project; unknown is not unshared.
  const publishedFilePaths = currentPaths ?? (lastConfirmed?.scope === scope ? lastConfirmed.paths : null);
  return <ArtifactPublicationContext.Provider value={publishedFilePaths}>{children}</ArtifactPublicationContext.Provider>;
}
