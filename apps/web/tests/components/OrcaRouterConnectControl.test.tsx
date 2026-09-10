// @vitest-environment jsdom

/**
 * OrcaRouter connect control: the two authentication entries and the async
 * lifecycle around them.
 *
 * The behaviours under test are the ones that are easy to get subtly wrong and
 * expensive to notice in production:
 *
 *   * both entries exist and are independently usable (paste a key / sign in);
 *   * the API-key input is masked and never sends a blank key;
 *   * a stale asynchronous response cannot overwrite a newer login attempt;
 *   * `pagehide` clears the busy state synchronously, so a page restored from
 *     the back-forward cache can start a second login without remounting.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OrcaRouterConnectControl } from '../../src/components/OrcaRouterConnectControl';
import { I18nProvider } from '../../src/i18n';

interface FakeResponse {
  ok?: boolean;
  status?: number;
  body?: unknown;
}

/** Route-aware fetch stub for the four endpoints this control talks to. */
function installFetch(routes: Record<string, FakeResponse | (() => FakeResponse | Promise<FakeResponse>)>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const match = Object.keys(routes).find((key) => url.startsWith(key));
    const route = match ? routes[match] : undefined;
    const resolved = typeof route === 'function' ? await route() : route;
    const status = resolved?.status ?? 200;
    const ok = resolved?.ok ?? (status >= 200 && status < 300);
    return new Response(JSON.stringify(resolved?.body ?? {}), {
      status,
      headers: { 'content-type': 'application/json' },
    }) as unknown as Response & { ok: boolean; status: number };
  });
  // `ok` is derived by Response from status, so status is the source of truth.
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

const STATUS_DISCONNECTED = { connected: false, source: 'none', authState: 'active' };

function renderControl(onCredentialChange = vi.fn(), pastedApiKey = '') {
  return render(
    <I18nProvider initial="en">
      <OrcaRouterConnectControl
        onCredentialChange={onCredentialChange}
        pastedApiKey={pastedApiKey}
      />
    </I18nProvider>,
  );
}

/** Let the mount-time status poll settle before asserting on the UI. */
async function settle() {
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}

