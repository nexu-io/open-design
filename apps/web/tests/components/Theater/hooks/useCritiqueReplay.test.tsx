// @vitest-environment jsdom

/**
 * jsdom coverage for `useCritiqueReplay` (Phase 7, Task 7.3). The hook
 * fetches a recorded NDJSON transcript, parses each line into a PanelEvent
 * via the shared `isPanelEvent` predicate, and dispatches into the
 * reducer at the chosen speed.
 */

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PanelEvent } from '@open-design/contracts/critique';

import { useCritiqueReplay } from '../../../../src/components/Theater/hooks/useCritiqueReplay';
import type { CritiqueState } from '../../../../src/components/Theater/state/reducer';
import type { ReplaySpeed, UseCritiqueReplayOptions } from '../../../../src/components/Theater/hooks/useCritiqueReplay';

afterEach(() => {
  cleanup();
});

interface Sink {
  state: CritiqueState;
  status: string;
  error: string | null;
}

function Probe({ url, speed, options, sink }: {
  url: string | null;
  speed: ReplaySpeed;
  options: UseCritiqueReplayOptions;
  sink: Sink;
}) {
  const { state, status, error } = useCritiqueReplay(url, speed, options);
  sink.state = state;
  sink.status = status;
  sink.error = error;
  return null;
}

const RUN_ID = 'run_replay';

