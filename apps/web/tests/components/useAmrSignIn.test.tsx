// @vitest-environment jsdom
//
// #5244 / looper review on #6438: the shared login hook must (1) nudge
// workspace surfaces on a successful sign-in (they subscribe to the workspace
// refresh events, not the AMR login-status event), and (2) cancel the daemon's
// `vela login` child on timeout so a retry does not 409 as alreadyRunning.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAmrSignIn } from '../../src/components/useAmrSignIn';
import {
  AMR_LOGIN_POLL_INTERVAL_MS,
  AMR_LOGIN_TIMEOUT_MS,
} from '../../src/components/amrLoginPolling';

const originalFetch = globalThis.fetch;

function Harness({
  onStatus,
}: {
  onStatus?: (status: { loggedIn: boolean }) => void;
}) {
  const { amrLoginPending, handleAmrSignIn } = useAmrSignIn({
    metricsConsent: false,
    installationId: 'inst-1',
    onStatus,
  });
  return (
    <button
      type="button"
      onClick={() => void handleAmrSignIn()}
      disabled={amrLoginPending}
    >
      sign-in
    </button>
  );
}

function stubFetch(statusBody: () => object) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/integrations/vela/login')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url.endsWith('/api/integrations/vela/login/cancel')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url.endsWith('/api/integrations/vela/status')) {
      return new Response(JSON.stringify(statusBody()), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useAmrSignIn', () => {
  it('emits workspace refresh events once polling reaches signed-in', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      stubFetch(() => ({ loggedIn: true, loginInFlight: false })),
    );
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'sign-in' }));

    // Let the login POST settle, then trigger the first poll tick, which sees
    // loggedIn:true and emits the workspace refresh events.
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);

    const events = dispatchSpy.mock.calls.map(([event]) => (event as Event).type);
    expect(events).toContain('od:workspace-context-refresh');
    expect(events).toContain('od:workspace-billing-refresh');
    expect(events).toContain('od:team-projects-changed');
  });

  it('cancels the daemon vela login child on timeout', async () => {
    vi.useFakeTimers();
    const cancelCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/integrations/vela/login')) {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (url.endsWith('/api/integrations/vela/login/cancel')) {
          cancelCalls.push(url);
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (url.endsWith('/api/integrations/vela/status')) {
          // Never resolves to loggedIn and never reports loginInFlight:false —
          // the outcome stays 'pending' until the timeout.
          return new Response(
            JSON.stringify({ loggedIn: false, loginInFlight: true }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'sign-in' }));

    // Let the initial login POST settle, then advance past the timeout.
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(AMR_LOGIN_TIMEOUT_MS);

    expect(cancelCalls).toContain('/api/integrations/vela/login/cancel');
  });
});
