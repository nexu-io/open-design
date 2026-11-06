// @vitest-environment jsdom
/**
 * 进一条会话,眼睛该落在**最新的内容**上 —— 也就是底部。
 *
 * ## 缺陷(产品原话:「每次进 project,滚动条都会滚动到最上面」/「有时候在最底下有时候在最顶部」)
 *
 * 根因不在跟随的写入判据上,在**钉顶接管的表决**上。
 *
 * `settledTailUserIdRef` 有三档语义(见 `anchor-to-top.ts` 的 `isNewTailUserTurn`):
 *
 *   · `undefined` —— 这条会话还没落定过(刚装载 / 刚切会话)。那一拍**不钉**。
 *   · `null`      —— 一句**结论**:「这条会话我看过了,里面没有用户消息」。
 *                    所以它的第一条用户消息算新的一轮(首页发起走的就是这一格)。
 *   · 某个 id     —— 上一次看到的尾条用户消息。
 *
 * 进项目的**第一拍**给不出那句结论:`ProjectView` 在
 * `activeConversationId || conversationLoadError || …` 为真时就挂 `ChatPane`,
 * 而转录是随后异步取回来的 —— 那一拍 `messages` 是空的、`loading` 是 `true`
 * (`currentConversationLoading = activeConversationId && messagesConversationId !== activeConversationId && …`)。
 * 老代码照样把 `tailUserId`(空转录 ⇒ `null`)落定了下去。
 *
 * 下一拍整份历史一次到齐,`isNewTailUserTurn(null, 尾条id)` 就是 `true` ——
 * **一份刚读进来的旧转录被当成用户刚发的新一轮**:`releaseFollow()` + 钉顶接管。
 * 跟随被松开之后 `syncFollowState()` 再也不会贴底,画面停在
 * `scrollAnchorToTop()` 那一帧量出来的落点上:
 *
 *   · 布局排完了 → 停在最后一条用户消息的上沿(短回合看着像贴底,**所以有时候是好的**);
 *   · 布局还没排完 → 那一帧所有矩形都挤在 0 附近,落点量成 0 —— **停在最顶上**。
 *
 * 「有时候在最底下有时候在最顶部」就是这两条路。
 *
 * 同一条规矩这个文件里已经写过一遍了:`conversationMessageCount` 的注释 ——
 * 转录还没落到这条会话头上时,`messages.length` 不作数(那边的症状是列表里的
 * 幻影「0 msg」)。这里是同一个错误的另一个出口。
 *
 * ## 这个夹具在模拟什么
 *
 * jsdom 不排版,`scrollHeight` / `clientHeight` / `getBoundingClientRect()` 恒为 0,
 * 所以几何全部显式喂进去 —— 并且**分两拍喂**:「判定发生时」和「排完版之后」
 * 是两个不同的几何,那正是这条缺陷的形状。一上来就给终态几何的夹具照不出它
 * (那种时序下落点量得准,只是落错了地方 —— 见第二条用例)。
 * `scrollTop` 的 setter 按浏览器语义夹到 `[0, scrollHeight - clientHeight]`。
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import { anchorScrollTop } from '../../src/runtime/chat/anchor-to-top';
import type { ChatMessage } from '../../src/types';

const VIEWPORT = 600;
/** 转录排完版之后的内容高。 */
const SETTLED_CONTENT_H = 4_000;
/**
 * 排完版之后,最后一条用户消息的上沿在内容里的偏移。
 *
 * 刻意离底部很远(最后那一轮回复很长):钉顶落点和底部因此差出一千多像素,
 * 「停在最后一条用户消息上」和「贴底」在断言里分得开。真机上这个距离等于
 * 最后一轮回复的长度 —— 回复短的时候两者几乎重合,那正是「有时候在最底下」。
 */
const SETTLED_LAST_USER_TOP = 2_000;
/** 一条用户消息的高度。 */
const USER_MSG_H = 80;

interface Geom {
  contentHeight: number;
  clientHeight: number;
  scrollTop: number;
  lastUserTopInContent: number;
}

let geom: Geom;
let rafCallbacks: FrameRequestCallback[];
let resizeCallbacks: ResizeObserverCallback[];
let savedDescriptors: Record<
  'scrollTop' | 'scrollHeight' | 'clientHeight' | 'offsetHeight',
  PropertyDescriptor | undefined
