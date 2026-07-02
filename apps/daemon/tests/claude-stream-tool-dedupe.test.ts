/**
 * Regression tests for main-line tool_use dedupe in `claude-stream.ts`.
 *
 * Claude Code (observed on CLI 2.1.198 with the daemon's stream flags) can
 * re-send the same assistant-wrapper `tool_use` block for a single
 * dispatch — most visibly for Task/Agent dispatches, which surfaced as a
 * duplicate pair collapsing into a "호출 중 ×2" group pill instead of the
 * single TaskCard. The previous dedupe (`streamedToolUseIds`) was a
 * one-shot `has()` + `delete()` guard between the streamed path and the
 * assistant-wrapper path: it caught at most one wrapper repeat and never
 * caught wrapper-only repeats (no streamed content_block_stop at all).
 * `emitToolUse` must now be idempotent per id regardless of which path(s)
 * produced the emission.
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

describe('claude-stream main-line tool_use dedupe', () => {
  it('collapses the same assistant-wrapper tool_use block fed twice into one event', () => {
    const { events, sink } = collect();
    const handler = createClaudeStreamHandler(sink);

    const wrapper = {
      type: 'assistant',
      message: {
        id: 'msg-1',
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'toolu_task_1', name: 'Task', input: { description: 'research' } },
        ],
      },
    };

    feedLine(handler, wrapper);
    feedLine(handler, wrapper);

    const uses = events.filter((e) => e.type === 'tool_use' && e.id === 'toolu_task_1');
    expect(uses).toHaveLength(1);
  });

  it('collapses a streamed tool_use followed by TWO assistant wrappers carrying the same id', () => {
    const { events, sink } = collect();
    const handler = createClaudeStreamHandler(sink);

    // Streamed partial flow: content_block_start -> input_json_delta -> content_block_stop.
    feedLine(handler, {
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_task_1', name: 'Task' },
      },
    });
    feedLine(handler, {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"description":"research"}' },
      },
    });
    feedLine(handler, {
      type: 'stream_event',
      event: { type: 'content_block_stop', index: 0 },
    });

    // The CLI still re-sends the assistant wrapper for the same dispatch — twice.
    const wrapper = {
      type: 'assistant',
      message: {
        id: 'msg-1',
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'toolu_task_1', name: 'Task', input: { description: 'research' } },
        ],
      },
    };
    feedLine(handler, wrapper);
    feedLine(handler, wrapper);

    const uses = events.filter((e) => e.type === 'tool_use' && e.id === 'toolu_task_1');
    expect(uses).toHaveLength(1);
  });

  it('does not over-suppress two different tool_use ids', () => {
    const { events, sink } = collect();
    const handler = createClaudeStreamHandler(sink);

    feedLine(handler, {
      type: 'assistant',
      message: {
        id: 'msg-1',
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'toolu_task_1', name: 'Task', input: { description: 'research' } },
        ],
      },
    });
    feedLine(handler, {
      type: 'assistant',
      message: {
        id: 'msg-2',
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'toolu_task_2', name: 'Task', input: { description: 'review' } },
        ],
      },
    });

    const uses = events.filter((e) => e.type === 'tool_use');
    expect(uses).toHaveLength(2);
    expect(uses.map((e) => e.id)).toEqual(['toolu_task_1', 'toolu_task_2']);
  });
});
