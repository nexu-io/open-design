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

import { ChatPane } from '../../../src/components/ChatPane';
import type { ChatMessage } from '../../../src/types';

/*
 * `.chat-log` 身上两个状态类的**语义**判据。
 *
 * ── 「是不是滚动容器」 vs 「此刻有没有溢出」 ──────────────────────────
 * `.chat-log` 从出生那一刻起就是 `overflow-y: auto` 的滚动容器 —— 这件事**不随内容变**。
 * 而老写法里这个类表达的是「此刻内容有没有超出视口」:内容装得下就摘掉、长长了再挂回来。
 * 名字和语义对不上,而且这个「读数」要靠一条 state 驱动,每翻一次就是一次 ChatPane 重渲。
 * 产品裁决(2026-09-07):按名字办 —— 常驻,不再随内容翻转。
 *
 * ── 「正在滚」这一档整条不要 ─────────────────────────────────────────
 * 老写法在每次 scroll 事件里挂一个「正在滚」的类,并排一个 650ms 的空闲定时器把它摘掉。
 * 代价是**每一次滚动手势起手一次、停手 650ms 之后再一次**,各触发一次 ChatPane 重渲
 * 和一次 `.chat-log` 的属性改动 —— 而全仓 CSS 里没有任何规则选中它。零渲染收益。
 *
 * 所以这份文件的判据是:滚一下,`.chat-log` 的 `class` 属性**一个字节都不变**。
 * 它同时钉住上面两条(「正在滚」没了、「有没有溢出」不再翻转),
 * 而且是**可执行的性能判据**,不是「代码里搜不到那个词」这种读代码判死。
 */

type Geom = { contentHeight: number; clientHeight: number; scrollTop: number };

let geom: Geom;
let savedDescriptors: Record<
  'scrollTop' | 'scrollHeight' | 'clientHeight',
  PropertyDescriptor | undefined
>;

function isChatLog(el: HTMLElement): boolean {
  return typeof el?.classList?.contains === 'function' && el.classList.contains('chat-log');
}

function maxScrollTop(): number {
  return Math.max(0, geom.contentHeight - geom.clientHeight);
}

beforeEach(() => {
  geom = { contentHeight: 900, clientHeight: 400, scrollTop: 0 };
  vi.useFakeTimers({ shouldAdvanceTime: true });

  savedDescriptors = {
    scrollTop: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop'),
    scrollHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight'),
    clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
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
      return isChatLog(this) ? geom.contentHeight : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isChatLog(this) ? geom.clientHeight : 0;
    },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const key of ['scrollTop', 'scrollHeight', 'clientHeight'] as const) {
    const original = savedDescriptors[key];
    if (original) Object.defineProperty(HTMLElement.prototype, key, original);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
  }
});

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

function chatPaneEl(opts: { loading?: boolean } = {}) {
  return (
    <ChatPane
      messages={shortConversation()}
      streaming={false}
      error={null}
      loading={opts.loading ?? false}
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

async function mountChat(opts: { loading?: boolean } = {}) {
  render(chatPaneEl(opts));
  await act(async () => {
    await Promise.resolve();
  });
}

function chatLog(): HTMLElement {
  return screen.getByTestId('chat-log');
}

/** 一次真实的滚动手势:改位置 → 发 scroll 事件。 */
async function scrollGesture(top: number) {
  const el = chatLog();
  el.scrollTop = top;
  await act(async () => {
    el.dispatchEvent(new Event('scroll'));
    await Promise.resolve();
  });
}

/** 记下一段时间里 `class` 属性被改成过的每一个值。 */
function watchClass(el: HTMLElement): { seen: () => string[]; stop: () => void } {
  const seen: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.attributeName === 'class') seen.push(el.className);
    }
  });
  observer.observe(el, { attributes: true, attributeFilter: ['class'] });
  return {
    seen: () => {
      observer.takeRecords().forEach(() => seen.push(el.className));
      return seen;
    },
    stop: () => observer.disconnect(),
  };
}

describe('.chat-log · 「是不是滚动容器」常驻,不随内容翻转', () => {
  it('内容装得下的时候也带着 —— 它说的是容器的类型,不是此刻的溢出状态', async () => {
    geom = { contentHeight: 300, clientHeight: 400, scrollTop: 0 };
    await mountChat();
    expect(chatLog().classList.contains('is-scrollable')).toBe(true);
  });

  it('内容溢出的时候当然也带着', async () => {
    geom = { contentHeight: 900, clientHeight: 400, scrollTop: 0 };
    await mountChat();
    expect(chatLog().classList.contains('is-scrollable')).toBe(true);
  });

  it('校准:同一个 className 数组里的条件类照样跟着条件走(上面两条不是常真)', async () => {
    await mountChat({ loading: true });
    expect(chatLog().classList.contains('is-loading')).toBe(true);
    cleanup();
    await mountChat({ loading: false });
    expect(chatLog().classList.contains('is-loading')).toBe(false);
  });
});

describe('.chat-log · 滚动手势不改这个盒子的任何类', () => {
  it('滚一下,class 属性一个字节都不变', async () => {
    await mountChat();
    const el = chatLog();
    const before = el.className;
    const watch = watchClass(el);

    await scrollGesture(120);

    expect(watch.seen(), `滚动改了 .chat-log 的 class:${watch.seen().join(' | ')}`).toEqual([]);
    expect(el.className).toBe(before);
    watch.stop();
  });

  it('停手之后把所有定时器跑完,也还是不变 —— 没有任何空闲定时器在等着改它', async () => {
    await mountChat();
    const el = chatLog();
    const before = el.className;
    await scrollGesture(120);

    const watch = watchClass(el);
    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });

    expect(watch.seen(), `空闲之后 class 变了:${watch.seen().join(' | ')}`).toEqual([]);
    expect(el.className).toBe(before);
    watch.stop();
  });

  it('校准:这把「盯 class」的量法真的看得见改动', async () => {
    await mountChat();
    const el = chatLog();
    const watch = watchClass(el);
    el.classList.add('clsfix-probe');
    await act(async () => {
      await Promise.resolve();
    });
    expect(watch.seen().some((v) => v.includes('clsfix-probe'))).toBe(true);
    el.classList.remove('clsfix-probe');
    watch.stop();
  });
});
