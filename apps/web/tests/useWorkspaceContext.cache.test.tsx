// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  resetWorkspaceContextCache,
  useWorkspaceContext,
} from '../src/collab/useWorkspaceContext';
import {
  workspaceContextFixture,
  workspaceDirectoryFixture,
} from './helpers/workspace-context';

// A resolved workspace context. Shape is intentionally partial — the hook
// round-trips `body.context` verbatim, so the test only cares that the same
// value comes back.
const SIGNED_IN = workspaceContextFixture({
  workspaceId: 'ws-1',
  workspaceMemberId: 'member-1',
  teamName: 'Acme',
  workspaceName: 'Acme',
});

function stubContextFetch(context: typeof SIGNED_IN): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      new Response(JSON.stringify(
        String(input) === '/api/workspace/directory'
          ? workspaceDirectoryFixture([context])
          : { context },
      ), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

describe('useWorkspaceContext module cache', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    resetWorkspaceContextCache();
  });

  it('seeds a remount from the last resolved context so returning home never flashes signed-out', async () => {
    stubContextFetch(SIGNED_IN);

    // First visit: starts null + loading, then resolves to the signed-in context.
    const first = renderHook(() => useWorkspaceContext());
    expect(first.result.current.context).toBeNull();
    await waitFor(() => expect(first.result.current.context).toEqual(SIGNED_IN));
    first.unmount();

    // Returning home remounts the hook. Its VERY FIRST render must already carry
    // the cached context — not null/loading — so the nav rail never paints the
    // signed-out state while the background revalidation is in flight.
    const second = renderHook(() => useWorkspaceContext());
    expect(second.result.current.context).toEqual(SIGNED_IN);
    expect(second.result.current.loading).toBe(false);
    second.unmount();
  });

  it('restores the daemon-saved workspace when a new client session has no tab selection', async () => {
    const personal = workspaceContextFixture({
      workspaceId: 'ws-personal',
      workspaceMemberId: 'member-personal',
      workspaceType: 'personal',
      workspaceName: 'Personal',
    });
    const lastUsed = workspaceContextFixture({
      workspaceId: 'ws-last-used',
      workspaceMemberId: 'member-last-used',
      workspaceName: 'Last used team',
    });
    const contextScopes: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === '/api/workspace/directory') {
          const directory = workspaceDirectoryFixture([personal, lastUsed]);
          return new Response(JSON.stringify({
            ...directory,
            activeWorkspaceId: lastUsed.workspaceId,
          }), { status: 200 });
        }
        const headers = new Headers(init?.headers);
        contextScopes.push(headers.get('x-od-workspace-id') ?? '');
        return new Response(JSON.stringify({ context: lastUsed }), { status: 200 });
      }),
    );

    const result = renderHook(() => useWorkspaceContext());

    await waitFor(() => expect(result.result.current.context).toEqual(lastUsed));
    expect(contextScopes).toEqual([lastUsed.workspaceId]);
    expect(window.sessionStorage.getItem('od.workspaceSelection.v1')).toContain(
      lastUsed.workspaceId,
    );
  });

  it('fills a missing context workspace name from the verified tab selection', async () => {
    const legacyContext = workspaceContextFixture({
      workspaceId: 'ws-legacy',
      workspaceMemberId: 'member-legacy',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        new Response(JSON.stringify(
          String(input) === '/api/workspace/directory'
            ? {
                items: [{
                  workspaceId: 'ws-legacy',
                  workspaceName: 'QA Team',
                  workspaceType: 'team',
                  workspaceMemberId: 'member-legacy',
                  role: 'member',
                  memberStatus: 'active',
                  lifecycleState: 'active',
                }],
                activeWorkspaceId: null,
              }
            : { context: legacyContext },
        ), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = renderHook(() => useWorkspaceContext());
    await waitFor(() => {
      expect(result.result.current.context).toMatchObject({
        workspaceId: 'ws-legacy',
        workspaceMemberId: 'member-legacy',
        workspaceName: 'QA Team',
      });
    });
  });

  it('keeps a verified context when a legacy directory row omits workspaceName', async () => {
    const legacyContext = workspaceContextFixture({
      workspaceId: 'ws-legacy-no-name',
      workspaceMemberId: 'member-legacy-no-name',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        new Response(JSON.stringify(
          String(input) === '/api/workspace/directory'
            ? {
                items: [{
                  workspaceId: 'ws-legacy-no-name',
                  workspaceType: 'team',
                  workspaceMemberId: 'member-legacy-no-name',
                  role: 'member',
                  memberStatus: 'active',
                  lifecycleState: 'active',
                }],
                activeWorkspaceId: null,
              }
            : { context: legacyContext },
        ), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = renderHook(() => useWorkspaceContext());
    await waitFor(() => expect(result.result.current.loading).toBe(false));
    expect(result.result.current.context).toEqual(legacyContext);
    expect(result.result.current.failure).toBeUndefined();
  });
});
