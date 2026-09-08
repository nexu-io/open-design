import { describe, expect, it } from 'vitest';
import { createCodexAppServerNormalizer } from '../src/agent-protocol/codex-app-server/normalize.js';

type Ev = Record<string, unknown>;

function drive(frames: Array<{ method: string; params?: unknown }>) {
  const events: Ev[] = [];
  const normalizer = createCodexAppServerNormalizer((ev) => events.push(ev));
  for (const frame of frames) normalizer.handleNotification(frame.method, frame.params ?? {});
  return { events, stats: normalizer.stats() };
}

const THREAD = { threadId: 't1', turnId: 'turn1' };

describe('codex app-server -> OpenDesign event normalization', () => {
  it('reports the thread id on the session-capture status channel', () => {
    const { events } = drive([
      { method: 'thread/started', params: { thread: { id: 'th-abc', cwd: '/w' } } },
    ]);
    expect(events).toEqual([
      { type: 'status', label: 'initializing', sessionId: 'th-abc' },
    ]);
  });

  it('marks the turn as thinking', () => {
    const { events } = drive([
      { method: 'turn/started', params: { ...THREAD, turn: { id: 'turn1', status: 'inProgress' } } },
    ]);
    expect(events).toEqual([{ type: 'status', label: 'thinking' }]);
  });

  describe('assistant text', () => {
    it('streams every agentMessage delta as a text_delta', () => {
      const { events } = drive([
        { method: 'item/agentMessage/delta', params: { ...THREAD, itemId: 'm1', delta: 'Hel' } },
        { method: 'item/agentMessage/delta', params: { ...THREAD, itemId: 'm1', delta: 'lo' } },
      ]);
      expect(events).toEqual([
        { type: 'text_delta', delta: 'Hel' },
        { type: 'text_delta', delta: 'lo' },
      ]);
    });

    it('does not replay text already streamed when the item completes', () => {
      const { events } = drive([
        { method: 'item/agentMessage/delta', params: { ...THREAD, itemId: 'm1', delta: 'Hello' } },
        {
          method: 'item/completed',
          params: { ...THREAD, item: { type: 'agentMessage', id: 'm1', text: 'Hello' } },
        },
      ]);
      expect(events).toEqual([{ type: 'text_delta', delta: 'Hello' }]);
    });

    it('emits the tail when the completed text runs past the streamed deltas', () => {
      const { events } = drive([
        { method: 'item/agentMessage/delta', params: { ...THREAD, itemId: 'm1', delta: 'Hel' } },
        {
          method: 'item/completed',
          params: { ...THREAD, item: { type: 'agentMessage', id: 'm1', text: 'Hello' } },
        },
      ]);
      expect(events).toEqual([
        { type: 'text_delta', delta: 'Hel' },
        { type: 'text_delta', delta: 'lo' },
      ]);
    });

    it('emits the whole message when no delta ever arrived', () => {
      const { events } = drive([
        {
          method: 'item/completed',
          params: { ...THREAD, item: { type: 'agentMessage', id: 'm1', text: 'Hello' } },
        },
      ]);
      expect(events).toEqual([{ type: 'text_delta', delta: 'Hello' }]);
    });

    it('separates two consecutive messages the way exec --json does', () => {
      const { events } = drive([
        {
          method: 'item/completed',
          params: { ...THREAD, item: { type: 'agentMessage', id: 'm1', text: 'first' } },
        },
        {
          method: 'item/completed',
          params: { ...THREAD, item: { type: 'agentMessage', id: 'm2', text: 'second' } },
        },
      ]);
      expect(events).toEqual([
        { type: 'text_delta', delta: 'first' },
        { type: 'text_delta', delta: '\nsecond' },
      ]);
    });

    it('does not insert a separator across an intervening tool call', () => {
      const { events } = drive([
        {
          method: 'item/completed',
          params: { ...THREAD, item: { type: 'agentMessage', id: 'm1', text: 'first' } },
        },
        {
          method: 'item/started',
          params: {
            ...THREAD,
            item: { type: 'commandExecution', id: 'c1', command: 'ls', status: 'inProgress' },
          },
        },
        {
          method: 'item/completed',
          params: { ...THREAD, item: { type: 'agentMessage', id: 'm2', text: 'second' } },
        },
      ]);
      expect(events.filter((e) => e.type === 'text_delta')).toEqual([
        { type: 'text_delta', delta: 'first' },
        { type: 'text_delta', delta: 'second' },
      ]);
    });
  });

  describe('reasoning', () => {
    it('streams reasoning summary deltas as thinking_delta', () => {
      const { events } = drive([
        {
          method: 'item/reasoning/summaryTextDelta',
          params: { ...THREAD, itemId: 'r1', summaryIndex: 0, delta: '**Think' },
        },
        {
          method: 'item/reasoning/summaryTextDelta',
          params: { ...THREAD, itemId: 'r1', summaryIndex: 0, delta: 'ing**' },
        },
      ]);
      expect(events).toEqual([
        { type: 'thinking_delta', delta: '**Think' },
        { type: 'thinking_delta', delta: 'ing**' },
      ]);
    });

    it('joins separate summary parts with a newline, matching exec --json', () => {
      const { events } = drive([
        {
          method: 'item/reasoning/summaryTextDelta',
          params: { ...THREAD, itemId: 'r1', summaryIndex: 0, delta: 'A' },
        },
        {
          method: 'item/reasoning/summaryPartAdded',
          params: { ...THREAD, itemId: 'r1', summaryIndex: 1 },
        },
        {
          method: 'item/reasoning/summaryTextDelta',
          params: { ...THREAD, itemId: 'r1', summaryIndex: 1, delta: 'B' },
        },
      ]);
      expect(events.map((e) => e.delta).join('')).toBe('A\nB');
    });

    it('separates distinct reasoning items with a blank line', () => {
      const { events } = drive([
        {
          method: 'item/reasoning/summaryTextDelta',
          params: { ...THREAD, itemId: 'r1', summaryIndex: 0, delta: 'A' },
        },
        {
          method: 'item/reasoning/summaryTextDelta',
          params: { ...THREAD, itemId: 'r2', summaryIndex: 0, delta: 'B' },
        },
      ]);
      expect(events.map((e) => e.delta).join('')).toBe('A\n\nB');
    });

    it('does not replay the summary when the reasoning item completes', () => {
      const { events } = drive([
        {
          method: 'item/reasoning/summaryTextDelta',
          params: { ...THREAD, itemId: 'r1', summaryIndex: 0, delta: 'A' },
        },
        {
          method: 'item/completed',
          params: { ...THREAD, item: { type: 'reasoning', id: 'r1', summary: ['A'], content: [] } },
        },
      ]);
      expect(events).toEqual([{ type: 'thinking_delta', delta: 'A' }]);
    });

    it('falls back to the completed summary when no delta arrived', () => {
      const { events } = drive([
        {
          method: 'item/completed',
          params: {
            ...THREAD,
            item: { type: 'reasoning', id: 'r1', summary: ['A', 'B'], content: [] },
          },
        },
      ]);
      expect(events).toEqual([{ type: 'thinking_delta', delta: 'A\nB' }]);
    });

    it('streams raw reasoning text deltas used by local OSS models', () => {
      const { events } = drive([
        {
          method: 'item/reasoning/textDelta',
          params: { ...THREAD, itemId: 'r1', contentIndex: 0, delta: 'Inspecting ' },
        },
        {
          method: 'item/reasoning/textDelta',
          params: { ...THREAD, itemId: 'r1', contentIndex: 0, delta: 'the files' },
        },
      ]);
      expect(events).toEqual([
        { type: 'thinking_delta', delta: 'Inspecting ' },
        { type: 'thinking_delta', delta: 'the files' },
      ]);
    });

    it('falls back to completed raw reasoning content without replaying streamed text', () => {
      const { events } = drive([
        {
          method: 'item/reasoning/textDelta',
          params: { ...THREAD, itemId: 'r1', contentIndex: 0, delta: 'Inspecting ' },
        },
        {
          method: 'item/completed',
          params: {
            ...THREAD,
            item: {
              type: 'reasoning',
              id: 'r1',
              summary: [],
              content: ['Inspecting the files'],
            },
          },
        },
      ]);
      expect(events).toEqual([
        { type: 'thinking_delta', delta: 'Inspecting ' },
        { type: 'thinking_delta', delta: 'the files' },
      ]);
    });

    it('keeps raw content visible when a summary is also present', () => {
      const { events } = drive([
        {
          method: 'item/reasoning/summaryTextDelta',
          params: { ...THREAD, itemId: 'r1', summaryIndex: 0, delta: '**Inspecting files**' },
        },
        {
          method: 'item/reasoning/textDelta',
          params: { ...THREAD, itemId: 'r1', contentIndex: 0, delta: 'I will inspect the files.' },
        },
      ]);
      expect(events).toEqual([
        { type: 'thinking_delta', delta: '**Inspecting files**' },
        { type: 'thinking_delta', delta: '\n\nI will inspect the files.' },
      ]);
    });
  });

  describe('tool items', () => {
    it('maps commandExecution onto the Bash tool pair', () => {
      const { events } = drive([
        {
          method: 'item/started',
          params: {
            ...THREAD,
            item: { type: 'commandExecution', id: 'c1', command: 'echo hi', status: 'inProgress' },
          },
        },
        {
          method: 'item/completed',
          params: {
            ...THREAD,
            item: {
              type: 'commandExecution',
              id: 'c1',
              command: 'echo hi',
              aggregatedOutput: 'hi\n',
              exitCode: 0,
              status: 'completed',
            },
          },
        },
      ]);
      expect(events).toEqual([
        { type: 'tool_use', id: 'c1', name: 'Bash', input: { command: 'echo hi' } },
        { type: 'tool_result', toolUseId: 'c1', content: 'hi\n', isError: false },
      ]);
    });

    it('flags a non-zero exit code as an error result', () => {
      const { events } = drive([
        {
          method: 'item/completed',
          params: {
            ...THREAD,
            item: {
              type: 'commandExecution',
              id: 'c1',
              command: 'false',
              aggregatedOutput: '',
              exitCode: 1,
              status: 'failed',
            },
          },
        },
      ]);
      expect(events.at(-1)).toEqual({
        type: 'tool_result',
        toolUseId: 'c1',
        content: '',
        isError: true,
      });
    });

    it('maps a fileChange add onto Write and an update onto Edit', () => {
      const { events } = drive([
        {
          method: 'item/completed',
          params: {
            ...THREAD,
            item: {
              type: 'fileChange',
              id: 'f1',
              status: 'completed',
              changes: [
                { path: '/w/a.html', kind: { type: 'add' }, diff: '+x' },
                { path: '/w/b.css', kind: { type: 'update', move_path: null }, diff: '+y' },
              ],
            },
          },
        },
      ]);
      // `od_diff_stat` is counted off the `diff` this frame carries. It is the
      // whole reason the diff stopped being discarded here: without it a codex
      // file row showed elapsed time where the identical row under Claude
      // showed `+N −M`. Both changes are a single added line, so both read 1/0.
      expect(events).toEqual([
        {
          type: 'tool_use',
          id: 'f1#0',
          name: 'Write',
          input: { file_path: '/w/a.html', od_diff_stat: { added: 1, removed: 0 } },
        },
        {
          type: 'tool_use',
          id: 'f1#1',
          name: 'Edit',
          input: { file_path: '/w/b.css', od_diff_stat: { added: 1, removed: 0 } },
        },
        { type: 'tool_result', toolUseId: 'f1#0', content: '', isError: false },
        { type: 'tool_result', toolUseId: 'f1#1', content: '', isError: false },
      ]);
    });

    it('carries no diff stat when the frame carries no diff to count', () => {
      // The guard on the line above: a stat is only ever reported when a real
      // `diff` arrived. `emitCodexFileChangeToolUses` keeps `input` at its
      // single-key shape otherwise, so the older `exec --json` wire — which
      // never sent a diff — produces byte-identical events to what it did
      // before the stat existed, and no row invents a `+0 −0`.
      const { events } = drive([
        {
          method: 'item/completed',
          params: {
            ...THREAD,
            item: {
              type: 'fileChange',
              id: 'f2',
              status: 'completed',
              changes: [{ path: '/w/c.md', kind: { type: 'add' } }],
            },
          },
        },
      ]);
      const use = events.find((event) => event.type === 'tool_use');
      expect(use).toEqual({
        type: 'tool_use',
        id: 'f2#0',
        name: 'Write',
        input: { file_path: '/w/c.md' },
      });
    });

    it('leaves a delete-kind change unrendered, exactly like exec --json', () => {
      const { events } = drive([
        {
          method: 'item/completed',
          params: {
            ...THREAD,
            item: {
              type: 'fileChange',
              id: 'f1',
              status: 'completed',
              changes: [{ path: '/w/a.html', kind: { type: 'delete' }, diff: '' }],
            },
          },
        },
      ]);
      expect(events).toEqual([]);
    });

    it('maps an mcpToolCall onto the mcp__server__tool name shape', () => {
      const { events } = drive([
        {
          method: 'item/started',
          params: {
            ...THREAD,
            item: {
              type: 'mcpToolCall',
              id: 'x1',
              server: 'echofacts',
              tool: 'echo_fact',
              arguments: { topic: 'cats' },
              status: 'inProgress',
              result: null,
              error: null,
            },
          },
        },
        {
          method: 'item/completed',
          params: {
            ...THREAD,
            item: {
              type: 'mcpToolCall',
              id: 'x1',
              server: 'echofacts',
              tool: 'echo_fact',
              arguments: { topic: 'cats' },
              status: 'failed',
              result: null,
              error: { message: 'denied' },
            },
          },
        },
      ]);
      expect(events).toEqual([
        {
          type: 'tool_use',
          id: 'x1',
          name: 'mcp__echofacts__echo_fact',
          input: { topic: 'cats' },
        },
        { type: 'tool_result', toolUseId: 'x1', content: 'denied', isError: true },
      ]);
    });

    /*
     * 起始帧的 `query` 真的一直是空的(`action.type` 在这一刻是 `other`,
     * 搜索词只存在于 `item/completed`)。这条测试原本钉的是「没有搜索词的
     * 搜索行,比没有行更糟」—— 于是起始帧什么都不发。
     *
     * 产品 2026-09-03 推翻了那个取舍:调用**发出的那一刻**就必须上屏并开始计时,
     * 绝不能调完了才出现。一个没有搜索词的行照样回答了用户真正在问的问题
     * ——「它卡在哪」—— 因为它带着秒表。
     *
     * 所以这里现在是三件事,不是两件:早期的 `tool_in_flight` + 落定的
     * `tool_use` + `tool_result`。前两者**共享同一个 id**,客户端靠
     * `dropSupersededInFlightToolUses` 把早行退休进落定行,屏幕上仍然是
     * 一行一个秒表,不是两行。
     */
    it('起始帧就发出早期行,落定帧再补上搜索词', () => {
      const { events } = drive([
        {
          method: 'item/started',
          params: {
            ...THREAD,
            item: { type: 'webSearch', id: 'w1', query: '', action: { type: 'other' }, results: null },
          },
        },
        {
          method: 'item/completed',
          params: {
            ...THREAD,
            item: {
              type: 'webSearch',
              id: 'w1',
              query: 'codex release notes',
              action: { type: 'search', query: 'codex release notes' },
              results: null,
            },
          },
        },
      ]);
      expect(events).toEqual([
        { type: 'tool_in_flight', id: 'w1', name: 'web_search', input: {} },
        { type: 'tool_use', id: 'w1', name: 'web_search', input: { query: 'codex release notes' } },
        { type: 'tool_result', toolUseId: 'w1', content: '', isError: false },
      ]);
    });

    it('maps the turn plan onto the canonical TodoWrite snapshot', () => {
      const { events } = drive([
        {
          method: 'turn/plan/updated',
          params: {
            ...THREAD,
            explanation: null,
            plan: [
              { step: 'Read the spec', status: 'completed' },
              { step: 'Write the code', status: 'in_progress' },
              { step: 'Ship it', status: 'pending' },
            ],
          },
        },
      ]);
      expect(events).toEqual([
        {
          type: 'tool_use',
          id: expect.any(String),
          name: 'TodoWrite',
          input: {
            todos: [
              { content: 'Read the spec', status: 'completed' },
              { content: 'Write the code', status: 'in_progress' },
              { content: 'Ship it', status: 'pending' },
            ],
          },
        },
      ]);
    });
  });

  describe('usage', () => {
    it('carries every token counter through as a usage event', () => {
      const { events } = drive([
        {
          method: 'thread/tokenUsage/updated',
          params: {
            ...THREAD,
            tokenUsage: {
              total: {
                totalTokens: 16600,
                inputTokens: 16412,
                cachedInputTokens: 8576,
                cacheWriteInputTokens: 128,
                outputTokens: 188,
                reasoningOutputTokens: 60,
              },
              last: {
                totalTokens: 1,
                inputTokens: 1,
                cachedInputTokens: 0,
                cacheWriteInputTokens: 0,
                outputTokens: 0,
                reasoningOutputTokens: 0,
              },
              modelContextWindow: 258400,
            },
          },
        },
      ]);
      expect(events).toEqual([
        {
          type: 'usage',
          usage: {
            input_tokens: 16412,
            output_tokens: 188,
            thought_tokens: 60,
            cached_read_tokens: 8576,
            cached_write_tokens: 128,
            total_tokens: 16600,
          },
        },
        // The same notification also carries the LIVE thinking reading. Two
        // events rather than one field because the two have different
        // lifetimes: `usage` is persisted with the run, `thinking_tokens` is
        // deliberately live-only (`chat-run-messages.ts`). Full coverage —
        // monotonic clamp, zero suppression, `total` vs `last` — lives in
        // `codex-thinking-tokens.test.ts`.
        { type: 'thinking_tokens', tokens: 60 },
      ]);
    });

    it('uses the cumulative total, not the last step', () => {
      const { events } = drive([
        {
          method: 'thread/tokenUsage/updated',
          params: {
            ...THREAD,
            tokenUsage: {
              total: {
                totalTokens: 100,
                inputTokens: 90,
                cachedInputTokens: 0,
                cacheWriteInputTokens: 0,
                outputTokens: 10,
                reasoningOutputTokens: 0,
              },
              last: {
                totalTokens: 7,
                inputTokens: 6,
                cachedInputTokens: 0,
                cacheWriteInputTokens: 0,
                outputTokens: 1,
                reasoningOutputTokens: 0,
              },
              modelContextWindow: null,
            },
          },
        },
      ]);
      const usage = events[0]?.usage as Record<string, number>;
      expect(usage.input_tokens).toBe(90);
      expect(usage.output_tokens).toBe(10);
    });
  });

  describe('failures and notices', () => {
    it('routes an error notification onto the fatal error channel', () => {
      const { events } = drive([
        {
          method: 'error',
          params: {
            ...THREAD,
            willRetry: false,
            error: { message: 'upstream exploded', codexErrorInfo: 'serverOverloaded' },
          },
        },
      ]);
      expect(events).toEqual([{ type: 'error', message: 'upstream exploded' }]);
    });

    it('treats a retrying error as a status, not a run failure', () => {
      const { events } = drive([
        {
          method: 'error',
          params: { ...THREAD, willRetry: true, error: { message: 'reconnecting' } },
        },
      ]);
      expect(events).toEqual([{ type: 'status', label: 'reconnecting' }]);
    });

    it('surfaces a failed turn as an error', () => {
      const { events } = drive([
        {
          method: 'turn/completed',
          params: {
            ...THREAD,
            turn: { id: 'turn1', items: [], status: 'failed', error: { message: 'turn died' } },
          },
        },
      ]);
      expect(events).toEqual([{ type: 'error', message: 'turn died' }]);
    });

    it('emits nothing extra for a completed turn', () => {
      const { events } = drive([
        {
          method: 'turn/completed',
          params: {
            ...THREAD,
            turn: { id: 'turn1', items: [], status: 'completed', error: null },
          },
        },
      ]);
      expect(events).toEqual([]);
    });

    it('shows an in-stream warning as a warning pill', () => {
      const { events } = drive([
        { method: 'warning', params: { threadId: 't1', message: 'skills were shortened' } },
      ]);
      expect(events).toEqual([
        { type: 'status', label: 'warning', detail: 'skills were shortened' },
      ]);
    });
  });

  describe('forward compatibility', () => {
    it('ignores an unknown notification method instead of throwing', () => {
      const { events, stats } = drive([
        { method: 'thread/telepathy/updated', params: { brainWaves: 12 } },
        { method: 'turn/started', params: THREAD },
      ]);
      expect(events).toEqual([{ type: 'status', label: 'thinking' }]);
      expect(stats.unknownNotifications).toBe(1);
    });

    it('ignores an unknown item type instead of throwing', () => {
      const { events, stats } = drive([
        {
          method: 'item/completed',
          params: { ...THREAD, item: { type: 'quantumEntanglement', id: 'q1' } },
        },
      ]);
      expect(events).toEqual([]);
      expect(stats.unknownItems).toBe(1);
    });

    it('ignores unexpected extra fields on a known item', () => {
      const { events } = drive([
        {
          method: 'item/completed',
          params: {
            ...THREAD,
            item: {
              type: 'commandExecution',
              id: 'c1',
              command: 'echo hi',
              aggregatedOutput: 'hi\n',
              exitCode: 0,
              status: 'completed',
              somethingBrandNew: { nested: true },
            },
            futureField: 'whatever',
          },
        },
      ]);
      expect(events.at(-1)).toEqual({
        type: 'tool_result',
        toolUseId: 'c1',
        content: 'hi\n',
        isError: false,
      });
    });

    it('survives a malformed params payload', () => {
      expect(() => drive([{ method: 'item/completed', params: null }])).not.toThrow();
      expect(() => drive([{ method: 'item/completed', params: 'nope' }])).not.toThrow();
      expect(() => drive([{ method: 'thread/tokenUsage/updated', params: {} }])).not.toThrow();
    });
  });
});
