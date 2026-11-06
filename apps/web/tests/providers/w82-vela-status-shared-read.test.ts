// Red-spec (W82 item 2): `GET /api/integrations/vela/status` was the single
// most-repeated endpoint of a cold conversation open — 7 requests.
//
// Evidence (real browser, tools-dev on 127.0.0.1:17573, one cold load of
// /projects/<id>/conversations/<id>/files/<file>, `window.fetch` wrapped to
// record `new Error().stack`):
//
//   t=4372  fetchVelaLoginStatus  ← AppInner.useEffect.sync
//   t=4379  fetchVelaLoginStatus  ← AppInner.useEffect.sync
//   t=4472  fetchVelaLoginStatus  ← AppInner.useEffect.sync
//   t=4528  isAmrLoggedIn         ← MessageCenter.retrySync
//   t=4530  isAmrLoggedIn         ← MessageCenter.retrySync
//   t=5628  fetchVelaLoginStatus  ← ChatPane.refreshInlineAmrLoginStatus
//   t=5638  fetchVelaLoginStatus  ← ChatPane.refreshInlineAmrLoginStatus
//
// Three INDEPENDENT owners asking the daemon the same question, each of them
// also replayed by its own effect. No single owner can drop its read — App
// drives analytics identity and model refresh, MessageCenter drives its
// signed-in/anonymous message split, ChatPane drives the inline sign-in pill —
// so the fix is a shared TRANSPORT read they sit on, not one owner borrowing
// another's state.
//
// TWO of the three share it. `isAmrLoggedIn` deliberately does not, and the
// last case here pins why: `MessageCenter` also calls it from
// `resolveLoggedInForWrite`, immediately before POSTing a read-receipt. That
// is an AUTHORITY question, not a display read, and joining a request issued
// moments earlier answers it with the state from before the user signed in —
// `tests/components/MessageCenter.test.tsx` ("re-checks auth on write after an
// anonymous mount") goes red when it joins. Splitting the Message Center's
// display read from its write-authority read is the way to reclaim those two,
// and it belongs in `MessageCenter.tsx`, which is the only place that can tell
// the two callers apart.
//
// The contract pinned here is single-flight with NOTHING retained:
//   * overlapping readers of the same URL share one request;
//   * a reader that starts after the previous one settled issues its own;
//   * `?refresh=1` is a different URL and therefore a different key, so
//     ChatPane's forced refresh stays a genuinely forced refresh;
//   * the account generation is part of the key, so a read issued before a
//     sign-out/sign-in boundary can never be joined by a reader after it;
//   * a pre-write authority check never joins anything.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchVelaLoginStatus } from '../../src/providers/daemon';
import { isAmrLoggedIn } from '../../src/message-center-client';
import {
  advanceWorkspaceAccountGeneration,
  resetWorkspaceAccountGeneration,
} from '../../src/collab/workspace-identity';

const fetchCalls: string[] = [];
let release: Array<() => void> = [];
let nextBody: unknown = { loggedIn: true, consoleOrigin: 'https://console.example' };
let nextStatus = 200;

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone: () => response(status, body),
  } as unknown as Response;
}

// Hold every response open until the test releases it, so a second caller
// genuinely overlaps the first on the wire — the shape measured in the browser
// (2-10ms apart against a 16-730ms server).
const blockingFetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
  fetchCalls.push(String(input));
  await new Promise<void>((resolve) => {
    release.push(resolve);
  });
  return response(nextStatus, nextBody);
});

beforeEach(() => {
  fetchCalls.length = 0;
  release = [];
  nextStatus = 200;
  nextBody = { loggedIn: true, consoleOrigin: 'https://console.example' };
  blockingFetch.mockClear();
  resetWorkspaceAccountGeneration();
  vi.stubGlobal('fetch', blockingFetch);
});

afterEach(() => {
  release.forEach((resolve) => resolve());
  vi.unstubAllGlobals();
  resetWorkspaceAccountGeneration();
});

const statusCalls = (): string[] =>
  fetchCalls.filter((url) => url.includes('/api/integrations/vela/status'));

