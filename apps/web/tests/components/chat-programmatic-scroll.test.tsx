// @vitest-environment jsdom
/**
 * 我们自己滚出来的 scroll 事件,不许被判成「用户在滚」。
 *
 * ## 缺陷
 *
 * 「是不是用户在滚」的判据是「**方向 + `scrollHeight` 没变**」(`stick-to-bottom.ts`)。
 * 它成立的前提是一条**从没写下来**的不变量:我们自己从不主动把视图往回滚。
 * `ChatPane` 的 question-form 定位违反了这条 —— 它用 `behavior:'smooth'`,
 * 而平滑滚动是**先记基线、后落地**:基线记的是预测终点,浏览器随后吐出来的一串
 * 中间位置全在终点的另一侧,于是第一批中间帧在判据眼里就是一次用户滚动。
 *
 * 关键线索是**同一段逻辑的初次加载版本早就改成了 `'auto'`**(`ChatPane.tsx:2383`),
 * 注释把理由写得清清楚楚:「Smooth scrolling emits intermediate scroll events after
 * we have predicted the destination, which makes those frames look like user input」。
 * 两处几乎逐字相同,只修了一处。
 *
 * ## 这个夹具在模拟什么
 *
 * jsdom 没有 `scrollIntoView`,所以这里按 CSSOM-View「perform a scroll」补一个:
 *   · `behavior:'auto'` —— 位置**同步**落到终点,随后一个 scroll 事件报的就是终点;
 *   · `behavior:'smooth'` —— 位置当场不动,记一段动画;之后每一帧报一个中间位置。
 * 建模的是平台契约,不是我们的实现。判据看到什么,取决于哪一种。
 */

// jsdom 没有 scrollTo(见同目录 chat-scroll-following 的同一段)。
if (typeof HTMLElement.prototype.scrollTo !== 'function') {
  HTMLElement.prototype.scrollTo = function (options?: ScrollToOptions | number) {
    if (typeof options === 'object' && options !== null) {
      if (options.top !== undefined) this.scrollTop = options.top;
    }
  };
}

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage } from '../../src/types';

type Geom = { contentHeight: number; clientHeight: number; scrollTop: number };
let geom: Geom;
let rafCallbacks: FrameRequestCallback[];
let resizeCallbacks: ResizeObserverCallback[];
let savedDescriptors: Record<
  'scrollTop' | 'scrollHeight' | 'clientHeight' | 'offsetHeight',
  PropertyDescriptor | undefined
>;
let originalScrollIntoView: PropertyDescriptor | undefined;
let originalGetBoundingClientRect: PropertyDescriptor | undefined;
/**
 * 表单上边在视口里的位置。**必须在渲染之前设好** —— 定位那个 effect 在
 * `rerender` 的同一拍里就跑完了,渲染之后再补 stub 已经晚了(第一版就栽在这)。
 */
let formTopInViewport = 0;
/** 反馈「选择原因」面板上边在视口里的位置。见文件末尾那一组用例。 */
let reasonPanelTopInViewport = 0;
let originalResizeObserver: typeof ResizeObserver | undefined;

/** 平滑滚动还没落地的那一段 */
let pendingSmooth: { from: number; to: number } | null = null;
/** 每次 `scrollIntoView` 拿到的 behavior —— 用来钉「传下去的到底是哪一个」 */
let scrollIntoViewBehaviors: Array<ScrollBehavior | undefined>;

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