>;
let originalGetBoundingClientRect: PropertyDescriptor | undefined;
let originalScrollTo: PropertyDescriptor | undefined;
let originalResizeObserver: typeof ResizeObserver | undefined;

function isChatLog(el: HTMLElement): boolean {
  return typeof el?.classList?.contains === 'function' && el.classList.contains('chat-log');
}

function isTailSpacer(el: HTMLElement): boolean {
  return (
    typeof el?.classList?.contains === 'function'
    && el.classList.contains('chat-log-tail-spacer')
  );
}

function inlineHeight(el: HTMLElement | null): number {
  if (!el) return 0;
  const parsed = Number.parseFloat(el.style.height);
  return Number.isFinite(parsed) ? parsed : 0;
}

function tailSpacerHeight(): number {
  return inlineHeight(document.querySelector<HTMLElement>('.chat-log-tail-spacer'));
}

function scrollHeightOf(): number {
  return geom.contentHeight + tailSpacerHeight();
}

function maxScrollTop(): number {
  return Math.max(0, scrollHeightOf() - geom.clientHeight);
}

beforeEach(() => {
  // 挂载那一刻:滚动盒已经有高度,转录**还没排完版** —— 内容高和可视高几乎相等,
  // 所有矩形都还挤在 0 附近。真机采样里「刚进会话」那一档就是 583/589 这种数。
  geom = {
    contentHeight: VIEWPORT,
    clientHeight: VIEWPORT,
    scrollTop: 0,
    lastUserTopInContent: 0,
  };
  rafCallbacks = [];
  resizeCallbacks = [];

  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    rafCallbacks.push(callback);
    return rafCallbacks.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

  originalResizeObserver = globalThis.ResizeObserver;
  class MockResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      resizeCallbacks.push(callback);
    }
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: MockResizeObserver,
  });

  savedDescriptors = {
    scrollTop: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop'),
    scrollHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight'),
    clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
    offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
  };
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: HTMLElement) {
      return isChatLog(this) ? geom.scrollTop : 0;
    },
    set(this: HTMLElement, v: number) {
      if (!isChatLog(this)) return;
      geom.scrollTop = Math.min(Math.max(0, v), maxScrollTop());
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isChatLog(this) ? scrollHeightOf() : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isChatLog(this) ? geom.clientHeight : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isTailSpacer(this) ? inlineHeight(this) : 0;
    },
  });

  originalGetBoundingClientRect = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'getBoundingClientRect',
  );
  const zeroRect = () => ({
    top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}),
  });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    writable: true,
    value(this: HTMLElement) {
      if (
        typeof this.classList?.contains === 'function'
        && this.classList.contains('msg')
        && this.classList.contains('user')
      ) {
        const all = Array.from(document.querySelectorAll('.msg.user'));
        const index = all.indexOf(this);
        const isLast = index === all.length - 1;
        const topInContent = isLast
          ? geom.lastUserTopInContent
          : Math.max(0, geom.lastUserTopInContent - (all.length - 1 - index) * 200);
        const top = topInContent - geom.scrollTop;
        return {
          ...zeroRect(), top, bottom: top + USER_MSG_H, height: USER_MSG_H, y: top,
        } as DOMRect;
      }
      return zeroRect() as DOMRect;
    },
  });

  originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value(this: HTMLElement, arg?: ScrollToOptions | number) {
      if (!isChatLog(this)) return;
      const options = typeof arg === 'object' && arg !== null ? arg : { top: arg as number };
      geom.scrollTop = Math.min(Math.max(0, options.top ?? geom.scrollTop), maxScrollTop());
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  rafCallbacks = [];
  resizeCallbacks = [];
  if (originalResizeObserver) {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: originalResizeObserver,
    });
  }
  if (originalScrollTo) {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
  } else {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTo;
  }
  if (originalGetBoundingClientRect) {
    Object.defineProperty(
      HTMLElement.prototype, 'getBoundingClientRect', originalGetBoundingClientRect,
    );
  }
  for (const key of ['scrollTop', 'scrollHeight', 'clientHeight', 'offsetHeight'] as const) {
    const original = savedDescriptors[key];
    if (original) Object.defineProperty(HTMLElement.prototype, key, original);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
  }
});

