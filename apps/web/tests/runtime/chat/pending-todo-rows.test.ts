// @vitest-environment node
/**
 * 红测(B28):清单说「5 步」,壳里就该看得见 5 条。
 *
 * 线上量到:「执行计划 · 5 步」在,底下却只有第 1 条 todo 抽屉,后 4 条不见了。
 * 真因是落块时写着「`status !== 'pending'` 才推成行」—— 还没开始的那几条
 * 连行都不建,于是「说好的 5 步」和「看得见的 1 步」对不上。
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell } from '../../../src/runtime/chat/contract';

const todos = (id: string, items: Array<[string, string]>): PersistedAgentEvent[] => ([
  { kind: 'tool_use', id, name: 'TodoWrite', input: { todos: items.map(([content, status]) => ({ content, status })) } },
]);

const shellsOf = (events: PersistedAgentEvent[]) =>
  buildTurnBlocks({ events, runStatus: 'running', nowMs: 60_000 })
    .filter((b): b is ExecutionShell => b.kind === 'shell');

describe('还没开始的步骤也要出行', () => {
  const events = todos('p1', [
    ['确定单页主题与真实文案', 'in_progress'],
    ['落版式', 'pending'],
    ['做响应式', 'pending'],
    ['自查对比度', 'pending'],
    ['出图', 'pending'],
  ]);

  it('5 步就出 5 条 todo 行', () => {
    const card = shellsOf(events)[0]!;
    const rows = card.items.filter((i) => i.kind === 'todo');
    expect(rows).toHaveLength(5);
  });

  it('顺序按清单原样,不把进行中的那条提前', () => {
    const card = shellsOf(events)[0]!;
    const names = card.items
      .filter((i) => i.kind === 'todo')
      .map((i) => (i as { segment: { content: string } }).segment.content);
    expect(names).toEqual(['确定单页主题与真实文案', '落版式', '做响应式', '自查对比度', '出图']);
  });
});

/*
 * 回归守卫:**同一条 todo 只出一行**。
 *
 * 「还没开始的也出行」上线当天就中过 —— 清单一到 `addPlan` 已经把每条都推成行了,
 * 后面状态从 pending 推进到 in_progress 时又推了一遍,屏幕上同一条 todo
 * 出现两次、内容和秒数一模一样(用户真机指认)。
 */
describe('同一条 todo 只出一行', () => {
  it('从 pending 推进到 in_progress 不会再推一行', () => {
    const shells = shellsOf([
      ...todos('p1', [['确定结构', 'pending'], ['落版式', 'pending']]),
      ...todos('p2', [['确定结构', 'in_progress'], ['落版式', 'pending']]),
      ...todos('p3', [['确定结构', 'completed'], ['落版式', 'in_progress']]),
    ]);
    const card = shells[shells.length - 1]!;
    const names = card.items
      .filter((i) => i.kind === 'todo')
      .map((i) => (i as { segment: { content: string } }).segment.content);
    expect(names).toEqual(['确定结构', '落版式']);
  });

  it('每条 todo 在 items 里最多出现一次', () => {
    const shells = shellsOf([
      ...todos('p1', [['A', 'in_progress'], ['B', 'pending'], ['C', 'pending']]),
      ...todos('p2', [['A', 'completed'], ['B', 'in_progress'], ['C', 'pending']]),
      ...todos('p3', [['A', 'completed'], ['B', 'completed'], ['C', 'in_progress']]),
    ]);
    const card = shells[shells.length - 1]!;
    const segs = card.items.filter((i) => i.kind === 'todo').map((i) => (i as { segment: unknown }).segment);
    expect(new Set(segs).size).toBe(segs.length);
    expect(segs).toHaveLength(3);
  });
});
