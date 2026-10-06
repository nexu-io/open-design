/**
 * Where Claude Code's per-turn `stop_reason` actually lives, asserted against
 * **verbatim recordings of the installed CLI** (2.1.259) rather than
 * hand-assembled frames.
 *
 * ⚠️ Do NOT copy the frame shape from the other Claude fixtures in this repo.
 * Nearly all of them put `stop_reason` on the `assistant` wrapper frame, which
 * is a shape Claude Code 2.1.259 no longer produces. A test written against
 * that shape passes against a stream nobody receives — which is exactly how
 * the `turn_end` regression this file covers stayed green in CI.
 *
 * Corpus + measurements: `../fixtures/claude-cli-recordings/README.md`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createClaudeStreamHandler } from '../../src/runtimes/claude-stream.js';
import { applyClaudeStreamJsonRunBookkeeping } from '../../src/runtimes/chat-run-lifecycle.js';

type Frame = Record<string, unknown>;
type Event = Record<string, unknown>;

function recordingPath(name: string): string {
  return fileURLToPath(new URL(`../fixtures/claude-cli-recordings/${name}`, import.meta.url));
}

function readRecording(name: string): string {
  return readFileSync(recordingPath(name), 'utf8');
}

function frames(name: string): Frame[] {
  return readRecording(name)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Frame);
}

/** Feed a recording through the handler exactly as the daemon would. */
function replay(source: string, options: Record<string, unknown> = {}): Event[] {
  const events: Event[] = [];
  const handler = createClaudeStreamHandler((event) => events.push(event as Event), options);
  handler.feed(source);
  handler.flush();
  return events;
}

function replayRecording(name: string, options: Record<string, unknown> = {}): Event[] {
  return replay(readRecording(name), options);
}

function assistantText(events: Event[]): string {
  return events
    .filter((event) => event.type === 'text_delta' && typeof event.delta === 'string')
    .map((event) => event.delta as string)
    .join('');
}

function turnEndStopReasons(events: Event[]): unknown[] {
  return events.filter((event) => event.type === 'turn_end').map((event) => event.stopReason);
}

const PARTIAL_RECORDINGS = [
  'claude-2.1.259-partial-two-turns.jsonl',
  'claude-2.1.259-partial-same-turn-echo.jsonl',
  'claude-2.1.259-partial-single-turn.jsonl',
  'claude-2.1.259-partial-forwarded-subagent.jsonl',
];
const ALL_RECORDINGS = [
  ...PARTIAL_RECORDINGS,
  'claude-2.1.259-no-partial-messages.jsonl',
  'claude-2.1.259-no-partial-two-turns.jsonl',
];

