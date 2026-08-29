// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCollab } from '../src/collab/useCollab.js';
import { workspaceContextFixture } from './helpers/workspace-context';

const CONTEXTS = {
  a: workspaceContextFixture({ workspaceId: 'ws-a', workspaceMemberId: 'mem-a' }),
  b: workspaceContextFixture({ workspaceId: 'ws-b', workspaceMemberId: 'mem-b' }),
};

function makeFetch(present: Array<{ memberId: string; name?: string }>, publishedVersion: number | null) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const pathname = new URL(url, 'http://daemon.local').pathname;
    let payload: unknown = { ok: true };
    if (
      pathname.endsWith('/presence')
      || pathname.endsWith('/presence/heartbeat')
    ) {
      payload = { present };
    }
    else if (pathname.endsWith('/collab/status')) payload = { publishedVersion, syncState: 'synced' };
    return { ok: true, status: 200, json: async () => payload } as unknown as Response;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useCollab', () => {
  it('restarts on workspace identity change and ignores the old scoped status response', async () => {
    const statusReads: Array<{
      workspaceId: string | null;
      resolve: (response: Response) => void;
    }> = [];
    const fetchImpl = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        if (!url.endsWith('/collab/status')) {
          return Promise.resolve(
            new Response(JSON.stringify({ ok: true }), { status: 200 }),
          );
        }
        let resolve!: (response: Response) => void;
        const promise = new Promise<Response>((next) => {
          resolve = next;
        });
        statusReads.push({
          workspaceId: new Headers(init?.headers).get('x-od-workspace-id'),
          resolve,
        });
        return promise;
      },
    ) as unknown as typeof fetch;
    type Props = { context: (typeof CONTEXTS)[keyof typeof CONTEXTS] };
    const { result, rerender } = renderHook(
      ({ context }: Props) =>
        useCollab({
          projectId: 'p1',
          member: null,
          enabled: true,
          workspaceContext: context,
          fetch: fetchImpl,
        }),
      { initialProps: { context: CONTEXTS.a } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    rerender({ context: CONTEXTS.b });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(statusReads.map((read) => read.workspaceId)).toEqual(['ws-a', 'ws-b']);

    await act(async () => {
      statusReads[1]!.resolve(
        new Response(
          JSON.stringify({ publishedVersion: 2, syncState: 'synced' }),
          { status: 200 },
        ),
      );
      await Promise.resolve();
    });
    expect(result.current.publishedVersion).toBe(2);

    await act(async () => {
      statusReads[0]!.resolve(
        new Response(
          JSON.stringify({ publishedVersion: 1, syncState: 'synced' }),
          { status: 200 },
        ),
      );
      await Promise.resolve();
    });
    expect(result.current.publishedVersion).toBe(2);
  });

  it('populates presence + published version once the client polls', async () => {
    const { fetchImpl } = makeFetch([{ memberId: 'm1', name: 'Author' }], 3);
    const { result } = renderHook(() =>
      useCollab({ projectId: 'p1', member: { memberId: 'm1', name: 'Author' }, fetch: fetchImpl }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.present).toEqual([{ memberId: 'm1', name: 'Author' }]);
    expect(result.current.publishedVersion).toBe(3);
  });

  it('does not start when disabled', async () => {
    const { fetchImpl, calls } = makeFetch([], null);
    renderHook(() =>
      useCollab({ projectId: 'p1', member: { memberId: 'm1' }, enabled: false, fetch: fetchImpl }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(calls.length).toBe(0);
  });

  it('reportChange and requestPublish hit the sync routes', async () => {
    const { fetchImpl, calls } = makeFetch([], null);
    const { result } = renderHook(() =>
      useCollab({ projectId: 'p1', member: { memberId: 'm1' }, fetch: fetchImpl }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      result.current.reportChange();
      result.current.requestPublish();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/collab/changed'))).toBe(true);
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/collab/publish'))).toBe(true);
  });

  it('handles consecutive presence invalidations with reads and no feedback heartbeat', async () => {
    const { fetchImpl, calls } = makeFetch([{ memberId: 'm2' }], 1);
    const { result } = renderHook(() =>
      useCollab({
        projectId: 'p1',
        member: { memberId: 'm1' },
        workspaceContext: CONTEXTS.a,
        fetch: fetchImpl,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    calls.length = 0;

    await act(async () => {
      result.current.refreshPresence();
      result.current.refreshPresence();
      result.current.refreshPresence();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(calls).toHaveLength(3);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: '/api/projects/p1/presence?fresh=1',
          method: 'GET',
        }),
      ]),
    );
    expect(calls.some((call) => call.url.endsWith('/presence/heartbeat'))).toBe(false);
    expect(result.current.present).toEqual([{ memberId: 'm2' }]);
  });

  it('keeps one heartbeat loop across StrictMode and owner-viewer rerenders', async () => {
    const calls: Array<{ pathname: string; method: string }> = [];
    const pendingStatus: Array<(response: Response) => void> = [];
    const fetchImpl = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const pathname = new URL(String(input), 'http://daemon.local').pathname;
        calls.push({ pathname, method: init?.method ?? 'GET' });
        if (pathname.endsWith('/collab/status')) {
          return new Promise<Response>((resolve) => {
            pendingStatus.push(resolve);
          });
        }
        if (pathname.endsWith('/presence/heartbeat')) {
          return Promise.resolve(
            new Response(JSON.stringify({ present: [{ memberId: 'mem-a' }] }), {
              status: 200,
            }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        );
      },
    ) as unknown as typeof fetch;
    type Props = { filePath: string };
    const { rerender } = renderHook(
      ({ filePath }: Props) =>
        useCollab({
          projectId: 'p-owner',
          member: {
            memberId: 'mem-a',
            role: 'owner',
            filePath,
          },
          enabled: true,
          statusEnabled: true,
          workspaceContext: { ...CONTEXTS.a },
          fetch: fetchImpl,
          heartbeatMs: 10_000,
          statusPollMs: 60_000,
        }),
      {
        initialProps: { filePath: 'index.html' },
        wrapper: ({ children }: { children: ReactNode }) => (
          <StrictMode>{children}</StrictMode>
        ),
      },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // React StrictMode replays the mount effect as setup -> cleanup -> setup.
    // Only the surviving client may launch its cold status request.
    expect(pendingStatus).toHaveLength(1);

    await act(async () => {
      for (const resolve of pendingStatus.splice(0)) {
        resolve(
          new Response(
            JSON.stringify({ publishedVersion: 1, syncState: 'synced' }),
            { status: 200 },
          ),
        );
      }
      await Promise.resolve();
    });

    for (const filePath of ['a.html', 'b.html', 'c.html', 'index.html']) {
      await act(async () => {
        rerender({ filePath });
        await vi.advanceTimersByTimeAsync(0);
      });
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(22_000);
    });

    const heartbeats = calls.filter(
      ({ pathname, method }) =>
        method === 'POST' && pathname.endsWith('/presence/heartbeat'),
    );
    // One announcement after shared status resolves, then the stable 10s and
    // 20s interval ticks. StrictMode cleanup and owner viewer rerenders must
    // not create extra immediate beats or leave a stopped client alive.
    expect(heartbeats).toHaveLength(3);
  });

  it('starts status polling via statusEnabled before member resolves, and heartbeats once it does', async () => {
    const { fetchImpl, calls } = makeFetch([{ memberId: 'm1' }], 7);
    type Props = { member: { memberId: string; name?: string } | null };
    const { result, rerender } = renderHook(
      ({ member }: Props) =>
        useCollab({
          projectId: 'p1',
          member,
          // Mirrors useProjectCollab's real gate: presence (enabled) still
          // needs a resolved member; status polling (statusEnabled) does not.
          enabled: Boolean(member),
          statusEnabled: true,
          fetch: fetchImpl,
        }),
      { initialProps: { member: null } as Props },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(calls.some((c) => c.method === 'GET' && c.url.endsWith('/collab/status'))).toBe(true);
    expect(calls.some((c) => c.url.endsWith('/presence/heartbeat'))).toBe(false);
    expect(result.current.publishedVersion).toBe(7);

    rerender({ member: { memberId: 'm1', name: 'Author' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(calls.some((c) => c.url.endsWith('/presence/heartbeat'))).toBe(true);
    expect(result.current.present).toEqual([{ memberId: 'm1' }]);
  });

  it('does not send a presence leave on unmount when member never resolved', async () => {
    const { fetchImpl, calls } = makeFetch([], null);
    const { unmount } = renderHook(() =>
      useCollab({ projectId: 'p1', member: null, enabled: false, statusEnabled: true, fetch: fetchImpl }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(calls.some((c) => c.url.endsWith('/collab/status'))).toBe(true);
    expect(calls.some((c) => c.url.endsWith('/presence/leave'))).toBe(false);
  });

  it('falls back to enabled when statusEnabled is not provided (no behavior change for existing callers)', async () => {
    const { fetchImpl, calls } = makeFetch([], null);
    renderHook(() =>
      useCollab({ projectId: 'p1', member: null, enabled: true, fetch: fetchImpl }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // enabled=true but member=null: statusEnabled defaults to `enabled`
    // (true), so status polling still starts even without member — matching
    // CollabClient's own member-less status contract.
    expect(calls.some((c) => c.url.endsWith('/collab/status'))).toBe(true);
    expect(calls.some((c) => c.url.endsWith('/presence/heartbeat'))).toBe(false);
  });

  it('stops polling on unmount', async () => {
    const { fetchImpl, calls } = makeFetch([{ memberId: 'm1' }], 1);
    const { unmount } = renderHook(() =>
      useCollab({ projectId: 'p1', member: { memberId: 'm1' }, heartbeatMs: 10_000, fetch: fetchImpl }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();
    const afterUnmount = calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    // One trailing leave POST is allowed; no further heartbeat/status polls.
    const polls = calls.slice(afterUnmount).filter((c) => !c.url.endsWith('/presence/leave'));
    expect(polls.length).toBe(0);
  });
});
