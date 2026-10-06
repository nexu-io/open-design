import { describe, expect, it } from 'vitest';

import { createSwrCache } from '../src/collab/swr-cache.js';

// `GET /api/workspace/projects/team` is the DISPLAY read: the Home team-project
// grid and the deep-link "is this project shared to my team?" check both go
// through it. Measured against a live vela Team workspace it costs ~1.1s every
// single call — cold and warm alike — because each one spawns
// `vela team-projects list` and waits for a round trip to the API.
//
// server.ts already builds `teamProjectsDisplayCache` for exactly this, and its
// own doc comment names the route:
//
//   "Short-TTL, single-flight cache for the read-only DISPLAY path
//    (GET /api/workspace/projects/team) ... Deliberately NOT used by
//    resolveSharedProject below: the pull gate and comment/presence relays must
//    observe an unshare immediately, so those use the uncached exact lookup."
//
// The uncached lookup is meant for the relay/pull gate. The display route was
// wired to it anyway, so the cache built for it went unused by it.
//
// Freshness does not depend on the TTL alone: the cache is explicitly
// invalidated on share, unshare, and workspace change, so an unshare is still
// visible immediately on the surfaces that matter.
//
// This spec pins the two properties the display path needs from that cache.
describe('team-projects display cache behaviour', () => {
  it('serves repeat display reads within the freshness window from one upstream call', async () => {
    let upstreamCalls = 0;
    const cache = createSwrCache(
      async () => {
        upstreamCalls += 1;
        return [{ projectId: 'p-1' }];
      },
      () => 'scope-a',
      3000,
    );

    await cache();
    await cache();
    await cache();

    // Without the cache this is 3 spawns of `vela team-projects list`, i.e.
    // ~3.3s of round trips for one screen.
    expect(upstreamCalls).toBe(1);
  });

  it('re-reads upstream after an explicit invalidation, so an unshare is not hidden', async () => {
    let upstreamCalls = 0;
    const cache = createSwrCache(
      async () => {
        upstreamCalls += 1;
        return [{ projectId: 'p-1' }];
      },
      () => 'scope-a',
      3000,
    );

    await cache();
    expect(upstreamCalls).toBe(1);

    // share / unshare / workspace-change all call this in server.ts.
    cache.invalidate();
    await cache();

    expect(upstreamCalls).toBe(2);
  });

  it('never shares an entry across scopes', async () => {
    // A workspace switch must not be served another workspace's catalog.
    const seen: string[] = [];
    let scope = 'scope-a';
    const cache = createSwrCache(
      async () => {
        seen.push(scope);
        return [{ projectId: scope }];
      },
      () => scope,
      3000,
    );

    await cache();
    scope = 'scope-b';
    await cache();

    expect(seen).toEqual(['scope-a', 'scope-b']);
  });
});
