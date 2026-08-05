// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type CollabMemberRole,
  type WorkspaceCollabContext,
  type WorkspaceLifecycleState,
} from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectCollab } from '../src/collab/useProjectCollab';

/** Build a full workspace context the way the daemon serves it — permissions and
 *  the seat summary are derived through the same helpers B ships, so the mock can
 *  never drift from the real shape. */
function makeContext(
  overrides: {
    role?: CollabMemberRole;
    lifecycleState?: WorkspaceLifecycleState;
    workspaceMemberId?: string;
  } = {},
): WorkspaceCollabContext {
  const role = overrides.role ?? 'member';
  const lifecycleState = overrides.lifecycleState ?? 'active';
  return {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    workspaceMemberId: overrides.workspaceMemberId ?? 'wm-1',
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

const TEAM_CONTEXT = makeContext();

function installFetch(context: unknown, present: Array<{ memberId: string }>) {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const pathname = new URL(url, 'http://d.local').pathname;
    let payload: unknown = { ok: true };
    if (pathname.endsWith('/workspace/context')) payload = { context };
    else if (pathname.endsWith('/presence/heartbeat')) payload = { present };
    else if (pathname.endsWith('/collab/status')) payload = { publishedVersion: 2, syncState: 'synced' };
    return { ok: true, status: 200, json: async () => payload } as unknown as Response;
  }) as typeof fetch;
  return fetchImpl;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useProjectCollab', () => {
  it('activates presence + sync for a team member', async () => {
    const fetchImpl = installFetch(TEAM_CONTEXT, [{ memberId: 'wm-1' }, { memberId: 'other' }]);
    const { result } = renderHook(() =>
      useProjectCollab('p1', { fetch: fetchImpl, workspaceContext: TEAM_CONTEXT }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // context fetch
      await vi.advanceTimersByTimeAsync(0); // presence/status polls
    });

    expect(result.current.enabled).toBe(true);
    expect(result.current.member).toEqual({ memberId: 'wm-1', role: 'member', name: 'Ma Shu' });
    expect(result.current.present.length).toBe(2);
    expect(result.current.publishedVersion).toBe(2);
    expect(result.current.syncState).toBe('synced');
  });

  it('activates presence for a personal workspace that can later invite seats', async () => {
    const calls: string[] = [];
    const personalContext = { ...TEAM_CONTEXT, workspaceType: 'personal' as const };
    const base = installFetch(personalContext, []);
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(new URL(String(input), 'http://d.local').pathname);
      return base(input, init);
    }) as typeof fetch;
    const { result } = renderHook(() =>
      useProjectCollab('p1', { fetch: fetchImpl, workspaceContext: personalContext }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(result.current.enabled).toBe(true);
    expect(result.current.present).toEqual([]);
    expect(calls.some((p) => p.endsWith('/presence/heartbeat'))).toBe(true);
  });

  it('stays dormant when there is no workspace context', async () => {
    const fetchImpl = installFetch(null, []);
    const { result } = renderHook(() =>
      useProjectCollab('p1', { fetch: fetchImpl, workspaceContext: null }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(result.current.enabled).toBe(false);
  });

  it('fails closed while the workspace context request is still pending', async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      if (pathname.endsWith('/workspace/context')) {
        return new Promise<Response>(() => {
          /* keep the workspace context unresolved */
        });
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useProjectCollab('p1', {
        fetch: fetchImpl,
        workspaceContext: null,
        workspaceContextLoading: true,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.viewerOnly).toBe(true);
    expect(result.current.writerAuthority).toBe('pending');
    // Permission controls still fail closed, but an unresolved context is not
    // proof that the daemon's local mirror is behind. Keep local files visible.
    expect(result.current.downloadPending).toBe(false);
  });

  it('fails closed: a non-owner admin is read-only on a shared project even before the owner id arrives', async () => {
    // An admin (canWriteSyncedFiles=true, so the workspace gate is open) opens
    // someone else's shared project. `installFetch`'s /collab/status omits
    // ownerMemberId — the load window. The single-writer gate must fail closed:
    // a non-owner of any role must not get edit affordances until their own
    // ownership is confirmed. Pre-fix this returned viewerOnly=false for admins.
    const admin = makeContext({ role: 'admin', workspaceMemberId: 'wm-admin' });
    const fetchImpl = installFetch(admin, [{ memberId: 'wm-admin' }]);
    const { result } = renderHook(() =>
      useProjectCollab('p1', { fetch: fetchImpl, workspaceContext: admin }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.viewerOnly).toBe(true);
  });

  it('fails closed before the first collab status response resolves', async () => {
    const admin = makeContext({ role: 'admin', workspaceMemberId: 'wm-admin' });
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      let payload: unknown = { ok: true };
      if (pathname.endsWith('/workspace/context')) payload = { context: admin };
      else if (pathname.endsWith('/presence/heartbeat')) payload = { present: [{ memberId: 'wm-admin' }] };
      else if (pathname.endsWith('/collab/status')) {
        return new Promise<Response>(() => {
          /* keep the initial status poll unresolved */
        });
      }
      return { ok: true, status: 200, json: async () => payload } as unknown as Response;
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useProjectCollab('p1', { fetch: fetchImpl, workspaceContext: admin }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.enabled).toBe(true);
    expect(result.current.syncState).toBeNull();
    expect(result.current.viewerOnly).toBe(true);
    // Status remains permission-fail-closed through viewerOnly, but it is not
    // a download until a response proves the published head is ahead.
    expect(result.current.downloadPending).toBe(false);
  });

  it('lets the confirmed owner edit their own shared project', async () => {
    // Positive control: once /collab/status reports an ownerMemberId that matches
    // the current member, the single writer keeps editing (not read-only).
    const owner = makeContext({ role: 'member', workspaceMemberId: 'wm-owner' });
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      let payload: unknown = { ok: true };
      if (pathname.endsWith('/workspace/context')) payload = { context: owner };
      else if (pathname.endsWith('/presence/heartbeat')) payload = { present: [{ memberId: 'wm-owner' }] };
      else if (pathname.endsWith('/collab/status')) {
        payload = { publishedVersion: 2, syncState: 'synced', ownerMemberId: 'wm-owner' };
      }
      return { ok: true, status: 200, json: async () => payload } as unknown as Response;
    }) as typeof fetch;
    const { result } = renderHook(() =>
      useProjectCollab('p1', { fetch: fetchImpl, workspaceContext: owner }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.viewerOnly).toBe(false);
    expect(result.current.writerAuthority).toBe('allowed');
  });

  it('keeps a status-confirmed owner writable while project scope is revalidating after restart', async () => {
    // A daemon/web restart can leave the project-scope read in its revalidation
    // window even though the caller identity is already pinned from the
    // persisted project binding and /collab/status has freshly confirmed the
    // same member as the shared-project owner. Loading alone must not override
    // that two-sided ownership proof; otherwise the real single writer gets the
    // member-only banner and loses Chat/file editing until another remount.
    const owner = makeContext({ role: 'member', workspaceMemberId: 'wm-owner' });
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      let payload: unknown = { ok: true };
      if (pathname.endsWith('/presence/heartbeat')) {
        payload = { present: [{ memberId: 'wm-owner' }] };
      } else if (pathname.endsWith('/collab/status')) {
        payload = {
          publishedVersion: 2,
          syncState: 'synced',
          ownerMemberId: 'wm-owner',
        };
      }
      return { ok: true, status: 200, json: async () => payload } as unknown as Response;
    }) as typeof fetch;

    const { result } = renderHook(() =>
      useProjectCollab('p-restarted', {
        fetch: fetchImpl,
        workspaceContext: owner,
        workspaceContextLoading: true,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isOwner).toBe(true);
    expect(result.current.viewerOnly).toBe(false);
  });

  it('stays read-only for a member after the owner unshares the project mid-session', async () => {
    // A member (wm-member) has this project open while it is shared by
    // wm-owner — `shared=true, isOwner=false` correctly renders read-only.
    // The owner then moves it back to "仅自己": /collab/status starts
    // reporting syncState: 'local_only' and ownerMemberId: null, the exact
    // same shape a project that was NEVER shared reports. The gate's
    // `shared && !isOwner` formula went straight to `false` on that
    // transition — indistinguishable from "this has always been my own
    // private project" — and unlocked full edit access for a member who
    // just lost their read access entirely. Once a project is confirmed
    // owned by someone else, losing "shared" must never flip this viewer to
    // editable.
    const member = makeContext({ role: 'member', workspaceMemberId: 'wm-member' });
    let unshared = false;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      let payload: unknown = { ok: true };
      if (pathname.endsWith('/workspace/context')) payload = { context: member };
      else if (pathname.endsWith('/presence/heartbeat')) payload = { present: [{ memberId: 'wm-member' }] };
      else if (pathname.endsWith('/collab/status')) {
        payload = unshared
          ? { publishedVersion: null, syncState: 'local_only', ownerMemberId: null }
          : { publishedVersion: 2, syncState: 'synced', ownerMemberId: 'wm-owner' };
      }
      return { ok: true, status: 200, json: async () => payload } as unknown as Response;
    }) as typeof fetch;
    const { result } = renderHook(() =>
      useProjectCollab('p1', { fetch: fetchImpl, workspaceContext: member }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.viewerOnly).toBe(true);

    unshared = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(result.current.viewerOnly).toBe(true);
  });

  it('freezes even the project owner read-only when the workspace is locked', async () => {
    // Workspace-level gate: a locked workspace has canWriteSyncedFiles=false, so
    // everyone is read-only — including an owner who would otherwise be the single
    // writer. This is the billing-freeze behavior, distinct from the shared-project
    // ownership gate.
    const owner = makeContext({ role: 'owner', lifecycleState: 'locked', workspaceMemberId: 'wm-owner' });
    const fetchImpl = installFetch(owner, [{ memberId: 'wm-owner' }]);
    const { result } = renderHook(() =>
      useProjectCollab('p1', { fetch: fetchImpl, workspaceContext: owner }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.viewerOnly).toBe(true);
  });

  it('does not auto-pull for a locked workspace owner', async () => {
    const calls: Array<{ pathname: string; method: string }> = [];
    const owner = makeContext({ role: 'owner', lifecycleState: 'locked', workspaceMemberId: 'wm-owner' });
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const pathname = new URL(String(input), 'http://d.local').pathname;
      calls.push({ pathname, method: init?.method ?? 'GET' });
      let payload: unknown = { ok: true };
      if (pathname.endsWith('/workspace/context')) payload = { context: owner };
      else if (pathname.endsWith('/presence/heartbeat')) payload = { present: [{ memberId: 'wm-owner' }] };
      else if (pathname.endsWith('/collab/status')) {
        payload = { publishedVersion: 2, syncState: 'synced', ownerMemberId: 'wm-owner' };
      }
      return { ok: true, status: 200, json: async () => payload } as unknown as Response;
    }) as typeof fetch;
    const { result } = renderHook(() =>
      useProjectCollab('p1', { fetch: fetchImpl, workspaceContext: owner }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.viewerOnly).toBe(true);
    expect(calls.some((call) => call.method === 'POST' && call.pathname.endsWith('/collab/pull'))).toBe(false);
  });
});
