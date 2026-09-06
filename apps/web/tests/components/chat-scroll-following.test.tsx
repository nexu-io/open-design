// @vitest-environment jsdom

// Polyfill scrollTo for jsdom (not available in jsdom's HTMLElement).
if (typeof HTMLElement.prototype.scrollTo !== 'function') {
  HTMLElement.prototype.scrollTo = function (
    options?: ScrollToOptions | number,
    _y?: number,
  ) {
    if (typeof options === 'object' && options !== null) {
      if (options.top !== undefined) this.scrollTop = options.top;
      if (options.left !== undefined) this.scrollLeft = options.left;
    }
  };
}

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPane } from '../../src/components/ChatPane';
import { flushMounts, pressEnter, typeInComposer } from '../helpers/lexical-composer';
import type { ChatMessage } from '../../src/types';

/*
 * jsdom 没有排版引擎,`scrollTop / scrollHeight / clientHeight` 全是 0,所以滚动行为
 * 只能靠夹具喂几何。这里比同目录里既有的两份夹具多走一步:**让几何自洽**。
 *
 *  · `scrollHeight` = 真实内容高 + 尾部占位块当前的内联高度。占位块的高度是被测组件
 *    自己写的(anchor-to-top 的预留空白),不把它算进 `scrollHeight`,「底下还有多少」
 *    这件事在测试里就永远量不准。
 *  · `scrollTop` 的写入按浏览器语义**夹到 [0, scrollHeight - clientHeight]**。不夹的话
 *    `el.scrollTop = el.scrollHeight` 会留下一个真实浏览器里不存在的数,后面所有
 *    「离底部多远」都是错的。
 *  · 尾部占位块的 `offsetHeight` 也照着它自己的内联高度回答 —— `sizeAnchorSpacer`
 *    读的就是它。
 */
type Geom = { contentHeight: number; clientHeight: number; scrollTop: number };
let geom: Geom;
let rafCallbacks: FrameRequestCallback[];
let resizeCallbacks: ResizeObserverCallback[];
let savedDescriptors: Record<
  'scrollTop' | 'scrollHeight' | 'clientHeight' | 'offsetHeight',
  PropertyDescriptor | undefined
>;
let originalResizeObserver: typeof ResizeObserver | undefined;
let originalMutationObserver: typeof MutationObserver | undefined;

/**
 * 把 MutationObserver 摘掉,好让**只剩** anchor 那一帧自己的收尾。
 *
 * 子树变动那条路也会去重算(见 ChatPane 里的 `scheduleFollowSync`),两条路都排 rAF,
 * 谁后跑没有保证 —— 而只有 anchor 那一帧是跑在 `scrollAnchorToTop()` **之后**的。
 * 想验「那一帧自己会收尾」,就得先把另一条路挪开,否则测的是谁都说不清。
 */
function disableMutationObserver() {
  originalMutationObserver = globalThis.MutationObserver;
  class NoopMutationObserver {
    observe() {}
    disconnect() {}
    takeRecords(): MutationRecord[] {
      return [];
    }
  }
  Object.defineProperty(globalThis, 'MutationObserver', {
    configurable: true,
    writable: true,
    value: NoopMutationObserver,
  });
}

function isChatLog(el: HTMLElement): boolean {
  return typeof el?.classList?.contains === 'function' && el.classList.contains('chat-log');
}

function isTailSpacer(el: HTMLElement): boolean {
  return (
    typeof el?.classList?.contains === 'function' &&
    el.classList.contains('chat-log-tail-spacer')
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
  geom = { contentHeight: 1000, clientHeight: 400, scrollTop: 0 };
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
  } else {
    delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
  }
  if (originalMutationObserver) {
    Object.defineProperty(globalThis, 'MutationObserver', {
      configurable: true,
      writable: true,
      value: originalMutationObserver,
    });
    originalMutationObserver = undefined;
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

async function triggerResize() {
  await act(async () => {
    [...resizeCallbacks].forEach((callback) => callback([], {} as ResizeObserver));
    await Promise.resolve();
  });
}

function chatLog(): HTMLElement {
  return screen.getByTestId('chat-log');
}

function rect(values: Partial<DOMRect>): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...values,
  };
}

function selectStreamingReply(): { clear: () => void } {
  const assistantMessages = chatLog().querySelectorAll<HTMLElement>('.msg.assistant');
  const message = assistantMessages[assistantMessages.length - 1];
  if (!message) throw new Error('no streaming assistant message rendered');
  const range = document.createRange();
  range.selectNodeContents(message);
  vi.spyOn(range, 'getBoundingClientRect').mockReturnValue(
    rect({ left: 80, right: 220, top: 120, bottom: 144, width: 140, height: 24 }),
  );
  let collapsed = false;
  const selection = {
    get isCollapsed() {
      return collapsed;
    },
    rangeCount: 1,
    getRangeAt: () => range,
    toString: () => (collapsed ? '' : 'chunk'),
    removeAllRanges: () => {
      collapsed = true;
    },
  } as unknown as Selection;
  vi.spyOn(window, 'getSelection').mockReturnValue(selection);
  fireEvent(document, new Event('selectionchange'));
  return {
    clear: () => {
      collapsed = true;
      fireEvent(document, new Event('selectionchange'));
    },
  };
}

/** 用户真的用滚轮/触控板滚了一下:位置变了,然后浏览器发 scroll。 */
async function userScrollTo(top: number) {
  await act(async () => {
    geom.scrollTop = Math.min(Math.max(0, top), maxScrollTop());
    fireEvent.scroll(chatLog());
    await Promise.resolve();
  });
}

/*
 * 只给**最后一条用户消息**装一个会说话的 `getBoundingClientRect`。
 * 不整体替换原型上的那个方法:Lexical 和一堆定位逻辑都在读它,全局造假会波及无关组件。
 * chat-log 自己的矩形保持 jsdom 默认的全零,于是
 * `lastUserMsgTopInContent` 正好等于 `scrollTop + (msgTop - scrollTop) = msgTop`。
 */
