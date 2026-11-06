// @vitest-environment jsdom
//
// Collab data-plane routes fail closed without a workspace identity. Status
// polling must therefore wait for `/api/workspace/context`, then put that
// exact identity on every request. A confirmed removed/frozen identity never
// starts a collab client at all.

import { act, cleanup, renderHook } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
  type WorkspaceLifecycleState,
} from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectCollab } from '../src/collab/useProjectCollab';

function teamContext(overrides: Partial<WorkspaceCollabContext> = {}): WorkspaceCollabContext {
  const role = 'member' as const;
  const lifecycleState = (overrides.lifecycleState ?? 'active') as WorkspaceLifecycleState;
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
    ...overrides,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useProjectCollab: status waits for explicit workspace authority', () => {
  it('keeps project A status, presence, and pull on A when ambient context is B', async () => {
    const projectContext = teamContext({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
      teamId: 'workspace-a',
    });
    const ambientContext = teamContext({
      workspaceId: 'workspace-b',
      workspaceMemberId: 'member-b',
      teamId: 'workspace-b',
    });
    let contextReads = 0;
    const scopedCalls: Array<{
      pathname: string;
      workspaceId: string | null;
      workspaceMemberId: string | null;
    }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/context')) {
        contextReads += 1;
        return new Response(JSON.stringify({ context: ambientContext }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      const headers = new Headers(init?.headers);
      scopedCalls.push({
        pathname,
        workspaceId: headers.get('x-od-workspace-id'),
        workspaceMemberId: headers.get('x-od-workspace-member-id'),
      });
      if (pathname.endsWith('/collab/status')) {
        return new Response(JSON.stringify({
          publishedVersion: 2,
          materializedVersion: 1,
          syncState: 'synced',
          ownerMemberId: 'member-owner',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (pathname.endsWith('/presence/heartbeat')) {
        return new Response(JSON.stringify({ present: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, version: 2 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    renderHook(() =>
      useProjectCollab('project-a', {
        fetch: fetchImpl,
        workspaceContext: projectContext,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(contextReads).toBe(0);
    const projectCalls = scopedCalls.filter(({ pathname }) =>
      pathname.endsWith('/collab/status')
      || pathname.endsWith('/presence/heartbeat')
      || pathname.endsWith('/collab/pull'),
    );
    expect(projectCalls.map(({ pathname }) => pathname)).toEqual(
      expect.arrayContaining([
        '/api/projects/project-a/collab/status',
        '/api/projects/project-a/presence/heartbeat',
        '/api/projects/project-a/collab/pull',
      ]),
    );
    expect(
      projectCalls.every(
        ({ workspaceId, workspaceMemberId }) =>
          workspaceId === 'workspace-a' && workspaceMemberId === 'member-a',
      ),
    ).toBe(true);
  });

  it('does not start /collab/status while the workspace-context read is pending', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      calls.push(pathname);
      if (pathname.endsWith('/workspace/context')) {
        return new Promise<Response>(() => {
          /* never resolves — models the ~2.5s real hub round-trip */
        });
      }
      if (pathname.endsWith('/collab/status')) {
        return { ok: true, status: 200, json: async () => ({ publishedVersion: 1, syncState: 'synced' }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
    }) as typeof fetch;

    renderHook(() => useProjectCollab('p1', { fetch: fetchImpl }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(calls.some((p) => p.endsWith('/collab/status'))).toBe(false);
    // Presence never announces itself without a resolved identity — the
    // context read (which member depends on) is still hanging.
    expect(calls.some((p) => p.endsWith('/presence/heartbeat'))).toBe(false);
  });

  it('starts scoped status and presence once workspace context resolves', async () => {
    const scopedCalls: Array<{ pathname: string; workspaceId: string | null }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      scopedCalls.push({
        pathname,
        workspaceId: new Headers(init?.headers).get('x-od-workspace-id'),
      });
      if (pathname.endsWith('/collab/status')) {
        return { ok: true, status: 200, json: async () => ({ publishedVersion: 1, syncState: 'synced' }) } as unknown as Response;
      }
      if (pathname.endsWith('/presence/heartbeat')) {
        return { ok: true, status: 200, json: async () => ({ present: [{ memberId: 'wm-1' }] }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
    }) as typeof fetch;

    const { result, rerender } = renderHook(
      ({ workspaceContext, workspaceContextLoading }) =>
        useProjectCollab('p1', {
          fetch: fetchImpl,
          workspaceContext,
          workspaceContextLoading,
        }),
      {
        initialProps: {
          workspaceContext: null as WorkspaceCollabContext | null,
          workspaceContextLoading: true,
        },
      },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.syncState).toBeNull();
    expect(result.current.enabled).toBe(false);
    expect(result.current.present).toEqual([]);

    await act(async () => {
      rerender({
        workspaceContext: teamContext(),
        workspaceContextLoading: false,
      });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.syncState).toBe('synced');
    expect(
      scopedCalls
        .filter(({ pathname }) =>
          pathname.endsWith('/collab/status')
          || pathname.endsWith('/presence/heartbeat'),
        )
        .every(({ workspaceId }) => workspaceId === 'ws-1'),
    ).toBe(true);
  });
});

describe('useProjectCollab: permission-denied identities never start collab', () => {
  it('never polls when context confirms the member was removed', async () => {
    const calls: string[] = [];
    const removed = teamContext({ memberStatus: 'removed' });
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      calls.push(pathname);
      if (pathname.endsWith('/workspace/context')) {
        return { ok: true, status: 200, json: async () => ({ context: removed }) } as unknown as Response;
      }
      if (pathname.endsWith('/collab/status')) {
        return { ok: true, status: 200, json: async () => ({ publishedVersion: 1, syncState: 'local_only' }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
    }) as typeof fetch;

    const { result } = renderHook(() => useProjectCollab('p1', { fetch: fetchImpl, statusPollMs: 50 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(calls.some((p) => p.endsWith('/collab/status'))).toBe(false);
    expect(calls.some((p) => p.endsWith('/presence/heartbeat'))).toBe(false);
    expect(result.current.enabled).toBe(false);

    const pollsAtSettle = calls.filter((p) => p.endsWith('/collab/status')).length;

    // Advance well past several poll intervals.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const pollsAfterWaiting = calls.filter((p) => p.endsWith('/collab/status')).length;
    // …and it stops for good once the removal is confirmed, not just paused.
    expect(pollsAfterWaiting).toBe(pollsAtSettle);
  });

  it('never polls when context confirms the workspace lifecycle is frozen (locked)', async () => {
    const calls: string[] = [];
    const locked = teamContext({ lifecycleState: 'locked' });
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      calls.push(pathname);
      if (pathname.endsWith('/workspace/context')) {
        return { ok: true, status: 200, json: async () => ({ context: locked }) } as unknown as Response;
      }
      if (pathname.endsWith('/collab/status')) {
        return { ok: true, status: 200, json: async () => ({ publishedVersion: 1, syncState: 'local_only' }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
    }) as typeof fetch;

    const { result } = renderHook(() => useProjectCollab('p1', { fetch: fetchImpl, statusPollMs: 50 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(calls.some((p) => p.endsWith('/collab/status'))).toBe(false);
    expect(calls.some((p) => p.endsWith('/presence/heartbeat'))).toBe(false);
    expect(result.current.enabled).toBe(false);

    const pollsAtSettle = calls.filter((p) => p.endsWith('/collab/status')).length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const pollsAfterWaiting = calls.filter((p) => p.endsWith('/collab/status')).length;
    expect(pollsAfterWaiting).toBe(pollsAtSettle);
  });

  it('never polls status at all when there is no project id', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      calls.push(pathname);
      return { ok: true, status: 200, json: async () => ({ context: teamContext() }) } as unknown as Response;
    }) as typeof fetch;

    renderHook(() => useProjectCollab(null, { fetch: fetchImpl, statusPollMs: 50 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(calls.some((p) => p.endsWith('/collab/status'))).toBe(false);
  });
});
