// Feature-local hook for the composer's staged workspace-context chips
// (referenced projects, linked local-code folders) and the bookkeeping that
// reconciles them against the project's `linkedDirs`. Pure UI + derived state
// — no port, no transport — matching this slice's other no-port hooks
// (`useComposerModals`/`useComposerUpload`/`useCommentAttachments`). The
// actual link/unlink transport calls (`patchProject`) live in `actions.ts`'s
// deps-bag functions, which read this hook's state/setters as explicit
// parameters.
//
// The `activeWorkspaceContextId` reset effect below reacts only to a prop
// (the parent's currently-active context, e.g. a switched conversation) and
// this hook's own refs/state — it is internal state management, not an
// external subscription, so it stays in the hook per the
// accumulating-subscription rule (that rule only pulls `window`/`document`/
// `EventSource` listeners out into the orchestrator).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { WorkspaceContextItem } from '@open-design/contracts';
import { workspaceContextLinkedDirs } from '../../../components/workspace-context';
import {
  dedupeWorkspaceContextItems,
  trackedWorkspaceLinkedDirsForContexts,
} from '../rules';
import type { TrackedWorkspaceLinkedDir } from '../types';

export interface WorkspaceContextLinkingParams {
  activeWorkspaceContext: WorkspaceContextItem | null;
  initialWorkspaceContexts: WorkspaceContextItem[];
  linkedDirs: string[];
}

export interface WorkspaceContextLinkingController {
  stagedWorkspaceContexts: WorkspaceContextItem[];
  setStagedWorkspaceContexts: Dispatch<SetStateAction<WorkspaceContextItem[]>>;
  workspaceLinkedDirAdds: Record<string, TrackedWorkspaceLinkedDir>;
  setWorkspaceLinkedDirAdds: Dispatch<SetStateAction<Record<string, TrackedWorkspaceLinkedDir>>>;
  promotedWorkspaceContextDir: string | null;
  setPromotedWorkspaceContextDir: Dispatch<SetStateAction<string | null>>;
  dismissedWorkspaceContextId: string | null;
  setDismissedWorkspaceContextId: Dispatch<SetStateAction<string | null>>;
  /** The active context, unless the user dismissed its chip this session. */
  visibleWorkspaceContext: WorkspaceContextItem | null;
  /** `visibleWorkspaceContext` + every staged item, deduped. */
  selectedWorkspaceContexts: WorkspaceContextItem[];
  selectedWorkspaceContextDirs: string[];
  workspaceContextMetadataLinkedDirList: string[];
  /** The project's primary working dir: the first `linkedDirs` entry NOT
   *  claimed by a workspace-context item. */
  workingDir: string | null;
}

export function useWorkspaceContextLinking({
  activeWorkspaceContext,
  initialWorkspaceContexts,
  linkedDirs,
}: WorkspaceContextLinkingParams): WorkspaceContextLinkingController {
  const [stagedWorkspaceContexts, setStagedWorkspaceContexts] = useState<WorkspaceContextItem[]>(
    () => dedupeWorkspaceContextItems(initialWorkspaceContexts),
  );
  const [workspaceLinkedDirAdds, setWorkspaceLinkedDirAdds] = useState<Record<string, TrackedWorkspaceLinkedDir>>(
    () => trackedWorkspaceLinkedDirsForContexts(initialWorkspaceContexts, linkedDirs),
  );
  const [promotedWorkspaceContextDir, setPromotedWorkspaceContextDir] = useState<string | null>(null);
  const [dismissedWorkspaceContextId, setDismissedWorkspaceContextId] = useState<string | null>(null);

  const activeWorkspaceContextId = activeWorkspaceContext?.id ?? null;
  const previousWorkspaceContextIdRef = useRef<string | null>(activeWorkspaceContextId);
  useEffect(() => {
    if (previousWorkspaceContextIdRef.current === activeWorkspaceContextId) return;
    previousWorkspaceContextIdRef.current = activeWorkspaceContextId;
    setDismissedWorkspaceContextId(null);
    setPromotedWorkspaceContextDir(null);
  }, [activeWorkspaceContextId]);

  const visibleWorkspaceContext =
    activeWorkspaceContext && activeWorkspaceContext.id !== dismissedWorkspaceContextId
      ? activeWorkspaceContext
      : null;

  const selectedWorkspaceContexts = useMemo(() => {
    const out: WorkspaceContextItem[] = [];
    const seen = new Set<string>();
    const push = (item: WorkspaceContextItem | null | undefined) => {
      if (!item) return;
      const key = `${item.kind}:${item.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    };
    push(visibleWorkspaceContext);
    for (const item of stagedWorkspaceContexts) push(item);
    return out;
  }, [stagedWorkspaceContexts, visibleWorkspaceContext]);

  const selectedWorkspaceContextDirs = useMemo<string[]>(
    () => workspaceContextLinkedDirs(selectedWorkspaceContexts),
    [selectedWorkspaceContexts],
  );

  const workspaceContextMetadataLinkedDirList = useMemo<string[]>(
    () =>
      Array.from(new Set([
        ...Object.values(workspaceLinkedDirAdds).map((tracked) => tracked.dir),
        ...selectedWorkspaceContextDirs,
      ])),
    [selectedWorkspaceContextDirs, workspaceLinkedDirAdds],
  );

  const workspaceContextLinkedDirList = useMemo<string[]>(
    () =>
      workspaceContextMetadataLinkedDirList.filter((dir) => dir !== promotedWorkspaceContextDir),
    [promotedWorkspaceContextDir, workspaceContextMetadataLinkedDirList],
  );
  const workspaceContextLinkedDirSet = useMemo<Set<string>>(
    () => new Set(workspaceContextLinkedDirList),
    [workspaceContextLinkedDirList],
  );

  const workingDir = linkedDirs.find((dir) => !workspaceContextLinkedDirSet.has(dir)) ?? null;

  return {
    stagedWorkspaceContexts,
    setStagedWorkspaceContexts,
    workspaceLinkedDirAdds,
    setWorkspaceLinkedDirAdds,
    promotedWorkspaceContextDir,
    setPromotedWorkspaceContextDir,
    dismissedWorkspaceContextId,
    setDismissedWorkspaceContextId,
    visibleWorkspaceContext,
    selectedWorkspaceContexts,
    selectedWorkspaceContextDirs,
    workspaceContextMetadataLinkedDirList,
    workingDir,
  };
}
