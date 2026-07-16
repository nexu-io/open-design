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
import type { VelaLoginStatus } from '../../src/providers/daemon';

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
  vi.unstubAllGlobals();
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

function renderPill(props: ComponentProps<typeof AmrLoginPill> = {}) {
  return render(
    <I18nProvider initial="en">
      <AmrLoginPill {...props} />
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
      screen.getByRole('group', { name: 'Open Design Cloud account status' }),
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

  it('surfaces the activation URL while signing in so the user can reopen the sign-in page', () => {
    renderAccountControl({
      status: 'signing-in',
      compact: true,
      activationUrl: 'https://app.vela.example/device?user_code=AB12-CD34',
      onSignIn: vi.fn(),
    });

    const link = screen.getByRole('link', { name: 'Open sign-in page' });
    // The activation URL already carries the device code, so the link alone
    // completes sign-in — no separate code is rendered.
    expect(link.getAttribute('href')).toBe(
      'https://app.vela.example/device?user_code=AB12-CD34',
    );
    expect(screen.queryByText('AB12-CD34')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Copy verification code' }),
    ).toBeNull();
  });

  it('shows the browser-failed hint when vela could not open the browser', () => {
    renderAccountControl({
      status: 'signing-in',
      compact: true,
      activationUrl: 'https://app.vela.example/device?user_code=AB12-CD34',
      browserOpenFailed: true,
      onSignIn: vi.fn(),
    });

    expect(
      screen.getByText(
        'Couldn’t open your browser automatically. Open the sign-in page below to continue.',
      ),
    ).toBeTruthy();
  });

  it('does not render the activation block before vela has printed a URL', () => {
    renderAccountControl({
      status: 'signing-in',
      compact: true,
      onSignIn: vi.fn(),
    });

    expect(
      screen.queryByRole('link', { name: 'Open sign-in page' }),
    ).toBeNull();
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

  it('renders compact login errors with daemon-provided text', () => {
    renderAccountControl({
      status: 'error',
      compact: true,
      errorMessage: 'command failed',
      onSignIn: vi.fn(),
    });

    expect(screen.getByRole('alert').textContent).toBe('command failed');
    expect(screen.queryByText('Sign-in failed.')).toBeNull();
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

  it('does not render a profile badge for a signed-out test profile', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        body: { loggedIn: false, profile: 'test', user: null, configPath: '/x' },
      }),
    ) as typeof fetch;

    renderPill();

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByText('TEST')).toBeNull();
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

  it('does not render a profile badge for a signed-out local profile', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        body: { loggedIn: false, profile: 'local', user: null, configPath: '/x' },
      }),
    ) as typeof fetch;

    renderPill();

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByText('LOCAL')).toBeNull();
  });

  it('uses the test-profile AMR management URL for signed-in users', () => {
    renderAccountControl({
      status: 'signed-in',
      email: 'leaf@example.com',
      profile: 'test',
      showProfileBadge: true,
      showConsoleAction: true,
    });

    expect(screen.getByText('leaf@example.com')).toBeTruthy();
    expect(screen.getByText('TEST')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Manage' }).getAttribute('href')).toBe(
      'https://vela.powerformer.net/wallet?source=open_design',
    );
  });

  it('uses the local-profile AMR management URL for signed-in users', () => {
    renderAccountControl({
      status: 'signed-in',
      email: 'leaf@example.com',
      profile: 'local',
      showProfileBadge: true,
      showConsoleAction: true,
    });

    expect(screen.getByText('LOCAL')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Manage' }).getAttribute('href')).toBe(
      'http://localhost:5173/wallet?source=open_design',
    );
  });

  it('uses the production AMR management URL by default', () => {
    renderAccountControl({
      status: 'signed-in',
      email: 'leaf@example.com',
      profile: 'prod',
      showProfileBadge: true,
      showConsoleAction: true,
    });

    expect(screen.queryByText('PROD')).toBeNull();
    expect(screen.getByRole('link', { name: 'Manage' }).getAttribute('href')).toBe(
      'https://open-design.ai/amr/wallet?source=open_design',
    );
  });

  it('bridges the attributed management URL even though its click stops propagation', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/attribution/bridge-url') {
        return jsonResponse({ body: { url: 'https://open-design.ai/amr/wallet?od_bridge=odbr_12345678' } });
      }
      if (url === '/api/system/open-external') return jsonResponse({ body: { ok: true } });
      return new Response('{}', { status: 202 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <I18nProvider initial="en">
        <AmrLoginPill
          initialStatus={{
            loggedIn: true,
            loginInFlight: false,
            profile: 'prod',
            configPath: '/x',
            user: { id: 'u', email: 'leaf@example.com', plan: 'free' },
          }}
          skipInitialRefresh
          showConsoleAction
          metricsConsent
          installationId="od-install-abc"
        />
      </I18nProvider>,
    );

    const link = screen.getByRole('link', { name: 'Manage' }) as HTMLAnchorElement;
    fireEvent.click(link);

    const url = new URL(link.href);
    expect(url.searchParams.get('source')).toBe('open_design');
    expect(url.searchParams.get('od_origin')).toBe('open_design');
    expect(url.searchParams.get('od_entry_source')).toBe('settings_amr_console');
    expect(url.searchParams.get('od_device_id')).toBe('od-install-abc');
    expect(url.searchParams.get('od_entry_id')).toMatch(/^od-amr-/u);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/integrations/vela/analytics-entry',
      expect.objectContaining({ method: 'POST' }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/attribution/bridge-url',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('od_device_id=od-install-abc'),
      }),
    ));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/open-external',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: 'https://open-design.ai/amr/wallet?od_bridge=odbr_12345678' }),
      }),
    );
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

  it('passes the Open Design device id in login attribution when metrics consent is enabled', async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          body: { loggedIn: false, profile: 'prod', user: null, configPath: '/x' },
        });
      }
      if (url.endsWith('/api/integrations/vela/analytics-entry')) {
        return jsonResponse({ status: 202, body: { mirrored: true } });
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

    render(
      <I18nProvider initial="en">
        <AmrLoginPill
          initialStatus={{
            loggedIn: false,
            loginInFlight: false,
            profile: 'prod',
            user: null,
            configPath: '/x',
          }}
          skipInitialRefresh
          amrEntrySourceDetail="settings_amr_authorize"
          metricsConsent
          installationId="od-install-abc"
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith('/api/integrations/vela/login') &&
            (init as RequestInit | undefined)?.method === 'POST',
        ),
      ).toBe(true);
    });
    const loginCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/api/integrations/vela/login') &&
        (init as RequestInit | undefined)?.method === 'POST',
    );
    const body = JSON.parse(String((loginCall?.[1] as RequestInit).body));
    expect(body.attribution.sourceDetail).toBe('settings_amr_authorize');
    expect(body.attribution.odDeviceId).toBe('od-install-abc');
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
    expect(screen.getByRole('alert').textContent).toBe(
      'profile "prod" api URL: is not configured',
    );
    expect(screen.queryByText('Sign-in failed.')).toBeNull();
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

  it('clears the local signing-in state as soon as status reports the login is complete', async () => {
    let loginPosted = false;
    const fetchMock = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.endsWith('/api/integrations/vela/status')) {
        return jsonResponse({
          body: loginPosted
            ? {
                loggedIn: true,
                profile: 'prod',
                configPath: '/x',
                user: { id: 'u', email: 'leaf@example.com', plan: 'free' },
              }
            : { loggedIn: false, profile: 'prod', user: null, configPath: '/x' },
        });
      }
      if (
        url.endsWith('/api/integrations/vela/login') &&
        init?.method === 'POST'
      ) {
        loginPosted = true;
        return jsonResponse({ status: 202, body: { pid: 4242 } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    renderPill();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    });
    expect(screen.getByText('leaf@example.com')).toBeTruthy();
    expect(screen.queryByText('Signing in…')).toBeNull();
  });

  it('does not reuse stale activation details when a new login starts after a canceled attempt', async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (
        url.endsWith('/api/integrations/vela/login') &&
        init?.method === 'POST'
      ) {
        return jsonResponse({ status: 202, body: { pid: 4242 } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    renderPill({
      skipInitialRefresh: true,
      initialStatus: {
        loggedIn: false,
        loginInFlight: false,
        profile: 'prod',
        user: null,
        configPath: '/x',
        activationUrl: 'https://app.vela.example/expired-device-code',
        userCode: 'EXPIRED',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('Signing in…')).toBeTruthy();
    });
    expect(
      screen.queryByRole('link', { name: 'Open sign-in page' }),
    ).toBeNull();
    expect(screen.queryByText('EXPIRED')).toBeNull();
  });

  it('only surfaces activation details from the pill when explicitly enabled', async () => {
    const initialStatus: VelaLoginStatus = {
      loggedIn: false,
      loginInFlight: true,
      profile: 'prod',
      user: null,
      configPath: '/x',
      activationUrl: 'https://app.vela.example/device?user_code=VISIBLE',
      userCode: 'VISIBLE',
    };

    const first = renderPill({ skipInitialRefresh: true, initialStatus });
    expect(await screen.findByText('Signing in…')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open sign-in page' })).toBeNull();
    expect(screen.queryByText('VISIBLE')).toBeNull();
    first.unmount();

    renderPill({
      skipInitialRefresh: true,
      initialStatus,
      showActivationDetails: true,
    });
    expect(await screen.findByRole('link', { name: 'Open sign-in page' })).toBeTruthy();
    // The activation URL carries the device code, so the link alone is shown —
    // the standalone code is never rendered even when present in the status.
    expect(screen.queryByText('VISIBLE')).toBeNull();
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
    expect(screen.getByText('Sign-in failed.')).toBeTruthy();
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