beforeEach(() => {
  geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
  rafCallbacks = [];
  resizeCallbacks = [];
  pendingSmooth = null;
  scrollIntoViewBehaviors = [];
  formTopInViewport = 0;
  reasonPanelTopInViewport = 0;

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
   * 只有表单那个元素会说话:`.chat-log` 自己保持 jsdom 默认的全零矩形,
   * 于是「表单上边在内容里的偏移」= `scrollTop + formTopInViewport`。
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
      if (typeof this.hasAttribute === 'function' && this.hasAttribute('data-form-id')) {
        return {
          ...zeroRect(),
          top: formTopInViewport,
          bottom: formTopInViewport + 120,
          height: 120,
          y: formTopInViewport,
        } as DOMRect;
      }
      if (
        typeof this.classList?.contains === 'function'
        && this.classList.contains('assistant-feedback-reasons')
      ) {
        return {
          ...zeroRect(),
          top: reasonPanelTopInViewport,
          bottom: reasonPanelTopInViewport + 96,
          height: 96,
          y: reasonPanelTopInViewport,
        } as DOMRect;
      }
      return zeroRect() as DOMRect;
    },
  });

  /*
   * CSSOM-View「perform a scroll」的两条分支。`block:'start'` = 把目标的上边
   * 对到容器上边,落点按浏览器语义**夹到** [0, maxScrollTop]。
   */
  originalScrollIntoView = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollIntoView',
  );
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value(this: HTMLElement, arg?: boolean | ScrollIntoViewOptions) {
      const options = typeof arg === 'object' && arg !== null ? arg : {};
      scrollIntoViewBehaviors.push(options.behavior);
      const log = document.querySelector<HTMLElement>('.chat-log');
      if (!log) return;
      const rect = this.getBoundingClientRect();
      const logTop = log.getBoundingClientRect().top;
      const topInContent = geom.scrollTop + (rect.top - logTop);
      const bottomInContent = geom.scrollTop + (rect.bottom - logTop);
      /*
       * CSSOM-View 的 `block` 语义。两者的差别正是这条缺陷的全部内容:
       *   · `'start'` —— **无条件**把目标顶到视口上沿。目标本来就在眼前也照顶,
       *     于是屏幕上的一切平移一段。
       *   · `'nearest'` —— 目标已经完整可见就**一步都不走**;露不全时只补上
       *     「让它露出来」所需的最小位移。
       */
      const block = options.block ?? 'start';
      let desired: number;
      if (block === 'nearest') {
        const viewTop = geom.scrollTop;
        const viewBottom = geom.scrollTop + geom.clientHeight;
        if (topInContent >= viewTop && bottomInContent <= viewBottom) desired = geom.scrollTop;
        else if (topInContent < viewTop) desired = topInContent;
        else desired = bottomInContent - geom.clientHeight;
      } else {
        desired = topInContent;
      }
      const to = Math.min(Math.max(0, desired), maxScrollTop());
      // 位置没变就不是一次滚动:浏览器不会为它跑动画,也不会发 scroll / scrollend
      // (csswg-drafts #8218)。夹具照做,否则「没滚」和「滚了 0 像素」分不开。
      if (to === geom.scrollTop) return;
      if (options.behavior === 'smooth') {
        // 平滑:当场一动不动,浏览器随后一帧一帧地挪。
        pendingSmooth = { from: geom.scrollTop, to };
        return;
      }
      // 瞬时:位置同步落到终点,随后一个 scroll 事件报的就是终点。
      geom.scrollTop = to;
      fireEvent.scroll(log);
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
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
  } else {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView;
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
    for (let round = 0; round < 5; round += 1) {
      const callbacks = rafCallbacks.splice(0);
      if (callbacks.length === 0) break;
      callbacks.forEach((callback) => callback(performance.now()));
      await Promise.resolve();
    }
  });
}

/**
 * 内容长高之后 ResizeObserver 到达 —— 这是生产里「变了要去算」的**真实**通路
 * (`scheduleFollowSync` → `syncFollowState`)。跟随还活着就贴底,松了就不动。
 * 所以「贴没贴底」在这里是跟随意图的直接读数。
 */
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
 * ⚠️ 终点是**调用 `scrollIntoView` 那一刻**算死的,动画期间内容再长也不会跟着改。
 * 这是 CSSOM-View 的语义,也正是这条缺陷的要害。
 */
