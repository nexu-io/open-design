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
  },
): Promise<TeamProject[]> {
  const cacheKey = `workspace-team-projects:${workspaceIdentityCacheKey(options.context)}`;
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
