// The ONE read of the team-shared project catalog
// (`GET /api/workspace/projects/team`).
//
// Why this module exists: the coalescing key and the payload shape must be
// owned together. `coalescedGet` is keyed by a bare string and hands the stored
// entry back through an unchecked `as Entry<T>` cast, so `T` is chosen
// independently by each call site and TypeScript cannot see a disagreement.
// Two call sites used to share the `workspace-team-projects` key while
// returning different shapes — the project page cached the response OBJECT
// (`{ projects: [...] }`), the home/community shell cached the ARRAY — and
// whichever fetch started first inside the 1s share window handed its shape to
// the other. When the project page won, `useTeamProjects` stored an object as
// its project array (its own `body.projects ?? []` normalisation never ran,
// because the coalescer short-circuits before `run()`), and the next
// `.map()` over it threw `teamProjects.map is not a function` out of a
// render-phase `useMemo` — a white screen, reproduced by switching between a
// project page and the Community tab.
//
// The invariant this module exists to hold: **every reader of the team-shared
// catalog goes through `fetchTeamProjectsCatalog()` and receives a
// `TeamProject[]`, always.** The key is deliberately module-private so no other
// call site can name it, and the return is array-checked so a malformed or
// mis-shaped payload degrades to an empty catalog instead of poisoning every
// consumer downstream.

import type {
  TeamProject,
  WorkspaceCollabContext,
  WorkspaceTeamProjectsResponse,
} from '@open-design/contracts';

import { coalescedGet, forceCoalescedGet } from '../lib/coalesced-get';
import {
  workspaceIdentityCacheKey,
  workspaceProjectHeaders,
} from './workspace-identity';

let refreshEventSequence = 0;
let refreshEventTokens = new WeakMap<object, number>();
const latestMetadataEventByProjectScope = new Map<string, number>();
// Every event advances this map so an older full-catalog response cannot
// overwrite a newer targeted metadata projection.
const latestCatalogEventByScope = new Map<string, number>();
// Only broad events advance this map. A later broad reconciliation supersedes
// an older targeted response, while metadata events for different projects do
// not unnecessarily cancel one another.
const latestBroadCatalogEventByScope = new Map<string, number>();
const MAX_TRACKED_METADATA_PROJECT_SCOPES = 256;
const MAX_TRACKED_CATALOG_SCOPES = 64;

function refreshEventGeneration(event: object): number {
  let eventGeneration = refreshEventTokens.get(event);
  if (eventGeneration === undefined) {
    eventGeneration = ++refreshEventSequence;
    refreshEventTokens.set(event, eventGeneration);
  }
  return eventGeneration;
}

function trackLatestRefresh(
  latestByScope: Map<string, number>,
  scopeKey: string,
  eventGeneration: number,
  maxScopes: number,
): void {
  const latestGeneration = latestByScope.get(scopeKey) ?? 0;
  if (eventGeneration <= latestGeneration) return;
  latestByScope.delete(scopeKey);
  latestByScope.set(scopeKey, eventGeneration);
  while (latestByScope.size > maxScopes) {
    const oldest = latestByScope.keys().next().value as string | undefined;
    if (!oldest) break;
    // Removing an old key is fail-closed for a response still in flight: its
    // `isLatest` closure observes `undefined`, never a reused generation.
    latestByScope.delete(oldest);
  }
}

/**
 * Give one broad catalog invalidation a stable semantic generation shared by
 * every mounted consumer. Distinct invalidations stay distinct even when they
 * arrive inside `forceCoalescedGet`'s time-based burst window.
 */
export function beginTeamProjectCatalogRefresh(options: {
  accountGeneration: number;
  context: WorkspaceCollabContext;
  event: object;
}): {
  cacheDiscriminator: string;
  isLatest: () => boolean;
} {
  const eventGeneration = refreshEventGeneration(options.event);
  const scopeKey = JSON.stringify([
    options.accountGeneration,
    workspaceIdentityCacheKey(options.context),
  ]);
  trackLatestRefresh(
    latestCatalogEventByScope,
    scopeKey,
    eventGeneration,
    MAX_TRACKED_CATALOG_SCOPES,
  );
  trackLatestRefresh(
    latestBroadCatalogEventByScope,
    scopeKey,
    eventGeneration,
    MAX_TRACKED_CATALOG_SCOPES,
  );
  return {
    cacheDiscriminator: `catalog-event:${eventGeneration}`,
    isLatest: () => latestCatalogEventByScope.get(scopeKey) === eventGeneration,
  };
}

/**
 * Give one thin metadata event a stable semantic generation shared by every
 * mounted consumer. The shared EventStream manager fans the same parsed payload
 * object out to all subscribers, and CustomEvent does the same with `detail`,
 * so consumers of one event retain single-flight while a later event always
 * gets a distinct request key and supersedes older responses.
 */
