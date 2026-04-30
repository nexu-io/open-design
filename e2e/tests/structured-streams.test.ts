import { describe, expect, it } from 'vitest';
import { createClaudeStreamHandler } from '../../apps/daemon/src/claude-stream.js';
import { createCopilotStreamHandler } from '../../apps/daemon/src/copilot-stream.js';
import { createJsonLineStream } from '../../apps/daemon/src/acp.js';

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

  it('emits TodoWrite tool_use from Pi RPC tool_execution events', () => {
    const events: unknown[] = [];
    // Simulate pi's RPC stdout through the same JSONL parser that
    // attachPiRpcSession uses, then apply the event mapping.
    const parser = createJsonLineStream((raw: any) => {
      if (raw.type === 'tool_execution_start') {
        events.push({
          type: 'tool_use',
          id: raw.toolCallId,
          name: raw.toolName,
          input: raw.args ?? null,
        });
      }
      if (raw.type === 'tool_execution_end') {
        const content = raw.result?.content;
        const text = Array.isArray(content)
          ? content.map((c: any) => (c?.type === 'text' ? c.text : JSON.stringify(c))).join('\n')
          : '';
        events.push({
          type: 'tool_result',
          toolUseId: raw.toolCallId,
          content: text,
          isError: raw.isError === true,
        });
      }
    });

    parser.feed(
      JSON.stringify({
        type: 'tool_execution_start',
        toolCallId: 'pi-call-1',
        toolName: 'TodoWrite',
        args: { todos: [{ content: 'Run QA', status: 'pending' }] },
      }) + '\n',
    );
    parser.feed(
      JSON.stringify({
        type: 'tool_execution_end',
        toolCallId: 'pi-call-1',
        toolName: 'TodoWrite',
        result: { content: [{ type: 'text', text: 'written' }] },
        isError: false,
      }) + '\n',
    );
    parser.flush();

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
