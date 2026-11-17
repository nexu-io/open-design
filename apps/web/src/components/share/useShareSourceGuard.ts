import { useEffect, useRef } from 'react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { currentWorkspaceAccountGeneration, workspaceAccountScopedCacheKey } from '../../collab/workspace-identity';

/** Retire queued shares only when their project, file, or account changes. */
export function useShareSourceGuard(options: {
  projectId: string; fileName: string; context: WorkspaceCollabContext | null;
}) {
  const generation = currentWorkspaceAccountGeneration();
  const key = JSON.stringify([options.projectId, options.fileName,
    workspaceAccountScopedCacheKey(options.context, generation)]);
  const live = useRef({ key, revision: 0 });
  if (live.current.key !== key) live.current = { key, revision: live.current.revision + 1 };
  const revision = live.current.revision;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; live.current.revision++; };
  }, []);
  const isCurrent = () => mounted.current && live.current.revision === revision
    && currentWorkspaceAccountGeneration() === generation;
  return { isCurrent };
}
