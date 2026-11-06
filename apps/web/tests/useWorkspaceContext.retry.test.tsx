// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetCoalescedGet } from '../src/lib/coalesced-get';
import {
  __setWorkspaceContextRetryBackoffForTests,
  resetWorkspaceContextCache,
  useWorkspaceContext,
} from '../src/collab/useWorkspaceContext';
import {
  workspaceContextFixture,
  workspaceDirectoryFixture,
} from './helpers/workspace-context';

const TEAM_CONTEXT = workspaceContextFixture({
  workspaceId: 'workspace-team',
  workspaceMemberId: 'member-team',
  workspaceName: 'Team workspace',
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

// Silence the 30s compatibility poll / SSE floor so the ONLY re-reads a test
// observes come from the failure-retry schedule under test.
function makeDocumentHidden(): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'hidden',
  });
}

describe('useWorkspaceContext failure retry (P1.B)', () => {
  beforeEach(() => {
    resetCoalescedGet();
    resetWorkspaceContextCache();
    makeDocumentHidden();
    // Deterministic (jitter-off) schedule so the 1s→2s→4s growth is exact.
    __setWorkspaceContextRetryBackoffForTests({
      initialMs: 1000,
      maxMs: 30_000,
      factor: 2,
      jitter: false,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.unstubAllGlobals();
    __setWorkspaceContextRetryBackoffForTests(null);
    resetCoalescedGet();
    resetWorkspaceContextCache();
  });

  it('retries a failed context read with exponential backoff and resets after a success', async () => {
    let failContext = true;
    let contextReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/workspace/directory') {
          return jsonResponse(workspaceDirectoryFixture([TEAM_CONTEXT]));
        }
        if (url === '/api/workspace/context') {
          contextReads += 1;
          if (failContext) {
            return new Response(JSON.stringify({ error: 'boom' }), {
              status: 500,
              headers: { 'content-type': 'application/json' },
            });
          }
          return jsonResponse({ context: TEAM_CONTEXT });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const flush = async (ms: number) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    };

    const hook = renderHook(() => useWorkspaceContext());
    await flush(0);
    await flush(0);
    // The mount read failed: exactly one attempt so far, marked unavailable.
    expect(contextReads).toBe(1);
    expect(hook.result.current.failure).toBe('unavailable');

    // First retry lands at the base 1s delay.
    await flush(1000);
    expect(contextReads).toBe(2);

    // Backed off: the second retry is 2s out, NOT another 1s.
    await flush(1999);
    expect(contextReads).toBe(2);
    await flush(1);
    expect(contextReads).toBe(3);

    // Third retry is 4s out.
    await flush(3999);
    expect(contextReads).toBe(3);
    await flush(1);
    expect(contextReads).toBe(4);

    // Recover: the next retry succeeds and the failure clears.
    failContext = false;
    await flush(8000); // fourth retry is 8s out
    expect(contextReads).toBe(5);
    expect(hook.result.current.context?.workspaceId).toBe(TEAM_CONTEXT.workspaceId);
    expect(hook.result.current.failure).toBeUndefined();

    // A later failure starts over at the base 1s delay — success reset the depth.
    failContext = true;
    // Drop the coalesced-read cache so the ambient focus refresh actually hits
    // the network (and fails) instead of replaying the cached success.
    resetCoalescedGet();
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await flush(0);
    const readsBeforeReset = contextReads; // the focus read failed → +1
    // The retry is armed at the BASE 1s delay again, proving the depth reset.
    await flush(999);
    expect(contextReads).toBe(readsBeforeReset);
    await flush(1);
    expect(contextReads).toBe(readsBeforeReset + 1);
  });
});
