// @vitest-environment jsdom
//
// The panel has two mutually-exclusive hosts — the rail's cluster on the entry
// views, `WorkspaceTopRightAccountCluster` on a project route — so every
// project<->home navigation unmounts one and mounts the other. Each remount
// re-ran the whole sync: `isAmrLoggedIn`, then a paginated `pullMessageCenter`,
// for a panel the user has not opened and whose contents cannot have changed in
// the time a route switch takes.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flushSync } from 'react-dom';

import { I18nProvider, useI18n } from '../../src/i18n';
import { MessageCenter } from '../../src/components/MessageCenter';
import { recordAnonymousRead } from '../../src/message-center-client';
import {
  currentAuthoritativeLoggedIn,
  currentSnapshotWriteToken,
  noteAuthoritativeAuthMode,
  resetMessageCenterSnapshot,
  subscribeMessageCenterReads,
} from '../../src/components/message-center-snapshot';
import { advanceWorkspaceAccountGeneration } from '../../src/collab/workspace-identity';
import { issueStatusObservation } from '../../src/providers/status-observation';

let statusCalls = 0;
let messageCalls = 0;

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/integrations/vela/status')) {
      statusCalls += 1;
      return Response.json({ loggedIn: false });
    }
    // Signed-out pulls go through `message-center-public`; match both proxies.
    if (url.includes('/message-center') && url.includes('/messages')) {
      messageCalls += 1;
      return Response.json({ messages: [], nextCursor: null, unreadCount: 0 });
    }
    return Response.json({});
  }));
}

function mount() {
  return render(
    <I18nProvider initial="zh-CN">
      <MessageCenter hideTrigger open={false} onOpenChange={() => {}} />
    </I18nProvider>,
  );
}

async function mountAndSettle() {
  const view = mount();
  await waitFor(() => expect(statusCalls).toBeGreaterThan(0));
  await waitFor(() => expect(messageCalls).toBeGreaterThan(0));
  return view;
}

beforeEach(() => {
  localStorage.clear();
  statusCalls = 0;
  messageCalls = 0;
  resetMessageCenterSnapshot();
  vi.useRealTimers();
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});


function row(id: string, readAt: string | null) {
  return {
    id,
    audienceType: 'global',
    typeName: 'Product update',
    title: id,
    body: id,
    ctaLabel: null,
    ctaUrl: null,
    publishedAt: '2026-07-16T12:00:00.000Z',
    readAt,
  };
}

/** fetch stub whose FIRST message pull is held open until released. */
function stubFetchWithGatedFirstPull(first: unknown[], later: unknown[]) {
  let releaseFirst: (() => void) | null = null;
  let pulls = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/integrations/vela/status')) {
      statusCalls += 1;
      return Response.json({ loggedIn: false });
    }
    if (url.includes('/message-center') && url.includes('/messages')) {
      messageCalls += 1;
      pulls += 1;
      if (pulls === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        return Response.json({ messages: first, nextCursor: null, unreadCount: first.length });
      }
      return Response.json({ messages: later, nextCursor: null, unreadCount: later.length });
    }
    return Response.json({});
  }));
  return { release: () => releaseFirst?.() };
}

