// @vitest-environment jsdom
/**
 * W99 · 药丸只认「agent 这一轮重发的那份清单」—— web 这一半。
 *
 * 现场:用户中止了一轮 4 步的活,插了一句无关的问题,再说「继续之前的设计」。
 * 那句无关问题的整轮里,输入框上仍旧挂着上一轮的「第 3 / 4 步」——
 * 那一轮 agent 一个字的清单都没发过。
 *
 * 判据的出处是用户自己写在 `0f8ea80a76` 提交信息里的那一条(**提交信息,不是拍板规格**;
 * 它是很强的设计意图证据,产品拍板另有其人):
 *
 *   > The block STATES A FACT and hands the decision back — continue, replan, or
 *   > ignore is the agent's call, never the client's.
 *   > It only recognizes items **the agent chose to re-emit** — if the agent does
 *   > not re-list them, nothing is looked up and nothing renders.
 *
 * 流水里那张卡一直守着这一条(每轮只装本轮内容,D24)。药丸没守 —— 它 08-26 落地时
 * 沿用了 06-21 出生的**会话级**取数(`latestTodoWriteInputFromMessages`,整个会话里
 * 倒着找最新一份),那时还没有跨轮召回这回事;08-27 召回落地、原则确立,改的是卡那条路。
 * 所以这一组是补漏,不是推翻。
 *
 * 四件事:
 *  ① 正向 —— 本轮没重发 → 药丸不出;重发了 → 出的是**本轮那份**;
 *  ② 同源 —— 药丸的 N/M 和同一轮那张卡的「Plan · N steps」是同一个数;
 *  ③ 防真空 —— 上面①那一条在修之前必须是红的(会话级取数会把上一轮的清单捞回来);
 *  ④ 反向 —— 药丸原本的可见性规则(跑着 + 还有没干完的才出)一条没动。
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPane } from '../../../src/components/ChatPane';
import type { ChatMessage } from '../../../src/types';

let originalResizeObserver: typeof ResizeObserver | undefined;

beforeEach(() => {
  originalResizeObserver = globalThis.ResizeObserver;
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: MockResizeObserver,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalResizeObserver) {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: originalResizeObserver,
    });
  } else {
    delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
  }
});

type Todo = { content: string; status: string };

/** 票上那一轮:4 步,中止时前两步已经做完 */
const ABORTED_FOUR: Todo[] = [
  { content: '搭定价区', status: 'completed' },
  { content: '补 FAQ', status: 'completed' },
  { content: '过一遍响应式', status: 'in_progress' },
  { content: '出交付稿', status: 'pending' },
];

function todoEvent(todos: Todo[], id: string) {
  return { kind: 'tool_use' as const, id, name: 'TodoWrite', input: { todos } };
}

/** 第 1 轮:发了 4 步的清单,做到第 3 步被用户中止 */
function abortedFirstTurn(): ChatMessage[] {
  return [
    { id: 'u1', role: 'user', content: '把定价页做出来', createdAt: 1 },
    {
      id: 'a1',
      role: 'assistant',
      content: '好的',
      createdAt: 2,
      runStatus: 'canceled',
      events: [todoEvent(ABORTED_FOUR, 'tw-1')],
    },
  ];
}

function pane(messages: ChatMessage[], extra: { streaming?: boolean } = {}) {
  return (
    <ChatPane
      messages={messages}
      streaming={extra.streaming ?? true}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={() => {}}
      onStop={() => {}}
      conversations={[]}
      activeConversationId={null}
      onSelectConversation={() => {}}
      onDeleteConversation={() => {}}
    />
  );
}

const pillText = () => screen.queryByTestId('chat-plan-pill')?.textContent ?? null;

/**
 * 最后一轮那条助手消息 —— 卡的步数要在**它**里面找。
 * 上一轮那张卡还挂在流水里、写着自己的步数,全局找会同时命中两张,
 * 而「药丸和卡是不是同一个数」问的就是同一轮里的这两处。
 */
function lastTurnCard(): HTMLElement {
  const all = document.querySelectorAll<HTMLElement>('.msg.assistant');
  const last = all[all.length - 1];
  if (!last) throw new Error('no assistant message rendered');
  return last;
}

