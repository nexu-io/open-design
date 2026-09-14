/**
 * 写文件那一行的文件名,必须在 `content` 还在传的时候就已经能拿到。
 *
 * 真机上模型把一个 20KB 的 HTML 写进 `Write` 的入参里,`file_path` 是这串 JSON 的
 * **第一个字段** —— 头几十字节就够了。可 daemon 直到 `content_block_stop`(或
 * `assistant` 包装帧)才发 `tool_use`,所以那一整段时间界面上一个字都没有。
 *
 * 录音证据(`../fixtures/claude-cli-recordings/claude-2.1.259-partial-single-turn.jsonl`,
 * 真 CLI 2.1.259 的逐字节 stdout,不是手搭帧):
 *
 *   L15 '{"file_path": "/private/tmp/claude-501'
 *   L16 '/-Users-elian-Documents-open-design/bff58f5e-18'
 *   L17 'bb-4b58-96e7-8180846e980a/'
 *   L18 'scratchpad/w107/cwd/alpha.html'
 *   L19 '", "content": "<!doctype html><html><body'   ← 路径在这一帧收尾
 *   L20 '><h1>Alpha</h1></body></html>'
 *   L21 '"}'
 *
 * 路径在 L19 就完整了,`tool_use` 要等到 L22 之后。中间隔的帧数就是白屏时间。
 *
 * ⚠️ 这一单**不许**把原始 JSON 转给前端 —— `tool_input_delta` 的 payload 是
 * 「只看到达时间、不看内容」的心跳(见 `packages/contracts/src/sse/chat.ts` 上那段
 * 注释,以及 `apps/web/tests/components/chat/tool-input-delta-dead-wiring.test.ts`)。
 * daemon 从它**已经在攒**的缓冲里增量解析出路径,拿到之后发**一次**几十字节的
 * `tool_input_target`,原始 JSON 一个字节都不出 daemon。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createClaudeStreamHandler } from '../../src/runtimes/claude-stream.js';

type Event = Record<string, unknown>;

function readRecording(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/claude-cli-recordings/${name}`, import.meta.url)),
    'utf8',
  );
}

/**
 * Replay a recording **one stdout line at a time**, stamping every emitted
 * event with the source line that produced it. The line index is the test's
 * clock: it is the only way to assert "the name arrived N frames before the
 * content finished" without a wall clock.
 */
function replayWithLineNumbers(source: string, options: Record<string, unknown> = {}): Event[] {
  const events: Event[] = [];
  let line = 0;
  const handler = createClaudeStreamHandler((event) => {
    events.push({ __line: line, ...(event as Event) });
  }, options);
  for (const raw of source.split('\n')) {
    if (!raw.trim()) continue;
    line += 1;
    handler.feed(`${raw}\n`);
  }
  handler.flush();
  return events;
}

const SINGLE_TURN = 'claude-2.1.259-partial-single-turn.jsonl';
const TWO_TURNS = 'claude-2.1.259-partial-two-turns.jsonl';
const ECHO = 'claude-2.1.259-partial-same-turn-echo.jsonl';
const NO_PARTIAL = 'claude-2.1.259-no-partial-messages.jsonl';

function firstOfType(events: Event[], type: string): Event | undefined {
  return events.find((event) => event.type === type);
}

