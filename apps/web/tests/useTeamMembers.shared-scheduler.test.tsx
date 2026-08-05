// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { StrictMode, type ReactNode } from 'react';
import { workspaceContextFixture } from './helpers/workspace-context';

const harness = vi.hoisted(() => ({
  context: null as WorkspaceCollabContext | null,
  accountGeneration: 0,
  identityChangePending: false,
  connected: false,
  membersChanged: null as ((payload?: object) => void) | null,
}));

vi.mock('../src/collab/useWorkspaceContext', () => ({
  useWorkspaceContext: () => ({
    context: harness.context,
    identityChangePending: harness.identityChangePending,
    accountGeneration: harness.accountGeneration,
  }),
}));

vi.mock('../src/collab/workspace-events', () => ({
  useWorkspaceInvalidation: (
    handlers: Record<string, (payload?: object) => void>,
  ) => {
    harness.membersChanged = handlers['members-changed'] ?? null;
    return { connected: harness.connected };
  },
}));

import { useTeamMembers } from '../src/collab/useTeamMembers';

const TEAM_CONTEXT = workspaceContextFixture({
  workspaceId: 'workspace-shared-scheduler',
  workspaceMemberId: 'member-viewer',
});

describe('useTeamMembers shared scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    harness.context = TEAM_CONTEXT;
    harness.accountGeneration = 0;
    harness.identityChangePending = false;
    harness.connected = false;
    harness.membersChanged = null;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('uses one initial read and one poll loop for two consumers of one identity', async () => {
    const membersReads: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (!String(input).includes('/api/workspace/members')) {
          throw new Error(`unexpected fetch: ${String(input)}`);
        }
        membersReads.push(Date.now());
        return new Response(JSON.stringify({ members: [] }), { status: 200 });
      }),
    );

    const first = renderHook(() => useTeamMembers());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(membersReads).toHaveLength(1);

    // Mount the second consumer outside coalescedGet's 1s cache window. A
    // per-hook scheduler performs another mount read and creates a poll offset
    // from the first one; an identity store reuses the settled snapshot.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    const second = renderHook(() => useTeamMembers());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(membersReads).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(13_000);
    });
    expect(membersReads).toHaveLength(2);

    // The second hook's former 15s interval would fire two seconds later.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(membersReads).toHaveLength(2);

    first.unmount();
    second.unmount();
  });

  it('keeps the pending first roster through StrictMode effect replay', async () => {
    let resolveMembers!: (response: Response) => void;
    const membersReads: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL): Promise<Response> => {
        if (!String(input).includes('/api/workspace/members')) {
          throw new Error(`unexpected fetch: ${String(input)}`);
        }
        membersReads.push(Date.now());
        return new Promise<Response>((resolve) => {
          resolveMembers = resolve;
        });
      }),
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );

    const hook = renderHook(() => useTeamMembers(), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(membersReads).toHaveLength(1);

    await act(async () => {
      resolveMembers(
        new Response(
          JSON.stringify({
            members: [
              {
                memberId: 'member-peer',
                displayName: 'Visible peer',
                role: 'member',
              },
            ],
          }),
          { status: 200 },
        ),
      );
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(hook.result.current.members).toEqual([
      {
        memberId: 'member-peer',
        displayName: 'Visible peer',
        role: 'member',
      },
    ]);
    expect(membersReads).toHaveLength(1);
    hook.unmount();
  });

  it('returns an idle last-good roster synchronously and revalidates it in the background', async () => {
    let reads = 0;
    let resolveRevalidation!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL): Promise<Response> => {
        if (!String(input).includes('/api/workspace/members')) {
          throw new Error(`unexpected fetch: ${String(input)}`);
        }
        reads += 1;
        if (reads === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                members: [
                  {
                    memberId: 'member-peer',
                    displayName: 'Cached peer',
                    role: 'member',
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        return new Promise<Response>((resolve) => {
          resolveRevalidation = resolve;
        });
      }),
    );

    const first = renderHook(() => useTeamMembers());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(first.result.current.members[0]?.displayName).toBe('Cached peer');
    first.unmount();

    // No consumer means no 15s poll, but the identity snapshot remains warm.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(reads).toBe(1);

    const second = renderHook(() => useTeamMembers());
    expect(second.result.current.members[0]?.displayName).toBe('Cached peer');
    expect(reads).toBe(2);
    expect(resolveRevalidation).toBeTypeOf('function');

    second.unmount();
  });

  it('queues one trailing refresh when members-changed arrives during a read', async () => {
    const pending: Array<(response: Response) => void> = [];
    let reads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL): Promise<Response> => {
        if (!String(input).includes('/api/workspace/members')) {
          throw new Error(`unexpected fetch: ${String(input)}`);
        }
        reads += 1;
        if (reads === 1) {
          return Promise.resolve(
            new Response(JSON.stringify({ members: [] }), { status: 200 }),
          );
        }
        return new Promise<Response>((resolve) => pending.push(resolve));
      }),
    );

    const hook = renderHook(() => useTeamMembers());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(reads).toBe(1);

    const firstEvent = { type: 'members-changed' };
    act(() => harness.membersChanged?.(firstEvent));
    expect(reads).toBe(2);

    // A burst while the refresh is pending is dirty state, not a reason to
    // spawn parallel reads. It must result in exactly one trailing refresh.
    act(() => {
      harness.membersChanged?.({ type: 'members-changed' });
      harness.membersChanged?.({ type: 'members-changed' });
      harness.membersChanged?.({ type: 'members-changed' });
    });
    expect(reads).toBe(2);

    await act(async () => {
      pending[0]?.(
        new Response(JSON.stringify({ members: [] }), { status: 200 }),
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(reads).toBe(3);

    await act(async () => {
      pending[1]?.(
        new Response(JSON.stringify({ members: [] }), { status: 200 }),
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(reads).toBe(3);
    hook.unmount();
  });

  it('partitions the same workspace membership by account generation', async () => {
    let reads = 0;
    let resolveSecondAccount!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL): Promise<Response> => {
        if (!String(input).includes('/api/workspace/members')) {
          throw new Error(`unexpected fetch: ${String(input)}`);
        }
        reads += 1;
        if (reads === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                members: [
                  {
                    memberId: 'account-a-peer',
                    displayName: 'Account A peer',
                    role: 'member',
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        return new Promise<Response>((resolve) => {
          resolveSecondAccount = resolve;
        });
      }),
    );

    const hook = renderHook(() => useTeamMembers());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(hook.result.current.members[0]?.displayName).toBe('Account A peer');

    harness.accountGeneration = 1;
    hook.rerender();
    expect(hook.result.current.members).toEqual([]);
    expect(reads).toBe(2);
    expect(resolveSecondAccount).toBeTypeOf('function');

    hook.unmount();
  });

  it('does not warm a new account store from the previous account context while identity is pending', async () => {
    let reads = 0;
    let resolveSecondAccount!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((): Promise<Response> => {
        reads += 1;
        if (reads === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                members: [
                  {
                    memberId: 'account-a-peer',
                    displayName: 'Account A peer',
                    role: 'member',
                  },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        return new Promise<Response>((resolve) => {
          resolveSecondAccount = resolve;
        });
      }),
    );

    const hook = renderHook(() => useTeamMembers());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(hook.result.current.members[0]?.displayName).toBe('Account A peer');

    harness.accountGeneration = 1;
    harness.identityChangePending = true;
    hook.rerender();
    expect(hook.result.current.members).toEqual([]);
    expect(reads).toBe(1);

    harness.identityChangePending = false;
    hook.rerender();
    expect(hook.result.current.members).toEqual([]);
    expect(reads).toBe(2);
    expect(resolveSecondAccount).toBeTypeOf('function');

    hook.unmount();
  });

  it('uses the SSE floor while connected and the low-frequency fallback when disconnected', async () => {
    const membersReads: number[] = [];
    harness.connected = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (!String(input).includes('/api/workspace/members')) {
          throw new Error(`unexpected fetch: ${String(input)}`);
        }
        membersReads.push(Date.now());
        return new Response(JSON.stringify({ members: [] }), { status: 200 });
      }),
    );

    const hook = renderHook(() => useTeamMembers());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(membersReads).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_999);
    });
    expect(membersReads).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(membersReads).toHaveLength(2);

    harness.connected = false;
    hook.rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_999);
    });
    expect(membersReads).toHaveLength(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(membersReads).toHaveLength(3);

    hook.unmount();
  });

  it('does not load the Team directory for an explicit Personal scope', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ members: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const personalContext: WorkspaceCollabContext = {
      ...TEAM_CONTEXT,
      workspaceType: 'personal',
      teamId: undefined,
    };

    const hook = renderHook(() => useTeamMembers(undefined, personalContext));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(hook.result.current.members).toEqual([]);
    hook.unmount();
  });
});
