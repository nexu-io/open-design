// @vitest-environment jsdom
/**
 * 红测:**流式期间,消息导轨的活动点必须收敛,不能每一帧都被改两次。**
 *
 * 真机现象(用户 2026-08-28,Next.js dev):控制台反复报
 * `Maximum update depth exceeded ... at ChatMessageRail.useEffect.updateActiveMessage
 * (ChatPane.tsx:3937) setActiveMessageId(visible.id)`。
 *
 * 因果链:
 *  1. `ChatMessageRail` 的 `userMessages` 是 `useMemo(..., [messages])`,而
 *     `messages` 在流式期间由 `updateMessageById` 每帧换一个**新数组**
 *     (`ProjectView.tsx` 的 `setMessages((curr) => curr.map(...))` 永远返回新数组),
 *     所以 `userMessages` 每帧都是新引用。
 *  2. 于是「会话切换时复位」那条 effect(deps 里带 `userMessages`)每帧都跑一次,
 *     无条件把活动点写回 **第一条** 用户消息。
 *  3. 而滚动侦听那条 effect(deps 也带 `userMessages`)每帧重挂一次,rAF 里又把活动点
 *     写成**离当前滚动位置最近**的那一条。
 *  4. 两条 effect 每帧各写一次不同的值,谁都不会因为 `Object.is` 相等而被 React 提前
 *     短路 —— 活动点在「第一条」和「最近那条」之间来回跳,每一次 passive flush 都排一次
 *     新的更新。React 的 `nestedPassiveUpdateCount` 因此永不归零,~51 帧后报错。
 *
 * 判据:**同一批用户消息、滚动位置不变时,连续的流式帧不许让活动点再变。**
 * 这里数的是「循环本身」——`is-active` 这个类在导轨上搬了多少次家 ——
 * 而不是「最后停在哪条」:循环的每一帧看上去都是「对的」。
 *
 * 反向对照在下面:滚动位置真的变了,活动点仍然要跟着走。
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../../src/components/ChatPane';
import type { AppConfig, ChatMessage } from '../../../src/types';

const translate = (key: string, vars?: Record<string, string | number>) =>
  (vars && Object.keys(vars).length > 0 ? `${key} ${Object.values(vars).join(' ')}` : key);

vi.mock('../../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));

vi.mock('../../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => (
    <div data-testid={`assistant-${message.id}`}>{message.content}</div>
  ),
}));

vi.mock('../../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

vi.mock('../../../src/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/analytics/events')>();
  return {
    ...actual,
    trackChatPanelClick: vi.fn(),
    trackRunFailedToastSurfaceView: vi.fn(),
    trackRunRecoveryActionClick: vi.fn(),
    trackRunRecoveryActionSurfaceView: vi.fn(),
  };
});

/**
 * jsdom 不做排版,`offsetTop` 恒为 0 —— 那样每条消息与 `scrollTop` 的距离都相等,
 * 「最近那条」永远是第一条,和「复位」那条 effect 写的值撞在一起,循环反而看不见。
 * 按真实布局给每条消息一个递增的 `offsetTop`,循环才照得出来。
 */
const MESSAGE_TOPS = new Map<string, number>();
let originalOffsetTop: PropertyDescriptor | undefined;

beforeEach(() => {
  MESSAGE_TOPS.clear();
  originalOffsetTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop');
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get(this: HTMLElement) {
      const id = this.getAttribute?.('data-chat-message-id');
      return id ? MESSAGE_TOPS.get(id) ?? 0 : 0;
    },
  });
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((handle: number) =>
      clearTimeout(handle as unknown as NodeJS.Timeout)) as typeof cancelAnimationFrame;
  }
});

afterEach(() => {
  cleanup();
  if (originalOffsetTop) {
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', originalOffsetTop);
  } else {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetTop;
  }
  vi.clearAllMocks();
});

const USER_IDS = ['u1', 'u2', 'u3', 'u4'];

/** 四条用户消息 + 一条正在流的助手消息 —— 导轨要 >= 2 条用户消息才渲染。 */
function buildMessages(streamedChars: number): ChatMessage[] {
  const out: ChatMessage[] = [];
  USER_IDS.forEach((id, index) => {
    MESSAGE_TOPS.set(id, index * 1000);
    out.push({
      id,
      role: 'user',
      content: `question ${index + 1}`,
      createdAt: index + 1,
    } as ChatMessage);
  });
  out.push({
    id: 'a-stream',
    role: 'assistant',
    content: 'x'.repeat(streamedChars),
    createdAt: 100,
    runId: 'run-1',
    runStatus: 'running',
    agentId: 'amr',
    events: [],
  } as unknown as ChatMessage);
  return out;
}

