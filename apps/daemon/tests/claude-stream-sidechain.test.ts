/**
 * Regression tests for the sidechain (subagent) guard in `claude-stream.ts`.
 *
 * Claude Code emits subagent-internal traffic in the parent stream-json
 * tagged with a top-level `parent_tool_use_id`. Untagged handling lets a
 * subagent's final `stop_reason: end_turn` emit `turn_end`, which the
 * daemon's stdin-close bookkeeping treats as the MAIN turn ending — closing
 * stream-json stdin mid-run. Sidechain text must also stay out of the
 * text_delta channel (it would feed the artifact parser).
 * Spec: docs/superpowers/specs/2026-07-02-naver-blog-subagent-stages-design.md
 */

import { describe, expect, it } from 'vitest';
import { createClaudeStreamHandler } from '../src/claude-stream.js';

type Event = Record<string, unknown>;

function collect(): { events: Event[]; sink: (ev: Event) => void } {
  const events: Event[] = [];
  return { events, sink: (ev) => events.push(ev) };
}

function feedLine(handler: ReturnType<typeof createClaudeStreamHandler>, line: object) {
  handler.feed(JSON.stringify(line) + '\n');
}

describe('claude-stream sidechain guard', () => {
  it('does NOT emit turn_end / text_delta for a sidechain assistant end_turn', () => {
    const { events, sink } = collect();
    const handler = createClaudeStreamHandler(sink);

    feedLine(handler, {
      type: 'assistant',
      parent_tool_use_id: 'toolu_task_1',
      message: {
        id: 'msg-side-1',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'subagent final answer' }],
      },
    });

    expect(events.filter((e) => e.type === 'turn_end')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'text_delta')).toHaveLength(0);
  });

  it('still emits turn_end for a main-line assistant end_turn (parent_tool_use_id null)', () => {
    const { events, sink } = collect();
    const handler = createClaudeStreamHandler(sink);

    feedLine(handler, {
      type: 'assistant',
      parent_tool_use_id: null,
      message: {
        id: 'msg-main-1',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'main answer' }],
      },
    });

    const turnEnds = events.filter((e) => e.type === 'turn_end');
    expect(turnEnds).toHaveLength(1);
    expect(turnEnds[0]!.stopReason).toBe('end_turn');
  });

  it('tags sidechain tool_use and tool_result with parentToolUseId', () => {
    const { events, sink } = collect();
    const handler = createClaudeStreamHandler(sink);

    feedLine(handler, {
      type: 'assistant',
      parent_tool_use_id: 'toolu_task_1',
      message: {
        id: 'msg-side-2',
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'toolu_side_ws', name: 'WebSearch', input: { query: '실비 청구' } },
        ],
      },
    });
    feedLine(handler, {
      type: 'user',
      parent_tool_use_id: 'toolu_task_1',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_side_ws', content: 'results…', is_error: false },
        ],
      },
    });

    const uses = events.filter((e) => e.type === 'tool_use');
    expect(uses).toHaveLength(1);
    expect(uses[0]!.parentToolUseId).toBe('toolu_task_1');
    expect(uses[0]!.name).toBe('WebSearch');

    const results = events.filter((e) => e.type === 'tool_result');
    expect(results).toHaveLength(1);
    expect(results[0]!.parentToolUseId).toBe('toolu_task_1');
    expect(results[0]!.toolUseId).toBe('toolu_side_ws');
  });

  it('drops sidechain stream_event deltas entirely', () => {
    const { events, sink } = collect();
    const handler = createClaudeStreamHandler(sink);

    feedLine(handler, {
      type: 'stream_event',
      parent_tool_use_id: 'toolu_task_1',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'sidechain streamed text' },
      },
    });

    expect(events.filter((e) => e.type === 'text_delta')).toHaveLength(0);
  });
});
