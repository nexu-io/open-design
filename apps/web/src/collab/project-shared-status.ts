// Shared "is this project visible to the workspace?" check (Batch A §4.3).
//
// FileWorkspace and FileViewer each used to carry an identical private copy
// of this helper, so opening one project fired the same `/collab/status` GET
// (and potentially the same team-directory fallback) once per component —
// the duplicated immediate status reads in
// evidence/electron-project-waterfall-20260727. Both copies now live here,
// on top of the single-flight status read every other consumer shares.

import type { WorkspaceCollabContext } from '@open-design/contracts';

import { evictProjectCollabStatusRead, fetchProjectCollabStatus } from './collab-client';
import { fetchTeamProjectsCatalog } from './team-projects-catalog';
import { workspaceIdentityCacheKey } from './workspace-identity';

// One native change event is delivered synchronously to all mounted viewers.
// Share its fresh read without joining a different event's old burst result.
const eventScopeReads = new WeakMap<Event, Map<string, Promise<boolean>>>();

export function projectIsSharedWithWorkspace(
  projectId: string,
  workspaceContext: WorkspaceCollabContext | null,
  options?: { event?: Event },
): Promise<boolean> {
  const event = options?.event;
  if (!event) return readWorkspaceScope(projectId, workspaceContext, false);
  let reads = eventScopeReads.get(event);
  if (!reads) {
    reads = new Map();
    eventScopeReads.set(event, reads);
  }
  const key = `${workspaceIdentityCacheKey(workspaceContext ?? undefined)}|${projectId}`;
  let read = reads.get(key);
  if (!read) {
    evictProjectCollabStatusRead(projectId, '', workspaceContext ?? undefined);
    read = readWorkspaceScope(projectId, workspaceContext, true);
    reads.set(key, read);
  }
  return read;
}

async function readWorkspaceScope(
  projectId: string,
  workspaceContext: WorkspaceCollabContext | null,
  fresh: boolean,
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
    const projects = await fetchTeamProjectsCatalog({ context: workspaceContext, ...(fresh ? { coalesce: false } : {}) });
    return projects.some((project) => project.projectId === projectId);
  } catch {
    return false;
  }
}