describe('MessageCenter remount snapshot', () => {
  it('does not let a host that already unmounted publish over a newer snapshot', async () => {
    // `syncRequestIdRef` lives on ONE component, so it can only order that
    // component's own runs. A host that unmounts mid-flight never bumps its
    // ref again: when its slow pull finally lands, its request id, the account
    // generation and the locale all still match, and it wrote its older rows
    // straight over the snapshot its successor had already published. The next
    // remount then adopted the stale rows and the unread count went backwards.
    const gate = stubFetchWithGatedFirstPull(
      [row('a', null), row('b', null)],   // stale: 2 unread
      [row('a', '2026-07-16T13:00:00.000Z'), row('b', null)],   // fresh: 1 unread
    );

    const first = mount();
    await waitFor(() => expect(messageCalls).toBe(1));
    first.unmount();

    // The successor joins the in-flight run rather than racing it, so a second
    // run needs a refresh trigger — the same visibility refresh the component
    // wires up in production.
    const second = mount();
    await Promise.resolve();
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(messageCalls).toBe(2));

    // The fresh run has published. Now let the abandoned host land.
    gate.release();
    await new Promise((r) => setTimeout(r, 20));
    second.unmount();

    const counts: number[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter
          hideTrigger
          open={false}
          onOpenChange={() => {}}
          onUnreadCountChange={(n) => counts.push(n)}
        />
      </I18nProvider>,
    );

    // Adopted, not refetched — otherwise this asserts the network, not the
    // snapshot the stale writer was supposed to have corrupted.
    await waitFor(() => expect(counts.length).toBeGreaterThan(0));
    expect(messageCalls).toBe(2);
    expect(counts[counts.length - 1]).toBe(1);
  });

  it('does not replay the previous account\'s read after a boundary crosses mid-POST', async () => {
    // `markAccountMessageRead` is an await, and the boundary re-check used to
    // sit BELOW the mutations that follow it. A sign-out/sign-in landing across
    // that POST therefore left the old account's message id sitting in
    // `pendingReadIdsRef` (and the anonymous cache already cleared) before the
    // function bailed out — and the next sync replays that overlay, so a
    // same-id message belonging to whoever signed in came back already read.
    let releaseRead: (() => void) | null = null;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: true });
      }
      if (url.includes('/read') && init?.method === 'POST') {
        await new Promise<void>((resolve) => {
          releaseRead = resolve;
        });
        return Response.json({ read: true, markedCount: 1 });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        return Response.json({
          messages: [row('zeta-notice', null)],
          nextCursor: null,
          unreadCount: 1,
        });
      }
      return Response.json({});
    }));

    const counts: number[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter onUnreadCountChange={(n) => counts.push(n)} />
      </I18nProvider>,
    );
    await waitFor(() => expect(messageCalls).toBeGreaterThan(0));
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    fireEvent.click(await screen.findByRole('button', { name: /zeta-notice/ }));
    await waitFor(() => expect(releaseRead).not.toBeNull());

    // The account changes underneath the pending write.
    advanceWorkspaceAccountGeneration('mark-read-post-boundary');
    releaseRead!();
    await new Promise((r) => setTimeout(r, 20));

    // The new account's sync must not inherit that read.
    const before = messageCalls;
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(messageCalls).toBeGreaterThan(before));
    await waitFor(() => expect(counts[counts.length - 1]).toBe(1));
  });

  it('records both of two concurrent reads in the shared snapshot', async () => {
    // Two clicks land before either account POST resolves, so both capture the
    // same snapshot. Patching by wholesale replacement guarded on snapshot
    // identity meant the first completion replaced it and the second found the
    // identity no longer matching, committed only host-local state, and left
    // its row unread in the snapshot — so the badge came back on the next
    // remount.
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: true });
      }
      if (url.includes('/read') && init?.method === 'POST') {
        return Response.json({ read: true, markedCount: 1 });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        return Response.json({
          messages: [row('alpha-notice', null), row('beta-notice', null)],
          nextCursor: null,
          unreadCount: 2,
        });
      }
      return Response.json({});
    }));

    const host = render(
      <I18nProvider initial="zh-CN">
        <MessageCenter />
      </I18nProvider>,
    );
    await waitFor(() => expect(messageCalls).toBeGreaterThan(0));
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    const alpha = await screen.findByRole('button', { name: /alpha-notice/ });
    const beta = await screen.findByRole('button', { name: /beta-notice/ });

    // Back-to-back: neither POST has resolved when the second one starts.
    fireEvent.click(alpha);
    fireEvent.click(beta);
    await new Promise((r) => setTimeout(r, 40));
    host.unmount();

    const counts: number[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter
          hideTrigger
          open={false}
          onOpenChange={() => {}}
          onUnreadCountChange={(n) => counts.push(n)}
        />
      </I18nProvider>,
    );
    await waitFor(() => expect(counts.length).toBeGreaterThan(0));
    expect(counts[counts.length - 1]).toBe(0);
  });

  it('does not let an abandoned host overwrite the shared anonymous cache', async () => {
    // `commitState` also writes `localStorage`, which is shared, not
    // host-local. Gating only the snapshot left the cache unordered: an
    // unmounted host passes its own request id forever, so its stale rows land
    // on top of what a newer run just wrote, and a reload — or any remount
    // past the snapshot window — reads them back with the read marks gone.
    let releaseSecondPull: (() => void) | null = null;
    let pulls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: false });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        pulls += 1;
        if (pulls === 2) {
          await new Promise<void>((resolve) => {
            releaseSecondPull = resolve;
          });
          return Response.json({
            messages: [row('gamma-notice', null)],
            nextCursor: null,
            unreadCount: 1,
          });
        }
        // From the third pull on, the server reports the row as read.
        return Response.json({
          messages: [row('gamma-notice', pulls >= 3 ? '2026-07-16T13:00:00.000Z' : null)],
          nextCursor: null,
          unreadCount: pulls >= 3 ? 0 : 1,
        });
      }
      return Response.json({});
    }));

    const seed = mount();
    await waitFor(() => expect(messageCalls).toBe(1));
    seed.unmount();

    const abandoned = mount();
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(messageCalls).toBe(2));
    abandoned.unmount();

    const successor = mount();
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(messageCalls).toBe(3));
    await waitFor(() => expect(
      localStorage.getItem('open-design.message-center.anonymous-read-ids.v1') ?? '',
    ).toContain('gamma-notice'));
    successor.unmount();

    // Only now does the abandoned pull land, carrying pre-read rows.
    releaseSecondPull!();
    await new Promise((r) => setTimeout(r, 20));

    expect(
      localStorage.getItem('open-design.message-center.anonymous-read-ids.v1') ?? '',
    ).toContain('gamma-notice');
  });

  it('carries optimistic reads through a remount while the server projection lags', async () => {
    // The signed-in overlay is `serverReadIds` plus `pendingReadIdsRef`, and
    // never `readIdsRef`. Adoption restored the latter only, so a remount
    // inside the window followed by any refresh dropped the optimistic read
    // and put the badge back — the exact case the pending set exists for.
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: true });
      }
      if (url.includes('/read') && init?.method === 'POST') {
        return Response.json({ read: true, markedCount: 1 });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        // The projection never catches up for the length of this test.
        return Response.json({
          messages: [row('delta-notice', null)],
          nextCursor: null,
          unreadCount: 1,
        });
      }
      return Response.json({});
    }));

    const host = render(
      <I18nProvider initial="zh-CN">
        <MessageCenter />
      </I18nProvider>,
    );
    await waitFor(() => expect(messageCalls).toBeGreaterThan(0));
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    fireEvent.click(await screen.findByRole('button', { name: /delta-notice/ }));
    await new Promise((r) => setTimeout(r, 30));
    host.unmount();

    const counts: number[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter
          hideTrigger
          open={false}
          onOpenChange={() => {}}
          onUnreadCountChange={(n) => counts.push(n)}
        />
      </I18nProvider>,
    );
    await waitFor(() => expect(counts.length).toBeGreaterThan(0));

    // The refresh that used to lose it.
    const before = messageCalls;
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(messageCalls).toBeGreaterThan(before));
    await new Promise((r) => setTimeout(r, 20));
    expect(counts[counts.length - 1]).toBe(0);
  });

  it('drops the previous account\'s rows on a boundary crossed while mounted', async () => {
    // `notifyWorkspaceContextRefresh` retains the previous context while a
    // sign-in/sign-out resolves, so the host is NOT remounted. Capturing the
    // generation inside `sync` only stops a stale response from landing; a
    // settled list was left on screen for whoever signed in, until an open, a
    // visibility change or the 60s poll happened along.
    let pulls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: false });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        pulls += 1;
        return pulls === 1
          ? Response.json({
              messages: [row('previous-account', null), row('previous-account-2', null)],
              nextCursor: null,
              unreadCount: 2,
            })
          : Response.json({ messages: [], nextCursor: null, unreadCount: 0 });
      }
      return Response.json({});
    }));

    const counts: number[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter
          hideTrigger
          open={false}
          onOpenChange={() => {}}
          onUnreadCountChange={(n) => counts.push(n)}
        />
      </I18nProvider>,
    );
    await waitFor(() => expect(counts[counts.length - 1]).toBe(2));

    // The account changes under the still-mounted host.
    const before = messageCalls;
    advanceWorkspaceAccountGeneration('mounted-host-account-switch');
    await waitFor(() => expect(messageCalls).toBeGreaterThan(before));
    await waitFor(() => expect(counts[counts.length - 1]).toBe(0));
  });

  it('shows nothing from the previous account on the boundary render itself', async () => {
    // Clearing in an effect is too late: `useSyncExternalStore` re-renders with
    // the new generation while the state still holds the previous account's
    // rows, and the effect runs only after that render is committed — so the
    // panel and badge painted the old account's data for the new one. This
    // asserts at the boundary, before any refetch has had a chance to resolve.
    // A holder object rather than a bare `let`: TS narrows the latter to
    // `null` because the only assignment is inside a callback it cannot prove
    // runs, which makes the optional call below uncallable.
    const held: { release: (() => void) | null } = { release: null };
    let pulls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: false });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        pulls += 1;
        if (pulls >= 2) {
          // The post-boundary refetch never resolves for this test, so the only
          // thing that can empty the view is the render-time derivation.
          await new Promise<void>((resolve) => {
            held.release = resolve;
          });
        }
        return Response.json({
          messages: [row('prior-tenant-row', null)],
          nextCursor: null,
          unreadCount: 1,
        });
      }
      return Response.json({});
    }));

    const counts: number[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter onUnreadCountChange={(n) => counts.push(n)} />
      </I18nProvider>,
    );
    await waitFor(() => expect(counts[counts.length - 1]).toBe(1));
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    expect(await screen.findByRole('button', { name: /prior-tenant-row/ })).toBeTruthy();

    // `flushSync` runs the boundary render and its layout effects but NOT the
    // passive effects, which is exactly the gap being pinned: waiting with
    // `waitFor` would let the clearing effect run and pass either way (it did,
    // the first time this spec was written).
    flushSync(() => {
      advanceWorkspaceAccountGeneration('boundary-render-paint');
    });

    expect(screen.queryByRole('button', { name: /prior-tenant-row/ })).toBeNull();
    expect(counts[counts.length - 1]).toBe(0);
    held.release?.();
  });

  it('hides the previous session\'s badge and announcement in the boundary render itself', async () => {
    // Sibling of the generation-boundary spec above, for the other boundary.
    // The docblock on `rowsBelongToThisAccount` promises to fail closed DURING
    // the boundary render — but it only compared the workspace generation, and
    // a remote or expired session changes the authority WITHOUT advancing it.
    // `useSyncExternalStore` re-renders on that change while the state still
    // holds the previous session's rows, so there was one committed render
    // still showing its unread badge and its targeted announcement.
    //
    // Both assertions are on the DOM rather than the `onUnreadCountChange` /
    // `onPriorityAnnouncementPendingChange` callbacks: those fire from passive
    // effects, which `flushSync` deliberately does not run, so they would still
    // be reporting the render before this one.
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: true });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        return Response.json({
          messages: [{
            ...row('prior-session-row', null),
            audienceType: 'targeted',
            messageKey: 'go-plan-sunset-2026-08',
          }],
          nextCursor: null,
          unreadCount: 1,
        });
      }
      return Response.json({});
    }));

    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter priorityAnnouncementActive />
      </I18nProvider>,
    );
    // Panel left closed: the trigger's badge is the render-time surface, and
    // opening it would put the announcement dialog's modal over everything.
    await waitFor(() => expect(screen.queryByTestId('go-plan-sunset-dialog')).not.toBeNull());
    expect(screen.getByTestId('message-center-trigger').textContent).toContain('1');

    // The session ends remotely. No generation change.
    flushSync(() => {
      noteAuthoritativeAuthMode(false);
    });

    expect(screen.getByTestId('message-center-trigger').textContent).not.toContain('1');
    expect(screen.queryByTestId('go-plan-sunset-dialog')).toBeNull();
  });

  it('still pulls when its own status read loses the order to an identical answer', async () => {
    // Refusing an observation orders it; it does not mean the answer was wrong.
    // Another host's read can be issued later and answer first with the SAME
    // mode, and this run is then refused for ordering alone. Returning there
    // abandoned the pull: `retrySync` sees a resolved promise, so nothing
    // reports an error or schedules a retry, and a first mount finishes with an
    // empty bell until the user opens the panel or the 60s poll comes round.
    let releaseStatus: (() => void) | null = null;
    let holdStatus = true;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        if (holdStatus) {
          holdStatus = false;
          await new Promise<void>((resolve) => { releaseStatus = resolve; });
        }
        return Response.json({ loggedIn: true });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        return Response.json({
          messages: [row('late-order-row', null)],
          nextCursor: null,
          unreadCount: 1,
        });
      }
      return Response.json({});
    }));

    const counts: number[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter onUnreadCountChange={(n) => counts.push(n)} />
      </I18nProvider>,
    );
    await waitFor(() => expect(releaseStatus).not.toBeNull());

    // Another host's read was issued later and answers first — same mode.
    noteAuthoritativeAuthMode(true, issueStatusObservation());

    releaseStatus!();
    await waitFor(() => expect(counts[counts.length - 1]).toBe(1));
    expect(messageCalls).toBeGreaterThan(0);
  });

  it('finishes the announcement dismissal when its auth read loses the order', async () => {
    // Same refusal on the write path, where returning normally is worse than
    // useless: `GoPlanSunsetDialog` sets `dismissing` before awaiting and only
    // clears it if the promise REJECTS, so a silent success leaves the notice
    // mounted with every control disabled and no way back short of a remount —
    // the exact failure the `unavailable` branch above already guards against.
    let releaseStatus: (() => void) | null = null;
    let holdStatus = false;
    const posted: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        if (holdStatus) {
          holdStatus = false;
          await new Promise<void>((resolve) => { releaseStatus = resolve; });
        }
        return Response.json({ loggedIn: true });
      }
      if (url.includes('/read') && init?.method === 'POST') {
        posted.push(url);
        return Response.json({});
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        return Response.json({
          messages: [{
            ...row('announcement-row', null),
            audienceType: 'targeted',
            messageKey: 'go-plan-sunset-2026-08',
          }],
          nextCursor: null,
          unreadCount: 1,
        });
      }
      return Response.json({});
    }));

    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter priorityAnnouncementActive />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.queryByTestId('go-plan-sunset-dialog')).not.toBeNull());

    // The dismissal's own auth read is held, and loses the order to an
    // identical answer from elsewhere.
    holdStatus = true;
    fireEvent.click(screen.getByLabelText('关闭弹窗'));
    await waitFor(() => expect(releaseStatus).not.toBeNull());
    noteAuthoritativeAuthMode(true, issueStatusObservation());
    releaseStatus!();
    await new Promise((r) => setTimeout(r, 60));

    expect(posted.length).toBe(1);
    expect(screen.queryByTestId('go-plan-sunset-dialog')).toBeNull();
  });

  it('leaves the anonymous cache alone when the pull that would clear it is discarded', async () => {
    // The clear ran BEFORE the authority revalidation, so a signed-in pull that
    // resumed after a remote sign-out erased the anonymous messages and read
    // ids and was only then discarded — and being discarded, it put nothing
    // back. The session that is now signed out loses read state that exists
    // nowhere else.
    let releasePull!: () => void;
    window.localStorage.setItem(
      'open-design.message-center.anonymous-messages.v1',
      JSON.stringify([{ ...row('seeded-row', '2026-08-01T00:00:00.000Z') }]),
    );
    window.localStorage.setItem(
      'open-design.message-center.anonymous-read-ids.v1',
      JSON.stringify(['seeded-row']),
    );
    const seededKeys = [
      'open-design.message-center.anonymous-messages.v1',
      'open-design.message-center.anonymous-read-ids.v1',
    ];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: true });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        await new Promise<void>((resolve) => { releasePull = resolve; });
        return Response.json({ messages: [], nextCursor: null, unreadCount: 0 });
      }
      return Response.json({});
    }));

    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter />
      </I18nProvider>,
    );
    await waitFor(() => expect(releasePull).toBeTypeOf('function'));

    // Polling observes the session ending. No generation change.
    noteAuthoritativeAuthMode(false, issueStatusObservation());
    releasePull();
    await new Promise((r) => setTimeout(r, 40));

    for (const key of seededKeys) expect(window.localStorage.getItem(key)).not.toBeNull();
  });

  it('does not POST an account read whose auth check crossed the end of the session', async () => {
    // The sibling spec below holds the POST. This one holds the STATUS READ
    // that authorises it — which is the earlier and worse case, because the
    // epoch was captured after that read came back, by which time the change it
    // was meant to detect had already been counted. The post-POST comparison
    // then saw no change at all, so the write went through: an account POST for
    // a session that had ended, plus the read state, the anonymous clear and
    // the delta behind it.
    let releaseStatus: (() => void) | null = null;
    let holdStatus = false;
    // The upstream answers for the session that was valid when the request went
    // out. A stub that keeps saying signed-in after the sign-out is not the
    // scenario: the boundary's own resync would then legitimately put the
    // authority back, and the write would be right to proceed.
    let sessionValid = true;
    const posted: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        const answeredFor = sessionValid;
        if (holdStatus) {
          holdStatus = false;
          await new Promise<void>((resolve) => { releaseStatus = resolve; });
        }
        return Response.json({ loggedIn: answeredFor });
      }
      if (url.includes('/read') && init?.method === 'POST') {
        posted.push(url);
        return Response.json({});
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        return Response.json({
          messages: [row('auth-held-row', null)],
          nextCursor: null,
          unreadCount: 1,
        });
      }
      return Response.json({});
    }));

    const deltas: Array<{ account: boolean }> = [];
    const stop = subscribeMessageCenterReads((delta) => { deltas.push({ account: delta.account }); });

    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter />
      </I18nProvider>,
    );
    await waitFor(() => expect(messageCalls).toBeGreaterThan(0));
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    const rowButton = await screen.findByRole('button', { name: /auth-held-row/ });

    // The click's own auth read is held on the wire.
    holdStatus = true;
    fireEvent.click(rowButton);
    await waitFor(() => expect(releaseStatus).not.toBeNull());

    // Polling elsewhere observes the session ending. No generation change.
    sessionValid = false;
    noteAuthoritativeAuthMode(false, issueStatusObservation());
    await new Promise((r) => setTimeout(r, 20));

    // The held read answers with the session that was valid when it went out.
    releaseStatus!();
    await new Promise((r) => setTimeout(r, 40));

    expect(posted).toEqual([]);
    expect(deltas.filter((d) => d.account)).toEqual([]);
    stop();
  });

  it('does not record an account read whose POST crossed the end of the session', async () => {
    // Same rule as the pull path, on the write path. The post-await check here
    // only compared the workspace generation, and a remote or expired session
    // does not move it — so a read that started while signed in could resume
    // after the session ended and still take `loggedInRef` back to signed-in,
    // add pending read ids, clear the anonymous cache, and broadcast an
    // account-scoped read delta that another same-generation host consumes.
    let releaseRead!: () => void;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: true });
      }
      if (url.includes('/read') && init?.method === 'POST') {
        await new Promise<void>((resolve) => { releaseRead = resolve; });
        return Response.json({});
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        return Response.json({
          messages: [row('account-read-row', null)],
          nextCursor: null,
          unreadCount: 1,
        });
      }
      return Response.json({});
    }));

    const deltas: Array<{ account: boolean; messageId: string }> = [];
    const stop = subscribeMessageCenterReads((delta) => {
      deltas.push({ account: delta.account, messageId: delta.messageId });
    });

    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter />
      </I18nProvider>,
    );
    await waitFor(() => expect(messageCalls).toBeGreaterThan(0));
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    const rowButton = await screen.findByRole('button', { name: /account-read-row/ });

    // The read goes out while the session is still valid, and is held.
    fireEvent.click(rowButton);
    await waitFor(() => expect(releaseRead).toBeTypeOf('function'));

    // Polling observes the session ending. No generation change.
    noteAuthoritativeAuthMode(false);
    await new Promise((r) => setTimeout(r, 20));

    const afterBoundary = deltas.length;
    releaseRead();
    await new Promise((r) => setTimeout(r, 40));

    expect(deltas.slice(afterBoundary).filter((d) => d.account)).toEqual([]);
    stop();
  });

  it('keeps the targeted announcement alive across a remount that adopts', async () => {
    // The announcement is derived from the rows plus the signed-in state, both
    // of which the snapshot carries — but adoption restored the rows only, so a
    // project<->home remount inside the window dropped the required notice (and
    // its pending signal) until the next network sync, which is also long
    // enough for a lower-priority campaign to take the screen instead.
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: true });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        return Response.json({
          messages: [{
            ...row('go-plan-sunset', null),
            audienceType: 'targeted',
            messageKey: 'go-plan-sunset-2026-08',
          }],
          nextCursor: null,
          unreadCount: 1,
        });
      }
      return Response.json({});
    }));

    const pending: boolean[] = [];
    const first = render(
      <I18nProvider initial="zh-CN">
        <MessageCenter
          hideTrigger
          open={false}
          onOpenChange={() => {}}
          priorityAnnouncementActive
          onPriorityAnnouncementPendingChange={(v) => pending.push(v)}
        />
      </I18nProvider>,
    );
    await waitFor(() => expect(pending[pending.length - 1]).toBe(true));
    const afterFirst = messageCalls;
    first.unmount();

    const pendingAfter: boolean[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter
          hideTrigger
          open={false}
          onOpenChange={() => {}}
          priorityAnnouncementActive
          onPriorityAnnouncementPendingChange={(v) => pendingAfter.push(v)}
        />
      </I18nProvider>,
    );

    // Adopted, not refetched — so this is asserting the snapshot path.
    await waitFor(() => expect(pendingAfter.length).toBeGreaterThan(0));
    expect(messageCalls).toBe(afterFirst);
    expect(pendingAfter[pendingAfter.length - 1]).toBe(true);
  });

  it('keeps a successor\'s anonymous read when an older continuation lands after it', async () => {
    // `markRead` used to persist this host's WHOLE row set. A continuation can
    // pause across its awaits, its host can unmount, and a successor can
    // persist a read of its own meanwhile — the full-array write on resume then
    // dropped it from the durable cache, and the badge came back after the
    // snapshot expired or the page reloaded.
    // Gated by an explicit flag, not by call ordinal: opening the panel fires a
    // sync of its own, so "the second status call" was that one and the read's
    // continuation never actually paused — which is why the first version of
    // this spec passed against the unfixed code.
    const hold = { armed: false, release: null as (() => void) | null };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        if (hold.armed) {
          hold.armed = false;
          await new Promise<void>((resolve) => {
            hold.release = resolve;
          });
        }
        return Response.json({ loggedIn: false });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        return Response.json({
          messages: [row('anon-one', null), row('anon-two', null)],
          nextCursor: null,
          unreadCount: 2,
        });
      }
      return Response.json({});
    }));

    const host = render(
      <I18nProvider initial="zh-CN">
        <MessageCenter />
      </I18nProvider>,
    );
    await waitFor(() => expect(messageCalls).toBeGreaterThan(0));
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    const target = await screen.findByRole('button', { name: /anon-one/ });
    // Let the open effect's own sync settle first, THEN arm the gate.
    await new Promise((r) => setTimeout(r, 30));
    hold.armed = true;
    fireEvent.click(target);
    await waitFor(() => expect(hold.release).not.toBeNull());

    // While that read is parked, a successor persists a different one.
    recordAnonymousRead(window.localStorage, 'anon-two', '2026-07-16T13:00:00.000Z');

    hold.release!();
    await new Promise((r) => setTimeout(r, 30));
    host.unmount();

    const persisted = window.localStorage.getItem('open-design.message-center.anonymous-read-ids.v1') ?? '';
    expect(persisted).toContain('anon-two');
    expect(persisted).toContain('anon-one');
  });

  it('takes an in-flight refresh even when a settled snapshot was adopted', async () => {
    // Adoption showed the older rows and stopped there: the run already on the
    // wire is fresher, but nothing pushes its result into a host that merely
    // adopted, so it stayed stale until an open, a visibility change or the 60s
    // poll.
    let releaseSecond: (() => void) | null = null;
    let pulls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: false });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        pulls += 1;
        if (pulls === 1) {
          return Response.json({
            messages: [row('stale-a', null), row('stale-b', null)],
            nextCursor: null,
            unreadCount: 2,
          });
        }
        if (pulls === 2) {
          await new Promise<void>((resolve) => {
            releaseSecond = resolve;
          });
        }
        return Response.json({ messages: [row('stale-a', null)], nextCursor: null, unreadCount: 1 });
      }
      return Response.json({});
    }));

    const seed = mount();
    await waitFor(() => expect(messageCalls).toBe(1));

    // A refresh goes on the wire and is held there.
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(messageCalls).toBe(2));
    seed.unmount();

    // The successor adopts the settled snapshot (2 unread) while that refresh
    // is still pending.
    const counts: number[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter
          hideTrigger
          open={false}
          onOpenChange={() => {}}
          onUnreadCountChange={(n) => counts.push(n)}
        />
      </I18nProvider>,
    );
    await waitFor(() => expect(counts[counts.length - 1]).toBe(2));

    // When the refresh lands, this host must move to its result.
    releaseSecond!();
    await waitFor(() => expect(counts[counts.length - 1]).toBe(1));
    expect(messageCalls).toBe(2);
  });

  it('does not paint an error when a superseded run rejects after a newer one succeeds', async () => {
    // Overlapping runs are normal — open, visibility and the 60s poll all call
    // `retrySync`. The catch was unconditional, so a slow first run failing
    // after a fast second one succeeded put the error banner over rows that
    // were on screen and correct.
    let failFirst: (() => void) | null = null;
    let pulls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: false });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        pulls += 1;
        if (pulls === 1) {
          await new Promise<void>((resolve) => {
            failFirst = resolve;
          });
          throw new Error('first run failed late');
        }
        return Response.json({
          messages: [row('survivor', null)],
          nextCursor: null,
          unreadCount: 1,
        });
      }
      return Response.json({});
    }));

    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter />
      </I18nProvider>,
    );
    await waitFor(() => expect(messageCalls).toBe(1));

    // A second run overtakes it and succeeds.
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(messageCalls).toBe(2));
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    expect(await screen.findByRole('button', { name: /survivor/ })).toBeTruthy();

    // Only now does the superseded run reject.
    failFirst!();
    await new Promise((r) => setTimeout(r, 40));

    expect(screen.queryByRole('button', { name: /survivor/ })).not.toBeNull();
    // The real banner copy, not a guessed regex — the first version of this
    // spec matched nothing and passed against the unfixed code.
    expect(screen.queryByText('检查失败，请重试')).toBeNull();
  });

  it('does not wipe the anonymous cache from a run issued before a sign-out', async () => {
    // The account generation is the only guard on the clear, and it does not
    // move on sign-out: `notifyWorkspaceContextRefresh` is called on sign-IN by
    // AmrLoginPill and not by `handleActiveCloudSignOut`. So a signed-in run
    // resumes after the user signs out, still believing `account === true`, and
    // destroys read ids a signed-out run has since persisted — which for an
    // anonymous reader exist nowhere else.
    let releasePull: (() => void) | null = null;
    let pulls = 0;
    let loggedIn = true;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        pulls += 1;
        if (pulls === 1) {
          await new Promise<void>((resolve) => {
            releasePull = resolve;
          });
        }
        return Response.json({ messages: [row('kept-read', null)], nextCursor: null, unreadCount: 1 });
      }
      return Response.json({});
    }));

    // A signed-in host puts a pull on the wire and then goes away.
    const signedIn = mount();
    await waitFor(() => expect(messageCalls).toBe(1));
    signedIn.unmount();

    // The user signs out; a signed-out run persists what it read.
    loggedIn = false;
    const anon = mount();
    // The first pull is still on the wire, so this mount JOINS it rather than
    // starting its own; the visibility refresh is what gives the signed-out
    // state a run of its own (the app navigates on sign-out, so a refresh here
    // is the realistic shape).
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(messageCalls).toBe(2));
    recordAnonymousRead(window.localStorage, 'kept-read', '2026-07-16T13:00:00.000Z');
    expect(window.localStorage.getItem('open-design.message-center.anonymous-read-ids.v1') ?? '')
      .toContain('kept-read');

    // Only now does the signed-in pull land.
    releasePull!();
    await new Promise((r) => setTimeout(r, 30));
    anon.unmount();

    expect(window.localStorage.getItem('open-design.message-center.anonymous-read-ids.v1') ?? '')
      .toContain('kept-read');
  });

  it('does not let a runtime-unavailable read stand in for a signed-out answer', async () => {
    // `isAmrLoggedIn` maps a 503 `amr-runtime-unavailable` to `false`, which is
    // indistinguishable from a real signed-out state. Publishing a snapshot on
    // that reading served the PUBLIC feed to a signed-in reader for the whole
    // window: a remount adopts without re-asking, so a runtime that recovered
    // in the meantime went unnoticed and the targeted messages stayed missing.
    let runtimeUp = false;
    const pulled: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        if (!runtimeUp) {
          return new Response(JSON.stringify({ error: 'amr-runtime-unavailable' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          });
        }
        return Response.json({ loggedIn: true });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        pulled.push(url.includes('message-center-public') ? 'public' : 'account');
        return Response.json({ messages: [], nextCursor: null, unreadCount: 0 });
      }
      return Response.json({});
    }));

    const down = await mountAndSettle();
    expect(pulled).toEqual(['public']);
    down.unmount();

    // The runtime comes back; the workspace identity never changed, so the
    // account generation has not moved and the window has not elapsed.
    runtimeUp = true;
    mount();

    // The remount must ask again rather than reuse an answer nobody gave.
    await waitFor(() => expect(pulled.length).toBe(2));
    expect(pulled[1]).toBe('account');
  });

  it('does not stamp a pre-boundary login answer into component state', async () => {
    // `resolveLoggedInForWrite` used to assign `loggedInRef`/`setLoggedIn`
    // before returning, so the write landed BEFORE the caller's boundary check
    // wherever that check sat. A status request issued while signed in then
    // resolved after the sign-out, re-stamped `true` over the settled
    // signed-out state, and the next sync read `wasAccount === true`, took the
    // signed-out transition a second time, and wiped the read the signed-out
    // user had just made.
    const hold = { armed: false, release: null as (() => void) | null };
    let loggedIn = true;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        // The answer reflects the moment the request was ISSUED, which is the
        // point: it returns describing an authority that has moved on.
        const answeredWith = loggedIn;
        if (hold.armed) {
          hold.armed = false;
          await new Promise<void>((resolve) => {
            hold.release = resolve;
          });
        }
        return Response.json({ loggedIn: answeredWith });
      }
      if (url.includes('/read') && init?.method === 'POST') {
        return Response.json({ read: true, markedCount: 1 });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        return Response.json({ messages: [row('boundary-row', null)], nextCursor: null, unreadCount: 1 });
      }
      return Response.json({});
    }));

    const counts: number[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter onUnreadCountChange={(n) => counts.push(n)} />
      </I18nProvider>,
    );
    await waitFor(() => expect(messageCalls).toBeGreaterThan(0));
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    await new Promise((r) => setTimeout(r, 30));

    // A read begins while signed in; its status call is held on the wire.
    hold.armed = true;
    fireEvent.click(await screen.findByRole('button', { name: /boundary-row/ }));
    await waitFor(() => expect(hold.release).not.toBeNull());

    // The user signs out and a signed-out sync settles first.
    loggedIn = false;
    advanceWorkspaceAccountGeneration('read-status-boundary');
    let before = messageCalls;
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(messageCalls).toBeGreaterThan(before));
    await waitFor(() => expect(counts[counts.length - 1]).toBe(1));

    // The signed-out user reads it for themselves.
    fireEvent.click(await screen.findByRole('button', { name: /boundary-row/ }));
    await waitFor(() => expect(counts[counts.length - 1]).toBe(0));

    // Only now does the pre-sign-out status answer land, carrying `true`.
    hold.release!();
    await new Promise((r) => setTimeout(r, 30));

    // A later sync must not treat this host as a signed-in predecessor and
    // discard that read.
    before = messageCalls;
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(messageCalls).toBeGreaterThan(before));
    await new Promise((r) => setTimeout(r, 20));

    expect(counts[counts.length - 1]).toBe(0);
  });

  it('does not take the signed-out transition on a transient 503', async () => {
    // `account` collapses `unavailable` into `false`, so the signed-out branch
    // ran during a runtime outage and discarded `pendingReadIdsRef` — the
    // optimistic reads the server projection has not caught up on. When the
    // runtime returned before the projection did, the badge came back for a row
    // the user had already read.
    let mode: 'up' | 'down' = 'up';
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        if (mode === 'down') {
          return new Response(JSON.stringify({ error: 'amr-runtime-unavailable' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          });
        }
        return Response.json({ loggedIn: true });
      }
      if (url.includes('/read') && init?.method === 'POST') {
        return Response.json({ read: true, markedCount: 1 });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        // The projection never catches up for the length of this test.
        return Response.json({ messages: [row('pending-ack', null)], nextCursor: null, unreadCount: 1 });
      }
      return Response.json({});
    }));

    const counts: number[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter onUnreadCountChange={(n) => counts.push(n)} />
      </I18nProvider>,
    );
    await waitFor(() => expect(messageCalls).toBeGreaterThan(0));
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    fireEvent.click(await screen.findByRole('button', { name: /pending-ack/ }));
    await waitFor(() => expect(counts[counts.length - 1]).toBe(0));

    // The runtime goes away and a refresh lands during the outage.
    mode = 'down';
    let before = messageCalls;
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(messageCalls).toBeGreaterThan(before));

    // It comes back before the projection does; the optimistic read must have
    // survived the outage.
    mode = 'up';
    before = messageCalls;
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(messageCalls).toBeGreaterThan(before));
    await new Promise((r) => setTimeout(r, 20));
    expect(counts[counts.length - 1]).toBe(0);
  });

  it('still clears the signed-in overlay when a sign-out follows an outage', async () => {
    // The 503 assigned `loggedInRef = false` even though it answered nothing,
    // spending the transition marker. A genuine sign-out arriving afterwards
    // then saw `wasAccount === false`, skipped the clear, and the signed-in
    // read ids survived — overlaid onto the public feed and persisted as
    // anonymous reads, so a message the anonymous reader had never opened
    // showed as read.
    let mode: 'in' | 'down' | 'out' = 'in';
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        if (mode === 'down') {
          return new Response(JSON.stringify({ error: 'amr-runtime-unavailable' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          });
        }
        return Response.json({ loggedIn: mode === 'in' });
      }
      if (url.includes('/read') && init?.method === 'POST') {
        return Response.json({ read: true, markedCount: 1 });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        return Response.json({ messages: [row('shared-id', null)], nextCursor: null, unreadCount: 1 });
      }
      return Response.json({});
    }));

    const counts: number[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter onUnreadCountChange={(n) => counts.push(n)} />
      </I18nProvider>,
    );
    await waitFor(() => expect(messageCalls).toBeGreaterThan(0));
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    fireEvent.click(await screen.findByRole('button', { name: /shared-id/ }));
    await waitFor(() => expect(counts[counts.length - 1]).toBe(0));

    // An outage refresh lands. It answers nothing.
    mode = 'down';
    let before = messageCalls;
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(messageCalls).toBeGreaterThan(before));

    // Then a genuine sign-out, with no generation advance.
    mode = 'out';
    before = messageCalls;
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(messageCalls).toBeGreaterThan(before));
    await new Promise((r) => setTimeout(r, 20));

    // The anonymous reader has read nothing.
    expect(counts[counts.length - 1]).toBe(1);
    expect(window.localStorage.getItem('open-design.message-center.anonymous-read-ids.v1') ?? '[]')
      .not.toContain('shared-id');
  });

  it('ignores a superseded run\'s auth answer before it touches component state', async () => {
    // Refreshes overlap routinely — open, visibility, the interval, a remount
    // that joins and then refreshes. The request-id check sat only after the
    // pull, so a held status answer from run A landed after run B had already
    // captured the signed-out transition, and re-stamped `loggedInRef` to
    // `true`. The next signed-out refresh then read `wasAccount === true`,
    // cleared the anonymous overlay, and persisted an empty read-id set —
    // erasing a read the current anonymous session had just made.
    const hold = { armed: false, release: null as (() => void) | null };
    let loggedIn = true;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        const answeredWith = loggedIn;
        if (hold.armed) {
          hold.armed = false;
          await new Promise<void>((resolve) => {
            hold.release = resolve;
          });
        }
        return Response.json({ loggedIn: answeredWith });
      }
      if (url.includes('/read') && init?.method === 'POST') {
        return Response.json({ read: true, markedCount: 1 });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        return Response.json({ messages: [row('anon-ack', null)], nextCursor: null, unreadCount: 1 });
      }
      return Response.json({});
    }));

    const counts: number[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter onUnreadCountChange={(n) => counts.push(n)} />
      </I18nProvider>,
    );
    await waitFor(() => expect(messageCalls).toBeGreaterThan(0));

    // Run A: a refresh whose status answer is held while still signed in.
    hold.armed = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(hold.release).not.toBeNull());

    // Run B overtakes it and settles the signed-out transition. No account
    // boundary is crossed — this is one identity's runs racing each other.
    loggedIn = false;
    let before = messageCalls;
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(messageCalls).toBeGreaterThan(before));

    // The anonymous session reads the row.
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    fireEvent.click(await screen.findByRole('button', { name: /anon-ack/ }));
    await waitFor(() => expect(counts[counts.length - 1]).toBe(0));

    // Only now does run A's stale `signed-in` answer land.
    hold.release!();
    await new Promise((r) => setTimeout(r, 30));

    // A later refresh must not see a signed-in predecessor and wipe the read.
    before = messageCalls;
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(messageCalls).toBeGreaterThan(before));
    await new Promise((r) => setTimeout(r, 20));

    expect(counts[counts.length - 1]).toBe(0);
    expect(window.localStorage.getItem('open-design.message-center.anonymous-read-ids.v1') ?? '')
      .toContain('anon-ack');
  });

  it('reaches a successor that mounted while the read was still in flight', async () => {
    // Click an unread row, then navigate before the write lands. The old host
    // unmounts mid-flight; the successor adopts the still-unread snapshot and
    // finishes its mount effect. Patching the shared snapshot afterwards only
    // helps hosts that adopt LATER — the one already on screen kept the row
    // unread until an open, a visibility refresh or the 60s poll.
    const hold = { armed: false, release: null as (() => void) | null };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: true });
      }
      if (url.includes('/read') && init?.method === 'POST') {
        if (hold.armed) {
          hold.armed = false;
          await new Promise<void>((resolve) => {
            hold.release = resolve;
          });
        }
        return Response.json({ read: true, markedCount: 1 });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        return Response.json({ messages: [row('in-flight-read', null)], nextCursor: null, unreadCount: 1 });
      }
      return Response.json({});
    }));

    const first = render(
      <I18nProvider initial="zh-CN">
        <MessageCenter />
      </I18nProvider>,
    );
    await waitFor(() => expect(messageCalls).toBe(1));
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    const target = await screen.findByRole('button', { name: /in-flight-read/ });
    await new Promise((r) => setTimeout(r, 30));

    // The read starts and its POST is held.
    hold.armed = true;
    fireEvent.click(target);
    await waitFor(() => expect(hold.release).not.toBeNull());

    // The user navigates: this host goes away, a successor takes over and
    // adopts the snapshot as it stands — still unread.
    first.unmount();
    // Opening the panel already cost a sync of its own, so the meaningful
    // measure is that nothing further goes out once the successor is up.
    const pullsBeforeSuccessor = messageCalls;
    const counts: number[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter
          hideTrigger
          open={false}
          onOpenChange={() => {}}
          onUnreadCountChange={(n) => counts.push(n)}
        />
      </I18nProvider>,
    );
    await waitFor(() => expect(counts[counts.length - 1]).toBe(1));

    // The predecessor's write lands.
    hold.release!();

    // The successor must learn about it without another round trip.
    await waitFor(() => expect(counts[counts.length - 1]).toBe(0));
    expect(messageCalls).toBe(pullsBeforeSuccessor);
  });

  it('retires a successor\'s announcement when the predecessor\'s acknowledgement lands', async () => {
    // The successor adopted an UNREAD targeted notice, so `adopt` put the modal
    // up. The predecessor's acknowledgement then succeeds and reaches the read
    // subscriber, which updated the rows and read ids but not the announcement
    // — leaving the successor holding a modal for something already
    // acknowledged, so the user had to confirm it twice.
    const hold = { armed: false, release: null as (() => void) | null };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: true });
      }
      if (url.includes('/read') && init?.method === 'POST') {
        if (hold.armed) {
          hold.armed = false;
          await new Promise<void>((resolve) => {
            hold.release = resolve;
          });
        }
        return Response.json({ read: true, markedCount: 1 });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        return Response.json({
          messages: [{
            ...row('go-plan-sunset', null),
            audienceType: 'targeted',
            messageKey: 'go-plan-sunset-2026-08',
          }],
          nextCursor: null,
          unreadCount: 1,
        });
      }
      return Response.json({});
    }));

    const first = render(
      <I18nProvider initial="zh-CN">
        <MessageCenter />
      </I18nProvider>,
    );
    await waitFor(() => expect(messageCalls).toBeGreaterThan(0));
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    const target = await screen.findByRole('button', { name: /go-plan-sunset/ });
    await new Promise((r) => setTimeout(r, 30));

    // Acknowledge it; the POST is held.
    hold.armed = true;
    fireEvent.click(target);
    await waitFor(() => expect(hold.release).not.toBeNull());

    // Navigate away mid-flight; the successor adopts the still-unread notice.
    first.unmount();
    const pending: boolean[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter
          hideTrigger
          open={false}
          onOpenChange={() => {}}
          priorityAnnouncementActive
          onPriorityAnnouncementPendingChange={(v) => pending.push(v)}
        />
      </I18nProvider>,
    );
    await waitFor(() => expect(pending[pending.length - 1]).toBe(true));

    // The predecessor's acknowledgement lands.
    hold.release!();

    // The successor must retire the notice rather than ask again.
    await waitFor(() => expect(pending[pending.length - 1]).toBe(false));
  });

  it('does not write anonymous state for a signed-in click during an outage', async () => {
    // `markRead` resolved a BOOLEAN, so a 503 collapsed to `false` and a
    // signed-in click took the anonymous path: no account POST, a write to the
    // shared anonymous cache, and a snapshot delta recorded as `account: false`.
    let mode: 'up' | 'down' = 'up';
    let readPosts = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        if (mode === 'down') {
          return new Response(JSON.stringify({ error: 'amr-runtime-unavailable' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          });
        }
        return Response.json({ loggedIn: true });
      }
      if (url.includes('/read') && init?.method === 'POST') {
        readPosts += 1;
        return Response.json({ read: true, markedCount: 1 });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        return Response.json({ messages: [row('outage-click', null)], nextCursor: null, unreadCount: 1 });
      }
      return Response.json({});
    }));

    const counts: number[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter onUnreadCountChange={(n) => counts.push(n)} />
      </I18nProvider>,
    );
    await waitFor(() => expect(messageCalls).toBeGreaterThan(0));
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    const target = await screen.findByRole('button', { name: /outage-click/ });
    await new Promise((r) => setTimeout(r, 30));

    // The runtime drops, and the signed-in user clicks an unread row.
    mode = 'down';
    fireEvent.click(target);
    await new Promise((r) => setTimeout(r, 40));

    // Nothing may have been guessed at: no POST, no anonymous cache, and the
    // shared snapshot untouched — a remount must not replay it either.
    expect(readPosts).toBe(0);
    expect(window.localStorage.getItem('open-design.message-center.anonymous-read-ids.v1') ?? '')
      .not.toContain('outage-click');

    // Once the runtime answers again, the same click records properly.
    mode = 'up';
    fireEvent.click(screen.getByRole('button', { name: /outage-click/ }));
    await waitFor(() => expect(readPosts).toBe(1));
    await waitFor(() => expect(counts[counts.length - 1]).toBe(0));
  });

  it('keeps the announcement dismissible after an outage', async () => {
    // `markRead` returning normally on `unavailable` reads as SUCCESS to
    // `GoPlanSunsetDialog`, which sets `dismissing` before awaiting. The notice
    // therefore stayed mounted with every control disabled, and recovering the
    // runtime did not help: without an error the dialog never re-enabled
    // itself, so there was no way to acknowledge short of a remount.
    let mode: 'up' | 'down' = 'down';
    let readPosts = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        if (mode === 'down') {
          return new Response(JSON.stringify({ error: 'amr-runtime-unavailable' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          });
        }
        return Response.json({ loggedIn: true });
      }
      if (url.includes('/read') && init?.method === 'POST') {
        readPosts += 1;
        return Response.json({ read: true, markedCount: 1 });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        return Response.json({
          messages: [{
            ...row('go-plan-sunset', null),
            audienceType: 'targeted',
            messageKey: 'go-plan-sunset-2026-08',
          }],
          nextCursor: null,
          unreadCount: 1,
        });
      }
      return Response.json({});
    }));

    // Seed the announcement while the runtime is up, then take it away.
    mode = 'up';
    const pending: boolean[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter
          hideTrigger
          open={false}
          onOpenChange={() => {}}
          priorityAnnouncementActive
          onPriorityAnnouncementPendingChange={(v) => pending.push(v)}
        />
      </I18nProvider>,
    );
    await waitFor(() => expect(pending[pending.length - 1]).toBe(true));

    mode = 'down';
    const acknowledge = await screen.findByRole('button', { name: /我知道了/ });
    fireEvent.click(acknowledge);

    // The failure must come back to the dialog so it re-enables itself.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /我知道了/ })).not.toBeDisabled();
    });
    expect(readPosts).toBe(0);

    // With the runtime back, the same control works.
    mode = 'up';
    fireEvent.click(screen.getByRole('button', { name: /我知道了/ }));
    await waitFor(() => expect(readPosts).toBe(1));
    await waitFor(() => expect(pending[pending.length - 1]).toBe(false));
  });

  it('does not spend a publication slot on a click it cannot act on', async () => {
    // `markRead` CLAIMED a slot before it knew whether it could act, so an
    // `unavailable` click returned having done nothing while the counter had
    // moved — stripping a sync already waiting on its pull of the right to
    // publish, and costing the next host swap the fetch this module exists to
    // avoid.
    //
    // Asserted as the property rather than the downstream fetch on purpose: to
    // observe the consequence, the parked sync would have to be the ONLY
    // publisher, and a row can only be clicked once some earlier sync has
    // settled — which has already published a snapshot the remount would adopt
    // regardless. The property is what the guard is; the fetch follows from it.
    let statusMode: 'up' | 'down' = 'up';
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        if (statusMode === 'down') {
          return new Response(JSON.stringify({ error: 'amr-runtime-unavailable' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          });
        }
        return Response.json({ loggedIn: false });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        return Response.json({ messages: [row('slot-row', null)], nextCursor: null, unreadCount: 1 });
      }
      return Response.json({});
    }));

    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter />
      </I18nProvider>,
    );
    await waitFor(() => expect(messageCalls).toBeGreaterThan(0));
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    const target = await screen.findByRole('button', { name: /slot-row/ });
    await new Promise((r) => setTimeout(r, 30));

    // The runtime drops; the click can do nothing.
    statusMode = 'down';
    const tokenBefore = currentSnapshotWriteToken();
    fireEvent.click(target);
    await new Promise((r) => setTimeout(r, 40));

    expect(currentSnapshotWriteToken()).toBe(tokenBefore);

    // And a click it CAN act on still supersedes earlier pulls, as it must.
    statusMode = 'up';
    fireEvent.click(screen.getByRole('button', { name: /slot-row/ }));
    await waitFor(() => expect(currentSnapshotWriteToken()).toBeGreaterThan(tokenBefore));
  });

  it('clears the anonymous cache on sign-in even when a sync overlaps the read', async () => {
    // Both halves must be in flight at once for the hole to open: the read
    // observes token N, a successor sync is issued at N+1 so the read declines
    // to clear, the read then supersedes to N+2 so the SYNC declines too, and a
    // signed-out session's rows survive the sign-in. Gating only one of them
    // lets the other clear and the spec passes against the broken code — which
    // is how the first two versions of this test were written.
    const seedAnonymous = () => {
      window.localStorage.setItem(
        'open-design.message-center.anonymous-messages.v1',
        JSON.stringify([row('stale-anon', null)]),
      );
      window.localStorage.setItem(
        'open-design.message-center.anonymous-read-ids.v1',
        JSON.stringify(['stale-anon']),
      );
    };

    const post = { armed: false, release: null as (() => void) | null };
    const pull = { armed: false, release: null as (() => void) | null };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: true });
      }
      if (url.includes('/read') && init?.method === 'POST') {
        if (post.armed) {
          post.armed = false;
          await new Promise<void>((resolve) => { post.release = resolve; });
        }
        return Response.json({ read: true, markedCount: 1 });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        if (pull.armed) {
          pull.armed = false;
          await new Promise<void>((resolve) => { pull.release = resolve; });
        }
        return Response.json({ messages: [row('acct-row', null)], nextCursor: null, unreadCount: 1 });
      }
      return Response.json({});
    }));

    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter />
      </I18nProvider>,
    );
    await waitFor(() => expect(messageCalls).toBeGreaterThan(0));
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    const target = await screen.findByRole('button', { name: /acct-row/ });
    await new Promise((r) => setTimeout(r, 30));

    // Seeded HERE, not before the render: the mount sync is already signed in,
    // so it clears the anonymous cache on its way through and an earlier seed
    // would be gone before the scenario starts — which made the first three
    // versions of this spec assert `null` against a cache nothing had left.
    seedAnonymous();

    // The read parks on its POST.
    post.armed = true;
    fireEvent.click(target);
    await waitFor(() => expect(post.release).not.toBeNull());

    // A successor sync is issued and parks on its PULL, so it cannot clear
    // before the read resumes.
    pull.armed = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(pull.release).not.toBeNull());

    // The premise, asserted rather than assumed: the cache is still there when
    // the two overlapping operations are about to resolve.
    expect(window.localStorage.getItem('open-design.message-center.anonymous-read-ids.v1'))
      .toContain('stale-anon');

    // Read first, then the sync.
    post.release!();
    await new Promise((r) => setTimeout(r, 30));
    pull.release!();
    await new Promise((r) => setTimeout(r, 40));

    expect(window.localStorage.getItem('open-design.message-center.anonymous-read-ids.v1')).toBeNull();
    expect(window.localStorage.getItem('open-design.message-center.anonymous-messages.v1')).toBeNull();
  });

  it('keeps a read that finishes after a language switch', async () => {
    // `markRead` closes over the locale of the render the user clicked in. If
    // the POST is still pending when the language changes, the new-locale sync
    // publishes first and the read\'s delta was then rejected for a locale
    // mismatch — so the shared snapshot still showed the row unread, and a
    // remount inside the window brought the badge back. The message id is the
    // same row in either language; only the ROWS are language-specific.
    const post = { armed: false, release: null as (() => void) | null };
    let pulls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: true });
      }
      if (url.includes('/read') && init?.method === 'POST') {
        if (post.armed) {
          post.armed = false;
          await new Promise<void>((resolve) => { post.release = resolve; });
        }
        return Response.json({ read: true, markedCount: 1 });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        pulls += 1;
        return Response.json({ messages: [row('bilingual-row', null)], nextCursor: null, unreadCount: 1 });
      }
      return Response.json({});
    }));

    function Harness() {
      const { setLocale } = useI18n();
      return (
        <>
          <button type="button" data-testid="to-en" onClick={() => setLocale('en')}>en</button>
          <MessageCenter />
        </>
      );
    }

    render(
      <I18nProvider initial="zh-CN">
        <Harness />
      </I18nProvider>,
    );
    await waitFor(() => expect(messageCalls).toBeGreaterThan(0));
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    const target = await screen.findByRole('button', { name: /bilingual-row/ });
    await new Promise((r) => setTimeout(r, 30));

    // The read parks on its POST, then the language changes and the new-locale
    // sync publishes a snapshot of its own.
    post.armed = true;
    fireEvent.click(target);
    await waitFor(() => expect(post.release).not.toBeNull());
    const before = messageCalls;
    fireEvent.click(screen.getByTestId('to-en'));
    await waitFor(() => expect(messageCalls).toBeGreaterThan(before));

    // Only now does the read land, carrying the previous locale.
    post.release!();
    await new Promise((r) => setTimeout(r, 40));

    // A remount inside the window must not resurrect the badge.
    cleanup();
    const counts: number[] = [];
    render(
      <I18nProvider initial="en">
        <MessageCenter
          hideTrigger
          open={false}
          onOpenChange={() => {}}
          onUnreadCountChange={(n) => counts.push(n)}
        />
      </I18nProvider>,
    );
    await waitFor(() => expect(counts.length).toBeGreaterThan(0));
    expect(counts[counts.length - 1]).toBe(0);
  });

  it('does not render the previous account\'s rows when the authority ends mid-pull', async () => {
    // A remote or expired session is observed by status polling, not by the
    // sign-out handler, so the workspace generation never moves. Refusing the
    // run\'s SNAPSHOT is not enough on its own — component state is committed
    // first, so the rows, the signed-in flag and the announcement would render
    // in the still-mounted host and a refused publication cannot take them back.
    // Every pull after the first is parked. The post-boundary resync is what
    // used to refill the view and mask which mechanism was doing the work —
    // with it held, the three states are distinguishable: cleared and kept
    // clear, never cleared, or cleared and re-filled by the stale run.
    let parkPulls = false;
    const parked: Array<() => void> = [];
    // The upstream answers according to the session that was valid when the
    // request went out — the targeted row belongs to the ACCOUNT. A stub that
    // returns it either way lets the post-boundary resync put it straight back,
    // and the spec then fails no matter what the code does.
    let sessionValid = true;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: sessionValid });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        const answeredFor = sessionValid;
        if (parkPulls) {
          await new Promise<void>((resolve) => { parked.push(resolve); });
        }
        if (!answeredFor) return Response.json({ messages: [], nextCursor: null, unreadCount: 0 });
        return Response.json({
          messages: [{
            ...row('PRIOR-ACCOUNT-row', null),
            audienceType: 'targeted',
            messageKey: 'go-plan-sunset-2026-08',
          }],
          nextCursor: null,
          unreadCount: 1,
        });
      }
      return Response.json({});
    }));

    const pending: boolean[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter
          priorityAnnouncementActive
          onPriorityAnnouncementPendingChange={(v) => pending.push(v)}
        />
      </I18nProvider>,
    );
    await waitFor(() => expect(messageCalls).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 30));

    // A refresh parks on its pull while the session is still valid.
    parkPulls = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(parked.length).toBe(1));

    // Polling elsewhere observes the session ending. No generation change.
    sessionValid = false;
    noteAuthoritativeAuthMode(false);

    // The boundary's own resync is parked too, so nothing refills the view.
    await new Promise((r) => setTimeout(r, 30));

    // The stale pull lands.
    parked[0]!();
    await new Promise((r) => setTimeout(r, 40));

    // The still-mounted host must show nothing of that account.
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('button', { name: /PRIOR-ACCOUNT-row/ })).toBeNull();
    expect(pending[pending.length - 1] ?? false).toBe(false);
  });

  it('does not publish an auth read that was overtaken by the app\'s newer one', async () => {
    // The other direction of the same race. This component reads the auth mode
    // itself and publishes what it got, so ordering it only against its own
    // previous reads leaves it free to overwrite a NEWER answer that the app's
    // status effect published while this read was on the wire — taking the
    // authority back to a session that has ended.
    let releaseStatus!: () => void;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        await new Promise<void>((resolve) => { releaseStatus = resolve; });
        return Response.json({ loggedIn: true });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        return Response.json({ messages: [], nextCursor: null, unreadCount: 0 });
      }
      return Response.json({});
    }));

    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter />
      </I18nProvider>,
    );
    await waitFor(() => expect(releaseStatus).toBeTypeOf('function'));

    // The app's status effect answers first, with a newer read: the session has
    // ended. This is the call `applyAmrLoginStatus` makes.
    expect(noteAuthoritativeAuthMode(false, issueStatusObservation())).toBe(true);

    // This component's older read finally comes back saying signed-in.
    releaseStatus();
    await new Promise((r) => setTimeout(r, 40));

    expect(currentAuthoritativeLoggedIn()).toBe(false);
  });

  it('does not commit a pull that was answered for a session which has since ended', async () => {
    // The sibling spec above releases the held pull after the boundary effect
    // has run. That effect issues a fresh sync, whose request id supersedes the
    // held run\'s, so the held run bails on identity and nothing it fetched can
    // reach the host. That is the ordering the earlier version of this spec
    // exercised, and it is covered without any new code.
    //
    // The effect only issues that sync when there is nothing to join. On the
    // FIRST pull of the process there is no published snapshot yet, so
    // `noteAuthoritativeAuthMode` has nothing to compare against and leaves
    // `inFlightSync` alone; the effect then JOINS the held signed-in run
    // instead of replacing it. Its request id, its workspace generation and its
    // captured account are all still current when it lands, so it commits the
    // previous account\'s rows and its targeted announcement into a host that
    // has already been told the session ended. Refusing its snapshot afterwards
    // cannot take those host-local writes back.
    //
    // Reachable as: the app opens, the message centre\'s first pull is on the
    // wire, and status polling observes a revoked or expired session.
    const parked: Array<() => void> = [];
    let sessionValid = true;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: sessionValid });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        const answeredFor = sessionValid;
        await new Promise<void>((resolve) => { parked.push(resolve); });
        if (!answeredFor) return Response.json({ messages: [], nextCursor: null, unreadCount: 0 });
        return Response.json({
          messages: [{
            ...row('PRIOR-ACCOUNT-row', null),
            audienceType: 'targeted',
            messageKey: 'go-plan-sunset-2026-08',
          }],
          nextCursor: null,
          unreadCount: 1,
        });
      }
      return Response.json({});
    }));

    const pending: boolean[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter
          priorityAnnouncementActive
          onPriorityAnnouncementPendingChange={(v) => pending.push(v)}
        />
      </I18nProvider>,
    );
    // The very first pull, held on the wire with no snapshot behind it.
    await waitFor(() => expect(parked.length).toBe(1));

    // Everything from here is what the host may show once the session is over.
    const afterBoundary = pending.length;
    sessionValid = false;
    noteAuthoritativeAuthMode(false);
    // Let the boundary effect run. With nothing to adopt and a run to join, it
    // joins — the held run stays the current one.
    await new Promise((r) => setTimeout(r, 30));

    parked[0]!();
    await new Promise((r) => setTimeout(r, 40));

    expect(pending.slice(afterBoundary)).not.toContain(true);
    fireEvent.click(screen.getByTestId('message-center-trigger'));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('button', { name: /PRIOR-ACCOUNT-row/ })).toBeNull();
  });

  it('does not re-sync when it is remounted straight away', async () => {
    const first = await mountAndSettle();
    const afterFirst = { status: statusCalls, messages: messageCalls };
    first.unmount();

    mount();
    // Give the mount effect a turn; nothing new may go out.
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 20));

    expect(statusCalls).toBe(afterFirst.status);
    expect(messageCalls).toBe(afterFirst.messages);
  });

  it('does not stampede when a remount lands while a sync is still in flight', async () => {
    // Found in a real browser, not by reading: a route switch unmounts the
    // outgoing host and mounts the incoming one within the same frame, so the
    // second mount starts BEFORE the first sync has written its snapshot.
    // Sequential dedupe alone misses that case entirely — measured four syncs
    // for one project<->home round trip.
    let release: (value: Response) => void = () => {};
    const gate = new Promise<Response>((r) => { release = r; });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: false });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        return gate;
      }
      return Response.json({});
    }));

    const first = mount();
    await waitFor(() => expect(messageCalls).toBe(1));

    // Second host mounts while the first pull is still open.
    const second = mount();
    await new Promise((r) => setTimeout(r, 20));
    expect(messageCalls).toBe(1);

    release(Response.json({ messages: [], nextCursor: null, unreadCount: 0 }));
    await waitFor(() => expect(messageCalls).toBe(1));
    first.unmount();
    second.unmount();
  });

  it('syncs again once the snapshot window has passed', async () => {
    const first = await mountAndSettle();
    const afterFirst = messageCalls;
    first.unmount();

    // 10s window; jump past it without waiting for real time.
    const realNow = Date.now;
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 11_000);

    mount();
    await waitFor(() => expect(messageCalls).toBeGreaterThan(afterFirst));
  });

  it('never adopts a snapshot from the previous account', async () => {
    // A sign-out/sign-in makes the previous account's messages inadmissible no
    // matter how recent they are.
    const first = await mountAndSettle();
    const afterFirst = messageCalls;
    first.unmount();

    advanceWorkspaceAccountGeneration('message-center-remount-boundary');

    mount();
    await waitFor(() => expect(messageCalls).toBeGreaterThan(afterFirst));
  });

  it('never adopts a response that was fetched before an account boundary', async () => {
    // The generation must be captured when the sync STARTS. Stamping the
    // snapshot at completion labels a pre-boundary response with the new
    // account's generation, and a post-boundary mount then renders the previous
    // account's messages as current.
    let release: (value: Response) => void = () => {};
    const gate = new Promise<Response>((r) => { release = r; });
    let pulls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: false });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        pulls += 1;
        messageCalls += 1;
        if (pulls === 1) return gate;
        return Response.json({ messages: [], nextCursor: null, unreadCount: 0 });
      }
      return Response.json({});
    }));

    const first = mount();
    await waitFor(() => expect(pulls).toBe(1));

    // Sign-out/sign-in lands while the first pull is still open.
    advanceWorkspaceAccountGeneration('mid-flight-boundary');
    release(Response.json({
      messages: [{ id: 'stale', title: 'previous account', readAt: null }],
      nextCursor: null,
      unreadCount: 1,
    }));
    await new Promise((r) => setTimeout(r, 20));
    first.unmount();

    // A mount after the boundary must fetch rather than adopt that response.
    mount();
    await waitFor(() => expect(pulls).toBeGreaterThan(1));
  });

  it('keeps a message read after marking it and remounting', async () => {
    // `markRead` updates component state; the module snapshot was left holding
    // the pre-read rows, so a project<->home switch inside the window restored
    // the unread count until the next network sync. The count is the
    // component's own contract (`onUnreadCountChange`), so assert on that.
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: false });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        if ((init?.method ?? 'GET') !== 'GET') return Response.json({});
        messageCalls += 1;
        return Response.json({
          messages: [{
            id: 'm1',
            title: 'unread one',
            body: 'b',
            typeName: 't',
            publishedAt: '2026-08-01T00:00:00.000Z',
            readAt: null,
          }],
          nextCursor: null,
          unreadCount: 1,
        });
      }
      return Response.json({});
    }));

    const firstCounts: number[] = [];
    const view = render(
      <I18nProvider initial="zh-CN">
        <MessageCenter hideTrigger open onOpenChange={() => {}} onUnreadCountChange={(n) => firstCounts.push(n)} />
      </I18nProvider>,
    );
    const row = await screen.findByText('unread one');
    await waitFor(() => expect(firstCounts.at(-1)).toBe(1));

    fireEvent.click(row.closest('button') as HTMLButtonElement);
    await waitFor(() => expect(firstCounts.at(-1)).toBe(0));
    view.unmount();

    const secondCounts: number[] = [];
    render(
      <I18nProvider initial="zh-CN">
        <MessageCenter hideTrigger open onOpenChange={() => {}} onUnreadCountChange={(n) => secondCounts.push(n)} />
      </I18nProvider>,
    );
    await waitFor(() => expect(secondCounts.length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 30));
    expect(secondCounts.at(-1)).toBe(0);
  });

  it('does not serve the previous locale\'s rows after a language switch', async () => {
    // `pullMessageCenter` asks the server for locale-specific fields, so a
    // snapshot is only valid for the language it was fetched under. Changing
    // language re-runs the mount effect (via `sync`'s identity); without the
    // locale in the key that re-run adopts the old language's rows and the
    // panel stays in the wrong language until an open, a visibility refresh or
    // the 60s poll.
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/integrations/vela/status')) {
        statusCalls += 1;
        return Response.json({ loggedIn: false });
      }
      if (url.includes('/message-center') && url.includes('/messages')) {
        messageCalls += 1;
        const locale = new URL(url, 'http://x').searchParams.get('locale') || '?';
        seen.push(locale);
        return Response.json({
          messages: [{
            id: 'm1',
            title: `row for ${locale}`,
            body: 'b',
            typeName: 't',
            publishedAt: '2026-08-01T00:00:00.000Z',
            readAt: null,
          }],
          nextCursor: null,
          unreadCount: 1,
        });
      }
      return Response.json({});
    }));

    // `I18nProvider` seeds its locale from `initial` once, so switching has to
    // go through the provider's own `setLocale`.
    function Harness() {
      const { setLocale } = useI18n();
      return (
        <>
          <button type="button" data-testid="to-en" onClick={() => setLocale('en')}>en</button>
          {/* Closed on purpose: the `open` effect re-runs on any `retrySync`
              identity change and would fetch regardless of the snapshot logic,
              hiding the defect this pins. */}
          <MessageCenter hideTrigger open={false} onOpenChange={() => {}} />
        </>
      );
    }

    render(
      <I18nProvider initial="zh-CN">
        <Harness />
      </I18nProvider>,
    );
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    const firstLocale = seen[0];

    fireEvent.click(screen.getByTestId('to-en'));

    // The mount effect must fetch for the new locale rather than adopt the
    // previous language's snapshot.
    await waitFor(() => expect(seen.some((l) => l !== firstLocale)).toBe(true));
  });

  it('still syncs when the panel is opened', async () => {
    // The snapshot only answers the MOUNT question. Opening the panel is a
    // user asking for the current state and must go to the network.
    const view = await mountAndSettle();
    const afterFirst = messageCalls;

    view.rerender(
      <I18nProvider initial="zh-CN">
        <MessageCenter hideTrigger open onOpenChange={() => {}} />
      </I18nProvider>,
    );

    await waitFor(() => expect(messageCalls).toBeGreaterThan(afterFirst));
  });
});
