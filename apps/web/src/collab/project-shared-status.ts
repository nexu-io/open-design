// Shared "is this project visible to the workspace?" check (Batch A §4.3).
//
// FileWorkspace and FileViewer each used to carry an identical private copy
// of this helper, so opening one project fired the same `/collab/status` GET
// (and potentially the same team-directory fallback) once per component —
// the duplicated immediate status reads in
// evidence/electron-project-waterfall-20260727. Both copies now live here,
// on top of the single-flight status read every other consumer shares.

import type { WorkspaceCollabContext } from '@open-design/contracts';

import { fetchProjectCollabStatus } from './collab-client';
import { fetchTeamProjectsCatalog } from './team-projects-catalog';

export async function projectIsSharedWithWorkspace(
  projectId: string,
  workspaceContext: WorkspaceCollabContext | null,
): Promise<boolean> {
  try {
    const body = await fetchProjectCollabStatus(projectId, {
      ...(workspaceContext ? { workspaceContext } : {}),
    });
    if (body) {
      if (typeof body.ownerMemberId === 'string' && body.ownerMemberId.trim()) return true;
      if (typeof body.syncState === 'string' && body.syncState !== 'local_only') return true;
    }
  } catch {
    // Fall through to the team-project directory below.
  }
  if (!workspaceContext) return false;
  try {
    const projects = await fetchTeamProjectsCatalog({ context: workspaceContext });
    return projects.some((project) => project.projectId === projectId);
  } catch {
    return false;
  }
}
