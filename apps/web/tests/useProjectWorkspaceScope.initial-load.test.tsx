// @vitest-environment jsdom
//
// `{ loading: true, scope: null }` has TWO causes, and only one of them may let a
// run borrow the caller's identity:
//
//   1. this project's binding has never been read     -> the caller is all we have
//   2. it HAS been read, and is being revalidated     -> the answer already exists
//
// The hook's trailing transition guard produces the identical shape for both (it
// returns `{ loading: true, scope: null }` whenever the resolved revision or the
// resolved caller identity no longer matches — a workspace switch changes the
// identity, so every switch enters case 2). Nothing in that shape distinguished
// them, so `runWorkspaceIdentity` could not either.
//
// `initialLoadPending` is that missing bit. This file pins it on the hook, so the
// helper's narrowing rests on a fact the hook reports rather than on an inference
// about `loading`.

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectWorkspaceScopeResponse } from '@open-design/contracts';

import { useProjectWorkspaceScope } from '../src/collab/useProjectWorkspaceScope';
import {
  WORKSPACE_CONTEXT_REFRESH_EVENT,
  resetWorkspaceContextCache,
} from '../src/collab/useWorkspaceContext';

const PROJECT_ID = 'p-switch';
const WORKSPACE_A = 'ws-alpha';
const WORKSPACE_B = 'ws-beta';

function teamContext(workspaceId: string, memberId: string) {
  return {
    workspaceId,
    workspaceType: 'team' as const,
    workspaceMemberId: memberId,
    role: 'member' as const,
    memberStatus: 'active' as const,
    lifecycleState: 'active' as const,
    billingState: 'active' as const,
    planId: 'team_pro',
    providerMode: 'platform_credits' as const,
    seatSummary: { seatLimit: 5, usedSeats: 2, availableSeats: 3, isSeatFull: false },
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
    teamId: workspaceId,
    teamName: workspaceId,
  };
}

/** The project stays bound to workspace A no matter who asks. */
function scopeForA(): ProjectWorkspaceScopeResponse {
  return {
    scope: {
      kind: 'team',
      projectId: PROJECT_ID,
      workspaceId: WORKSPACE_A,
      visibility: 'personal',
      context: teamContext(WORKSPACE_A, 'member-alpha') as never,
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetWorkspaceContextCache();
});

describe('useProjectWorkspaceScope initialLoadPending', () => {
  it('is true before the first answer and false once it lands', async () => {
    let releaseScope: () => void = () => undefined;
    const scopeGate = new Promise<void>((resolve) => {
      releaseScope = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/workspace/context')) {
          return new Response(
            JSON.stringify({ context: teamContext(WORKSPACE_A, 'member-alpha') }),
            { status: 200 },
          );
        }
        if (url.includes('/workspace-scope')) {
          await scopeGate;
          return new Response(JSON.stringify(scopeForA()), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      }),
    );

    const { result } = renderHook(() => useProjectWorkspaceScope(PROJECT_ID));

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(
      result.current.initialLoadPending,
      'nothing has been read yet, so a run has only the caller to name',
    ).toBe(true);

    releaseScope();
    await waitFor(() => expect(result.current.scope?.kind).toBe('team'));
    expect(result.current.initialLoadPending).toBe(false);
  });

  // The regression nettee found. After a workspace switch the hook re-enters
  // `{ loading: true, scope: null }`, which is byte-identical to the first-load
  // shape — but the project's binding is already known, so the caller's NEW
  // workspace is the wrong thing to assert.
  it('stays false during the revalidation window a workspace switch opens', async () => {
    let scopeReads = 0;
    let currentContext = teamContext(WORKSPACE_A, 'member-alpha');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/workspace/context')) {
          return new Response(JSON.stringify({ context: currentContext }), { status: 200 });
        }
        if (url.includes('/workspace-scope')) {
          scopeReads += 1;
          // Answer the first read, then hang. That parks the hook in the
          // post-switch revalidation window instead of racing out of it.
          if (scopeReads > 1) return new Promise<Response>(() => {});
          return new Response(JSON.stringify(scopeForA()), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      }),
    );

    const { result } = renderHook(() => useProjectWorkspaceScope(PROJECT_ID));
    await waitFor(() => expect(result.current.scope?.kind).toBe('team'));
    expect(result.current.initialLoadPending).toBe(false);

    // The switch: the caller is now in workspace B.
    currentContext = teamContext(WORKSPACE_B, 'member-beta');
    resetWorkspaceContextCache();
    window.dispatchEvent(new Event(WORKSPACE_CONTEXT_REFRESH_EVENT));

    await waitFor(() => expect(result.current.scope).toBeNull());
    expect(result.current.loading, 'the hook is revalidating').toBe(true);
    expect(
      result.current.initialLoadPending,
      'this project\'s binding was already read; the switch does not un-read it',
    ).toBe(false);
  });
});
