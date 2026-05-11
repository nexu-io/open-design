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
/** Per-variant required-fields validator. `isPanelEvent` from contracts only
 *  checks `type` is known and `runId` is non-empty, so a frame like
 *  `{ type: 'ship', runId: 'r' }` would slip through to the reducer with every
 *  other field undefined and crash downstream code that calls
 *  `final.composite.toFixed(1)`. This second-pass filter enforces the shape
 *  of each variant before the action is dispatched (lefarcen + Siri-Ray +
 *  codex P2 on PR #1314). */
function hasValidVariantShape(event: PanelEvent): boolean {
  switch (event.type) {
    case 'run_started':
      return typeof event.protocolVersion === 'number'
        && Array.isArray(event.cast) && event.cast.length > 0
        && event.cast.every((r) => typeof r === 'string')
        && typeof event.maxRounds === 'number'
        && typeof event.threshold === 'number'
        && typeof event.scale === 'number';
    case 'panelist_open':
      return typeof event.round === 'number' && typeof event.role === 'string';
    case 'panelist_dim':
      return typeof event.round === 'number'
        && typeof event.role === 'string'
        && typeof event.dimName === 'string'
        && typeof event.dimScore === 'number'
        && typeof event.dimNote === 'string';
    case 'panelist_must_fix':
      return typeof event.round === 'number'
        && typeof event.role === 'string'
        && typeof event.text === 'string';
    case 'panelist_close':
      return typeof event.round === 'number'
        && typeof event.role === 'string'
        && typeof event.score === 'number';
    case 'round_end':
      return typeof event.round === 'number'
        && typeof event.composite === 'number'
        && typeof event.mustFix === 'number'
        && (event.decision === 'continue' || event.decision === 'ship')
        && typeof event.reason === 'string';
    case 'ship':
      return typeof event.round === 'number'
        && typeof event.composite === 'number'
        && typeof event.status === 'string'
        && event.artifactRef !== null
        && typeof event.artifactRef === 'object'
        && typeof (event.artifactRef as { projectId?: unknown }).projectId === 'string'
        && typeof (event.artifactRef as { artifactId?: unknown }).artifactId === 'string'
        && typeof event.summary === 'string';
    case 'degraded':
      return typeof event.reason === 'string' && typeof event.adapter === 'string';
    case 'interrupted':
      return typeof event.bestRound === 'number' && typeof event.composite === 'number';
    case 'failed':
      return typeof event.cause === 'string';
    case 'parser_warning':
      return typeof event.kind === 'string' && typeof event.position === 'number';
  }
}

export function sseToPanelEvent(eventName: CritiqueSseEventName, data: unknown): PanelEvent | null {
  if (data === null || typeof data !== 'object') return null;
  const type = eventName.slice('critique.'.length);
  const candidate = { ...(data as Record<string, unknown>), type };
  if (!isPanelEvent(candidate)) return null;
  // Variant-level guard: a frame that passes the cheap predicate but
  // is missing variant-specific fields would otherwise reach the
  // reducer and crash the UI on `undefined.toFixed()` / `undefined.cast`
  // (lefarcen + Siri-Ray + codex P2 on PR #1314).
  return hasValidVariantShape(candidate) ? candidate : null;
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
