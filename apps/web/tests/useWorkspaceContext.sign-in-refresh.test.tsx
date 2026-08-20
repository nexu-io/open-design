// @vitest-environment jsdom
//
// #140: "signed into the cloud account during onboarding, but the home view's
// bottom-left corner still says signed out."
//
// The rail's sign-in callout is gated on `!context && !loading` (EntryShell:
// `footerNotice`). `loading` had already settled to false on the signed-out
// read that ran before onboarding, and the post-sign-in re-read did not raise
// it again — so for the whole duration of that (vela-backed, up-to-seconds)
// read the shell kept painting the signed-out callout even though the user had
// just signed in.
//
// The fix distinguishes an EXPLICIT identity-change refresh from ambient
// revalidation: only the deliberate signal may blank a stale signed-out answer.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  notifyWorkspaceContextRefresh,
  resetWorkspaceContextCache,
  useWorkspaceContext,
} from '../src/collab/useWorkspaceContext';
import {
  workspaceContextFixture,
  workspaceDirectoryFixture,
} from './helpers/workspace-context';

const SIGNED_IN = workspaceContextFixture({
  workspaceId: 'ws-1',
  workspaceMemberId: 'member-1',
  teamName: 'Acme',
  workspaceName: 'Acme',
});

/** A fetch whose every call resolves only when the test says so. */
function deferredContextFetch() {
  const pending: Array<{
    url: string;
    resolve: (response: Response) => void;
  }> = [];
  const fetchMock = vi.fn(
    (input: RequestInfo | URL) =>
      new Promise<Response>((resolve) => {
        pending.push({ url: String(input), resolve });
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    /** Settle every read issued so far with `context`. */
    async settleAll(context: unknown) {
      for (let pass = 0; pass < 4; pass += 1) {
        const waiting = pending.splice(0, pending.length);
        if (waiting.length === 0) {
          await Promise.resolve();
          if (pending.length === 0) break;
          continue;
        }
        await act(async () => {
          for (const request of waiting) {
            const body =
              request.url === '/api/workspace/directory'
                ? workspaceDirectoryFixture(
                    context ? [context as typeof SIGNED_IN] : [],
                  )
                : { context };
            request.resolve(
              new Response(JSON.stringify(body), {
                status: 200,
                headers: { 'content-type': 'application/json' },
              }),
            );
          }
          await Promise.resolve();
        });
      }
    },
  };
}

describe('useWorkspaceContext sign-in refresh', () => {
  beforeEach(() => {
    resetWorkspaceContextCache();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    resetWorkspaceContextCache();
  });

  it('stops reporting signed-out while an explicit post-sign-in re-read is in flight', async () => {
    const { settleAll } = deferredContextFetch();
    const { result } = renderHook(() => useWorkspaceContext());

    // Before onboarding: the user really is signed out. The callout belongs on
    // screen here — `!context && !loading`.
    await settleAll(null);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.context).toBeNull();

    // Onboarding finishes and announces the sign-in. The shell must stop
    // asserting "signed out" until the re-read answers.
    await act(async () => {
      notifyWorkspaceContextRefresh();
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.context).toBeNull();

    // ...and lands on the real workspace.
    await settleAll(SIGNED_IN);
    await waitFor(() => expect(result.current.context).toEqual(SIGNED_IN));
    expect(result.current.loading).toBe(false);
  });

  it('leaves ambient revalidation silent so a signed-out user keeps their callout', async () => {
    // A genuinely signed-out user must not have the callout flicker away on
    // every window focus — focus is revalidation, not an identity change.
    const { settleAll } = deferredContextFetch();
    const { result } = renderHook(() => useWorkspaceContext());

    await settleAll(null);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.context).toBeNull();

    await settleAll(null);
  });

  it('keeps showing a resolved workspace while an identity refresh re-reads', async () => {
    // The explicit signal must only promote "no context" to "loading". A user
    // who is already signed in has a context on screen, and blanking it would
    // reintroduce the flash the module cache exists to prevent.
    const { settleAll } = deferredContextFetch();
    const { result } = renderHook(() => useWorkspaceContext());

    await settleAll(SIGNED_IN);
    await waitFor(() => expect(result.current.context).toEqual(SIGNED_IN));

    await act(async () => {
      notifyWorkspaceContextRefresh();
    });
    expect(result.current.context).toEqual(SIGNED_IN);
    expect(result.current.loading).toBe(false);

    await settleAll(SIGNED_IN);
  });

  it.each([
    [404, 'unsupported'],
    [503, 'unavailable'],
  ] as const)(
    'distinguishes an old daemon (%s) from an unavailable workspace service',
    async (status, failure) => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async () => new Response(null, { status })),
      );
      const { result } = renderHook(() => useWorkspaceContext());

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.context).toBeNull();
      expect(result.current.failure).toBe(failure);
    },
  );
});
