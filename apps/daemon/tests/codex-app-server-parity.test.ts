import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createJsonEventStreamHandler } from '../src/runtimes/json-event-stream.js';
import { createCodexAppServerNormalizer } from '../src/agent-protocol/codex-app-server/normalize.js';

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'codex-app-server',
);

type Ev = Record<string, unknown>;

/** Run a codex `exec --json` transcript through the shipping parser. */
function eventsFromExecJson(lines: string[]): Ev[] {
  const events: Ev[] = [];
  const handler = createJsonEventStreamHandler('codex', (ev) => events.push(ev));
  for (const line of lines) handler.feed(`${line}\n`);
  handler.flush();
  return events;
}

/** Run an app-server notification transcript through the new normalizer. */
function eventsFromAppServer(frames: Array<{ method: string; params?: unknown }>): Ev[] {
  const events: Ev[] = [];
  const normalizer = createCodexAppServerNormalizer((ev) => events.push(ev));
  for (const frame of frames) normalizer.handleNotification(frame.method, frame.params ?? {});
  return events;
}

/**
 * Reduce an event stream to the shape the product actually consumes, so two
 * transports can be compared without pretending their wire trivia matches.
 *
 * Three things are deliberately normalised away, and nothing else:
 *  - delta chunking: consecutive text/thinking deltas are concatenated, because
 *    the chat pane concatenates them. `exec --json` hands over whole messages,
 *    app-server hands over tokens; the rendered text is what must agree.
 *  - tool ids: codex mints `item_3` on one transport and `call_2Uix…` on the
 *    other. Ids are rewritten to first-seen ordinals, which PRESERVES the
 *    tool_use -> tool_result pairing — a mis-paired result lands on a different
 *    ordinal and the comparison fails.
 *  - `raw` frames, which `build-turn-blocks.ts` drops before rendering.
 */
function canonicalize(events: Ev[]): Ev[] {
  const idMap = new Map<string, string>();
  const mapId = (id: unknown): string => {
    const key = String(id);
    if (!idMap.has(key)) idMap.set(key, `tool#${idMap.size}`);
    return idMap.get(key) as string;
  };
  const out: Ev[] = [];
  for (const ev of events) {
    if (ev.type === 'raw') continue;
    if (ev.type === 'text_delta' || ev.type === 'thinking_delta') {
      const prev = out.at(-1);
      if (prev && prev.type === ev.type) {
        prev.delta = String(prev.delta) + String(ev.delta);
        continue;
      }
      out.push({ type: ev.type, delta: String(ev.delta) });
      continue;
    }
    if (ev.type === 'tool_use') {
      out.push({ type: 'tool_use', id: mapId(ev.id), name: ev.name, input: ev.input });
      continue;
    }
    if (ev.type === 'tool_result') {
      out.push({
        type: 'tool_result',
        toolUseId: mapId(ev.toolUseId),
        content: ev.content,
        isError: ev.isError,
      });
      continue;
    }
    if (ev.type === 'status' && ev.label === 'initializing') {
      // The session handle is codex-minted and differs per run; what has to
      // agree is that a non-empty handle was captured at all.
      out.push({
        type: 'status',
        label: 'initializing',
        sessionId: typeof ev.sessionId === 'string' && ev.sessionId.length > 0 ? '<captured>' : null,
      });
      continue;
    }
    out.push({ ...ev });
  }
  return out;
}

/**
 * Line counts are the second app-server superset, alongside token usage: only
 * that wire sends a file change's patch, so only that transport can report
 * `+N −M`. Stripping the counts here compares what BOTH transports can know;
 * the counts themselves are asserted separately, in both directions, so a
 * regression that stopped emitting them cannot hide inside this strip.
 */
const stripDiffStat = (input: unknown): unknown => {
  if (!input || typeof input !== 'object') return input;
  const { od_diff_stat: _dropped, ...rest } = input as Record<string, unknown>;
  return rest;
};

