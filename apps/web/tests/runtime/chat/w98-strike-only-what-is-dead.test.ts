import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import { isStruck } from '../../../src/runtime/chat/contract';
import type { ExecutionShell, TodoSegment, TurnBlock } from '../../../src/runtime/chat/contract';

/**
 * 划线 = 「**这一条不再有效了**」,不是「这一条以前出现过」。
 *
 * 真机现场(产品负责人,agent = opencode):
 *
 *     ✅ 执行计划 · 5 步                              ← 没划线
 *     ✅ ~~Audit current slide layouts…~~      3.0s
 *     ✅ ~~Rebalance type scale…~~             6.0s
 *     ✅ ~~Remove or mask image areas…~~       6.0s
 *     ✅ ~~Verify every slide fits…~~          6.0s
 *     🟢 ~~Run final checklist and critique pass~~ 3.3s  ← 绿球=进行中,也被划线
 *
 * 产品原话:「划线应该只有那种放弃了的,或者下次召回后上一轮已完成的」。
 *
 * 语料是**真实记录**,不是编的:
 *   库 `/Users/elian/Documents/od-wt-plan-pill/.od/app.sqlite`
 *   会话 `497a25c7-b73b-45c4-be91-2c3d4e23b313`,agent = `opencode`
 *   · pos 1(`home-auto-send-2u9j6vo3p58zb-assistant`):11 条 todo 一路跑完,
 *     落库的最后一份快照 **11 条全 `completed`**;
 *   · pos 3(`1f147355-…`):用户接着让它继续,agent **把同一份 11 条原样重发**,
 *     再一条一条推进(这正是 daemon 的召回块要求的:「re-list the plan whole,
 *     finished rows still marked completed」,见 `contracts/src/prompts/todo-recall.ts`)。
 *
 * 于是 `recalledContents` 收下上一轮**全部非 pending** 的 11 条 →
 * 本轮 `previous.has(content)` **11 条全中** → `isStruck` 的 `recalled` 分支
 * 把整份清单划掉,包括**此刻正在跑的那一条**和**本轮刚做完的那几条**。
 * 「执行计划 · N 步」那行没被划,只是因为它是 `PlanRow`,压根不走 `isStruck`。
 *
 * 判据本身与 agent 无关(`isStruck` / `recalledContents` 一处都没有分支),
 * 所以下面按三家的**原生工具名与入参形状**各跑一遍 —— 三家必须给出同一个答案。
 */

/* ── 真实记录里的 11 条(原样,含破折号与冒号)────────────────────────── */
const STEPS = [
  'Create shared styles.css with design tokens, components, responsive system',
  'Create index.html launcher linking all 8 screens',
  'Create auth.html — login/signup screen',
  'Create landing.html — marketing/onboarding screen',
  'Create expenses.html — main dashboard with groups sidebar',
  'Create new-expense.html — expense creation form',
  'Create scan-receipt.html — receipt scanning via camera/gallery',
  'Create invite.html — invitation by QR code or email',
  'Create settle-up.html — settle up balances page',
  'Create settings.html — settings page',
  'Self-check: 5-dim critique + anti-slop audit',
] as const;

/**
 * 三家 agent 的原生形状。名字与入参键都照抄真实事件流:
 *  · opencode 发 `todowrite` + `todos[{content,status,priority}]`(本文件的语料本人)
 *  · claude   发 `TodoWrite` + `todos[{content,status,activeForm}]`
 *  · codex    发 `update_plan` + `plan[{step,status}]`
 */
const AGENTS = [
  {
    agent: 'opencode',
    name: 'todowrite',
    input: (list: Array<[string, string]>) => ({
      todos: list.map(([content, status]) => ({ content, status, priority: 'high' })),
    }),
  },
  {
    agent: 'claude',
    name: 'TodoWrite',
    input: (list: Array<[string, string]>) => ({
      todos: list.map(([content, status]) => ({ content, status, activeForm: content })),
    }),
  },
  {
    agent: 'codex',
    name: 'update_plan',
    input: (list: Array<[string, string]>) => ({
      plan: list.map(([step, status]) => ({ step, status })),
    }),
  },
] as const;

type AgentShape = (typeof AGENTS)[number];

let seq = 0;
const todo = (shape: AgentShape, list: Array<[string, string]>): PersistedAgentEvent => ({
  kind: 'tool_use',
  id: `todo-${(seq += 1)}`,
  name: shape.name,
  input: shape.input(list),
} as unknown as PersistedAgentEvent);

/** 一次真的写文件 —— 让当前那条 todo 名下**本轮有内容** */
const write = (path: string): PersistedAgentEvent[] => {
  const id = `w-${(seq += 1)}`;
  return [
    { kind: 'tool_use', id, name: 'write', input: { filePath: path, content: 'x' }, startedAt: 1000 },
    { kind: 'tool_result', toolUseId: id, content: 'Wrote file successfully.', isError: false, completedAt: 4000 },
  ] as unknown as PersistedAgentEvent[];
};

/** 快照:前 `done` 条完成、第 `done` 条进行中、其余未开始 */
const snapshot = (done: number): Array<[string, string]> => STEPS.map((content, i) => [
  content,
  i < done ? 'completed' : i === done ? 'in_progress' : 'pending',
]);