let smoothFrame = 0;
async function advanceSmoothScrollBy(frames: number, total: number) {
  const anim = pendingSmooth;
  // 瞬时滚动没有动画可走 —— 位置在调用那一拍就落定了。这里**不报错**是有意的:
  // 用例钉的是「跟随还在不在」,不是「用了哪种滚法」。哪天有人把平滑改回来,
  // 这里立刻又有帧可走,红的还是同一条。
  if (!anim) return;
  const log = chatLog();
  for (let i = 0; i < frames; i += 1) {
    smoothFrame += 1;
    const t = Math.min(1, smoothFrame / total);
    await act(async () => {
      geom.scrollTop = Math.round(anim.from + (anim.to - anim.from) * t);
      fireEvent.scroll(log);
      await Promise.resolve();
    });
  }
  if (smoothFrame >= total) {
    pendingSmooth = null;
    smoothFrame = 0;
  }
}

async function advanceSmoothScroll(steps: number) {
  smoothFrame = 0;
  await advanceSmoothScrollBy(steps, steps);
}

const FORM_CONTENT = [
  'One quick check:',
  '<question-form id="discovery" title="Brief">',
  '```json',
  '{"questions":[{"id":"platform","label":"Platform","type":"radio",'
    + '"options":["Mobile","Desktop"],"required":true}]}',
  '```',
  '</question-form>',
].join('\n');

function conversation(withForm: boolean): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (let i = 0; i < 8; i += 1) {
    messages.push({ id: `u${i}`, role: 'user', content: `request ${i}`, createdAt: 1_700_000_000_000 + i * 2 });
    messages.push({ id: `a${i}`, role: 'assistant', content: `reply ${i}`, createdAt: 1_700_000_000_000 + i * 2 + 1 });
  }
  messages.push({
    id: 'streaming',
    role: 'assistant',
    content: withForm ? FORM_CONTENT : 'thinking about it',
    createdAt: 1_700_000_000_100,
    runStatus: 'running',
  });
  return messages;
}

function chatPaneEl(messages: ChatMessage[], streaming: boolean) {
  return (
    <ChatPane
      messages={messages}
      streaming={streaming}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={() => {}}
      onStop={() => {}}
      conversations={[]}
      activeConversationId="conv-1"
      onSelectConversation={() => {}}
      onDeleteConversation={() => {}}
    />
  );
}

/**
 * 把表单钉在「上边已经在视口下沿以下」—— 也就是**对齐之后仍然贴底**
 * (`distanceFromBottomAfterAligningTop` 把落点夹到 maxScrollTop,距离 0)。
 *
 * 这是关键的一格:落点在底部,`settleFollowAfterPredictedScroll` 因此判定
 * 「还在跟随」并**保留**跟随意图 —— 之后再丢,就只能是动画自己丢的。
 * 落点不在底部的那一格里跟随本来就该按设计松开,两种 behavior 没有分别。
 */
function placeFormBelowViewport() {
  formTopInViewport = geom.clientHeight + 40;
}

