// @vitest-environment jsdom
/**
 * OPEND-2626 —— 被停止的历史回合,恢复之后仍然自称「进行中」。
 *
 * ── 真实触发路径(从入口追到出错那一行)───────────────────────────────
 *
 *  1. 用户按停止 → daemon 落 `run_status='canceled'` / `cancel_origin='user_stop'`。
 *     **终态那一帧没有变成事件**:真机 run `b13328d8-d151-4628-9134-23ad9da4b64f` 的
 *     `runs/<id>/events.jsonl` 最后一行是 `{"event":"end","data":{"status":"canceled",
 *     "code":143,…}}`,而同一条消息落库的 `messages.events_json` 806 条里最后一条是
 *     `{"kind":"thinking_tokens",…}` —— 终态只走 `run_status` 那一列。
 *  2. 用户接着发后续消息 → 这一轮不再是 `isLast`。
 *  3. 重新进项目 → GET messages 原样返回 `runStatus:'canceled'` + 那 806 条事件。
 *  4. `buildTurnBlocks` **认得**这个终态:`finishTurn` 走 `status === 'canceled'` 那一支,
 *     `shell.stopped = true`,`closeRunningSegments` 把 in_progress 收成 stopped。
 *     —— 所以不是「没落盘」,也不是「没重放 / 重放顺序错」,模型层是对的。
 *  5. 出错在**画**这一层,两处各说了一句假话:
 *      · `ExecutionShell` 的壳头:`if (shell.stopped) return t('chat.record.running')`
 *        —— 和一个真的在跑的回合**同一个词**(en: "Working")。
 *      · `markFor`:`stopped` 落回 `'pending'` 那一档,而那一档的 `aria-label` 就是
 *        `chat.record.pending`(en: "Not started")。于是**停止前正在跑的那一步**
 *        和**从没开始过的那几步**画成同一枚虚线圈、报同一个名字。
 *  6. 唯一说了实话的那一句(`AssistantFooter` 的「已手动停止」)在历史回合上是
 *     `opacity: 0`(OPEND-2542 的 hover 揭示,`data-last="false"`),鼠标不划过去看不见。
 *     所以壳头就是这一轮**唯一常驻**的状态陈述,它不能自称进行中。
 *
 * 夹具形状照抄真机落库记录:TodoWrite 的 `tool_use.id` 带 `:todo-task` 后缀、
 * 对应的 `tool_result.toolUseId` 不带;整条流没有任何终态事件。
 */
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { en } from '../../../src/i18n/locales/en';
import type { ChatMessage } from '../../../src/types';

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
      setItem: (k: string, v: string) => store.set(k, v),
    },
  });
});
afterEach(cleanup);

/** 停止那一刻的清单:第一条在跑,后两条还没开始 */
const RUNNING_STEP = '绑定 tech-utility 令牌到模板变量';
const NEVER_STARTED_STEP_A = '搭建外壳与三标签页骨架';
const NEVER_STARTED_STEP_B = '写入 18 位成员的真实感数据源';

const PLAN: Array<[string, 'pending' | 'in_progress']> = [
  [RUNNING_STEP, 'in_progress'],
  [NEVER_STARTED_STEP_A, 'pending'],
  [NEVER_STARTED_STEP_B, 'pending'],
];

const todoWrite = (
  id: string,
  startedAt: number,
  statuses: ReadonlyArray<'pending' | 'in_progress'>,
) => ([
  {
    kind: 'tool_use',
    id: `${id}:todo-task`,
    name: 'TodoWrite',
    startedAt,
    input: {
      todos: PLAN.map(([content], i) => ({ content, status: statuses[i] ?? 'pending' })),
    },
  },
  {
    kind: 'tool_result',
    toolUseId: id,
    content: 'Updated task status',
    isError: false,
    completedAt: startedAt + 200,
  },
]);

