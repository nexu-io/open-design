// Generic stale-while-revalidate cache. After the first load every call
// returns the last value for the key immediately and only kicks a background
// refresh once it is older than `freshMs`; concurrent callers coalesce onto
// the in-flight fetch. Keyed so a workspace switch (or any other key change)
// is an automatic miss.
//
// Extracted out of server.ts (where every SWR-cached read in the daemon used
// to redeclare this inline) so `invalidate()` is a property of the primitive
// itself instead of something each call site has to bolt on by hand — see
// `cachedTeamResourceList` in server.ts, which forgot to and left share/
// unshare with no way to drop the stale entry it just created (the team
// design-system/plugin/skill lists took up to `freshMs` — or the client's
// slower background poll once SSE lowers its cadence — to catch up).
// `teamProjectsDisplayCache` in server.ts is the sibling precedent: it wraps
// its OWN hand-rolled SWR loop in an equivalent `Object.assign(read, {
// invalidate })`.

export interface SwrCache<T> {
  (): Promise<T>;
  /**
   * Drop the cached value for the key last used, so the next read is a real
   * fetch instead of the stale one. Only needed for the moments a caller KNOWS
   * the underlying data changed (a local mutation, a hub push) — correctness
   * does not depend on it, since the fetcher will naturally refresh once
   * `freshMs` elapses, but without it a just-made change can take up to that
   * long (or longer, behind a slower client poll) to become visible.
   *
   * Safe to call while a background refresh is already in flight: that
   * refresh's result is keyed against the pre-invalidate entry identity, so it
   * is discarded on landing instead of clobbering whatever the post-invalidate
   * read produces.
   */
  invalidate(): void;
}

export function createSwrCache<T>(
  fetcher: () => Promise<T>,
  keyFn: () => string,
  freshMs: number,
): SwrCache<T> {
  let entry: { key: string; value: T | null; settledAt: number; inflight: Promise<T> | null } | null = null;
  const refresh = (key: string) => {
    if (!entry || entry.key !== key) entry = { key, value: null, settledAt: 0, inflight: null };
    const cur = entry;
    const p = fetcher();
    cur.inflight = p;
    p.then(
      (value) => {
        if (entry === cur) {
          cur.value = value;
          cur.settledAt = Date.now();
          cur.inflight = null;
        }
      },
      () => {
        if (entry === cur) {
          cur.inflight = null;
          if (cur.value === null) entry = null;
        }
      },
    );
    return p;
  };
  const read = (): Promise<T> => {
    const key = keyFn();
    if (!entry || entry.key !== key) return refresh(key);
    if (entry.value !== null) {
      const cached = entry.value;
      if (!entry.inflight && Date.now() - entry.settledAt >= freshMs) void refresh(key).catch(() => {});
      return Promise.resolve(cached);
    }
    return entry.inflight ?? refresh(key);
  };
  return Object.assign(read, {
    invalidate() {
      entry = null;
    },
  });
}
