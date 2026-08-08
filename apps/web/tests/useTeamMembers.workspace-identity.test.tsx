// @vitest-environment jsdom

// Red spec: the member-directory read must be cached per workspace identity.
//
// `coalescedGet` is a CACHE with a 1s TTL, not just in-flight dedupe. Keyed on a
// constant `'workspace-members'`, the roster the client read while standing in
// workspace A is handed to workspace B for the whole share window — and while
// A's read is still in flight, B joins it unconditionally, with no window at
// all.
//
// The user-visible symptom is the creator line on project cards:
// `RecentProjectsStrip.resolveCreator` turns a team-shared project's
// `ownerMemberId` into a display name through `useTeamMembers().resolve`, so a
// leaked roster renders the previous workspace's teammate name (or falls back to
// the generic 团队成员) beside cards in the workspace the user just switched to.

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollabCloudMemberDirectoryEntry } from '@open-design/contracts';

const workspaceInvalidationHarness = vi.hoisted(() => ({
  handlers: null as Record<string, () => void> | null,
}));

vi.mock('../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: vi.fn((handlers: Record<string, () => void>) => {
    workspaceInvalidationHarness.handlers = handlers;
    return { connected: false };
  }),
}));

import {
  currentUserDirectoryEntry,
  useTeamMembers,
} from '../src/collab/useTeamMembers';
import {
  notifyWorkspaceContextRefresh,
  useWorkspaceContext,
} from '../src/collab/useWorkspaceContext';
import {
  workspaceContextFixture,
  workspaceDirectoryFixture,
} from './helpers/workspace-context';
import { evictCoalescedGet } from '../src/lib/coalesced-get';
import { workspaceIdentityCacheKey } from '../src/collab/workspace-identity';

const CONTEXTS = {
  a: workspaceContextFixture({ workspaceId: 'ws-a', workspaceMemberId: 'mem-a' }),
  b: workspaceContextFixture({ workspaceId: 'ws-b', workspaceMemberId: 'mem-b' }),
};

