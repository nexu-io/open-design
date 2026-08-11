// @vitest-environment jsdom

/**
 * The signed-out rail's bottom "Open Design Cloud" callout is the ONLY entry
 * point for this card — unlike its siblings (AmrLoginPill, InlineModelSwitcher,
 * EntryShell's onboarding flow), it must release the daemon's login lock on a
 * timed-out attempt, or a retry click can never spawn a fresh `vela login`
 * (the daemon still sees the abandoned attempt as in flight and 409s with
 * alreadyRunning, which this component's poll loop treats as "keep waiting"
 * instead of "start over") — so a second click after a failure can never open
 * a new browser tab.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CloudSignInTip,
  RailAccountSyncTip,
  resetCloudSignInTipDismissal,
} from '../../src/components/CloudSignInTip';
import {
  AMR_LOGIN_STATUS_EVENT,
  AMR_LOGIN_TIMEOUT_MS,
} from '../../src/components/amrLoginPolling';
import { I18nProvider } from '../../src/i18n';

const DISMISSED_KEY = 'od.entry.cloudSignInTip.dismissed';

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
  try {
    window.localStorage.clear();
  } catch {
    // ignore
  }
});

function renderTip() {
  return render(
    <I18nProvider initial="en">
      <CloudSignInTip />
    </I18nProvider>,
  );
}

describe('CloudSignInTip', () => {
  it('cancels a timed-out login so a retry click can start a fresh vela login', async () => {
    let loginStarted = false;
    let spawnCount = 0;
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
      if (url.endsWith('/api/integrations/vela/login') && init?.method === 'POST') {
        spawnCount += 1;
        loginStarted = true;
        return jsonResponse({ status: 202, body: { pid: 4242 } });
      }
      if (url.endsWith('/api/integrations/vela/login/cancel') && init?.method === 'POST') {
        loginStarted = false;
        return jsonResponse({ body: { canceled: true, pids: [4242] } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as typeof fetch;

    renderTip();
    const card = await screen.findByTestId('entry-cloud-signin-tip');
    vi.useFakeTimers();
    fireEvent.click(card);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(spawnCount).toBe(1);

    // Give up after the 5-minute UI timeout, exactly like a real
    // register+email-OTP+CLI-approve flow that runs long. The first
    // `vela login` process is still alive from the daemon's point of view
    // (it never reported loginInFlight: false on its own).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AMR_LOGIN_TIMEOUT_MS);
    });

    // Giving up must release the daemon's lock, or a retry can never spawn
    // a fresh login / open a new browser tab.
    expect(
      fetchMock.mock.calls.some(
        ([url, reqInit]) =>
          String(url).endsWith('/api/integrations/vela/login/cancel') &&
          (reqInit as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(true);

    vi.useRealTimers();
    const retryCard = await screen.findByTestId('entry-cloud-signin-tip');
    fireEvent.click(retryCard);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(spawnCount).toBe(2);
  });

  // Regression for 飞书 recvqbkcLqIFH7: this card used to have a close "×"
  // whose dismissal persisted forever — including through a later real
  // sign-in and sign-out — so a stale dismissal from a completely unrelated
  // earlier session silently deleted the rail's only sign-in entry point.
  // The close button is gone now (the card can no longer be dismissed at
  // all), which closes that whole bug class — this locks in that a leftover
  // dismissal flag from before that change shipped can't resurrect it.
  it('always renders, ignoring a stale dismissal flag from before the close button was removed', async () => {
    window.localStorage.setItem(DISMISSED_KEY, '1');
    renderTip();
    expect(await screen.findByTestId('entry-cloud-signin-tip')).toBeTruthy();

    resetCloudSignInTipDismissal();
    expect(window.localStorage.getItem(DISMISSED_KEY)).toBeNull();
  });

  it('broadcasts the observed attempt id on sign-in success even when status state is still the previous frame', async () => {
    // Regression (ownership closure, mirroring AmrLoginPill/InlineModelSwitcher):
    // `finishSignedIn()` runs in the same synchronous tick as the status read
    // that detected signed-in, so the `status` state still holds the previous
    // frame (null on a first success). The broadcast must carry the attempt id
    // this tip observed (ref), not the stale `status` — receivers gate on it.
    const attemptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const broadcastAttemptIds: Array<string | null | undefined> = [];
    const onStatusChange = (event: Event) => {
      broadcastAttemptIds.push(
        (event as CustomEvent<{ authAttemptId?: string | null }>).detail?.authAttemptId,
      );
    };
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, onStatusChange);
    try {
      globalThis.fetch = vi.fn(async () =>
        jsonResponse({
          body: {
            loggedIn: true,
            authAttemptId: attemptId,
            profile: 'prod',
            user: { id: 'u', email: 'a@b.c', plan: 'free' },
            configPath: '/x',
          },
        }),
      ) as typeof fetch;

      renderTip();
      const card = await screen.findByTestId('entry-cloud-signin-tip');
      fireEvent.click(card);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(broadcastAttemptIds).toContain(attemptId);
    } finally {
      window.removeEventListener(AMR_LOGIN_STATUS_EVENT, onStatusChange);
    }
  });

  it('targets the observed attempt id when cancelling, even when status state has not committed the poll frame yet', async () => {
    // Regression (ownership closure): `cancel()` must cancel and broadcast the
    // attempt this tip observed (ref, populated from the pre-login status read),
    // not the `status` state — a superseded card cancelling a newer login with
    // the no-id legacy form is exactly the bug the id-matched receivers gate on.
    const attemptId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const cancelBodies: Array<{ authAttemptId?: string } | null> = [];
    const broadcastAttemptIds: Array<string | null | undefined> = [];
    const onStatusChange = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: string; authAttemptId?: string | null }>).detail;
      if (detail?.reason === 'login-canceled') {
        broadcastAttemptIds.push(detail.authAttemptId);
      }
    };
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, onStatusChange);
    try {
      const fetchMock = vi.fn(async (input, init) => {
        const url = typeof input === 'string' ? input : (input as URL).toString();
        if (url.endsWith('/api/integrations/vela/status')) {
          return jsonResponse({
            body: {
              loggedIn: false,
              loginInFlight: false,
              authAttemptId: attemptId,
              profile: 'prod',
              user: null,
              configPath: '/x',
            },
          });
        }
        if (url.endsWith('/api/integrations/vela/login') && init?.method === 'POST') {
          return jsonResponse({ status: 202, body: { pid: 4242 } });
        }
        if (url.endsWith('/api/integrations/vela/login/cancel') && init?.method === 'POST') {
          cancelBodies.push(
            init?.body ? (JSON.parse(String(init.body)) as { authAttemptId?: string }) : null,
          );
          return jsonResponse({ body: { canceled: true, pids: [4242] } });
        }
        throw new Error(`unexpected fetch: ${url}`);
      });
      globalThis.fetch = fetchMock as typeof fetch;

      renderTip();
      const card = await screen.findByTestId('entry-cloud-signin-tip');
      fireEvent.click(card);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      const cancelButton = await screen.findByRole('button', { name: 'Cancel sign-in' });
      fireEvent.click(cancelButton);
      await waitFor(() => {
        expect(cancelBodies).not.toHaveLength(0);
      });

      expect(cancelBodies).toEqual([{ authAttemptId: attemptId }]);
      expect(broadcastAttemptIds).toContain(attemptId);
    } finally {
      window.removeEventListener(AMR_LOGIN_STATUS_EVENT, onStatusChange);
    }
  });
});

// recvqgpXSYFNTq: "退出登录后再登录，左下角的头像加载的有些慢" — the rail's
// bottom-left callout slot used to go fully blank between `CloudSignInTip`
// unmounting (sign-in just succeeded) and the account row appearing (the
// workspace-context re-read landing). `EntryShell` now renders this in that
// exact same footer slot instead of `null` for that window.
describe('RailAccountSyncTip', () => {
  function renderSyncTip() {
    return render(
      <I18nProvider initial="en">
        <RailAccountSyncTip />
      </I18nProvider>,
    );
  }

  it('renders an inert status readout instead of leaving the slot blank', async () => {
    renderSyncTip();
    const status = await screen.findByTestId('entry-rail-account-sync-tip');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    // Same headline as the callout it replaces (now screen-reader-only, see
    // the skeleton-shape test below), so assistive tech still announces the
    // swap as a state change on the same card rather than a different one.
    expect(status.textContent).toContain('Open Design Cloud');
    expect(status.textContent).toContain('Loading');
  });

  it('is not interactive — no button/section semantics or click affordance', async () => {
    renderSyncTip();
    const status = await screen.findByTestId('entry-rail-account-sync-tip');
    expect(status.tagName).toBe('DIV');
    expect(status.querySelector('button')).toBeNull();
  });

  // Follow-up (2026-07-24 product feedback): a spinner + "Loading…" card read
  // as a separate notification and visibly jumped in size/position once the
  // real account row (`.entry-nav-rail__account-trigger`, EntryNavRail.tsx)
  // landed in its place. This locks in the skeleton shape — an avatar
  // placeholder + a name-bar placeholder, sized after that real row — so a
  // regression back to the spinner+text card fails this test instead of only
  // showing up in a screenshot diff.
  it('renders an avatar + name skeleton shaped like the real account row, not a spinner card', async () => {
    renderSyncTip();
    const status = await screen.findByTestId('entry-rail-account-sync-tip');
    expect(status.querySelector('.entry-rail-account-skeleton__avatar')).not.toBeNull();
    expect(status.querySelector('.entry-rail-account-skeleton__name')).not.toBeNull();
    // The old card rendered a visible "Open Design Cloud" / "Loading…" pair
    // of text nodes for sighted users; that text now exists for assistive
    // tech only, so a plain <strong> headline must not reappear inline.
    expect(status.querySelector('strong')).toBeNull();
    // No spinner icon either — the shimmering skeleton blocks are the loading
    // indicator now, not a spinning glyph next to a card body.
    expect(status.querySelector('svg')).toBeNull();
  });
});
