// Tab-visibility lifecycle for long-lived streams.
//
// Every open SSE stream costs one socket out of the browser's per-origin
// HTTP/1.1 budget — 6 against the loopback daemon, because a plain-text
// `http://127.0.0.1` origin never negotiates HTTP/2. Chromium keeps that budget
// per PROFILE, not per tab, so a parked background tab that keeps its streams
// open is spending sockets the tab the user is actually looking at needs. Once
// the budget is gone, ordinary fetches sit in the browser's queue for tens of
// seconds while the daemon answers each of them in single-digit milliseconds.
//
// The rule: a stream nobody can see must not hold a socket. `useEventStream`
// already owns this for its shared per-URL manager; this helper is the same
// rule for the standalone `create*EventsConnection` managers so the invariant
// holds for every long-lived stream, not just the multiplexed one.
//
// The grace window exists so an alt-tab does not thrash reconnects; it is long
// enough to cover a glance at another window and short enough to reclaim the
// socket of a genuinely parked tab.

/** How long a tab may stay hidden before its streams give their sockets back. */
export const STREAM_HIDDEN_GRACE_MS = 30_000;

export interface StreamVisibilityOptions {
  /**
   * Release the connection — the tab has been hidden for the whole grace
   * window. Fired at most once per hidden period.
   */
  onHidden: () => void;
  /**
   * Reopen — the tab came back after {@link onHidden} released the connection.
   * Not fired when the tab returns inside the grace window (nothing was
   * released, so nothing needs reopening).
   */
  onVisible: () => void;
  /** Override the grace window. Defaults to {@link STREAM_HIDDEN_GRACE_MS}. */
  graceMs?: number;
  /** Test seams for fake timers, mirroring the connection managers' options. */
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export interface StreamVisibilityBinding {
  /** Detach the listeners and cancel a pending grace timer. */
  dispose(): void;
}

const NOOP_BINDING: StreamVisibilityBinding = { dispose() { /* noop */ } };

/**
 * Bind a stream's lifetime to tab visibility.
 *
 * In a non-DOM environment (node-side tests, SSR) this is a no-op binding, so
 * callers can bind unconditionally.
 */
export function bindStreamVisibility(
  options: StreamVisibilityOptions,
): StreamVisibilityBinding {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return NOOP_BINDING;
  }

  const setT = options.setTimeoutFn ?? setTimeout;
  const clearT = options.clearTimeoutFn ?? clearTimeout;
  const graceMs = options.graceMs ?? STREAM_HIDDEN_GRACE_MS;

  let graceTimer: ReturnType<typeof setTimeout> | null = null;
  // True only between a completed grace window and the next visible transition,
  // so `onVisible` reopens exactly what `onHidden` released — never more.
  let released = false;
  let disposed = false;

  const clearGrace = (): void => {
    if (graceTimer === null) return;
    clearT(graceTimer);
    graceTimer = null;
  };

  const onTransition = (): void => {
    if (disposed) return;
    if (document.visibilityState === 'hidden') {
      if (graceTimer !== null || released) return;
      graceTimer = setT(() => {
        graceTimer = null;
        if (disposed || document.visibilityState !== 'hidden') return;
        released = true;
        options.onHidden();
      }, graceMs) as ReturnType<typeof setTimeout>;
      return;
    }
    clearGrace();
    if (!released) return;
    released = false;
    options.onVisible();
  };

  document.addEventListener('visibilitychange', onTransition);
  // Browsers commonly pair `visibilitychange` with `focus` for one foreground
  // transition; both are harmless here because the transition is idempotent.
  window.addEventListener('focus', onTransition);

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      clearGrace();
      document.removeEventListener('visibilitychange', onTransition);
      window.removeEventListener('focus', onTransition);
    },
  };
}