// --------------------------------------------------------------------------
// Corpus guards. These exist so a later edit cannot quietly swap a recording
// for a hand-built old-shape fixture and turn the assertions below vacuous.
// --------------------------------------------------------------------------
describe('recorded Claude Code 2.1.259 stream shape', () => {
  it('never carries stop_reason on the assistant wrapper frame', () => {
    const offenders: string[] = [];
    for (const name of ALL_RECORDINGS) {
      for (const frame of frames(name)) {
        if (frame.type !== 'assistant') continue;
        const message = frame.message as Record<string, unknown> | undefined;
        if (message && message.stop_reason != null) {
          offenders.push(`${name}: ${String(message.stop_reason)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('carries the real stop reason on message_delta when partial messages are on', () => {
    const stopReasons = frames('claude-2.1.259-partial-two-turns.jsonl')
      .filter((frame) => frame.type === 'stream_event')
      .map((frame) => frame.event as Record<string, unknown>)
      .filter((event) => event?.type === 'message_delta')
      .map((event) => (event.delta as Record<string, unknown>).stop_reason);
    expect(stopReasons).toEqual(['tool_use', 'end_turn', 'end_turn']);
  });

  it('has no stream_event frames at all without --include-partial-messages', () => {
    for (const name of ['claude-2.1.259-no-partial-messages.jsonl', 'claude-2.1.259-no-partial-two-turns.jsonl']) {
      expect(frames(name).some((frame) => frame.type === 'stream_event')).toBe(false);
    }
  });

  it('actually contains the second turn inline artifact the dedup must not eat', () => {
    for (const name of ['claude-2.1.259-partial-two-turns.jsonl', 'claude-2.1.259-no-partial-two-turns.jsonl']) {
      expect(readRecording(name)).toContain('title=\\"Beta\\"');
    }
  });
});

// --------------------------------------------------------------------------
// The turn boundary itself.
// --------------------------------------------------------------------------
describe('turn_end from a real 2.1.259 stream', () => {
  it('fires once per assistant message, reading message_delta', () => {
    const events = replayRecording('claude-2.1.259-partial-two-turns.jsonl');
    expect(turnEndStopReasons(events)).toEqual(['tool_use', 'end_turn', 'end_turn']);
  });

  it('does not double-fire when a build populates both the wrapper and message_delta', () => {
    // No shipped CLI is known to do both, so this corpus is *derived*: the real
    // 2.1.259 frames with the recorded stop reason stamped back onto the last
    // assistant wrapper of each message — i.e. what an in-between build that
    // still fills the legacy field would look like.
    const hybrid = withLegacyStopReasonRestored('claude-2.1.259-partial-two-turns.jsonl', { keepStreamEvents: true });
    expect(turnEndStopReasons(replay(hybrid))).toEqual(['tool_use', 'end_turn', 'end_turn']);
  });

  it('still reads the legacy wrapper field when message_delta is absent', () => {
    // Derived old-CLI shape: real frames, stream_events dropped (a pre-flag
    // build has none) and the stop reason restored where old builds put it.
    const legacy = withLegacyStopReasonRestored('claude-2.1.259-partial-two-turns.jsonl', { keepStreamEvents: false });
    expect(turnEndStopReasons(replay(legacy))).toEqual(['tool_use', 'end_turn', 'end_turn']);
  });
});

// --------------------------------------------------------------------------
// The artifact-echo dedup this turn boundary drives.
// --------------------------------------------------------------------------
describe('HTML artifact echo dedup is scoped to one turn', () => {
  it('keeps a later turn inline HTML artifact after an earlier turn wrote an HTML file', () => {
    const events = replayRecording('claude-2.1.259-partial-two-turns.jsonl', {
      suppressHtmlArtifactsAfterFileWrite: true,
    });
    const text = assistantText(events);
    expect(text).toContain('DONE1');
    expect(text).toContain('<artifact type="text/html" title="Beta">');
    expect(text).toContain('<h1>Beta</h1>');
  });

  it('keeps it on the no-partial stream too, where result is the only turn boundary', () => {
    const events = replayRecording('claude-2.1.259-no-partial-two-turns.jsonl', {
      suppressHtmlArtifactsAfterFileWrite: true,
    });
    const text = assistantText(events);
    expect(text).toContain('DONE1');
    expect(text).toContain('<artifact type="text/html" title="Beta">');
  });

  // Reverse control: the mechanism's whole point. A file written and then
  // echoed back inside the SAME turn must still be swallowed.
  it('still swallows the same-turn echo of the file it just wrote', () => {
    const events = replayRecording('claude-2.1.259-partial-same-turn-echo.jsonl', {
      suppressHtmlArtifactsAfterFileWrite: true,
    });
    expect(assistantText(events)).not.toContain('<artifact');
    expect(events.some((event) => event.type === 'tool_use' && event.name === 'Write')).toBe(true);
  });

  // Reverse control: a plain single-turn run is untouched.
  it('leaves a single-turn transcript alone', () => {
    const events = replayRecording('claude-2.1.259-partial-single-turn.jsonl', {
      suppressHtmlArtifactsAfterFileWrite: true,
    });
    expect(assistantText(events)).toBe('DONE1');
    expect(events.filter((event) => event.type === 'tool_use' && event.name === 'Write')).toHaveLength(1);
  });
});

// --------------------------------------------------------------------------
// The sub-agent guard (#5487) on both delivery paths.
// --------------------------------------------------------------------------
describe('forwarded sub-agent frames never close the parent turn', () => {
  it('emits turn_end only for the parent stream', () => {
    const source = 'claude-2.1.259-partial-forwarded-subagent.jsonl';
    const childFrames = frames(source).filter((frame) => frame.parent_tool_use_id != null);
    expect(childFrames.length).toBeGreaterThan(0);
    expect(turnEndStopReasons(replayRecording(source))).toEqual(['tool_use', 'tool_use', 'end_turn']);
  });

  it('drops a message_delta that arrives under a parent_tool_use_id', () => {
    // 2.1.259 forwards Child frames as `assistant` wrappers only, so no
    // recording contains a re-parented message_delta. Derived from the real
    // frames: same bytes, re-stamped with the parent id the CLI puts on the
    // forwarded frames it does send.
    const reparented = frames('claude-2.1.259-partial-two-turns.jsonl')
      .map((frame) => (frame.type === 'stream_event' ? { ...frame, parent_tool_use_id: 'toolu_child_1' } : frame))
      .map((frame) => `${JSON.stringify(frame)}\n`)
      .join('');
    expect(turnEndStopReasons(replay(reparented))).toEqual([]);
  });

  it('drops a legacy wrapper stop_reason that arrives under a parent_tool_use_id', () => {
    const legacyChild = withLegacyStopReasonRestored('claude-2.1.259-partial-forwarded-subagent.jsonl', {
      keepStreamEvents: false,
      onlyParented: true,
    });
    expect(turnEndStopReasons(replay(legacyChild))).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// The `usage` terminal, which must keep carrying the load on old CLIs and on
// any build where --include-partial-messages was not negotiated.
// --------------------------------------------------------------------------
describe('usage stays the terminal fallback', () => {
  it('terminates a no-partial recording through usage and closes stdin', () => {
    const events = replayRecording('claude-2.1.259-no-partial-messages.jsonl');
    const usage = events.filter((event) => event.type === 'usage');
    expect(usage).toHaveLength(1);
    expect(usage[0]?.stopReason).toBe('end_turn');

    const run = { stdinOpen: true, turnCompletedCleanly: false, child: null };
    for (const event of events) applyClaudeStreamJsonRunBookkeeping(run, event);
    expect(run.turnCompletedCleanly).toBe(true);
    expect(run.stdinOpen).toBe(false);
  });

  it('holds stdin open across the mid-tool pause of a real recording, then closes on the turn', () => {
    // The `stop_reason: 'tool_use'` guard, exercised end-to-end off recorded
    // bytes: turn 1 of this recording parks mid-Write, and closing stdin there
    // would truncate the follow-up.
    const events = replayRecording('claude-2.1.259-partial-two-turns.jsonl');
    const run = { stdinOpen: true, turnCompletedCleanly: false, child: null };
    const stdinAfter: Array<[unknown, boolean]> = [];
    for (const event of events) {
      applyClaudeStreamJsonRunBookkeeping(run, event);
      if (event.type === 'turn_end' || event.type === 'usage') {
        stdinAfter.push([event.stopReason, run.stdinOpen]);
      }
    }
    expect(stdinAfter[0]).toEqual(['tool_use', true]);
    expect(stdinAfter[1]?.[1]).toBe(false);
  });

  it('keeps a tool_use usage frame non-terminal (real run 95e0f997 shape)', () => {
    const run = { stdinOpen: true, turnCompletedCleanly: false, child: null };
    applyClaudeStreamJsonRunBookkeeping(run, { type: 'usage', stopReason: 'tool_use', isError: true });
    expect(run.stdinOpen).toBe(true);
    expect(run.turnCompletedCleanly).toBe(false);
  });

  it('closes stdin without marking clean on an error usage terminal', () => {
    const run = { stdinOpen: true, turnCompletedCleanly: false, child: null };
    applyClaudeStreamJsonRunBookkeeping(run, { type: 'usage', stopReason: 'end_turn', isError: true });
    expect(run.stdinOpen).toBe(false);
    expect(run.turnCompletedCleanly).toBe(false);
  });
});

/**
 * Rebuild a recording in the pre-2.1 shape: put each message's recorded
 * `stop_reason` back on its last `assistant` wrapper frame, the way older
 * Claude Code builds delivered it.
 *
 * `keepStreamEvents: false` also drops every `stream_event`, reproducing a
 * build with no `--include-partial-messages` support at all.
 * `onlyParented: true` stamps only the forwarded sub-agent frames.
 */
function withLegacyStopReasonRestored(
  name: string,
  opts: { keepStreamEvents: boolean; onlyParented?: boolean },
): string {
  const all = frames(name);

  // message id -> stop reason, read off the message_delta frames.
  const stopReasonByMessage = new Map<string, string>();
  let openMessageId: string | null = null;
  for (const frame of all) {
    if (frame.type === 'stream_event') {
      const event = frame.event as Record<string, unknown>;
      if (event?.type === 'message_start') {
        const message = event.message as Record<string, unknown> | undefined;
        openMessageId = typeof message?.id === 'string' ? message.id : null;
      } else if (event?.type === 'message_delta' && openMessageId) {
        const stopReason = (event.delta as Record<string, unknown>)?.stop_reason;
        if (typeof stopReason === 'string') stopReasonByMessage.set(openMessageId, stopReason);
      }
    }
  }
  // Frames the CLI never streamed a message_delta for (forwarded Child
  // messages) still get a plausible legacy terminal so the guard has something
  // to refuse.
  for (const frame of all) {
    if (frame.type !== 'assistant' || frame.parent_tool_use_id == null) continue;
    const message = frame.message as Record<string, unknown>;
    if (typeof message.id === 'string' && !stopReasonByMessage.has(message.id)) {
      stopReasonByMessage.set(message.id, 'end_turn');
    }
  }

  const lastWrapperIndexByMessage = new Map<string, number>();
  all.forEach((frame, index) => {
    if (frame.type !== 'assistant') return;
    const message = frame.message as Record<string, unknown>;
    if (typeof message.id === 'string') lastWrapperIndexByMessage.set(message.id, index);
  });

  const out: string[] = [];
  all.forEach((frame, index) => {
    if (!opts.keepStreamEvents && frame.type === 'stream_event') return;
    if (frame.type === 'assistant') {
      const message = frame.message as Record<string, unknown>;
      const id = typeof message.id === 'string' ? message.id : null;
      const eligible = opts.onlyParented ? frame.parent_tool_use_id != null : true;
      if (id && eligible && lastWrapperIndexByMessage.get(id) === index && stopReasonByMessage.has(id)) {
        out.push(JSON.stringify({
          ...frame,
          message: { ...message, stop_reason: stopReasonByMessage.get(id) },
        }));
        return;
      }
    }
    out.push(JSON.stringify(frame));
  });
  return `${out.join('\n')}\n`;
}
