import {
  workspacePrincipalKey,
  type WorkspaceCollabContext,
} from '@open-design/contracts';

import { workspaceIdentityCacheKey } from '../collab/workspace-identity';
import type { Project } from '../types';

export type ProjectDisplayView = 'all' | 'recent' | 'drafts' | 'team';

export interface ProjectDisplaySnapshotScope {
  accountGeneration: number;
  context: WorkspaceCollabContext | null;
  view: ProjectDisplayView | undefined;
}

export interface ProjectDisplaySnapshot {
  projects: Project[];
  dirty: boolean;
}

interface StoredProjectDisplaySnapshot extends ProjectDisplaySnapshot {
  accountGeneration: number;
  /**
   * WHO this snapshot belongs to — account/workspace/member, not `role`.
   *
   * The KEY (see {@link projectDisplaySnapshotKey}) still folds in the full
   * request identity, because a read and its write always come from the same
   * shell context. Invalidation does not: a share/unshare is issued from the
   * project page, whose context comes from the daemon's scope fast path and
   * therefore always reports the placeholder `role: 'member'`. Matching that
   * against a role-bearing key meant a workspace owner's own share never marked
   * their own home grid dirty, and Back showed the pre-share state. Null when the
   * snapshot has no workspace identity (the local/signed-out bucket); a null
   * principal is never equal to anything, so that bucket stays unreachable from
   * a workspace mutation exactly as it was before.
   */
  workspacePrincipal: string | null;
  view: ProjectDisplayView | undefined;
}

export const MAX_PROJECT_DISPLAY_SNAPSHOTS = 24;

const snapshots = new Map<string, StoredProjectDisplaySnapshot>();

export function projectDisplaySnapshotKey(scope: ProjectDisplaySnapshotScope): string {
  return [
    'project-display',
    scope.accountGeneration,
    workspaceIdentityCacheKey(scope.context),
    scope.context ? scope.view ?? 'recent' : 'local',
  ].join(':');
}

export function readProjectDisplaySnapshot(key: string): ProjectDisplaySnapshot | null {
  const snapshot = snapshots.get(key);
  if (!snapshot) return null;
  // Map insertion order is the LRU order. Touch exact-key hits without ever
  // allowing one account/workspace/member key to answer another.
  snapshots.delete(key);
  snapshots.set(key, snapshot);
  return {
    projects: snapshot.projects,
    dirty: snapshot.dirty,
  };
}

export function writeProjectDisplaySnapshot(
  scope: ProjectDisplaySnapshotScope,
  projects: Project[],
): void {
  const key = projectDisplaySnapshotKey(scope);
  const snapshot: StoredProjectDisplaySnapshot = {
    accountGeneration: scope.accountGeneration,
    workspacePrincipal: workspacePrincipalKey(scope.context),
    view: scope.view,
    projects,
    dirty: false,
  };
  snapshots.delete(key);
  snapshots.set(key, snapshot);
  while (snapshots.size > MAX_PROJECT_DISPLAY_SNAPSHOTS) {
    const oldest = snapshots.keys().next().value as string | undefined;
    if (!oldest) break;
    snapshots.delete(oldest);
  }
}

/**
 * A successful local mutation or a workspace push makes every projection for
 * that exact principal stale. Keep its last-good display value for SWR, but do
 * not touch another account/workspace/member identity.
 */
export function markProjectDisplaySnapshotsDirty(input: {
  context: WorkspaceCollabContext;
  accountGeneration?: number;
}): void {
  const workspacePrincipal = workspacePrincipalKey(input.context);
  if (workspacePrincipal === null) return;
  for (const snapshot of snapshots.values()) {
    if (snapshot.workspacePrincipal !== workspacePrincipal) continue;
    if (
      input.accountGeneration !== undefined
      && snapshot.accountGeneration !== input.accountGeneration
    ) {
      continue;
    }
    snapshot.dirty = true;
  }
}

export function patchProjectDisplaySnapshots(input: {
  context: WorkspaceCollabContext;
  accountGeneration?: number;
  patch: (projects: Project[], view: ProjectDisplayView | undefined) => Project[];
}): void {
  const workspacePrincipal = workspacePrincipalKey(input.context);
  if (workspacePrincipal === null) return;
  for (const snapshot of snapshots.values()) {
    if (snapshot.workspacePrincipal !== workspacePrincipal) continue;
    if (
      input.accountGeneration !== undefined
      && snapshot.accountGeneration !== input.accountGeneration
    ) {
      continue;
    }
    snapshot.projects = input.patch(snapshot.projects, snapshot.view);
    snapshot.dirty = true;
  }
}

export function removeProjectFromDisplaySnapshots(input: {
  context: WorkspaceCollabContext;
  projectId: string;
  accountGeneration?: number;
}): void {
  patchProjectDisplaySnapshots({
    context: input.context,
    accountGeneration: input.accountGeneration,
    patch: (projects) => projects.filter((project) => project.id !== input.projectId),
  });
}

export function resetProjectDisplaySnapshots(): void {
  snapshots.clear();
}

export function projectDisplaySnapshotCount(): number {
  return snapshots.size;
}