/**
 * 跑掉排着的那一批帧回调,然后按浏览器语义把 `scrollTop` 夹回新的可滚范围。
 *
 * 内容变矮不经过 `scrollTop` 的 setter,而真实浏览器会在同一次布局里把停在旧底部
 * 的偏移夹下来。不补这一下,夹具会留下 `scrollTop > maxScrollTop()` 这种真实浏览器
 * 造不出来的状态。
 */
async function flushFrames(): Promise<void> {
  await act(async () => {
    const callbacks = rafCallbacks.splice(0);
    callbacks.forEach((callback) => callback(performance.now()));
    await Promise.resolve();
  });
  geom.scrollTop = Math.min(geom.scrollTop, maxScrollTop());
}

async function fireResize(): Promise<void> {
  await act(async () => {
    for (const cb of resizeCallbacks) {
      cb([] as unknown as ResizeObserverEntry[], {} as ResizeObserver);
    }
    await Promise.resolve();
  });
}

/** 排版落定:转录一次性长到终态高度,矩形也就位了。 */
function settleLayout(): void {
  geom.contentHeight = SETTLED_CONTENT_H;
  geom.lastUserTopInContent = SETTLED_LAST_USER_TOP;
}

function transcript(turns: number): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = 0; i < turns; i += 1) {
    out.push({
      id: `user-${i}`,
      role: 'user',
      content: `question ${i}`,
      createdAt: 1_700_000_000_000 + i * 1000,
    });
    out.push({
      id: `assistant-${i}`,
      role: 'assistant',
      content: `answer ${i}`,
      createdAt: 1_700_000_000_500 + i * 1000,
      startedAt: 1_700_000_000_500 + i * 1000,
      endedAt: 1_700_000_003_000 + i * 1000,
      runStatus: 'succeeded',
    });
  }
  return out;
}

interface PaneOptions {
  messages: ChatMessage[];
  /** `ProjectView` 的 `currentConversationLoading` —— 转录还没落到这条会话头上。 */
  loading: boolean;
  activeConversationId?: string | null;
}

function pane({ messages, loading, activeConversationId = 'conv-1' }: PaneOptions) {
  return (
    <ChatPane
      messages={messages}
      streaming={false}
      loading={loading}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={() => {}}
      onStop={() => {}}
      conversations={[]}
      activeConversationId={activeConversationId}
      messagesConversationId={loading ? null : activeConversationId}
      onSelectConversation={() => {}}
      onDeleteConversation={() => {}}
    />
  );
}

describe('打开一条已有会话', () => {
  /**
   * 缺陷本体。转录晚一拍到,**排版又晚于那一拍的判定** ——
   * 钉顶接管把落点量成 0,人停在最顶上。
   */
  it('转录晚于挂载到达、排版又晚于判定时,仍然停在最新内容上', async () => {
    const { rerender } = render(pane({ messages: [], loading: true }));
    await flushFrames();

    // 转录到齐(`setMessages` 和 `setMessagesConversationId` 在同一个 React 批次里,
    // 所以 `loading` 在这一拍就已经是 false 了)。排版还没跟上。
    await act(async () => {
      rerender(pane({ messages: transcript(6), loading: false }));
      await Promise.resolve();
    });
    await flushFrames();

    settleLayout();
    await fireResize();
    await flushFrames();
    await flushFrames();

    expect(screen.getByTestId('chat-log')).toBeTruthy();
    expect(geom.scrollTop).toBe(maxScrollTop());
  });

  /**
   * 同一条缺陷的另一半时序:判定发生时排版**已经**落定。
   *
   * 落点这次量得准,但仍然落错了地方 —— 停在最后一条用户消息的上沿,而不是底部。
   * 最后那一轮回复短的时候,这个位置看着就像贴底,「有时候是好的」正是这一格。
   */
  it('转录晚于挂载到达、排版已落定时,也停在最新内容上', async () => {
    const { rerender } = render(pane({ messages: [], loading: true }));
    await flushFrames();

    settleLayout();
    await act(async () => {
      rerender(pane({ messages: transcript(6), loading: false }));
      await Promise.resolve();
    });
    await flushFrames();
    await flushFrames();
    await flushFrames();

    expect(geom.scrollTop).toBe(maxScrollTop());
    // 落在钉顶位置就是这条缺陷的指纹 —— 一份读进来的历史被当成了新发的一轮。
    expect(geom.scrollTop).not.toBe(anchorScrollTop(SETTLED_LAST_USER_TOP));
  });

  /** 转录和挂载同一拍到齐(不需要异步取)时,今天就已经是对的 —— 修复不能把它弄坏。 */
  it('转录在挂载那一拍就已经在手上时,停在最新内容上', async () => {
    settleLayout();
    render(pane({ messages: transcript(6), loading: false }));
    await flushFrames();
    await flushFrames();
    await flushFrames();

    expect(geom.scrollTop).toBe(maxScrollTop());
  });
});

