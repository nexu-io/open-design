import {
  CRITIQUE_SSE_EVENT_NAMES,
  isPanelEvent,
  type CritiqueSseEvent,
  type CritiqueSseEventName,
  type PanelEvent,
} from '@open-design/contracts/critique';

import type { CritiqueAction } from './reducer';

export interface CritiqueEventsConnection {
  close(): void;
}

export interface CritiqueEventsConnectionOptions {
  /** Test seam: substitute a mock EventSource constructor. */
  EventSourceCtor?: typeof EventSource;
  /** Initial backoff in ms. Defaults to 1000. */
  initialBackoffMs?: number;
  /** Max backoff in ms. Defaults to 30000. */
  maxBackoffMs?: number;
  /** Test seam: setTimeout substitutes for fake timers. */
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

const DEFAULT_INITIAL_BACKOFF = 1000;
const DEFAULT_MAX_BACKOFF = 30_000;

export function critiqueEventsUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/events`;
}

/**
 * Lift an SSE-wire `CritiqueSseEvent` back into the flat `PanelEvent` shape
 * the reducer consumes. The daemon emits one channel per event name with
 * the payload (sans `type`) as JSON; this is the inverse of
 * `panelEventToSse` in the contracts package.
 *
 * Two defensive moves matter here:
 *
 *   1. The SSE channel name is authoritative for `type`. A payload-provided
 *      `type` (malformed or compromised frame) must NOT override the
 *      channel-derived value, so we spread `data` first and pin `type`
 *      last. Otherwise a daemon bug or a man-in-the-middle could route a
 *      `critique.run_started` channel into a `ship` action shape.
 *
 *   2. The result has to pass `isPanelEvent` before it leaves this
 *      function. That predicate is the contract-level source of truth for
 *      "this is a recognised event with a non-empty runId"; if the cast
 *      fails (missing runId, unknown type), we drop the frame and the
 *      reducer never sees it.
 */
export function sseToPanelEvent(eventName: CritiqueSseEventName, data: unknown): PanelEvent | null {
  if (data === null || typeof data !== 'object') return null;
  const type = eventName.slice('critique.'.length);
  const candidate = { ...(data as Record<string, unknown>), type };
  return isPanelEvent(candidate) ? candidate : null;
}

/**
 * Pure connection manager for a project's critique SSE channels. Mirrors the
 * shape of `createProjectEventsConnection` in `apps/web/src/providers/
 * project-events.ts` so tests can drive it under a node environment without
 * React + JSDOM. The two managers run side-by-side on the same
 * `/api/projects/:id/events` endpoint, each listening for its own event
 * names.
 *
 * Reconnects with exponential backoff (default 1s -> 30s cap). A successful
 * `ready` event resets the backoff so a flaky network doesn't permanently
 * stretch the gap between events. Malformed payloads are dropped with a dev
 * warning so a single bad frame doesn't tear the stream.
 */
export function createCritiqueEventsConnection(
  projectId: string,
  onEvent: (action: CritiqueAction) => void,
  options: CritiqueEventsConnectionOptions = {},
): CritiqueEventsConnection {
  const Ctor = options.EventSourceCtor
    ?? (typeof EventSource === 'undefined' ? null : EventSource);
  if (!Ctor) return { close() { /* noop */ } };

  const initialBackoff = options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF;
  const maxBackoff = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF;
  const setT = options.setTimeoutFn ?? setTimeout;
  const clearT = options.clearTimeoutFn ?? clearTimeout;

  let cancelled = false;
  let backoff = initialBackoff;
  let source: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const handleCritiqueFrame = (eventName: CritiqueSseEventName) => (raw: Event) => {
    try {
      const parsed = JSON.parse((raw as MessageEvent).data) as CritiqueSseEvent['data'];
      const action = sseToPanelEvent(eventName, parsed);
      if (action) onEvent(action);
    } catch (err) {
      if (
        typeof process !== 'undefined'
        && process.env?.NODE_ENV === 'development'
      ) {
        // eslint-disable-next-line no-console
        console.warn(`[critique-events] malformed payload on ${eventName}`, err);
      }
    }
  };

  const connect = (): void => {
    if (cancelled) return;
    const es = new Ctor(critiqueEventsUrl(projectId));
    source = es;
    es.addEventListener('ready', () => {
      backoff = initialBackoff;
    });
    for (const name of CRITIQUE_SSE_EVENT_NAMES) {
      es.addEventListener(name, handleCritiqueFrame(name));
    }
    es.addEventListener('error', () => {
      if (cancelled) return;
      es.close();
      if (source === es) source = null;
      const delay = backoff;
      backoff = Math.min(backoff * 2, maxBackoff);
      reconnectTimer = setT(connect, delay) as ReturnType<typeof setTimeout>;
    });
  };

  connect();

  return {
    close(): void {
      cancelled = true;
      if (reconnectTimer) clearT(reconnectTimer);
      if (source) source.close();
    },
  };
}