function ndjson(events: PanelEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

const TRANSCRIPT: PanelEvent[] = [
  {
    type: 'run_started', runId: RUN_ID, protocolVersion: 1,
    cast: ['critic'], maxRounds: 3, threshold: 8, scale: 10,
  },
  { type: 'panelist_open', runId: RUN_ID, round: 1, role: 'critic' },
  {
    type: 'panelist_dim', runId: RUN_ID, round: 1, role: 'critic',
    dimName: 'contrast', dimScore: 8, dimNote: 'ok',
  },
  { type: 'panelist_close', runId: RUN_ID, round: 1, role: 'critic', score: 8 },
  {
    type: 'round_end', runId: RUN_ID, round: 1,
    composite: 8.2, mustFix: 0, decision: 'ship', reason: 'threshold met',
  },
  {
    type: 'ship', runId: RUN_ID, round: 1, composite: 8.2, status: 'shipped',
    artifactRef: { projectId: 'p', artifactId: 'a' }, summary: 'looks good',
  },
];

describe('useCritiqueReplay (Phase 7.3)', () => {
  it('reports idle status when no transcriptUrl is provided', () => {
    const sink: Sink = { state: { phase: 'idle' }, status: 'idle', error: null };
    render(<Probe url={null} speed="instant" options={{}} sink={sink} />);
    expect(sink.status).toBe('idle');
    expect(sink.state.phase).toBe('idle');
  });

  it('parses NDJSON and dispatches every event when speed=instant', async () => {
    const sink: Sink = { state: { phase: 'idle' }, status: 'idle', error: null };
    const fetchTranscript = vi.fn(async () => ndjson(TRANSCRIPT));

    render(
      <Probe
        url="/api/replay.ndjson"
        speed="instant"
        options={{ fetchTranscript }}
        sink={sink}
      />,
    );

    await waitFor(() => {
      expect(sink.status).toBe('done');
    });
    expect(fetchTranscript).toHaveBeenCalledWith('/api/replay.ndjson');
    expect(sink.state.phase).toBe('shipped');
    if (sink.state.phase !== 'shipped') return;
    expect(sink.state.final.composite).toBe(8.2);
    expect(sink.state.rounds).toHaveLength(1);
  });

  it('paces events with intervalMs and reaches done after the last tick', async () => {
    const sink: Sink = { state: { phase: 'idle' }, status: 'idle', error: null };
    const queue: Array<{ delay: number; fn: () => void }> = [];
    const setTimeoutFn = ((fn: () => void, delay: number) => {
      queue.push({ delay, fn });
      return queue.length as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
    const clearTimeoutFn = (() => undefined) as typeof clearTimeout;

    render(
      <Probe
        url="/api/replay.ndjson"
        speed={{ intervalMs: 250 }}
        options={{
          fetchTranscript: async () => ndjson(TRANSCRIPT),
          setTimeoutFn,
          clearTimeoutFn,
        }}
        sink={sink}
      />,
    );

    // After the async load resolves the first event fires synchronously and
    // the hook schedules the second event via setTimeoutFn at delay 250.
    await waitFor(() => {
      expect(queue.length).toBeGreaterThan(0);
    });
    expect(queue[0]!.delay).toBe(250);
    expect(sink.state.phase).toBe('running');

    // Drain the rest of the queue. Each scheduled callback dispatches the
    // next event AND schedules the one after it, so we keep firing until
    // the queue empties.
    await act(async () => {
      while (queue.length > 0) {
        const next = queue.shift()!;
        next.fn();
      }
    });

    expect(sink.status).toBe('done');
    expect(sink.state.phase).toBe('shipped');
  });

  it('holds in playing state when speed=paused without dispatching', async () => {
    // `paused` is still a playing status (the transcript is parsed but
    // events are held back). The state stays at idle because we never
    // dispatch the run_started.
    const sink: Sink = { state: { phase: 'idle' }, status: 'idle', error: null };
    render(
      <Probe
        url="/api/replay.ndjson"
        speed="paused"
        options={{ fetchTranscript: async () => ndjson(TRANSCRIPT) }}
        sink={sink}
      />,
    );

    await waitFor(() => {
      expect(sink.status).toBe('playing');
    });
    expect(sink.state.phase).toBe('idle');
  });

  it('resumes dispatch when speed flips from paused to instant', async () => {
    // Lefarcen P1 (#1307 review): the previous revision tied the
    // entire playback path to the parse effect's deps, so a
    // `paused` -> `instant` flip never re-fired and the held events
    // sat undispatched. Splitting parse/pace effects fixes this; the
    // test pins the regression.
    const sink: Sink = { state: { phase: 'idle' }, status: 'idle', error: null };
    const { rerender } = render(
      <Probe
        url="/api/replay.ndjson"
        speed="paused"
        options={{ fetchTranscript: async () => ndjson(TRANSCRIPT) }}
        sink={sink}
      />,
    );

    await waitFor(() => {
      expect(sink.status).toBe('playing');
    });
    expect(sink.state.phase).toBe('idle');

    rerender(
      <Probe
        url="/api/replay.ndjson"
        speed="instant"
        options={{ fetchTranscript: async () => ndjson(TRANSCRIPT) }}
        sink={sink}
      />,
    );

    await waitFor(() => {
      expect(sink.status).toBe('done');
    });
    expect(sink.state.phase).toBe('shipped');
  });

  it('preserves the playback cursor across pause/resume cycles in intervalMs mode', async () => {
    // Drive one event manually, pause, then resume: the second tick
    // must dispatch event #2 (not event #1). Cursor-survival across
    // speed flips is the load-bearing property of the parse/pace
    // split.
    const sink: Sink = { state: { phase: 'idle' }, status: 'idle', error: null };
    const queue: Array<{ delay: number; fn: () => void }> = [];
    const setTimeoutFn = ((fn: () => void, delay: number) => {
      queue.push({ delay, fn });
      return queue.length as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
    const clearTimeoutFn = (() => undefined) as typeof clearTimeout;

    const { rerender } = render(
      <Probe
        url="/api/replay.ndjson"
        speed={{ intervalMs: 500 }}
        options={{
          fetchTranscript: async () => ndjson(TRANSCRIPT),
          setTimeoutFn,
          clearTimeoutFn,
        }}
        sink={sink}
      />,
    );

    // First event dispatches synchronously after parse; the second
    // is scheduled in the queue.
    await waitFor(() => {
      expect(queue.length).toBeGreaterThan(0);
    });
    expect(sink.state.phase).toBe('running');

    // Flip to paused: pending timer is cancelled, status stays
    // playing, no dispatches happen.
    rerender(
      <Probe
        url="/api/replay.ndjson"
        speed="paused"
        options={{
          fetchTranscript: async () => ndjson(TRANSCRIPT),
          setTimeoutFn,
          clearTimeoutFn,
        }}
        sink={sink}
      />,
    );
    // Pause cleanup drops timers but the cursor stays at 1.
    queue.length = 0;

    // Flip to instant: drains from event index 1 to end (NOT index 0
    // again — that would double-dispatch the run_started and reset
    // the reducer).
    rerender(
      <Probe
        url="/api/replay.ndjson"
        speed="instant"
        options={{
          fetchTranscript: async () => ndjson(TRANSCRIPT),
          setTimeoutFn,
          clearTimeoutFn,
        }}
        sink={sink}
      />,
    );

    await waitFor(() => {
      expect(sink.status).toBe('done');
    });
    expect(sink.state.phase).toBe('shipped');
  });

  it('reports done with idle state on an empty transcript', async () => {
    const sink: Sink = { state: { phase: 'idle' }, status: 'idle', error: null };
    render(
      <Probe
        url="/api/replay.ndjson"
        speed="instant"
        options={{ fetchTranscript: async () => '' }}
        sink={sink}
      />,
    );
    await waitFor(() => {
      expect(sink.status).toBe('done');
    });
    expect(sink.state.phase).toBe('idle');
  });

  it('reports error status when the fetch rejects', async () => {
    const sink: Sink = { state: { phase: 'idle' }, status: 'idle', error: null };
    render(
      <Probe
        url="/api/replay.ndjson"
        speed="instant"
        options={{
          fetchTranscript: async () => {
            throw new Error('boom');
          },
        }}
        sink={sink}
      />,
    );
    await waitFor(() => {
      expect(sink.status).toBe('error');
    });
    expect(sink.error).toBe('boom');
    expect(sink.state.phase).toBe('idle');
  });

  it('skips malformed lines and dispatches valid events around them', async () => {
    const sink: Sink = { state: { phase: 'idle' }, status: 'idle', error: null };
    const raw
      = JSON.stringify(TRANSCRIPT[0]) + '\n'
      + 'not-valid-json\n'
      + JSON.stringify({ type: 'something_invalid', runId: RUN_ID }) + '\n'
      + JSON.stringify(TRANSCRIPT[1]) + '\n';

    render(
      <Probe
        url="/api/replay.ndjson"
        speed="instant"
        options={{ fetchTranscript: async () => raw }}
        sink={sink}
      />,
    );

    await waitFor(() => {
      expect(sink.status).toBe('done');
    });
    expect(sink.state.phase).toBe('running');
    if (sink.state.phase !== 'running') return;
    expect(sink.state.activePanelist).toBe('critic');
  });

  it('decodes a .gz transcript through the gunzip seam', async () => {
    const sink: Sink = { state: { phase: 'idle' }, status: 'idle', error: null };
    // The fetch returns binary bytes; gunzip resolves to the decompressed
    // string. We don't care that the bytes are real gzip; the seam is the
    // contract.
    const fetchTranscript = vi.fn(async () => new ArrayBuffer(8));
    const gunzip = vi.fn(async () => ndjson(TRANSCRIPT));

    render(
      <Probe
        url="/api/replay.ndjson.gz"
        speed="instant"
        options={{ fetchTranscript, gunzip }}
        sink={sink}
      />,
    );

    await waitFor(() => {
      expect(sink.status).toBe('done');
    });
    expect(gunzip).toHaveBeenCalledTimes(1);
    expect(sink.state.phase).toBe('shipped');
  });

  it('resets reducer state to idle when transcriptUrl flips to null after a replay (PR #1314 review)', async () => {
    // Lefarcen + Siri-Ray + codex P2: clearing the URL after a
    // replay reached `shipped` previously only cleared meta + events
    // + cursor. The reducer state stayed at `shipped`, so
    // TheaterTranscript could render stale rounds while reporting
    // `status: 'idle'`.
    const sink: Sink = { state: { phase: 'idle' }, status: 'idle', error: null };
    const { rerender } = render(
      <Probe
        url="/api/replay.ndjson"
        speed="instant"
        options={{ fetchTranscript: async () => ndjson(TRANSCRIPT) }}
        sink={sink}
      />,
    );
    await waitFor(() => {
      expect(sink.state.phase).toBe('shipped');
    });

    rerender(
      <Probe
        url={null}
        speed="instant"
        options={{ fetchTranscript: async () => ndjson(TRANSCRIPT) }}
        sink={sink}
      />,
    );
    await waitFor(() => {
      expect(sink.state.phase).toBe('idle');
    });
    expect(sink.status).toBe('idle');
  });
});
