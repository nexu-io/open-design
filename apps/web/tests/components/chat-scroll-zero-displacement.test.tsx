// @vitest-environment jsdom

/*
 * 位移为 0 的手势不算「用户滑走了」(用户 2026-09-07)
 * ==========================================================================
 *
 * 产品原话:
 *
 *   「我在 chat 里,刚进入会话后,滚动条向上滚动了几次(此时滚不动,因为界面
 *     没什么内容),然后后续的流式输出,就不会自动吸底了。」
 *
 * 三步:
 *   1. 进一个会话,内容比视口还短 —— 没有任何可滚动余量;
 *   2. 往上滚几格,**一个像素都没有移动**,因为压根没得滚;
 *   3. agent 开始流式输出,内容长过视口 —— 不再自动吸底,新内容跑到屏幕外。
 *
 * 判据必须基于**实际发生的位移 / 实际所处位置**,而不是手势本身:在
 * `scrollHeight - clientHeight <= AT_BOTTOM_TOLERANCE_PX` 的那一刻,「离开底部」
 * 这件事在物理上不可能发生 —— 那一刻用户永远就在底部。
 *
 * ⚠️ 这一组里**每一条**都必须配着本文件最后那个 describe 一起读:
 * 「内容够长时用户真的往上滚了一段,跟随必须停止」是产品的既有行为,
 * 一个「wheel 永远不松手」的假修法能让上面所有用例变绿,只会被那一组照出来。
 */

// jsdom 的 HTMLElement 上没有 scrollTo。
if (typeof HTMLElement.prototype.scrollTo !== 'function') {
  HTMLElement.prototype.scrollTo = function (options?: ScrollToOptions | number, _y?: number) {
    if (typeof options === 'object' && options !== null) {
      if (options.top !== undefined) this.scrollTop = options.top;
      if (options.left !== undefined) this.scrollLeft = options.left;
    }
  };
}

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage } from '../../src/types';

/*
 * jsdom 不做布局:`scrollTop` / `scrollHeight` / `clientHeight` 恒为 0,所以几何只能
 * 靠夹具喂。和 `chat-scroll-following.test.tsx` 同一套形状(**自洽**的那一套):
 *
 *  · `scrollHeight` = 真实内容高 + 尾部占位块当前的内联高度(占位块的高度是被测
 *    组件自己写的),否则「底下还有多少」在测试里永远量不准;
 *  · `scrollTop` 的写入按浏览器语义夹到 `[0, scrollHeight - clientHeight]`,
 *    不夹的话 `el.scrollTop = el.scrollHeight` 会留下真实浏览器造不出的数。
 *
 * 【为什么必须是这三个字段】被测的那条路读的就是它们:`ChatPane` 的 `onWheel`
 * 拿 `target.scrollHeight` / `target.clientHeight` 判「有没有得滚」,
 * `readViewportSample` 拿 `el.scrollTop` / `el.scrollHeight` / `el.clientHeight`
 * 喂 `nextFollowIntent`,`syncFollowState` 的贴底写入也落在同一个 `scrollTop` 上。
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

function isChatLog(el: HTMLElement): boolean {
  return typeof el?.classList?.contains === 'function' && el.classList.contains('chat-log');
}

function isTailSpacer(el: HTMLElement): boolean {
  return (
    typeof el?.classList?.contains === 'function' && el.classList.contains('chat-log-tail-spacer')
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
  geom = { contentHeight: 200, clientHeight: 400, scrollTop: 0 };
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
  for (const key of ['scrollTop', 'scrollHeight', 'clientHeight', 'offsetHeight'] as const) {
    const original = savedDescriptors[key];
    if (original) {
      Object.defineProperty(HTMLElement.prototype, key, original);
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
    }
  }
});

/** 布局跑完之后浏览器会把偏移夹回新的可滚动范围;jsdom 不做,夹具替它补。 */
function settleScrollAfterLayout() {
  const max = maxScrollTop();
  if (geom.scrollTop > max) geom.scrollTop = max;
}

