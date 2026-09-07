// @vitest-environment jsdom

// jsdom has no `scrollTo` on HTMLElement; ChatPane's follow path calls it.
if (typeof HTMLElement.prototype.scrollTo !== 'function') {
  HTMLElement.prototype.scrollTo = function (options?: ScrollToOptions | number) {
    if (typeof options === 'object' && options !== null) {
      if (options.top !== undefined) this.scrollTop = options.top;
      if (options.left !== undefined) this.scrollLeft = options.left;
    }
  };
}

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage } from '../../src/types';

/*
 * H2 的 A/B 开关 —— 「滚动盒用 ResizeObserver 观察自己」这一条能不能在运行时摘掉。
 *
 * 为什么要这个开关:滚动冻结的两个未证伪嫌疑之一,是 `.chat-log` 既是滚动盒、
 * 又是自己 ResizeObserver 的观察对象,而回调里会写尾部占位块的高度 —— 观察自己
 * → 改内容高度 → 再触发观察,是一个自喂环。`origin/main` 上没有这一条(它只观察
 * 子元素),所以这正好对得上「为什么以前不会有问题」。
 *
 * 这个文件**只测开关**,不测「摘掉之后冻结是否消失」—— 那是真机 A/B 要回答的。
 *
 * ── 断言选在哪儿 ─────────────────────────────────────────────────
 * 观察名单本身(`observe()` 收到了谁)是最直接的读数,但它只是「装没装上」。
 * 所以下面还有一条**行为**用例:只改可视高度、不改内容高度,再只发滚动盒自己那份
 * resize 通知。真实浏览器里这种变化(输入框长高、软键盘弹出、窗口变矮)只会 resize
 * 滚动盒,不会 resize 任何子元素 —— 所以「名单里没有滚动盒」就等于「这一类变化
 * 一个回调都收不到」。`is-scrollable` 这个类是它唯一的出口:`syncScrollable` 只在
 * effect 挂载时和 scroll 事件里跑,纯可视高度变化两条都不会发生。
 *
 * ── 夹具的边界 ───────────────────────────────────────────────────
 * 滚动盒身上不止一个观察者(`QuoteBar` 也观察它,虚拟滚动开着时还有第三个),
 * 所以断言一律走 `followObserver()` 点名跟随那条,不取并集。对话同时保持在 80 条
 * 以下,虚拟滚动那条路(`items.length > 80`)不会开。
 */

const SELF_OBSERVE_DISABLED_KEY = 'open-design:disable-chat-log-self-resize-observe';

type Geom = { contentHeight: number; clientHeight: number; scrollTop: number };

interface RecordedObserver {
  callback: ResizeObserverCallback;
  targets: Set<Element>;
  live: boolean;
}

let geom: Geom;
let rafCallbacks: FrameRequestCallback[];
let observers: RecordedObserver[];
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
  window.localStorage.clear();
  geom = { contentHeight: 300, clientHeight: 400, scrollTop: 0 };
  rafCallbacks = [];
  observers = [];

  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    rafCallbacks.push(callback);
    return rafCallbacks.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

  originalResizeObserver = globalThis.ResizeObserver;
  class MockResizeObserver {
    private readonly record: RecordedObserver;

    constructor(callback: ResizeObserverCallback) {
      this.record = { callback, targets: new Set(), live: true };
      observers.push(this.record);
    }

    observe(target: Element) {
      this.record.targets.add(target);
    }

    unobserve(target: Element) {
      this.record.targets.delete(target);
    }

    disconnect() {
      this.record.targets.clear();
      this.record.live = false;
    }
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
  window.localStorage.clear();
  rafCallbacks = [];
  observers = [];
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
    if (original) Object.defineProperty(HTMLElement.prototype, key, original);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
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
 * 只把「这个元素自己被 resize 了」这一份通知发出去。
 *
 * 真实浏览器里,可视高度变化(输入框长高 / 软键盘 / 窗口变矮)只 resize 滚动盒
 * 本身,子元素的盒子一个都没动。所以只有**观察名单里有它**的那些 observer 才会
 * 被叫醒 —— 名单里没有,就是一个回调都没有,这正是开关打开后要模拟的世界。
 */
async function resizeOnly(target: Element) {
  await act(async () => {
    for (const observer of observers) {
      if (!observer.live) continue;
      if (!observer.targets.has(target)) continue;
      observer.callback([], {} as ResizeObserver);
    }
    await Promise.resolve();
  });
}

/**
 * 定位到**跟随那条** ResizeObserver。
 *
 * 滚动盒身上不止一个观察者:`QuoteBar` 也 `observe(chat-log)`,用来在选区变化时
 * 重新摆引用条(`components/chat/QuoteBar.tsx`)。那条跟跟随无关,H2 开关也不碰它
 * —— 所以断言不能取所有观察者的并集,那会把 QuoteBar 的那份算进来。
 *
 * 跟随那条的指纹是「观察了消息子元素」:开关开着的时候它照样观察子元素,
 * 所以这个指纹在两种配置下都认得出它。
 */
function followObserver(log: HTMLElement): RecordedObserver {
  const children = Array.from(log.children);
  const matches = observers.filter(
    (observer) =>
      observer.live && children.some((child) => observer.targets.has(child)),
  );
  if (matches.length !== 1) {
    throw new Error(`expected exactly one follow observer, found ${matches.length}`);
  }
  return matches[0]!;
}

function chatLog(): HTMLElement {
  return screen.getByTestId('chat-log');
}

function shortConversation(): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (let i = 0; i < 3; i += 1) {
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
  return messages;
}

function chatPaneEl(messages: ChatMessage[]) {
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
      conversations={[]}
      activeConversationId="conv-1"
      onSelectConversation={() => {}}
      onDeleteConversation={() => {}}
    />
  );
}

