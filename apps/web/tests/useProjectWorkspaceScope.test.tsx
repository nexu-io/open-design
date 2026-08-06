// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ProjectWorkspaceScopeResponse,
  WorkspaceCollabContext,
} from '@open-design/contracts';

import {
  projectWorkspaceScopeAuthorizesAmr,
  useProjectWorkspaceScope,
} from '../src/collab/useProjectWorkspaceScope';
import { WORKSPACE_CONTEXT_REFRESH_EVENT } from '../src/collab/useWorkspaceContext';

class OpeningEventSource {
  static instances: OpeningEventSource[] = [];

  readonly url: string;
  readonly withCredentials = false;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;
  readyState = this.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  deliveredListenerCalls = 0;
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  constructor(url: string | URL) {
    this.url = String(url);
    OpeningEventSource.instances.push(this);
    queueMicrotask(() => {
      if (this.closed) return;
      this.readyState = this.OPEN;
      this.onopen?.(new Event('open'));
    });
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    if (!listener) return;
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    if (!listener) return;
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) {
      this.deliveredListenerCalls += 1;
      if (typeof listener === 'function') listener.call(this, event);
      else listener.handleEvent(event);
    }
    return true;
  }

  close(): void {
    this.closed = true;
    this.readyState = this.CLOSED;
  }

  emit(type: string, data: unknown = {}): void {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function teamScope(
  projectId: string,
  workspaceId: string,
  memberId: string,
): ProjectWorkspaceScopeResponse {
  return {
    scope: {
      kind: 'team',
      projectId,
      workspaceId,
      visibility: 'personal',
      context: {
        workspaceId,
        workspaceType: 'team',
        workspaceMemberId: memberId,
        role: 'member',
        memberStatus: 'active',
        lifecycleState: 'active',
        billingState: 'active',
        planId: 'team_pro',
        providerMode: 'platform_credits',
        seatSummary: {
          seatLimit: 5,
          usedSeats: 2,
          availableSeats: 3,
          isSeatFull: false,
        },
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
      },
    },
  };
}

describe('useProjectWorkspaceScope', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    OpeningEventSource.instances = [];
  });

  it('uses a fresh bootstrap scope without repeating the initial or connect-time read', async () => {
    const response = teamScope('project-bootstrap', 'workspace-bootstrap', 'member-bootstrap');
    const caller = response.scope.context as WorkspaceCollabContext;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('EventSource', OpeningEventSource as unknown as typeof EventSource);

    const hook = renderHook(() => useProjectWorkspaceScope(
      'project-bootstrap',
      caller,
      caller.workspaceId,
      response.scope,
    ));

    expect(hook.result.current).toMatchObject({
      loading: false,
      scope: response.scope,
    });
    await act(async () => {
      for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a settled scope subscribed while SSE catch-up revalidates it', async () => {
    let monotonicNow = 0;
    vi.spyOn(globalThis.performance, 'now').mockImplementation(() => monotonicNow);
    const caller = teamScope('project-loop', 'workspace-loop', 'member-loop')
      .scope.context as WorkspaceCollabContext;
    const scopeUrls: string[] = [];
    vi.stubGlobal('EventSource', OpeningEventSource as unknown as typeof EventSource);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/workspace/context')) {
        return new Response(JSON.stringify({ context: caller }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (!url.includes('/workspace-scope')) {
        throw new Error(`Unexpected fetch: ${url}`);
      }
      scopeUrls.push(url);
      // Bound a broken implementation's self-exciting reconnect loop so the
      // red test fails deterministically instead of spinning forever.
      if (scopeUrls.length > 5) return new Promise<Response>(() => {});
      const response = teamScope(
        'project-loop',
        'workspace-loop',
        'member-loop',
      );
      if (response.scope.context) {
        response.scope.context.teamName = `revision-${scopeUrls.length}`;
      }
      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }));

    const hook = renderHook(() =>
      useProjectWorkspaceScope(
        'project-loop',
        caller,
        caller.workspaceId,
      ),
    );

    await waitFor(() => {
      expect(hook.result.current.scope).toMatchObject({
        projectId: 'project-loop',
        context: { workspaceMemberId: 'member-loop' },
      });
    });
    await waitFor(() => {
      expect(scopeUrls).toHaveLength(2);
      expect(hook.result.current.scope?.context).toMatchObject({
        teamName: 'revision-2',
      });
    });
    await act(async () => {
      // Drain the fetch → React commit → EventSource onopen microtask chain.
      // A broken implementation creates a new stream after every scope answer,
      // whose onopen synchronously starts the next scope read.
      for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
    });

    expect(scopeUrls).toHaveLength(2);
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.scope).not.toBeNull();
    expect(OpeningEventSource.instances).toHaveLength(1);
    expect(OpeningEventSource.instances[0]?.closed).toBe(false);
    expect(
      OpeningEventSource.instances[0]?.listenerCount('workspace-context-changed'),
    ).toBe(1);

    // Advance the coalescer's monotonic clock without sleeping so this is a
    // distinct invalidation, not the same 250 ms reconnect burst.
    monotonicNow = 251;
    await act(async () => {
      OpeningEventSource.instances[0]?.emit('workspace-context-changed', {
        type: 'workspace-context-changed',
      });
      await Promise.resolve();
    });
    expect(OpeningEventSource.instances[0]?.deliveredListenerCalls).toBeGreaterThan(0);
    await waitFor(() => expect(scopeUrls).toHaveLength(3));
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.scope).not.toBeNull();
    expect(OpeningEventSource.instances).toHaveLength(1);

    hook.unmount();
  });

  it('fails closed when a project-catalog event revokes the currently open project', async () => {
    const initial = teamScope(
      'project-unshared',
      'workspace-unshared',
      'member-reader',
    );
    if (initial.scope.kind === 'team') initial.scope.visibility = 'team';
    const caller = initial.scope.context as WorkspaceCollabContext;
    const fetchMock = vi.fn(async () => new Response('{}', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('EventSource', OpeningEventSource as unknown as typeof EventSource);

    const hook = renderHook(() => useProjectWorkspaceScope(
      'project-unshared',
      caller,
      caller.workspaceId,
      initial.scope,
    ));

    expect(hook.result.current).toMatchObject({
      loading: false,
      scope: initial.scope,
    });
    await act(async () => {
      for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      OpeningEventSource.instances[0]?.emit('team-projects-changed', {
        type: 'team-projects-changed',
        projectId: 'project-unshared',
        kind: 'catalog',
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(hook.result.current).toEqual({
        loading: false,
        scope: null,
        failure: 'forbidden',
      });
    });
  });

  it('revalidates and hides a stale scope when the same member authority changes', async () => {
    const first = teamScope('project-role', 'workspace-role', 'member-role');
    const second = deferred<Response>();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(first), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockReturnValueOnce(second.promise);
    vi.stubGlobal('fetch', fetchMock);

    const initialCaller = first.scope.context as WorkspaceCollabContext;
    const hook = renderHook(
      ({ caller }) => useProjectWorkspaceScope(
        'project-role',
        caller,
        caller.workspaceId,
      ),
      { initialProps: { caller: initialCaller } },
    );

    await waitFor(() => {
      expect(hook.result.current.scope?.context).toMatchObject({
        role: 'member',
        permissions: { canWriteSyncedFiles: true },
      });
    });

    const promotedCaller: WorkspaceCollabContext = {
      ...initialCaller,
      role: 'admin',
      permissions: {
        ...initialCaller.permissions,
        canShareProjects: false,
        canWriteSyncedFiles: false,
      },
    };
    hook.rerender({ caller: promotedCaller });

    expect(
      hook.result.current,
      'same member id with changed role/permissions must not expose the old scope',
    ).toEqual({ loading: true, scope: null });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const promotedScope = teamScope(
      'project-role',
      'workspace-role',
      'member-role',
    );
    if (promotedScope.scope.context) {
      promotedScope.scope.context = {
        ...promotedScope.scope.context,
        role: 'admin',
        permissions: promotedCaller.permissions,
      };
    }
    second.resolve(new Response(JSON.stringify(promotedScope), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    await waitFor(() => {
      expect(hook.result.current.scope?.context).toMatchObject({
        role: 'admin',
        permissions: {
          canShareProjects: false,
          canWriteSyncedFiles: false,
        },
      });
    });
  });

  it('distinguishes old-daemon, revoked and directory-outage failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('project-old-daemon')) return new Response('{}', { status: 404 });
      if (url.includes('project-revoked')) return new Response('{}', { status: 403 });
      if (url.includes('project-outage')) return new Response('{}', { status: 503 });
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    const oldDaemon = renderHook(() =>
      useProjectWorkspaceScope('project-old-daemon'),
    );
    await waitFor(() => {
      expect(oldDaemon.result.current).toEqual({
        loading: false,
        scope: null,
        failure: 'unsupported',
      });
    });
    oldDaemon.unmount();

    const revoked = renderHook(() =>
      useProjectWorkspaceScope('project-revoked'),
    );
    await waitFor(() => {
      expect(revoked.result.current).toEqual({
        loading: false,
        scope: null,
        failure: 'forbidden',
      });
    });
    revoked.unmount();

    const outage = renderHook(() =>
      useProjectWorkspaceScope('project-outage'),
    );
    await waitFor(() => {
      expect(outage.result.current).toEqual({
        loading: false,
        scope: null,
        failure: 'unavailable',
      });
    });
    outage.unmount();
  });

  it('does not poll a settled forbidden scope on the retry timer', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response('{}', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    const revoked = renderHook(() =>
      useProjectWorkspaceScope('project-revoked-timer'),
    );
    await act(async () => {
      for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
    });
    expect(revoked.result.current.failure).toBe('forbidden');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('authorizes AMR only for explicit personal or team scopes', () => {
    expect(projectWorkspaceScopeAuthorizesAmr(null)).toBe(false);
    expect(projectWorkspaceScopeAuthorizesAmr({
      kind: 'unbound',
      projectId: 'project-a',
      workspaceId: null,
      context: null,
    })).toBe(false);
    expect(projectWorkspaceScopeAuthorizesAmr({
      kind: 'unavailable',
      projectId: 'project-a',
      workspaceId: 'workspace-a',
      visibility: 'personal',
      context: null,
    })).toBe(false);
    expect(
      projectWorkspaceScopeAuthorizesAmr(
        teamScope('project-a', 'workspace-a', 'member-a').scope,
      ),
    ).toBe(true);
  });

  it('drops a late response from the previously open project', async () => {
    const projectA = deferred<Response>();
    const projectB = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/project-a/')) return projectA.promise;
      if (url.includes('/project-b/')) return projectB.promise;
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    const hook = renderHook(
      ({ projectId }) => useProjectWorkspaceScope(projectId),
      { initialProps: { projectId: 'project-a' } },
    );
    hook.rerender({ projectId: 'project-b' });

    await act(async () => {
      projectB.resolve(new Response(
        JSON.stringify(teamScope('project-b', 'workspace-b', 'member-b')),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
    });
    await waitFor(() => {
      expect(hook.result.current.scope).toMatchObject({
        projectId: 'project-b',
        workspaceId: 'workspace-b',
      });
    });

    await act(async () => {
      projectA.resolve(new Response(
        JSON.stringify(teamScope('project-a', 'workspace-a', 'member-a')),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
    });
    expect(hook.result.current.scope).toMatchObject({
      projectId: 'project-b',
      workspaceId: 'workspace-b',
    });
  });

  it('does not expose project A scope during the transition frame to project B', async () => {
    const projectB = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/project-a/')) {
        return new Response(
          JSON.stringify(teamScope('project-a', 'workspace-a', 'member-a')),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/project-b/')) return projectB.promise;
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    const hook = renderHook(
      ({ projectId }) => useProjectWorkspaceScope(projectId),
      { initialProps: { projectId: 'project-a' } },
    );
    await waitFor(() => {
      expect(hook.result.current.scope).toMatchObject({
        projectId: 'project-a',
        workspaceId: 'workspace-a',
      });
    });

    hook.rerender({ projectId: 'project-b' });
    expect(hook.result.current).toEqual({ loading: true, scope: null });
  });

  it('revalidates the same project when the signed-in workspace member changes', async () => {
    const memberNew = deferred<Response>();
    const scopeResponses: (() => Response | Promise<Response>)[] = [
      () =>
        new Response(
          JSON.stringify(teamScope('project-a', 'workspace-a', 'member-old')),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      () => memberNew.promise,
    ];
    const scopeCalls: string[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      // The hook resolves the caller's own workspace identity before it can ask
      // what this project's scope is FOR that caller. This case is about the
      // scope read, so answer "no workspace" and keep the context read out of
      // the scope response sequence.
      if (url.includes('/api/workspace/context')) {
        return Promise.resolve(
          new Response(JSON.stringify({ context: null }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      scopeCalls.push(url);
      const next = scopeResponses.shift();
      if (!next) throw new Error(`Unexpected scope fetch: ${url}`);
      return Promise.resolve(next());
    });
    vi.stubGlobal('fetch', fetchMock);

    const hook = renderHook(() => useProjectWorkspaceScope('project-a'));
    await waitFor(() => {
      expect(hook.result.current.scope).toMatchObject({
        context: { workspaceMemberId: 'member-old' },
      });
    });

    act(() => {
      window.dispatchEvent(new Event(WORKSPACE_CONTEXT_REFRESH_EVENT));
    });
    expect(hook.result.current).toEqual({ loading: true, scope: null });

    await act(async () => {
      memberNew.resolve(new Response(
        JSON.stringify(teamScope('project-a', 'workspace-a', 'member-new')),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
    });
    await waitFor(() => {
      expect(hook.result.current.scope).toMatchObject({
        context: { workspaceMemberId: 'member-new' },
      });
    });
    expect(scopeCalls).toHaveLength(2);
  });

  // A route bootstrap that answers AFTER ProjectView mounted flips
  // `initialScope` from absent to present on an already-mounted hook. That must
  // not strand the hook: the mount-time read is still the only thing that can
  // settle state, because state was never seeded from the late prop.
  //
  // Regression: the initial-read skip keyed off the CURRENT render's
  // "can seed" answer, so the late prop aborted the in-flight scope GET and
  // returned without ever seeding a scope or clearing `loading`. `loading`
  // then pinned `true` forever — and because the workspace invalidation SSE is
  // only subscribed once a scope resolves, no later event could re-trigger the
  // read either. ProjectView reads that stuck `loading` as
  // `workspaceContextReadOnly`, so the whole workspace fell into the
  // "This is a shared project — you can view and comment" read-only mode with a
  // permanently non-editable composer.
  it('settles when a bootstrap scope arrives after the initial read started', async () => {
    vi.stubGlobal('EventSource', OpeningEventSource as unknown as typeof EventSource);
    const bootstrapScope = {
      kind: 'unbound',
      projectId: 'project-late-bootstrap',
      workspaceId: null,
      context: null,
    } as const;
    const inFlight = deferred<Response>();
    const scopeCalls: string[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/workspace/context')) {
        return Promise.resolve(new Response(JSON.stringify({ context: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }
      if (!url.includes('/workspace-scope')) {
        throw new Error(`Unexpected fetch: ${url}`);
      }
      scopeCalls.push(url);
      // The mount-time read is still in flight when the bootstrap prop lands.
      if (scopeCalls.length === 1) return inFlight.promise;
      return Promise.resolve(new Response(
        JSON.stringify({ scope: bootstrapScope }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
    });
    vi.stubGlobal('fetch', fetchMock);

    const hook = renderHook(
      ({ initialScope }: { initialScope?: typeof bootstrapScope }) =>
        useProjectWorkspaceScope('project-late-bootstrap', null, null, initialScope),
      { initialProps: {} as { initialScope?: typeof bootstrapScope } },
    );
    await waitFor(() => expect(scopeCalls).toHaveLength(1));
    expect(hook.result.current.loading).toBe(true);

    // The route bootstrap answers now, after the hook already mounted.
    hook.rerender({ initialScope: bootstrapScope });

    await waitFor(() => {
      expect(hook.result.current).toMatchObject({
        loading: false,
        scope: bootstrapScope,
      });
    });
  });
});
