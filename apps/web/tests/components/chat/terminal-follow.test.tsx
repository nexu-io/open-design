// @vitest-environment jsdom
/**
 * 终端输出的**贴底跟随**:一边跑一边追最新几行,用户一往上翻就让开,滚回底部再接上。
 *
 * 产品原话(2026-09-03):
 *   「这个也要参考 thinking 的那个卡片,感觉应该是一样的,有流式输出,并且**用户滚动了
 *     不能跟用户抢滚动条,用户滚动这个区域到底部再自动跟随**」
 *
 * 稿子那一格的状态标注(基线 `729fa43ce7`,`body-components.html:1010`)也是同一句:
 *   「执行中 · 终端实时追加,**限高滚动自动贴底**」
 *
 * ── 修之前是什么样 ────────────────────────────────────────────────────
 *
 * `Terminal` 写的是 `useEffect(() => { el.scrollTop = el.scrollHeight }, [text])` ——
 * **每来一批输出就无条件跳到底**。用户往上翻一行,250ms 后下一批输出到达(ACP 在途
 * 输出的节流是 250ms + 内容变化门,`apps/daemon/src/agent-protocol/acp/constants.ts`),
 * 当场被硬拽回底部。这正是产品说的「抢滚动条」。
 *
 * 折叠块改成执行中默认展开之后,这个坑从「没人看得见」变成「天天撞上」。
 *
 * ── 判据不另写一份 ────────────────────────────────────────────────────
 *
 * 复用 `runtime/chat/stick-to-bottom.ts` 的 `nextFollowIntent`(ChatPane 与思考正文
 * 已经在用同一套):意图只由用户动作改;往上滚 := 位置变小**且几何没变**;
 * 恢复跟随必须是**同一次主动下滚并真的到底**。
 *
 * ── 防假绿 ───────────────────────────────────────────────────────────
 *
 * jsdom 没有排版引擎,`scrollTop / scrollHeight / clientHeight` 默认全是 **0** ——
 * 不喂几何的话所有判断都是 `0 - 0 = 0`,`expect(a).toBe(b)` 两边都是 0,**真空通过**。
 * 所以下面沿用 `thinking-follow.test.tsx` 的夹具:显式覆盖三个属性,并且
 * **按浏览器语义把 `scrollTop` 的写入夹到 [0, scrollHeight - clientHeight]**。
 *
 * ⚠️ **`running` 现在必须显式传**(2026-09-03)。这个文件测的是「**轮次还在跑**」
 * 那一档,而在此之前它只给了 `pending: true` 就断言摊开 —— `row.pending` 的定义是
 * `result == null`(「从来没回来过」),用户按停止之后它永远为真。也就是说这些用例
 * 原来喂进去的数据**同时**符合「正在跑」和「被停掉之后的残行」两种情形,断言的却只是
 * 前者。自动摊开改成认 `row.pending && running` 之后,「正在跑」这层意思必须自己说出来。
 * 那个洞与不变量本身钉在 `stopped-run-row-collapse.test.tsx`。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render as rtlRender } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { ToolRow } from '../../../src/components/chat/primitives/ToolRow';
import type { ToolRow as ToolRowData } from '../../../src/runtime/chat/contract';

/* ── ResizeObserver 夹具:内容长高由测试自己按帧推进 ───────────────── */
let resizeCallbacks: ResizeObserverCallback[] = [];
let originalResizeObserver: typeof ResizeObserver | undefined;

beforeEach(() => {
  resizeCallbacks = [];
  originalResizeObserver = globalThis.ResizeObserver;
  class FakeResizeObserver {
    constructor(cb: ResizeObserverCallback) { resizeCallbacks.push(cb); }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true, writable: true, value: FakeResizeObserver,
  });
});

afterEach(() => {
  cleanup();
  if (originalResizeObserver) {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true, writable: true, value: originalResizeObserver,
    });
  }
});

/** 内容长高之后浏览器会重排 —— 这里替它通知观察者 */
function settleLayout(): void {
  act(() => {
    for (const cb of resizeCallbacks) cb([], {} as ResizeObserver);
  });
}

interface Geom { content: number; client: number }

/** 给一只元素喂自洽的几何:`scrollTop` 的写入按浏览器语义夹住 */
function fakeGeometry(el: HTMLElement, geom: Geom): void {
  let top = 0;
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => geom.content });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => geom.client });
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (value: number) => { top = Math.max(0, Math.min(value, Math.max(0, geom.content - geom.client))); },
  });
}

