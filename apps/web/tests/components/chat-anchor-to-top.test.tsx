// @vitest-environment jsdom
/**
 * 发出去的那一轮,必须钉在聊天区顶端 —— **每个入口都是,整轮都是**。
 *
 * ## 缺陷(用户原话:「现在这个行为有时候有有时候没有」)
 *
 * 两处,各占一半:
 *
 * 1. **入口没接。** 「该钉顶了」是每个发送入口自己举手的
 *    (`anchorPendingRef.current = true`),而举手的只有输入框那一个。
 *    question-form 交答案、首页发起、批注发起、队列排到、失败后的「继续」、
 *    生图重试 …… 全都直接调宿主的 `handleSend`,一个都不举手,于是它们发出来的
 *    那一轮走的是贴底跟随,消息在底部而不是顶端。
 *
 * 2. **钉住这一跳用了平滑滚动。** `scrollAnchorToTop()` 是
 *    `scrollTo({behavior:'smooth'})`,而「用户是不是自己滚开了」的判据只看位置
 *    (`ChatPane` 的 40px 容差 / `stick-to-bottom.ts` 的方向判据)—— 平台不提供
 *    滚动来源,谁都分不出。于是动画自己的中间帧被判成「用户滚开了」,钉住状态
 *    在第一帧就被清掉:占位块从此不再收缩,而动画最后一帧如果正好落在底部
 *    (回复还没开始吐字时**必然**如此,因为占位块就是照着「落点 == 底部」撑的),
 *    贴底跟随还会被重新挂上,把用户一路拽到底。回复来得快慢决定它落在哪一边 ——
 *    这就是「有时候有有时候没有」。
 *
 * 同一条不变量在这个仓库里已经写过两遍了:`stick-to-bottom.ts` 的
 * 「自己发起的滚动一律瞬时」,以及 question-form 定位从 smooth 改成 auto 时
 * 留下的那段注释。`scrollAnchorToTop` 是最后一处没改的。
 *
 * ## 这个夹具在模拟什么
 *
 * jsdom 没有布局,`scrollHeight` / `clientHeight` / `getBoundingClientRect()`
 * 默认全是 0 —— 直接断言「滚到顶」的用例在**没有实现**时也是绿的。所以这里
 * 把几何全部显式桩出来,并按 CSSOM-View「perform a scroll」补上 `scrollTo`
 * 的两条分支:`'auto'` 同步落到终点,`'smooth'` 当场不动、之后一帧一帧地挪
 * (终点在调用那一刻算死,内容再长也不跟着改)。建模的是平台契约,不是我们的实现。
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import {
  ANCHOR_TOP_PADDING,
  TAIL_SPACER_COLLAPSE_STEP_PX,
  TAIL_SPACER_VISIBLE_BLANK_TRIGGER_PX,
  anchorScrollTop,
  anchorSpacerHeight,
} from '../../src/runtime/chat/anchor-to-top';
import type { ChatMessage } from '../../src/types';
import { flushMounts, pressEnter, typeAndSettle } from '../helpers/lexical-composer';

type Geom = {
  /** 真实内容高度,**不含**尾部占位块。 */
  contentHeight: number;
  clientHeight: number;
  scrollTop: number;
  /** 最后一条用户消息距内容顶端的偏移。 */
  lastUserTopInContent: number;
};

const VIEWPORT = 600;
/** 一条用户消息的高度。 */
const USER_MSG_H = 80;

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

/** 平滑滚动还没落地的那一段。 */
let pendingSmooth: { from: number; to: number } | null = null;
/** 每次 `scrollTo` 拿到的 behavior —— 用来钉「传下去的到底是哪一个」。 */
let scrollToBehaviors: Array<ScrollBehavior | undefined>;

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

function chatLog(): HTMLElement {
  return screen.getByTestId('chat-log');
}

/** 钉住那条消息此刻的落点。 */
function anchoredScrollTop(): number {
  return anchorScrollTop(geom.lastUserTopInContent);
}

