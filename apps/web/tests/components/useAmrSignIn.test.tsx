// @vitest-environment jsdom
//
// #5244 / looper review on #6438: the shared login hook must (1) nudge
// workspace surfaces on a successful sign-in, (2) cancel THIS attempt's daemon
// `vela login` child by authAttemptId on timeout (never a body-less "cancel
// whatever is latest"), (3) surface a failure when the cancel fails, and
// (4) never install a poller for an attempt that was cancelled mid-start.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAmrSignIn } from '../../src/components/useAmrSignIn';
import {
  AMR_LOGIN_POLL_INTERVAL_MS,
  AMR_LOGIN_TIMEOUT_MS,
  AMR_LOGIN_STATUS_EVENT,
} from '../../src/components/amrLoginPolling';

const originalFetch = globalThis.fetch;
const AUTH_ATTEMPT_ID = 'f07a1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b';

function Harness() {
  const { amrLoginPending, amrLoginError, handleAmrSignIn } = useAmrSignIn({
    metricsConsent: false,
    installationId: 'inst-1',
  });
  return (
    <button
      type="button"
      onClick={() => void handleAmrSignIn()}
      disabled={amrLoginPending}
    >
      {amrLoginError ? `error:${amrLoginError}` : 'sign-in'}
    </button>
  );
}

function stubFetch({
  statusBody,
  cancelOk = true,
  loginAuthAttemptId = AUTH_ATTEMPT_ID,
}: {
  statusBody: () => object;
  cancelOk?: boolean;
  loginAuthAttemptId?: string | null;
}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/integrations/vela/login')) {
      return new Response(
        JSON.stringify(
          loginAuthAttemptId
            ? { ok: true, authAttemptId: loginAuthAttemptId }
            : { ok: true },
        ),
        { status: 200 },
      );
    }
    if (url.endsWith('/api/integrations/vela/login/cancel')) {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      return new Response(
        JSON.stringify({ ok: cancelOk, canceled: cancelOk }),
        { status: cancelOk ? 200 : 500 },
      );
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
      stubFetch({ statusBody: () => ({ loggedIn: true, loginInFlight: false }) }),
    );
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'sign-in' }));

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);

    const events = dispatchSpy.mock.calls.map(([event]) => (event as Event).type);
    expect(events).toContain('od:workspace-context-refresh');
    expect(events).toContain('od:workspace-billing-refresh');
    expect(events).toContain('od:team-projects-changed');
  });

  it('cancels the timeout attempt BY authAttemptId (targeted, not "latest")', async () => {
    vi.useFakeTimers();
    const cancelBodies: Array<Record<string, unknown> | null> = [];
    const fetchMock = stubFetch({
      statusBody: () => ({ loggedIn: false, loginInFlight: true }),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/integrations/vela/login/cancel')) {
          cancelBodies.push(init?.body ? JSON.parse(String(init.body)) : null);
        }
        return fetchMock(input, init);
      }),
    );

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'sign-in' }));

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(AMR_LOGIN_TIMEOUT_MS);

    expect(cancelBodies.length).toBeGreaterThan(0);
    expect(cancelBodies[0]).toMatchObject({ authAttemptId: AUTH_ATTEMPT_ID });
  });

  it('surfaces a failure state when the cancel itself fails', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      stubFetch({
        statusBody: () => ({ loggedIn: false, loginInFlight: true }),
        cancelOk: false,
      }),
    );

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'sign-in' }));

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(AMR_LOGIN_TIMEOUT_MS);

    expect(screen.getByRole('button').textContent).toContain('error:');
  });

  it('does not install a poller when the attempt is cancelled mid-start', async () => {
    vi.useFakeTimers();
    let resolveLogin: (value: Response) => void = () => {};
    const loginPromise = new Promise<Response>((resolve) => {
      resolveLogin = resolve;
    });
    const statusCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/integrations/vela/login')) return loginPromise;
        if (url.endsWith('/api/integrations/vela/status')) statusCalls.push(url);
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'sign-in' }));

    // Cancel the attempt (from another surface) while startVelaLogin is pending.
    window.dispatchEvent(
      new CustomEvent(AMR_LOGIN_STATUS_EVENT, { detail: { reason: 'login-canceled' } }),
    );
    resolveLogin(
      new Response(JSON.stringify({ ok: true, authAttemptId: AUTH_ATTEMPT_ID }), {
        status: 200,
      }),
    );

    // Even after the start resolves and the poll interval elapses, no status
    // poll may fire for the superseded attempt.
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    expect(statusCalls).toHaveLength(0);
  });
});
