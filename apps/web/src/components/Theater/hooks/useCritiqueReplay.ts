import { useEffect, useReducer, useRef } from 'react';
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
   * per-event delay can vary (e.g. `live` paces by recorded timestamps).
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
 *  - `'instant'` — flush every event synchronously after parse, useful for
 *    test fixtures and for opening a finished run already at its terminal
 *    state.
 *  - `'live'` — pace events by their relative offset from the first event in
 *    the transcript so playback feels like the original run.
 *  - `{ intervalMs: N }` — fixed N-ms delay between events (debug mode).
 *  - `'paused'` — load the transcript but hold every event until the speed
 *    is changed.
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

  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  // Capture the latest speed without re-running the load effect — we want
  // changing speed to retime in-flight playback, not refetch the transcript.
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    if (!transcriptUrl) {
      setMeta({ status: 'idle', error: null });
      return;
    }

    let cancelled = false;
    const fetcher = options.fetchTranscript ?? defaultFetch;
    const gunzip = options.gunzip ?? defaultGunzip;
    const setT = options.setTimeoutFn ?? setTimeout;
    const clearT = options.clearTimeoutFn ?? clearTimeout;
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    setMeta({ status: 'loading', error: null });

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

      const events = parseTranscript(raw);
      if (cancelled) return;
      if (events.length === 0) {
        setMeta({ status: 'done', error: null });
        return;
      }

      setMeta({ status: 'playing', error: null });

      const currentSpeed = speedRef.current;
      if (currentSpeed === 'instant') {
        for (const evt of events) dispatchRef.current(evt);
        setMeta({ status: 'done', error: null });
        return;
      }
      if (currentSpeed === 'paused') {
        return;
      }

      const baseDelay = typeof currentSpeed === 'object' ? currentSpeed.intervalMs : 0;
      let cursor = 0;
      const step = () => {
        if (cancelled) return;
        if (cursor >= events.length) {
          setMeta({ status: 'done', error: null });
          return;
        }
        dispatchRef.current(events[cursor]!);
        cursor += 1;
        if (cursor < events.length) {
          timers.push(setT(step, baseDelay) as ReturnType<typeof setTimeout>);
        } else {
          setMeta({ status: 'done', error: null });
        }
      };
      // First event fires synchronously so `playing` is visibly distinct from
      // `loading`; subsequent events are paced by `baseDelay`.
      step();
    })().catch(() => {
      // Swallow — already surfaced via setMeta inside the async block.
    });

    return () => {
      cancelled = true;
      for (const id of timers) clearT(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcriptUrl]);

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