/** Let every caller reach `fetch` before any response is delivered. */
async function allInFlight(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function releaseAll(): void {
  release.forEach((resolve) => resolve());
  release = [];
}

describe('vela login status: three owners, one in-flight read', () => {
  it('collapses App and ChatPane into a single request', async () => {
    const app = fetchVelaLoginStatus();
    const chatPane = fetchVelaLoginStatus();
    await allInFlight();

    expect(statusCalls()).toHaveLength(1);

    releaseAll();
    await expect(app).resolves.toMatchObject({ loggedIn: true });
    await expect(chatPane).resolves.toMatchObject({ loggedIn: true });
  });

  it('collapses an owner replayed three times into a single request', async () => {
    // App's mount effect fired three times on the measured open (t=4372, 4379,
    // 4472), each replay landing while the previous request was still open.
    const reads = [fetchVelaLoginStatus(), fetchVelaLoginStatus(), fetchVelaLoginStatus()];
    await allInFlight();

    expect(statusCalls()).toHaveLength(1);

    releaseAll();
    await Promise.all(reads);
  });

  it('keeps a pre-write authority check on its own request', async () => {
    // Reverse control, and the reason `isAmrLoggedIn` is not on the shared
    // reader. MessageCenter asks this immediately before POSTing a read
    // receipt; an answer issued before the user signed in would route the
    // receipt to localStorage instead of the account.
    const ambient = fetchVelaLoginStatus();
    const beforeWrite = isAmrLoggedIn();
    await allInFlight();

    expect(statusCalls()).toHaveLength(2);

    releaseAll();
    await expect(ambient).resolves.toMatchObject({ loggedIn: true });
    await expect(beforeWrite).resolves.toBe(true);
  });

  it('keeps ChatPane\'s forced refresh a real forced refresh', async () => {
    // Reverse control for the fix: `{ refresh: true }` must NOT be answered by
    // an ambient read that is already in flight — that read asked the daemon
    // for its cached projection, and the forced one exists to make the daemon
    // re-probe after the user came back from the browser sign-in.
    const ambient = fetchVelaLoginStatus();
    const forced = fetchVelaLoginStatus({ refresh: true });
    await allInFlight();

    expect(statusCalls()).toHaveLength(2);
    expect(statusCalls().some((url) => url.includes('refresh=1'))).toBe(true);
    expect(statusCalls().some((url) => !url.includes('refresh=1'))).toBe(true);

    releaseAll();
    await Promise.all([ambient, forced]);
  });

  it('retains nothing once a read settles: the next reader hits the network', async () => {
    // The staleness guard. A shared *cache* would answer the second read from
    // the first read's body; in-flight sharing must not.
    const first = fetchVelaLoginStatus();
    await allInFlight();
    releaseAll();
    await first;

    const second = fetchVelaLoginStatus();
    await allInFlight();
    expect(statusCalls()).toHaveLength(2);

    releaseAll();
    await second;
  });

  it('never lets a post-sign-in reader join a pre-sign-in request', async () => {
    // The scope guard. This endpoint carries no workspace headers — it is an
    // ACCOUNT-level projection — so the account boundary is the whole of its
    // identity. A sign-out/sign-in can leave the URL byte-identical while the
    // authority behind it changed, and a joined answer would report the
    // previous account's session as the new one's.
    const beforeBoundary = fetchVelaLoginStatus();
    await allInFlight();
    expect(statusCalls()).toHaveLength(1);

    advanceWorkspaceAccountGeneration('signed-in-as-someone-else');
    const afterBoundary = fetchVelaLoginStatus();
    await allInFlight();
    expect(statusCalls()).toHaveLength(2);

    releaseAll();
    await Promise.all([beforeBoundary, afterBoundary]);
  });

  it('preserves each owner\'s failure mapping', async () => {
    // Reverse control: sharing the transport must not merge the owners'
    // semantics. `fetchVelaLoginStatus` swallows everything into `null`;
    // MessageCenter depends on the THROW to show its retry state.
    nextStatus = 500;
    nextBody = { error: 'boom' };

    const app = fetchVelaLoginStatus();
    const messageCenter = isAmrLoggedIn();
    await allInFlight();
    releaseAll();

    await expect(app).resolves.toBeNull();
    await expect(messageCenter).rejects.toThrow(/AMR status failed: 500/);
  });

  it('still reads amr-runtime-unavailable out of a 503', async () => {
    nextStatus = 503;
    nextBody = { error: 'amr-runtime-unavailable' };

    const app = fetchVelaLoginStatus();
    const messageCenter = isAmrLoggedIn();
    await allInFlight();
    releaseAll();

    await expect(app).resolves.toBeNull();
    await expect(messageCenter).resolves.toBe(false);
  });
});
