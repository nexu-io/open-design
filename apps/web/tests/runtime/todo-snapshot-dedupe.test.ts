/**
 * 计划快照是**状态替换**,不是重复投递 —— 不能按 tool id 去重。
 *
 * 真机录到的形状(2026-08-26,`od-wt-chat-panel` 的 chatpanel 运行时):
 * 这一家 agent 把「计划」建模成**一个会被反复改写的条目**,五次 TodoWrite
 * 全都带同一个 id `item_2`,内容从「四条全 pending」一路推进到「四条全 completed」。
 *
 * `dedupeToolUsesById` 原来按 id 只留第一条,于是后四次全被丢掉 ——
 * 一轮跑完了,四条 todo 还全是虚线圈的「未开始」,第一条甚至同时挂着 35.1s 的耗时
 * 和「未开始」的记号。用户真机指认:「为什么计时结束了它还是进行中的状态,
 * 并且下面几个 todo 完全没有什么状态?」
 *
 * 去重本身要留着:SSE 重放会把同一次 tool_use 送两遍,那才是它要挡的。
 * 两者的区别不在 id,在**工具的语义**:快照型工具重复 id 是正常写法。
 */

import { describe, expect, it } from 'vitest';

import { dedupeToolUsesById } from '../../src/runtime/tool-events';
import type { AgentEvent } from '../../src/types';

const STEPS = ['用 ls 查看当前目录', '用 wc -l 数行数', '读 name 字段', '一句话总结'];
const snapshot = (doneCount: number) => ({
  todos: STEPS.map((content, i) => ({ content, status: i < doneCount ? 'completed' : 'pending' })),
});

/** 五次计划推进 + 中间夹着的真命令,全部照真机的 id 复用形状 */
function realWorldEvents(): AgentEvent[] {
  return [
    { kind: 'tool_use', id: 'item_2', name: 'TodoWrite', input: snapshot(0), startedAt: 1000 },
    { kind: 'tool_use', id: 'item_3', name: 'Bash', input: { command: 'ls' }, startedAt: 1100 },
    { kind: 'tool_use', id: 'item_2', name: 'TodoWrite', input: snapshot(1), startedAt: 2000 },
    { kind: 'tool_use', id: 'item_5', name: 'Bash', input: { command: 'wc -l package.json' }, startedAt: 2100 },
    { kind: 'tool_use', id: 'item_2', name: 'TodoWrite', input: snapshot(2), startedAt: 3000 },
    { kind: 'tool_use', id: 'item_2', name: 'TodoWrite', input: snapshot(4), startedAt: 4000 },
  ] as unknown as AgentEvent[];
}

describe('计划快照与 tool id 去重', () => {
  it('同一个 id 的多次计划推进全部留下 —— 最后一次必须是四条全完成', () => {
    const kept = dedupeToolUsesById(realWorldEvents())
      .filter((e) => e.kind === 'tool_use' && (e as { name: string }).name === 'TodoWrite');
    expect(kept).toHaveLength(4);
    const last = kept[kept.length - 1] as unknown as { input: { todos: { status: string }[] } };
    expect(last.input.todos.every((t) => t.status === 'completed')).toBe(true);
  });

  it('普通工具照旧按 id 去重 —— SSE 重放送两遍只留一条', () => {
    const events = [
      { kind: 'tool_use', id: 'dup', name: 'Bash', input: { command: 'ls' }, startedAt: 1 },
      { kind: 'tool_use', id: 'dup', name: 'Bash', input: { command: 'ls' }, startedAt: 1 },
      { kind: 'tool_use', id: 'other', name: 'Read', input: { file_path: 'a.ts' }, startedAt: 2 },
    ] as unknown as AgentEvent[];
    expect(dedupeToolUsesById(events)).toHaveLength(2);
  });

  it('计划快照本身重放两遍也无所谓 —— 落块是幂等的,宁可多留不可丢状态', () => {
    const events = [
      { kind: 'tool_use', id: 'p', name: 'TodoWrite', input: snapshot(1), startedAt: 1 },
      { kind: 'tool_use', id: 'p', name: 'TodoWrite', input: snapshot(1), startedAt: 1 },
    ] as unknown as AgentEvent[];
    expect(dedupeToolUsesById(events)).toHaveLength(2);
  });
});