async function flushFrames() {
  await act(async () => {
    for (let round = 0; round < 5; round += 1) {
      const callbacks = rafCallbacks.splice(0);
      if (callbacks.length === 0) break;
      callbacks.forEach((callback) => callback(performance.now()));
      settleScrollAfterLayout();
      await Promise.resolve();
    }
  });
}

async function triggerResize() {
  await act(async () => {
    [...resizeCallbacks].forEach((callback) => callback([], {} as ResizeObserver));
    settleScrollAfterLayout();
    await Promise.resolve();
  });
}

function chatLog(): HTMLElement {
  return screen.getByTestId('chat-log');
}

/** 用户真的滚了一下:位置变了,然后浏览器发 scroll。 */
async function userScrollTo(top: number) {
  await act(async () => {
    geom.scrollTop = Math.min(Math.max(0, top), maxScrollTop());
    fireEvent.scroll(chatLog());
    await Promise.resolve();
  });
}

function conversation(chunkText: string): ChatMessage[] {
  return [
    { id: 'u0', role: 'user', content: 'hello', createdAt: 1_700_000_000_000 },
    {
      id: 'streaming',
      role: 'assistant',
      content: chunkText,
      createdAt: 1_700_000_000_001,
      runStatus: 'running',
    },
  ];
}

