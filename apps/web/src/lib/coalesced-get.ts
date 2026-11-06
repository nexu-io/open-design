// Client-side GET coalescer: collapse a burst of identical reads into one
// network request.
//
// Why this exists: many workspace surfaces independently fetch the same read
// endpoint on mount/navigation — the project grid, the recents strip, the
// design-files panel, and every separately-mounted `useWorkspaceContext`
// consumer. Returning to the home view fired ~118 concurrent requests, of which
// the same 8 projects' `/files` appeared 4-6× each and every project's
// `/live-artifacts` twice. With the browser's ~6-connections-per-host cap the
// tail of that burst sat in the connection queue for seconds — measured as
// Σblocked (≈330-494s) an order of magnitude larger than Σserver-wait (≈27-36s).
// The server was not slow; the client simply asked too many times at once.
//
// This helper keys identical in-flight GETs to a single shared promise
// (single-flight, no matter how long the request is queued) and briefly shares
// the settled result, so a mount burst that used to cost N requests costs one.
// It changes no server behavior and is safe only for idempotent display reads
// where sub-second staleness is invisible (covers, thumbnails, the nav shell).

type Entry<T> = { value: Promise<T>; settledAt: number | null };

const entries = new Map<string, Entry<unknown>>();

const nowMs = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

// Long enough to absorb a mount/navigation burst (observed ~300-500ms of
// staggered mounts plus multi-second connection queuing), short enough that an
// explicit reload a second later still hits the network.
const DEFAULT_TTL_MS = 1000;

/**
 * Run `run()` at most once per `key` per burst. While a call is in flight, every
 * identical `key` joins the same promise regardless of how long it is queued.
 * After it settles successfully, callers within `ttlMs` share the cached result;
 * after that window (or on failure) the next caller refetches.
 */
export function coalescedGet<T>(
  key: string,
  run: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const existing = entries.get(key) as Entry<T> | undefined;
  if (existing) {
    // Still in flight → always join, so a slow/queued request never spawns a
    // duplicate. Settled recently → serve the shared result.
    if (existing.settledAt === null) return existing.value;
    if (nowMs() - existing.settledAt < ttlMs) return existing.value;
  }

  const entry: Entry<T> = { value: run(), settledAt: null };
  entries.set(key, entry as Entry<unknown>);
  entry.value.then(
    () => {
      entry.settledAt = nowMs();
      // Evict once the share window passes so long-lived reads stay fresh. Guard
      // against evicting a newer entry that replaced this one.
      setTimeout(() => {
        if (entries.get(key) === (entry as Entry<unknown>)) entries.delete(key);
      }, ttlMs);
    },
    () => {
      // Never cache a failure — the next caller/poll should retry immediately.
      if (entries.get(key) === (entry as Entry<unknown>)) entries.delete(key);
    },
  );
  return entry.value;
}

/**
 * Drop one key's in-flight/settled entry so the next call goes to the network.
 *
 * For callers that KNOW the cached answer is void — an identity change, not a
 * routine revalidation. Coalescing assumes sub-second staleness is invisible,
 * which stops being true the moment the user signs in: the read that just
 * settled describes the previous identity, and sharing it would answer the
 * post-sign-in refresh with the signed-out result it was fired to replace.
 *
 * Evicting an IN-FLIGHT entry is deliberate too — that request may have been
 * issued before the change and cannot see it.
 */
export function evictCoalescedGet(key: string): void {
  entries.delete(key);
}

// Last time `forceCoalescedGet` actually evicted+refetched a given key, keyed
// the same way as `entries`. See `forceCoalescedGet` for why this exists.
const forcedAt = new Map<string, number>();

// A broadcast identity-change event (sign-in success) is heard by every
// mounted consumer of a hook in the SAME synchronous `dispatchEvent` pass —
// e.g. `useWorkspaceContext()` is called from a dozen components that can all
// be mounted at once, and AmrLoginPill alone can mount twice (the Settings
// agent-card instance and the cloud sign-in callout instance both listen and
// both react). Two calls to `forceCoalescedGet` for the same key inside this
// window are the same burst, not two independent identity changes; the
// second must join the first's fetch rather than evict it. Measured in a
// real browser (not jsdom) the two reactions land within single-digit ms of
// each other, but 250ms leaves generous headroom for a loaded machine
// without meaningfully delaying a genuinely later, separate identity change
// (still an order of magnitude under `DEFAULT_TTL_MS`).
const FORCE_BURST_MS = 250;

/**
 * Like `coalescedGet`, but the caller is announcing the cached answer for
 * `key` is void (an identity change) and must be replaced by a fresh read —
 * the forced counterpart of `evictCoalescedGet` + `coalescedGet`.
 *
 * Calling `evictCoalescedGet` then `coalescedGet` directly at every call site
 * that reacts to one broadcast event is unsafe: because those call sites fire
 * synchronously back-to-back within the same event-dispatch pass, each one's
 * eviction destroys the in-flight entry the PREVIOUS call site just started,
 * so N mounted consumers produce N real network requests instead of one
 * shared request for the whole burst — the exact thundering-herd shape
 * `coalescedGet` exists to prevent for ordinary concurrent calls.
 *
 * `forceCoalescedGet` only evicts once per `key` per `FORCE_BURST_MS`; every
 * other forced call for that key inside the window joins the fetch the first
 * call already kicked off. A force call outside the window (a genuinely
 * later, separate identity change) still gets a full evict + fresh fetch.
 */
export function forceCoalescedGet<T>(
  key: string,
  run: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const now = nowMs();
  const last = forcedAt.get(key);
  if (last === undefined || now - last >= FORCE_BURST_MS) {
    forcedAt.set(key, now);
    evictCoalescedGet(key);
  }
  return coalescedGet(key, run, ttlMs);
}

/**
 * Drop every in-flight/settled entry. The module-level cache would otherwise
 * leak a settled result from one test into the next same-key call within the
 * share window; a global test `beforeEach` calls this so each test starts clean.
 */
export function resetCoalescedGet(): void {
  entries.clear();
  forcedAt.clear();
}