function stubUserMessageTop(container: HTMLElement, topInContent: number) {
  const userEls = container.querySelectorAll<HTMLElement>('.msg.user');
  const last = userEls[userEls.length - 1];
  if (!last) throw new Error('no .msg.user rendered');
  Object.defineProperty(last, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      top: topInContent - geom.scrollTop,
      bottom: topInContent - geom.scrollTop,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: topInContent - geom.scrollTop,
      toJSON: () => ({}),
    }),
  });
}

function jumpBtnShown(): boolean {
  return screen.getByTestId('chat-jump-btn').getAttribute('aria-hidden') === 'false';
}

function bottomFloatSlot(): HTMLElement {
  return screen.getByTestId('chat-bottom-float-slot');
}

function chatPaneEl(
  messages: ChatMessage[],
  overrides: {
    streaming?: boolean;
    queuedItems?: Array<{ id: string; prompt: string }>;
    onUpdateQueuedSend?: Parameters<typeof ChatPane>[0]['onUpdateQueuedSend'];
  } = {},
) {
  return (
    <ChatPane
      messages={messages}
      streaming={overrides.streaming ?? false}
      queuedItems={overrides.queuedItems}
      onUpdateQueuedSend={overrides.onUpdateQueuedSend}
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

function longConversation(chunkText: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (let i = 0; i < 8; i += 1) {
    messages.push({
      id: `u${i}`,
      role: 'user',
      content: `request ${i}`,
      createdAt: 1_700_000_000_000 + i * 2,
    });
    messages.push({
      id: `a${i}`,
      role: 'assistant',
      content: `reply ${i}`,
      createdAt: 1_700_000_000_000 + i * 2 + 1,
    });
  }
  messages.push({
    id: 'streaming',
    role: 'assistant',
    content: chunkText,
    createdAt: 1_700_000_000_100,
    runStatus: 'running',
  });
  return messages;
}

function longConversationWithTodo(chunkText: string): ChatMessage[] {
  const messages = longConversation(chunkText);
  const current = messages[messages.length - 1]!;
  return [
    ...messages.slice(0, -1),
    {
      ...current,
      events: [{
        kind: 'tool_use' as const,
        id: 'todo-current',
        name: 'TodoWrite',
        input: {
          todos: [
            { content: 'Inspect the current layout', status: 'completed' },
            { content: 'Apply the visual fix', status: 'in_progress' },
            { content: 'Verify the result', status: 'pending' },
          ],
        },
      }],
    },
  ];
}

describe('流式输出时的滚动跟随(用户 2026-08-27)', () => {
  /*
   * 「agent 在快速流式输出内容时,每次输出就会自动回到最底,整个对话框连向上滚动都不行」
   *
   * 关键在**「连向上滚动都不行」**:不是「跟随太积极」,是**滚不动**。原因是
   * 「我是否在跟随」这件事**由位置反推**(`distance < 80`),而跟随本身**又把位置写回底部**——
   * 触控板一格 40px 抬不出 80px 的坑,下一帧就被拽回去,于是永远逃不掉。
   * 所以这一条必须用「连着滚好几下」来测:滚一下就跳出阈值的写法测不出这个死锁。
   */
  it('用户向上滚之后,后续每一块流式内容都不许把视图拽回底部', async () => {
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    let text = 'chunk';
    const { rerender } = render(chatPaneEl(longConversation(text), { streaming: true }));
    await flushFrames();
    // 初始落底。
    expect(geom.scrollTop).toBe(4600);

    // 用户连着往上滚五下,每下 40px —— 触控板/鼠标滚轮的真实粒度。
    // 每两下之间模型又吐一块内容(内容变高 + ResizeObserver 回调)。
    for (let step = 0; step < 5; step += 1) {
      await userScrollTo(geom.scrollTop - 40);
      text += ' more';
      geom.contentHeight += 120;
      await act(async () => {
        rerender(chatPaneEl(longConversation(text), { streaming: true }));
      });
      await triggerResize();
      await flushFrames();
    }

    // 用户把视图放在 4600 - 5*40 = 4400,五块内容之后它必须还在 4400。
    expect(geom.scrollTop).toBe(4400);
  });

  it('用户停在底部时,流式内容仍然自动跟随', async () => {
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    let text = 'chunk';
    const { rerender } = render(chatPaneEl(longConversation(text), { streaming: true }));
    await flushFrames();
    expect(geom.scrollTop).toBe(4600);

    for (let step = 0; step < 5; step += 1) {
      text += ' more';
      geom.contentHeight += 120;
      await act(async () => {
        rerender(chatPaneEl(longConversation(text), { streaming: true }));
      });
      await triggerResize();
      await flushFrames();
    }

    // 5 * 120 = 600 的增长,视图必须一路跟到新的底。
    expect(geom.scrollTop).toBe(maxScrollTop());
    expect(geom.scrollTop).toBe(5200);
  });

  it('助手正文有有效选区时暂停流式追尾，清除选区后恢复原有跟随意图', async () => {
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    let text = 'chunk';
    const { rerender } = render(chatPaneEl(longConversation(text), { streaming: true }));
    await flushFrames();
    expect(geom.scrollTop).toBe(4600);

    const selection = selectStreamingReply();
    expect(screen.getByTestId('chat-quote-bar')).toBeTruthy();

    text += ' more';
    geom.contentHeight += 120;
    await act(async () => {
      rerender(chatPaneEl(longConversation(text), { streaming: true }));
    });
    await triggerResize();
    await flushFrames();

    // 新 token 到来时保持用户正在读的选区，不得把 viewport 拉到新底部 4720。
    expect(geom.scrollTop).toBe(4600);

    selection.clear();
    await flushFrames();
    expect(geom.scrollTop).toBe(maxScrollTop());
    expect(geom.scrollTop).toBe(4720);
  });

  it('手动上滚后建立并清除选区，不得把已经挣脱的视图重新挂回追尾', async () => {
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    let text = 'chunk';
    const { rerender } = render(chatPaneEl(longConversation(text), { streaming: true }));
    await flushFrames();
    expect(geom.scrollTop).toBe(4600);

    await userScrollTo(4300);
    const selection = selectStreamingReply();
    selection.clear();

    text += ' more';
    geom.contentHeight += 120;
    await act(async () => {
      rerender(chatPaneEl(longConversation(text), { streaming: true }));
    });
    await triggerResize();
    await flushFrames();

    expect(geom.scrollTop).toBe(4300);
  });

  it('有效选区暂停追尾后，显式点「回到最新」会清选区并恢复跟随', async () => {
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    render(chatPaneEl(longConversation('chunk'), { streaming: true }));
    await flushFrames();
    selectStreamingReply();

    // 模拟流式内容一次长高到足以显示回到最新入口；暂停期间 viewport 不动。
    geom.contentHeight += 400;
    await triggerResize();
    await flushFrames();
    expect(geom.scrollTop).toBe(4600);
    expect(jumpBtnShown()).toBe(true);

    fireEvent.click(screen.getByTestId('chat-jump-btn'));
    await flushFrames();
    expect(geom.scrollTop).toBe(maxScrollTop());

    geom.contentHeight += 120;
    await triggerResize();
    await flushFrames();
    expect(geom.scrollTop).toBe(maxScrollTop());
  });

  it('滚轮往上拨一下就停手 —— 哪怕浏览器把这一格滚动整个吃掉', async () => {
    /*
     * 快速流式时,同一帧里只要我们写过 `scrollTop`,浏览器就会把这一次滚轮滚动
     * **直接取消**:位置纹丝不动,连 scroll 事件都不发。只看 scroll 事件的话,
     * 用户的手在这一帧就凭空消失了 —— 这正是「连向上滚动都不行」的手感来源之一。
     * 所以 wheel 事件本身要能松开跟随。
     */
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    let text = 'chunk';
    const { rerender } = render(chatPaneEl(longConversation(text), { streaming: true }));
    await flushFrames();
    expect(geom.scrollTop).toBe(4600);

    // 滚轮往上 —— 位置**没有**变化,浏览器把这一格吃了。
    await act(async () => {
      fireEvent.wheel(chatLog(), { deltaY: -40 });
      await Promise.resolve();
    });

    text += ' more';
    geom.contentHeight += 120;
    await act(async () => {
      rerender(chatPaneEl(longConversation(text), { streaming: true }));
    });
    await triggerResize();
    await flushFrames();

    // 没被拽到新的底(4720)。
    expect(geom.scrollTop).toBe(4600);
  });

  it('手指下拉也算停手(触屏)', async () => {
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    let text = 'chunk';
    const { rerender } = render(chatPaneEl(longConversation(text), { streaming: true }));
    await flushFrames();

    await act(async () => {
      fireEvent.touchStart(chatLog(), { touches: [{ clientY: 200 }] });
      fireEvent.touchMove(chatLog(), { touches: [{ clientY: 280 }] });
      await Promise.resolve();
    });

    text += ' more';
    geom.contentHeight += 120;
    await act(async () => {
      rerender(chatPaneEl(longConversation(text), { streaming: true }));
    });
    await triggerResize();
    await flushFrames();

    expect(geom.scrollTop).toBe(4600);
  });

  it('向上滚开之后再滚回底部,跟随要重新接上', async () => {
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    let text = 'chunk';
    const { rerender } = render(chatPaneEl(longConversation(text), { streaming: true }));
    await flushFrames();

    await userScrollTo(3000);
    text += ' more';
    geom.contentHeight += 120;
    await act(async () => {
      rerender(chatPaneEl(longConversation(text), { streaming: true }));
    });
    await triggerResize();
    await flushFrames();
    expect(geom.scrollTop).toBe(3000);

    // 用户自己滚回底部 —— 跟随重新接上。
    await userScrollTo(maxScrollTop());
    text += ' more';
    geom.contentHeight += 120;
    await act(async () => {
      rerender(chatPaneEl(longConversation(text), { streaming: true }));
    });
    await triggerResize();
    await flushFrames();
    expect(geom.scrollTop).toBe(maxScrollTop());
  });

  it('手动滚到距底部几十像素时不许提前吸底', async () => {
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    render(chatPaneEl(longConversation('chunk'), { streaming: true }));
    await flushFrames();
    expect(geom.scrollTop).toBe(4600);

    // 先明确离开跟随,再往下滚到距真实底部 30px。
    await userScrollTo(3000);
    await userScrollTo(maxScrollTop() - 30);

    // 这是用户选的阅读位置,不是“回到最新”。只有真的到底或点按钮才重新跟随。
    expect(geom.scrollTop).toBe(maxScrollTop() - 30);
  });

  it('运行中刚加入发送队列时,第一次手动上滚必须立即挣脱,后续队列 / Plan resize 不得抢回', async () => {
    /*
     * OPEND-2532 的时序不是普通的「流式时上滚」:
     *
     *   1. 原本贴底,run 仍在 streaming;
     *   2. 「添加到对话」让 QueuedSendStrip 在 chat-log 外面 mount,viewport 当场变矮;
     *   3. ResizeObserver 要到下一帧才刷新几何基线,用户已经在这一帧先滚了。
     *
     * 如果 scroll 事件仍拿 queue 出现前的 clientHeight 当 previous sample,
     * `nextFollowIntent` 会把这次上滚误判成布局变化、保留 following=true,
     * 同一条 onScroll 随即把 scrollTop 写回底部 —— 手感就是「完全滚不动」。
     */
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    const messages = longConversation('chunk');
    const { rerender } = render(chatPaneEl(messages, { streaming: true }));
    await flushFrames();
    expect(geom.scrollTop).toBe(4600);

    // Queue mount 让可用高度少 80px。刻意不触发 / 不 flush ResizeObserver:
    // 用户可以在观察者下一帧之前立刻碰滚轮或拖滚动条。
    geom.clientHeight = 320;
    await act(async () => {
      rerender(chatPaneEl(messages, {
        streaming: true,
        queuedItems: [{ id: 'queued-1', prompt: '把这条添加到对话' }],
      }));
    });

    await userScrollTo(4560);
    expect(geom.scrollTop).toBe(4560);

    // 随后 queue 的实际 ResizeObserver 到达,同时 TodoWrite 让 Plan 浮层出现、
    // 流水本身也继续长高。三种布局变化都只能更新几何 / 浮标,不能改回跟随意图。
    geom.contentHeight += 120;
    await act(async () => {
      rerender(chatPaneEl(longConversationWithTodo('chunk more'), {
        streaming: true,
        queuedItems: [{ id: 'queued-1', prompt: '把这条添加到对话' }],
      }));
    });
    geom.clientHeight = 280;
    await triggerResize();
    await flushFrames();
    expect(geom.scrollTop).toBe(4560);

    // 只有用户自己真的滚到底,才重新挂上 follow。
    await userScrollTo(maxScrollTop());
    geom.contentHeight += 120;
    await triggerResize();
    await flushFrames();
    expect(geom.scrollTop).toBe(maxScrollTop());
  });

  it('保存无法出队的就地编辑只更新队列，不得重新接上流式跟随', async () => {
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    const onUpdateQueuedSend = vi.fn();
    render(chatPaneEl(longConversation('chunk'), {
      streaming: true,
      queuedItems: [{ id: 'queued-1', prompt: '编辑后仍留在队列' }],
      onUpdateQueuedSend,
    }));
    await flushFrames();
    expect(geom.scrollTop).toBe(4600);

    await userScrollTo(3000);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await pressEnter();
    expect(onUpdateQueuedSend).toHaveBeenCalledWith(
      'queued-1',
      expect.objectContaining({ prompt: '编辑后仍留在队列' }),
    );

    geom.contentHeight += 120;
    await triggerResize();
    await flushFrames();
    expect(geom.scrollTop).toBe(3000);
  });

  it.each(['client-height-growth', 'content-height-shrink'] as const)(
    '距底 30px 后的 %s 只改变布局,不得恢复流式跟随',
    async (layoutChange) => {
      geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
      let text = 'chunk';
      const { rerender } = render(chatPaneEl(longConversation(text), { streaming: true }));
      await flushFrames();

      await userScrollTo(3000);
      await userScrollTo(maxScrollTop() - 30);
      expect(geom.scrollTop).toBe(4570);

      if (layoutChange === 'client-height-growth') geom.clientHeight += 30;
      else geom.contentHeight -= 30;
      await triggerResize();
      await flushFrames();
      expect(geom.scrollTop).toBe(maxScrollTop());

      // If the layout-only arrival at bottom cleared escaped, this next
      // streamed chunk would immediately write the new bottom (4690).
      text += ' more';
      geom.contentHeight += 120;
      await act(async () => {
        rerender(chatPaneEl(longConversation(text), { streaming: true }));
      });
      await triggerResize();
      await flushFrames();
      expect(geom.scrollTop).toBe(4570);
    },
  );
});

describe('「回到最新」什么时候该在(用户 2026-08-27:「总是在不该出现的时候出现」)', () => {
  it('滚到很上面时必须给入口', async () => {
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    render(chatPaneEl(longConversation('chunk'), { streaming: true }));
    await flushFrames();
    expect(jumpBtnShown()).toBe(false);

    await userScrollTo(1000);
    expect(jumpBtnShown()).toBe(true);
  });

  /*
   * ── 底部那一个浮层位归谁,由**滚动位置**说了算 ─────────────────────────
   *
   * 用户实测:跑任务时往上一滚,底下只剩「Step 3 of 5」,「回到最新」怎么都不出来
   * —— 再也回不到底部,只能一路手动滚回去。
   *
   * 根因是那条互斥写成了 `scrolledFromBottom && !planPillVisible`:Plan 无条件赢。
   * 而 Plan 在整个有计划的 run 期间都成立,于是唯一的回底入口被它遮死了一整轮。
   * (这条互斥是 2026-08-05 `356c8c364f` / #6142 带进来的,那一版只想到
   * 「同一个位置塞不下两个」,没想到被挤掉的那个正是唯一的出路。)
   *
   * 产品定的分工按位置:人在上面时他要的是回到最新;人贴着底时他已经在最新上,
   * 那个位置该让给「跑到第几步了」。
   *
   * 三态各自断言**具体可见性**。不写「两者不同时为真」——那句话在两者都为假时
   * 也成立,而「两者都为假」正是这个 bug 最难看的那一面。
   */
  it('滚到上面:浮层位让给「回到最新」,Plan 让开', async () => {
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    render(chatPaneEl(longConversationWithTodo('chunk'), { streaming: true }));
    await flushFrames();
    await userScrollTo(1000);

    const slot = bottomFloatSlot();
    expect(screen.queryByTestId('chat-plan-pill')).toBeNull();
    expect(screen.getByTestId('chat-jump-btn').parentElement).toBe(slot);
    expect(jumpBtnShown()).toBe(true);
    expect(slot.children).toHaveLength(1);
    /*
     * 预留空白**不跟着可见性走**。它是 `.chat-log` 的 padding-bottom,也就是真实的
     * 可滚内容的一部分:跟着开关会在上滚的那一刻抽掉 52px,scrollHeight 当场缩水、
     * 「离底多远」跟着变小,可能把状态judge回「贴底」→ Plan 回来 → 预留回来,
     * 来回抖。所以它钉在「这一轮有没有计划」上,整轮不变。
     */
    expect(chatLog().classList.contains('has-plan-pill-reserve')).toBe(true);
  });

  it('靠近底部且这一轮有计划:浮层位归 Plan,「回到最新」根本不挂', async () => {
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    render(chatPaneEl(longConversationWithTodo('chunk'), { streaming: true }));
    await flushFrames();

    const slot = bottomFloatSlot();
    expect(screen.getByTestId('chat-plan-pill')).toBeTruthy();
    expect(screen.queryByTestId('chat-jump-btn')).toBeNull();
    expect(slot.children).toHaveLength(1);
    expect(chatLog().classList.contains('has-plan-pill-reserve')).toBe(true);
  });

  it('靠近底部但这一轮没有计划:两枚都不出现', async () => {
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    render(chatPaneEl(longConversation('chunk'), { streaming: true }));
    await flushFrames();

    expect(screen.queryByTestId('chat-plan-pill')).toBeNull();
    // 「回到最新」常驻但收着 —— 它得留在树上,自己的进 / 退场动画才播得完整。
    expect(screen.getByTestId('chat-jump-btn')).toBeTruthy();
    expect(jumpBtnShown()).toBe(false);
    expect(chatLog().classList.contains('has-plan-pill-reserve')).toBe(false);
  });

  it('上滚 → 回底:浮层位在两枚之间来回换手,始终只有一个占着', async () => {
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    render(chatPaneEl(longConversationWithTodo('chunk'), { streaming: true }));
    await flushFrames();
    expect(screen.getByTestId('chat-plan-pill')).toBeTruthy();

    await userScrollTo(1000);
    expect(jumpBtnShown()).toBe(true);
    expect(screen.queryByTestId('chat-plan-pill')).toBeNull();

    // 点回到最新 —— 回到底部之后位置该还给 Plan。
    await act(async () => {
      fireEvent.click(screen.getByTestId('chat-jump-btn'));
    });
    await flushFrames();
    expect(screen.getByTestId('chat-plan-pill')).toBeTruthy();
    expect(screen.queryByTestId('chat-jump-btn')).toBeNull();
    expect(bottomFloatSlot().children).toHaveLength(1);
  });

  it('这一轮跑完:药丸连同它的预留一起收走,回到最新入口恢复', async () => {
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    const { rerender } = render(chatPaneEl(longConversationWithTodo('chunk'), { streaming: true }));
    await flushFrames();
    await userScrollTo(1000);

    const finishedMessages = longConversationWithTodo('chunk').map((message) =>
      message.id === 'streaming' ? { ...message, runStatus: 'succeeded' as const } : message,
    );
    await act(async () => {
      rerender(chatPaneEl(finishedMessages, { streaming: false }));
    });

    expect(screen.queryByTestId('chat-plan-pill')).toBeNull();
    expect(chatLog().classList.contains('has-plan-pill-reserve')).toBe(false);
    expect(screen.getByTestId('chat-jump-btn').parentElement).toBe(bottomFloatSlot());
    expect(bottomFloatSlot().children).toHaveLength(1);
    expect(jumpBtnShown()).toBe(true);
  });

  it('打开会话历史弹框时仍保留回到最新的入口', async () => {
    /*
     * OPEND-2420:用户从会话历史弹框打开一条长会话时,视图可能
     * 停在之前的阅读位置。这时「回到最新」是唯一个确定的到底入口,
     * 不能因为会话菜单还开着就把它从屏幕和键盘顺序一起摘掉。
     *
     * 菜单与浮标的遮挡关系应由堆叠层处理:菜单在上,浮标在下,
     * 而不是把浮标的交互状态改成「不存在」。
     */
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    render(chatPaneEl(longConversation('chunk'), { streaming: true }));
    await flushFrames();
    await userScrollTo(1000);
    expect(jumpBtnShown()).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByTestId('conversation-history-trigger'));
      await Promise.resolve();
    });

    expect(screen.getByTestId('conversation-history-menu')).toBeTruthy();
    expect(jumpBtnShown()).toBe(true);
    expect(screen.getByTestId('chat-jump-btn').getAttribute('tabindex')).toBe('0');
  });

  it('内容缩到滚不动之后,浮标必须自己收起(没有任何 scroll 事件)', async () => {
    /*
     * run 结束、执行记录自动收起,内容一下矮了一大截 —— 这是**没有 scroll 事件**的
     * 高度变化。浮标的判据如果只挂在 scroll 事件和「消息条数」上,这里就没人去重算,
     * 于是它挂在一屏根本滚不动的对话上。
     */
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    render(chatPaneEl(longConversation('chunk'), { streaming: true }));
    await flushFrames();
    await userScrollTo(1000);
    expect(jumpBtnShown()).toBe(true);

    /*
     * 执行记录收起来了:内容比视口还矮,滚都滚不动了。
     *
     * **刻意不重渲染** —— 折叠是组件自己的内部状态,消息数组一个字没变。这里只有
     * 一次 ResizeObserver 回调,没有 React 更新、也没有 scroll 事件。如果观察者
     * 那条路只在「正在跟随」时才做事(老写法就是),这一拍就没人去重算,浮标挂着不走。
     */
    geom.contentHeight = 300;
    geom.scrollTop = 0;
    await triggerResize();
    await flushFrames();

    expect(maxScrollTop()).toBe(0);
    expect(jumpBtnShown()).toBe(false);
  });

  it('在一屏装得下的对话里展开执行记录,不该唤出浮标', async () => {
    /*
     * 展开折叠块要「点开的那一行别动」,所以它会停掉跟随 —— 这是对的。
     * 但它同时**无条件**把浮标点亮了,不管底下有没有东西可回。
     */
    geom = { contentHeight: 300, clientHeight: 400, scrollTop: 0 };
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'build something', createdAt: 1 },
      {
        id: 'a1',
        role: 'assistant',
        content: 'on it',
        createdAt: 2,
        events: [
          { kind: 'tool_use', id: 'call-1', name: 'Read', input: { file_path: '/tmp/a.txt' } },
        ],
      },
    ];
    const { container } = render(chatPaneEl(messages));
    await flushFrames();
    expect(jumpBtnShown()).toBe(false);

    const toggle = container.querySelector<HTMLElement>(
      '.chat-log summary, .chat-log .thinking-toggle, .chat-log .action-card-toggle, .chat-log button.op-card-head, .chat-log [aria-expanded]',
    );
    expect(toggle).not.toBeNull();
    await act(async () => {
      fireEvent.click(toggle!);
      await Promise.resolve();
    });
    await flushFrames();

    expect(maxScrollTop()).toBe(0);
    expect(jumpBtnShown()).toBe(false);
  });


  const priorTurns: ChatMessage[] = [
    { id: 'u0', role: 'user', content: 'first request', createdAt: 1 },
    { id: 'a0', role: 'assistant', content: 'first reply', createdAt: 2 },
  ];

  const sentTurn: ChatMessage[] = [
    ...priorTurns,
    { id: 'u1', role: 'user', content: 'make the hero punchier', createdAt: 3 },
    { id: 'a1', role: 'assistant', content: '', createdAt: 4, runStatus: 'running' },
  ];

  /**
   * 走真实的发送路径(Lexical 编辑器 + Enter),把 anchor-to-top 真正点着。
   * `anchorPendingRef` 只有 ChatComposer 的 onSend 会点,绕不过去。
   *
   * `contentAfterSend` 是这一轮渲染出来之后的**真内容高**(不含预留空白);
   * `userMsgTop` 是这条用户消息在内容里的起始位置 —— jsdom 没有排版,只能喂进去,
   * 否则 anchor 的全部算术都塌成 `scrollTop` 本身。
   */
  async function sendAnchoredTurn(opts: { contentAfterSend: number; userMsgTop: number }) {
    const view = render(chatPaneEl(priorTurns));
    await flushFrames();

    await flushMounts();
    typeInComposer('make the hero punchier');
    pressEnter();

    geom.contentHeight = opts.contentAfterSend;
    await act(async () => {
      view.rerender(chatPaneEl(sentTurn, { streaming: true }));
    });
    stubUserMessageTop(view.container, opts.userMsgTop);
    await flushFrames();
    return view;
  }

  it('刚发出的一轮里,底下只有预留空白时不该给入口', async () => {
    /*
     * 用户截图里的那一屏:**一条用户消息 + 一个「进行中」头**,面板下面大半是空的,
     * 浮标却贴在输入框上方。
     *
     * 那片「空」不是内容,是 anchor-to-top 给回复预留的尾部占位块;占位块的尺寸
     * 恰好让这条用户消息顶到视口顶端,也就是说视图**正正好停在底部**,底下一个像素的
     * 真内容都没有。老写法在 anchor 接管的那一行无条件 `setScrolledFromBottom(true)`,
     * 之后再没人回来问一句「底下到底有没有东西」。
     */
    geom = { contentHeight: 1200, clientHeight: 400, scrollTop: 0 };
    // 新的一轮渲染出来:用户消息 + 「进行中」头,内容从 1200 长到 1460。
    const { rerender } = await sendAnchoredTurn({ contentAfterSend: 1460, userMsgTop: 1200 });

    // 先确认 anchor-to-top 真的接管了 —— 否则下面那条断言就是空的:
    // 预留空白被撑起来了(400 - 260 - 12),视图停在这条用户消息顶到头的位置。
    expect(tailSpacerHeight()).toBe(128);
    expect(geom.scrollTop).toBe(1188);
    expect(maxScrollTop()).toBe(1188);

    expect(jumpBtnShown()).toBe(false);

    // 一帧里长出一大块(400px 的工具卡),占位块要到下一帧才缩。
    geom.contentHeight = 1660;
    await act(async () => {
      rerender(
        chatPaneEl(
          [
            ...priorTurns,
            { id: 'u1', role: 'user', content: 'make the hero punchier', createdAt: 3 },
            {
              id: 'a1',
              role: 'assistant',
              content: 'looking at the hero section now',
              createdAt: 4,
              runStatus: 'running',
              events: [
                { kind: 'tool_use', id: 'call-1', name: 'Read', input: { file_path: '/tmp/a.txt' } },
              ],
            },
          ],
          { streaming: true },
        ),
      );
    });
    await triggerResize();
    await flushFrames();

    // 占位块缩完之后,底下那点真内容(72px)离「很上面」差得远,不该给入口。
    expect(geom.contentHeight - geom.scrollTop - geom.clientHeight).toBe(72);
    expect(jumpBtnShown()).toBe(false);

    // 反面:回复真长过一屏之后,最新的输出确实跑到视口下面去了 —— 这时必须给入口。
    geom.contentHeight = 2100;
    await act(async () => {
      rerender(
        chatPaneEl(
          [
            ...priorTurns,
            { id: 'u1', role: 'user', content: 'make the hero punchier', createdAt: 3 },
            {
              id: 'a1',
              role: 'assistant',
              content: 'a much longer reply that runs well past one screen',
              createdAt: 4,
              runStatus: 'running',
              events: [
                { kind: 'tool_use', id: 'call-1', name: 'Read', input: { file_path: '/tmp/a.txt' } },
                { kind: 'tool_use', id: 'call-2', name: 'Write', input: { file_path: '/tmp/b.txt' } },
              ],
            },
          ],
          { streaming: true },
        ),
      );
    });
    await triggerResize();
    await flushFrames();

    expect(geom.contentHeight - geom.scrollTop - geom.clientHeight).toBe(512);
    expect(jumpBtnShown()).toBe(true);
  });

  it('预留空白不算「底下还有内容」—— 在 anchor 轮里往上滚不该唤出浮标', async () => {
    /*
     * 这一条钉的是「量几何时把预留空白扣掉」。
     *
     * anchor 轮进行中,用户往上滚去看更早的内容。他离**内容**底部 260px,离
     * **含预留空白**的底部 388px。400px 高的面板里,「很上面」的门槛是 300px
     * (0.75 视口,再夹到 [320, 1200] → 320)—— 260 不到,388 超了。
     * 不扣掉那块空白,浮标就会因为一屏根本不存在的东西冒出来。
     */
    geom = { contentHeight: 1200, clientHeight: 400, scrollTop: 0 };
    await sendAnchoredTurn({ contentAfterSend: 1460, userMsgTop: 1200 });
    expect(tailSpacerHeight()).toBe(128);
    expect(maxScrollTop()).toBe(1188);

    await userScrollTo(800);

    expect(scrollHeightOf() - geom.scrollTop - geom.clientHeight).toBe(388);
    expect(geom.contentHeight - geom.scrollTop - geom.clientHeight).toBe(260);
    expect(jumpBtnShown()).toBe(false);

    // 反面:再往上滚到真内容也确实剩一大截时,入口必须出现。
    await userScrollTo(700);
    expect(geom.contentHeight - geom.scrollTop - geom.clientHeight).toBe(360);
    expect(jumpBtnShown()).toBe(true);
  });

  it('一轮发出时这一帧长了一大截 —— 视图落到 anchor 位置之后浮标要跟着收回去', async () => {
    /*
     * 这一条钉的是「占位块改完尺寸之后要重算一次」。
     *
     * 发送的那一帧,React 的 effect 先跑:那时占位块还是 0、视图还停在旧内容的底部,
     * 于是「底下还有 400px」—— 浮标按几何点亮,**这是对的**。紧接着的那一帧里
     * 占位块定尺寸、视图滚到这条用户消息顶到头的位置,底下只剩 12px —— 浮标就该收回去。
     *
     * 占位块自己是**不被 ResizeObserver 观察的**(观察它会把它自己的尺寸变化喂回给
     * 跟随逻辑),所以这一拍没有观察者会替我们补算:那一帧里必须自己叫一次。
     */
    disableMutationObserver();
    geom = { contentHeight: 1200, clientHeight: 400, scrollTop: 0 };
    // 这一轮的用户消息 + 「进行中」头一次性撑出 400px。
    await sendAnchoredTurn({ contentAfterSend: 1600, userMsgTop: 1200 });

    expect(tailSpacerHeight()).toBe(0);
    expect(geom.scrollTop).toBe(1188);
    expect(geom.contentHeight - geom.scrollTop - geom.clientHeight).toBe(12);
    expect(jumpBtnShown()).toBe(false);
  });
});

