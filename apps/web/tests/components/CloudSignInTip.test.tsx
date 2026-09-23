// @vitest-environment jsdom

/**
 * The signed-out rail's bottom "OpenDesign Cloud" callout is the ONLY entry
 * point for this card — unlike its siblings (AmrLoginPill, InlineModelSwitcher,
 * EntryShell's onboarding flow), it must release the daemon's login lock on a
 * timed-out attempt, or a retry click can never spawn a fresh `vela login`
 * (the daemon still sees the abandoned attempt as in flight and 409s with
 * alreadyRunning, which this component's poll loop treats as "keep waiting"
 * instead of "start over") — so a second click after a failure can never open
 * a new browser tab.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CloudSignInTip,
  RailAccountSyncTip,
  resetCloudSignInTipDismissal,
} from '../../src/components/CloudSignInTip';
import { AMR_LOGIN_TIMEOUT_MS } from '../../src/components/amrLoginPolling';
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
    expect(status.textContent).toContain('OpenDesign Cloud');
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
    // The old card rendered a visible "OpenDesign Cloud" / "Loading…" pair
    // of text nodes for sighted users; that text now exists for assistive
    // tech only, so a plain <strong> headline must not reappear inline.
    expect(status.querySelector('strong')).toBeNull();
    // No spinner icon either — the shimmering skeleton blocks are the loading
    // indicator now, not a spinning glyph next to a card body.
    expect(status.querySelector('svg')).toBeNull();
  });
});
