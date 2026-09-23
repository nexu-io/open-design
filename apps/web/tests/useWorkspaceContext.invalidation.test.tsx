// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetCoalescedGet } from '../src/lib/coalesced-get';
import {
  resetWorkspaceContextCache,
  useWorkspaceContext,
} from '../src/collab/useWorkspaceContext';
import {
  workspaceContextFixture,
  workspaceDirectoryFixture,
} from './helpers/workspace-context';

class OpeningEventSource {
  static instances: OpeningEventSource[] = [];
  static autoOpen = true;

  readonly url: string;
  readonly withCredentials = false;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;
  readyState = this.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  constructor(url: string | URL) {
    this.url = String(url);
    OpeningEventSource.instances.push(this);
    if (OpeningEventSource.autoOpen) queueMicrotask(() => this.open());
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
      if (typeof listener === 'function') listener.call(this, event);
      else listener.handleEvent(event);
    }
    return true;
  }

  close(): void {
    this.readyState = this.CLOSED;
  }

  open(): void {
    this.readyState = this.OPEN;
    this.onopen?.(new Event('open'));
  }

  emit(type: string, data: unknown = {}): void {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
}

const TEAM_CONTEXT = workspaceContextFixture({
  workspaceId: 'workspace-team',
  workspaceMemberId: 'member-team',
  workspaceName: 'Team workspace',
});
const PERSONAL_CONTEXT = workspaceContextFixture({
  workspaceId: 'workspace-personal',
  workspaceMemberId: 'member-personal',
  workspaceName: 'Personal workspace',
  workspaceType: 'personal',
  role: 'owner',
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('useWorkspaceContext invalidation freshness', () => {
  beforeEach(() => {
    resetCoalescedGet();
    resetWorkspaceContextCache();
    OpeningEventSource.instances = [];
    OpeningEventSource.autoOpen = true;
    vi.stubGlobal('EventSource', OpeningEventSource as unknown as typeof EventSource);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetCoalescedGet();
    resetWorkspaceContextCache();
    OpeningEventSource.instances = [];
    OpeningEventSource.autoOpen = true;
  });

  it('revalidates the directory after a pushed membership revocation', async () => {
    OpeningEventSource.autoOpen = false;
    let membershipActive = true;
    let directoryReads = 0;
    let contextReads = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/workspace/directory') {
        directoryReads += 1;
        return jsonResponse(workspaceDirectoryFixture([
          membershipActive ? TEAM_CONTEXT : PERSONAL_CONTEXT,
        ]));
      }
      if (url === '/api/workspace/context') {
        contextReads += 1;
        return jsonResponse({
          context: membershipActive ? TEAM_CONTEXT : PERSONAL_CONTEXT,
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    const hook = renderHook(() => useWorkspaceContext());
    await waitFor(() => {
      expect(hook.result.current.context?.workspaceId).toBe(TEAM_CONTEXT.workspaceId);
    });
    expect(directoryReads).toBe(1);
    expect(contextReads).toBe(1);

    membershipActive = false;
    await waitFor(() => expect(OpeningEventSource.instances).toHaveLength(1));
    await act(async () => {
      OpeningEventSource.instances[0]?.emit('workspace-context-changed', {
        type: 'workspace-context-changed',
      });
    });

    await waitFor(() => {
      expect(directoryReads).toBe(2);
      expect(contextReads).toBe(2);
      expect(hook.result.current.context?.workspaceId).toBe(PERSONAL_CONTEXT.workspaceId);
    });
  });

  it('uses a fresh snapshot when the workspace stream first connects', async () => {
    OpeningEventSource.autoOpen = false;
    let role: 'member' | 'admin' = 'member';
    let directoryReads = 0;
    let contextReads = 0;
    const context = () => workspaceContextFixture({
      ...TEAM_CONTEXT,
      role,
      permissions: {
        ...TEAM_CONTEXT.permissions,
        canInviteMembers: role === 'admin',
      },
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/workspace/directory') {
        directoryReads += 1;
        return jsonResponse(workspaceDirectoryFixture([context()]));
      }
      if (url === '/api/workspace/context') {
        contextReads += 1;
        return jsonResponse({ context: context() });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    const hook = renderHook(() => useWorkspaceContext());
    await waitFor(() => {
      expect(hook.result.current.context?.role).toBe('member');
      expect(OpeningEventSource.instances).toHaveLength(1);
    });
    expect(directoryReads).toBe(1);
    expect(contextReads).toBe(1);

    // The role changed while the browser had no workspace-event sink. Opening
    // the stream is the only catch-up signal; settled client caches still hold
    // the old member snapshot at this point.
    role = 'admin';
    await act(async () => {
      OpeningEventSource.instances[0]?.open();
    });

    await waitFor(() => {
      expect(directoryReads).toBe(2);
      expect(contextReads).toBe(2);
      expect(hook.result.current.context).toMatchObject({
        role: 'admin',
        permissions: { canInviteMembers: true },
      });
    });
  });

  it('uses an exact-scope safety read without relisting the account while SSE is connected', async () => {
    vi.useFakeTimers();
    OpeningEventSource.autoOpen = false;
    let directoryReads = 0;
    let contextReads = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/workspace/directory') {
        directoryReads += 1;
        return jsonResponse(workspaceDirectoryFixture([TEAM_CONTEXT]));
      }
      if (url === '/api/workspace/context') {
        contextReads += 1;
        return jsonResponse({ context: TEAM_CONTEXT });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    const hook = renderHook(() => useWorkspaceContext());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(hook.result.current.context?.workspaceId).toBe(TEAM_CONTEXT.workspaceId);
    expect(directoryReads).toBe(1);
    expect(contextReads).toBe(1);

    await act(async () => {
      OpeningEventSource.instances[0]?.open();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(directoryReads).toBe(2);
    expect(contextReads).toBe(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(directoryReads).toBe(2);
    expect(contextReads).toBe(3);
  });

  it('uses an exact-scope read on focus while the stream remains connected', async () => {
    OpeningEventSource.autoOpen = false;
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    let directoryReads = 0;
    let contextReads = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/workspace/directory') {
        directoryReads += 1;
        return jsonResponse(workspaceDirectoryFixture([TEAM_CONTEXT]));
      }
      if (url === '/api/workspace/context') {
        contextReads += 1;
        return jsonResponse({ context: TEAM_CONTEXT });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    const hook = renderHook(() => useWorkspaceContext());
    await waitFor(() => {
      expect(hook.result.current.context?.workspaceId).toBe(TEAM_CONTEXT.workspaceId);
    });
    act(() => OpeningEventSource.instances[0]?.open());
    await waitFor(() => expect(directoryReads).toBe(2));
    expect(contextReads).toBe(2);

    // Outside forceCoalescedGet's same-transition burst window, this is a
    // genuinely separate ambient safety check.
    clock = 251;
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(contextReads).toBe(3));
    expect(directoryReads).toBe(2);
  });
});