describe('平滑定位不许把自己判成用户滚动', () => {
  it('夹具自检:表单真的渲染出了 [data-form-id]', async () => {
    render(chatPaneEl(conversation(true), true));
    await flushFrames();
    expect(document.querySelector('[data-form-id]')).not.toBeNull();
  });

  it('流式中到达的 question-form:平滑中间帧不得把跟随打断', async () => {
    // 1) 先跟着流水跑,贴在底部。
    const { rerender } = render(chatPaneEl(conversation(false), true));
    await flushFrames();
    expect(geom.scrollTop).toBe(maxScrollTop());

    // 2) 带着表单的那一块内容到了 —— 内容同时长高 240px。
    //    这一拍里 scrollTop 还停在**旧的**底部,离新底部差 240px:
    //    跟随是意图,贴底是随后才写回去的结果。
    geom.contentHeight += 240;
    // 表单落在视口下沿以下 → 对齐落点被夹到底部 → 判定「仍在跟随」。
    placeFormBelowViewport();
    await act(async () => {
      rerender(chatPaneEl(conversation(true), true));
    });
    await flushFrames();

    // 3) 浏览器把这次平滑滚动一帧一帧走完(方向朝下,终点是新底部)。
    await advanceSmoothScroll(4);

    // 4) 又来一块内容,ResizeObserver 到达。用户一根手指都没碰过,必须仍然跟着走。
    geom.contentHeight += 160;
    await triggerResize();
    expect(geom.scrollTop).toBe(maxScrollTop());
  });

  /*
   * 真实的流式:平滑动画要跑两三百毫秒,这段时间里模型还在吐字,内容一直在长。
   *
   * 浏览器的落点是**调用那一刻**算死的,不会跟着内容走;而我们记的基线也是那一刻的。
   * 于是动画落地时,它停在一个**早就不是底部**的位置上 —— 中途那一帧上滚已经把
   * 跟随打掉,而最后一帧不再贴底,也就没有那次「顺手救回来」。跟随就此留在松开状态,
   * 用户一根手指都没碰过。
   *
   * 瞬时滚动天生没有这个窗口:位置在同一拍里落定,基线和落点永远一致,
   * 之后的内容增长走 ResizeObserver → 贴底,一个 scroll 事件都不需要参与判定。
   */
  it('平滑动画跑的这两百毫秒里内容还在长 —— 跟随就此丢了,再也不自己回来', async () => {
    const { rerender } = render(chatPaneEl(conversation(false), true));
    await flushFrames();
    expect(geom.scrollTop).toBe(maxScrollTop());

    geom.contentHeight += 240;
    placeFormBelowViewport();
    await act(async () => {
      rerender(chatPaneEl(conversation(true), true));
    });
    await flushFrames();

    // 动画刚起步,模型又吐了一块 —— 底部往下跑了,而动画的终点是钉死的。
    await advanceSmoothScrollBy(1, 4);
    geom.contentHeight += 300;
    await advanceSmoothScrollBy(3, 4);

    // 内容继续长。用户全程没碰过滚轮,必须还跟着走。
    geom.contentHeight += 160;
    await triggerResize();
    expect(geom.scrollTop).toBe(maxScrollTop());
  });

  it('定位用的是瞬时滚动 —— 平滑那条路本身就是缺陷的来源', async () => {
    const { rerender } = render(chatPaneEl(conversation(false), true));
    await flushFrames();

    geom.contentHeight += 240;
    placeFormBelowViewport();
    await act(async () => {
      rerender(chatPaneEl(conversation(true), true));
    });
    await flushFrames();

    // 初次加载那一份(ChatPane.tsx:2383)早就是 'auto' 了,理由写在它自己的注释里。
    // 流式这一份必须同口径,否则那条不变量只剩半边。
    expect(scrollIntoViewBehaviors).not.toHaveLength(0);
    expect(scrollIntoViewBehaviors.at(-1)).toBe('auto');
  });
});

/*
 * ── 恢复侧的不对称(W7 §6.2)──────────────────────────────────────────
 *
 * 逃逸有兜底:`onWheel(deltaY<0)` 和 `onTouchMove` 都绕开判据直接松手,因为
 * 快速流式时浏览器会把那一格滚轮整个吃掉,连 scroll 事件都不发。
 * 恢复**一个兜底都没有** —— 它只能走 `nextFollowIntent`,而那里要求 `layoutStable`
 * (`scrollHeight` 和 `clientHeight` 都没变)。流式期间内容每一帧都在长。
 *
 * 于是:用户滚回底部想重新跟上,只要那一下的 scroll 事件恰好落在「内容也长了」的
 * 帧上,整个事件就被丢掉,他白滚一次。现有 28 条滚动用例的 `userScrollTo()`
 * 只改 `scrollTop`,内容增长永远发生在滚动**之后** —— 同帧这一格一条都没有。
 */