beforeEach(() => {
  geom = {
    contentHeight: 4_000,
    clientHeight: VIEWPORT,
    scrollTop: 0,
    lastUserTopInContent: 3_800,
  };
  rafCallbacks = [];
  resizeCallbacks = [];
  pendingSmooth = null;
  scrollToBehaviors = [];

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

  /*
   * `.chat-log` 自己保持全零矩形,于是「消息上边在内容里的偏移」= scrollTop +
   * 矩形 top。最后一条用户消息按 `lastUserTopInContent` 说话;更早的那些排在它
   * 上面(读的只有最后一条,这里只是别让它们撒谎)。
   */
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
          : geom.lastUserTopInContent - (all.length - 1 - index) * 200;
        const top = topInContent - geom.scrollTop;
        return {
          ...zeroRect(),
          top,
          bottom: top + USER_MSG_H,
          height: USER_MSG_H,
          y: top,
        } as DOMRect;
      }
      return zeroRect() as DOMRect;
    },
  });

  /*
   * CSSOM-View「perform a scroll」的两条分支。⚠️ 这里**不能**把 smooth 折叠成
   * 瞬时 —— 折叠掉的正是这条缺陷本身。
   */
  originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value(this: HTMLElement, arg?: ScrollToOptions | number) {
      if (!isChatLog(this)) return;
      const options = typeof arg === 'object' && arg !== null ? arg : { top: arg as number };
      scrollToBehaviors.push(options.behavior);
      const to = Math.min(Math.max(0, options.top ?? geom.scrollTop), maxScrollTop());
      // 位置没变就不是一次滚动:浏览器不为它跑动画,也不发 scroll(csswg-drafts #8218)。
      if (to === geom.scrollTop) return;
      if (options.behavior === 'smooth') {
        pendingSmooth = { from: geom.scrollTop, to };
        return;
      }
      geom.scrollTop = to;
      fireEvent.scroll(this);
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
    if (original) {
      Object.defineProperty(HTMLElement.prototype, key, original);
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
    }
  }
});

async function flushFrames() {
  await act(async () => {
    for (let round = 0; round < 6; round += 1) {
      const callbacks = rafCallbacks.splice(0);
      if (callbacks.length === 0) break;
      callbacks.forEach((callback) => callback(performance.now()));
      await Promise.resolve();
    }
  });
}

/** 内容长高之后 ResizeObserver 到达 —— 生产里「变了要去算」的真实通路。 */
async function triggerResize() {
  await act(async () => {
    [...resizeCallbacks].forEach((callback) => callback([], {} as ResizeObserver));
    await Promise.resolve();
  });
  await flushFrames();
}

/**
 * 平滑动画往前走几帧,每一帧发一个 scroll —— 浏览器就是这么做的。
 *
 * 瞬时滚动没有动画可走(位置在调用那一拍就落定了),这里**不报错**是有意的:
 * 用例钉的是「消息还在不在顶端」,不是「用了哪种滚法」。哪天有人把平滑改回来,
 * 立刻又有帧可走,红的还是同一条。
 */
async function advanceSmoothScroll(frames = 4) {
  const anim = pendingSmooth;
  if (!anim) return;
  const log = chatLog();
  for (let i = 1; i <= frames; i += 1) {
    await act(async () => {
      geom.scrollTop = Math.round(anim.from + (anim.to - anim.from) * (i / frames));
      fireEvent.scroll(log);
      await Promise.resolve();
    });
  }
  pendingSmooth = null;
}

function history(): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (let i = 0; i < 8; i += 1) {
    messages.push({
      id: `u${i}`, role: 'user', content: `request ${i}`,
      createdAt: 1_700_000_000_000 + i * 2,
    });
    messages.push({
      id: `a${i}`, role: 'assistant', content: `reply ${i}`,
      createdAt: 1_700_000_000_000 + i * 2 + 1,
    });
  }
  return messages;
}

function withNewTurn(replyText: string | null): ChatMessage[] {
  const messages = history();
  messages.push({
    id: 'u-new', role: 'user', content: 'the turn we just sent',
    createdAt: 1_700_000_001_000,
  });
  if (replyText !== null) {
    messages.push({
      id: 'a-new', role: 'assistant', content: replyText,
      createdAt: 1_700_000_001_001, runStatus: 'running',
    });
  }
  return messages;
}

