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

vi.mock('../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: vi.fn(() => ({ connected: false })),
}));

import { useTeamMembers } from '../src/collab/useTeamMembers';
import { notifyWorkspaceContextRefresh } from '../src/collab/useWorkspaceContext';
import { workspaceContextFixture } from './helpers/workspace-context';

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
  resolve: (response: Response) => void;
};

/** Which workspace the daemon is currently active in. */
let activeWorkspace: 'a' | 'b';
/** Every `/api/workspace/members` read the client issued, oldest first. */
let membersReads: PendingMembersRead[];
/** Workspaces whose members read is held open instead of answering at once. */
let slowMembersWorkspaces: Set<'a' | 'b'>;

beforeEach(() => {
  activeWorkspace = 'a';
  membersReads = [];
  slowMembersWorkspaces = new Set();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('/api/workspace/context')) {
        return Promise.resolve(jsonResponse({ context: CONTEXTS[activeWorkspace] }));
      }
      if (url.includes('/api/workspace/members')) {
        const workspace = activeWorkspace;
        const answer = jsonResponse({ members: ROSTERS[workspace] });
        if (!slowMembersWorkspaces.has(workspace)) {
          membersReads.push({ workspace, resolve: () => {} });
          return Promise.resolve(answer);
        }
        let resolve!: (response: Response) => void;
        const promise = new Promise<Response>((next) => {
          resolve = next;
        });
        membersReads.push({ workspace, resolve });
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
});
