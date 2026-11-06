/**
 * `first_visible_output` must mean pixels, not frame arrival.
 *
 * Claude Code streams extended thinking as `thinking_delta` frames whose
 * `thinking` is the empty string; the only payload is an `estimated_tokens`
 * count. Captured verbatim off the CLI (`claude -p --input-format stream-json
 * --output-format stream-json --verbose --include-partial-messages`):
 *
 *   {"type":"stream_event","event":{"type":"content_block_delta","index":0,
 *    "delta":{"type":"thinking_delta","thinking":"","estimated_tokens":null}}}
 *
 * A 26.5s thinking turn measured that way produced 20 such frames carrying 0
 * characters in total. The daemon forwards each one, so the run stream looks
 * busy while the screen stays blank.
 *
 * Run 1cc48454-e9a7-411a-981e-4325fcca95dd is the production instance: 26 empty
 * `thinking_delta` frames from 9.9s to 46.1s, first on-screen character at
 * 46.8s, and `time_to_first_visible_output_ms` reported as 9926 — 4.7x early.
 *
 * This test drives the real `claude-stream` parser into the real lifecycle
 * tracer, so it fails if either the parser stops forwarding empty thinking or
 * the tracer starts counting it as a pixel again.
 */
import { describe, expect, it } from 'vitest';

import { createClaudeStreamHandler } from '../../src/runtimes/claude-stream.js';
import {
  createRunLifecycleTracer,
  runLifecycleMarkersForStreamEvent,
} from '../../src/run-lifecycle-tracer.js';

type AgentEvent = Record<string, unknown>;

/** The daemon's `send('agent', ev)` choke point, reduced to its timing duties. */
function tracerSink(run: object, clock: () => number) {
  const lifecycle = createRunLifecycleTracer(run);
  return (ev: AgentEvent) => {
    const markers = runLifecycleMarkersForStreamEvent('agent', ev);
    const at = clock();
    if (markers.firstModelEventType) lifecycle.markFirstModelEvent(markers.firstModelEventType, at);
    if (markers.firstVisibleOutput) lifecycle.mark('first_visible_output', at);
  };
}

describe('empty thinking frames and the first visible pixel', () => {
  it('does not report a pixel while Claude streams character-less thinking', () => {
    const run: { analyticsTelemetry?: Record<string, number | string> } = {};
    let now = 0;
    const handler = createClaudeStreamHandler(tracerSink(run, () => now));

    const feed = (event: object, at: number) => {
      now = at;
      handler.feed(JSON.stringify({ type: 'stream_event', event }) + '\n');
    };

    feed({ type: 'message_start', message: { id: 'msg-1' } }, 9_100);
    feed({ type: 'content_block_start', index: 0, content_block: { type: 'thinking' } }, 9_144);
    // 26 frames, verbatim shape, spanning the window the user stared at.
    for (let i = 0; i < 26; i += 1) {
      feed(
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: '', estimated_tokens: null },
        },
        9_939 + i * 1_400,
      );
    }
    // The first frame that actually renders.
    feed(
      { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '\n\n在动手排' } },
      46_831,
    );

    const telemetry = run.analyticsTelemetry ?? {};
    // NOTE(sync/main): origin/main (#7155) split this boundary in two.
    // `firstModelEventAt` is now ARRIVAL on the daemon clock (first-write-wins),
    // and the producer-supplied instant — the one this spec feeds in and the one
    // phase boundaries anchor on — became `firstModelResponseAt` (earliest-wins,
    // clamped to arrival). The 9.9s fact under test is unchanged; only the field
    // that carries it moved, so the assertion follows it rather than relaxing.
    // Frames really did arrive at 9.9s — that boundary is untouched.
    expect(telemetry.firstModelResponseAt).toBe(9_939);
    expect(telemetry.firstModelEventType).toBe('thinking_delta');
    // Nothing was on screen until 46.8s.
    expect(telemetry.firstVisibleOutputAt).toBe(46_831);
  });

  it('still reports the pixel immediately when thinking carries characters', () => {
    const run: { analyticsTelemetry?: Record<string, number | string> } = {};
    let now = 0;
    const handler = createClaudeStreamHandler(tracerSink(run, () => now));

    now = 5_000;
    handler.feed(
      JSON.stringify({
        type: 'stream_event',
        event: { type: 'message_start', message: { id: 'msg-2' } },
      }) + '\n',
    );
    now = 5_200;
    handler.feed(
      JSON.stringify({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'Weighing the two options' },
        },
      }) + '\n',
    );

    expect(run.analyticsTelemetry?.firstVisibleOutputAt).toBe(5_200);
  });
});