function chatPaneEl(
  messages: ChatMessage[],
  streaming: boolean,
  onSend: (prompt: string) => void = () => {},
) {
  return (
    <ChatPane
      messages={messages}
      streaming={streaming}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={(prompt) => { onSend(prompt); }}
      onStop={() => {}}
      conversations={[]}
      activeConversationId="conv-1"
      onSelectConversation={() => {}}
      onDeleteConversation={() => {}}
    />
  );
}

/** 新一轮到达:内容长高、最后一条用户消息换成新的那条。 */
function arriveNewUserTurn() {
  geom.contentHeight = 4_000 + USER_MSG_H;
  geom.lastUserTopInContent = 4_000;
}

describe('夹具自检:几何真的说话了(不然全部用例都是假绿)', () => {
  it('初次装载停在真实底部,而且这个数不是 0', async () => {
    render(chatPaneEl(history(), false));
    await flushFrames();
    expect(maxScrollTop()).toBe(3_400);
    expect(geom.scrollTop).toBe(3_400);
  });

  it('钉住位置和贴底位置是两个不同的数', async () => {
    render(chatPaneEl(history(), false));
    await flushFrames();
    arriveNewUserTurn();
    expect(anchoredScrollTop()).toBe(4_000 - ANCHOR_TOP_PADDING);
    expect(anchoredScrollTop()).not.toBe(maxScrollTop());
  });
});

/*
 * ── 缺陷一:入口没接 ────────────────────────────────────────────────
 *
 * 这一格代表**所有不走输入框的入口**:question-form 交答案、首页发起后自动送出、
 * 批注发起、队列排到、失败后的「继续」、生图重试。它们的共同形状就是这个 ——
 * 宿主直接把新的用户消息塞进 `messages`,`ChatPane` 的输入框从头到尾没参与。
 */
describe('不走输入框的入口:新一轮照样要钉到顶', () => {
  it('宿主直接塞进来的新用户消息,必须钉在顶端而不是留在底部', async () => {
    const { rerender } = render(chatPaneEl(history(), false));
    await flushFrames();
    expect(geom.scrollTop).toBe(3_400);

    arriveNewUserTurn();
    await act(async () => {
      rerender(chatPaneEl(withNewTurn(null), true));
    });
    await flushFrames();
    await advanceSmoothScroll();

    expect(geom.scrollTop).toBe(anchoredScrollTop());
  });

  it('并且撑出占位块 —— 否则这条消息物理上根本滚不到顶', async () => {
    const { rerender } = render(chatPaneEl(history(), false));
    await flushFrames();

    arriveNewUserTurn();
    await act(async () => {
      rerender(chatPaneEl(withNewTurn(null), true));
    });
    await flushFrames();

    // 消息下面只有它自己那 80px:600 − 80 − 12 = 508。
    expect(tailSpacerHeight()).toBe(508);
  });

  it('空会话的第一条(首页发起走的就是这一格)也要钉到顶', async () => {
    geom.contentHeight = 0;
    geom.lastUserTopInContent = 0;
    const { rerender } = render(chatPaneEl([], false));
    await flushFrames();

    geom.contentHeight = USER_MSG_H;
    geom.lastUserTopInContent = 0;
    await act(async () => {
      rerender(chatPaneEl(
        [{ id: 'u-home', role: 'user', content: 'from home', createdAt: 1 }],
        true,
      ));
    });
    await flushFrames();
    await advanceSmoothScroll();

    expect(tailSpacerHeight()).toBe(VIEWPORT - USER_MSG_H - ANCHOR_TOP_PADDING);
  });

  it('整篇转录初次装载不算新一轮 —— 不许把历史会话拽到某条消息的顶端', async () => {
    render(chatPaneEl(history(), false));
    await flushFrames();
    expect(geom.scrollTop).toBe(maxScrollTop());
    expect(tailSpacerHeight()).toBe(0);
  });
});

/*
 * ── 缺陷二:钉住这一跳用了平滑滚动,于是自己把自己判掉 ──────────────────
 *
 * 走的是**真输入框**,所以在修复之前这几格里 `anchorPendingRef` 是被正常举手的 ——
 * 它们照出来的只可能是滚法本身的问题,和「入口没接」那一半互不遮掩。
 */