const maxTopOf = (geom: Geom): number => Math.max(0, geom.content - geom.client);

/** 用户真的用手滚到某个位置:先落位,再派发 scroll —— 顺序和浏览器一致 */
function userScrollTo(el: HTMLElement, top: number): void {
  el.scrollTop = top;
  fireEvent.scroll(el);
}

function render(ui: ReactElement) {
  const wrap = (node: ReactElement) => <I18nProvider initial="zh-CN">{node}</I18nProvider>;
  const result = rtlRender(wrap(ui));
  return { ...result, rerender: (next: ReactElement) => result.rerender(wrap(next)) };
}

const lines = (n: number, tag = 'out'): string =>
  Array.from({ length: n }, (_, i) => `${tag} 第 ${i + 1} 行`).join('\n');

function running(terminal: string): ToolRowData {
  return {
    kind: 'tool', id: 'c1', tool: 'exec', name: 'Bash',
    title: '装依赖', rawTitle: false,
    file: null, pattern: null, hits: null, delta: null,
    elapsedMs: 4100, pending: true, failed: false, failReason: null,
    command: 'npm install', terminal,
  };
}

/** 输出那一块(不是命令那一块 —— 命令块也叫 `.term`,靠 `cmd` 区分) */
function termBox(root: HTMLElement): HTMLElement {
  const boxes = Array.from(root.querySelectorAll<HTMLElement>('div[class*="term"]'));
  const out = boxes.find((el) => !/\bcmd\b|cmd/.test(el.className));
  if (!out) throw new Error(`终端输出框没渲染出来(找到 ${boxes.length} 个 .term)`);
  return out;
}

