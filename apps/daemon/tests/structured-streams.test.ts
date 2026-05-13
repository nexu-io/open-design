import { describe, expect, it } from 'vitest';
import { createClaudeStreamHandler } from '../src/claude-stream.js';
import { createCopilotStreamHandler } from '../src/copilot-stream.js';
import { mapPiRpcEvent } from '../src/pi-rpc.js';

describe('structured agent stream fixtures', () => {
  it('emits TodoWrite tool_use from Claude Code stream JSON', () => {
    const events: unknown[] = [];
    const handler = createClaudeStreamHandler((event: unknown) => events.push(event));
    handler.feed(`${JSON.stringify({
      type: 'assistant',
      message: {
        id: 'msg-1',
        content: [
          {
            type: 'tool_use',
            id: 'toolu-1',
            name: 'TodoWrite',
            input: {
              todos: [{ content: 'Run QA', status: 'pending' }],
            },
          },
        ],
      },
    })}\n`);
    handler.flush();

    expect(events).toContainEqual({
      type: 'tool_use',
      id: 'toolu-1',
      name: 'TodoWrite',
      input: {
        todos: [{ content: 'Run QA', status: 'pending' }],
      },
    });
  });

  it('preserves streamed Claude Code tool input_json_delta payloads', () => {
    const events: unknown[] = [];
    const handler = createClaudeStreamHandler((event: unknown) => events.push(event));

    handler.feed(`${JSON.stringify({
      type: 'stream_event',
      event: { type: 'message_start', message: { id: 'msg-1' } },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu-1', name: 'Write' },
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"file_path":"admin-dashboard.html",' },
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '"content":"<html></html>"}' },
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_stop', index: 0 },
    })}\n${JSON.stringify({
      type: 'assistant',
      message: {
        id: 'msg-1',
        content: [{ type: 'tool_use', id: 'toolu-1', name: 'Write', input: {} }],
      },
    })}\n`);
    handler.flush();

    const toolUses = events.filter((event) => typeof event === 'object' && event !== null && (event as { type?: string }).type === 'tool_use');

    expect(toolUses).toHaveLength(1);
    expect(toolUses).toContainEqual({
      type: 'tool_use',
      id: 'toolu-1',
      name: 'Write',
      input: {
        file_path: 'admin-dashboard.html',
        content: '<html></html>',
      },
    });
  });

  it('emits TodoWrite tool_use from Pi RPC tool_execution events', () => {
    const events: unknown[] = [];
    const send = (_channel: string, payload: unknown) => { events.push(payload); };
    const ctx = { runStartedAt: Date.now(), sentFirstToken: { value: false } };

    mapPiRpcEvent(
      { type: 'tool_execution_start', toolCallId: 'pi-call-1', toolName: 'TodoWrite', args: { todos: [{ content: 'Run QA', status: 'pending' }] } },
      send,
      ctx,
    );
    mapPiRpcEvent(
      { type: 'tool_execution_end', toolCallId: 'pi-call-1', toolName: 'TodoWrite', result: { content: [{ type: 'text', text: 'written' }] }, isError: false },
      send,
      ctx,
    );

    expect(events).toContainEqual({
      type: 'tool_use',
      id: 'pi-call-1',
      name: 'TodoWrite',
      input: { todos: [{ content: 'Run QA', status: 'pending' }] },
    });
    expect(events).toContainEqual({
      type: 'tool_result',
      toolUseId: 'pi-call-1',
      content: 'written',
      isError: false,
    });
  });

  it('emits TodoWrite tool_use from GitHub Copilot CLI JSON stream', () => {
    const events: unknown[] = [];
    const handler = createCopilotStreamHandler((event: unknown) => events.push(event));
    handler.feed(`${JSON.stringify({
      type: 'tool.execution_start',
      data: {
        toolCallId: 'call-1',
        toolName: 'TodoWrite',
        arguments: {
          todos: [{ content: 'Run QA', status: 'pending' }],
        },
      },
    })}\n`);
    handler.flush();

    expect(events).toContainEqual({
      type: 'tool_use',
      id: 'call-1',
      name: 'TodoWrite',
      input: {
        todos: [{ content: 'Run QA', status: 'pending' }],
      },
    });
  });
});
