// Fetches `GET /api/projects/:id` once on mount and caches the response,
// surfacing the `resolvedDir` field added in PR #451 prereq commit. The
// daemon route returns `ProjectDetailResponse` (project + resolvedDir)
// for current builds; older daemons may return `ProjectResponse` (no
// resolvedDir), so we fall back to `metadata.baseDir` when present and
// emit `null` otherwise so callers can degrade their UI gracefully.

import { useCallback, useEffect, useState } from 'react';
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

export function useProjectDetail(
  projectId: string,
  workspaceContext: WorkspaceCollabContext | null = null,
  persistedProjectWorkspaceId?: string | null,
): ProjectDetailState {
  const [project, setProject] = useState<Project | null>(null);
  const [resolvedDir, setResolvedDir] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
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
    const controller = new AbortController();
    void fetchOnce(controller.signal);
    return () => controller.abort();
  }, [fetchOnce]);

  const refresh = useCallback(() => fetchOnce(), [fetchOnce]);

  return { project, resolvedDir, loading, error, refresh };
}