function chatPaneEl(messages: ChatMessage[]) {
  return (
    <ChatPane
      messages={messages}
      streaming
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

/** 模型又吐了一块:内容长高 → rerender → ResizeObserver → 帧。 */
async function streamChunks(
  rerender: (ui: ReactElement) => void,
  chunks: number,
  pxPerChunk = 300,
) {
  let text = 'chunk';
  for (let step = 0; step < chunks; step += 1) {
    text += ' more';
    geom.contentHeight += pxPerChunk;
    await act(async () => {
      rerender(chatPaneEl(conversation(text)));
    });
    await triggerResize();
    await flushFrames();
  }
}

/** 往上拨 n 格滚轮 —— 位置动不动由几何说了算,这里只发手势。 */
async function wheelUp(times: number) {
  await act(async () => {
    for (let i = 0; i < times; i += 1) fireEvent.wheel(chatLog(), { deltaY: -40 });
    await Promise.resolve();
  });
}

/** 手指往下拖 80px = 想看更早的内容。 */
async function dragFingerDown() {
  await act(async () => {
    fireEvent.touchStart(chatLog(), { touches: [{ clientY: 200 }] });
    fireEvent.touchMove(chatLog(), { touches: [{ clientY: 280 }] });
    await Promise.resolve();
  });
}

describe('位移为 0 的手势不许松开跟随(用户 2026-09-07)', () => {
  it('内容比视口还短时上滚几格,之后的流式输出仍要吸底', async () => {
    // 步骤 1:刚进入会话,内容比视口短 —— 一点可滚动余量都没有。
    geom = { contentHeight: 200, clientHeight: 400, scrollTop: 0 };
    const { rerender } = render(chatPaneEl(conversation('chunk')));
    await flushFrames();
    expect(maxScrollTop()).toBe(0);

    // 步骤 2:往上滚三格,一个像素都没动。
    await wheelUp(3);
    expect(geom.scrollTop).toBe(0);

    // 步骤 3:内容长过视口。
    await streamChunks(rerender, 4);
    expect(maxScrollTop()).toBeGreaterThan(0);
    expect(geom.scrollTop).toBe(maxScrollTop());
  });

  it('可滚动余量小于贴底容差时上滚,之后的流式输出仍要吸底', async () => {
    /*
     * 【这组数字来自真机,不是构造的】打包版 `0.21.2-beta.1` 只读采样,
     * 「刚进会话、内容很少」这个状态出现 108 次,几何恒定 589 / 583 —— 余量 6px。
     * 产品报的那次就是这一档,不是余量 0 那一档(那一档旧判据本来就挡住了)。
     *
     * 6px 小到用户在屏幕上完全看不出来,他的原话是「滚不动」;而严格判据
     * (余量 > 0)会把这一格当成「用户滑走了」。
     */
    geom = { contentHeight: 589, clientHeight: 583, scrollTop: 0 };
    const { rerender } = render(chatPaneEl(conversation('chunk')));
    await flushFrames();
    expect(maxScrollTop()).toBe(6);

    await wheelUp(3);

    await streamChunks(rerender, 4);
    expect(geom.scrollTop).toBe(maxScrollTop());
  });

  it('触屏同理:内容比视口短时下拉,之后的流式输出仍要吸底', async () => {
    geom = { contentHeight: 200, clientHeight: 400, scrollTop: 0 };
    const { rerender } = render(chatPaneEl(conversation('chunk')));
    await flushFrames();

    await dragFingerDown();

    await streamChunks(rerender, 4);
    expect(geom.scrollTop).toBe(maxScrollTop());
  });

  it('触屏同理:余量小于容差时下拉,之后的流式输出仍要吸底', async () => {
    // 同一组真机几何(589 / 583,余量 6px)。
    geom = { contentHeight: 589, clientHeight: 583, scrollTop: 0 };
    const { rerender } = render(chatPaneEl(conversation('chunk')));
    await flushFrames();
    expect(maxScrollTop()).toBe(6);

    await dragFingerDown();

    await streamChunks(rerender, 4);
    expect(geom.scrollTop).toBe(maxScrollTop());
  });
});

describe('反面:用户真的滑走了,跟随必须停止', () => {
  /*
   * 这一组挡的是「wheel / touch 永远不松手」那种假修法 —— 那样上面四条也会绿。
   * 「一旦用户手动滚动了别的位置,就应该固定这个位置」是产品既有行为
   * (用户 2026-08-27),修零位移那一类不许把它牺牲掉。
   */
  it('内容够长、位置也真的动了 —— 一格上滚就停手', async () => {
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    const { rerender } = render(chatPaneEl(conversation('chunk')));
    await flushFrames();
    expect(geom.scrollTop).toBe(4600);

    // 真滚了 40px:位置从 4600 到 4560,离底 40 > 8px 容差。
    await userScrollTo(4560);

    await streamChunks(rerender, 4);
    expect(maxScrollTop()).toBe(5800);
    expect(geom.scrollTop).toBe(4560);
  });

  it('内容够长时,浏览器吃掉那一格滚动的滚轮手势照样要停手', async () => {
    /*
     * 快速流式下,同一帧里我们写过 `scrollTop`,浏览器会把这一次滚轮滚动整个
     * 取消掉 —— 位置纹丝不动,连 scroll 事件都不发。这一格必须仍然算挣脱:
     * 「有没有可能挣脱」是几何问题,这块几何里 4600px 的余量摆在那儿,
     * 和「内容比视口短」不是一回事。
     */
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    const { rerender } = render(chatPaneEl(conversation('chunk')));
    await flushFrames();
    expect(geom.scrollTop).toBe(4600);

    await wheelUp(1);
    expect(geom.scrollTop).toBe(4600);

    await streamChunks(rerender, 4);
    expect(maxScrollTop()).toBe(5800);
    expect(geom.scrollTop).toBe(4600);
  });

  it('内容够长时,手指下拉照样要停手', async () => {
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    const { rerender } = render(chatPaneEl(conversation('chunk')));
    await flushFrames();
    expect(geom.scrollTop).toBe(4600);

    await dragFingerDown();

    await streamChunks(rerender, 4);
    expect(geom.scrollTop).toBe(4600);
  });

  it('停手之后自己滚回底部,跟随要重新接上 —— 零位移那条修法不许把恢复挡掉', async () => {
    geom = { contentHeight: 5000, clientHeight: 400, scrollTop: 0 };
    const { rerender } = render(chatPaneEl(conversation('chunk')));
    await flushFrames();

    await userScrollTo(3000);
    await streamChunks(rerender, 1);
    expect(geom.scrollTop).toBe(3000);

    await userScrollTo(maxScrollTop());
    await streamChunks(rerender, 3);
    expect(geom.scrollTop).toBe(maxScrollTop());
  });
});
