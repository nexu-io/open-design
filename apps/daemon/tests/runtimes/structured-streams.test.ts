import { describe, expect, it } from 'vitest';
import { createClaudeStreamHandler } from '../../src/runtimes/claude-stream.js';
import { createCopilotStreamHandler } from '../../src/copilot-stream.js';
import { mapPiRpcEvent } from '../../src/agent-protocol/index.js';
import { createToolLoopGuard } from '../../src/tool-loop-guard.js';

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

  it('emits TodoWrite snapshots from Claude TaskCreate and TaskUpdate tools', () => {
    const events: unknown[] = [];
    const handler = createClaudeStreamHandler((event: unknown) => events.push(event));
    handler.feed(`${JSON.stringify({
      type: 'assistant',
      message: {
        id: 'msg-1',
        content: [
          {
            type: 'tool_use',
            id: 'toolu-create-1',
            name: 'TaskCreate',
            input: {
              subject: 'Bind editorial tokens',
              activeForm: 'Bind tokens',
            },
          },
          {
            type: 'tool_use',
            id: 'toolu-create-2',
            name: 'TaskCreate',
            input: {
              subject: 'Write index.html',
              activeForm: 'Write page',
            },
          },
          {
            type: 'tool_use',
            id: 'toolu-update-1',
            name: 'TaskUpdate',
            input: {
              taskId: '1',
              status: 'completed',
            },
          },
        ],
      },
    })}\n`);
    handler.flush();

    expect(events).toContainEqual({
      type: 'tool_use',
      id: 'toolu-update-1:todo-task',
      name: 'TodoWrite',
      input: {
        todos: [
          { content: 'Bind editorial tokens', status: 'completed', activeForm: 'Bind tokens' },
          { content: 'Write index.html', status: 'pending', activeForm: 'Write page' },
        ],
      },
    });
    expect(events).not.toContainEqual(expect.objectContaining({
      type: 'tool_use',
      id: 'toolu-create-1',
      name: 'TaskCreate',
    }));
    expect(events).not.toContainEqual(expect.objectContaining({
      type: 'tool_use',
      id: 'toolu-create-2',
      name: 'TaskCreate',
    }));
    expect(events).not.toContainEqual(expect.objectContaining({
      type: 'tool_use',
      id: 'toolu-update-1',
      name: 'TaskUpdate',
    }));
  });

  it('keeps implicit Claude TaskCreate IDs distinct from explicit task IDs', () => {
    const events: unknown[] = [];
    const handler = createClaudeStreamHandler((event: unknown) => events.push(event));
    handler.feed(`${JSON.stringify({
      type: 'assistant',
      message: {
        id: 'msg-1',
        content: [
          {
            type: 'tool_use',
            id: 'toolu-create-1',
            name: 'TaskCreate',
            input: {
              taskId: '1',
              subject: 'Bind editorial tokens',
            },
          },
          {
            type: 'tool_use',
            id: 'toolu-create-2',
            name: 'TaskCreate',
            input: {
              subject: 'Write index.html',
            },
          },
          {
            type: 'tool_use',
            id: 'toolu-update-2',
            name: 'TaskUpdate',
            input: {
              taskId: '2',
              status: 'completed',
            },
          },
        ],
      },
    })}\n`);
    handler.flush();

    expect(events).toContainEqual({
      type: 'tool_use',
      id: 'toolu-update-2:todo-task',
      name: 'TodoWrite',
      input: {
        todos: [
          { content: 'Bind editorial tokens', status: 'pending' },
          { content: 'Write index.html', status: 'completed' },
        ],
      },
    });
  });

  it('suppresses duplicate Claude artifact text after writing a file', () => {
    const events: unknown[] = [];
    const handler = createClaudeStreamHandler((event: unknown) => events.push(event));
    handler.feed(`${JSON.stringify({
      type: 'assistant',
      message: {
        id: 'msg-1',
        content: [
          {
            type: 'tool_use',
            id: 'toolu-write-1',
            name: 'Write',
            input: {
              file_path: 'index.html',
              content: '<!doctype html><html></html>',
            },
          },
          {
            type: 'text',
            text: '全部完成。\\n\\n<artifact identifier="page" type="text/html">\\n<!doctype html><html></html>\\n</artifact>',
          },
        ],
      },
    })}\n`);
    handler.flush();

    expect(events).toContainEqual({
      type: 'text_delta',
      delta: '全部完成。\\n\\n',
    });
    expect(events.some((event) => JSON.stringify(event).includes('<!doctype html>'))).toBe(true);
    expect(events.some((event) => {
      if (typeof event !== 'object' || event === null) return false;
      const record = event as { type?: string; delta?: string };
      return record.type === 'text_delta' && typeof record.delta === 'string' && record.delta.includes('<!doctype html>');
    })).toBe(false);
  });

  it('suppresses duplicate Claude artifact text split across chunks', () => {
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
        content_block: { type: 'tool_use', id: 'toolu-write-1', name: 'Write' },
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"file_path":"index.html","content":"<!doctype html><html></html>"}',
        },
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_stop',
        index: 0,
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '全部完成。\\n\\n<' } },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 1,
        delta: {
          type: 'text_delta',
          text: 'artifact identifier="page" type="text/html">\\n<!doctype html><html></html>\\n</artifact>Done',
        },
      },
    })}\n`);
    handler.flush();

    expect(events).toContainEqual({
      type: 'text_delta',
      delta: '全部完成。\\n\\n',
    });
    expect(events).toContainEqual({
      type: 'text_delta',
      delta: 'Done',
    });
    expect(events.some((event) => {
      if (typeof event !== 'object' || event === null) return false;
      const record = event as { type?: string; delta?: string };
      return record.type === 'text_delta' && typeof record.delta === 'string' && record.delta.includes('<!doctype html>');
    })).toBe(false);
  });

  it('suppresses duplicate Claude artifact text after intervening prose', () => {
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
        content_block: { type: 'tool_use', id: 'toolu-write-1', name: 'Write' },
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"file_path":"index.html","content":"<!doctype html><html></html>"}',
        },
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_stop',
        index: 0,
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '全部完成。\\n\\n' } },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 1,
        delta: {
          type: 'text_delta',
          text: '<artifact identifier="page" type="text/html">\\n<!doctype html><html></html>\\n</artifact>Done',
        },
      },
    })}\n`);
    handler.flush();

    expect(events).toContainEqual({
      type: 'text_delta',
      delta: '全部完成。\\n\\n',
    });
    expect(events).toContainEqual({
      type: 'text_delta',
      delta: 'Done',
    });
    expect(events.some((event) => {
      if (typeof event !== 'object' || event === null) return false;
      const record = event as { type?: string; delta?: string };
      return record.type === 'text_delta' && typeof record.delta === 'string' && record.delta.includes('<!doctype html>');
    })).toBe(false);
  });

  it('suppresses later Claude HTML artifact text after prose even when content differs from the write', () => {
    const events: unknown[] = [];
    const handler = createClaudeStreamHandler(
      (event: unknown) => events.push(event),
      { suppressHtmlArtifactsAfterFileWrite: true },
    );
    handler.feed(`${JSON.stringify({
      type: 'stream_event',
      event: { type: 'message_start', message: { id: 'msg-1' } },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu-write-1', name: 'Write' },
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"file_path":"index.html","content":"<!doctype html><html>written</html>"}',
        },
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_stop',
        index: 0,
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '全部完成。\\n\\n' } },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 1,
        delta: {
          type: 'text_delta',
          text: '<artifact identifier="page" type="text/html">\\n<!doctype html><html>different</html>\\n</artifact>Done',
        },
      },
    })}\n`);
    handler.flush();

    expect(events).toContainEqual({
      type: 'text_delta',
      delta: '全部完成。\\n\\n',
    });
    expect(events).toContainEqual({
      type: 'text_delta',
      delta: 'Done',
    });
    expect(events.some((event) => {
      if (typeof event !== 'object' || event === null) return false;
      const record = event as { type?: string; delta?: string };
      return record.type === 'text_delta' && typeof record.delta === 'string' && record.delta.includes('<html>different</html>');
    })).toBe(false);
  });

  it('preserves different later HTML artifacts unless Claude filesystem suppression is enabled', () => {
    const events: unknown[] = [];
    const handler = createClaudeStreamHandler((event: unknown) => events.push(event));
    handler.feed(`${JSON.stringify({
      type: 'assistant',
      message: {
        id: 'msg-1',
        content: [
          {
            type: 'tool_use',
            id: 'toolu-write-1',
            name: 'Write',
            input: {
              file_path: 'index.html',
              content: '<!doctype html><html>written</html>',
            },
          },
          {
            type: 'text',
            text: 'Final:\\n\\n<artifact identifier="page" type="text/html">\\n<!doctype html><html>different</html>\\n</artifact>',
          },
        ],
      },
    })}\n`);
    handler.flush();

    expect(events).toContainEqual({
      type: 'text_delta',
      delta: 'Final:\\n\\n<artifact identifier="page" type="text/html">\\n<!doctype html><html>different</html>\\n</artifact>',
    });
  });

  it('emits Claude prose immediately after a file write when no artifact follows', () => {
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
        content_block: { type: 'tool_use', id: 'toolu-write-1', name: 'Write' },
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"file_path":"index.html","content":"<!doctype html><html></html>"}',
        },
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_stop', index: 0 },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Done, preview ready.' } },
    })}\n`);

    expect(events).toContainEqual({
      type: 'text_delta',
      delta: 'Done, preview ready.',
    });
  });

  it('flushes trailing partial Claude artifact opener as prose', () => {
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
        content_block: { type: 'tool_use', id: 'toolu-write-1', name: 'Write' },
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"file_path":"index.html","content":"<!doctype html><html></html>"}',
        },
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_stop', index: 0 },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Done <art' } },
    })}\n`);
    handler.flush();

    expect(events).toContainEqual({
      type: 'text_delta',
      delta: 'Done ',
    });
    expect(events).toContainEqual({
      type: 'text_delta',
      delta: '<art',
    });
  });

  it('suppresses later Claude HTML artifact text after suppressing immediate file-write echo', () => {
    const events: unknown[] = [];
    const handler = createClaudeStreamHandler(
      (event: unknown) => events.push(event),
      { suppressHtmlArtifactsAfterFileWrite: true },
    );
    handler.feed(`${JSON.stringify({
      type: 'assistant',
      message: {
        id: 'msg-1',
        content: [
          {
            type: 'tool_use',
            id: 'toolu-write-1',
            name: 'Write',
            input: {
              file_path: 'helper.html',
              content: '<!doctype html><html>helper</html>',
            },
          },
          {
            type: 'text',
            text: 'Helper written.\\n\\n<artifact identifier="helper" type="text/html">\\n<!doctype html><html>helper</html>\\n</artifact>',
          },
          {
            type: 'text',
            text: 'Final artifact:\\n\\n<artifact identifier="final" type="text/html">\\n<!doctype html><html>final</html>\\n</artifact>',
          },
        ],
      },
    })}\n`);
    handler.flush();

    expect(events).toContainEqual({
      type: 'text_delta',
      delta: 'Helper written.\\n\\n',
    });
    expect(events).toContainEqual({
      type: 'text_delta',
      delta: 'Final artifact:\\n\\n',
    });
    expect(events.some((event) => {
      if (typeof event !== 'object' || event === null) return false;
      const record = event as { type?: string; delta?: string };
      return record.type === 'text_delta' && typeof record.delta === 'string' && (
        record.delta.includes('<html>helper</html>') || record.delta.includes('<html>final</html>')
      );
    })).toBe(false);
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
        content: [
          { type: 'tool_use', id: 'toolu-1', name: 'Write', input: {} },
          { type: 'tool_use', id: 'toolu-1', name: 'Write', input: {} },
        ],
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

  it('emits live tool_input_delta fragments while a Write streams, plus the final tool_use', () => {
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
        delta: { type: 'input_json_delta', partial_json: '{"file_path":"page.html",' },
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '"content":"<html>"}' },
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

    const inputDeltas = events.filter(
      (event): event is { type: string; id: string; name: string; delta: string } =>
        typeof event === 'object' && event !== null && (event as { type?: string }).type === 'tool_input_delta',
    );
    expect(inputDeltas).toEqual([
      { type: 'tool_input_delta', id: 'toolu-1', name: 'Write', delta: '{"file_path":"page.html",' },
      { type: 'tool_input_delta', id: 'toolu-1', name: 'Write', delta: '"content":"<html>"}' },
    ]);

    const toolUses = events.filter(
      (event) => typeof event === 'object' && event !== null && (event as { type?: string }).type === 'tool_use',
    );
    expect(toolUses).toContainEqual({
      type: 'tool_use',
      id: 'toolu-1',
      name: 'Write',
      input: { file_path: 'page.html', content: '<html>' },
    });
  });

  it('preserves Claude Code tool input from content_block_start when no delta arrives', () => {
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
        content_block: {
          type: 'tool_use',
          id: 'toolu-edit-1',
          name: 'Edit',
          input: {
            file_path: 'C:\\Users\\Tetsu\\project\\canvas2-nodes.jsx',
            old_string: 'const nodes = []',
            new_string: 'const nodes = computeNodes()',
          },
        },
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_stop', index: 0 },
    })}\n${JSON.stringify({
      type: 'assistant',
      message: {
        id: 'msg-1',
        content: [{ type: 'tool_use', id: 'toolu-edit-1', name: 'Edit', input: {} }],
      },
    })}\n`);
    handler.flush();

    const toolUses = events.filter((event) => typeof event === 'object' && event !== null && (event as { type?: string }).type === 'tool_use');

    expect(toolUses).toEqual([
      {
        type: 'tool_use',
        id: 'toolu-edit-1',
        name: 'Edit',
        input: {
          file_path: 'C:\\Users\\Tetsu\\project\\canvas2-nodes.jsx',
          old_string: 'const nodes = []',
          new_string: 'const nodes = computeNodes()',
        },
      },
    ]);
  });

  it('does not duplicate streamed Claude Code text or thinking when final assistant wrapper has no id', () => {
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
        content_block: { type: 'thinking' },
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'Plan once.' },
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_stop', index: 0 },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'text' },
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'text_delta', text: 'Write once.' },
      },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_stop', index: 1 },
    })}\n${JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'thinking', thinking: 'Plan once.' },
          { type: 'text', text: 'Write once.' },
        ],
      },
    })}\n`);
    handler.flush();

    expect(events.filter((event) => (
      typeof event === 'object'
      && event !== null
      && (event as { type?: string }).type === 'thinking_delta'
    ))).toEqual([{ type: 'thinking_delta', delta: 'Plan once.' }]);
    expect(events.filter((event) => (
      typeof event === 'object'
      && event !== null
      && (event as { type?: string }).type === 'text_delta'
    ))).toEqual([{ type: 'text_delta', delta: 'Write once.' }]);
  });

  it('does not suppress later wrapper-only Claude Code text without an id after streamed output', () => {
    const events: unknown[] = [];
    const handler = createClaudeStreamHandler((event: unknown) => events.push(event));

    handler.feed(`${JSON.stringify({
      type: 'stream_event',
      event: { type: 'message_start', message: { id: 'msg-1' } },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Streamed once.' },
      },
    })}\n${JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'Streamed once.' }],
      },
    })}\n${JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'Wrapper only.' }],
      },
    })}\n`);
    handler.flush();

    expect(events.filter((event) => (
      typeof event === 'object'
      && event !== null
      && (event as { type?: string }).type === 'text_delta'
    ))).toEqual([
      { type: 'text_delta', delta: 'Streamed once.' },
      { type: 'text_delta', delta: 'Wrapper only.' },
    ]);
  });

  it('keeps wrapper-only Claude Code text after streamed thinking without an id', () => {
    const events: unknown[] = [];
    const handler = createClaudeStreamHandler((event: unknown) => events.push(event));

    handler.feed(`${JSON.stringify({
      type: 'stream_event',
      event: { type: 'message_start', message: { id: 'msg-1' } },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'Plan streamed.' },
      },
    })}\n${JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'thinking', thinking: 'Plan streamed.' },
          { type: 'text', text: 'Answer from wrapper.' },
        ],
      },
    })}\n`);
    handler.flush();

    expect(events.filter((event) => (
      typeof event === 'object'
      && event !== null
      && (event as { type?: string }).type === 'thinking_delta'
    ))).toEqual([{ type: 'thinking_delta', delta: 'Plan streamed.' }]);
    expect(events.filter((event) => (
      typeof event === 'object'
      && event !== null
      && (event as { type?: string }).type === 'text_delta'
    ))).toEqual([{ type: 'text_delta', delta: 'Answer from wrapper.' }]);
  });

  it('keeps wrapper-only Claude Code thinking after streamed text without an id', () => {
    const events: unknown[] = [];
    const handler = createClaudeStreamHandler((event: unknown) => events.push(event));

    handler.feed(`${JSON.stringify({
      type: 'stream_event',
      event: { type: 'message_start', message: { id: 'msg-1' } },
    })}\n${JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Answer streamed.' },
      },
    })}\n${JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Answer streamed.' },
          { type: 'thinking', thinking: 'Plan from wrapper.' },
        ],
      },
    })}\n`);
    handler.flush();

    expect(events.filter((event) => (
      typeof event === 'object'
      && event !== null
      && (event as { type?: string }).type === 'text_delta'
    ))).toEqual([{ type: 'text_delta', delta: 'Answer streamed.' }]);
    expect(events.filter((event) => (
      typeof event === 'object'
      && event !== null
      && (event as { type?: string }).type === 'thinking_delta'
    ))).toEqual([{ type: 'thinking_delta', delta: 'Plan from wrapper.' }]);
  });

  it('maps Claude result terminal_reason into usage stopReason', () => {
    const events: unknown[] = [];
    const handler = createClaudeStreamHandler((event: unknown) => events.push(event));

    handler.feed(`${JSON.stringify({
      type: 'result',
      subtype: 'success',
      terminal_reason: 'completed',
      duration_ms: 42,
    })}\n`);
    handler.flush();

    expect(events).toContainEqual({
      type: 'usage',
      usage: null,
      costUsd: null,
      durationMs: 42,
      stopReason: 'completed',
    });
  });

  it('surfaces an is_error result as an error, not a silent success', () => {
    // Real installed Claude CLI error-termination shape, locked by the #4275
    // regression fixtures: is_error true, stop_reason null, human string in
    // errors[]. The parser must not wash this frame into a plain usage event —
    // qoder-stream already honors this contract for the same frame family.
    const events: Array<Record<string, unknown>> = [];
    const handler = createClaudeStreamHandler((event: unknown) => {
      events.push(event as Record<string, unknown>);
    });

    handler.feed(`${JSON.stringify({
      type: 'result',
      subtype: 'error_during_execution',
      duration_ms: 0,
      duration_api_ms: 0,
      is_error: true,
      num_turns: 0,
      stop_reason: null,
      session_id: '00000000-0000-0000-0000-000000000000',
      total_cost_usd: 0,
      errors: ['No conversation found with session ID: 00000000-0000-0000-0000-000000000000'],
    })}\n`);
    handler.flush();

    const usage = events.find((event) => event.type === 'usage');
    expect(usage).toMatchObject({ isError: true });

    const error = events.find((event) => event.type === 'error');
    expect(error).toBeDefined();
    expect(String(error?.message)).toContain('No conversation found with session ID');
  });

  it('does not flag a successful result as an error', () => {
    const events: Array<Record<string, unknown>> = [];
    const handler = createClaudeStreamHandler((event: unknown) => {
      events.push(event as Record<string, unknown>);
    });

    handler.feed(`${JSON.stringify({
      type: 'result',
      subtype: 'success',
      duration_ms: 42,
      is_error: false,
      stop_reason: 'end_turn',
    })}\n`);
    handler.flush();

    expect(events.find((event) => event.type === 'error')).toBeUndefined();
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

  it('routes GitHub Copilot failing tool executions through the tool-loop guard', () => {
    // Regression for PR #3375: Copilot's stream callback emitted agent events
    // with a bare send('agent', …) that bypassed the guard, so a Copilot run
    // could repeat a failing tool call indefinitely while other runtimes were
    // stopped. The server now emits every agent event through one choke point
    // that feeds the guard; this composes the real Copilot parser with the real
    // guard the same way, so the runtime cannot silently drift out of coverage.
    const guard = createToolLoopGuard({ mode: 'halt' });
    const handler = createCopilotStreamHandler((event: any) => {
      // Mirror server.ts emitAgentEvent's observation of tool events.
      if (event?.type === 'tool_use' && typeof event.id === 'string') {
        guard.observeToolUse(event.id, event.name ?? 'tool', event.input);
      } else if (event?.type === 'tool_result' && typeof event.toolUseId === 'string') {
        guard.observeToolResult(event.toolUseId, Boolean(event.isError), event.content ?? '');
      }
    });
    // The same failing tool call, over and over, with no success between them.
    for (let i = 0; i < 8; i += 1) {
      handler.feed(`${JSON.stringify({
        type: 'tool.execution_start',
        data: { toolCallId: `call-${i}`, toolName: 'Bash', arguments: { command: 'verify.sh' } },
      })}\n`);
      handler.feed(`${JSON.stringify({
        type: 'tool.execution_complete',
        data: { toolCallId: `call-${i}`, success: false, result: 'exit 1' },
      })}\n`);
    }
    handler.flush();

    expect(guard.halted).toBe(true);
  });

  it('emits GitHub Copilot CLI result usage tokens', () => {
    const events: unknown[] = [];
    const handler = createCopilotStreamHandler((event: unknown) => events.push(event));
    handler.feed(`${JSON.stringify({
      type: 'result',
      success: true,
      usage: {
        input_tokens: 21,
        output_tokens: 8,
        sessionDurationMs: 1234,
      },
    })}\n`);
    handler.flush();

    expect(events).toContainEqual({
      type: 'usage',
      usage: {
        input_tokens: 21,
        output_tokens: 8,
        sessionDurationMs: 1234,
      },
      stopReason: 'completed',
      durationMs: 1234,
    });
  });

  it('routes GitHub Copilot failing tool executions through the tool-loop guard', () => {
    const guard = createToolLoopGuard({ mode: 'halt' });
    const handler = createCopilotStreamHandler((event: any) => {
      if (event?.type === 'tool_use' && typeof event.id === 'string') {
        guard.observeToolUse(event.id, event.name ?? 'tool', event.input);
      } else if (event?.type === 'tool_result' && typeof event.toolUseId === 'string') {
        guard.observeToolResult(event.toolUseId, Boolean(event.isError), event.content ?? '');
      }
    });

    for (let i = 0; i < 8; i += 1) {
      handler.feed(`${JSON.stringify({
        type: 'tool.execution_start',
        data: { toolCallId: `call-${i}`, toolName: 'Bash', arguments: { command: 'verify.sh' } },
      })}\n`);
      handler.feed(`${JSON.stringify({
        type: 'tool.execution_complete',
        data: { toolCallId: `call-${i}`, success: false, result: 'exit 1' },
      })}\n`);
    }
    handler.flush();

    expect(guard.halted).toBe(true);
  });
});
