// @vitest-environment jsdom

/**
 * A tab still claiming a workspace that belongs to a DIFFERENT account.
 *
 * This is the shape that left people on the sign-in screen overnight. The
 * credential and the claimed workspace id are not switched atomically, so an
 * account switch — or an `OPEN_DESIGN_AMR_PROFILE` flip between prod and test —
 * leaves the tab holding ids from the previous identity. The daemon verifies
 * that claim against the account's own membership directory and answers
 * `403 WORKSPACE_ACCESS_DENIED`; upstream, vela answers the equivalent
 * `403 missing_principal` when a workspace id and a control key describe
 * different accounts.
 *
 * The ambient revalidation that reaches that state is the one that skips the
 * directory (`exactScopeOnly`, used while the workspace SSE is connected): it
 * re-asserts the workspace already in hand rather than listing the account. So
 * nothing re-picks the workspace, and the claim stays wrong on every poll.
 *
 * The directory read is healthy throughout and already lists the right
 * workspace, so the client holds everything it needs to fix itself. What it
 * used to do instead was read the 403 as "your credential was rejected", enter
 * `reauth-required` — the state both `App.tsx` and `EntryShell.tsx` answer by
 * replacing the route with onboarding — and stop retrying, for a session whose
 * credential was never in question.
 */

import { act, cleanup, renderHook } from '@testing-library/react';
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
    queueMicrotask(() => this.open());
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (!listener) return;
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
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
}

/** The workspace the previous (test-environment) account owned. */
const FOREIGN = workspaceContextFixture({
  workspaceId: 'j2ryucc2ynz4gbtq30l80czf',
  workspaceMemberId: 'member-test',
  workspaceName: 'Test workspace',
});

/** The workspace the credential in hand actually owns. */
const OWNED = workspaceContextFixture({
  workspaceId: 'm46zutn5p4sgpwenaouxfucs',
  workspaceMemberId: 'member-prod',
  workspaceName: 'Prod workspace',
});

const WORKSPACE_SELECTION_SESSION_KEY = 'od.workspaceSelection.v1';
/** `WORKSPACE_CONTEXT_SSE_FLOOR_MS`: the exact-scope safety read. */
const SSE_FLOOR_MS = 120_000;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function makeDocumentVisible(): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
}

describe('useWorkspaceContext with a foreign workspace claim', () => {
  beforeEach(() => {
    resetCoalescedGet();
    resetWorkspaceContextCache();
    makeDocumentVisible();
    OpeningEventSource.instances = [];
    vi.stubGlobal('EventSource', OpeningEventSource as unknown as typeof EventSource);
    // Installed before the hook mounts so the SSE-floor poll it schedules is a
    // fake timer this test can actually drive.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.unstubAllGlobals();
    resetCoalescedGet();
    resetWorkspaceContextCache();
    OpeningEventSource.instances = [];
    window.sessionStorage.clear();
  });

  it('re-resolves from the directory instead of demanding a fresh sign-in', async () => {
    // Phase 1: the tab legitimately holds the test-environment workspace.
    let account: 'test' | 'prod' = 'test';
    const claimedWorkspaceIds: string[] = [];
    const owned = () => (account === 'test' ? FOREIGN : OWNED);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        // `GET /api/workspace/directory` is not workspace-scoped. It answers
        // 200 with the signed-in account's real memberships throughout — the
        // whole reason recovery is possible without a new sign-in.
        if (url === '/api/workspace/directory') {
          return jsonResponse(workspaceDirectoryFixture([owned()]));
        }
        if (url === '/api/workspace/context') {
          const headers = (init?.headers ?? {}) as Record<string, string>;
          const claimed = headers['x-od-workspace-id'] ?? '';
          claimedWorkspaceIds.push(claimed);
          if (claimed !== owned().workspaceId) {
            return new Response(
              JSON.stringify({ error: 'WORKSPACE_ACCESS_DENIED' }),
              { status: 403, headers: { 'content-type': 'application/json' } },
            );
          }
          return jsonResponse({ context: owned() });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const flush = async (ms = 1) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    };

    const { result } = renderHook(() => useWorkspaceContext());
    for (let i = 0; i < 5 && !result.current.context; i += 1) await flush();
    expect(result.current.context?.workspaceId).toBe(FOREIGN.workspaceId);
    // The SSE has to be connected: it is what makes the safety read exact-scope
    // (directory-free), which is how the stale claim survives.
    expect(OpeningEventSource.instances.length).toBeGreaterThan(0);

    // Phase 2: the credential now belongs to the prod account. Nothing told
    // this tab, so its next ambient read still asserts the old workspace.
    account = 'prod';
    resetCoalescedGet();
    await flush(SSE_FLOOR_MS + 1);
    await flush();

    expect(claimedWorkspaceIds.at(-1)).toBe(FOREIGN.workspaceId);
    // A 403 is an answer about the workspace, not the credential. The shell
    // belongs in the transient "recovering" lane — never in the one that both
    // `App.tsx` and `EntryShell.tsx` answer by navigating to onboarding.
    expect(result.current.failure).toBe('unavailable');
    // The rejected claim must not survive to be asserted a third time.
    expect(window.sessionStorage.getItem(WORKSPACE_SELECTION_SESSION_KEY) ?? '')
      .not.toContain(FOREIGN.workspaceId);

    // Phase 3: recovery is automatic — the retry lists the account again and
    // lands on the workspace the directory knew all along.
    for (let i = 0; i < 5 && claimedWorkspaceIds.at(-1) !== OWNED.workspaceId; i += 1) {
      await flush(30_000);
    }
    expect(claimedWorkspaceIds.at(-1)).toBe(OWNED.workspaceId);
    expect(result.current.context?.workspaceId).toBe(OWNED.workspaceId);
    expect(result.current.failure).toBeUndefined();
  });

  it('still reports reauth-required when the daemon rejects the credential itself', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/workspace/directory') {
          return jsonResponse(workspaceDirectoryFixture([OWNED]));
        }
        if (url === '/api/workspace/context') {
          return new Response(JSON.stringify({ error: 'AMR_AUTH_REQUIRED' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const { result } = renderHook(() => useWorkspaceContext());
    for (let i = 0; i < 5 && !result.current.failure; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
    }
    expect(result.current.failure).toBe('reauth-required');
  });
});
