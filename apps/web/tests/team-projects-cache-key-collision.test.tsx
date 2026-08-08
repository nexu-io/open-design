// @vitest-environment jsdom
//
// White-screen regression guard: `Uncaught TypeError: e.teamProjects.map is not
// a function` (packaged 0.16.2-beta.139), reproduced by switching between a
// project page and the Community/home tab.
//
// Two call sites used to share the `workspace-team-projects` coalescing key
// while returning INCOMPATIBLE shapes:
//
//   - `projectIsSharedWithWorkspace()` (project page)  -> `{ projects: [...] }`
//   - `useTeamProjects()`              (home/community) -> `[...]`
//
// `coalescedGet` is keyed by a bare string and casts the stored entry
// (`entries.get(key) as Entry<T>`), so TypeScript cannot see the conflict: each
// call site independently instantiates `T`. Whichever call lands first inside
// the 1s share window wins, and the other receives the wrong type. When the
// project page won, `useTeamProjects` stored the RESPONSE OBJECT as its project
// array — `body.projects ?? []` never ran, because the coalescer short-circuits
// before `run()` — and the first `.map()` over it took the whole app down.
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSharedProjectPredicate } from '../src/collab/all-projects-list';
import { projectIsSharedWithWorkspace } from '../src/collab/project-shared-status';
import {
  resetTeamProjectsCache,
  resetWorkspaceContextCache,
  useTeamProjects,
} from '../src/collab/useWorkspaceContext';
import { resetCoalescedGet } from '../src/lib/coalesced-get';
import {
  workspaceContextFixture,
  workspaceDirectoryFixture,
} from './helpers/workspace-context';

const TEAM_PROJECT = {
  projectId: 'p-shared',
  ownerMemberId: 'member-owner',
  name: 'Shared deck',
};
const TEAM_CONTEXT = workspaceContextFixture({
  workspaceId: 'workspace-team',
  workspaceMemberId: 'member-viewer',
});

function stubFetch(): void {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/workspace/directory')) {
      return new Response(JSON.stringify(workspaceDirectoryFixture([TEAM_CONTEXT])), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    // Force `projectIsSharedWithWorkspace` past its per-project status probe so
    // it falls through to the shared team-directory read, exactly as it does on
    // a project page whose collab status is unavailable.
    if (url.includes('/collab/status')) {
      return new Response('not found', { status: 404 });
    }
    if (url.includes('/api/workspace/context')) {
      return new Response(JSON.stringify({ context: TEAM_CONTEXT }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/api/workspace/projects/team')) {
      return new Response(JSON.stringify({ projects: [TEAM_PROJECT] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
}

describe('team-projects coalescing key is shape-safe across call sites', () => {
  beforeEach(() => {
    resetCoalescedGet();
    resetWorkspaceContextCache();
    resetTeamProjectsCache();
    stubFetch();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    resetCoalescedGet();
    resetWorkspaceContextCache();
    resetTeamProjectsCache();
  });

  it('useTeamProjects() still yields an ARRAY when a project page primed the shared cache first', async () => {
    // 1. Project page: caches the team directory under the shared key.
    await projectIsSharedWithWorkspace('p-shared', TEAM_CONTEXT);

    // 2. User switches to Community/home inside the share window; this mount
    //    joins the entry the project page just settled.
    const { result } = renderHook(() => useTeamProjects());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(Array.isArray(result.current.projects)).toBe(true);
    expect(result.current.projects.map((project) => project.projectId)).toEqual(['p-shared']);
  });

  it('projectIsSharedWithWorkspace() still answers correctly when home primed the shared cache first', async () => {
    // The mirror race. When `useTeamProjects` wins, the project page used to
    // read `.projects` off an array (undefined), throw, and silently report the
    // project as NOT shared — a wrong answer rather than a crash.
    const { result } = renderHook(() => useTeamProjects());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await expect(projectIsSharedWithWorkspace('p-shared', TEAM_CONTEXT)).resolves.toBe(true);
  });
});

describe('shared-project predicate never white-screens on a malformed catalog', () => {
  // Defense in depth. Even if some future reader hands this helper a non-array,
  // the all-projects grid must degrade to "nothing is shared" instead of
  // throwing out of a useMemo and unmounting the entire app shell.
  it.each([
    ['a response object', { projects: [] }],
    ['undefined', undefined],
    ['null', null],
    ['a string', 'not-an-array'],
  ])('tolerates %s', (_label, malformed) => {
    const predicate = createSharedProjectPredicate({
      teamProjects: malformed as never,
    });
    expect(() => predicate('p-shared')).not.toThrow();
    expect(predicate('p-shared')).toBe(false);
  });

  it('still honours the session layer when the hub catalog is malformed', () => {
    const predicate = createSharedProjectPredicate({
      teamProjects: { projects: [] } as never,
      sharedThisSession: new Set(['p-optimistic']),
    });
    expect(predicate('p-optimistic')).toBe(true);
  });
});