describe('输入框发出的一轮:整轮都要留在顶端', () => {
  async function sendFromComposer() {
    await typeAndSettle('make me a poster');
    pressEnter();
    await act(async () => {
      await Promise.resolve();
    });
  }

  it('回复迟迟不来的那一轮,钉住之后不许被贴底跟随抢回去', async () => {
    const { rerender } = render(chatPaneEl(history(), false));
    await flushMounts();
    await flushFrames();

    await sendFromComposer();
    arriveNewUserTurn();
    await act(async () => {
      rerender(chatPaneEl(withNewTurn(null), true));
    });
    await flushFrames();
    // 回复还没开始吐字 —— 动画整段跑完,落点正好是底部。
    await advanceSmoothScroll();

    // 现在回复来了,内容长高 500px。
    geom.contentHeight += 500;
    await act(async () => {
      rerender(chatPaneEl(withNewTurn('a'.repeat(400)), true));
    });
    await flushFrames();
    await triggerResize();

    expect(geom.scrollTop).toBe(anchoredScrollTop());
  });

  it('回复长出来的时候占位块要跟着收缩,不能留一块死空白', async () => {
    const { rerender } = render(chatPaneEl(history(), false));
    await flushMounts();
    await flushFrames();

    await sendFromComposer();
    arriveNewUserTurn();
    await act(async () => {
      rerender(chatPaneEl(withNewTurn(null), true));
    });
    await flushFrames();
    await advanceSmoothScroll();
    expect(tailSpacerHeight()).toBe(508);

    geom.contentHeight += 500;
    await act(async () => {
      rerender(chatPaneEl(withNewTurn('a'.repeat(400)), true));
    });
    await flushFrames();
    await triggerResize();

    // 消息下面已经有 80 + 500 = 580 的真内容,只差 600 − 580 − 12 = 8。
    expect(tailSpacerHeight()).toBe(8);
  });

  /*
   * 钉住这一跳必须**当拍落地**,不能留一段动画在飞。判据看的是「位置」,而动画
   * 的中间帧全都在落点之外 —— 只要还有一段动画要跑,这套机制就会自己把自己判掉。
   *
   * 所以这里不去嗅「调用时传了哪个 behavior」(那是实现细节),而是钉可观测的
   * 结果:这一帧过完,位置已经在落点上,且没有任何平滑动画在等着跑。
   */
  it('钉住这一跳当拍就落地 —— 不留一段平滑动画在飞', async () => {
    const { rerender } = render(chatPaneEl(history(), false));
    await flushMounts();
    await flushFrames();

    await sendFromComposer();
    arriveNewUserTurn();
    await act(async () => {
      rerender(chatPaneEl(withNewTurn(null), true));
    });
    await flushFrames();

    expect(geom.scrollTop).toBe(anchoredScrollTop());
    expect(pendingSmooth).toBeNull();
    expect(scrollToBehaviors).not.toContain('smooth');
  });

  it('钉住之后浏览器补发的那个 scroll 事件,不许被当成用户滚开', async () => {
    const { rerender } = render(chatPaneEl(history(), false));
    await flushMounts();
    await flushFrames();

    await sendFromComposer();
    arriveNewUserTurn();
    await act(async () => {
      rerender(chatPaneEl(withNewTurn(null), true));
    });
    await flushFrames();
    await advanceSmoothScroll();

    // 浏览器对着落点补一个 scroll 事件(我们自己写 scrollTop 也会有这一下)。
    await act(async () => {
      fireEvent.scroll(chatLog());
      await Promise.resolve();
    });

    // 还钉着 = 占位块继续跟着回复收缩。
    geom.contentHeight += 500;
    await act(async () => {
      rerender(chatPaneEl(withNewTurn('a'.repeat(400)), true));
    });
    await flushFrames();
    await triggerResize();

    expect(tailSpacerHeight()).toBe(8);
    expect(geom.scrollTop).toBe(anchoredScrollTop());
  });
});

/*
 * ── 用户真的自己滚开时,仍然要松手 ──────────────────────────────────
 *
 * 上面那组把「我们自己滚」从判据里摘出去了。这一格钉的是它没有摘过头:
 * 用户的手一动,钉住状态照样要放。
 */