describe('恢复跟随:用户的滚动和内容增长撞在同一帧', () => {
  /** 用户滚到 `top`,而**同一帧**里内容又长高了 `grewBy` —— 一个 scroll 事件报两件事。 */
  async function userScrollToWhileGrowing(top: number, grewBy: number) {
    await act(async () => {
      geom.contentHeight += grewBy;
      geom.scrollTop = Math.min(Math.max(0, top), maxScrollTop());
      fireEvent.scroll(chatLog());
      await Promise.resolve();
    });
  }

  it('滚回底部那一下正好撞上内容增长,跟随仍要恢复', async () => {
    const { rerender } = render(chatPaneEl(conversation(false), true));
    await flushFrames();

    // 用户往上滚,松开跟随(这条路有 wheel 兜底,先按常规 scroll 走)。
    await act(async () => {
      geom.scrollTop = 3000;
      fireEvent.scroll(chatLog());
      await Promise.resolve();
    });
    geom.contentHeight += 200;
    await triggerResize();
    expect(geom.scrollTop).toBe(3000); // 确实松开了:没有被拽回底部

    // 用户一路滚回底部 —— 而流式还在继续,这一下正好和一块新内容撞在同一帧。
    await userScrollToWhileGrowing(maxScrollTop() + 300, 300);

    // 再来一块内容:跟随应该已经恢复,视图跟着走。
    geom.contentHeight += 160;
    await act(async () => {
      rerender(chatPaneEl(conversation(false), true));
    });
    await triggerResize();
    expect(geom.scrollTop).toBe(maxScrollTop());
  });
});

/** 点最后一条回合的赞 —— 和用户在屏幕上做的是同一件事。 */
async function clickThumbsUp() {
  const buttons = document.querySelectorAll<HTMLElement>(
    '[data-testid="assistant-feedback-positive"]',
  );
  const button = buttons[buttons.length - 1];
  if (!button) throw new Error('no thumbs-up button rendered');
  await act(async () => {
    fireEvent.click(button);
    await Promise.resolve();
  });
  await flushFrames();
}

/*
 * ── 点赞不该把视图挪走 ───────────────────────────────────────────────
 *
 * 现场:用户回看一条**已经跑完**的历史消息,点了回合底部的赞 → 下面展开
 * 「选择原因」面板 → 滚动条自己滚了一下。用户原话:「为什么我点击这个,
 * 滚动条会自动滚动一下啊?」
 *
 * 机制不是贴底跟随(他在回看历史,压根不在跟随态),而是面板挂载时**无条件**
 * 调了一次 `scrollIntoView({ block:'start' })`:那是「把面板顶到视口上沿」,
 * 面板本来就在眼前也照顶不误 —— 于是屏幕上的一切平移了一段。
 *
 * 判据很朴素:**用户主动打开一个面板,不该导致视图跳动。**
 * 面板在视口外时滚它进来是合理的;就在眼前时,一个像素都不该动。
 */
describe('点赞展开原因面板', () => {
  function chatPaneWithFeedback(messages: ChatMessage[]) {
    return (
      <ChatPane
        messages={messages}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={() => {}}
        onStop={() => {}}
        onAssistantFeedback={() => {}}
        conversations={[]}
        activeConversationId="conv-1"
        onSelectConversation={() => {}}
        onDeleteConversation={() => {}}
      />
    );
  }

  function finishedConversation(): ChatMessage[] {
    const messages: ChatMessage[] = [];
    for (let i = 0; i < 8; i += 1) {
      messages.push({ id: `u${i}`, role: 'user', content: `request ${i}`, createdAt: 1_700_000_000_000 + i * 2 });
      messages.push({
        id: `a${i}`,
        role: 'assistant',
        content: `reply ${i}`,
        createdAt: 1_700_000_000_000 + i * 2 + 1,
        runStatus: 'succeeded',
      });
    }
    return messages;
  }

  it('夹具自检:赞按钮和原因面板真的渲染出来了', async () => {
    render(chatPaneWithFeedback(finishedConversation()));
    await flushFrames();
    expect(document.querySelector('[data-testid="assistant-feedback-positive"]')).not.toBeNull();
    await clickThumbsUp();
    expect(document.querySelector('.assistant-feedback-reasons')).not.toBeNull();
  });

  it('面板就在眼前时,点赞不许挪动视图一个像素', async () => {
    render(chatPaneWithFeedback(finishedConversation()));
    await flushFrames();

    // 用户回看历史:停在流水中间,不在底部,也就不在跟随态。
    await act(async () => {
      geom.scrollTop = 2000;
      fireEvent.scroll(chatLog());
      await Promise.resolve();
    });
    const before = geom.scrollTop;
    // 面板展开后落在视口正中 —— 用户本来就看得见它。
    reasonPanelTopInViewport = 180;

    await clickThumbsUp();

    expect(geom.scrollTop).toBe(before);
    expect(pendingSmooth).toBeNull();
  });

  it('面板确实被挤到视口外时,才允许滚它进来', async () => {
    render(chatPaneWithFeedback(finishedConversation()));
    await flushFrames();
    await act(async () => {
      geom.scrollTop = 2000;
      fireEvent.scroll(chatLog());
      await Promise.resolve();
    });
    // 面板下沿在视口下沿之外(视口高 400,面板 180→276 是可见的;这里推到 380→476)。
    reasonPanelTopInViewport = 380;

    await clickThumbsUp();
    // 平滑的话让它走完;瞬时的话这一步什么都不做。
    await advanceSmoothScroll(4);

    // 滚进来了,而且只滚了「让它露出来」所需的那么多 —— 不是顶到上沿。
    // 顶到上沿会落在 2380,那是把用户正在看的内容整段推走。
    expect(geom.scrollTop).toBeGreaterThan(2000);
    expect(geom.scrollTop).toBe(2000 + 476 - geom.clientHeight);
  });
});

