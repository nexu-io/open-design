/**
 * 一次工具调用只准发一条 `tool_use`,**不管两条发射路径谁先到**。
 *
 * `claude-stream.ts` 有两个地方会发 `tool_use`:
 *
 *  1. `content_block_stop` —— 用 `input_json_delta` 拼出来的输入(增量路径)
 *  2. `assistant` 包装帧 —— Claude Code 在消息收尾时把整条消息重放一遍
 *
 * 去重集合原来只有**增量路径往里写**,却由**包装帧路径去读**。名字
 * (`streamedToolUseIds`,「已经从 delta 发过的」)说的是一件事,读它的人当成
 * 另一件事(「已经发过的」)用 —— 于是只要包装帧**先到**,它查集合是空的、照发,
 * 随后 `content_block_stop` 再发一次,同一个 tool id 就出去了两条。
 *
 * 这不是假设。2026-08-28 用户诊断包(packaged `0.21.1-beta.4`)里三个 claude run
 * **无一例外**:`2ef6b81b` 3 个工具发 6 条、`3fc3b3ae` 40 个工具发 80 条、
 * `c28db28f` 4 个工具发 8 条,每个 id 恰好 ×2,47/47 对的 `input` 逐字节相同、
 * 只差 5–25ms。同一批 run 里 `text_delta` / `thinking_delta` / `tool_result`
 * 都不重复 —— 只有 `tool_use` 重。反推:那个 build 里**包装帧稳定早于
 * `content_block_stop` 到达**(只有这个顺序能产出两条;反过来第一条会写进集合,
 * 第二条就被挡下了)。
 *
 * web 侧 `dedupeToolUsesById` 会按 id 收掉重复,所以聊天里看不出来 —— 正因如此
 * 这组用例**只断言 daemon 发出的事件流本身**,不看任何渲染结果。脏的是
 * `events.jsonl`,任何不做去重的消费方(工具计数、分析口径、Langfuse span、
 * run 完整性判定)都会读到 2 倍工具数。
 *
 * 另一半同样重要:**去重不能变成丢事件**。增量路径在包装帧不来时是唯一发射者
 * (回合被取消),包装帧在旧版 Claude Code 没有 `--include-partial-messages` 时
 * 是唯一发射者。两种「只有一条路会到」的形态都必须照发不误,所以下面既钉重复,
 * 也钉「恰好一条」而不是「至多一条」。
 */

import { describe, expect, it } from 'vitest';
import { createClaudeStreamHandler } from '../../src/runtimes/claude-stream.js';

type Event = Record<string, unknown>;

const TOOL_ID = 'toolu_01Un9XXC7scuaEf3E12mf2B6';
const REAL_INPUT = { command: 'cat .od-frames/layout.css', description: 'Read staged layout primitives' };

/** 把若干帧喂进解析器,收集它发出的事件。 */
function run(lines: object[]): Event[] {
  const events: Event[] = [];
  const handler = createClaudeStreamHandler((ev) => events.push(ev as Event));
  handler.feed(lines.map((line) => JSON.stringify(line)).join('\n') + '\n');
  handler.flush();
  return events;
}

function toolUses(events: Event[]): Event[] {
  return events.filter((ev) => ev.type === 'tool_use');
}

const messageStart = {
  type: 'stream_event',
  event: { type: 'message_start', message: { id: 'msg_1' } },
};

/** `content_block_start` 带 `input: {}` —— Anthropic 协议里 tool_use 块就是这么开的。 */
const blockStart = {
  type: 'stream_event',
  event: {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'tool_use', id: TOOL_ID, name: 'Bash', input: {} },
  },
};

function inputDelta(partialJson: string) {
  return {
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: partialJson },
    },
  };
}

const blockStop = { type: 'stream_event', event: { type: 'content_block_stop', index: 0 } };

/** Claude Code 收尾时重放整条消息;`input` 给什么由 build 决定,所以做成参数。 */
function assistantWrapper(input: unknown = REAL_INPUT) {
  return {
    type: 'assistant',
    parent_tool_use_id: null,
    message: {
      id: 'msg_1',
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: TOOL_ID, name: 'Bash', input }],
    },
  };
}

const serialized = JSON.stringify(REAL_INPUT);
const deltaHead = serialized.slice(0, 20);
const deltaTail = serialized.slice(20);