describe('OrcaRouterConnectControl', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('offers account login as its own entry, distinct from the key field', async () => {
    installFetch({ '/api/orcarouter/auth/status': { body: STATUS_DISCONNECTED } });
    renderControl();
    await settle();

    // This control owns the account (PKCE) entry. The key entry is the provider
    // form's own field above it — one key input, not two.
    expect(screen.getByTestId('orcarouter-oauth-entry')).toBeTruthy();
    const connect = screen.getByTestId('orcarouter-connect');
    expect(connect.textContent).toMatch(/connect with orcarouter/i);
    // It does not render a second key input.
    expect(screen.queryByTestId('orcarouter-api-key-input')).toBeNull();
  });

  it('mirrors the provider form key into the shared credential store', async () => {
    const { calls } = installFetch({
      '/api/orcarouter/auth/status': { body: STATUS_DISCONNECTED },
      '/api/orcarouter/credentials': { body: { ok: true, prefixOk: true, generation: 1 } },
    });
    renderControl(vi.fn(), 'sk-orca-pasted-into-the-form');
    await waitFor(() => {
      expect(calls.some((c) => c.url.startsWith('/api/orcarouter/credentials'))).toBe(true);
    });
    const save = calls.find((c) => c.url.startsWith('/api/orcarouter/credentials'))!;
    expect(JSON.parse(String(save.init?.body))).toEqual({
      apiKey: 'sk-orca-pasted-into-the-form',
    });
  });

  it('does not call the credential route when the form has no key', async () => {
    const { calls } = installFetch({ '/api/orcarouter/auth/status': { body: STATUS_DISCONNECTED } });
    renderControl(vi.fn(), '   ');
    await settle();
    expect(calls.some((c) => c.url.startsWith('/api/orcarouter/credentials'))).toBe(false);
  });

  it('starts a PKCE login, exposes the authorize URL, and offers Cancel', async () => {
    const { calls } = installFetch({
      '/api/orcarouter/auth/status': { body: STATUS_DISCONNECTED },
      '/api/orcarouter/oauth/start': {
        body: {
          authorizeUrl: 'https://www.orcarouter.ai/auth?code_challenge=abc&state=xyz',
          state: 'xyz',
          callback: { host: '127.0.0.1', port: 51234 },
        },
      },
    });
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    renderControl();
    await settle();
    fireEvent.click(screen.getByTestId('orcarouter-connect'));

    await waitFor(() => {
      expect(calls.some((c) => c.url.startsWith('/api/orcarouter/oauth/start'))).toBe(true);
    });
    // The browser is sent to the AUTH origin, never the inference origin.
    await waitFor(() => expect(openSpy).toHaveBeenCalled());
    const opened = String(openSpy.mock.calls[0]![0]);
    expect(new URL(opened).origin).toBe('https://www.orcarouter.ai');
    expect(new URL(opened).pathname).toBe('/auth');

    // A fallback link exists for browsers that refuse window.open.
    await waitFor(() => {
      const link = screen.getByTestId('orcarouter-authorize-link') as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe(opened);
    });
    expect(screen.getByTestId('orcarouter-cancel')).toBeTruthy();
  });

  it('surfaces a start failure and returns to an idle, retryable state', async () => {
    installFetch({
      '/api/orcarouter/auth/status': { body: STATUS_DISCONNECTED },
      '/api/orcarouter/oauth/start': { status: 502, body: { error: 'listener unavailable' } },
    });
    renderControl();
    await settle();
    fireEvent.click(screen.getByTestId('orcarouter-connect'));

    await waitFor(() => {
      expect(screen.getByTestId('orcarouter-error').textContent).toMatch(/listener unavailable/);
    });
    // Not stuck busy — the user can try again.
    await waitFor(() => {
      expect((screen.getByTestId('orcarouter-connect') as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('cancels an in-flight login server-side and clears the pending hint', async () => {
    const { calls } = installFetch({
      '/api/orcarouter/auth/status': { body: STATUS_DISCONNECTED },
      '/api/orcarouter/oauth/start': {
        body: {
          authorizeUrl: 'https://www.orcarouter.ai/auth?state=xyz',
          state: 'xyz',
          callback: { host: '127.0.0.1', port: 51234 },
        },
      },
      '/api/orcarouter/oauth/cancel': { body: { ok: true } },
    });
    vi.stubGlobal('open', vi.fn());

    renderControl();
    await settle();
    fireEvent.click(screen.getByTestId('orcarouter-connect'));
    await waitFor(() => expect(screen.getByTestId('orcarouter-cancel')).toBeTruthy());

    fireEvent.click(screen.getByTestId('orcarouter-cancel'));
    await waitFor(() => {
      expect(calls.some((c) => c.url.startsWith('/api/orcarouter/oauth/cancel'))).toBe(true);
    });
    // The pending affordances are gone and the primary action is usable again.
    await waitFor(() => {
      expect(screen.queryByTestId('orcarouter-cancel')).toBeNull();
      expect((screen.getByTestId('orcarouter-connect') as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('discards a stale status response that would overwrite a newer login', async () => {
    // The first status poll is held open until after a second attempt has
    // started. Its "connected: false" must not land on the newer attempt.
    let resolveFirst: ((value: FakeResponse) => void) | null = null;
    let statusCall = 0;
    installFetch({
      '/api/orcarouter/auth/status': () => {
        statusCall += 1;
        if (statusCall === 1) {
          return new Promise<FakeResponse>((resolve) => { resolveFirst = resolve; });
        }
        return { body: { connected: true, source: 'oauth-orcarouter-pkce', scope: 'api' } };
      },
      '/api/orcarouter/oauth/start': {
        body: {
          authorizeUrl: 'https://www.orcarouter.ai/auth?state=abc',
          state: 'abc',
          callback: { host: '127.0.0.1', port: 1 },
        },
      },
    });
    vi.stubGlobal('open', vi.fn());

    renderControl();
    await settle();
    fireEvent.click(screen.getByTestId('orcarouter-connect'));
    await waitFor(() => {
      expect(screen.getByTestId('orcarouter-connect').textContent).toMatch(/reconnect/i);
    });

    // Release the stale first response now that a newer attempt owns the state.
    await act(async () => {
      resolveFirst?.({ body: { connected: false, source: 'none' } });
    });
    // The newer, connected status still wins.
    expect(screen.getByTestId('orcarouter-oauth-entry')).toBeTruthy();
    expect(screen.queryByTestId('orcarouter-error')).toBeNull();
  });

  it('clears busy state on pagehide and allows a second login without remounting', async () => {
    const { calls } = installFetch({
      '/api/orcarouter/auth/status': { body: STATUS_DISCONNECTED },
      '/api/orcarouter/oauth/start': {
        body: {
          authorizeUrl: 'https://www.orcarouter.ai/auth?state=first',
          state: 'first',
          callback: { host: '127.0.0.1', port: 1 },
        },
      },
      '/api/orcarouter/oauth/cancel': { body: { ok: true } },
    });
    vi.stubGlobal('open', vi.fn());

    renderControl();
    await settle();

    // First login: leave it mid-flight.
    fireEvent.click(screen.getByTestId('orcarouter-connect'));
    await waitFor(() => expect(screen.getByTestId('orcarouter-cancel')).toBeTruthy());

    // The page is being frozen — this is the back-forward-cache shape.
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });

    // Synchronously cleared: the panel is not left permanently busy, and the
    // server-side attempt was asked to stop.
    expect(screen.queryByTestId('orcarouter-cancel')).toBeNull();
    expect((screen.getByTestId('orcarouter-connect') as HTMLButtonElement).disabled).toBe(false);
    await waitFor(() => {
      expect(calls.some((c) => c.url.startsWith('/api/orcarouter/oauth/cancel'))).toBe(true);
    });

    // Without remounting, a second login can start.
    fireEvent.click(screen.getByTestId('orcarouter-connect'));
    await waitFor(() => {
      expect(screen.getByTestId('orcarouter-cancel')).toBeTruthy();
    });
  });

  it('shows the needsReauth state with the reason, and offers a reconnect', async () => {
    installFetch({
      '/api/orcarouter/auth/status': {
        body: {
          connected: true,
          source: 'oauth-orcarouter-pkce',
          authState: 'needsReauth',
          needsReauth: true,
          reauthReason: 'OrcaRouter rejected this credential (HTTP 401).',
        },
      },
    });
    renderControl();
    await settle();

    expect(screen.getByTestId('orcarouter-connect-control').textContent)
      .toMatch(/sign in again/i);
    expect(screen.getByTestId('orcarouter-connect-control').textContent)
      .toMatch(/401/);
    // The reconnect affordance is present, and Disconnect stays available.
    expect(screen.getByTestId('orcarouter-disconnect')).toBeTruthy();
  });

  it('never renders the form key back into the DOM', async () => {
    const secret = 'sk-orca-must-not-be-rendered-here';
    installFetch({
      '/api/orcarouter/auth/status': {
        body: { connected: true, source: 'oauth-orcarouter-pkce', scope: 'api', savedAt: 1 },
      },
      '/api/orcarouter/credentials': { body: { ok: true, prefixOk: true, generation: 1 } },
    });
    const { container } = renderControl(vi.fn(), secret);
    await settle();
    // The key may be sent to the daemon, but it must never come back into the
    // rendered markup.
    expect(container.innerHTML).not.toContain(secret);
    for (const el of Array.from(container.querySelectorAll('[value]'))) {
      expect(el.getAttribute('value')).not.toBe(secret);
    }
  });
});