describe('终端输出的贴底跟随', () => {
  it('用户没动过:新输出到达后一直贴着底', () => {
    const geom: Geom = { content: 400, client: 104 };
    const { container, rerender } = render(<ToolRow running row={running(lines(20))} />);
    const box = termBox(container);
    fakeGeometry(box, geom);
    settleLayout();
    expect(box.scrollTop, '首帧就该贴底').toBe(maxTopOf(geom));

    // 又追加了一批输出
    rerender(<ToolRow running row={running(lines(40))} />);
    geom.content = 800;
    settleLayout();
    expect(box.scrollTop, '还在跟随,继续贴底').toBe(maxTopOf(geom));
  });

  it('用户往上滚了:后续输出**不许**再把他拽回底部', () => {
    const geom: Geom = { content: 800, client: 104 };
    const { container, rerender } = render(<ToolRow running row={running(lines(40))} />);
    const box = termBox(container);
    fakeGeometry(box, geom);
    settleLayout();
    expect(box.scrollTop).toBe(maxTopOf(geom));

    // 往上翻了一屏
    userScrollTo(box, 200);
    expect(box.scrollTop).toBe(200);

    // 250ms 后下一批输出到达 —— 修之前这里会被硬拽回底部
    rerender(<ToolRow running row={running(lines(80))} />);
    geom.content = 1600;
    settleLayout();
    expect(box.scrollTop, '用户在翻阅,不许抢滚动条').toBe(200);

    // 再来一批,照样不动
    rerender(<ToolRow running row={running(lines(120))} />);
    geom.content = 2400;
    settleLayout();
    expect(box.scrollTop).toBe(200);
  });

  it('用户主动滚回底部:恢复跟随', () => {
    const geom: Geom = { content: 800, client: 104 };
    const { container, rerender } = render(<ToolRow running row={running(lines(40))} />);
    const box = termBox(container);
    fakeGeometry(box, geom);
    settleLayout();

    userScrollTo(box, 100);
    rerender(<ToolRow running row={running(lines(80))} />);
    geom.content = 1600;
    settleLayout();
    expect(box.scrollTop, '逃逸态').toBe(100);

    // 用户自己滚回底部
    userScrollTo(box, maxTopOf(geom));
    expect(box.scrollTop).toBe(maxTopOf(geom));

    rerender(<ToolRow running row={running(lines(120))} />);
    geom.content = 2400;
    settleLayout();
    expect(box.scrollTop, '滚回底部之后该重新跟上').toBe(maxTopOf(geom));
  });

  it('反向对照:内容变高**不算**用户滚动 —— 别把长高误判成挣脱', () => {
    const geom: Geom = { content: 400, client: 104 };
    const { container, rerender } = render(<ToolRow running row={running(lines(20))} />);
    const box = termBox(container);
    fakeGeometry(box, geom);
    settleLayout();

    /*
     * 内容长高时浏览器会把 `scrollTop` 夹一下、原生 scroll anchoring 也会修正它,
     * 这些都会吐出 scroll 事件。判据是「位置变小 **且 scrollHeight 没变**」,
     * 所以下面这一串「几何变了顺带派 scroll」必须一次都不算挣脱。
     */
    for (const next of [800, 1600, 3200]) {
      geom.content = next;
      rerender(<ToolRow running row={running(lines(next / 20))} />);
      fireEvent.scroll(box);   // 内容变化引起的那一次
      settleLayout();
      expect(box.scrollTop, `长到 ${next} 之后仍该贴底`).toBe(maxTopOf(geom));
    }
  });

  it('反向对照:贴着底的一两像素抖动不算挣脱(高 DPI 屏上是常态)', () => {
    const geom: Geom = { content: 800, client: 104 };
    const { container, rerender } = render(<ToolRow running row={running(lines(40))} />);
    const box = termBox(container);
    fakeGeometry(box, geom);
    settleLayout();

    // 底部往回抖 2px(< 8px 容差)
    userScrollTo(box, maxTopOf(geom) - 2);

    rerender(<ToolRow running row={running(lines(80))} />);
    geom.content = 1600;
    settleLayout();
    expect(box.scrollTop, '抖动不该被当成用户在翻阅').toBe(maxTopOf(geom));
  });

  it('终端框里的滚动不外泄 —— 外层聊天面板的跟随状态两层各管各的', () => {
    const geom: Geom = { content: 800, client: 104 };
    const outerScroll = vi.fn();
    const { container } = render(<ToolRow running row={running(lines(40))} />);
    container.addEventListener('scroll', outerScroll);

    const box = termBox(container);
    fakeGeometry(box, geom);
    settleLayout();
    userScrollTo(box, 200);

    expect(outerScroll, 'scroll 事件不冒泡,外层不该收到').not.toHaveBeenCalled();
    expect(box.scrollTop).toBe(200);
    container.removeEventListener('scroll', outerScroll);
  });

  /*
   * ⚠️ 这一条钉的是**终端这一档特有的缺口**,ResizeObserver 一个人接不住:
   *   · `.term` 被 `max-height: 104px` 截住之后**自己不再长高** —— 观察盒子收不到通知;
   *   · 终端是**一行一个 `<div>`**,新输出 = **新增子元素**,而挂载那一刻拿的
   *     `Array.from(box.children)` 是快照,新来的子元素没人观察。
   * 思考正文那一档碰巧躲过了(子元素是同一批、长的是自己的高度),所以这条缺口
   * 一直没暴露。下面**不喂 ResizeObserver**,只让内容真的变 —— 唯一能救场的就是
   * `useThinkingFollow` 里那只 MutationObserver。
   */
  it('内容变了但盒子没变尺寸,照样贴底(限高之后 ResizeObserver 已经哑了)', async () => {
    const geom: Geom = { content: 400, client: 104 };
    const { container, rerender } = render(<ToolRow running row={running(lines(20))} />);
    const box = termBox(container);
    fakeGeometry(box, geom);
    settleLayout();
    expect(box.scrollTop).toBe(maxTopOf(geom));

    // 盒子已经到限高了,后面**一次 ResizeObserver 都不喂**
    resizeCallbacks = [];
    geom.content = 2000;
    rerender(<ToolRow running row={running(lines(100))} />);
    await act(async () => { await Promise.resolve(); });

    expect(box.scrollTop, '新输出到了就该贴底 —— 这一档只有 MutationObserver 能通知').toBe(maxTopOf(geom));
  });

  it('收起再展开 = 重新挂上跟随(和思考那一格同一条裁决)', () => {
    const geom: Geom = { content: 800, client: 104 };
    const { container, rerender } = render(<ToolRow running row={running(lines(40))} deferBody={false} />);
    const box = termBox(container);
    fakeGeometry(box, geom);
    settleLayout();

    userScrollTo(box, 120);
    rerender(<ToolRow running row={running(lines(80))} deferBody={false} />);
    geom.content = 1600;
    settleLayout();
    expect(box.scrollTop, '逃逸态').toBe(120);

    // 用户把它收起来再展开
    const fold = container.querySelector('details');
    if (!fold) throw new Error('折叠块没渲染出来');
    act(() => {
      fold.open = false;
      fireEvent(fold, new Event('toggle', { bubbles: false }));
      fold.open = true;
      fireEvent(fold, new Event('toggle', { bubbles: false }));
    });
    expect(box.scrollTop, '展开是「我要接着看」,重新贴底').toBe(maxTopOf(geom));
  });
});