describe('claude-stream:一次工具调用只发一条 tool_use', () => {
  it('常规序(content_block_stop 先、assistant 后)', () => {
    const emitted = toolUses(run([
      messageStart, blockStart, inputDelta(deltaHead), inputDelta(deltaTail), blockStop, assistantWrapper(),
    ]));
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.input).toEqual(REAL_INPUT);
  });

  /**
   * 这一条就是线上那个缺陷的形状 —— 诊断包里 47/47 个工具走的都是它。
   * 修复前这里发出 2 条。
   */
  it('包装帧先到、content_block_stop 后到(线上实际顺序)', () => {
    const emitted = toolUses(run([
      messageStart, blockStart, inputDelta(deltaHead), inputDelta(deltaTail), assistantWrapper(), blockStop,
    ]));
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.input).toEqual(REAL_INPUT);
  });

  it('没有 message_start、包装帧先到', () => {
    const emitted = toolUses(run([
      blockStart, inputDelta(deltaHead), inputDelta(deltaTail), assistantWrapper(), blockStop,
    ]));
    expect(emitted).toHaveLength(1);
  });

  it('没有 message_start、content_block_stop 先到', () => {
    const emitted = toolUses(run([
      blockStart, inputDelta(deltaHead), inputDelta(deltaTail), blockStop, assistantWrapper(),
    ]));
    expect(emitted).toHaveLength(1);
  });

  it('完全没有 input delta(输入只挂在块头和包装帧上)', () => {
    const emitted = toolUses(run([messageStart, blockStart, blockStop, assistantWrapper()]));
    expect(emitted).toHaveLength(1);
  });
});

/**
 * 一条 assistant 消息里可以并排开多个 tool_use 块。包装帧路径要按 **id** 找回
 * 对应那个还开着的块去取 delta 拼好的输入,所以「按 id 找块」这一步必须认得准 ——
 * 拿错块就会把 A 工具的命令安到 B 工具头上,比重复更难查。
 */
describe('claude-stream:同一条消息里的多个工具各归各的', () => {
  it('两个并排的 tool_use 块,各发一条、输入不串', () => {
    const secondId = 'toolu_01UbGJQZd58oAcXbCkeF7RgK';
    const secondInput = { command: 'curl -s https://example.invalid', description: 'Fetch' };
    const secondSerialized = JSON.stringify(secondInput);
    const emitted = toolUses(run([
      messageStart,
      blockStart,
      {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: secondId, name: 'Bash', input: {} },
        },
      },
      inputDelta(deltaHead),
      inputDelta(deltaTail),
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: secondSerialized },
        },
      },
      // 包装帧先到,两个块都还开着 —— 正是要按 id 分辨的时刻
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          id: 'msg_1',
          stop_reason: 'tool_use',
          content: [
            { type: 'tool_use', id: TOOL_ID, name: 'Bash', input: {} },
            { type: 'tool_use', id: secondId, name: 'Bash', input: {} },
          ],
        },
      },
      blockStop,
      { type: 'stream_event', event: { type: 'content_block_stop', index: 1 } },
    ]));
    expect(emitted).toHaveLength(2);
    expect(emitted.find((ev) => ev.id === TOOL_ID)?.input).toEqual(REAL_INPUT);
    expect(emitted.find((ev) => ev.id === secondId)?.input).toEqual(secondInput);
  });
});

/**
 * 去重的另一半:**只有一条路会到的形态,那一条必须照发**。
 * 这两条钉的是「恰好 1」,不是「≤ 1」—— 防止修复把唯一那次也吞掉。
 */
describe('claude-stream:去重不吞掉唯一的那一次', () => {
  it('包装帧从未到达(回合被取消)—— 增量路径仍要发', () => {
    const emitted = toolUses(run([
      messageStart, blockStart, inputDelta(deltaHead), inputDelta(deltaTail), blockStop,
    ]));
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.input).toEqual(REAL_INPUT);
  });

  it('旧版 Claude Code 没有 --include-partial-messages —— 只有包装帧,也要发', () => {
    const emitted = toolUses(run([assistantWrapper()]));
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.input).toEqual(REAL_INPUT);
  });
});

/**
 * 保真:增量路径拼出来的输入是权威的。
 *
 * `streamedToolUseIds` 那句注释记着「Claude Code still repeats them in the final
 * assistant wrapper, **often with empty `{}` inputs**」—— 增量路径优先正是为了这个。
 * 一旦按「谁先到谁算数」去重,而那个 build 又恰好是包装帧先到,空 `{}` 就会盖掉
 * 真正的命令。诊断包里两个 build 47/47 对的输入都是满的,没撞上这一格,
 * 但它是修复顺序颠倒后天然打开的一个口子,所以先钉住。
 */
describe('claude-stream:包装帧的空输入不许盖掉 delta 拼出的真输入', () => {
  it('包装帧先到且 input 为空对象', () => {
    const emitted = toolUses(run([
      messageStart, blockStart, inputDelta(deltaHead), inputDelta(deltaTail), assistantWrapper({}), blockStop,
    ]));
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.input).toEqual(REAL_INPUT);
  });

  it('delta 被截断(JSON 不完整)时回退到包装帧的输入', () => {
    const emitted = toolUses(run([
      messageStart, blockStart, inputDelta('{"command":"cat '), assistantWrapper(), blockStop,
    ]));
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.input).toEqual(REAL_INPUT);
  });
});
