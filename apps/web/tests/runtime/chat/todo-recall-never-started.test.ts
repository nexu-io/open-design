import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import { isStruck } from '../../../src/runtime/chat/contract';
import type { ExecutionShell, TodoSegment, TurnBlock } from '../../../src/runtime/chat/contract';

/**
 * 真机复现(2026-08-27,产品负责人截图):一个**刚跑起来**的任务,
 * 「执行计划 · 5 步」下面五条 todo **全部画着删除线**,第一条还同时是「进行中」。
 *
 * 语料来自真实 run(会话 `7e97c7e9-4978-4b09-b2d0-f4842949cf89`):
 *  · 第 16 轮 `c8eec72e` 声明了这五条,**跑之前就被取消**,落库快照五条全 `pending`;
 *  · 第 17、18 轮没发过清单 —— 按 `previousTodosByAssistantMessageId` 的设计,
 *    carry **不清空**(「中间答了个无关问题不该把欠账抹掉」);
 *  · 第 19 轮 `246b48a2` 重新把同样五条建了出来(claude 的 `TaskList` 当时
 *    返回的是 **`No tasks found`** —— 没有任何东西被「种」进来,这五条是本轮新建的)。
 *
 * 于是 `previous.has(content)` 五条全中 → `recalled` → 五条全划线。
 *
 * 但上一轮对这五条**一件都没干过**:它只是把清单说出口就被取消了。
 * 「只被提过」不是「旧账」——划线的原话是「**这一条不是本轮新开的活**」,
 * 而这五条恰恰就是本轮新开的活。
 *
 * 事件形状照抄 run 日志:daemon 把 claude 的 `TaskCreate` 合成成 `TodoWrite`,
 * tool_use id 带 `:todo-task` 后缀,每条 todo 带 `activeForm`。
 */

const raw = (id: string, todos: Array<[string, string]>): PersistedAgentEvent => ({
  kind: 'tool_use',
  id,
  name: 'TodoWrite',
  input: { todos: todos.map(([content, status]) => ({ content, status, activeForm: content })) },
});

const shell = (blocks: TurnBlock[]): ExecutionShell => {
  const found = blocks.find((b): b is ExecutionShell => b.kind === 'shell');
  if (!found) throw new Error('fixture 坏了:这一轮没有壳');
  return found;
};
const seg = (s: ExecutionShell, i: number): TodoSegment => {
  const v = s.segments[i];
  if (v === undefined) throw new Error(`断言越界:segment ${i} of ${s.segments.length}`);
  return v;
};

/** 上一轮(`c8eec72e`)落库的最后一份快照 —— 五条原样,全部 `pending` */
const NEVER_STARTED = [
  '调研断线重连场景与现有页面资源',
  '确定单页信息结构与关键交互路径',
  '锁定视觉方向与版式层级',
  '实现自包含 HTML 与交互状态',
  '完成内容、交互、视觉与清单自检',
] as const;

/** 本轮(`246b48a2`)的真实快照序列:TaskCreate 一条一条追加,最后点亮第一条 */
const thisTurnEvents: PersistedAgentEvent[] = [
  raw('toolu_01KBZViMTirbDmDKUcyMZzum:todo-task', [[NEVER_STARTED[0], 'pending']]),
  raw('toolu_01ABtxWNtu1djym7LUMMo2aS:todo-task', [
    [NEVER_STARTED[0], 'pending'], [NEVER_STARTED[1], 'pending'],
  ]),
  raw('toolu_013oSPV43LjtMmxpfxikXsyS:todo-task', NEVER_STARTED.map((c) => [c, 'pending'])),
  raw('toolu_01YTN6Jqg9fBwTe4XEZEkXzB:todo-task', [
    [NEVER_STARTED[0], 'in_progress'],
    ...NEVER_STARTED.slice(1).map((c): [string, string] => [c, 'pending']),
  ]),
];

describe('召回:上一轮只是「说过」,不算旧账', () => {
  it('上一轮声明后从没开始过(全 pending)→ 本轮重新开出来的计划**一条都不划线**', () => {
    const blocks = buildTurnBlocks({
      events: thisTurnEvents,
      runStatus: 'running',
      previousTodos: NEVER_STARTED.map((content) => ({ content, status: 'pending' as const })),
    });
    const s = shell(blocks);
    expect(s.segments).toHaveLength(5);

    // 产品负责人截图里最刺眼的一格:第一条既是「进行中」又画着删除线
    expect(seg(s, 0).status).toBe('in_progress');
    expect(seg(s, 0).recalled).toBe(false);
    expect(isStruck(seg(s, 0))).toBe(false);

    for (let i = 0; i < 5; i += 1) {
      expect(isStruck(seg(s, i))).toBe(false);
    }
  });

  /*
   * 配对断言 —— 少了这一条,「把划线整个删掉」也能让上面那条变绿。
   * 真正干过活的召回**必须还划线**。
   *
   * ⚠️ 2026-09-03 收紧过一次判据(见 `contract.ts` 的 `isStruck`):划线现在还要求
   * 「**本轮一件没干**」。所以这里把被召回的那条摆成本轮 `pending`(名下无内容)——
   * 要证的东西没变(「上一轮真干过才算旧账」),变的只是取样点从「正在跑的那条」
   * 挪到「召回回来还没动的那条」,因为正在跑的现在一律不划线。
   * 清单里另放一条 `in_progress` 是为了不触发 D36 的隐式点亮。
   */
  it('上一轮真干过(completed / in_progress / stopped)→ 本轮列出来还没动它,**仍然划线**', () => {
    for (const previousStatus of ['completed', 'in_progress', 'stopped'] as const) {
      const blocks = buildTurnBlocks({
        events: [raw('p1:todo-task', [
          [NEVER_STARTED[1], 'in_progress'],
          [NEVER_STARTED[0], 'pending'],
        ])],
        runStatus: 'running',
        previousTodos: [{ content: NEVER_STARTED[0], status: previousStatus }],
      });
      const s = shell(blocks);
      expect(seg(s, 1).recalled, `上一轮 ${previousStatus} 应判为召回`).toBe(true);
      expect(isStruck(seg(s, 1)), `上一轮 ${previousStatus} 应划线`).toBe(true);
    }
  });

  it('同一份清单里,只有真干过的那条划线 —— 划线不是全有或全无', () => {
    const [worked, announced] = [NEVER_STARTED[0], NEVER_STARTED[1]];
    const blocks = buildTurnBlocks({
      events: [raw('p1:todo-task', [
        // 本轮正在跑的那条:占住 D36 的隐式点亮,免得下面两条被抬成「进行中」
        [NEVER_STARTED[2], 'in_progress'],
        [worked, 'pending'],
        [announced, 'pending'],
      ])],
      runStatus: 'running',
      previousTodos: [
        { content: worked, status: 'completed' },
        { content: announced, status: 'pending' },
      ],
    });
    const s = shell(blocks);
    expect(isStruck(seg(s, 1))).toBe(true);
    expect(isStruck(seg(s, 2))).toBe(false);
  });
});