const ROSTERS: Record<'a' | 'b', CollabCloudMemberDirectoryEntry[]> = {
  a: [{ memberId: 'mem-a-peer', displayName: 'Workspace A teammate', role: 'owner' }],
  b: [{ memberId: 'mem-b-peer', displayName: 'Workspace B teammate', role: 'owner' }],
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

type PendingMembersRead = {
  workspace: 'a' | 'b';
  workspaceId: string | null;
  workspaceMemberId: string | null;
  resolve: (response: Response) => void;
};

/** Which workspace the daemon is currently active in. */
let activeWorkspace: 'a' | 'b';
/** Every `/api/workspace/members` read the client issued, oldest first. */
let membersReads: PendingMembersRead[];
/** Workspaces whose members read is held open instead of answering at once. */
let slowMembersWorkspaces: Set<'a' | 'b'>;
let failedMembersWorkspaces: Set<'a' | 'b'>;

beforeEach(() => {
  activeWorkspace = 'a';
  membersReads = [];
  slowMembersWorkspaces = new Set();
  failedMembersWorkspaces = new Set();
  workspaceInvalidationHarness.handlers = null;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes('/api/workspace/directory')) {
        return Promise.resolve(
          jsonResponse(workspaceDirectoryFixture([CONTEXTS[activeWorkspace]])),
        );
      }
      if (url.includes('/api/workspace/context')) {
        return Promise.resolve(jsonResponse({ context: CONTEXTS[activeWorkspace] }));
      }
      if (url.includes('/api/workspace/members')) {
        const headers = new Headers(init?.headers);
        const workspaceId = headers.get('x-od-workspace-id');
        const workspaceMemberId = headers.get('x-od-workspace-member-id');
        const workspace = activeWorkspace;
        if (failedMembersWorkspaces.has(workspace)) {
          membersReads.push({ workspace, workspaceId, workspaceMemberId, resolve: () => {} });
          return Promise.resolve(
            new Response(JSON.stringify({ error: 'UPSTREAM_UNAVAILABLE' }), {
              status: 503,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
        const answer = jsonResponse({ members: ROSTERS[workspace] });
        if (!slowMembersWorkspaces.has(workspace)) {
          membersReads.push({ workspace, workspaceId, workspaceMemberId, resolve: () => {} });
          return Promise.resolve(answer);
        }
        let resolve!: (response: Response) => void;
        const promise = new Promise<Response>((next) => {
          resolve = next;
        });
        membersReads.push({ workspace, workspaceId, workspaceMemberId, resolve });
        return promise;
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useTeamMembers caches the roster per workspace identity', () => {
  it('never resolves a member against the workspace the user just left', async () => {
    slowMembersWorkspaces.add('a');
    const hook = renderHook(() => useTeamMembers());
    await waitFor(() => {
      expect(membersReads).toHaveLength(1);
    });
    expect(membersReads[0]?.workspace).toBe('a');
    expect(membersReads[0]?.workspaceId).toBe(CONTEXTS.a.workspaceId);
    expect(membersReads[0]?.workspaceMemberId).toBe(CONTEXTS.a.workspaceMemberId);

    // The user switches workspace: the daemon's active workspace is now B, and
    // the context read that follows the switch says so. A's roster read is
    // still in flight, so nothing has evicted it.
    activeWorkspace = 'b';
    await act(async () => {
      notifyWorkspaceContextRefresh();
    });

    // The roster the hook exposes must describe B. A read keyed without the
    // identity would instead join (or share) A's read and answer with A's
    // teammate.
    await waitFor(() => {
      expect(hook.result.current.members).toEqual(ROSTERS.b);
    });
    expect(membersReads[1]?.workspaceId).toBe(CONTEXTS.b.workspaceId);
    expect(membersReads[1]?.workspaceMemberId).toBe(CONTEXTS.b.workspaceMemberId);
    expect(hook.result.current.resolve('mem-b-peer')?.displayName).toBe(
      'Workspace B teammate',
    );

    // A's read finally lands. It was issued for an identity the user has left,
    // so it must not define B's roster either.
    await act(async () => {
      membersReads[0]?.resolve(jsonResponse({ members: ROSTERS.a }));
    });
    expect(hook.result.current.members).toEqual(ROSTERS.b);
    expect(hook.result.current.resolve('mem-a-peer')).toBeNull();

    hook.unmount();
  });

  it('masks workspace A roster and roles while workspace B context is pending', async () => {
    let holdWorkspaceContext = false;
    let resolveWorkspaceContext!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        if (url.includes('/api/workspace/directory')) {
          return Promise.resolve(
            jsonResponse(workspaceDirectoryFixture([CONTEXTS[activeWorkspace]])),
          );
        }
        if (url.includes('/api/workspace/context')) {
          if (!holdWorkspaceContext) {
            return Promise.resolve(
              jsonResponse({ context: CONTEXTS[activeWorkspace] }),
            );
          }
          return new Promise<Response>((resolve) => {
            resolveWorkspaceContext = resolve;
          });
        }
        if (url.includes('/api/workspace/members')) {
          const headers = new Headers(init?.headers);
          const workspaceId = headers.get('x-od-workspace-id');
          const workspace =
            workspaceId === CONTEXTS.b.workspaceId ? 'b' : 'a';
          return Promise.resolve(jsonResponse({ members: ROSTERS[workspace] }));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    const hook = renderHook(() => {
      const { context, identityChangePending } = useWorkspaceContext();
      return useTeamMembers(
        currentUserDirectoryEntry(identityChangePending ? null : context),
      );
    });
    await waitFor(() => {
      expect(hook.result.current.members).toEqual(ROSTERS.a);
    });
    expect(hook.result.current.resolve('mem-a-peer')?.role).toBe('owner');
    expect(hook.result.current.resolve(CONTEXTS.a.workspaceMemberId)?.role).toBe(
      CONTEXTS.a.role,
    );

    activeWorkspace = 'b';
    holdWorkspaceContext = true;
    act(() => {
      notifyWorkspaceContextRefresh();
    });
    await waitFor(() => {
      expect(resolveWorkspaceContext).toBeTypeOf('function');
    });

    expect(hook.result.current.members).toEqual([]);
    expect(hook.result.current.resolve('mem-a-peer')).toBeNull();
    expect(hook.result.current.resolve(CONTEXTS.a.workspaceMemberId)).toBeNull();

    await act(async () => {
      holdWorkspaceContext = false;
      resolveWorkspaceContext(jsonResponse({ context: CONTEXTS.b }));
    });
    await waitFor(() => {
      expect(hook.result.current.members).toEqual(ROSTERS.b);
    });
    expect(hook.result.current.resolve('mem-b-peer')?.role).toBe('owner');
  });

  it('retains the current workspace last-good roster when a refresh fails', async () => {
    const hook = renderHook(() => useTeamMembers());
    await waitFor(() => {
      expect(hook.result.current.members).toEqual(ROSTERS.a);
    });

    failedMembersWorkspaces.add('a');
    evictCoalescedGet(
      `workspace-members:${workspaceIdentityCacheKey(CONTEXTS.a)}`,
    );
    await act(async () => {
      workspaceInvalidationHarness.handlers?.['members-changed']?.();
    });
    await waitFor(() => {
      expect(membersReads).toHaveLength(2);
    });

    expect(hook.result.current.members).toEqual(ROSTERS.a);
    expect(hook.result.current.resolve('mem-a-peer')?.displayName).toBe(
      'Workspace A teammate',
    );
  });
});