async function mountChat() {
  render(chatPaneEl(shortConversation()));
  await flushFrames();
}

describe('H2 开关:滚动盒自观察(open-design:disable-chat-log-self-resize-observe)', () => {
  it('默认(不设开关):滚动盒把自己也挂进了跟随 ResizeObserver 的观察名单', async () => {
    await mountChat();
    expect(followObserver(chatLog()).targets.has(chatLog())).toBe(true);
  });

  it('默认:只改可视高度、不改内容高度,照样能被通知到', async () => {
    await mountChat();
    // 内容 300 < 可视 400 —— 滚不动。
    expect(chatLog().classList.contains('is-scrollable')).toBe(false);

    // 输入框长高把可视高度挤到 200:内容一个像素都没变,只有滚动盒自己变矮了。
    geom.clientHeight = 200;
    await resizeOnly(chatLog());
    await flushFrames();

    expect(chatLog().classList.contains('is-scrollable')).toBe(true);
  });

  it('开关打开:跟随那条不再观察滚动盒自己', async () => {
    window.localStorage.setItem(SELF_OBSERVE_DISABLED_KEY, '1');
    await mountChat();
    expect(followObserver(chatLog()).targets.has(chatLog())).toBe(false);
  });

  it('开关打开:子元素的观察一个都不少', async () => {
    window.localStorage.setItem(SELF_OBSERVE_DISABLED_KEY, '1');
    await mountChat();

    const targets = followObserver(chatLog()).targets;
    // 尾部占位块是被**故意**排除在外的(它的高度由锚点逻辑自己写,观察它会自喂),
    // 这条排除跟本开关无关,不能被顺手改掉。
    const children = Array.from(chatLog().children).filter(
      (child) => !child.classList.contains('chat-log-tail-spacer'),
    );
    expect(children.length).toBeGreaterThan(0);
    for (const child of children) expect(targets.has(child)).toBe(true);
    const spacer = chatLog().querySelector('.chat-log-tail-spacer');
    if (spacer) expect(targets.has(spacer)).toBe(false);
  });

  it('开关打开的代价:纯可视高度变化不再有人通知,读数停在旧值', async () => {
    window.localStorage.setItem(SELF_OBSERVE_DISABLED_KEY, '1');
    await mountChat();
    expect(chatLog().classList.contains('is-scrollable')).toBe(false);

    geom.clientHeight = 200;
    await resizeOnly(chatLog());
    await flushFrames();

    // 内容确实溢出了(300 > 200),但没有任何 observer 在看这个盒子,
    // 于是没人来重算 —— 这就是开关打开后要付的账。
    expect(chatLog().classList.contains('is-scrollable')).toBe(false);
  });

  it('开关值不是 "1" 时按「关」处理(默认行为不变)', async () => {
    window.localStorage.setItem(SELF_OBSERVE_DISABLED_KEY, 'true');
    await mountChat();
    expect(followObserver(chatLog()).targets.has(chatLog())).toBe(true);
  });
});
