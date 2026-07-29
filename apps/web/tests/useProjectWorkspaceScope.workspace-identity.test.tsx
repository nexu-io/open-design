// @vitest-environment jsdom

// Red spec, two halves of the same read.
//
// 1. The read is HEADERLESS. `GET /api/projects/:id/workspace-scope` resolves an
//    unbound project against the caller's current workspace (#6185), but it can
//    only do that when the request carries the caller's `x-od-workspace-*`
//    identity — which this read never sent. The daemon fallback was therefore
//    unreachable from the product: every unbound project answered `unbound` for
//    every caller, forever.
//
// 2. Once the read IS identity-bearing, its cache key must carry that identity.
//    `shared-cancellable-get` shares a settled answer for 1s and joins an
//    in-flight one unconditionally, so a key of `project-workspace-scope:<id>`
//    alone hands one member's scope — and therefore the `workspaceMemberId` that
//    pays for the project's runs — to another. Half 2 is a prerequisite for half
//    1, not a follow-up.

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: vi.fn(() => ({ connected: false })),
}));

import { useProjectWorkspaceScope } from '../src/collab/useProjectWorkspaceScope';
import { notifyWorkspaceContextRefresh } from '../src/collab/useWorkspaceContext';
import { workspaceContextFixture } from './helpers/workspace-context';

const CONTEXTS = {
  a: workspaceContextFixture({ workspaceId: 'ws-a', workspaceMemberId: 'mem-a' }),
  b: workspaceContextFixture({ workspaceId: 'ws-b', workspaceMemberId: 'mem-b' }),
  c: workspaceContextFixture({ workspaceId: 'ws-c', workspaceMemberId: 'mem-c' }),
};

const PROJECT_ID = 'project-unbound';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Stand in for the daemon's `resolveProjectWorkspaceScopeForCaller`: a project
 * with no binding of its own resolves to the workspace the REQUEST names, and to
 * `unbound` when the request names none.
 */
function scopeAnswerFor(headers: Headers): unknown {
  const workspaceId = headers.get('x-od-workspace-id')?.trim() ?? '';
  const workspaceMemberId = headers.get('x-od-workspace-member-id')?.trim() ?? '';
  if (!workspaceId || !workspaceMemberId) {
    return {
      scope: { kind: 'unbound', projectId: PROJECT_ID, workspaceId: null, context: null },
    };
  }
  return {
    scope: {
      kind: 'team',
      projectId: PROJECT_ID,
      workspaceId,
      visibility: 'personal',
      context: workspaceContextFixture({ workspaceId, workspaceMemberId }),
    },
  };
}

let activeWorkspace: 'a' | 'b' | 'c';
let scopeReads: {
  workspaceId: string;
  headers: Record<string, string>;
  resolve: (r: Response) => void;
}[];
let slowWorkspaceIds: Set<string>;

beforeEach(() => {
  activeWorkspace = 'a';
  scopeReads = [];
  slowWorkspaceIds = new Set();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes('/api/workspace/context')) {
        return Promise.resolve(jsonResponse({ context: CONTEXTS[activeWorkspace] }));
      }
      if (url.includes('/workspace-scope')) {
        const headers = new Headers(init?.headers);
        const workspaceId = headers.get('x-od-workspace-id')?.trim() ?? '';
        const sent = Object.fromEntries(headers.entries());
        const answer = jsonResponse(scopeAnswerFor(headers));
        if (!slowWorkspaceIds.has(workspaceId)) {
          scopeReads.push({ workspaceId, headers: sent, resolve: () => {} });
          return Promise.resolve(answer);
        }
        let resolve!: (response: Response) => void;
        const promise = new Promise<Response>((next) => {
          resolve = next;
        });
        scopeReads.push({ workspaceId, headers: sent, resolve });
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

describe('useProjectWorkspaceScope reads as the caller', () => {
  it('sends the caller workspace identity so an unbound project resolves', async () => {
    const hook = renderHook(() => useProjectWorkspaceScope(PROJECT_ID));
    await waitFor(() => {
      expect(hook.result.current.loading).toBe(false);
    });

    expect(hook.result.current.scope).toMatchObject({
      kind: 'team',
      projectId: PROJECT_ID,
      workspaceId: 'ws-a',
      context: { workspaceId: 'ws-a', workspaceMemberId: 'mem-a' },
    });
    expect(scopeReads.map((read) => read.workspaceId)).toEqual(['ws-a']);

    // The full `workspaceProjectHeaders` set, not just the two the daemon needs
    // to recognise a caller at all: role, lifecycle, member status and the
    // permission pair are what it judges the request BY, and
    // `e2e/tests/collab/project-workspace-scope.test.ts` proves the daemon
    // resolves this exact set. Dropping any of them here would put the two
    // halves out of step while both stayed green.
    expect(scopeReads[0]?.headers).toMatchObject({
      'x-od-workspace-id': 'ws-a',
      'x-od-workspace-type': 'team',
      'x-od-workspace-member-id': 'mem-a',
      'x-od-workspace-role': 'member',
      'x-od-workspace-lifecycle-state': 'active',
      'x-od-workspace-member-status': 'active',
      'x-od-workspace-can-share-projects': 'true',
      'x-od-workspace-can-write-synced-files': 'true',
    });

    hook.unmount();
  });

  it('never serves the previous workspace scope after a switch', async () => {
    const hook = renderHook(() => useProjectWorkspaceScope(PROJECT_ID));
    await waitFor(() => {
      expect(hook.result.current.scope).toMatchObject({ workspaceId: 'ws-a' });
    });

    // Switch A -> B. This scope read is slow, so it is still in flight below.
    //
    // The refresh event also revalidates on the CURRENT identity before the new
    // context lands (a sign-in can change role/plan without changing workspace,
    // so that revalidation is not redundant), hence one more `ws-a` read here.
    // What matters is that the switch produced a read as `ws-b`.
    slowWorkspaceIds.add('ws-b');
    activeWorkspace = 'b';
    act(() => {
      notifyWorkspaceContextRefresh();
    });
    await waitFor(() => {
      expect(scopeReads.at(-1)?.workspaceId).toBe('ws-b');
    });

    // Switch B -> C inside the 250ms force-burst window. Keyed without the
    // identity, this joins B's in-flight read and hands C's member B's scope —
    // i.e. bills B's wallet for a run C started.
    activeWorkspace = 'c';
    act(() => {
      notifyWorkspaceContextRefresh();
    });

    await act(async () => {
      const pending = scopeReads.find((read) => read.workspaceId === 'ws-b');
      pending?.resolve(jsonResponse(scopeAnswerFor(new Headers({
        'x-od-workspace-id': 'ws-b',
        'x-od-workspace-member-id': 'mem-b',
      }))));
    });

    await waitFor(() => {
      expect(hook.result.current.scope).toMatchObject({
        kind: 'team',
        workspaceId: 'ws-c',
        context: { workspaceId: 'ws-c', workspaceMemberId: 'mem-c' },
      });
    });
    expect(hook.result.current.loading).toBe(false);

    hook.unmount();
  });
});