/**
 * 反向护栏:`null` 那一档**必须留着**。
 *
 * 一条读完了、确实是空的会话,它的第一条用户消息仍然算新的一轮,仍然要钉顶。
 * 修复只是不许拿「转录还没到」冒充这句结论。
 */
describe('一条读完了、确实是空的会话', () => {
  it('第一条用户消息仍然钉顶接管,不被贴底跟随拽走', async () => {
    geom.contentHeight = 100;
    geom.lastUserTopInContent = 0;
    const { rerender } = render(pane({ messages: [], loading: false }));
    await flushFrames();
    await flushFrames();

    // 用户发出第一条消息。
    const firstTurn: ChatMessage[] = [
      { id: 'user-0', role: 'user', content: 'make me a deck', createdAt: 1_700_000_000_000 },
    ];
    geom.contentHeight = 700;
    geom.lastUserTopInContent = 100;
    await act(async () => {
      rerender(pane({ messages: firstTurn, loading: false }));
      await Promise.resolve();
    });
    await flushFrames();
    await flushFrames();

    // 回复开始往下长。钉顶接管的意思就是:这条用户消息**不动**,不被拽到底。
    geom.contentHeight = SETTLED_CONTENT_H;
    await fireResize();
    await flushFrames();
    await flushFrames();

    expect(geom.scrollTop).toBe(anchorScrollTop(100));
    expect(geom.scrollTop).not.toBe(maxScrollTop());
  });
});

/**
 * 落定和表决必须用**同一把闸**。
 *
 * 「转录还在路上就不落定」单独上去会开一个新洞:重新读取(`messageLoadRetryNonce`
 * 一跳,`messagesConversationId` 被置空而 `messages` 原样留着)那段窗口里,
 * 如果用户真发了一轮,它的 `settledTailUserId` 一直停在旧值 —— 于是
 * `isNewTailUserTurn` 每一次重渲都答「是」,流式每来一块内容就重新接管一次:
 * `resetTailSpacer()` 把预留空白抹掉、`releaseFollow()` 再松一次手、
 * `scrollAnchorToTop()` 把人拽回那条用户消息。用户已经自己滚到底了也没用。
 *
 * 所以表决也走同一把闸。这条用例守的是那个洞,不是原缺陷。
 */
describe('转录重新读取的窗口里发出的一轮', () => {
  it('用户自己滚到底之后,后面的内容不再把他拽回钉顶位置', async () => {
    settleLayout();
    const history = transcript(3);
    const { rerender } = render(pane({ messages: history, loading: false }));
    await flushFrames();
    await flushFrames();

    // 重新读取开始(`messagesConversationId` 被置空,`messages` 原样留着),
    // 同一拍用户发出新的一轮。
    const sent: ChatMessage[] = [
      ...history,
      { id: 'user-sent', role: 'user', content: 'and now a chart', createdAt: 1_700_000_100_000 },
    ];
    geom.lastUserTopInContent = SETTLED_LAST_USER_TOP;
    await act(async () => {
      rerender(pane({ messages: sent, loading: true }));
      await Promise.resolve();
    });
    await flushFrames();
    await flushFrames();

    // 用户自己滚到底。
    await act(async () => {
      geom.scrollTop = maxScrollTop();
      screen.getByTestId('chat-log').dispatchEvent(new Event('scroll'));
      await Promise.resolve();
    });
    await flushFrames();

    // 回复继续往下长,重新读取还没结束。
    await act(async () => {
      rerender(pane({ messages: [...sent], loading: true }));
      await Promise.resolve();
    });
    await flushFrames();
    await flushFrames();

    expect(geom.scrollTop).not.toBe(anchorScrollTop(SETTLED_LAST_USER_TOP));
    expect(geom.scrollTop).toBe(maxScrollTop());
  });
});
