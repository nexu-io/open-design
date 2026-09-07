// Drives the Continue in CLI button's existence + staleness chip without
// a daemon-side endpoint. Fetches the project's file list to detect
// DESIGN.md, downloads its body to parse the `## Provenance` section,
// then compares the recorded generatedAt against the max mtime across
// project files (excluding DESIGN.md itself) and the max conversation
// updatedAt. A "stale" verdict means the design intent recorded in
// DESIGN.md likely no longer matches the current project state.

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Conversation,
  ProjectFile,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import { parseProvenance } from '../lib/parse-provenance';
import { fetchProjectFiles } from '../providers/registry';
import { listConversations } from '../state/projects';
import {
  workspaceIdentityCacheKey,
  workspaceProjectHeaders,
} from '../collab/workspace-identity';

const DESIGN_MD = 'DESIGN.md';

// 'unknown-provenance' is the round-7 (mrcfps @ useDesignMdState.ts:160)
// degraded state: the parser could not extract a comparison timestamp
// from the `## Provenance` section, so the hook can't prove fresh OR
// stale. It surfaces as a distinct chip rather than overloading
// `'files-newer'` / `'conversations-newer'`.
export type DesignMdStaleReason =
  | 'files-newer'
  | 'conversations-newer'
  | 'unknown-provenance'
  | null;

export interface DesignMdState {
  exists: boolean;
  generatedAt: Date | null;
  transcriptMessageCount: number | null;
  designSystemId: string | null;
  currentArtifact: string | null;
  isStale: boolean;
  staleReason: DesignMdStaleReason;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

interface ConversationsResponseShape {
  conversations: Conversation[];
}

const INITIAL: Omit<DesignMdState, 'refresh'> = {
  exists: false,
  generatedAt: null,
  transcriptMessageCount: null,
  designSystemId: null,
  currentArtifact: null,
  isStale: false,
  staleReason: null,
  loading: true,
  error: null,
};

/**
 * @param projectId — the active project to inspect.
 * @param refreshKey — bumps from the caller cause `compute()` to re-run
 *   without an explicit `refresh()` call. Round 7 (mrcfps @ line 131):
 *   ProjectView wires this to a counter that ticks on file-changed SSE
 *   events, live_artifact* events, and the streaming-completion edge so
 *   the staleness chip stays in sync with the underlying mtimes /
 *   conversation updatedAt as the user keeps working post-finalize.
 *   Defaults to 0 so call sites that don't need invalidation can omit it.
 */
export function useDesignMdState(
  projectId: string,
  refreshKey: number = 0,
  workspaceContext?: WorkspaceCollabContext | null,
): DesignMdState {
  const [state, setState] = useState<Omit<DesignMdState, 'refresh'>>(INITIAL);

  // Which `refreshKey` this hook has already computed for. A change means the
  // caller is announcing a mutation it wants observed (file-changed SSE, a
  // finished turn); a repeat is only an effect replay. See `compute`'s
  // `revalidate` for why the difference is load-bearing.
  const computedRefreshKeyRef = useRef<number | null>(null);

  const compute = useCallback(
    async (
      signal?: AbortSignal,
      options?: { revalidate?: boolean },
    ): Promise<void> => {
      const projectIdEnc = encodeURIComponent(projectId);
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        // `fetchProjectFiles` is the single owner of this URL — its key
        // (project + Workspace identity), its invalidation fence, and its
        // shared cancellation all live there. Reading it with a private
        // `fetch` put this hook outside that reader, so its own effect replay
        // was a second request and neither of them could join the one
        // ProjectView had already opened for the same list.
        //
        // `requireAuthoritative` keeps this hook's existing distinction
        // between "the project has no DESIGN.md" and "the directory could not
        // be read": the broad list/card callers want the empty fallback, a
        // staleness verdict does not.
        //
        // `fresh` is what stops the shared reader from turning into a cache
        // for THIS consumer. The shared entry survives a second past a settled
        // read, and a `refreshKey` bump or an explicit `refresh()` is exactly a
        // caller saying "something changed, look again" — those must reach the
        // daemon. A plain mount read has nothing to supersede and joins.
        const files = await fetchProjectFiles(projectId, {
          ...(signal ? { signal } : {}),
          ...(workspaceContext ? { workspaceContext } : {}),
          ...(options?.revalidate ? { fresh: true } : {}),
          requireAuthoritative: true,
        });
        if (signal?.aborted) return;
        const designMd = files.find((f) => f.name === DESIGN_MD);

        if (!designMd) {
          setState({
            ...INITIAL,
            loading: false,
          });
          return;
        }

        const designResp = await fetch(
          `/api/projects/${projectIdEnc}/files/${encodeURIComponent(DESIGN_MD)}`,
          {
            signal,
            ...(workspaceContext
              ? { headers: workspaceProjectHeaders(workspaceContext) }
              : {}),
          },
        );
        if (!designResp.ok) {
          throw new Error(`GET DESIGN.md → HTTP ${designResp.status}`);
        }
        const designText = await designResp.text();
        if (signal?.aborted) return;
        const provenance = parseProvenance(designText);

        // Shared single-flight conversations read (Batch A §4.3); the local
        // abort only detaches this consumer.
        const conversations = await listConversations(projectId, {
          workspaceContext,
        });
        const convsBody: ConversationsResponseShape = { conversations };
        if (signal?.aborted) return;

        const generatedMs =
          provenance?.generatedAt && Number.isFinite(provenance.generatedAt.getTime())
            ? provenance.generatedAt.getTime()
            : null;

        const { isStale, staleReason } = computeStale({
          generatedMs,
          files,
          conversations: convsBody.conversations ?? [],
        });

        setState({
          exists: true,
          generatedAt: provenance?.generatedAt ?? null,
          transcriptMessageCount: provenance?.transcriptMessageCount ?? null,
          designSystemId: provenance?.designSystemId ?? null,
          currentArtifact: provenance?.currentArtifact ?? null,
          isStale,
          staleReason,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (signal?.aborted) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        }));
      }
    },
    // refreshKey is intentionally a dep so caller-driven invalidation
    // (file-changed events, chat-turn completion) re-runs compute without
    // forcing the caller to drill `refresh()` through props. Round 7
    // (mrcfps @ useDesignMdState.ts:131).
    [projectId, refreshKey, workspaceIdentityCacheKey(workspaceContext)],
  );

  useEffect(() => {
    // A replay of the same `refreshKey` (StrictMode, a settling dependency) is
    // not new information and may join a read already on the wire; a bumped
    // `refreshKey` is, and must supersede it.
    const previousRefreshKey = computedRefreshKeyRef.current;
    const revalidate = previousRefreshKey !== null && previousRefreshKey !== refreshKey;
    computedRefreshKeyRef.current = refreshKey;
    const controller = new AbortController();
    void compute(controller.signal, { revalidate });
    return () => controller.abort();
  }, [compute, refreshKey]);

  const refresh = useCallback(() => compute(undefined, { revalidate: true }), [compute]);

  return { ...state, refresh };
}