const toolSignature = (events: Ev[]) =>
  canonicalize(events)
    .filter((e) => e.type === 'tool_use')
    .map((e) => [e.name, stripDiffStat(e.input)]);

const diffStats = (events: Ev[]) =>
  events
    .filter((e) => e.type === 'tool_use')
    .map((e) => (e.input as Record<string, unknown> | null)?.od_diff_stat);

const renderedText = (events: Ev[]) =>
  events
    .filter((e) => e.type === 'text_delta')
    .map((e) => String(e.delta))
    .join('');

const usageEvents = (events: Ev[]) => events.filter((e) => e.type === 'usage');

/* ------------------------------------------------------------------ *
 * Part 1 — paired transcripts of one identical turn, deep-equal.
 * ------------------------------------------------------------------ */

/**
 * The same turn, transcribed on both wires. Hand-paired on purpose: a real
 * capture cannot be identical across two separate model invocations, and a
 * "same shape, roughly" assertion would not catch a mapping regression.
 */
const PAIRED_TURN = {
  execJson: [
    { type: 'thread.started', thread_id: 'th-1' },
    { type: 'turn.started' },
    {
      type: 'item.completed',
      item: { id: 'item_0', type: 'error', message: 'Skill descriptions were shortened.' },
    },
    {
      type: 'item.completed',
      item: { id: 'item_1', type: 'reasoning', text: '**Planning the work**\n**Double-checking**' },
    },
    {
      type: 'item.completed',
      item: { id: 'item_2', type: 'agent_message', text: 'Running the command now.' },
    },
    {
      type: 'item.started',
      item: {
        id: 'item_3',
        type: 'command_execution',
        command: "/bin/zsh -lc 'echo hi'",
        aggregated_output: '',
        exit_code: null,
        status: 'in_progress',
      },
    },
    {
      type: 'item.completed',
      item: {
        id: 'item_3',
        type: 'command_execution',
        command: "/bin/zsh -lc 'echo hi'",
        aggregated_output: 'hi\n',
        exit_code: 0,
        status: 'completed',
      },
    },
    {
      type: 'item.started',
      item: {
        id: 'item_4',
        type: 'file_change',
        changes: [{ path: '/WORK/notes.md', kind: 'add' }],
        status: 'in_progress',
      },
    },
    {
      type: 'item.completed',
      item: {
        id: 'item_4',
        type: 'file_change',
        changes: [{ path: '/WORK/notes.md', kind: 'add' }],
        status: 'completed',
      },
    },
    { type: 'item.completed', item: { id: 'item_5', type: 'agent_message', text: 'DONE' } },
    {
      type: 'turn.completed',
      usage: {
        input_tokens: 16412,
        cached_input_tokens: 8576,
        cache_write_input_tokens: 0,
        output_tokens: 188,
        reasoning_output_tokens: 60,
      },
    },
  ],
  appServer: [
    { method: 'thread/started', params: { thread: { id: 'th-1', cwd: '/WORK' } } },
    { method: 'turn/started', params: { threadId: 'th-1', turnId: 'tu-1' } },
    {
      method: 'warning',
      params: { threadId: 'th-1', message: 'Skill descriptions were shortened.' },
    },
    {
      method: 'item/started',
      params: {
        threadId: 'th-1',
        turnId: 'tu-1',
        item: { type: 'reasoning', id: 'rs_1', summary: [], content: [] },
      },
    },
    {
      method: 'item/reasoning/summaryTextDelta',
      params: { threadId: 'th-1', turnId: 'tu-1', itemId: 'rs_1', summaryIndex: 0, delta: '**Planning ' },
    },
    {
      method: 'item/reasoning/summaryTextDelta',
      params: { threadId: 'th-1', turnId: 'tu-1', itemId: 'rs_1', summaryIndex: 0, delta: 'the work**' },
    },
    {
      method: 'item/reasoning/summaryPartAdded',
      params: { threadId: 'th-1', turnId: 'tu-1', itemId: 'rs_1', summaryIndex: 1 },
    },
    {
      method: 'item/reasoning/summaryTextDelta',
      params: { threadId: 'th-1', turnId: 'tu-1', itemId: 'rs_1', summaryIndex: 1, delta: '**Double-checking**' },
    },
    {
      method: 'item/completed',
      params: {
        threadId: 'th-1',
        turnId: 'tu-1',
        item: {
          type: 'reasoning',
          id: 'rs_1',
          summary: ['**Planning the work**', '**Double-checking**'],
          content: [],
        },
      },
    },
    {
      method: 'item/started',
      params: {
        threadId: 'th-1',
        turnId: 'tu-1',
        item: { type: 'agentMessage', id: 'msg_1', text: '', phase: 'commentary' },
      },
    },
    {
      method: 'item/agentMessage/delta',
      params: { threadId: 'th-1', turnId: 'tu-1', itemId: 'msg_1', delta: 'Running the ' },
    },
    {
      method: 'item/agentMessage/delta',
      params: { threadId: 'th-1', turnId: 'tu-1', itemId: 'msg_1', delta: 'command now.' },
    },
    {
      method: 'item/completed',
      params: {
        threadId: 'th-1',
        turnId: 'tu-1',
        item: {
          type: 'agentMessage',
          id: 'msg_1',
          text: 'Running the command now.',
          phase: 'commentary',
        },
      },
    },
    {
      method: 'item/started',
      params: {
        threadId: 'th-1',
        turnId: 'tu-1',
        item: {
          type: 'commandExecution',
          id: 'call_1',
          command: "/bin/zsh -lc 'echo hi'",
          aggregatedOutput: null,
          exitCode: null,
          status: 'inProgress',
        },
      },
    },
    {
      method: 'item/completed',
      params: {
        threadId: 'th-1',
        turnId: 'tu-1',
        item: {
          type: 'commandExecution',
          id: 'call_1',
          command: "/bin/zsh -lc 'echo hi'",
          aggregatedOutput: 'hi\n',
          exitCode: 0,
          status: 'completed',
        },
      },
    },
    {
      method: 'item/started',
      params: {
        threadId: 'th-1',
        turnId: 'tu-1',
        item: {
          type: 'fileChange',
          id: 'call_2',
          changes: [{ path: '/WORK/notes.md', kind: { type: 'add' }, diff: 'BANANA\n' }],
          status: 'inProgress',
        },
      },
    },
    {
      method: 'item/completed',
      params: {
        threadId: 'th-1',
        turnId: 'tu-1',
        item: {
          type: 'fileChange',
          id: 'call_2',
          changes: [{ path: '/WORK/notes.md', kind: { type: 'add' }, diff: 'BANANA\n' }],
          status: 'completed',
        },
      },
    },
    {
      method: 'item/agentMessage/delta',
      params: { threadId: 'th-1', turnId: 'tu-1', itemId: 'msg_2', delta: 'DONE' },
    },
    {
      method: 'item/completed',
      params: {
        threadId: 'th-1',
        turnId: 'tu-1',
        item: { type: 'agentMessage', id: 'msg_2', text: 'DONE', phase: 'final_answer' },
      },
    },
    {
      method: 'thread/tokenUsage/updated',
      params: {
        threadId: 'th-1',
        turnId: 'tu-1',
        tokenUsage: {
          total: {
            totalTokens: 16600,
            inputTokens: 16412,
            cachedInputTokens: 8576,
            cacheWriteInputTokens: 0,
            outputTokens: 188,
            reasoningOutputTokens: 60,
          },
          last: {
            totalTokens: 16600,
            inputTokens: 16412,
            cachedInputTokens: 8576,
            cacheWriteInputTokens: 0,
            outputTokens: 188,
            reasoningOutputTokens: 60,
          },
          modelContextWindow: 258400,
        },
      },
    },
    {
      method: 'turn/completed',
      params: {
        threadId: 'th-1',
        turnId: 'tu-1',
        turn: { id: 'tu-1', items: [], status: 'completed', error: null },
      },
    },
  ],
};