describe('W99 · Plan 药丸只跟着 agent 这一轮重发的清单走', () => {
  it('① 插一句无关的问题:那一轮 agent 没发清单 → 药丸不出(上一轮的 3/4 不许赖着)', () => {
    render(pane([
      ...abortedFirstTurn(),
      { id: 'u2', role: 'user', content: '顺便问一下这个字体叫什么', createdAt: 3 },
      {
        id: 'a2',
        role: 'assistant',
        content: '那是 Inter。',
        createdAt: 4,
        runStatus: 'running',
      },
    ]));
    expect(pillText()).toBeNull();
  });

  it('① 说了「继续」但 agent 还没重发清单的那一刻,药丸同样不出', () => {
    render(pane([
      ...abortedFirstTurn(),
      { id: 'u2', role: 'user', content: '继续之前的设计', createdAt: 3 },
      { id: 'a2', role: 'assistant', content: '', createdAt: 4, runStatus: 'running' },
    ]));
    expect(pillText()).toBeNull();
  });

  it('① agent 这一轮重发了 → 出,而且写的是**本轮那份**', () => {
    render(pane([
      ...abortedFirstTurn(),
      { id: 'u2', role: 'user', content: '继续之前的设计', createdAt: 3 },
      {
        id: 'a2',
        role: 'assistant',
        content: '',
        createdAt: 4,
        runStatus: 'running',
        events: [todoEvent(ABORTED_FOUR, 'tw-2')],
      },
    ]));
    expect(pillText()).toContain('Step 3 of 4');
  });

  it('② 同源:药丸的 M 和同一轮那张卡的步数是同一个数(重发整份 4 步)', () => {
    render(pane([
      ...abortedFirstTurn(),
      { id: 'u2', role: 'user', content: '继续之前的设计', createdAt: 3 },
      {
        id: 'a2',
        role: 'assistant',
        content: '',
        createdAt: 4,
        runStatus: 'running',
        events: [todoEvent(ABORTED_FOUR, 'tw-2')],
      },
    ]));
    expect(pillText()).toContain('Step 3 of 4');
    expect(within(lastTurnCard()).getByText('Plan · 4 steps')).toBeTruthy();
  });

  it('② 同源:agent 只重发了 2 步时,两处一起变成 2 —— 不许一个 4 一个 2', () => {
    const shrunk: Todo[] = [
      { content: '过一遍响应式', status: 'in_progress' },
      { content: '出交付稿', status: 'pending' },
    ];
    render(pane([
      ...abortedFirstTurn(),
      { id: 'u2', role: 'user', content: '继续之前的设计', createdAt: 3 },
      {
        id: 'a2',
        role: 'assistant',
        content: '',
        createdAt: 4,
        runStatus: 'running',
        events: [todoEvent(shrunk, 'tw-2')],
      },
    ]));
    expect(pillText()).toContain('Step 1 of 2');
    expect(within(lastTurnCard()).getByText('Plan · 2 steps')).toBeTruthy();
    expect(pillText()).not.toContain('of 4');
  });

  it('④ 反向:run 结束就消失(原本的可见性规则没动)', () => {
    render(pane([
      ...abortedFirstTurn(),
      { id: 'u2', role: 'user', content: '继续之前的设计', createdAt: 3 },
      {
        id: 'a2',
        role: 'assistant',
        content: '',
        createdAt: 4,
        runStatus: 'succeeded',
        events: [todoEvent(ABORTED_FOUR, 'tw-2')],
      },
    ], { streaming: false }));
    expect(pillText()).toBeNull();
  });

  it('④ 反向:本轮这份全做完 → 消失,哪怕 run 还跑着', () => {
    render(pane([
      ...abortedFirstTurn(),
      { id: 'u2', role: 'user', content: '继续之前的设计', createdAt: 3 },
      {
        id: 'a2',
        role: 'assistant',
        content: '',
        createdAt: 4,
        runStatus: 'running',
        events: [todoEvent(ABORTED_FOUR.map((t) => ({ ...t, status: 'completed' })), 'tw-2')],
      },
    ]));
    expect(pillText()).toBeNull();
  });

  it('④ 反向:agent 这一轮发了清单,上一轮从来没发过 —— 照常出', () => {
    render(pane([
      { id: 'u1', role: 'user', content: '你好', createdAt: 1 },
      { id: 'a1', role: 'assistant', content: '你好', createdAt: 2, runStatus: 'succeeded' },
      { id: 'u2', role: 'user', content: '把定价页做出来', createdAt: 3 },
      {
        id: 'a2',
        role: 'assistant',
        content: '',
        createdAt: 4,
        runStatus: 'running',
        events: [todoEvent(ABORTED_FOUR, 'tw-1')],
      },
    ]));
    expect(pillText()).toContain('Step 3 of 4');
  });
});
