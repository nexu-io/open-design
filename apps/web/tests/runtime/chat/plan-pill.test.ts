/**
 * Plan 药丸的判据 —— 纯函数,不启 jsdom(chat/AGENTS.md §5)。
 *
 * 组件那一层(`tests/components/chat/plan-pill.test.tsx`)验的是「钉在哪、和队列谁上谁下」;
 * 这里验的是「该不该出、N 是谁、每一步落哪一档记号」。
 */
import { describe, expect, it } from 'vitest';
import { planPillState, type PlanPillTodo } from '../../../src/runtime/chat/plan-pill';

const todo = (content: string, status: PlanPillTodo['status']): PlanPillTodo => ({ content, status });

const FOUR: PlanPillTodo[] = [
  todo('复刻商品列表页结构与栅格', 'completed'),
  todo('抽出商品卡为共享组件', 'completed'),
  todo('按同一套间距做设置页', 'in_progress'),
  todo('接上两页之间的跳转', 'pending'),
];

describe('planPillState · 出没', () => {
  it('run 不在跑就不出', () => {
    expect(planPillState(FOUR, false)).toBeNull();
  });

  it('没有清单就不出 —— 不吐 TodoWrite 的 agent 不该占一行位', () => {
    expect(planPillState([], true)).toBeNull();
    expect(planPillState(undefined, true)).toBeNull();
  });

  it('全部完成就不出 —— 哪怕 run 还跑着', () => {
    const done = FOUR.map((t) => todo(t.content, 'completed'));
    expect(planPillState(done, true)).toBeNull();
  });

  it('还有没干完的就出', () => {
    expect(planPillState(FOUR, true)).not.toBeNull();
  });
});

describe('planPillState · N / M', () => {
  it('N 是「当前正在做第几步」,不是「已完成几步」', () => {
    const state = planPillState(FOUR, true);
    // 已完成 2 条,而当前在做第 3 条 —— 这两个数字不一样,药丸取的是后者
    expect(state).toMatchObject({ current: 3, total: 4 });
  });

  it('一条 in_progress 都没有时,第一条未完成的算当前(D36 隐式进行中)', () => {
    const state = planPillState([
      todo('复刻商品列表页结构与栅格', 'completed'),
      todo('抽出商品卡为共享组件', 'pending'),
      todo('按同一套间距做设置页', 'pending'),
    ], true);
    expect(state).toMatchObject({ current: 2, total: 3 });
    expect(state?.steps[1]).toMatchObject({ mark: 'running', current: true });
  });

  it('清单里有多条 in_progress 时取第一条', () => {
    const state = planPillState([
      todo('a', 'in_progress'),
      todo('b', 'in_progress'),
      todo('c', 'pending'),
    ], true);
    expect(state?.current).toBe(1);
  });

  it('当前那条排在已完成的前面时,N 照样指它 —— 不假设清单是有序的', () => {
    const state = planPillState([
      todo('a', 'in_progress'),
      todo('b', 'completed'),
      todo('c', 'completed'),
    ], true);
    expect(state).toMatchObject({ current: 1, total: 3 });
  });
});

describe('planPillState · 每一步的记号', () => {
  it('做完打勾并划掉、当前一颗球、没开始留一圈虚线', () => {
    const state = planPillState(FOUR, true);
    expect(state?.steps).toEqual([
      { content: '复刻商品列表页结构与栅格', mark: 'ok', current: false, struck: true },
      { content: '抽出商品卡为共享组件', mark: 'ok', current: false, struck: true },
      { content: '按同一套间距做设置页', mark: 'running', current: true, struck: false },
      { content: '接上两页之间的跳转', mark: 'pending', current: false, struck: false },
    ]);
  });

  it('中断 / 取消的那条走中性灰(未开始那一档),和执行记录同一个判据', () => {
    const state = planPillState([
      todo('a', 'in_progress'),
      todo('b', 'stopped'),
    ], true);
    expect(state?.steps[1]).toMatchObject({ mark: 'pending', struck: false });
  });

  it('步数与清单条数一一对应,一条不吞', () => {
    const state = planPillState(FOUR, true);
    expect(state?.steps).toHaveLength(FOUR.length);
    expect(state?.total).toBe(FOUR.length);
  });
});
