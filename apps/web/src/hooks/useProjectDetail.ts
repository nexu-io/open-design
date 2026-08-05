// Fetches `GET /api/projects/:id` once on mount and caches the response,
// surfacing the `resolvedDir` field added in PR #451 prereq commit. The
// daemon route returns `ProjectDetailResponse` (project + resolvedDir)
// for current builds; older daemons may return `ProjectResponse` (no
// resolvedDir), so we fall back to `metadata.baseDir` when present and
// emit `null` otherwise so callers can degrade their UI gracefully.

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Project,
  ProjectDetailResponse,
  WorkspaceCollabContext,
} from '@open-design/contracts';

export interface ProjectDetailState {
  project: Project | null;
  resolvedDir: string | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export interface ProjectDetailSeed {
  project: Project;
  resolvedDir: string | null;
}

export function useProjectDetail(
  projectId: string,
  workspaceContext: WorkspaceCollabContext | null = null,
  persistedProjectWorkspaceId?: string | null,
  initialDetail?: ProjectDetailSeed | null,
): ProjectDetailState {
  const initialDetailCanSeed = Boolean(
    initialDetail?.project.id === projectId
    && (
      !persistedProjectWorkspaceId?.trim()
      || initialDetail.project.workspaceId === persistedProjectWorkspaceId.trim()
    ),
  );
  const [project, setProject] = useState<Project | null>(
    initialDetailCanSeed ? initialDetail?.project ?? null : null,
  );
  const [resolvedDir, setResolvedDir] = useState<string | null>(
    initialDetailCanSeed ? initialDetail?.resolvedDir ?? null : null,
  );
  const [loading, setLoading] = useState(!initialDetailCanSeed);
  const [error, setError] = useState<Error | null>(null);
  const initialDetailConsumedRef = useRef(false);
  const boundWorkspaceId =
    typeof persistedProjectWorkspaceId === 'string'
      ? persistedProjectWorkspaceId.trim()
      : '';
  const authorizedWorkspaceContext =
    boundWorkspaceId && workspaceContext?.workspaceId === boundWorkspaceId
      ? workspaceContext
      : null;
  const authorityWorkspaceId = authorizedWorkspaceContext?.workspaceId.trim() ?? '';
  const authorityMemberId =
    authorizedWorkspaceContext?.workspaceMemberId.trim() ?? '';
  const authorityKey =
    authorityWorkspaceId && authorityMemberId
      ? `${authorityWorkspaceId}:${authorityMemberId}`
      : 'none';

  const fetchOnce = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      if (boundWorkspaceId && authorityKey === 'none') {
        setError(new Error(`GET /api/projects/${projectId} requires exact workspace authority`));
        setLoading(false);
        return;
      }
      try {
        const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
          ...(authorityKey !== 'none'
            ? {
                headers: {
                  'x-od-workspace-id': authorityWorkspaceId,
                  'x-od-workspace-member-id': authorityMemberId,
                },
              }
            : {}),
          signal,
        });
        if (!resp.ok) {
          throw new Error(`GET /api/projects/${projectId} → HTTP ${resp.status}`);
        }
        const body = (await resp.json()) as Partial<ProjectDetailResponse>;
        if (signal?.aborted) return;
        const nextProject = body.project ?? null;
        setProject(nextProject);
        const reported = typeof body.resolvedDir === 'string' ? body.resolvedDir : null;
        const fallback =
          typeof nextProject?.metadata?.baseDir === 'string'
            ? nextProject.metadata.baseDir
            : null;
        setResolvedDir(reported ?? fallback);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [
      authorityKey,
      authorityMemberId,
      authorityWorkspaceId,
      boundWorkspaceId,
      projectId,
    ],
  );

  useEffect(() => {
    if (initialDetailCanSeed && !initialDetailConsumedRef.current) {
      initialDetailConsumedRef.current = true;
      return;
    }
    const controller = new AbortController();
    void fetchOnce(controller.signal);
    return () => controller.abort();
  }, [fetchOnce, initialDetailCanSeed]);

  const refresh = useCallback(() => fetchOnce(), [fetchOnce]);

  return { project, resolvedDir, loading, error, refresh };
}
