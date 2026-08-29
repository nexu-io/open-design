// @vitest-environment jsdom

// Project scope is persisted project state, never shell navigation state.
// An unbound project therefore stays unbound even while the left navigation
// selects A, B, or C; the scope request must carry no ambient Workspace
// identity for the daemon to reinterpret.

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';

vi.mock('../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: vi.fn(() => ({ connected: false })),
}));

import { useProjectWorkspaceScope } from '../src/collab/useProjectWorkspaceScope';
import { notifyWorkspaceContextRefresh } from '../src/collab/useWorkspaceContext';

const PROJECT_ID = 'project-unbound';

function workspaceContext(
  workspaceId: string,
  workspaceMemberId: string,
): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType: 'team',
    workspaceMemberId,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team_plus',
    providerMode: 'platform_credits',
    seatSummary: {
      seatLimit: 5,
      usedSeats: 2,
      availableSeats: 3,
      isSeatFull: false,
    },
    permissions: {
      canManageMembers: false,
      canManageBilling: false,
      canInviteMembers: false,
      canManageAutoRecharge: false,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true,
      canManageSharedResources: false,
    },
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

let scopeReads: Headers[];

beforeEach(() => {
  scopeReads = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (!url.includes('/workspace-scope')) {
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }
      scopeReads.push(new Headers(init?.headers));
      return Promise.resolve(jsonResponse({
        scope: {
          kind: 'unbound',
          projectId: PROJECT_ID,
          workspaceId: null,
          context: null,
        },
      }));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useProjectWorkspaceScope ignores shell Workspace selection', () => {
  it('reads persisted scope without ambient Workspace headers', async () => {
    const hook = renderHook(() => useProjectWorkspaceScope(PROJECT_ID));
    await waitFor(() => {
      expect(hook.result.current.loading).toBe(false);
    });

    expect(hook.result.current.scope).toEqual({
      kind: 'unbound',
      projectId: PROJECT_ID,
      workspaceId: null,
      context: null,
    });
    expect(scopeReads).toHaveLength(1);
    expect(
      [...scopeReads[0]!.keys()].filter((name) => name.startsWith('x-od-workspace-')),
    ).toEqual([]);
  });

  it('bootstraps a bound project with the matching exact caller identity', async () => {
    const caller = workspaceContext('workspace-a', 'member-a');
    const hook = renderHook(() =>
      useProjectWorkspaceScope('project-bound', caller, 'workspace-a'),
    );
    await waitFor(() => expect(scopeReads).toHaveLength(1));

    expect(Object.fromEntries(scopeReads[0]!.entries())).toMatchObject({
      'x-od-workspace-id': 'workspace-a',
      'x-od-workspace-member-id': 'member-a',
    });
    hook.unmount();
  });

  it('does not issue a headerless bootstrap for a known bound project', async () => {
    const caller = workspaceContext('workspace-b', 'member-b');
    const hook = renderHook(() =>
      useProjectWorkspaceScope('project-bound', caller, 'workspace-a'),
    );

    await waitFor(() => {
      expect(hook.result.current).toEqual({
        loading: false,
        scope: null,
        failure: 'forbidden',
      });
    });
    expect(scopeReads).toHaveLength(0);
    hook.unmount();
  });

  it('revalidates after a navigation change without borrowing the selected Workspace', async () => {
    const hook = renderHook(() => useProjectWorkspaceScope(PROJECT_ID));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    act(() => notifyWorkspaceContextRefresh());
    await waitFor(() => expect(scopeReads.length).toBeGreaterThanOrEqual(2));

    expect(hook.result.current.scope).toMatchObject({
      kind: 'unbound',
      workspaceId: null,
      context: null,
    });
    for (const headers of scopeReads) {
      expect(
        [...headers.keys()].filter((name) => name.startsWith('x-od-workspace-')),
      ).toEqual([]);
    }
  });

  it('keeps a settled unbound scope while the ambient Team caller changes', async () => {
    const callerA = workspaceContext('workspace-a', 'member-a');
    const callerB = workspaceContext('workspace-b', 'member-b');
    const fetchMock = vi.fn(async () => jsonResponse({
      scope: {
        kind: 'unbound',
        projectId: PROJECT_ID,
        workspaceId: null,
        context: null,
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const hook = renderHook(
      ({ caller }) => useProjectWorkspaceScope(PROJECT_ID, caller, null),
      { initialProps: { caller: callerA as WorkspaceCollabContext | null } },
    );
    await waitFor(() => expect(hook.result.current).toEqual({
      loading: false,
      scope: {
        kind: 'unbound',
        projectId: PROJECT_ID,
        workspaceId: null,
        context: null,
      },
    }));

    hook.rerender({ caller: callerB });
    expect(hook.result.current).toEqual({
      loading: false,
      scope: {
        kind: 'unbound',
        projectId: PROJECT_ID,
        workspaceId: null,
        context: null,
      },
    });

    hook.rerender({ caller: null });
    expect(hook.result.current).toEqual({
      loading: false,
      scope: {
        kind: 'unbound',
        projectId: PROJECT_ID,
        workspaceId: null,
        context: null,
      },
    });
    await act(async () => {
      for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('accepts the in-flight unbound answer when the ambient Team caller changes', async () => {
    const callerA = workspaceContext('workspace-a', 'member-a');
    const callerB = workspaceContext('workspace-b', 'member-b');
    const firstScope = deferred<Response>();
    const never = new Promise<Response>(() => {});
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => firstScope.promise)
      .mockImplementation(() => never);
    vi.stubGlobal('fetch', fetchMock);

    const hook = renderHook(
      ({ caller }) => useProjectWorkspaceScope(PROJECT_ID, caller, null),
      { initialProps: { caller: callerA } },
    );
    expect(hook.result.current).toEqual({ loading: true, scope: null });

    hook.rerender({ caller: callerB });
    await act(async () => {
      firstScope.resolve(jsonResponse({
        scope: {
          kind: 'unbound',
          projectId: PROJECT_ID,
          workspaceId: null,
          context: null,
        },
      }));
      await firstScope.promise;
    });

    await waitFor(() => expect(hook.result.current).toEqual({
      loading: false,
      scope: {
        kind: 'unbound',
        projectId: PROJECT_ID,
        workspaceId: null,
        context: null,
      },
    }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