describe('codex transport parity — paired transcript of one turn', () => {
  const execEvents = eventsFromExecJson(PAIRED_TURN.execJson.map((l) => JSON.stringify(l)));
  const appEvents = eventsFromAppServer(PAIRED_TURN.appServer);

  it('produces the same rendered event stream on both transports', () => {
    // Usage is compared separately: app-server is a strict superset (it reports
    // cache-write tokens that the exec-json parser has never read, and file
    // change line counts that the exec-json wire never sends at all).
    //
    // `thinking_tokens` joins that list for a structural reason, not a
    // convenient one: it is a LIVE reading, and `exec --json` has no live
    // reading to give. That wire reports token counts once, at
    // `turn.completed`, so a mid-turn progress signal cannot exist on it at
    // any fidelity. The one-directional assertion below pins the superset.
    const strip = (events: Ev[]) =>
      canonicalize(events)
        .filter((e) => e.type !== 'usage' && e.type !== 'thinking_tokens')
        .map((e) => (e.type === 'tool_use' ? { ...e, input: stripDiffStat(e.input) } : e));
    expect(strip(appEvents)).toEqual(strip(execEvents));
  });

  it('reports a live thinking-token reading on app-server only', () => {
    // The superset asserted in both directions, the same way the file-change
    // line counts are. `exec --json` reports tokens once at `turn.completed`,
    // so there is nothing there to render while the model is still thinking.
    const thinking = (events: Ev[]) =>
      events.filter((e) => e.type === 'thinking_tokens').map((e) => e.tokens);
    expect(thinking(appEvents).length).toBeGreaterThan(0);
    expect(thinking(execEvents)).toEqual([]);
  });

  it('reports file change line counts on app-server only, and no counts on exec-json', () => {
    // The superset, asserted in both directions: the recorded `add` change is
    // `diff: "BANANA\n"`, which is 2 under the same `split('\n').length` rule
    // Claude's `Write` uses. exec-json sends no patch, so it reports nothing.
    expect(diffStats(appEvents)).toEqual([undefined, { added: 2, removed: 0 }]);
    expect(diffStats(execEvents)).toEqual([undefined, undefined]);
  });

  it('agrees on the assistant text', () => {
    expect(renderedText(appEvents)).toBe(renderedText(execEvents));
    // No separator: the shipping `exec --json` rule only inserts a newline
    // between two ADJACENT assistant messages, and a tool call ran in between.
    // Reproducing that quirk byte-for-byte is the point of this assertion.
    expect(renderedText(execEvents)).toBe('Running the command now.DONE');
  });

  it('agrees on the tool calls and their pairing', () => {
    expect(toolSignature(appEvents)).toEqual(toolSignature(execEvents));
    expect(toolSignature(execEvents)).toEqual([
      ['Bash', { command: "/bin/zsh -lc 'echo hi'" }],
      ['Write', { file_path: '/WORK/notes.md' }],
    ]);
  });

  it('reports the same token counters, plus cache-write which exec drops', () => {
    const execUsage = usageEvents(execEvents).at(-1)?.usage as Record<string, number>;
    const appUsage = usageEvents(appEvents).at(-1)?.usage as Record<string, number>;
    expect(execUsage).toEqual({
      input_tokens: 16412,
      output_tokens: 188,
      thought_tokens: 60,
      cached_read_tokens: 8576,
    });
    for (const [key, value] of Object.entries(execUsage)) {
      expect(appUsage[key], `usage.${key}`).toBe(value);
    }
    expect(appUsage.cached_write_tokens).toBe(0);
    expect(appUsage.total_tokens).toBe(16600);
  });
});

