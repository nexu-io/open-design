import { useEffect, useRef, useState } from 'react';
import { BackoffController } from '../lib/backoff';

// Collab realtime hop-2 — the reusable daemon→web SSE client.
//
// Wraps `EventSource` and encodes the three lifecycle behaviours every collab
// surface needs, so no hook re-implements them:
//
//   1. Visibility lifecycle. After the tab has been hidden for a short grace
//      (~30s) the EventSource is CLOSED — freeing the client connection and,
//      via the daemon's `res.on('close')`, the server-side sink. On visible /
//      focus the stream reopens AND `onActive()` fires so the caller re-fetches
//      the current snapshot of its subscribed resources.
//
//   2. Catch-up = snapshot re-fetch, NOT Last-Event-ID. Events are thin, so a
//      gap during a disconnect is closed by re-fetching on reconnect (`onActive`).
//      No server-side event buffer is required.
//
//   3. Poll-as-floor. The hook returns `connected`; callers keep their existing
//      `setInterval` poll but slow it while `connected` is true and run it at
//      full cadence while false. A client whose SSE never connects (packaged app
//      on an old shell where the `od://` proxy buffers SSE; SSR/tests with no
//      EventSource) simply keeps polling — ZERO regression.
//
// Connections are SHARED per URL: every hook that subscribes to the same URL
// joins ONE EventSource (ref-counted; the last unsubscribe closes it). This is
// the "one SSE per surface" rule and it keeps the workspace surface from opening
// four connections (team-projects + members + context + billing) into the
// browser's ~6-per-host budget.

export type EventStreamHandler = (data: unknown) => void;
export type EventStreamActiveReason = 'connected' | 'ambient';

export interface UseEventStreamOptions {
  /** Named-event handlers, keyed by SSE `event:` name. */
  events: Record<string, EventStreamHandler>;
  /**
   * Fired when the shared stream (re)connects and when the tab returns to
   * visible/focus. Re-fetch the current snapshot of the subscribed resources
   * here to close any gap opened during a disconnect.
   */
  onActive?: (reason: EventStreamActiveReason) => void;
  /** When false the hook never subscribes (stays poll-only). Defaults to true. */
  enabled?: boolean;
  /** Test seam: substitute a mock EventSource constructor. */
  EventSourceCtor?: typeof EventSource;
}

interface InternalSubscriber {
  eventNames: string[];
  getHandler: (name: string) => EventStreamHandler | undefined;
  onActive: ((reason: EventStreamActiveReason) => void) | undefined;
  onConnectedChange: (connected: boolean) => void;
}

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
// How long the tab may stay hidden before we drop the stream to free the
// client + server connection. Short enough to reclaim idle connections, long
// enough that a quick tab-switch does not thrash reconnects.
const HIDDEN_GRACE_MS = 30_000;
// Browsers commonly emit `visibilitychange` followed immediately by `focus`
// for one foreground transition. Collapse only that same-transition pair;
// reconnect/open signals bypass this window and always catch up.
const AMBIENT_ACTIVE_DEDUPE_MS = 50;

function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * One shared EventSource per URL, multiplexing every subscriber's named events
 * and owning the visibility + reconnect lifecycle. Not exported — reached only
 * through {@link useEventStream}.
 */
class EventStreamManager {
  private readonly url: string;
  private readonly Ctor: typeof EventSource;
  private readonly subscribers = new Set<InternalSubscriber>();
  private source: EventSource | null = null;
  private connected = false;
  // Jittered exponential reconnect backoff (1s → 30s), shared with every other
  // SSE surface via the common controller.
  private readonly backoff = new BackoffController({
    initialMs: INITIAL_BACKOFF_MS,
    maxMs: MAX_BACKOFF_MS,
    factor: 2,
    jitter: true,
  });
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly attachedNames = new Set<string>();
  private visibilityBound = false;
  private lastAmbientActiveAt = Number.NEGATIVE_INFINITY;

  constructor(url: string, Ctor: typeof EventSource) {
    this.url = url;
    this.Ctor = Ctor;
  }

  subscribe(sub: InternalSubscriber): () => void {
    this.subscribers.add(sub);
    this.bindVisibility();
    // A late joiner to an already-live stream should immediately learn the state
    // and re-fetch its snapshot, then start receiving events.
    sub.onConnectedChange(this.connected);
    this.ensureOpen();
    if (this.source) this.attachNames();
    if (this.connected) sub.onActive?.('connected');
    return () => this.unsubscribe(sub);
  }

  private unsubscribe(sub: InternalSubscriber): void {
    this.subscribers.delete(sub);
    if (this.subscribers.size === 0) this.teardown();
  }