function renderChat(messages: ChatMessage[]) {
  return render(
    <ChatPane
      messages={messages}
      streaming
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{ agentId: 'amr', agentCliEnv: {} } as unknown as AppConfig}
    />,
  );
}

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });

/**
 * 数活动点搬家的次数 —— 用 `MutationObserver` 看真实 DOM,不轮询。
 * 返回一个读数器;每次调用给出「自上次以来 `is-active` 变了几次」。
 */
function watchActiveMarker(rail: HTMLElement) {
  let mutations = 0;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type !== 'attributes' || record.attributeName !== 'class') continue;
      const target = record.target as HTMLElement;
      if (!target.classList.contains('chat-message-rail__marker')) continue;
      const was = (record.oldValue ?? '').includes('is-active');
      const now = target.classList.contains('is-active');
      if (was !== now) mutations += 1;
    }
  });
  observer.observe(rail, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
    attributeOldValue: true,
  });
  return {
    take: () => { const n = mutations; mutations = 0; return n; },
    stop: () => observer.disconnect(),
  };
}

/**
 * 把日志容器的滚动位置**钉住**。ChatPane 自己带贴底逻辑,会在每一帧把
 * `scrollTop` 写回去(jsdom 里 `scrollHeight` 为 0,于是写成 0)。钉住之后
 * 这个测试量的才是「导轨对同一个滚动位置的反应」,而不是贴底逻辑的副作用 ——
 * 真机上「用户往上滚了、停在半路」就是这个状态。
 */
function pinScroll(log: HTMLElement, top: number) {
  Object.defineProperty(log, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: () => undefined,
  });
  Object.defineProperty(log, 'scrollHeight', { configurable: true, get: () => 4000 });
  Object.defineProperty(log, 'clientHeight', { configurable: true, get: () => 600 });
  log.dispatchEvent(new Event('scroll'));
}

const activeIndex = () => {
  const markers = Array.from(
    document.querySelectorAll('.chat-message-rail__marker'),
  );
  return markers.findIndex((m) => m.classList.contains('is-active'));
};

describe('ChatMessageRail — 流式期间活动点必须收敛', () => {
  it('滚动位置不动时,连续的流式帧不再改活动点', async () => {
    const { rerender } = renderChat(buildMessages(1));
    await tick();

    const log = screen.getByTestId('chat-log') as HTMLElement;
    // 滚到第四条用户消息附近 —— 「最近那条」不再是第一条,两条 effect 从此写不同的值。
    pinScroll(log, 3000);
    await tick();

    const rail = screen.getByTestId('chat-message-rail') as HTMLElement;
    const watcher = watchActiveMarker(rail);
    // 先让它把首次定位做完。
    await tick();
    watcher.take();

    // 20 个流式帧:每一帧只有助手消息的正文在长,用户消息一个字都没变,
    // 滚动位置也没动 —— 活动点没有任何理由再动。
    for (let frame = 0; frame < 20; frame += 1) {
      rerender(
        <ChatPane
          messages={buildMessages(frame + 2)}
          streaming
          error={null}
          projectId="project-1"
          projectFiles={[]}
          onEnsureProject={async () => 'project-1'}
          onSend={vi.fn()}
          onStop={vi.fn()}
          onRetry={vi.fn()}
          conversations={[
            { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
          ]}
          activeConversationId="conv-1"
          onSelectConversation={vi.fn()}
          onDeleteConversation={vi.fn()}
          config={{ agentId: 'amr', agentCliEnv: {} } as unknown as AppConfig}
        />,
      );
      await tick();
    }

    const moves = watcher.take();
    watcher.stop();
    expect(
      moves,
      `活动点在 20 个流式帧里搬了 ${moves} 次家 —— 每帧都在「第一条」和「最近那条」之间来回跳`,
    ).toBe(0);
  });

  /** 反向对照:别用「干脆不更新」把循环弄消失。 */
  it('滚动位置真的变了时,活动点仍然跟着走', async () => {
    renderChat(buildMessages(1));
    await tick();

    const log = screen.getByTestId('chat-log') as HTMLElement;
    pinScroll(log, 0);
    await tick();
    expect(activeIndex(), '滚到顶时活动点在第一条').toBe(0);

    pinScroll(log, 3000);
    await tick();
    expect(activeIndex(), '滚到第四条附近时活动点要跟过去').toBe(3);

    pinScroll(log, 1000);
    await tick();
    expect(activeIndex(), '滚回第二条时活动点也要跟回来').toBe(1);
  });
});
