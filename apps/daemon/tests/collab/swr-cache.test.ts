import { describe, expect, it } from 'vitest';
import { createSwrCache } from '../../src/collab/swr-cache.js';

// Generic stale-while-revalidate primitive shared by every SWR-cached read in
// the daemon (team-project catalog, team member roster, and — the bug this
// file exists to pin down — the team design-system/plugin/skill listing). The
// `invalidate()` tests are the load-bearing ones: without it, a local mutation
// (share/unshare) had no way to drop the entry it just made stale, so the
// caller who just mutated the data read their own pre-mutation write back for
// up to `freshMs`.

describe('createSwrCache', () => {
  it('reuses the cached value for repeat reads inside freshMs', async () => {
    let calls = 0;
    const cache = createSwrCache(async () => { calls += 1; return calls; }, () => 'k', 3000);

    await expect(cache()).resolves.toBe(1);
    await expect(cache()).resolves.toBe(1);
    await expect(cache()).resolves.toBe(1);

    expect(calls).toBe(1);
  });

  it('coalesces concurrent callers onto the same in-flight fetch', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const cache = createSwrCache(async () => {
      calls += 1;
      await gate;
      return 'settled';
    }, () => 'k', 3000);

    const a = cache();
    const b = cache();
    release();

    await expect(a).resolves.toBe('settled');
    await expect(b).resolves.toBe('settled');
    expect(calls).toBe(1);
  });

  it('treats a key change as an automatic miss', async () => {
    let key = 'workspace-a';
    let calls = 0;
    const cache = createSwrCache(async () => { calls += 1; return key; }, () => key, 3000);

    await expect(cache()).resolves.toBe('workspace-a');
    expect(calls).toBe(1);

    key = 'workspace-b';
    await expect(cache()).resolves.toBe('workspace-b');
    expect(calls).toBe(2);
  });

  it('serves the stale value immediately and refreshes in the background once past freshMs', async () => {
    let calls = 0;
    let value = 'v1';
    const cache = createSwrCache(async () => { calls += 1; return value; }, () => 'k', 0);

    await expect(cache()).resolves.toBe('v1');
    expect(calls).toBe(1);

    // freshMs=0: the very next read is already "stale", so it is served the
    // last known value synchronously AND kicks a background refresh.
    value = 'v2';
    await expect(cache()).resolves.toBe('v1');
    expect(calls).toBe(2);

    // Let the background refresh's microtask land.
    await Promise.resolve();
    await Promise.resolve();
    await expect(cache()).resolves.toBe('v2');
  });

  it('does not poison the cache with a failed fetch — the next read retries', async () => {
    let calls = 0;
    const cache = createSwrCache<string>(async () => {
      calls += 1;
      if (calls === 1) throw new Error('transient hub outage');
      return 'recovered';
    }, () => 'k', 3000);

    await expect(cache()).rejects.toThrow('transient hub outage');
    await expect(cache()).resolves.toBe('recovered');
    expect(calls).toBe(2);
  });

  // The actual bug: `cachedTeamResourceList` in server.ts wraps this primitive
  // and, before this fix, had no way to tell it a local share/unshare just
  // changed the underlying data. The route's response is what makes the client
  // refetch — without invalidate() that refetch read the pre-change list
  // straight out of here for up to freshMs (3s in production), so a shared
  // design system/plugin/skill did not show up in the team list until a later
  // poll tick.
  it('invalidate() forces a real fetch on the very next read, even inside freshMs', async () => {
    let calls = 0;
    let value = 'before-share';
    const cache = createSwrCache(async () => { calls += 1; return value; }, () => 'k', 3000);

    await expect(cache()).resolves.toBe('before-share');
    expect(calls).toBe(1);

    // The share lands: the underlying data changed, but freshMs (3000ms) has
    // not elapsed. Without invalidate() this proves the cache really would
    // still serve the stale value.
    value = 'after-share';
    await expect(cache()).resolves.toBe('before-share');
    expect(calls).toBe(1);

    cache.invalidate();
    await expect(cache()).resolves.toBe('after-share');
    expect(calls).toBe(2);
  });

  it('invalidate() discards a background refresh that was already in flight, instead of letting it repopulate the cache', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    // freshMs=0 so the second read below immediately kicks a background
    // refresh, which we hold open on `gate` to simulate it still being in
    // flight when invalidate() runs.
    const cache = createSwrCache<string>(async () => {
      calls += 1;
      const call = calls;
      if (call === 2) await gate;
      return `value-${call}`;
    }, () => 'k', 0);

    await expect(cache()).resolves.toBe('value-1');
    expect(calls).toBe(1);

    // Kicks the held background refresh (call #2) but still returns the
    // synchronously-cached value.
    await expect(cache()).resolves.toBe('value-1');
    expect(calls).toBe(2);

    // A share/unshare invalidates while call #2 is still in flight.
    cache.invalidate();
    release();
    // Let the held promise's continuation run.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The discarded call #2 must not have repopulated the cache: this read is
    // a brand new fetch (#3), not the stale-but-in-flight #2 value.
    await expect(cache()).resolves.toBe('value-3');
    expect(calls).toBe(3);
  });

  it('invalidate() is safe to call before any read has happened', () => {
    const cache = createSwrCache(async () => 'v', () => 'k', 3000);
    expect(() => cache.invalidate()).not.toThrow();
  });

  it('leaves an unrelated cache instance unaffected by another instance calling invalidate()', async () => {
    let aCalls = 0;
    let bCalls = 0;
    const cacheA = createSwrCache(async () => { aCalls += 1; return 'a'; }, () => 'k', 3000);
    const cacheB = createSwrCache(async () => { bCalls += 1; return 'b'; }, () => 'k', 3000);

    await cacheA();
    await cacheB();
    cacheA.invalidate();
    await cacheB();

    expect(aCalls).toBe(1);
    expect(bCalls).toBe(1);
  });
});