  private teardown(): void {
    this.closeSource();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.hiddenTimer) {
      clearTimeout(this.hiddenTimer);
      this.hiddenTimer = null;
    }
    this.unbindVisibility();
    managers.delete(this.url);
  }

  private ensureOpen(): void {
    if (this.source || isDocumentHidden()) return;
    if (this.reconnectTimer) return;
    this.open();
  }

  private open(): void {
    let es: EventSource;
    try {
      es = new this.Ctor(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.source = es;
    this.attachedNames.clear();
    es.onopen = () => {
      this.backoff.reset();
      this.setConnected(true);
      // Snapshot catch-up on (re)connect — the thin-event model relies on this
      // instead of replaying buffered events.
      for (const sub of Array.from(this.subscribers)) {
        sub.onActive?.('connected');
      }
    };
    es.onerror = () => {
      // EventSource would auto-reconnect, but we drive our own jittered backoff
      // so `connected` and poll-as-floor stay coordinated.
      this.closeSource();
      this.setConnected(false);
      if (!isDocumentHidden()) this.scheduleReconnect();
    };
    // The daemon sends a `ready` handshake on open; treat it as a connect signal
    // too (covers transports where `onopen` is unreliable).
    this.listen('ready', () => {
      if (!this.connected) {
        this.backoff.reset();
        this.setConnected(true);
        for (const sub of Array.from(this.subscribers)) {
          sub.onActive?.('connected');
        }
      }
    });
    this.attachNames();
  }

  private attachNames(): void {
    if (!this.source) return;
    for (const sub of this.subscribers) {
      for (const name of sub.eventNames) this.listen(name, undefined);
    }
  }

  private listen(name: string, extra: ((data: unknown) => void) | undefined): void {
    if (!this.source) return;
    if (this.attachedNames.has(name)) {
      if (extra) {
        this.source.addEventListener(name, (evt) => {
          extra(safeParse((evt as MessageEvent).data));
        });
      }
      return;
    }
    this.attachedNames.add(name);
    this.source.addEventListener(name, (evt) => {
      const data = safeParse((evt as MessageEvent).data);
      if (extra) extra(data);
      for (const sub of Array.from(this.subscribers)) {
        const handler = sub.getHandler(name);
        if (handler) handler(data);
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.subscribers.size === 0) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureOpen();
    }, this.backoff.nextDelay());
  }

  private closeSource(): void {
    if (this.source) {
      this.source.onopen = null;
      this.source.onerror = null;
      try {
        this.source.close();
      } catch {
        /* ignore */
      }
      this.source = null;
    }
    this.attachedNames.clear();
  }

  private setConnected(next: boolean): void {
    if (this.connected === next) return;
    this.connected = next;
    for (const sub of Array.from(this.subscribers)) sub.onConnectedChange(next);
  }

  private readonly onVisibilityChange = (): void => {
    if (isDocumentHidden()) {
      if (this.hiddenTimer) return;
      this.hiddenTimer = setTimeout(() => {
        this.hiddenTimer = null;
        // Free the client + server connection while the tab is parked.
        this.closeSource();
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.setConnected(false);
      }, HIDDEN_GRACE_MS);
      return;
    }
    // Back to visible: cancel the pending close, reopen if we dropped, and always
    // re-fetch the current snapshot (a reopen fires onActive; an already-open
    // stream needs an explicit nudge).
    if (this.hiddenTimer) {
      clearTimeout(this.hiddenTimer);
      this.hiddenTimer = null;
    }
    if (!this.source) {
      this.ensureOpen();
    } else if (this.connected) {
      const now = Date.now();
      if (now - this.lastAmbientActiveAt < AMBIENT_ACTIVE_DEDUPE_MS) return;
      this.lastAmbientActiveAt = now;
      for (const sub of Array.from(this.subscribers)) sub.onActive?.('ambient');
    }
  };

  private readonly onFocus = (): void => {
    this.onVisibilityChange();
  };

  private bindVisibility(): void {
    if (this.visibilityBound || typeof window === 'undefined') return;
    this.visibilityBound = true;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('focus', this.onFocus);
  }

  private unbindVisibility(): void {
    if (!this.visibilityBound || typeof window === 'undefined') return;
    this.visibilityBound = false;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('focus', this.onFocus);
  }
}

function safeParse(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const managers = new Map<string, EventStreamManager>();

function getManager(url: string, Ctor: typeof EventSource): EventStreamManager {
  let manager = managers.get(url);
  if (!manager) {
    manager = new EventStreamManager(url, Ctor);
    managers.set(url, manager);
  }
  return manager;
}

export interface UseEventStreamResult {
  /** True while the shared SSE is live — callers slow their poll while true. */
  connected: boolean;
}

/**
 * Subscribe to a daemon SSE at `url`, sharing one EventSource across every
 * caller of the same URL. Returns `{ connected }` for poll-as-floor gating.
 *
 * The handlers / `onActive` may change identity across renders without
 * resubscribing — the latest are always used.
 */
export function useEventStream(
  url: string | null | undefined,
  options: UseEventStreamOptions,
): UseEventStreamResult {
  const { enabled = true } = options;
  const [connected, setConnected] = useState(false);

  const eventsRef = useRef(options.events);
  eventsRef.current = options.events;
  const onActiveRef = useRef(options.onActive);
  onActiveRef.current = options.onActive;
  // Event names are static in practice; snapshot them once per subscription.
  const eventNamesRef = useRef<string[]>(Object.keys(options.events));

  useEffect(() => {
    const Ctor =
      options.EventSourceCtor ?? (typeof EventSource === 'undefined' ? null : EventSource);
    if (!enabled || !url || !Ctor) {
      setConnected(false);
      return;
    }
    eventNamesRef.current = Object.keys(eventsRef.current);
    const manager = getManager(url, Ctor);
    const sub: InternalSubscriber = {
      eventNames: eventNamesRef.current,
      getHandler: (name) => eventsRef.current[name],
      onActive: (reason) => onActiveRef.current?.(reason),
      onConnectedChange: setConnected,
    };
    const unsubscribe = manager.subscribe(sub);
    return () => {
      unsubscribe();
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled, options.EventSourceCtor]);

  return { connected };
}