describe('用户自己滚开就松手', () => {
  it('往上滚出容差之后,占位块不再跟着回复收缩', async () => {
    const { rerender } = render(chatPaneEl(history(), false));
    await flushFrames();

    arriveNewUserTurn();
    await act(async () => {
      rerender(chatPaneEl(withNewTurn(null), true));
    });
    await flushFrames();
    await advanceSmoothScroll();
    expect(tailSpacerHeight()).toBe(508);

    // 用户往上翻了 300px 去看更早的内容。
    await act(async () => {
      geom.scrollTop = anchoredScrollTop() - 300;
      fireEvent.scroll(chatLog());
      await Promise.resolve();
    });

    geom.contentHeight += 500;
    await act(async () => {
      rerender(chatPaneEl(withNewTurn('a'.repeat(400)), true));
    });
    await flushFrames();
    await triggerResize();

    // 预留的空白原地不动 —— 它已经是用户脚下真实的可滚区域,收掉会把画面抽走。
    expect(tailSpacerHeight()).toBe(508);
  });
});

/*
 * ── 钉顶的目标必须是**画得出来**的那条用户消息 ────────────────────────
 *
 * 「该不该钉」的判据是「尾条用户消息换了身份」。但转录里有一类用户消息是
 * **不画**的:意图澄清表单的答案(`^[form answers`)——`buildChatRenderItems`
 * 按产品取向(#5496)把它收走了,答案以摘要形式长在上一条助手消息上。
 *
 * 于是答完表单那一拍,两件事同时成立:
 *
 *   · 尾条用户消息换了身份(换成了那条 `[form answers …]`)→ 判据说「钉」;
 *   · 而它不在 DOM 里 → `lastUserMsgTopInContent` 查 `.msg.user` 查不到它,
 *     拿回来的是**上一轮**那个气泡。
 *
 * 两件事凑在一起,结果是把上一轮的气泡拽到视口顶端 —— 用户没发过的那一轮。
 * 判据认的东西和几何量的东西必须是同一批。
 */
