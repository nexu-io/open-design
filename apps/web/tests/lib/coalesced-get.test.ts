import { describe, expect, it } from 'vitest';
import { coalescedGet, forceCoalescedGet } from '../../src/lib/coalesced-get';

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('coalescedGet', () => {
  it('joins concurrent identical calls into one run (single-flight)', async () => {
    let runs = 0;
    let release!: (v: number) => void;
    const gate = new Promise<number>((r) => {
      release = r;
    });
    const run = () => {
      runs += 1;
      return gate;
    };

    // Both callers arrive while the request is in flight → one run, shared value.
    const a = coalescedGet('k-inflight', run);
    const b = coalescedGet('k-inflight', run);
    release(42);
    expect(await a).toBe(42);
    expect(await b).toBe(42);
    expect(runs).toBe(1);
  });

  it('shares the settled result within the TTL window', async () => {
    let runs = 0;
    const run = () => {
      runs += 1;
      return Promise.resolve(runs);
    };

    const first = await coalescedGet('k-ttl', run, 1000);
    const second = await coalescedGet('k-ttl', run, 1000);
    expect(first).toBe(1);
    expect(second).toBe(1); // served from the shared window, not a second run
    expect(runs).toBe(1);
  });

  it('refetches after the TTL window elapses', async () => {
    let runs = 0;
    const run = () => {
      runs += 1;
      return Promise.resolve(runs);
    };

    expect(await coalescedGet('k-expire', run, 20)).toBe(1);
    await tick(40);
    expect(await coalescedGet('k-expire', run, 20)).toBe(2);
    expect(runs).toBe(2);
  });

  it('never caches a rejection — the next caller retries', async () => {
    let runs = 0;
    const run = () => {
      runs += 1;
      return runs === 1 ? Promise.reject(new Error('boom')) : Promise.resolve('ok');
    };

    await expect(coalescedGet('k-reject', run)).rejects.toThrow('boom');
    // Immediately after the failure the entry is gone, so this re-runs.
    expect(await coalescedGet('k-reject', run)).toBe('ok');
    expect(runs).toBe(2);
  });

  it('keys independently — different keys do not share results', async () => {
    const a = await coalescedGet('k-a', () => Promise.resolve('a'));
    const b = await coalescedGet('k-b', () => Promise.resolve('b'));
    expect(a).toBe('a');
    expect(b).toBe('b');
  });
});

describe('forceCoalescedGet', () => {
  // Multiple mounted consumers reacting to the SAME broadcast identity-change
  // event (e.g. every mounted `useWorkspaceContext()` instance hearing one
  // `notifyWorkspaceContextRefresh()`) call this back-to-back in the same
  // synchronous dispatch pass. That whole burst must collapse to one real
  // fetch — the exact scenario a naive evictCoalescedGet()+coalescedGet() at
  // each call site gets wrong (each eviction destroys the fetch the previous
  // call in the burst just started).
  it('collapses a synchronous multi-caller burst into a single run', async () => {
    let runs = 0;
    const run = () => {
      runs += 1;
      return Promise.resolve(runs);
    };

    // Simulates N mounted consumers all reacting to one event in the same tick.
    const [a, b, c] = [
      forceCoalescedGet('k-burst', run),
      forceCoalescedGet('k-burst', run),
      forceCoalescedGet('k-burst', run),
    ];
    expect(await a).toBe(1);
    expect(await b).toBe(1);
    expect(await c).toBe(1);
    expect(runs).toBe(1);
  });

  it('still evicts a settled cache entry so a genuinely fresh read replaces stale data', async () => {
    let runs = 0;
    const run = () => {
      runs += 1;
      return Promise.resolve(runs);
    };

    // A normal (non-forced) read settles and would normally be served from
    // the TTL-shared cache...
    expect(await coalescedGet('k-force-evict', run, 10_000)).toBe(1);
    // ...but a forced call must bypass that cache instead of reusing the
    // stale answer, even though it is well within the TTL window.
    expect(await forceCoalescedGet('k-force-evict', run, 10_000)).toBe(2);
    expect(runs).toBe(2);
  });

  it('joins rather than evicts a still-in-flight forced fetch from a prior burst caller', async () => {
    let runs = 0;
    let release!: (v: number) => void;
    const gate = new Promise<number>((resolve) => {
      release = resolve;
    });
    const run = () => {
      runs += 1;
      return gate;
    };

    const first = forceCoalescedGet('k-inflight-force', run);
    const second = forceCoalescedGet('k-inflight-force', run);
    release(42);
    expect(await first).toBe(42);
    expect(await second).toBe(42);
    expect(runs).toBe(1);
  });

  it('evicts again for a force call outside the burst window, unlike an ordinary coalesced call', async () => {
    let runs = 0;
    const run = () => {
      runs += 1;
      return Promise.resolve(runs);
    };

    expect(await forceCoalescedGet('k-later-force', run, 10_000)).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 300));
    // A second, genuinely later forced call (e.g. sign-out then sign-in
    // again) is outside the burst-collapsing window and must refetch.
    expect(await forceCoalescedGet('k-later-force', run, 10_000)).toBe(2);
    expect(runs).toBe(2);
  });
});
