/**
 * 用**真实录制**回放一遍落块规则。
 *
 * 为什么必须有这一层(踩坑 #13):D26 那条错误规则在文档上完全自洽,是真实事件
 * 播放时才暴露的。构造用例只能证明「我以为的情况」成立,真 trace 才能证明
 * 「agent 真实的行为」成立。
 *
 * 夹具由 `docs/design/chat-sim/recordings/*.jsonl` 转出:只做三件事 ——
 * 按 `user` 事件切轮、丢掉 `tool_input_delta` 这类中间帧、把超长字符串截到 2000。
 * 事件的种类、顺序、入参形状全部保持原样。
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import { isExpandable } from '../../../src/runtime/chat/contract';
import type { ExecutionShell, ProseBlock, ShellItem, ToolRow } from '../../../src/runtime/chat/contract';
import codexTodo from '../../fixtures/chat/codex-todo.turn0.json';
import claudeShop from '../../fixtures/chat/claude-shop.turn0.json';
import opencodeTodo from '../../fixtures/chat/opencode-todo.turn0.json';


/** 严格索引下 `arr[i]` 是 `T | undefined`;测试里越界就是断言写错了,直接抛 */
function nth<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`fixture/assertion 越界:index ${i} of ${arr.length}`);
  return v;
}
const last = <T>(arr: readonly T[]): T => nth(arr, arr.length - 1);

interface Fixture {
  source: string;
  runStatus: string;
  events: PersistedAgentEvent[];
}

function replay(fixture: unknown) {
  const f = fixture as Fixture;
  const blocks = buildTurnBlocks({
    events: f.events,
    runStatus: f.runStatus as 'succeeded' | 'failed' | 'canceled',
  });
  return {
    blocks,
    shells: blocks.filter((b): b is ExecutionShell => b.kind === 'shell'),
    prose: blocks.filter((b): b is ProseBlock => b.kind === 'prose'),
  };
}

const toolsOf = (items: readonly ShellItem[]): ToolRow[] =>
  items.filter((i): i is ToolRow => i.kind === 'tool');
const textsOf = (items: readonly ShellItem[]): string[] =>
  items.filter((i): i is { kind: 'text'; text: string } => i.kind === 'text').map((i) => i.text);

describe('codex 真实一轮:原生清单只有做完 / 没做完两档', () => {
  const { blocks, shells } = replay(codexTodo);

  it('第一块永远钉在最前面(D29 ① / D42)', () => {
    expect(nth(blocks, 0).kind).toBe('shell');
  });

  it('一轮最多两块', () => {
    expect(shells.length).toBeLessThanOrEqual(2);
  });

  it('四条 todo 都在,顺序与 agent 给的一致', () => {
    const card = last(shells);
    expect(card.segments).toHaveLength(4);
    expect(nth(card.segments, 0).content).toContain('视觉方向');
  });

  it('**D36 回归**:codex 从不标 in_progress,第一条未完成的被隐式点亮并收到了内容', () => {
    const card = last(shells);
    expect(nth(card.segments, 0).implicit).toBe(true);
    expect(nth(card.segments, 0).status).not.toBe('pending');
    // 没有 D36 这条规则时,整轮的工具全落在卡片层级,四条 todo 一条内容都没有(T7 的由来)
    const inSegments = card.segments.flatMap((s) => toolsOf(s.items));
    expect(inSegments.length).toBeGreaterThan(0);
  });

  it('确实有 todo 名下没有内容(它们被一次性关掉)—— 这批要划线且不可展开(D35)', () => {
    const card = last(shells);
    const empty = card.segments.filter((s) => !isExpandable(s));
    expect(empty.length).toBeGreaterThan(0);
  });

  it('清单反复推进(录制里三次 TodoWrite)不会开出第三块(D26)', () => {
    const todoCalls = (codexTodo as Fixture).events.filter(
      (e) => e.kind === 'tool_use' && /todo/i.test(e.name),
    );
    expect(todoCalls.length).toBeGreaterThanOrEqual(3);
    expect(shells.length).toBeLessThanOrEqual(2);
  });
});

describe('claude 真实一轮:没有清单,thinking 全是空串', () => {
  const { blocks, shells, prose } = replay(claudeShop);

  it('没有清单就是平铺一块,不分段', () => {
    expect(shells).toHaveLength(1);
    expect(nth(shells, 0).segments).toHaveLength(0);
  });

  it('工具行数量与录制一致(去重后不重复落行)', () => {
    const uses = new Set(
      (claudeShop as Fixture).events.filter((e) => e.kind === 'tool_use').map((e) => (e as { id: string }).id),
    );
    const rows = toolsOf(nth(shells, 0).items);
    expect(rows.length).toBeGreaterThan(15);
    expect(rows.length).toBeLessThanOrEqual(uses.size);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it('247 条空 thinking 不产生任何空段落(S21)', () => {
    const emptyish = textsOf(nth(shells, 0).items).filter((t) => !t.trim());
    expect(emptyish).toHaveLength(0);
  });

  /*
   * 2026-08-26 **最终裁决**:done 之前的一切都在卡片里;整轮没发 done 时,
   * 兜底把最后一段**回答**提到卡外(否则一个只答话的回合会被整段埋进收起的抽屉)。
   *
   * 这条真实轨迹正是那种轮次:claude 一整轮没有 TodoWrite、也从不发 `<done/>`。
   * 所以期望是「过程叙述留在卡片里,只有最后那一段在卡外」。
   */
  it('没有清单也没发 done 的整轮:过程留在卡片里,只有最后一段回答在卡外', () => {
    expect(prose).toHaveLength(1);
    expect(nth(prose, 0).text.trim().length).toBeGreaterThan(0);
    expect(textsOf(nth(shells, 0).items).length).toBeGreaterThan(0);
  });

  it('连续的 text 增量合并成段落,而不是 25 行碎片', () => {
    const deltas = (claudeShop as Fixture).events.filter((e) => e.kind === 'text').length;
    const paragraphs = textsOf(nth(shells, 0).items).length + prose.length;
    expect(deltas).toBeGreaterThan(20);
    expect(paragraphs).toBeLessThan(deltas);
  });

  it('结论排在最后,不会跑到壳前面', () => {
    expect(nth(blocks, 0).kind).toBe('shell');
    expect(last(blocks).kind).toBe('prose');
  });
});

describe('opencode 真实一轮:起手就 401 失败', () => {
  const { shells, prose } = replay(opencodeTodo);

  it('整轮没有任何 agent 内容,壳仍然出现且转运行失败(D10 + B18)', () => {
    expect(shells).toHaveLength(1);
    expect(nth(shells, 0).items).toHaveLength(0);
    expect(nth(shells, 0).status).toBe('failed');
  });

  it('失败轮不编结论', () => {
    expect(prose).toHaveLength(0);
  });
});
