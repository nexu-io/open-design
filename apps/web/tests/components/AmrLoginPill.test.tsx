// @vitest-environment jsdom

/**
 * Coverage for the AMR Settings login pill. The pill is a sibling of the
 * Test button inside the installed-agent card and intentionally stops
 * click/key event propagation so a Sign-in / Sign-out click does NOT
 * also re-select the agent card.
 *
 * The component polls `/api/integrations/vela/status` to keep up with
 * subprocess-driven login completion — vela CLI owns the
 * device-authorization UX, so we just kick `vela login` off and wait.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AmrAccountControl,
  AmrLoginPill,
} from '../../src/components/AmrLoginPill';
import { AMR_LOGIN_TIMEOUT_MS } from '../../src/components/amrLoginPolling';
import { I18nProvider } from '../../src/i18n';

interface StubbedResponse {
  status?: number;
  body: unknown;
}

function jsonResponse({ status = 200, body }: StubbedResponse): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

function renderPill() {
  return render(
    <I18nProvider initial="en">
      <AmrLoginPill />
    </I18nProvider>,
  );
}

function renderAccountControl(
  props: ComponentProps<typeof AmrAccountControl>,
) {
  return render(
    <I18nProvider initial="en">
      <AmrAccountControl {...props} />
    </I18nProvider>,
  );
}

describe('AmrAccountControl', () => {
  it('renders the compact signed-out status and sign-in action', () => {
    const onSignIn = vi.fn();

    renderAccountControl({
      status: 'signed-out',
      compact: true,
      onSignIn,
    });

    expect(
      screen.getByRole('group', { name: 'AMR account status' }),
    ).toBeTruthy();
    expect(screen.getByText('Not signed in')).toBeTruthy();
    const signIn = screen.getByRole('button', { name: 'Sign in' });
    expect(signIn).toBeTruthy();

    fireEvent.click(signIn);
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it('renders the signing-in state without exposing a second action', () => {
    renderAccountControl({
      status: 'signing-in',
      compact: true,
      onSignIn: vi.fn(),
    });

    expect(screen.getByText('Signing in…')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders the signed-in email without profile fallback details', () => {
    renderAccountControl({
      status: 'signed-in',
      email: 'leaf@example.com',
      compact: true,
      profile: 'local',
    });

    expect(screen.getByText('leaf@example.com')).toBeTruthy();
    expect(screen.queryByText('LOCAL')).toBeNull();
    expect(screen.queryByText('local')).toBeNull();
  });

  it('renders compact login errors with AMR-labeled text', () => {
    renderAccountControl({
      status: 'error',
      compact: true,
      errorMessage: 'command failed',
      onSignIn: vi.fn(),
    });

    expect(screen.getByText('AMR sign-in failed.')).toBeTruthy();
    expect(screen.queryByText('command failed')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });
});

describe('AmrLoginPill', () => {
  it('renders a Sign-in button when /status reports loggedIn=false', async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          body: { loggedIn: false, profile: 'prod', user: null, configPath: '/x' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    renderPill();

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByText('TEST')).toBeNull();
    expect(screen.queryByText('LOCAL')).toBeNull();
  });

  it('renders a TEST badge next to the signed-out action for the test profile', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        body: { loggedIn: false, profile: 'test', user: null, configPath: '/x' },
      }),
    ) as typeof fetch;

    renderPill();

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByText('TEST')).toBeTruthy();
  });

  it('renders daemon-reported in-flight login attempts as signing-in', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        body: {
          loggedIn: false,
          loginInFlight: true,
          profile: 'prod',
          user: null,
          configPath: '/x',
        },
      }),
    ) as typeof fetch;

    renderPill();

    expect(await screen.findByText('Signing in…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });

  it('renders a LOCAL badge next to the signed-out action for the local profile', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        body: { loggedIn: false, profile: 'local', user: null, configPath: '/x' },
      }),
    ) as typeof fetch;

    renderPill();

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByText('LOCAL')).toBeTruthy();
  });

  it('renders a "Signed in" pill (with the Sign-out aria-label) when /status reports a logged-in user', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        body: {
          loggedIn: true,
          profile: 'local',
          configPath: '/x',
          user: { id: 'u', email: 'leaf@example.com', plan: 'free' },
        },
      }),
    ) as typeof fetch;

    renderPill();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    });
    expect(screen.getByText('leaf@example.com')).toBeTruthy();
    expect(screen.getByText('LOCAL')).toBeTruthy();
  });

  it('stops click propagation so the Sign-in button never bubbles up to the agent-card-select sibling', async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          body: { loggedIn: false, profile: 'local', user: null, configPath: '/x' },
        });
      }
      if (
        url.endsWith('/api/integrations/vela/login') &&
        init?.method === 'POST'
      ) {
        return jsonResponse({ status: 202, body: { pid: 4242 } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const cardSelect = vi.fn();
    render(
      <I18nProvider initial="en">
        <div
          role="group"
          onClick={cardSelect}
          onKeyDown={cardSelect}
        >
          <AmrLoginPill />
        </div>
      </I18nProvider>,
    );

    const signInBtn = await screen.findByRole('button', { name: 'Sign in' });
    fireEvent.click(signInBtn);
    expect(cardSelect).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith('/api/integrations/vela/login') &&
            (init as RequestInit | undefined)?.method === 'POST',
        ),
      ).toBe(true);
    });
  });

  it('shows an AMR error instead of staying in signing-in state when login fails immediately', async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          body: { loggedIn: false, profile: 'prod', user: null, configPath: '/x' },
        });
      }
      if (
        url.endsWith('/api/integrations/vela/login') &&
        init?.method === 'POST'
      ) {
        return jsonResponse({
          status: 500,
          body: { error: 'profile "prod" api URL: is not configured' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    renderPill();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(screen.getByText('AMR sign-in failed.')).toBeTruthy();
    expect(screen.queryByText('Signing in…')).toBeNull();
  });

  it('does not POST /login twice while sign-in polling is already pending', async () => {
    let loginCalls = 0;
    const fetchMock = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          body: { loggedIn: false, profile: 'prod', user: null, configPath: '/x' },
        });
      }
      if (
        url.endsWith('/api/integrations/vela/login') &&
        init?.method === 'POST'
      ) {
        loginCalls += 1;
        return jsonResponse({ status: 202, body: { pid: 4242 } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    renderPill();
    const signIn = await screen.findByRole('button', { name: 'Sign in' });
    fireEvent.click(signIn);
    fireEvent.click(signIn);

    await waitFor(() => {
      expect(loginCalls).toBe(1);
    });
    expect(await screen.findByText('Signing in…')).toBeTruthy();
  });

  it('recovers from transient /status failures and still flips to signed-in when polling succeeds later', async () => {
    let statusCalls = 0;
    const fetchMock = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.endsWith('/api/integrations/vela/status')) {
        statusCalls += 1;
        if (statusCalls === 2) {
          throw new Error('temporary network failure');
        }
        return jsonResponse({
          body:
            statusCalls >= 3
              ? {
                  loggedIn: true,
                  profile: 'local',
                  configPath: '/x',
                  user: { id: 'u', email: 'leaf@example.com', plan: 'free' },
                }
              : { loggedIn: false, profile: 'local', user: null, configPath: '/x' },
        });
      }
      if (
        url.endsWith('/api/integrations/vela/login') &&
        init?.method === 'POST'
      ) {
        return jsonResponse({ status: 202, body: { pid: 4242 } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    renderPill();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2100));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2100));
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    });
    expect(screen.getByText('leaf@example.com')).toBeTruthy();
  }, 10_000);

  it('cancels a timed-out login attempt and restores the Sign-in action', async () => {
    let loginStarted = false;
    const fetchMock = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          body: {
            loggedIn: false,
            loginInFlight: loginStarted,
            profile: 'prod',
            user: null,
            configPath: '/x',
          },
        });
      }
      if (
        url.endsWith('/api/integrations/vela/login') &&
        init?.method === 'POST'
      ) {
        loginStarted = true;
        return jsonResponse({ status: 202, body: { pid: 4242 } });
      }
      if (
        url.endsWith('/api/integrations/vela/login/cancel') &&
        init?.method === 'POST'
      ) {
        loginStarted = false;
        return jsonResponse({ body: { canceled: true, pids: [4242] } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    renderPill();
    const signIn = await screen.findByRole('button', { name: 'Sign in' });
    vi.useFakeTimers();
    fireEvent.click(signIn);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('Signing in…')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_TIMEOUT_MS);
    });
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith('/api/integrations/vela/login/cancel') &&
          (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(true);
    expect(screen.getByText('AMR sign-in failed.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByText('Signing in…')).toBeNull();
  });

  it('logout POSTs /logout and flips the pill back to Sign-in', async () => {
    let loggedIn = true;
    const fetchMock = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          body: loggedIn
            ? {
                loggedIn: true,
                profile: 'local',
                configPath: '/x',
                user: { id: 'u', email: 'leaf@example.com', plan: 'free' },
              }
            : { loggedIn: false, profile: 'local', user: null, configPath: '/x' },
        });
      }
      if (
        url.endsWith('/api/integrations/vela/logout') &&
        init?.method === 'POST'
      ) {
        loggedIn = false;
        return jsonResponse({ body: { ok: true } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    renderPill();
    const logoutBtn = await screen.findByRole('button', { name: 'Sign out' });
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    });
  });

  it('converges a stale signed-in snapshot back to Sign-in when a later status read reports loggedOut', async () => {
    let readCount = 0;
    globalThis.fetch = vi.fn(async () => {
      readCount += 1;
      return jsonResponse({
        body:
          readCount === 1
            ? {
                loggedIn: true,
                profile: 'local',
                configPath: '/x',
                user: { id: 'u', email: 'leaf@example.com', plan: 'free' },
              }
            : { loggedIn: false, profile: 'local', user: null, configPath: '/x' },
      });
    }) as typeof fetch;

    const first = renderPill();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    });
    first.unmount();

    renderPill();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('does not silently auto-recover to signed-in after a local logout completes', async () => {
    let loggedIn = true;
    let statusCalls = 0;
    const fetchMock = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.endsWith('/api/integrations/vela/status')) {
        statusCalls += 1;
        return jsonResponse({
          body: loggedIn
            ? {
                loggedIn: true,
                profile: 'local',
                configPath: '/x',
                user: { id: 'u', email: 'leaf@example.com', plan: 'free' },
              }
            : { loggedIn: false, profile: 'local', user: null, configPath: '/x' },
        });
      }
      if (
        url.endsWith('/api/integrations/vela/logout') &&
        init?.method === 'POST'
      ) {
        loggedIn = false;
        return jsonResponse({ body: { ok: true } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    renderPill();
    const logoutBtn = await screen.findByRole('button', { name: 'Sign out' });
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    });
    const callsAfterLogout = statusCalls;

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(statusCalls).toBe(callsAfterLogout);
  });
});