describe('不画出来的那条用户消息,不能拿上一轮的气泡去钉', () => {
  /** 答完表单那一拍:那条 `[form answers …]` 进了流水,但一个气泡都不会画。 */
  function afterFormAnswers(replyText: string): ChatMessage[] {
    const messages = history();
    messages.push({
      id: 'u-form-answers',
      role: 'user',
      // `formatFormAnswers` 的真实产物(`artifacts/question-form.ts`)。
      content: '[form answers — discovery]\n- Platform: Desktop web\n- Tone: bold',
      createdAt: 1_700_000_001_000,
    });
    messages.push({
      id: 'a-form-reply', role: 'assistant', content: replyText,
      createdAt: 1_700_000_001_001, runStatus: 'running',
    });
    return messages;
  }

  /**
   * 答案那条不画,所以**最后一个用户气泡还在原地**(还是上一轮那个,3_800)。
   * 长高的只有助手那一侧:上一条助手消息多了一块答案摘要,新回复的头也出来了。
   */
  function arriveFormAnswerTurn() {
    geom.contentHeight = 4_000 + 60;
  }

  it('答完表单之后,视图不许被拽到上一轮那个气泡的顶端', async () => {
    const { rerender } = render(chatPaneEl(history(), false));
    await flushFrames();
    expect(geom.scrollTop).toBe(3_400);
    // 夹具自检:上一轮那个气泡的钉住位置和贴底位置确实是两个不同的数,
    // 不然下面的断言在「什么都没做」时也会绿。
    expect(anchoredScrollTop()).toBe(3_788);

    arriveFormAnswerTurn();
    await act(async () => {
      rerender(chatPaneEl(afterFormAnswers(''), true));
    });
    await flushFrames();
    await advanceSmoothScroll();

    // 夹具自检:那条答案确实一个气泡都没画出来 —— 这正是缺陷的前提。
    expect(
      document.querySelectorAll('.msg.user').length,
      '八轮历史画八个气泡;表单答案那条不画',
    ).toBe(8);

    expect(
      geom.scrollTop,
      '把上一轮的用户气泡钉到了顶端 —— 用户这一轮根本没发过那条消息',
    ).not.toBe(anchoredScrollTop());
  });

  it('也不许为这一轮凭空撑出一块尾部空白', async () => {
    const { rerender } = render(chatPaneEl(history(), false));
    await flushFrames();

    arriveFormAnswerTurn();
    await act(async () => {
      rerender(chatPaneEl(afterFormAnswers(''), true));
    });
    await flushFrames();
    await advanceSmoothScroll();

    // 占位块的定义是「让**被钉住的那条消息**够得到顶端」。没有被钉住的消息,
    // 就没有要预留的东西 —— 撑出来的每一像素都是死空白。
    expect(tailSpacerHeight()).toBe(0);
  });

  /*
   * 反向对照:别用「干脆不钉了」把上面两条弄绿。
   *
   * 答完表单之后用户接着自己发一条 —— 那是一条**画得出来**的新用户消息,
   * 照样要钉到顶端。
   */
  it('接在表单答案后面的下一条真用户消息,照样要钉到顶端', async () => {
    const { rerender } = render(chatPaneEl(history(), false));
    await flushFrames();

    arriveFormAnswerTurn();
    await act(async () => {
      rerender(chatPaneEl(afterFormAnswers('here you go'), true));
    });
    await flushFrames();
    await advanceSmoothScroll();

    // 用户接着敲了一条:内容再长一条消息的高度,新气泡排在 4_060。
    const withFollowUp = afterFormAnswers('here you go');
    withFollowUp.push({
      id: 'u-follow-up', role: 'user', content: 'now make it dark',
      createdAt: 1_700_000_002_000,
    });
    geom.contentHeight = 4_060 + USER_MSG_H;
    geom.lastUserTopInContent = 4_060;
    await act(async () => {
      rerender(chatPaneEl(withFollowUp, true));
    });
    await flushFrames();
    await advanceSmoothScroll();

    expect(geom.scrollTop).toBe(anchoredScrollTop());
    expect(tailSpacerHeight()).toBe(VIEWPORT - USER_MSG_H - ANCHOR_TOP_PADDING);
  });
});

/*
 * ── W105:会话中段那块大空白 ─────────────────────────────────────────────
 *
 * 用户实机报的:agent 正在跑,内容只占屏幕上面一小块,下面一大片空白,浮动药丸
 * 孤零零挂在最底下。那块空白不是容器内距(20→52px)给的,是**尾部占位块**给的 ——
 * 实测 215~301px,比内距大 4~15 倍。
 *
 * 它只在「钉顶」还活着的时候跟着回复收。用户一旦滚开超过 40px,占位块就冻在
 * 原地不动了(上一格 `describe` 钉的就是这个);实测一轮开始定到 215px,之后
 * 32 秒纹丝不动,而这期间内容长了 522px。
 *
 * 拍板的做法是**方案 B:只在用户贴近底部时收**。「贴近底部」不按像素门槛算,
 * 按「这块空白到底有没有戳进视口」算(见 `anchor-to-top.ts` 里那段推导):
 * 露出来超过 52px 就起手,一帧最多挪动画面 24px,一路收到位。
 */
