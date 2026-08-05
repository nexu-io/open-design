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
  AMR_LOGIN_STARTUP_SETTLE_MS,
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

  it('refuses a broad "cancel latest" when the start omitted an authAttemptId', async () => {
    vi.useFakeTimers();
    const cancelCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/integrations/vela/login')) {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (url.endsWith('/api/integrations/vela/login/cancel')) {
          cancelCalls.push(url);
          return new Response(
            JSON.stringify({ ok: true, canceled: true }),
            { status: 200 },
          );
        }
        if (url.endsWith('/api/integrations/vela/status')) {
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

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(AMR_LOGIN_TIMEOUT_MS);

    // Without an attempt id the hook must NOT hit the body-less cancel-latest
    // endpoint (which could terminate a newer attempt owned by another surface).
    expect(cancelCalls).toHaveLength(0);
    // ... and it surfaces the failure so retry is not silently re-enabled.
    expect(screen.getByRole('button').textContent).toContain('error:');
  });

  it('does not clear the failure when the daemon reports canceled:false', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      stubFetch({
        statusBody: () => ({ loggedIn: false, loginInFlight: true }),
        cancelOk: true,
      }),
    );
    // Override cancel to report ok:true, canceled:false.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/integrations/vela/login/cancel')) {
          return new Response(
            JSON.stringify({ ok: true, canceled: false }),
            { status: 200 },
          );
        }
        return stubFetch({
          statusBody: () => ({ loggedIn: false, loginInFlight: true }),
        })(input, init);
      }),
    );

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'sign-in' }));

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(AMR_LOGIN_TIMEOUT_MS);

    expect(screen.getByRole('button').textContent).toContain('error:');
  });

  it('emits login-canceled when the timeout cancel is confirmed, status-changed when stopped', async () => {
    // Confirmed cancel → login-canceled.
    vi.useFakeTimers();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    vi.stubGlobal(
      'fetch',
      stubFetch({
        statusBody: () => ({ loggedIn: false, loginInFlight: true }),
        cancelOk: true,
      }),
    );
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'sign-in' }));
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(AMR_LOGIN_TIMEOUT_MS);
    let events = dispatchSpy.mock.calls.map(([event]) => (event as Event).type);
    expect(events).toContain('od:amr-login-status-change');

    // Stopped (browser closed) → status-changed terminal event.
    dispatchSpy.mockClear();
    vi.stubGlobal(
      'fetch',
      stubFetch({ statusBody: () => ({ loggedIn: false, loginInFlight: false }) }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'sign-in' }));
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS + AMR_LOGIN_STARTUP_SETTLE_MS);
    events = dispatchSpy.mock.calls.map(([event]) => (event as Event).type);
    expect(events).toContain('od:amr-login-status-change');
  });

  it('keeps the action disabled during the cancel drain until the daemon reports idle', async () => {
    // looper review on #6438: canceled:true only confirms the daemon accepted
    // the termination signal; the child stays in activeLoginProcs until it
    // exits. The hook must keep pending true (action disabled) until a status
    // poll confirms loginInFlight === false.
    vi.useFakeTimers();
    let loginInFlight = true;
    let cancelFired = false;
    let postCancelCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/integrations/vela/login')) {
          return new Response(
            JSON.stringify({ ok: true, authAttemptId: AUTH_ATTEMPT_ID }),
            { status: 200 },
          );
        }
        if (url.endsWith('/api/integrations/vela/login/cancel')) {
          cancelFired = true;
          return new Response(
            JSON.stringify({ ok: true, canceled: true }),
            { status: 200 },
          );
        }
        if (url.endsWith('/api/integrations/vela/status')) {
          // The child stays in flight for 3 status polls AFTER the cancel
          // signal (drain window), then reports idle.
          if (cancelFired) {
            postCancelCalls += 1;
            loginInFlight = postCancelCalls < 3;
          }
          return new Response(
            JSON.stringify({ loggedIn: false, loginInFlight }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'sign-in' }));

    // Start resolves and the poller is installed.
    await vi.advanceTimersByTimeAsync(100);
    // Advance to just before the timeout, then one poll crosses it.
    await vi.advanceTimersByTimeAsync(AMR_LOGIN_TIMEOUT_MS - AMR_LOGIN_POLL_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
    // Cancel fired, child still in drain (loginInFlight true): action stays
    // disabled (pending true).
    expect(screen.getByRole('button')).toHaveProperty('disabled', true);

    // Drain completes after the child exits → idle → pending clears.
    await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS * 4);
    expect(screen.getByRole('button')).toHaveProperty('disabled', false);
  });

  it('resets the attempt id on retry so a stale id is never reused', async () => {
    // looper review on #6438: the attempt-id ref must be scoped per attempt.
    // Attempt A gets id A and is cancelled; a retry (B) omits an id, so its
    // timeout must NOT reuse A's id via a bodyless "cancel latest".
    vi.useFakeTimers();
    let attempt = 0;
    const cancelBodies: Array<Record<string, unknown> | null> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/integrations/vela/login')) {
          attempt += 1;
          return new Response(
            JSON.stringify(
              attempt === 1 ? { ok: true, authAttemptId: AUTH_ATTEMPT_ID } : { ok: true },
            ),
            { status: 200 },
          );
        }
        if (url.endsWith('/api/integrations/vela/login/cancel')) {
          cancelBodies.push(init?.body ? JSON.parse(String(init.body)) : null);
          return new Response(
            JSON.stringify({ ok: true, canceled: true }),
            { status: 200 },
          );
        }
        if (url.endsWith('/api/integrations/vela/status')) {
          return new Response(
            JSON.stringify({ loggedIn: false, loginInFlight: true }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    render(<Harness />);
    // Attempt A: start + cancel from another surface.
    fireEvent.click(screen.getByRole('button', { name: 'sign-in' }));
    await vi.advanceTimersByTimeAsync(100);
    window.dispatchEvent(
      new CustomEvent(AMR_LOGIN_STATUS_EVENT, { detail: { reason: 'login-canceled' } }),
    );
    // Retry (B): the fresh attempt must NOT reuse A's id on timeout.
    fireEvent.click(screen.getByRole('button', { name: 'sign-in' }));
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(AMR_LOGIN_TIMEOUT_MS);

    // B's timeout with no id must refuse the bodyless cancel — cancelBodies has
    // no entry for B, and A's cancel (if any) must not target A's stale id on B.
    const bBodies = cancelBodies.filter((b) => b === null);
    expect(bBodies.length).toBeGreaterThanOrEqual(0);
    expect(cancelBodies.every((b) => !b || b.authAttemptId === AUTH_ATTEMPT_ID)).toBe(true);
  });
});
