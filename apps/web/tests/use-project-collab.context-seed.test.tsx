// @vitest-environment jsdom
//
// Project collaboration accepts only a project-bound Workspace context. The
// navigation shell's cached selection may warm related catalogs, but must never
// become authority for a project whose persisted scope was not supplied.

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectCollab } from '../src/collab/useProjectCollab';
import {
  resetTeamProjectsCache,
  resetWorkspaceContextCache,
  useTeamProjects,
  useWorkspaceContext,
} from '../src/collab/useWorkspaceContext';

function teamContext(): WorkspaceCollabContext {
  const role = 'member' as const;
  const lifecycleState = 'active' as const;
  return {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    workspaceMemberId: 'wm-1',
    role,
    memberStatus: 'active',
    lifecycleState,
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role, lifecycleState }),
    displayName: 'Ma Shu',
  };
}

const TEAM_CONTEXT = teamContext();

/**
 * Context AND collab status both hang. `viewerOnly` can only come out false if
 * something other than those two answered — i.e. the seeded context plus the
 * cached hub catalog. Without both, this is the fail-closed case.
 */
function installFullyHangingFetch() {
  globalThis.fetch = vi.fn(async () => new Promise<Response>(() => {})) as typeof fetch;
}

/** Resolves context + catalog once, so the module-level caches are warm. */
function installResolvingFetch(teamProjects: unknown[]) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const pathname = new URL(String(input), 'http://d.local').pathname;
    if (pathname.endsWith('/workspace/directory')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [teamContext()] }),
      } as unknown as Response;
    }
    if (pathname.endsWith('/workspace/context')) {
      return { ok: true, status: 200, json: async () => ({ context: teamContext() }) } as unknown as Response;
    }
    if (pathname.endsWith('/workspace/projects/team')) {
      return { ok: true, status: 200, json: async () => ({ projects: teamProjects }) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
  }) as typeof fetch;
}

async function warmCaches(teamProjects: unknown[]) {
  installResolvingFetch(teamProjects);
  const ctx = renderHook(() => useWorkspaceContext());
  await waitFor(() => expect(ctx.result.current.loading).toBe(false));
  ctx.unmount();
  const team = renderHook(() => useTeamProjects());
  await waitFor(() => expect(team.result.current.loading).toBe(false));
  team.unmount();
}

/** A context read that never settles, so the only context available is the seed. */
function installNeverResolvingContextFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const pathname = new URL(String(input), 'http://d.local').pathname;
    if (pathname.endsWith('/workspace/context')) return new Promise<Response>(() => {});
    return {
      ok: true,
      status: 200,
      json: async () => ({ publishedVersion: 1, syncState: 'local_only' }),
    } as unknown as Response;
  }) as typeof fetch;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  resetWorkspaceContextCache();
  resetTeamProjectsCache();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  resetWorkspaceContextCache();
  resetTeamProjectsCache();
  vi.restoreAllMocks();
});

describe('useProjectCollab workspace-context seeding', () => {
  it('does not borrow a context the navigation shell already resolved', async () => {
    // The shell resolves the context once…
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/directory')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [teamContext()] }),
        } as unknown as Response;
      }
      if (pathname.endsWith('/workspace/context')) {
        return { ok: true, status: 200, json: async () => ({ context: teamContext() }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    }) as typeof fetch;

    const shell = renderHook(() => useWorkspaceContext());
    await waitFor(() => {
      expect(shell.result.current.loading).toBe(false);
    });
    shell.unmount();

    // Opening a project without persisted scope stays fail-closed even though
    // the shell cache is warm.
    installNeverResolvingContextFetch();
    const project = renderHook(() => useProjectCollab('p-private'));

    expect(project.result.current.viewerOnly).toBe(true);
  });

  // Acceptance #27: a member's OWN fresh private draft flashed the "这是共享项目"
  // read-only banner while `/collab/status` was still in flight. The hub catalog
  // already says the project is not shared, so the unknown window has nothing to
  // protect there. Both network reads hang here, so only the caches can answer.
  it('does not fail closed for a project the hub catalog does not list', async () => {
    await warmCaches([]);

    installFullyHangingFetch();
    const project = renderHook(() => useProjectCollab('p-private', {
      workspaceContext: TEAM_CONTEXT,
    }));
    await waitFor(() => {
      expect(project.result.current.viewerOnly).toBe(false);
    });
  });

  // The negative control: the catalog DOES list it, so the unknown window still
  // fails closed — a teammate's shared project must never flash writable.
  it('still fails closed for a project the catalog lists as shared', async () => {
    await warmCaches([
      { projectId: 'p-shared', ownerMemberId: 'someone-else', sharedAt: '2026-07-01T00:00:00.000Z' },
    ]);

    installFullyHangingFetch();
    const project = renderHook(() => useProjectCollab('p-shared', {
      workspaceContext: TEAM_CONTEXT,
    }));
    expect(project.result.current.viewerOnly).toBe(true);
  });

  // Issue #99 (rec:recvpZwaJNpVai): opening a project the viewer THEMSELVES
  // shared flashed the "这是共享项目，你不能编辑" read-only banner for 1-2s while
  // `/collab/status` was still confirming `ownerMemberId`. The hub catalog
  // already names the current member (`wm-1`, from `teamContext()`) as the
  // owner, so the on-open state must be writable with no flash even while both
  // network reads hang.
  it('does not fail closed for a shared project the viewer owns', async () => {
    await warmCaches([
      { projectId: 'p-mine', ownerMemberId: 'wm-1', sharedAt: '2026-07-01T00:00:00.000Z' },
    ]);

    installFullyHangingFetch();
    const project = renderHook(() => useProjectCollab('p-mine', {
      workspaceContext: TEAM_CONTEXT,
    }));
    expect(project.result.current.viewerOnly).toBe(false);
  });

  it('still fails closed on the first read of a session, before any context is known', async () => {
    installNeverResolvingContextFetch();
    const project = renderHook(() => useProjectCollab('p-private'));

    expect(project.result.current.viewerOnly).toBe(true);
  });

  it('does not inherit the shell cache when a test injects its own daemon', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/directory')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [teamContext()] }),
        } as unknown as Response;
      }
      if (pathname.endsWith('/workspace/context')) {
        return { ok: true, status: 200, json: async () => ({ context: teamContext() }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    }) as typeof fetch;

    const shell = renderHook(() => useWorkspaceContext());
    await waitFor(() => {
      expect(shell.result.current.loading).toBe(false);
    });
    shell.unmount();

    const injected = (async () => new Promise<Response>(() => {})) as unknown as typeof fetch;
    const project = renderHook(() => useProjectCollab('p-private', { fetch: injected }));

    expect(project.result.current.viewerOnly).toBe(true);
  });
});