describe('尾部预留空白不能把「用户滑走了」这件事吃掉(用户 2026-08-27)', () => {
  /*
   * 「运行期间,稍微向上滑动一点就突然自动滑成这样了」
   *
   * ── 真机量到的那一屏(用户的 runtime,`.chat-log`)────────────────────
   *   scrollTop      1357
   *   scrollHeight   1950      ← 真实滚动条看到的总高
   *   clientHeight    440
   *   尾部占位块      250      ← anchor-to-top 预留的空白
   *
   * 用户离**真实**底部 1950 − 1357 − 440 = 153px。可判「用户是不是自己滑走了」
   * 用的是**扣掉预留空白之后**的高度:(1950 − 250) − 1357 − 440 = −97,夹到 0 —— 于是
   * 程序认定他「就贴在底上」,跟随不松手,下一次写 `scrollTop` 就把他拽回去。
   *
   * 换句话说:**只要他往上滑的距离不超过那块空白(250px),程序就完全看不见他的手。**
   *
   * ── 为什么不能把那个扣除删掉 ──────────────────────────────────────
   * 扣除本身是对的,它修的是另一个 bug(见上面「预留空白不算『底下还有内容』」那条):
   * 浮标不该被一屏预留的空点亮。错的是**同一个被扣过的数字被喂给了两个不同的问题**:
   *
   *   · 「要不要亮浮标」        —— 该扣,空白不是内容。
   *   · 「用户是不是自己滑走了」 —— 不该扣,他对着**真实的滚动条**在滑。
   */

  /** 复刻真机那一屏的几何:真内容 1700 + 预留空白 250 = 1950,视口 440。 */
  const anchoredTurn: ChatMessage[] = [
    { id: 'u0', role: 'user', content: 'first request', createdAt: 1 },
    { id: 'a0', role: 'assistant', content: 'first reply', createdAt: 2 },
    { id: 'u1', role: 'user', content: 'ship the deck', createdAt: 3 },
    { id: 'a1', role: 'assistant', content: 'Step 1 of 5', createdAt: 4, runStatus: 'running' },
  ];

  function streamedTurn(text: string): ChatMessage[] {
    return [
      ...anchoredTurn.slice(0, 3),
      { id: 'a1', role: 'assistant', content: text, createdAt: 4, runStatus: 'running' },
    ];
  }

  /**
   * 把面板开到真机那一屏:anchor-to-top 接管、预留空白正好 250px、
   * 视图停在这条用户消息顶到视口顶端的位置(也就是**真实滚动条的底部**)。
   *
   * 占位块的高度不是硬编码进来的,是 `sizeAnchorSpacer` 自己算的:
   * 440(视口) − 178(消息下面的真内容) − 12(顶部留白) = 250。
   */
  async function openAnchoredScreen() {
    geom = { contentHeight: 1440, clientHeight: 440, scrollTop: 0 };
    const view = render(chatPaneEl(anchoredTurn.slice(0, 2)));
    await flushFrames();

    await flushMounts();
    typeInComposer('ship the deck');
    pressEnter();

    geom.contentHeight = 1700;
    await act(async () => {
      view.rerender(chatPaneEl(anchoredTurn, { streaming: true }));
    });
    stubUserMessageTop(view.container, 1522);
    await flushFrames();

    // 真机那一屏的四个数,一个不差。
    expect(tailSpacerHeight()).toBe(250);
    expect(scrollHeightOf()).toBe(1950);
    expect(geom.clientHeight).toBe(440);
    expect(geom.scrollTop).toBe(1510);
    expect(maxScrollTop()).toBe(1510);
    return view;
  }

  /** 用户自己滚回底部 —— 跟随重新挂上。这是「他确实在跟着看」的前提。 */
  async function rearmFollowByScrollingBack() {
    await userScrollTo(1000);
    await userScrollTo(1510);
  }

  it('往上滑 153px(不到预留空白的 250px)必须停在原地,不许被拽回底部', async () => {
    await openAnchoredScreen();
    await rearmFollowByScrollingBack();
    expect(geom.scrollTop).toBe(1510);

    // 用户往上滑一点点 —— 真机那一屏就是这个位置。
    await userScrollTo(1357);

    // 离**真实**底部 153px,离扣掉空白之后的「内容底部」0px。
    expect(scrollHeightOf() - geom.scrollTop - geom.clientHeight).toBe(153);
    expect(geom.contentHeight - geom.scrollTop - geom.clientHeight).toBe(-97);

    // 松开手的这一刻就不该被拽走 —— 跟随此时就该松手,不用等下一块内容到。
    expect(geom.scrollTop).toBe(1357);
  });

  it('往上滑 153px 之后,后续每一块流式内容都不许把视图拽回底部', async () => {
    const { rerender } = await openAnchoredScreen();
    await rearmFollowByScrollingBack();
    await userScrollTo(1357);

    let text = 'Step 1 of 5';
    for (let step = 0; step < 3; step += 1) {
      text += ' more';
      geom.contentHeight += 120;
      await act(async () => {
        rerender(chatPaneEl(streamedTurn(text), { streaming: true }));
      });
      await triggerResize();
      await flushFrames();
    }

    expect(geom.scrollTop).toBe(1357);
  });

  it('滑走之后,内容回流带来的 1px 向下修正不许被当成「他又回来了」', async () => {
    /*
     * 第二条病根,同一个根因。旧 `nextFollowIntent` 会把任何向下的
     * `scrollTop` 修正当成用户回来,包括上方内容回流时浏览器原生 scroll anchoring
     * 往下修的一个像素。现在的判据要求布局几何稳定,而且必须是同一次用户下滚真正到底。
     *
     * 用滚轮松手(而不是靠 scroll 事件),是为了让这一条**只**验「重新跟上」那一半:
     * 滚轮那条路不看几何,两边代码都会松手,所以红/绿的差别只可能来自下面这一跳。
     */
    await openAnchoredScreen();
    await rearmFollowByScrollingBack();

    await act(async () => {
      fireEvent.wheel(chatLog(), { deltaY: -40 });
      await Promise.resolve();
    });
    await userScrollTo(1357);
    expect(geom.scrollTop).toBe(1357);

    // 上方一张工具卡回流,浏览器把 `scrollTop` 往下修了 1px。
    await userScrollTo(1358);

    expect(geom.scrollTop).toBe(1358);
  });

  it('反面:预留空白在,但用户确实贴在真实底部时,仍然要跟随', async () => {
    /*
     * 这条挡的是「永远不跟随」那种假修法 —— 那样上面两条也会绿。
     * 用户停在真实滚动条的最底下,流式内容必须**每一步**都跟到新的底。
     *
     * ⚠️ 这里原来还钉着「预留空白 250px 原封不动」。W105 之后它不再成立,而且
     * 那句话本来也不是这条用例要保的东西:它是一句前提陈述,保的是「空白在场时
     * 跟随照样成立」。空白此刻正戳在用户眼前(他就贴在底上),W105 会把它收掉 ——
     * 见 `runtime/chat/anchor-to-top.ts` 的 `shouldStartCollapsingTailSpacer`
     * 和 `tests/components/chat-anchor-to-top.test.tsx` 的 W105 组。
     * 这条用例改成在**每一步**都验跟随,判别力比原来更强,而不是被放宽。
     */
    const { rerender } = await openAnchoredScreen();
    await rearmFollowByScrollingBack();
    expect(geom.scrollTop).toBe(1510);

    let text = 'Step 1 of 5';
    for (let step = 0; step < 3; step += 1) {
      text += ' more';
      geom.contentHeight += 120;
      await act(async () => {
        rerender(chatPaneEl(streamedTurn(text), { streaming: true }));
      });
      await triggerResize();
      await flushFrames();
      expect(geom.scrollTop).toBe(maxScrollTop());
    }

    // 真内容 1700 + 3 × 120 = 2060;空白收干净之后底部就是 2060 − 440。
    expect(geom.contentHeight).toBe(2_060);
    expect(tailSpacerHeight()).toBe(0);
    expect(geom.scrollTop).toBe(maxScrollTop());
    expect(geom.scrollTop).toBe(1_620);
  });

  it('反面:预留空白撑着时,浮标仍然不许被那一屏空白点亮', async () => {
    /*
     * 这条挡的是「把扣除整个删掉」那种假修法 —— 那样上面三条也会绿。
     *
     * 440px 的面板里,「很上面」的门槛是 clamp(440 × 0.75, 320, 1200) = 330px。
     * 挑 scrollTop = 1100 正好把两个答案劈开:
     *   离**真实**底部  1950 − 1100 − 440 = 410  > 330 → 不扣空白就会点亮浮标
     *   离**内容**底部  1700 − 1100 − 440 = 160  < 330 → 屏幕上就是最新的,不该点亮
     */
    await openAnchoredScreen();
    await rearmFollowByScrollingBack();

    await userScrollTo(1357);
    expect(geom.contentHeight - geom.scrollTop - geom.clientHeight).toBeLessThanOrEqual(0);
    expect(jumpBtnShown()).toBe(false);

    await userScrollTo(1100);
    expect(scrollHeightOf() - geom.scrollTop - geom.clientHeight).toBe(410);
    expect(geom.contentHeight - geom.scrollTop - geom.clientHeight).toBe(160);
    expect(jumpBtnShown()).toBe(false);

    // 再往上滚到**内容**也确实剩一大截时,入口必须出现 —— 否则「永远不亮」也能让这条绿。
    await userScrollTo(900);
    expect(geom.contentHeight - geom.scrollTop - geom.clientHeight).toBe(360);
    expect(jumpBtnShown()).toBe(true);
  });
});