const shellOf = (blocks: TurnBlock[]): ExecutionShell => {
  const found = blocks.filter((b): b is ExecutionShell => b.kind === 'shell').at(-1);
  if (!found) throw new Error('fixture 坏了:这一轮没有壳');
  return found;
};
/**
 * 按内容取一行。**从 `items` 里取,不从 `segments`** —— 被重新规划作废的那一条
 * 会被移出 `segments`(`todoCard.segments = kept`),但行**留在屏幕上**:
 * 它名下可能挂着本轮真跑过的调用,删行等于把证据一起删了。屏幕上看得见的是 `items`。
 */
const segOf = (shell: ExecutionShell, content: string): TodoSegment => {
  for (const item of shell.items) {
    if (item.kind === 'todo' && item.segment.content === content) return item.segment;
  }
  throw new Error(`断言找不到这一步:${content}`);
};

/**
 * 第二轮:agent 原样重发 11 条,已经推进到第 6 条(下标 5)。
 * 前五条本轮真做完了(各自名下有一次 write),第六条正在做(名下也已经有一次 write)。
 */
function secondTurn(shape: AgentShape): ExecutionShell {
  const events: PersistedAgentEvent[] = [todo(shape, STEPS.map((c) => [c, 'pending']))];
  for (let i = 0; i <= 5; i += 1) {
    events.push(todo(shape, snapshot(i)));
    events.push(...write(`${i}.html`));
  }
  return shellOf(buildTurnBlocks({
    events,
    runStatus: 'running',
    // 上一轮落库的最后一份快照:11 条全部 completed(真实记录 pos 1)
    previousTodos: STEPS.map((content) => ({ content, status: 'completed' as const })),
  }));
}

describe('划线 = 这一条不再有效了(真实记录 497a25c7 · opencode)', () => {
  for (const shape of AGENTS) {
    describe(`${shape.agent}(${shape.name})`, () => {
      it('正在跑的那一步不划线', () => {
        const shell = secondTurn(shape);
        const live = segOf(shell, STEPS[5]!);
        expect(live.status).toBe('in_progress');
        expect(isStruck(live)).toBe(false);
      });

      it('本轮真做完的那几步不划线', () => {
        const shell = secondTurn(shape);
        const done = STEPS.slice(0, 5).map((content) => segOf(shell, content));
        expect(done.map((s) => s.status)).toEqual(Array(5).fill('completed'));
        expect(done.map((s) => isStruck(s))).toEqual(Array(5).fill(false));
      });

      it('召回过来、本轮一件没干的那几步照旧划线', () => {
        const shell = secondTurn(shape);
        const untouched = STEPS.slice(6).map((content) => segOf(shell, content));
        expect(untouched.every((s) => s.items.length === 0)).toBe(true);
        expect(untouched.map((s) => isStruck(s))).toEqual(Array(STEPS.length - 6).fill(true));
      });

      it('被重新规划作废的那一步划线', () => {
        const shell = shellOf(buildTurnBlocks({
          events: [
            todo(shape, [['甲', 'in_progress'], ['乙', 'pending']]),
            ...write('a.html'),
            // 新快照里「乙」消失 = 被重新规划掉(D14 同族)
            todo(shape, [['甲', 'completed'], ['丙', 'in_progress']]),
          ],
          runStatus: 'running',
        }));
        const dropped = segOf(shell, '乙');
        expect(dropped.abandoned).toBe(true);
        expect(isStruck(dropped)).toBe(true);
      });

      it('「执行计划 · N 步」那一行不受影响 —— 它本来就不走 isStruck', () => {
        const shell = secondTurn(shape);
        const plan = shell.items.find((x) => x.kind === 'plan');
        expect(plan).toBeDefined();
        expect((plan as { steps: string[] }).steps).toHaveLength(STEPS.length);
      });
    });
  }

  /*
   * codex 还有**第二条**通往同一个矛盾的路。它的原生清单只有做完 / 没做完两档,
   * 整份快照可能一条 `in_progress` 都没有 —— 这时 D36 会把第一条未完成的
   * **隐式点亮**成进行中。若那一条上一轮正好是 `completed`,它就同时是
   * 「进行中」和「召回」:绿球 + 删除线,和真机截图里那一行一模一样。
   */
  it('codex:被 D36 隐式点亮的那条也不划线', () => {
    const shape = AGENTS[2];
    const shell = shellOf(buildTurnBlocks({
      events: [todo(shape, [[STEPS[0]!, 'completed'], [STEPS[1]!, 'pending']])],
      runStatus: 'running',
      previousTodos: [STEPS[0]!, STEPS[1]!].map((content) => ({ content, status: 'completed' as const })),
    }));
    const lit = segOf(shell, STEPS[1]!);
    expect(lit.implicit).toBe(true);
    expect(lit.status).toBe('in_progress');
    expect(lit.recalled).toBe(true);
    expect(isStruck(lit)).toBe(false);
  });

  it('三家给出的划线结果逐条一致', () => {
    const perAgent = AGENTS.map((shape) => secondTurn(shape).segments.map((s) => isStruck(s)));
    expect(perAgent[1]).toEqual(perAgent[0]);
    expect(perAgent[2]).toEqual(perAgent[0]);
  });
});
