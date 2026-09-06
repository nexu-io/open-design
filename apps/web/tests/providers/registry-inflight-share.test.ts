// Red-spec: one conversation page issued 158 requests, 32 of them duplicates
// of a URL already in flight.
//
// Evidence (real browser, tools-dev namespace `chatpanel`, one cold open of
// /projects/<id>/conversations/<id>, `window.fetch` wrapped to record
// `new Error().stack` — see the W68 attribution table):
//
//   GET /api/editors                        ×2, 1ms apart, both from HandoffButton.useEffect
//   GET /api/projects/<id>/deployments      ×2, 6ms apart, both from HtmlViewer.useEffect
//   GET /api/projects/<id>/folders          ×2, 2ms apart, both from FileWorkspace.useEffect
//   GET /api/health                         ×2, 4ms apart, both from AppInner.useEffect
//
// Each pair is ONE call site firing twice (React StrictMode replays mount
// effects in dev; a dependency settling replays them in prod), and the second
// call always starts while the first is still on the wire. The daemon answers
// each in 3-7ms, so these are not slow requests — they are extra occupants of
// the browser's ~6-connection-per-host budget, which is what pushed the tail
// of this page's request list past 20s.
//
// The contract under test is deliberately narrower than a cache: a reader
// JOINS a request for the same key that is still in flight, and nothing is
// retained once it settles. No caller can ever observe a settled result it
// did not itself trigger, so this cannot introduce staleness — it can only
// remove a request that would have been issued and answered concurrently
// with one already open.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  daemonIsLive,
  fetchHostEditors,
  fetchProjectDeployments,
  fetchProjectFolders,
} from '../../src/providers/registry';

const fetchCalls: string[] = [];

/** Resolvers for every request the current test has left open. */
let release: Array<() => void> = [];

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function bodyForUrl(url: string): unknown {
  if (url.includes('/deployments')) return { deployments: [] };
  if (url.includes('/folders')) return { folders: [] };
  if (url.includes('/editors')) return { editors: [] };
  return {};
}

// Hold every response open until the test releases it, so the second caller
// genuinely overlaps the first on the wire — the exact shape measured in the
// browser (1-6ms apart, against a 3-7ms server).
const blockingFetch = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
  const url = String(input);
  fetchCalls.push(url);
  await new Promise<void>((resolve) => {
    release.push(resolve);
  });
  return jsonResponse(bodyForUrl(url));
});

beforeEach(() => {
  fetchCalls.length = 0;
  release = [];
  blockingFetch.mockClear();
  vi.stubGlobal('fetch', blockingFetch);
});

afterEach(() => {
  release.forEach((resolve) => resolve());
  vi.unstubAllGlobals();
});

const callsMatching = (fragment: string): string[] =>
  fetchCalls.filter((url) => url.includes(fragment));

/** Let both callers reach `fetch` before any response is delivered. */
async function bothInFlight(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('registry reads share one in-flight request per key', () => {
  it('issues one GET /api/editors for two overlapping readers', async () => {
    const a = fetchHostEditors();
    const b = fetchHostEditors();
    await bothInFlight();

    expect(callsMatching('/api/editors')).toHaveLength(1);

    release.forEach((resolve) => resolve());
    await expect(a).resolves.toEqual({ editors: [] });
    await expect(b).resolves.toEqual({ editors: [] });
  });

  it('issues one GET /deployments for two overlapping readers', async () => {
    const a = fetchProjectDeployments('proj-dep');
    const b = fetchProjectDeployments('proj-dep');
    await bothInFlight();

    expect(callsMatching('/projects/proj-dep/deployments')).toHaveLength(1);

    release.forEach((resolve) => resolve());
    await expect(a).resolves.toEqual([]);
    await expect(b).resolves.toEqual([]);
  });

  it('issues one GET /folders for two overlapping readers', async () => {
    const a = fetchProjectFolders('proj-fold');
    const b = fetchProjectFolders('proj-fold');
    await bothInFlight();

    expect(callsMatching('/projects/proj-fold/folders')).toHaveLength(1);

    release.forEach((resolve) => resolve());
    await expect(a).resolves.toEqual([]);
    await expect(b).resolves.toEqual([]);
  });

  it('issues one GET /api/health for two overlapping probes', async () => {
    const a = daemonIsLive();
    const b = daemonIsLive();
    await bothInFlight();

    expect(callsMatching('/api/health')).toHaveLength(1);

    release.forEach((resolve) => resolve());
    await expect(a).resolves.toBe(true);
    await expect(b).resolves.toBe(true);
  });

  it('does NOT share across different projects', async () => {
    const a = fetchProjectDeployments('proj-one');
    const b = fetchProjectDeployments('proj-two');
    await bothInFlight();

    expect(callsMatching('/deployments')).toHaveLength(2);

    release.forEach((resolve) => resolve());
    await Promise.all([a, b]);
  });

  it('retains nothing once a read settles: the next reader hits the network', async () => {
    // The staleness guard. A shared *cache* would answer the second read from
    // the first read's body; in-flight sharing must not — a reader that starts
    // after the previous one finished always issues its own request.
    const first = fetchProjectFolders('proj-seq');
    await bothInFlight();
    release.forEach((resolve) => resolve());
    release = [];
    await first;

    const second = fetchProjectFolders('proj-seq');
    await bothInFlight();
    expect(callsMatching('/projects/proj-seq/folders')).toHaveLength(2);

    release.forEach((resolve) => resolve());
    await second;
  });
});
