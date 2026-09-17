/**
 * 什么时候该多出第二张执行记录壳。
 *
 * **2026-08-26 最终裁决**:边界由「**卡外落过东西**」决定,**不由清单决定**。
 * 一轮正常跑完就是**一张**过程卡;只有 done 之后 agent 又开新计划继续干时,
 * 才在结论下面另起一张 —— 那时有一段正文把两张卡分开。
 *
 * 用户撤销「清单一到就分张」的原话:「如果有了 todowrite,不用第二张卡片,
 * 继续第一张卡片里继续输出就行了,因为此时肯定是没 done 信号的…卡片外面也没文本…
 * 会出现两张连起来的卡片,不太好。」
 *
 * 也就是说那条规则的产物**必然**是两张紧贴的卡:卡外唯一会出现的内容是 done 之后的
 * 结论,而 TodoWrite 必然在 done 之前。它还制造过两张卡头**显示同一个耗时**的坏画面
 * (thinking 事件不带时刻,前一张只能退回轮次跨度)。
 *
 * 更早的两版(T34「清单之前说过话才分张」、以及「第一张壳里有东西就分张」)都已作废,
 * 取舍全记在 `specs/current/chat-panel-feedback.md` 的 D 节。
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';

const call = (id: string, name: string, input: unknown): PersistedAgentEvent[] => ([
  { kind: 'tool_use', id, name, input },
  { kind: 'tool_result', toolUseId: id, content: 'ok', isError: false },
]);

const todo = (id: string, items: Array<[string, string]>): PersistedAgentEvent[] => ([
  { kind: 'tool_use', id, name: 'TodoWrite', input: { todos: items.map(([content, status]) => ({ content, status })) } },
]);

const shells = (events: PersistedAgentEvent[]) =>
  buildTurnBlocks({ events, runStatus: 'succeeded' }).filter((b) => b.kind === 'shell');

describe('第二张壳的出现条件', () => {
  it('清单之前干过活 → 仍然只有**一张**,活和清单前后排在同一张里', () => {
    const out = shells([
      ...call('t1', 'Read', { file_path: 'a.css' }),
      ...call('t2', 'Bash', { command: 'ls' }),
      ...todo('p1', [['复刻列表页', 'in_progress']]),
      ...call('t3', 'Write', { file_path: 'card.html', content: 'x' }),
    ]);
    expect(out).toHaveLength(1);
    expect((out[0] as { items: Array<{ kind: string }> }).items.map((i) => i.kind))
      .toEqual(['tool', 'tool', 'plan', 'todo']);
  });

  it('清单之前**什么都没干** → 空壳复用,不多出一张空卡', () => {
    const out = shells([
      ...todo('p1', [['复刻列表页', 'in_progress']]),
      ...call('t3', 'Write', { file_path: 'card.html', content: 'x' }),
    ]);
    expect(out).toHaveLength(1);
  });

  it('清单之前说过话 → 那句话也在这张卡里,壳外一条都没有', () => {
    const blocks = buildTurnBlocks({
      events: [
        { kind: 'text', text: '我先看一眼两张图的栅格。' },
        ...call('t1', 'Read', { file_path: 'a.css' }),
        ...todo('p1', [['复刻列表页', 'in_progress']]),
        ...call('t2', 'Write', { file_path: 'card.html', content: 'x' }),
      ],
      runStatus: 'succeeded',
    });
    const out = blocks.filter((b) => b.kind === 'shell');
    expect(out).toHaveLength(1);
    expect((out[0] as { items: Array<{ kind: string }> }).items.map((i) => i.kind))
      .toEqual(['text', 'tool', 'plan', 'todo']);
    expect(blocks.filter((b) => b.kind === 'prose')).toEqual([]);
  });

  it('第一张壳完全空着时仍然直接复用,不留空壳(D13,老规则不动)', () => {
    const out = shells([
      ...todo('p1', [['复刻列表页', 'in_progress']]),
      ...call('t1', 'Write', { file_path: 'card.html', content: 'x' }),
    ]);
    expect(out).toHaveLength(1);
  });
});
