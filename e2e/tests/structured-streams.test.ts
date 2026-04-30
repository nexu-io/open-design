import { describe, expect, it } from 'vitest';
import { createClaudeStreamHandler } from '../../apps/daemon/src/claude-stream.js';
import { createCopilotStreamHandler } from '../../apps/daemon/src/copilot-stream.js';

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