/** 停止之后落库的那条事件流 —— **末尾没有任何终态事件**,和真机一致 */
const RESTORED_EVENTS = [
  { kind: 'status', label: 'starting', detail: 'claude' },
  { kind: 'done_key', key: '9c61f45a5ae427d9' },
  { kind: 'status', label: 'requesting' },
  { kind: 'thinking', text: '先读模板与检查清单。' },
  { kind: 'tool_use', id: 'toolu_a', name: 'Bash', input: { command: 'ls -la' }, startedAt: 1788504160000 },
  { kind: 'tool_result', toolUseId: 'toolu_a', content: 'ok', isError: false, completedAt: 1788504161000 },
  ...todoWrite('toolu_p', 1788504522236, ['pending', 'pending', 'pending']),
  ...todoWrite('toolu_q', 1788504534000, ['in_progress', 'pending', 'pending']),
  { kind: 'thinking', text: '开始写第一屏。' },
  { kind: 'thinking_tokens', tokens: 1352, at: 1788504825134 },
] as unknown as ChatMessage['events'];

/** GET /messages 对那条消息的原样回包(字段取自真机 DB 行) */
const STOPPED_TURN = {
  id: 'home-auto-send-16nfw0h9j5fj9-assistant',
  role: 'assistant',
  content: "\n\nI'll start by reading the skill's template and checklist files.",
  runId: 'b13328d8-d151-4628-9134-23ad9da4b64f',
  runStatus: 'canceled',
  cancelOrigin: 'user_stop',
  startedAt: 1788504156182,
  endedAt: 1788504884870,
  createdAt: 1788504156191,
  events: RESTORED_EVENTS,
  producedFiles: [],
} as unknown as ChatMessage;

/** 历史回合 = 后面还有后续会话,所以 `isLast` 为假 */
function renderRestoredHistoryTurn() {
  return render(
    <AssistantMessage
      message={STOPPED_TURN}
      streaming={false}
      isLast={false}
      projectId="p1"
      errorCardOwnerId={null}
      onFeedback={vi.fn()}
      onForkFromMessage={vi.fn()}
    />,
  );
}

const labelsOf = (root: HTMLElement): string[] =>
  Array.from(root.querySelectorAll('[aria-label]'))
    .map((el) => el.getAttribute('aria-label') ?? '');

describe('OPEND-2626 · 停止过的历史回合恢复后的终态', () => {
  it('壳头不再自称「进行中」—— 那是真的在跑的回合才说的话', () => {
    const { container } = renderRestoredHistoryTurn();
    const text = container.textContent ?? '';
    expect(text).not.toContain(en['chat.record.running']);
    expect(text).toContain(en['chat.record.canceled']);
  });

  it('壳头那句话是这一轮唯一常驻的陈述 —— 「已手动停止」在历史回合上是 hover 才揭示的', () => {
    const { container } = renderRestoredHistoryTurn();
    const footer = container.querySelector('[data-testid="assistant-footer"]');
    // 它在 DOM 里,但 `data-last="false"` 那一档被 `.assistant-footer { opacity: 0 }`
    // 藏起来(OPEND-2542)。这一条钉住「不能指望它替壳头说话」这个前提。
    expect(footer?.getAttribute('data-canceled')).toBe('true');
    expect(footer?.getAttribute('data-last')).toBe('false');
  });

  it('停止前正在跑的那一步,不许和从没开始过的那几步报同一个名字', () => {
    const { container } = renderRestoredHistoryTurn();
    const labels = labelsOf(container);
    const notStarted = labels.filter((l) => l === en['chat.record.pending']);
    // 三条步骤里只有后两条从没开始过 —— 原来是三条全报 "Not started"
    expect(notStarted).toHaveLength(2);
    /*
     * 那一条报的是「没跑完」,不是「已取消」:同一个 `stopped` 也会由一次
     * **跑完了但没收尾**的 succeeded 轮次产出(`closeRunningSegments`),
     * 那一档没人取消过它。判据与反例在 `w85-orb-mark-say-term.test.tsx`。
     */
    expect(labels).toContain(en['chat.record.unfinished']);
    expect(labels).not.toContain(en['chat.record.canceled']);
  });

  /*
   * 那一枚圈也要**看得出**分别 —— jsdom 不算层叠,所以这一条按规则文本判:
   * `.mark.stopped` 必须自己有一条边框规则,且不是 `pending` 那条虚线。
   * 只留 `aria-label` 不同的话,屏幕上仍然是三枚一模一样的虚线圈。
   */
  it('被打断那一步的圈是实线,不是「从没开始」那圈虚线', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(
      resolve(here, '../../../src/components/chat/primitives/record.module.css'),
      'utf-8',
    );
    const rule = /\.mark\.stopped\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/border\s*:/);
    expect(rule).toContain('solid');
    expect(rule).not.toContain('dashed');
  });
});
