/**
 * Plan 药丸(设计稿第 71 格 · Plan 卡收起态)的判据 —— 纯函数,不碰 DOM。
 *
 * 稿子对这一态只回答一个问题:「现在到第几步了」。展开那张卡把四步全摊开、占掉两百来 px,
 * 而多数时候人只要那六个字;清单退到悬停时再看。
 *
 * 三件事定在这里,组件只负责画:
 *   出没  —— 跑着 + 清单里还有没干完的,才有这枚药丸
 *   N/M  —— N 是**当前正在做第几步**(不是「已完成几步」),M 是总条数
 *   记号  —— 每一步落到 `StatusMark` 的哪一档
 */
import { todoStatusIsUnfinished } from '@open-design/contracts';
import type { TodoStatus } from './contract';

/** 药丸只认清单里的这两样;`runtime/todos.ts` 的 `TodoItem` 天然满足 */
export interface PlanPillTodo {
  content: string;
  status: TodoStatus;
}

/**
 * 一步落到哪一档记号。用的是 `StatusMark` 的档名,不另起一套 ——
 * 稿子这枚浮层明写「复用 .steps 那套四态圆,不另画一套」,
 * 而 `StatusMark` 就是我们这套圆的实现。
 */
export type PlanPillMark = 'ok' | 'running' | 'pending';

export interface PlanPillStep {
  content: string;
  mark: PlanPillMark;
  /** 当前这一步(N 指的就是它) */
  current: boolean;
  /** 做完那一条要划掉(稿子 `.steps li.is-done .tt::after`) */
  struck: boolean;
}

export interface PlanPillState {
  /** 1 基:当前正在做第几步 */
  current: number;
  total: number;
  steps: PlanPillStep[];
}

/**
 * 算这一刻该不该出药丸、出的话写什么。返回 `null` = 不出。
 *
 * 不出的三种情形,都是「这枚药丸此刻没有话要说」:
 *   · run 不在跑 —— 收起态是给**进行中**用的,跑完了这句话就成了假状态
 *   · 压根没有清单 —— 8 家 agent 不吐 TodoWrite,那时整枚药丸不占位(chat/AGENTS.md §3)
 *   · 清单里一条没干完的都没有 —— 全做完 / 全作废,「第几步」问完了
 *
 * 「还有没干完的」用的是 `todoStatusIsUnfinished`,和 daemon 盖
 * `endedWithUnfinishedWork` 的**同一个谓词**:这枚药丸和任务中心、项目卡上那枚
 * 进度标不能对同一份清单给出两种说法。
 * 被重新规划**作废**的那几条不会出现在最新这份快照里,所以这一条也把它们算掉了。
 */
export function planPillState(
  todos: readonly PlanPillTodo[] | undefined,
  running: boolean,
): PlanPillState | null {
  if (!running || !todos || todos.length === 0) return null;

  /*
   * D36「隐式进行中」:清单里一条 in_progress 都没有时,**第一条未完成的**算当前。
   * codex 原生清单只有做完 / 没做完两档,没有这条规则它整份清单都指不出「第几步」。
   */
  const firstUnfinished = todos.findIndex((todo) => todoStatusIsUnfinished(todo.status));
  if (firstUnfinished < 0) return null;
  const explicit = todos.findIndex((todo) => todo.status === 'in_progress');
  const currentIndex = explicit >= 0 ? explicit : firstUnfinished;

  return {
    current: currentIndex + 1,
    total: todos.length,
    steps: todos.map((todo, index) => ({
      content: todo.content,
      mark: markFor(todo, index === currentIndex),
      current: index === currentIndex,
      struck: todo.status === 'completed',
    })),
  };
}

/**
 * 记号的判据和执行记录里那一列(`ExecutionShell.markFor`)保持一致 ——
 * 同一件事在同一个产品里只该有一种画法。
 *
 * ⚠️ 药丸**看不到** `stopped` 那一档:`planPillState` 在 `running` 为假时直接返回
 * `null`,而一条步骤只有在轮次被停那一刻才会变成 `stopped`(`build-turn-blocks` 的
 * `closeRunningSegments`)。所以这里没有、也不需要那一支;OPEND-2626 给执行记录
 * 那一列新开的 `'stopped'` 记号不必往这边同步。真要同步,先确认药丸那时还在不在。
 */
function markFor(todo: PlanPillTodo, current: boolean): PlanPillMark {
  if (current) return 'running';
  if (todo.status === 'completed') return 'ok';
  return 'pending';
}