export function beginTeamProjectMetadataRefresh(options: {
  accountGeneration: number;
  context: WorkspaceCollabContext;
  projectId: string;
  event: object;
}): {
  cacheDiscriminator: string;
  isLatest: () => boolean;
} {
  const eventGeneration = refreshEventGeneration(options.event);
  const scopeProjectKey = JSON.stringify([
    options.accountGeneration,
    workspaceIdentityCacheKey(options.context),
    options.projectId,
  ]);
  const catalogScopeKey = JSON.stringify([
    options.accountGeneration,
    workspaceIdentityCacheKey(options.context),
  ]);
  trackLatestRefresh(
    latestCatalogEventByScope,
    catalogScopeKey,
    eventGeneration,
    MAX_TRACKED_CATALOG_SCOPES,
  );
  trackLatestRefresh(
    latestMetadataEventByProjectScope,
    scopeProjectKey,
    eventGeneration,
    MAX_TRACKED_METADATA_PROJECT_SCOPES,
  );
  return {
    cacheDiscriminator: `metadata-event:${eventGeneration}`,
    isLatest: () =>
      latestMetadataEventByProjectScope.get(scopeProjectKey) === eventGeneration
      && (latestBroadCatalogEventByScope.get(catalogScopeKey) ?? 0) <= eventGeneration,
  };
}

export function resetTeamProjectMetadataRefreshOrdering(): void {
  refreshEventSequence = 0;
  refreshEventTokens = new WeakMap<object, number>();
  latestMetadataEventByProjectScope.clear();
  latestCatalogEventByScope.clear();
  latestBroadCatalogEventByScope.clear();
}

/**
 * Narrow an untrusted catalog payload to the row array every consumer expects.
 *
 * The daemon contract (`WorkspaceTeamProjectsResponse`) declares `projects` as
 * required and non-nullable, so this never fires on a well-formed response. It
 * exists because the value can also arrive from the shared coalescing cache,
 * where the compiler is not checking anything for us.
 */
export function asTeamProjectRows(value: unknown): TeamProject[] {
  if (Array.isArray(value)) return value as TeamProject[];
  if (value !== null && typeof value === 'object') {
    const nested = (value as { projects?: unknown }).projects;
    if (Array.isArray(nested)) return nested as TeamProject[];
  }
  return [];
}

/**
 * Read the team-shared project catalog, collapsing a mount/navigation burst
 * into one request.
 *
 * `force` bypasses a settled/in-flight entry for a genuine identity or
 * workspace change, where the cached answer describes the previous identity.
 */
export async function fetchTeamProjectsCatalog(
  options: {
    context: WorkspaceCollabContext;
    force?: boolean;
    /** Explicit user refreshes own their request generation and must remain
     * independent so a newer response can supersede an older in-flight one. */
    coalesce?: boolean;
    /** Account/selection generation for provisional directory-backed reads. */
    requestGeneration?: string;
    /** Keep independent invalidation targets from sharing one forced snapshot. */
    cacheDiscriminator?: string;
  },
): Promise<TeamProject[]> {
  const cacheKey = `workspace-team-projects:${workspaceIdentityCacheKey(options.context)}`
    + `:generation:${options.requestGeneration ?? 'verified'}`
    + `:target:${options.cacheDiscriminator ?? 'catalog'}`;
  const run = async (): Promise<TeamProject[]> => {
    const response = await fetch('/api/workspace/projects/team', {
      headers: workspaceProjectHeaders(options.context),
    });
    if (!response.ok) throw new Error(`team-projects ${response.status}`);
    const body = (await response.json()) as WorkspaceTeamProjectsResponse;
    return asTeamProjectRows(body);
  };
  let projects: TeamProject[];
  if (options.coalesce === false) {
    projects = await run();
  } else if (options.force) {
    projects = await forceCoalescedGet(cacheKey, run);
  } else {
    projects = await coalescedGet(cacheKey, run);
  }
  // Belt and braces: a cache entry seeded before this module owned the key
  // (or by a future caller that reaches the coalescer some other way) must
  // still leave every consumer holding an array.
  return asTeamProjectRows(projects);
}

/**
 * Re-read one catalog row through the exact Workspace/member scope.
 * The transport is currently a compact list; callers apply only this row so
 * an older unrelated row from the same snapshot cannot roll back newer UI.
 */
export async function fetchTeamProjectCatalogEntry(options: {
  context: WorkspaceCollabContext;
  projectId: string;
  force?: boolean;
  requestGeneration?: string;
  /**
   * Semantic invalidation generation for this project. Consecutive metadata
   * events must not join an older in-flight forced read inside the coalescer's
   * burst window.
   */
  cacheDiscriminator?: string;
}): Promise<TeamProject | null> {
  const projects = await fetchTeamProjectsCatalog({
    context: options.context,
    force: options.force,
    requestGeneration: options.requestGeneration,
    cacheDiscriminator: [
      'project',
      options.projectId,
      options.cacheDiscriminator ?? 'read',
    ].join(':'),
  });
  return projects.find((project) => project.projectId === options.projectId) ?? null;
}
