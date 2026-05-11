import { useEffect, useReducer, useRef, useState } from 'react';
import type { Dispatch } from 'react';

import { isPanelEvent, type PanelEvent } from '@open-design/contracts/critique';

import {
  initialState,
  reduce,
  type CritiqueAction,
  type CritiqueState,
} from '../state/reducer';

export type ReplaySpeed = 'paused' | 'instant' | 'live' | { intervalMs: number };

export interface UseCritiqueReplayOptions {
  /**
   * Resolve the transcript bytes for a given URL. Tests stub this; production
   * passes through `fetch`. Returns either a UTF-8 string or a binary buffer
   * (for `.gz` payloads we decompress below).
   */
  fetchTranscript?: (url: string) => Promise<string | ArrayBuffer>;
  /**
   * Decompress a gzip ArrayBuffer to a UTF-8 string. Defaults to
   * `DecompressionStream('gzip')` when the runtime exposes it, with a
   * test-time injection for jsdom which doesn't.
   */
  gunzip?: (buffer: ArrayBuffer) => Promise<string>;
  /**
   * Test seam: substitute setTimeout for fake timers. Defaults to the
   * platform `setTimeout`. The hook never uses `setInterval` because the
   * per-event delay can vary in future (recorded-timestamp pacing for
   * `live` once transcripts carry timestamps).
   */
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export interface UseCritiqueReplayResult {
  state: CritiqueState;
  dispatch: Dispatch<CritiqueAction>;
  status: ReplayStatus;
  error: string | null;
}

export type ReplayStatus = 'idle' | 'loading' | 'playing' | 'done' | 'error';

/**
 * Drive the Critique Theater reducer from a recorded transcript so users can
 * scrub through a finished run. The transcript is a `.ndjson` (or
 * `.ndjson.gz`) stream of one `PanelEvent` per line; we fetch it once, parse
 * every line into a `PanelEvent`, then dispatch each one at the cadence
 * selected by `speed`:
 *
 *  - `'instant'` — flush every remaining event synchronously, useful for
 *    test fixtures and for opening a finished run already at its terminal
 *    state.
 *  - `{ intervalMs: N }` — fixed N-ms delay between events (debug mode).
 *  - `'live'` — placeholder for the future "playback at the original
 *    recorded cadence" path. Current transcripts don't carry per-event
 *    timestamps, so for now this behaves like `{ intervalMs: 0 }` (events
 *    drained on successive microtasks via setTimeoutFn). The honest
 *    timestamp-driven implementation is queued as a Phase 7+ follow-up.
 *  - `'paused'` — load the transcript but hold every event until the speed
 *    is changed to one of the values above; the cursor is preserved
 *    across pause/resume cycles so flipping to `instant` flushes the
 *    remaining events from wherever playback was suspended.
 *
 * The hook owns its own reducer (separate from `useCritiqueStream`) so a UI
 * can mount both in parallel: live next to a replay of a prior run.
 */
export function useCritiqueReplay(
  transcriptUrl: string | null,
  speed: ReplaySpeed,
  options: UseCritiqueReplayOptions = {},
): UseCritiqueReplayResult {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [meta, setMeta] = useStableMeta();
  const [events, setEvents] = useState<PanelEvent[] | null>(null);

  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  // Playback cursor lives in a ref so pause -> resume picks up where the
  // last tick left off instead of replaying from the start. A fresh
  // transcript URL resets it to zero (see the parse effect below).
  const cursorRef = useRef(0);

  // Parse effect: own the fetch + parse. Runs only when the URL changes.
  // Stores the parsed events in component state so the pace effect can
  // react to them; cursor is reset because a new transcript is a new run.
  useEffect(() => {
    if (!transcriptUrl) {
      setMeta({ status: 'idle', error: null });
      setEvents(null);
      cursorRef.current = 0;
      return;
    }
    let cancelled = false;
    const fetcher = options.fetchTranscript ?? defaultFetch;
    const gunzip = options.gunzip ?? defaultGunzip;
    setMeta({ status: 'loading', error: null });
    cursorRef.current = 0;
    setEvents(null);

    (async () => {
      let raw: string;
      try {
        const fetched = await fetcher(transcriptUrl);
        if (cancelled) return;
        if (typeof fetched === 'string') {
          raw = fetched;
        } else {
          raw = transcriptUrl.endsWith('.gz')
            ? await gunzip(fetched)
            : new TextDecoder('utf-8').decode(fetched);
        }
      } catch (err) {
        if (cancelled) return;
        setMeta({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }
      if (cancelled) return;
      const parsed = parseTranscript(raw);
      setEvents(parsed);
    })().catch(() => {
      // Already surfaced via setMeta inside the async block.
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcriptUrl]);

  // Pace effect: react to both the parsed-events list AND speed changes.
  // Cleanup cancels any in-flight setTimeout, but the cursor ref survives
  // so toggling speed from `paused` to `instant` resumes from the current
  // position instead of restarting from zero.
  useEffect(() => {
    if (!events) return;
    if (events.length === 0) {
      setMeta({ status: 'done', error: null });
      return;
    }
    if (cursorRef.current >= events.length) {
      setMeta({ status: 'done', error: null });
      return;
    }
    if (speed === 'paused') {
      // Holding: surface a non-terminal status so the UI can distinguish
      // "fetched and ready" from "fetching" or "done". The reducer is
      // untouched; the user picks a non-paused speed to advance.
      setMeta({ status: 'playing', error: null });
      return;
    }

    setMeta({ status: 'playing', error: null });

    if (speed === 'instant') {
      while (cursorRef.current < events.length) {
        dispatchRef.current(events[cursorRef.current]!);
        cursorRef.current += 1;
      }
      setMeta({ status: 'done', error: null });
      return;
    }

    const setT = options.setTimeoutFn ?? setTimeout;
    const clearT = options.clearTimeoutFn ?? clearTimeout;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    let cancelled = false;
    // `live` is reserved for recorded-cadence playback; until transcripts
    // carry per-event timestamps it behaves like a zero-delay tick.
    const baseDelay = speed === 'live'
      ? 0
      : typeof speed === 'object' ? speed.intervalMs : 0;

    const step = () => {
      if (cancelled) return;
      if (cursorRef.current >= events.length) {
        setMeta({ status: 'done', error: null });
        return;
      }
      dispatchRef.current(events[cursorRef.current]!);
      cursorRef.current += 1;
      if (cursorRef.current < events.length) {
        timers.push(setT(step, baseDelay) as ReturnType<typeof setTimeout>);
      } else {
        setMeta({ status: 'done', error: null });
      }
    };
    // First event fires synchronously so `playing` is visibly distinct
    // from the parse-effect's `loading`; subsequent events pace via the
    // timer seam.
    step();

    return () => {
      cancelled = true;
      for (const id of timers) clearT(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, speed]);

  return { state, dispatch, status: meta.status, error: meta.error };
}

interface ReplayMeta {
  status: ReplayStatus;
  error: string | null;
}

function useStableMeta(): [ReplayMeta, (next: ReplayMeta) => void] {
  const ref = useRef<ReplayMeta>({ status: 'idle', error: null });
  const [, setTick] = useReducer((n: number) => n + 1, 0);
  const set = (next: ReplayMeta) => {
    if (ref.current.status === next.status && ref.current.error === next.error) return;
    ref.current = next;
    setTick();
  };
  return [ref.current, set];
}

function parseTranscript(raw: string): PanelEvent[] {
  const out: PanelEvent[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (isPanelEvent(parsed)) out.push(parsed);
    } catch {
      // Tolerate stray lines; the orchestrator writes one event per line so
      // a bad line is recoverable. Production loggers should record the
      // discard but the hook stays pure.
    }
  }
  return out;
}

async function defaultFetch(url: string): Promise<string | ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`transcript fetch failed: ${res.status}`);
  return url.endsWith('.gz') ? await res.arrayBuffer() : await res.text();
}

async function defaultGunzip(buffer: ArrayBuffer): Promise<string> {
  // DecompressionStream is available in Node 18+ and modern browsers.
  const ds = new (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream!('gzip');
  const stream = new Response(buffer).body!.pipeThrough(ds);
  return await new Response(stream).text();
}