/*
 * ── 顺带:这枚 `scrollIntoView` 还是第四个「程序平滑滚动」站点 ──────────
 *
 * 上一轮给判据写下的不变量是「自己发起的滚动一律瞬时;要动画,先 release()」。
 * 当时清点过三个站点(anchor-to-top / 回到最新 / rail 导航)都各自守住了,
 * 并且记了一句「哪天冒出第四个再回头看」。反馈面板就是那第四个,而且它
 * 一条都没守:既是 `'smooth'`,也没有 release。
 *
 * 所以这里除了「不许挪视图」,还要钉住它不能把流式跟随打掉 —— 用户在跟着
 * 最新输出跑的时候顺手点了个赞,不该因此就再也不跟了。
 */
describe('点赞不许把流式跟随打掉', () => {
  it('跟着最新输出跑的时候点赞,之后的内容仍然跟着走', async () => {
    const messages: ChatMessage[] = [];
    for (let i = 0; i < 8; i += 1) {
      messages.push({ id: `u${i}`, role: 'user', content: `request ${i}`, createdAt: 1_700_000_000_000 + i * 2 });
      messages.push({
        id: `a${i}`,
        role: 'assistant',
        content: `reply ${i}`,
        createdAt: 1_700_000_000_000 + i * 2 + 1,
        runStatus: 'succeeded',
      });
    }
    const { rerender } = render(
      <ChatPane
        messages={messages}
        streaming
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={() => {}}
        onStop={() => {}}
        onAssistantFeedback={() => {}}
        conversations={[]}
        activeConversationId="conv-1"
        onSelectConversation={() => {}}
        onDeleteConversation={() => {}}
      />,
    );
    await flushFrames();
    expect(geom.scrollTop).toBe(maxScrollTop());

    // 面板展开时落在视口里(用户就贴在底部,最后一条就在眼前)。
    reasonPanelTopInViewport = 240;
    await clickThumbsUp();
    await advanceSmoothScroll(4);

    // 模型继续吐字。用户没碰过滚轮,必须还跟着走。
    geom.contentHeight += 200;
    await act(async () => {
      rerender(
        <ChatPane
          messages={messages}
          streaming
          error={null}
          projectId="project-1"
          projectFiles={[]}
          onEnsureProject={async () => 'project-1'}
          onSend={() => {}}
          onStop={() => {}}
          onAssistantFeedback={() => {}}
          conversations={[]}
          activeConversationId="conv-1"
          onSelectConversation={() => {}}
          onDeleteConversation={() => {}}
        />,
      );
    });
    await triggerResize();
    expect(geom.scrollTop).toBe(maxScrollTop());
  });
});
