import { useEffect, useRef } from 'react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { currentWorkspaceAccountGeneration, workspaceAccountScopedCacheKey } from '../../collab/workspace-identity';

/** A queued share owns its source/input revision, not the comment preview's
 * handshake. Reads never prepare identities, save versions, or require retry. */
export function useShareSourceGuard(options: {
  projectId: string; fileName: string; context: WorkspaceCollabContext | null;
  inputKey: string; settled: boolean;
}) {
  const generation = currentWorkspaceAccountGeneration();
  const key = JSON.stringify([options.projectId, options.fileName,
    workspaceAccountScopedCacheKey(options.context, generation), options.inputKey, options.settled]);
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
  return { isCurrent, canPublish: () => isCurrent() && options.settled };
}
