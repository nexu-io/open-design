import { ConcurrencyGate, mapWithGate } from './concurrency-gate.js';
import { createSwrCache } from './swr-cache.js';
import type {
  TeamResourceRequestScope,
  TeamResourceShareRecord,
  TeamResourceSharedReadOptions,
  TeamResourceShareService,
} from './team-resource-share.js';

export const TEAM_RESOURCE_LIST_KINDS = ['design_system', 'plugin', 'skill'] as const;

export type TeamResourceListKind = (typeof TEAM_RESOURCE_LIST_KINDS)[number];

export interface TeamResourceListInvalidator {
  invalidate(scope: TeamResourceRequestScope): void;
}

export function invalidateTeamResourceListingCaches(input: {
  resourceKind?: string;
  scope: TeamResourceRequestScope;
  providers: Record<TeamResourceListKind, TeamResourceListInvalidator>;
  invalidateSharedCommand: (workspaceId: string) => void;
}): void {
  const kinds = input.resourceKind
    ? TEAM_RESOURCE_LIST_KINDS.filter((kind) => kind === input.resourceKind)
    : TEAM_RESOURCE_LIST_KINDS;
  for (const kind of kinds) {
    input.providers[kind].invalidate(input.scope);
  }
  input.invalidateSharedCommand(input.scope.principal.teamId);
}

/** How long a listing stays fresh before the next read kicks a background refresh. */
const TEAM_RESOURCE_LIST_FRESH_MS = 3000;

/**
 * Cache identity for a listing. Team resource visibility is a function of the
 * whole principal — a role or lifecycle change can add or remove entries — so
 * every field that the authority consults is part of the key.
 */
export const teamResourceScopeKey = (scope: TeamResourceRequestScope): string =>
  JSON.stringify([
    scope.principal.teamId,
    scope.principal.memberId,
    scope.principal.role,
    scope.principal.lifecycleState,
  ]);

export interface TeamResourceListing {
  ids: string[];
  resources: TeamResourceShareRecord[];
}

export interface TeamResourceListCache {
  (scope: TeamResourceRequestScope): Promise<TeamResourceListing>;
  /** Bypass the cache and re-read from the authority (post-mutation reads). */
  authoritative(scope: TeamResourceRequestScope): Promise<TeamResourceListing>;
  invalidate(scope: TeamResourceRequestScope): void;
}

export interface TeamResourceListCacheOptions {
  share: TeamResourceShareService;
  /**
   * Materialize one shared resource into the member's local copy. Optional:
   * kinds with nothing to fetch pass nothing.
   */
  sync?: (
    resource: TeamResourceShareRecord,
    scope: TeamResourceRequestScope,
  ) => Promise<void>;
  /** Drops the `vela resource shared` command cache the listing was read through. */
  invalidateSharedCommand: (workspaceId: string) => void;
  /**
   * The materialization gate, owned by the composition root and SHARED by every
   * resource kind.
   *
   * It has to be injected rather than built here. The three listing surfaces —
   * design systems, plugins, skills — are separate caches that a single client
   * poll refreshes together, so a gate built per cache bounds each kind
   * independently and the daemon's real peak becomes the cap times the number
   * of kinds. The bound only means anything if all three draw from one budget.
   */
  gate: ConcurrencyGate;
}

/**
 * SWR-cached "what has this workspace shared with me" listing, per principal,
 * optionally materializing each entry as it lands.
 */
export function createTeamResourceListCache(
  options: TeamResourceListCacheOptions,
): TeamResourceListCache {
  const { share, sync, invalidateSharedCommand, gate } = options;
  const listings = new Map<string, ReturnType<typeof createSwrCache<TeamResourceListing>>>();
  const materialize = async (
    scope: TeamResourceRequestScope,
    readOptions?: TeamResourceSharedReadOptions,
  ): Promise<TeamResourceListing> => {
    const resources = await share.sharedResources(scope, readOptions);
    if (sync) {
      await mapWithGate(resources, gate, (resource) => sync(resource, scope));
    }
    return { ids: resources.map((resource) => resource.id), resources };
  };
  const read = async (scope: TeamResourceRequestScope): Promise<TeamResourceListing> => {
    const key = teamResourceScopeKey(scope);
    let listing = listings.get(key);
    if (!listing) {
      listing = createSwrCache(
        () => materialize(scope),
        () => key,
        TEAM_RESOURCE_LIST_FRESH_MS,
      );
      listings.set(key, listing);
    }
    return listing();
  };
  return Object.assign(read, {
    authoritative(scope: TeamResourceRequestScope) {
      return materialize(scope, { authoritative: true });
    },
    invalidate(scope: TeamResourceRequestScope) {
      const key = teamResourceScopeKey(scope);
      listings.get(key)?.invalidate();
      listings.delete(key);
      invalidateSharedCommand(scope.principal.teamId);
    },
  });
}
