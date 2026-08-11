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
  AMR_LOGIN_POLL_INTERVAL_MS,
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

  it('targets the spawn-returned attempt id when cancelled before the first poll', async () => {
    // Regression (review thread): `authAttemptIdRef` was populated only from
    // status reads — never from `startVelaLogin()`'s response. When the
    // pre-login status read carries no attempt id (login not in flight yet)
    // and the user cancels after the spawn resolves but before the first
    // 2-second poll tick, both `cancel()` and the timeout path called
    // `cancelVelaLogin(undefined)`, invoking the daemon's legacy no-body
    // cancellation that can terminate a newer login. The spawn-returned id
    // (including the alreadyRunning/409 response) must be adopted immediately.
    const attemptId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
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
          // Pre-login read: no attempt id, nothing in flight.
          return jsonResponse({
            body: {
              loggedIn: false,
              loginInFlight: false,
              profile: 'prod',
              user: null,
              configPath: '/x',
            },
          });
        }
        if (url.endsWith('/api/integrations/vela/login') && init?.method === 'POST') {
          return jsonResponse({
            status: 202,
            body: { pid: 4242, authAttemptId: attemptId },
          });
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

      // Cancel before any poll tick has run.
      const cancelButton = await screen.findByRole('button', { name: 'Cancel sign-in' });
      fireEvent.click(cancelButton);
      await waitFor(() => {
        expect(cancelBodies).not.toHaveLength(0);
      });

      // The cancel must target the spawn-returned attempt, not the legacy
      // no-body form, and the broadcast must carry it.
      expect(cancelBodies).toEqual([{ authAttemptId: attemptId }]);
      expect(broadcastAttemptIds).toContain(attemptId);
    } finally {
      window.removeEventListener(AMR_LOGIN_STATUS_EVENT, onStatusChange);
    }
  });

  it('issues a targeted cancel with the spawn-returned id when cancelled while the login POST is pending', async () => {
    // Regression (review thread): `begin()` adopted the spawn-returned id only
    // AFTER the `cancelledRef` early return. A cancel clicked while the login
    // POST was still pending captured a null ref and fired the legacy no-body
    // `cancelVelaLogin(undefined)`; the canonical id returned by the spawn was
    // then discarded, so the just-spawned login could stay active or the
    // no-body cancel could terminate a newer attempt. The cancel intent must
    // be preserved until the spawn resolves and the continuation must issue
    // `cancelVelaLogin(result.authAttemptId)` + broadcast with that id.
    const attemptId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
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
      let releaseLogin!: (response: Response) => void;
      const heldLoginResponse = new Promise<Response>((resolve) => {
        releaseLogin = resolve;
      });
      const fetchMock = vi.fn(async (input, init) => {
        const url = typeof input === 'string' ? input : (input as URL).toString();
        if (url.endsWith('/api/integrations/vela/status')) {
          // Pre-login read: no attempt id, nothing in flight.
          return jsonResponse({
            body: {
              loggedIn: false,
              loginInFlight: false,
              profile: 'prod',
              user: null,
              configPath: '/x',
            },
          });
        }
        if (url.endsWith('/api/integrations/vela/login') && init?.method === 'POST') {
          return heldLoginResponse;
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

      // Cancel while the spawn POST is still pending — the ref has no id yet.
      const cancelButton = await screen.findByRole('button', { name: 'Cancel sign-in' });
      fireEvent.click(cancelButton);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      // No legacy no-body cancel fires yet (no attempt known to target).
      expect(cancelBodies).toHaveLength(0);

      // Resolve the spawn with the canonical id; the preserved intent must
      // trigger the targeted cancel for it, not the legacy no-body form.
      releaseLogin(jsonResponse({ status: 202, body: { pid: 4242, authAttemptId: attemptId } }));
      await waitFor(() => {
        expect(cancelBodies).not.toHaveLength(0);
      });
      expect(cancelBodies).toEqual([{ authAttemptId: attemptId }]);
      expect(broadcastAttemptIds).toContain(attemptId);
    } finally {
      window.removeEventListener(AMR_LOGIN_STATUS_EVENT, onStatusChange);
    }
  });

  it('does not let a superseded begin() continuation finish or cancel a newer login', async () => {
    // Regression (full-surface audit gap): `begin()` guarded its continuations
    // only with `cancelledRef` — a shared boolean that a re-click resets to
    // false. A cancel → re-click while run A's poll read was in flight let A's
    // stale continuation through: it could `setStatus` over the newer run,
    // broadcast a false signed-in via `finishSignedIn`, or on a stale timeout
    // cancel the newer attempt with the mutable ref. Each `begin()` run now
    // owns a monotonic token that `cancel()`/a new `begin()` bumps, so run A's
    // continuations bail once A is superseded.
    const attemptId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const statusBroadcastReasons: string[] = [];
    const cancelBodies: Array<{ authAttemptId?: string } | null> = [];
    const onStatusChange = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: string }>).detail;
      statusBroadcastReasons.push(detail?.reason ?? 'status-changed');
    };
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, onStatusChange);
    try {
      let releasePollRead!: (response: Response) => void;
      const heldPollRead = new Promise<Response>((resolve) => {
        releasePollRead = resolve;
      });
      let statusCalls = 0;
      let holdPoll = false;
      let loginCalls = 0;
      const fetchMock = vi.fn(async (input, init) => {
        const url = typeof input === 'string' ? input : (input as URL).toString();
        if (url.endsWith('/api/integrations/vela/status')) {
          statusCalls += 1;
          if (holdPoll && statusCalls === 2) {
            return heldPollRead;
          }
          return jsonResponse({
            body: {
              loggedIn: false,
              loginInFlight: true,
              authAttemptId: attemptId,
              profile: 'prod',
              user: null,
              configPath: '/x',
            },
          });
        }
        if (url.endsWith('/api/integrations/vela/login') && init?.method === 'POST') {
          loginCalls += 1;
          return jsonResponse({ status: 202, body: { pid: 4242, authAttemptId: attemptId } });
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
      vi.useFakeTimers();
      // Run A: click, spawn resolves, first poll read is held.
      fireEvent.click(card);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      holdPoll = true;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
        await Promise.resolve();
      });

      // Cancel run A, then immediately re-click to start run B. Run A's held
      // poll read is still in flight.
      fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      holdPoll = false;
      fireEvent.click(card);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(loginCalls).toBe(2);

      // Release run A's stale poll read as signed-in. Run A must NOT
      // broadcast success for a login that was cancelled and superseded.
      await act(async () => {
        releasePollRead(jsonResponse({
          body: {
            loggedIn: true,
            profile: 'prod',
            user: { id: 'u', email: 'a@b.c' },
            configPath: '/x',
          },
        }));
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(statusBroadcastReasons).not.toContain('status-changed');

      vi.useRealTimers();
    } finally {
      window.removeEventListener(AMR_LOGIN_STATUS_EVENT, onStatusChange);
    }
  });

  it('does not let a superseded poll read overwrite the shared attempt ref', async () => {
    // Regression (review thread): `begin()` wrote the shared `authAttemptIdRef`
    // from each read BEFORE checking the run token, so a superseded run's
    // stale poll response could repoint the ref back to its own (older)
    // attempt id while a newer run was active — and a later `cancel()` would
    // then target that stale id instead of the current login's. Reads now keep
    // their id local until ownership is validated, so a later cancel must use
    // the newer run's id.
    const attemptA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const attemptB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const cancelBodies: Array<{ authAttemptId?: string } | null> = [];
    const onStatusChange = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: string }>).detail;
      if (detail?.reason === 'login-canceled') {
        // no-op; we only assert on cancelBodies
      }
    };
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, onStatusChange);
    try {
      let releasePollRead!: (response: Response) => void;
      const heldPollRead = new Promise<Response>((resolve) => {
        releasePollRead = resolve;
      });
      let statusCalls = 0;
      let holdPoll = false;
      let loginCalls = 0;
      let loginAttemptId = attemptA;
      const fetchMock = vi.fn(async (input, init) => {
        const url = typeof input === 'string' ? input : (input as URL).toString();
        if (url.endsWith('/api/integrations/vela/status')) {
          statusCalls += 1;
          if (holdPoll && statusCalls === 2) {
            return heldPollRead;
          }
          return jsonResponse({
            body: {
              loggedIn: false,
              loginInFlight: true,
              authAttemptId: loginAttemptId,
              profile: 'prod',
              user: null,
              configPath: '/x',
            },
          });
        }
        if (url.endsWith('/api/integrations/vela/login') && init?.method === 'POST') {
          loginCalls += 1;
          return jsonResponse({ status: 202, body: { pid: 4242, authAttemptId: loginAttemptId } });
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
      vi.useFakeTimers();
      // Run A: click, spawn resolves, first poll read is held.
      fireEvent.click(card);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      holdPoll = true;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(AMR_LOGIN_POLL_INTERVAL_MS);
        await Promise.resolve();
      });

      // Cancel run A; re-click starts run B with a different attempt id. Run
      // A's held poll read is still in flight.
      fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      holdPoll = false;
      loginAttemptId = attemptB;
      fireEvent.click(card);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(loginCalls).toBe(2);

      // Release run A's stale poll read carrying A's id. Run A must NOT
      // repoint the shared ref back to A (the token guard rejects it).
      await act(async () => {
        releasePollRead(jsonResponse({
          body: {
            loggedIn: false,
            loginInFlight: true,
            authAttemptId: attemptA,
            profile: 'prod',
            user: null,
            configPath: '/x',
          },
        }));
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      // Cancel run B: the target must be B's id, not A's — proving the stale
      // poll read did not overwrite the shared ref. (Run A's cancel earlier
      // already targeted A; the LAST cancel is the one that matters.)
      fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(cancelBodies[cancelBodies.length - 1]).toEqual({
        authAttemptId: attemptB,
      });

      vi.useRealTimers();
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
