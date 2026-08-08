// The `shouldPublish` predicate `collab-publish-watcher.ts` consults before
// attaching a file watcher to a project (see that file's read-only-gate
// invariant: watched only when team-shared AND this daemon's member is its
// owner). Extracted to its own module so the exact project-scope invariant is
// independently unit-testable without spinning up the whole server.

import type { ResourceHubPrincipal } from './resource-principal.js';

export interface CreateShouldPublishOptions {
  /** Server-authoritative owner lookup (the team hub catalog, never a client-supplied id). */
  resolveSharedProjectOwner: (projectId: string) => Promise<string | null>;
  /**
   * Resolve the immutable, authoritative Team scope bound to this exact local
   * project. A missing result means the project has no currently active,
   * writable Team identity.
   */
  resolveProjectPrincipal: (projectId: string) => Promise<ResourceHubPrincipal | null>;
  /** Remember the resolved principal so the scheduler/adapter scope the publish under it. */
  rememberTeamShare: (projectId: string, principal: ResourceHubPrincipal) => void;
  /**
   * Whether the local record for `projectId` is still an unmaterialized
   * shared-project placeholder (`isUnmaterializedSharedPlaceholder` over the
   * local project row — see collab/shared-project-placeholder.ts). Required,
   * not optional: forgetting to wire it is exactly the fresh-install wipe of
   * recvqzaDvUU6B3, where an empty placeholder on a wiped data root passed
   * the owner check and was published over the team's real content.
   */
  hasUnmaterializedPlaceholder: (projectId: string) => boolean;
}

/**
 * Whether THIS daemon should attach a file watcher to `projectId` and publish
 * its local edits: the project is team-shared, the exact principal bound to
 * this project is its OWNER (the single writer), AND that Workspace lifecycle
 * is currently ACTIVE.
 *
 * This only gates whether a NEW watch is attached — `collab-publish-
 * watcher.ts`'s `reconcile` never re-checks `shouldPublish` for a project it
 * is already watching (see that file's doc comment). The already-attached
 * case is instead closed at the transport layer with the same captured
 * project principal. No daemon-global active Workspace participates in this
 * decision, so switching Workspace cannot retarget an existing watcher.
 */
export function createShouldPublish(
  options: CreateShouldPublishOptions,
): (projectId: string) => Promise<false | ResourceHubPrincipal> {
  return async (
    projectId: string,
  ): Promise<false | ResourceHubPrincipal> => {
    // Fresh-install wipe guard (recvqzaDvUU6B3): a local record that is still
    // an unmaterialized shared-project placeholder is not content authority —
    // it must never be watched or publish, no matter what the owner check
    // says. Checked before the hub round-trips so a placeholder never even
    // reaches the catalog.
    if (options.hasUnmaterializedPlaceholder(projectId)) return false;
    const owner = await options.resolveSharedProjectOwner(projectId);
    if (!owner) return false;
    const principal = await options.resolveProjectPrincipal(projectId);
    if (principal?.lifecycleState !== 'active') return false;
    if (owner !== principal.memberId) return false;
    options.rememberTeamShare(projectId, principal);
    return principal;
  };
}