/* ------------------------------------------------------------------ *
 * Part 2 — two REAL captures of the same prompt, one per transport.
 * ------------------------------------------------------------------ */

describe('codex transport parity — real captures', () => {
  const execLines = fs
    .readFileSync(path.join(FIXTURES, 'turn-exec-json.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean);
  const appFrames = fs
    .readFileSync(path.join(FIXTURES, 'turn-app-server.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { method: string; params?: unknown });

  const execEvents = eventsFromExecJson(execLines);
  const appEvents = eventsFromAppServer(appFrames);

  it('captures a session handle on both transports', () => {
    const init = (events: Ev[]) =>
      events.find((e) => e.type === 'status' && e.label === 'initializing');
    expect(typeof init(execEvents)?.sessionId).toBe('string');
    expect(typeof init(appEvents)?.sessionId).toBe('string');
    expect(String(init(appEvents)?.sessionId).length).toBeGreaterThan(0);
  });

  it('performs the same two tool calls', () => {
    const expected = [
      ['Bash', { command: "/bin/zsh -lc 'echo hi'" }],
      ['Write', { file_path: '/WORK/notes.md' }],
    ];
    expect(toolSignature(execEvents)).toEqual(expected);
    expect(toolSignature(appEvents)).toEqual(expected);
    // The real capture's `add` change carried `diff: "BANANA\n"` from the day
    // the transport landed; it was read for the first time by this branch.
    expect(diffStats(appEvents)).toEqual([undefined, { added: 2, removed: 0 }]);
    expect(diffStats(execEvents)).toEqual([undefined, undefined]);
  });

  it('pairs every tool_use with exactly one tool_result on both transports', () => {
    for (const [label, events] of [
      ['exec-json', execEvents],
      ['app-server', appEvents],
    ] as const) {
      const uses = events.filter((e) => e.type === 'tool_use').map((e) => e.id);
      const results = events.filter((e) => e.type === 'tool_result').map((e) => e.toolUseId);
      expect(new Set(results), label).toEqual(new Set(uses));
      expect(results.length, label).toBe(uses.length);
    }
  });

  it('surfaces the same skills warning', () => {
    const warning = (events: Ev[]) =>
      events.find((e) => e.type === 'status' && e.label === 'warning');
    expect(warning(appEvents)?.detail).toBe(warning(execEvents)?.detail);
    expect(String(warning(execEvents)?.detail)).toContain('Skill descriptions were shortened');
  });

  it('ends the assistant turn with the requested word on both transports', () => {
    expect(renderedText(execEvents).trim().endsWith('DONE')).toBe(true);
    expect(renderedText(appEvents).trim().endsWith('DONE')).toBe(true);
  });

  it('produces real reasoning text on the app-server transport', () => {
    const thinking = appEvents
      .filter((e) => e.type === 'thinking_delta')
      .map((e) => String(e.delta))
      .join('');
    expect(thinking).toContain('**');
    expect(thinking.length).toBeGreaterThan(10);
  });

  it('streams the assistant text incrementally instead of in one block', () => {
    // The whole point of the transport: exec --json can only deliver a whole
    // message, app-server delivers tokens. Positive control on both sides so
    // "we now stream" is not asserted against a stream that never existed.
    const execDeltas = execEvents.filter((e) => e.type === 'text_delta').length;
    const appDeltas = appEvents.filter((e) => e.type === 'text_delta').length;
    expect(execDeltas).toBeLessThanOrEqual(4);
    expect(appDeltas).toBeGreaterThan(20);
  });

  it('reports the exact token counters recorded in each capture', () => {
    const execUsage = usageEvents(execEvents).at(-1)?.usage as Record<string, number>;
    expect(execUsage).toEqual({
      input_tokens: 50002,
      output_tokens: 352,
      thought_tokens: 169,
      cached_read_tokens: 48768,
    });
    const appUsage = usageEvents(appEvents).at(-1)?.usage as Record<string, number>;
    expect(appUsage.input_tokens).toBe(49802);
    expect(appUsage.output_tokens).toBe(250);
    expect(appUsage.thought_tokens).toBe(60);
    expect(appUsage.cached_read_tokens).toBe(41088);
    expect(appUsage.cached_write_tokens).toBe(0);
    expect(appUsage.total_tokens).toBe(50052);
  });
});
