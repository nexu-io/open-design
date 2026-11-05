// Project visibility records whether a project is explicitly shared with its
// workspace members. Personal and Team workspaces can both host shared
// projects; the persisted workspace id stays pinned across local selection
// changes. The directory type registry remains a presentation hint only.

import type { WorkspaceType } from '@open-design/contracts';
import { resolveWorkspaceScope, type WorkspaceScope } from './workspace-scope.js';

/** Minimal shape of anything that names a workspace and its type. Structural on
 *  purpose so both `WorkspaceDirectoryItem` and `WorkspaceCollabContext` fit. */
export interface WorkspaceTypeFact {
  workspaceId?: string | null;
  workspaceType?: string | null;
}

/**
 * What the daemon has learned about each workspace's type.
 *
 * Deliberately synchronous and best-effort: it is a memo of facts that flowed
 * past on reads the daemon already performs (the workspace directory the web
 * fetches on every load, the workspace context the invalidation poller reads
 * every 15s). Nothing here fetches. An id it has never seen answers `null`, and
 * every consumer treats `null` as "no opinion".
 */
export interface WorkspaceTypeRegistry {
  learn(facts: readonly WorkspaceTypeFact[] | WorkspaceTypeFact | null | undefined): void;
  typeOf(workspaceId: string | null | undefined): WorkspaceType | null;
  /** True ONLY on positive evidence that this workspace is personal. */
  isKnownPersonal(workspaceId: string | null | undefined): boolean;
}

function normalizeId(workspaceId: string | null | undefined): string {
  return typeof workspaceId === 'string' ? workspaceId.trim() : '';
}

function normalizeType(workspaceType: string | null | undefined): WorkspaceType | null {
  return workspaceType === 'personal' || workspaceType === 'team' ? workspaceType : null;
}

export function createWorkspaceTypeRegistry(): WorkspaceTypeRegistry {
  const types = new Map<string, WorkspaceType>();
  const typeOf = (workspaceId: string | null | undefined): WorkspaceType | null => {
    const id = normalizeId(workspaceId);
    return id ? types.get(id) ?? null : null;
  };
  return {
    learn(facts) {
      if (!facts) return;
      for (const fact of Array.isArray(facts) ? facts : [facts as WorkspaceTypeFact]) {
        const id = normalizeId(fact?.workspaceId);
        const type = normalizeType(fact?.workspaceType);
        if (!id || !type) continue;
        types.set(id, type);
      }
    },
    typeOf,
    // Bound, not a method: consumers routinely pass this around on its own.
    isKnownPersonal: (workspaceId) => typeOf(workspaceId) === 'personal',
  };
}

/**
 * The workspace scope for a PROJECT-scoped collab call.
 *
 * The project's pinned workspace outranks the local selection, so switching
 * workspaces on another device cannot re-aim this project's collaboration.
 */
export function projectCollabScope(input: {
  projectWorkspaceId: string | null | undefined;
  localSelection: string | null | undefined;
}): WorkspaceScope {
  const pinned = normalizeId(input.projectWorkspaceId);
  return resolveWorkspaceScope({
    projectWorkspaceId: pinned,
    localSelection: input.localSelection ?? null,
  });
}