describe('W115 · 在途写文件行的文件名', () => {
  /**
   * 防真空:先证明「量法看得见缺陷」。
   *
   * 这条不是断言实现,是断言**录音里确实存在那段空窗**:路径字符在 `tool_use`
   * 之前很多帧就已经流过去了。如果哪天 CLI 改成一次性发完整入参,这条会红,
   * 那时整个 W115 也就没意义了 —— 它是本文件其余断言的前提。
   */
  it('前提:录音里路径字符比 tool_use 早好几帧(空窗真实存在)', () => {
    const events = replayWithLineNumbers(readRecording(SINGLE_TURN));
    const deltas = events.filter((event) => event.type === 'tool_input_delta');
    const toolUse = firstOfType(events, 'tool_use');

    expect(deltas.length, '录音里没有 input_json_delta —— 换一份录音').toBeGreaterThan(3);
    expect(toolUse, '录音里没有 tool_use').toBeDefined();

    const assembled = deltas.map((event) => String(event.delta)).join('');
    expect(assembled).toContain('alpha.html');

    // 路径在哪一帧收尾:第一次凑出 `alpha.html"` 的那一帧
    let acc = '';
    let pathCompleteLine = -1;
    for (const delta of deltas) {
      acc += String(delta.delta);
      if (pathCompleteLine < 0 && /alpha\.html"/u.test(acc)) pathCompleteLine = Number(delta.__line);
    }
    expect(pathCompleteLine).toBeGreaterThan(0);
    expect(Number(toolUse?.__line)).toBeGreaterThan(pathCompleteLine);
  });

  /**
   * 正向。入参只到了一半(路径已出、content 还在传)时,daemon 已经把文件名发出来了。
   */
  it('路径一收尾就发一次 tool_input_target,早于 tool_use', () => {
    const events = replayWithLineNumbers(readRecording(SINGLE_TURN));
    const target = firstOfType(events, 'tool_input_target');
    const toolUse = firstOfType(events, 'tool_use');

    expect(target, '路径已经完整了,却没有任何事件带着文件名').toBeDefined();
    expect(target?.name).toBe('Write');
    expect(String(target?.path)).toMatch(/alpha\.html$/u);
    expect(target?.id).toBe(toolUse?.id);

    // 早于 tool_use —— 这就是这一单的全部意义
    expect(
      Number(target?.__line),
      '文件名和 tool_use 同一帧到 —— 等于没提前',
    ).toBeLessThan(Number(toolUse?.__line));
  });

  /** 只发一次:每来一个 delta 就重发一遍路径,等于把心跳变成了广播。 */
  it('同一个工具调用只发一次', () => {
    const events = replayWithLineNumbers(readRecording(SINGLE_TURN));
    const targets = events.filter((event) => event.type === 'tool_input_target');
    expect(targets).toHaveLength(1);
  });

  /**
   * 入参传完之后,行上的名字和最终解析出来的一致 —— 不会先显示一个、后变成另一个。
   */
  it('提前发的路径和最终 tool_use.input 里的完全一致', () => {
    for (const recording of [SINGLE_TURN, TWO_TURNS, ECHO]) {
      const events = replayWithLineNumbers(readRecording(recording));
      const targets = events.filter((event) => event.type === 'tool_input_target');
      expect(targets.length, `${recording}: 一个 target 都没有`).toBeGreaterThan(0);

      for (const target of targets) {
        const finalCall = events.find(
          (event) => event.type === 'tool_use' && event.id === target.id,
        );
        expect(finalCall, `${recording}: target ${String(target.id)} 没有对应的 tool_use`).toBeDefined();
        const input = finalCall?.input as Record<string, unknown> | undefined;
        expect(
          input?.file_path ?? input?.path,
          `${recording}: 提前发的名字和最终入参对不上`,
        ).toBe(target.path);
      }
    }
  });

  /**
   * ⚠️ 最重要的一条反向对照:**原始 JSON 没有进事件流。**
   *
   * `tool_input_target` 的 payload 只有 id / name / path / startedAt。那 20KB 的
   * `content` 一个字节都不许出现在它身上。
   *
   * ⚠️ `startedAt` 是 W136 有意加的第四个字段,**一个数字**,不是入参的任何一部分:
   * `Edit` / `MultiEdit` / `NotebookEdit` / `replace` 在途算不出 `−M`,所以
   * `tool_input_progress` 一条都不发 —— 这一条是它们**唯一**的早期事件,起点不搭在
   * 它身上就没有第二次机会,行上会只有文件名而秒表不走。名单是白名单不是计数:
   * 再多任何一个字段都必须先回答「它是不是从入参里抄出来的」。
   */
  it('反向:target 事件里没有一个字节的 content', () => {
    const events = replayWithLineNumbers(readRecording(SINGLE_TURN));
    const targets = events.filter((event) => event.type === 'tool_input_target');
    expect(targets.length).toBeGreaterThan(0);

    for (const target of targets) {
      const { __line: _line, ...payload } = target;
      // 只有这四个字段,多一个都不行
      expect(Object.keys(payload).sort()).toEqual(['id', 'name', 'path', 'startedAt', 'type'].sort());
      // 而且新加的那个必须是数字 —— 白名单挡不住「换了个名字的正文」
      expect(typeof payload.startedAt, 'startedAt 不是数字 —— 白名单被塞了别的东西').toBe('number');
      const serialized = JSON.stringify(payload);
      expect(serialized, '文件正文漏进 target 事件了').not.toContain('doctype');
      expect(serialized).not.toContain('<h1>');
      // 几十字节,不是几十 KB
      expect(serialized.length).toBeLessThan(400);
    }
  });

  /**
   * 反向:路径不是第一个字段时,不显示半截 —— 拿不到就什么都不发。
   *
   * 这条用手搭帧,因为真录音里模型恰好都把 `file_path` 放在最前面;这里要测的是
   * **模型不保证字段顺序**这个假设本身,只能构造。帧的外壳照抄录音里的
   * `stream_event` 形状(见下面 `frameShape`)。
   */
  it('反向:路径值还没收尾时一个字都不发', () => {
    const events: Event[] = [];
    const handler = createClaudeStreamHandler((event) => events.push(event as Event));
    for (const frame of frameShape([
      '{"content": "<!doctype html><html><body><h1>x</h1>',
      '</body></html>", "file_path": "/repo/late.h',
    ])) {
      handler.feed(`${JSON.stringify(frame)}\n`);
    }
    // 故意不发 content_block_stop:模型还在写
    expect(
      events.filter((event) => event.type === 'tool_input_target'),
      '路径只到 "/repo/late.h" 就把半截名字发出去了',
    ).toHaveLength(0);
  });

  /** 同一条构造流,路径收尾之后就该发了 —— 证明上一条不是「永远不发」。 */
  it('正向对照:同一条流里路径一收尾就发(不是永远不发)', () => {
    const events: Event[] = [];
    const handler = createClaudeStreamHandler((event) => events.push(event as Event));
    for (const frame of frameShape([
      '{"content": "<html></html>", "file_path": "/repo/late.h',
      'tml"}',
    ])) {
      handler.feed(`${JSON.stringify(frame)}\n`);
    }
    const targets = events.filter((event) => event.type === 'tool_input_target');
    expect(targets).toHaveLength(1);
    expect(targets[0]?.path).toBe('/repo/late.html');
  });

  /** 反向:非文件类工具行为不变 —— Bash / Grep 也走 input_json_delta。 */
  it('反向:Bash / Grep 不发 target', () => {
    for (const [tool, json] of [
      ['Bash', ['{"command": "cat > /repo/login.html <<', "'ODEOF'\"}"]],
      ['Grep', ['{"pattern": "foo", "path": "/repo', '/src"}']],
    ] as const) {
      const events: Event[] = [];
      const handler = createClaudeStreamHandler((event) => events.push(event as Event));
      for (const frame of frameShape([...json], tool)) {
        handler.feed(`${JSON.stringify(frame)}\n`);
      }
      expect(
        events.filter((event) => event.type === 'tool_input_target'),
        `${tool} 也发了 target —— 这一档只给确实写文件的工具`,
      ).toHaveLength(0);
    }
  });

  /**
   * 反向:没有 `--include-partial-messages` 时压根没有 delta,自然一个 target 都没有,
   * 而 `tool_use` 照常。这一档是纯增量,不许改变原有输出。
   */
  it('反向:没有 partial-messages 的录音里 tool_use 不受影响', () => {
    const events = replayWithLineNumbers(readRecording(NO_PARTIAL));
    expect(events.filter((event) => event.type === 'tool_input_target')).toHaveLength(0);
    expect(events.filter((event) => event.type === 'tool_use').length).toBeGreaterThan(0);
  });
});

/**
 * 一个流式 tool_use 内容块的 `stream_event` 帧序列,外壳逐字照抄
 * `claude-2.1.259-partial-single-turn.jsonl` 的 L13–L21。
 */
function frameShape(partials: string[], toolName = 'Write'): Record<string, unknown>[] {
  const wrap = (event: Record<string, unknown>): Record<string, unknown> => ({
    type: 'stream_event',
    uuid: 'w115',
    session_id: 'w115',
    parent_tool_use_id: null,
    event,
  });
  return [
    wrap({
      type: 'message_start',
      message: { id: 'msg_w115', type: 'message', role: 'assistant', model: 'x', content: [], stop_reason: null },
    }),
    wrap({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'toolu_w115', name: toolName, input: {} },
    }),
    ...partials.map((partial_json) =>
      wrap({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json } }),
    ),
  ];
}
