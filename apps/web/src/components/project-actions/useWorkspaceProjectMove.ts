import { useCallback, useState } from 'react';
import type { WorkspaceCollabContext, WorkspaceProjectSummary } from '@open-design/contracts';
import type { TrackingProjectCollectionPage } from '@open-design/contracts/analytics';

import { useAnalytics } from '../../analytics/provider';
import { trackWorkspaceProjectActionResult } from '../../analytics/events';
import { workspaceAnalyticsDimensions } from '../../analytics/workspace';
import { notifyTeamProjectsChanged } from '../../collab/useWorkspaceContext';
import { moveWorkspaceProject, workspaceProjectMoveErrorCode } from '../../state/projects';
import type { Project } from '../../types';

export type ProjectMoveAction = 'to-team' | 'to-personal';

/** 'owner-conflict' is the daemon's TEAM_PROJECT_OWNER_CONFLICT refusal: the
 *  team hub already registers this project under another member's ownership.
 *  That state is permanent until the registered owner unshares, so it gets its
 *  own message instead of the retryable 'share' hint. */
export type ProjectMoveErrorKind = 'share' | 'unshare' | 'owner-conflict';

export interface ProjectMoveError {
  projectId: string;
  kind: ProjectMoveErrorKind;
}

/**
 * 转入 / 移出团队空间 for one project, through the same workspace move endpoint
 * the full project grid uses so cards, rail rows and in-file sharing cannot
 * drift. Owns the in-flight ids, the last failure, the optimistic shared-state
 * callbacks and the result analytics; the surface that calls it decides how to
 * show those (the card menu stays open to say 分享中… / the failure; the rail
 * re-opens its row menu for the same purpose).
 *
 * The daemon gates on `canShareProjects` (403 off-team / no rights), so the
 * shared badge is only ever raised on success.
 */
export function useWorkspaceProjectMove(input: {
  workspaceContext: WorkspaceCollabContext | null | undefined;
  analyticsPage: TrackingProjectCollectionPage;
  onProjectShared?: (project: WorkspaceProjectSummary) => void;
  onProjectShareFailed?: (projectId: string) => void;
  onProjectUnshared?: (projectId: string) => void;
  /** The request is on its way: the host may open its progress surface. */
  onMoveStart?: (project: Project, action: ProjectMoveAction) => void;
  /** The request settled; `ok` false means `error` now names the project. */
  onMoveSettled?: (project: Project, action: ProjectMoveAction, ok: boolean) => void;
}) {
  const {
    workspaceContext,
    analyticsPage,
    onProjectShared,
    onProjectShareFailed,
    onProjectUnshared,
    onMoveStart,
    onMoveSettled,
  } = input;
  const analytics = useAnalytics();
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [unsharingId, setUnsharingId] = useState<string | null>(null);
  const [error, setError] = useState<ProjectMoveError | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const shareToTeam = useCallback(async (project: Project): Promise<boolean> => {
    const startedAt = performance.now();
    const workspaceDimensions = workspaceAnalyticsDimensions(workspaceContext);
    setError(null);
    onMoveStart?.(project, 'to-team');
    setSharingId(project.id);
    try {
      const movedProject = await moveWorkspaceProject({
        projectId: project.id,
        visibility: 'team',
        workspaceContext: workspaceContext ?? null,
      });
      onProjectShared?.(movedProject);
      notifyTeamProjectsChanged();
      trackWorkspaceProjectActionResult(analytics.track, {
        page_name: analyticsPage,
        area: 'project_collection',
        action: 'move_to_team',
        result: 'success',
        requested_count: 1,
        succeeded_count: 1,
        failed_count: 0,
        duration_ms: Math.round(performance.now() - startedAt),
        ...workspaceDimensions,
      });
      onMoveSettled?.(project, 'to-team', true);
      return true;
    } catch (err) {
      onProjectShareFailed?.(project.id);
      console.warn('[useWorkspaceProjectMove] share project to team failed:', err);
      setError({
        projectId: project.id,
        kind: workspaceProjectMoveErrorCode(err) === 'TEAM_PROJECT_OWNER_CONFLICT'
          ? 'owner-conflict'
          : 'share',
      });
      trackWorkspaceProjectActionResult(analytics.track, {
        page_name: analyticsPage,
        area: 'project_collection',
        action: 'move_to_team',
        result: 'failed',
        requested_count: 1,
        succeeded_count: 0,
        failed_count: 1,
        duration_ms: Math.round(performance.now() - startedAt),
        error_code: workspaceProjectMoveErrorCode(err) ?? 'request_failed',
        ...workspaceDimensions,
      });
      onMoveSettled?.(project, 'to-team', false);
      return false;
    } finally {
      setSharingId(null);
    }
  }, [analytics.track, analyticsPage, onMoveSettled, onMoveStart, onProjectShareFailed, onProjectShared, workspaceContext]);

  const unshareFromTeam = useCallback(async (project: Project): Promise<boolean> => {
    const startedAt = performance.now();
    const workspaceDimensions = workspaceAnalyticsDimensions(workspaceContext);
    setError(null);
    onMoveStart?.(project, 'to-personal');
    setUnsharingId(project.id);
    try {
      await moveWorkspaceProject({
        projectId: project.id,
        visibility: 'personal',
        workspaceContext: workspaceContext ?? null,
      });
      onProjectUnshared?.(project.id);
      notifyTeamProjectsChanged();
      trackWorkspaceProjectActionResult(analytics.track, {
        page_name: analyticsPage,
        area: 'project_collection',
        action: 'move_to_personal',
        result: 'success',
        requested_count: 1,
        succeeded_count: 1,
        failed_count: 0,
        duration_ms: Math.round(performance.now() - startedAt),
        ...workspaceDimensions,
      });
      onMoveSettled?.(project, 'to-personal', true);
      return true;
    } catch (err) {
      console.warn('[useWorkspaceProjectMove] unshare project from team failed:', err);
      setError({ projectId: project.id, kind: 'unshare' });
      trackWorkspaceProjectActionResult(analytics.track, {
        page_name: analyticsPage,
        area: 'project_collection',
        action: 'move_to_personal',
        result: 'failed',
        requested_count: 1,
        succeeded_count: 0,
        failed_count: 1,
        duration_ms: Math.round(performance.now() - startedAt),
        error_code: workspaceProjectMoveErrorCode(err) ?? 'request_failed',
        ...workspaceDimensions,
      });
      onMoveSettled?.(project, 'to-personal', false);
      return false;
    } finally {
      setUnsharingId(null);
    }
  }, [analytics.track, analyticsPage, onMoveSettled, onMoveStart, onProjectUnshared, workspaceContext]);

  const move = useCallback(
    (project: Project, action: ProjectMoveAction) =>
      action === 'to-team' ? shareToTeam(project) : unshareFromTeam(project),
    [shareToTeam, unshareFromTeam],
  );

  return { sharingId, unsharingId, error, clearError, shareToTeam, unshareFromTeam, move };
}
