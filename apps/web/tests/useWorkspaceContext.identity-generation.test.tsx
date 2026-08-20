// @vitest-environment jsdom

// Red spec: `GET /api/workspace/context` is the read that ESTABLISHES the
// caller's identity, so its cache key cannot name the identity it is fetching.
// What it can name is which identity GENERATION the caller is asking about — and
// a workspace switch defines a new one.
//
// Without that, two switches inside `forceCoalescedGet`'s 250ms burst window
// collapse into one read: the second switch is judged part of the first's
// broadcast burst, skips the eviction, and is served the answer that was fetched
// for the workspace the user already left. Nothing re-reads until the next poll
// (30s connected, 120s on the SSE floor), so the whole shell — rail name, plan
// nameplate, every permission judgement derived from the context — describes the
// wrong workspace for that long.

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: vi.fn(() => ({ connected: false })),
}));

import {
  notifyWorkspaceContextRefresh,
  useWorkspaceContext,
} from '../src/collab/useWorkspaceContext';
import {
  workspaceContextFixture,
  workspaceDirectoryFixture,
} from './helpers/workspace-context';

const CONTEXTS = {
  a: workspaceContextFixture({ workspaceId: 'ws-a', workspaceMemberId: 'mem-a' }),
  b: workspaceContextFixture({ workspaceId: 'ws-b', workspaceMemberId: 'mem-b' }),
  c: workspaceContextFixture({ workspaceId: 'ws-c', workspaceMemberId: 'mem-c' }),
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

let activeWorkspace: 'a' | 'b' | 'c';
let contextReads: { workspace: 'a' | 'b' | 'c'; resolve: (r: Response) => void }[];
let slowWorkspaces: Set<'a' | 'b' | 'c'>;

beforeEach(() => {
  activeWorkspace = 'a';
  contextReads = [];
  slowWorkspaces = new Set();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('/api/workspace/directory')) {
        return Promise.resolve(
          jsonResponse(workspaceDirectoryFixture([CONTEXTS[activeWorkspace]])),
        );
      }
      if (!url.includes('/api/workspace/context')) {
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }
      const workspace = activeWorkspace;
      const answer = jsonResponse({ context: CONTEXTS[workspace] });
      if (!slowWorkspaces.has(workspace)) {
        contextReads.push({ workspace, resolve: () => {} });
        return Promise.resolve(answer);
      }
      let resolve!: (response: Response) => void;
      const promise = new Promise<Response>((next) => {
        resolve = next;
      });
      contextReads.push({ workspace, resolve });
      return promise;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useWorkspaceContext keys its read on the identity generation', () => {
  it('does not serve the first switch answer to a second switch in the same burst', async () => {
    const hook = renderHook(() => useWorkspaceContext());
    await waitFor(() => {
      expect(hook.result.current.context?.workspaceId).toBe('ws-a');
    });

    // Switch A -> B. This read is slow (vela-backed context reads take up to
    // seconds), so it is still in flight when the next switch happens.
    slowWorkspaces.add('b');
    activeWorkspace = 'b';
    act(() => {
      notifyWorkspaceContextRefresh();
    });
    await waitFor(() => {
      expect(contextReads).toHaveLength(2);
    });
    expect(contextReads[1]?.workspace).toBe('b');

    // Switch B -> C, inside the 250ms burst window. This is a SECOND identity
    // change, not a second consumer reacting to the first one's broadcast, so it
    // must produce its own read.
    activeWorkspace = 'c';
    act(() => {
      notifyWorkspaceContextRefresh();
    });

    await act(async () => {
      contextReads[1]?.resolve(jsonResponse({ context: CONTEXTS.b }));
    });

    await waitFor(() => {
      expect(hook.result.current.context?.workspaceId).toBe('ws-c');
      expect(hook.result.current.context?.workspaceMemberId).toBe('mem-c');
    });
    expect(hook.result.current.loading).toBe(false);

    hook.unmount();
  });

  it('still collapses one broadcast heard by many mounted consumers into one read', async () => {
    const first = renderHook(() => useWorkspaceContext());
    const second = renderHook(() => useWorkspaceContext());
    const third = renderHook(() => useWorkspaceContext());
    await waitFor(() => {
      expect(first.result.current.context?.workspaceId).toBe('ws-a');
      expect(second.result.current.context?.workspaceId).toBe('ws-a');
      expect(third.result.current.context?.workspaceId).toBe('ws-a');
    });
    const readsBeforeSwitch = contextReads.length;

    // ONE switch, heard by three mounted consumers in the same synchronous
    // dispatch pass. Keying on the generation must not turn that single change
    // into three requests — that is the thundering herd `forceCoalescedGet`
    // exists to prevent.
    activeWorkspace = 'b';
    await act(async () => {
      notifyWorkspaceContextRefresh();
    });
    await waitFor(() => {
      expect(first.result.current.context?.workspaceId).toBe('ws-b');
      expect(second.result.current.context?.workspaceId).toBe('ws-b');
      expect(third.result.current.context?.workspaceId).toBe('ws-b');
    });
    expect(contextReads.length - readsBeforeSwitch).toBe(1);

    first.unmount();
    second.unmount();
    third.unmount();
  });
});