describe('W105 松手之后的尾部占位块:空白戳到眼前才收', () => {
  /** 单独走一帧 rAF —— 收缩是一帧一格的,`flushFrames` 一次跑 6 轮看不清。 */
  async function stepFrame() {
    await act(async () => {
      rafCallbacks.splice(0).forEach((callback) => callback(performance.now()));
      await Promise.resolve();
    });
  }

  /** 把视图挪到 `top` 并发一个真实 scroll —— 用户的手就是这么进来的。 */
  async function userScrollTo(top: number) {
    await act(async () => {
      geom.scrollTop = Math.min(Math.max(0, top), maxScrollTop());
      fireEvent.scroll(chatLog());
      await Promise.resolve();
    });
  }

  /**
   * 一帧一帧走到占位块不再变 —— 完成信号,不是拍脑袋的帧数。
   * 每一帧记下(占位块高度, scrollTop),后面的不变量全从这条曲线上读。
   */
  async function collapseTrace(maxFrames = 60) {
    const trace: { spacer: number; scrollTop: number }[] = [
      { spacer: tailSpacerHeight(), scrollTop: geom.scrollTop },
    ];
    for (let i = 0; i < maxFrames; i += 1) {
      await stepFrame();
      const last = trace[trace.length - 1]!;
      const next = { spacer: tailSpacerHeight(), scrollTop: geom.scrollTop };
      trace.push(next);
      if (
        next.spacer === last.spacer
        && next.scrollTop === last.scrollTop
        && rafCallbacks.length === 0
      ) {
        break;
      }
    }
    return trace;
  }

  /**
   * 一轮跑起来、用户已经自己滚开、回复又长了 500px 的那个局面。
   * 这就是缺陷现场:占位块冻在 508,底下 500px 全是新内容。
   */
  async function midRunAfterUserScrolledAway(scrollUpBy: number) {
    const { rerender } = render(chatPaneEl(history(), false));
    await flushMounts();
    await flushFrames();

    arriveNewUserTurn();
    await act(async () => {
      rerender(chatPaneEl(withNewTurn(null), true));
    });
    await flushFrames();
    await advanceSmoothScroll();
    // 夹具自检:钉顶确实撑出了那块空白,而且这个数不是 0。
    expect(tailSpacerHeight()).toBe(508);
    expect(geom.scrollTop).toBe(anchoredScrollTop());

    // 用户自己往上滚 —— 超过 40px 容差,钉顶松手,占位块从此冻住。
    await userScrollTo(anchoredScrollTop() - scrollUpBy);

    // 回复接着长了 500px。
    geom.contentHeight += 500;
    await act(async () => {
      rerender(chatPaneEl(withNewTurn('a'.repeat(400)), true));
    });
    await flushFrames();
    await triggerResize();
    return { rerender };
  }

  /*
   * ── 防真空:先证明这条量法看得见「冻住」本身 ────────────────────────
   *
   * 不先钉住这一条,后面的正向用例就有可能是在量一个根本不存在的现象。
   */
  it('夹具自检:松手之后占位块确实冻在 508,而回复已经长了 500px', async () => {
    await midRunAfterUserScrolledAway(60);

    expect(tailSpacerHeight()).toBe(508);
    // 底下 500px 新内容 + 508 空白,而钉顶那会儿真内容只有 80px。
    expect(geom.contentHeight).toBe(4_580);
    // 而「该收到多少」早就是 8 了 —— 冻住的是执行,不是判据。
    expect(
      anchorSpacerHeight({
        clientHeight: VIEWPORT,
        scrollHeight: geom.contentHeight + tailSpacerHeight(),
        spacerHeight: tailSpacerHeight(),
        messageTopInContent: geom.lastUserTopInContent,
      }),
    ).toBe(8);
  });

  /*
   * ── 正向 ────────────────────────────────────────────────────────────
   */
  it('用户滚回底部、空白戳到眼前 —— 占位块必须收掉', async () => {
    await midRunAfterUserScrolledAway(60);

    // 用户自己滚回底部(此刻底下 500px 是内容,再底下 508 才是空白)。
    await userScrollTo(maxScrollTop());
    const trace = await collapseTrace();

    // 收到位:只剩「消息还够得着顶端」所需的那 8px。
    expect(trace[trace.length - 1]!.spacer).toBe(8);
    // 而且屏幕上真的没有空白了:贴着底时露出来的空白 = 占位块 − 离底距离。
    const blankOnScreen = tailSpacerHeight() - (maxScrollTop() - geom.scrollTop);
    expect(blankOnScreen).toBeLessThanOrEqual(TAIL_SPACER_VISIBLE_BLANK_TRIGGER_PX);
  });

  it('离底很远(空白整块在折线以下)—— 一个像素都不许动', async () => {
    await midRunAfterUserScrolledAway(60);

    // 用户在中间读东西:离底 800px,508 的空白全在他看不见的地方。
    await userScrollTo(maxScrollTop() - 800);
    const before = { spacer: tailSpacerHeight(), scrollTop: geom.scrollTop };
    const trace = await collapseTrace();

    expect(trace[trace.length - 1]!).toEqual(before);
  });

  /*
   * ── 反向对照 1:占位块存在的**全部理由**不能被收没了 ────────────────
   */
  it('收完之后,下一条新消息照样滚到屏幕最顶', async () => {
    const { rerender } = await midRunAfterUserScrolledAway(60);
    await userScrollTo(maxScrollTop());
    await collapseTrace();
    expect(tailSpacerHeight()).toBe(8);

    // 用户接着又发了一条。
    const withFollowUp = withNewTurn('a'.repeat(400));
    withFollowUp.push({
      id: 'u-follow-up', role: 'user', content: 'now make it dark',
      createdAt: 1_700_000_002_000,
    });
    geom.lastUserTopInContent = geom.contentHeight;
    geom.contentHeight += USER_MSG_H;
    await act(async () => {
      rerender(chatPaneEl(withFollowUp, true));
    });
    await flushFrames();
    await advanceSmoothScroll();

    expect(geom.scrollTop).toBe(anchoredScrollTop());
    expect(tailSpacerHeight()).toBe(VIEWPORT - USER_MSG_H - ANCHOR_TOP_PADDING);
  });

  /*
   * ── 反向对照 2:阈值边界上反复微滚,不许来回抖 ──────────────────────
   *
   * 这是方案 B 最可能的坑:门槛附近手抖一下,空白就跟着一涨一缩。
   * 护栏有两条 —— 起手判据只问一次(闩),以及收缩本身只减不增。
   */
  it('在起手门槛两侧反复微滚,占位块只单调收一次,之后再也不动', async () => {
    await midRunAfterUserScrolledAway(60);

    // 停在「露出来的空白正好 52px」那条线上 —— 门槛本身,不含。
    await userScrollTo(maxScrollTop() - (508 - TAIL_SPACER_VISIBLE_BLANK_TRIGGER_PX));
    expect(tailSpacerHeight()).toBe(508);

    const heights: number[] = [tailSpacerHeight()];
    const jumps: number[] = [];
    // 门槛两侧来回微滚 12 次,每次 4px。
    for (let i = 0; i < 12; i += 1) {
      const before = geom.scrollTop;
      await userScrollTo(before + (i % 2 === 0 ? 4 : -4));
      const trace = await collapseTrace();
      for (let f = 1; f < trace.length; f += 1) {
        heights.push(trace[f]!.spacer);
        jumps.push(Math.abs(trace[f]!.scrollTop - trace[f - 1]!.scrollTop));
      }
    }

    // 只减不增:整条曲线单调不上升。
    for (let i = 1; i < heights.length; i += 1) {
      expect(heights[i]!).toBeLessThanOrEqual(heights[i - 1]!);
    }
    // 确实收了(不是靠「一次都没动」蒙混过关)。
    expect(heights[heights.length - 1]!).toBe(8);
    // 而且**每一帧**画面挪动都不超过一格预算 —— 这就是「往下滚不会跳」。
    expect(Math.max(...jumps)).toBeLessThanOrEqual(TAIL_SPACER_COLLAPSE_STEP_PX);
  });

  /*
   * ── 反向对照 3:流式期间锚点不许跳 ──────────────────────────────────
   *
   * 用户不动手的那条主路(钉顶还活着)必须一个字都没变。
   */
  it('用户不动手的一轮:整轮锚点纹丝不动,收缩仍旧走原来那条路', async () => {
    const { rerender } = render(chatPaneEl(history(), false));
    await flushMounts();
    await flushFrames();

    arriveNewUserTurn();
    await act(async () => {
      rerender(chatPaneEl(withNewTurn(null), true));
    });
    await flushFrames();
    await advanceSmoothScroll();

    const positions: number[] = [geom.scrollTop];
    for (let chunk = 1; chunk <= 5; chunk += 1) {
      geom.contentHeight += 100;
      await act(async () => {
        rerender(chatPaneEl(withNewTurn('a'.repeat(chunk * 80)), true));
      });
      await flushFrames();
      await triggerResize();
      positions.push(geom.scrollTop);
    }

    expect(new Set(positions)).toEqual(new Set([anchoredScrollTop()]));
    // 500px 内容长出来之后,占位块按原公式收到 8。
    expect(tailSpacerHeight()).toBe(8);
  });
});