interface ComputeStaleInput {
  generatedMs: number | null;
  files: ProjectFile[];
  conversations: Conversation[];
}

interface ComputeStaleResult {
  isStale: boolean;
  staleReason: DesignMdStaleReason;
}

export function computeStale({
  generatedMs,
  files,
  conversations,
}: ComputeStaleInput): ComputeStaleResult {
  if (generatedMs === null) {
    // Round 7 (mrcfps @ useDesignMdState.ts:160): when the provenance
    // timestamp is missing or malformed, the hook cannot compare
    // DESIGN.md against newer files / conversations. Surface a distinct
    // 'unknown-provenance' state instead of advertising fresh — failing
    // open here was misleading because the user saw the "fresh" path
    // precisely when parsing had become untrustworthy. The button stays
    // enabled (no comparison data is not the same as broken state) so
    // the user can still proceed; the chip is the signal.
    return { isStale: true, staleReason: 'unknown-provenance' };
  }

  const maxFileMtime = files.reduce((acc, f) => {
    if (f.name === DESIGN_MD) return acc;
    const mtime = typeof f.mtime === 'number' ? f.mtime : 0;
    return mtime > acc ? mtime : acc;
  }, 0);

  if (maxFileMtime > generatedMs) {
    return { isStale: true, staleReason: 'files-newer' };
  }

  const maxConvUpdated = conversations.reduce((acc, c) => {
    const updated = typeof c.updatedAt === 'number' ? c.updatedAt : 0;
    return updated > acc ? updated : acc;
  }, 0);

  if (maxConvUpdated > generatedMs) {
    return { isStale: true, staleReason: 'conversations-newer' };
  }

  return { isStale: false, staleReason: null };
}
