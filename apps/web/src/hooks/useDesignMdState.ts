// Drives the Continue in CLI button's existence + staleness chip without
// a daemon-side endpoint. Fetches the project's file list to detect
// DESIGN.md, downloads its body to parse the `## Provenance` section,
// then compares the recorded generatedAt against the max mtime across
// project files (excluding DESIGN.md itself) and the max conversation
// updatedAt. A "stale" verdict means the design intent recorded in
// DESIGN.md likely no longer matches the current project state.

import { useCallback, useEffect, useState } from 'react';
import type {
  Conversation,
  ProjectFile,
  ProjectFilesResponse,
} from '@open-design/contracts';
import { parseProvenance } from '../lib/parse-provenance';

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
export function useDesignMdState(projectId: string, refreshKey: number = 0): DesignMdState {
  const [state, setState] = useState<Omit<DesignMdState, 'refresh'>>(INITIAL);

  const compute = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      const projectIdEnc = encodeURIComponent(projectId);
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const filesResp = await fetch(`/api/projects/${projectIdEnc}/files`, { signal });
        if (!filesResp.ok) {
          throw new Error(`GET files → HTTP ${filesResp.status}`);
        }
        const filesBody = (await filesResp.json()) as ProjectFilesResponse;
        if (signal?.aborted) return;
        const files = filesBody.files ?? [];
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
          { signal },
        );
        if (!designResp.ok) {
          throw new Error(`GET DESIGN.md → HTTP ${designResp.status}`);
        }
        const designText = await designResp.text();
        if (signal?.aborted) return;
        const provenance = parseProvenance(designText);

        const convsResp = await fetch(`/api/projects/${projectIdEnc}/conversations`, {
          signal,
        });
        let convsBody: ConversationsResponseShape = { conversations: [] };
        if (convsResp.ok) {
          convsBody = (await convsResp.json()) as ConversationsResponseShape;
        }
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
    [projectId, refreshKey],
  );

  useEffect(() => {
    const controller = new AbortController();
    void compute(controller.signal);
    return () => controller.abort();
  }, [compute]);

  const refresh = useCallback(() => compute(), [compute]);

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
