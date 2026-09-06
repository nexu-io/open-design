// @vitest-environment jsdom
/**
 * 思考正文的**贴底跟随**:agent 一边写一边滚,用户一翻阅就让开,回到底部再接上。
 *
 * 用户原话(2026-09-02):
 *   「thinking 要自动跟随的,agent 一边写一边滚,但是用户如果**手动滚动到上面**,
 *     那就说明用户在翻阅,不能自动跟随滚动了;但用户如果**折叠起来再展开**,此时继续
 *     自动滚动;或者**用户手动滚动到最底部**,那说明也要继续自动跟随。」
 *
 * ⚠️ 这里推翻过一次又收回来一半,三个维度必须分开记,别再混:
 *   高度  ✗ 定高(短内容也撑满一屏)      ✓ `max-height`,短内容完全不限高
 *   滚动  ✗ **一步一停的慢速分步滚**       ✓ 自动跟随,但**正常速度**(一次到底)
 *   遮罩  ✗ 上下渐隐(用户:「很难看清」) ✓ 一律没有
 * 被否的是「慢」和「看不清」,不是「跟随」本身。
 *
 * 判据**复用** `runtime/chat/stick-to-bottom.ts` —— ChatPane 已经在用同一套,
 * 且刚修过一轮(8px 贴底容差;`scrollHeight`/`clientHeight` 变化不得伪装成用户动作;
 * ResizeObserver 落定后刷新几何基线)。同一件事不该有第二套判据。
 *
 * jsdom 没有排版引擎,`scrollTop / scrollHeight / clientHeight` 全是 0,所以几何靠夹具喂,
 * 并且**按浏览器语义把 `scrollTop` 夹到 [0, scrollHeight - clientHeight]** ——
 * 不夹的话 `el.scrollTop = el.scrollHeight` 会留下真实浏览器里不存在的数。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import { AT_BOTTOM_TOLERANCE_PX } from '../../../src/runtime/chat/stick-to-bottom';
import type { ExecutionShell as Shell, ShellItem } from '../../../src/runtime/chat/contract';

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

const think = (text: string): ShellItem => ({ kind: 'text', text, thinking: true });
function liveShell(text: string): Shell {
  /*
   * 不带 `as`:这份 fixture 的价值就是「它长得像真的」,强转等于把这份价值关掉。
   * (原来这里既多了一个 `seq`(契约里根本没有这个字段)、又少了 `id`,
   *  两边互不可赋值,才会报「类型不够重叠」。)
   */
  return {
    kind: 'shell', id: 'shell-1', status: 'running', items: [think(text)], segments: [],
    thinking: true, stopped: false, elapsedMs: null, quietMs: null,
  };
}
const show = (shell: Shell): ReactElement => (
  <I18nProvider initial="zh-CN">
    <ExecutionShell shell={shell} deferCollapsedBodies={false} />
  </I18nProvider>
);
const thinkingBox = (root: HTMLElement): HTMLElement => {
  const el = root.querySelector<HTMLElement>('details[class*="thoughts"] > div[class*="body"]');
  if (!el) throw new Error('思考正文那只盒子没渲染出来');
  return el;
};

/** 用户真的用手滚到某个位置:先落位,再派发 scroll —— 顺序和浏览器一致 */
function userScrollTo(el: HTMLElement, top: number): void {
  el.scrollTop = top;
  fireEvent.scroll(el);
}

describe('思考正文贴底跟随的四态', () => {
  it('流式中且处于跟随态:新内容到达后贴底', () => {
    const geom: Geom = { content: 200, client: 96 };
    const { container } = render(show(liveShell('第一段推理。')));
    const box = thinkingBox(container);
    fakeGeometry(box, geom);
    settleLayout();
    expect(box.scrollTop).toBe(maxTopOf(geom));

    // 又写进来一大段
    geom.content = 600;
    settleLayout();
    expect(box.scrollTop).toBe(maxTopOf(geom));
  });

  it('用户手动上滚:逃逸,后续新内容不再改滚动位置', () => {
    const geom: Geom = { content: 600, client: 96 };
    const { container } = render(show(liveShell('第一段推理。')));
    const box = thinkingBox(container);
    fakeGeometry(box, geom);
    settleLayout();
    expect(box.scrollTop).toBe(maxTopOf(geom));

    userScrollTo(box, 120);
    expect(box.scrollTop).toBe(120);

    geom.content = 1200;
    settleLayout();
    // 他在翻阅,位置必须原样不动
    expect(box.scrollTop).toBe(120);
  });

  it('用户手动滚回最底部(8px 容差内):恢复跟随', () => {
    const geom: Geom = { content: 600, client: 96 };
    const { container } = render(show(liveShell('第一段推理。')));
    const box = thinkingBox(container);
    fakeGeometry(box, geom);
    settleLayout();

    userScrollTo(box, 120);
    geom.content = 1200;
    settleLayout();
    expect(box.scrollTop).toBe(120);

    // 差一点点到底也算到底 —— 高 DPI 屏上 scrollTop 会被截掉一个像素
    userScrollTo(box, maxTopOf(geom) - (AT_BOTTOM_TOLERANCE_PX - 1));
    geom.content = 1600;
    settleLayout();
    expect(box.scrollTop).toBe(maxTopOf(geom));
  });

  it('折叠再展开:恢复跟随', () => {
    const geom: Geom = { content: 600, client: 96 };
    const { container } = render(show(liveShell('第一段推理。')));
    const box = thinkingBox(container);
    fakeGeometry(box, geom);
    settleLayout();

    userScrollTo(box, 60);
    geom.content = 1200;
    settleLayout();
    expect(box.scrollTop).toBe(60);

    const fold = box.closest('details');
    expect(fold).not.toBeNull();
    act(() => {
      fold!.open = false;
      fireEvent(fold!, new Event('toggle', { bubbles: false }));
      fold!.open = true;
      fireEvent(fold!, new Event('toggle', { bubbles: false }));
    });
    geom.content = 1600;
    settleLayout();
    expect(box.scrollTop).toBe(maxTopOf(geom));
  });
});

describe('反向守卫:不是用户干的,一律不许改意图', () => {
  it('内容长高本身不算「用户滚动」—— 不许因此逃逸', () => {
    const geom: Geom = { content: 600, client: 96 };
    const { container } = render(show(liveShell('第一段推理。')));
    const box = thinkingBox(container);
    fakeGeometry(box, geom);
    settleLayout();

    // 最坏时序:内容先长高、浏览器先吐一个 scroll 事件,ResizeObserver 后落定
    geom.content = 1200;
    fireEvent.scroll(box);
    settleLayout();
    expect(box.scrollTop).toBe(maxTopOf(geom));

    // 还在跟随:再长一次仍然贴底
    geom.content = 1800;
    settleLayout();
    expect(box.scrollTop).toBe(maxTopOf(geom));
  });

  it('布局收缩把距离压进容差,也不许重新挂回跟随', () => {
    const geom: Geom = { content: 1200, client: 96 };
    const { container } = render(show(liveShell('第一段推理。')));
    const box = thinkingBox(container);
    fakeGeometry(box, geom);
    settleLayout();

    userScrollTo(box, 200);          // 用户翻阅
    geom.content = 260;              // 上面的内容塌了,200 一下子离底只剩 -36 → 夹到底
    fireEvent.scroll(box);
    settleLayout();

    geom.content = 2000;             // 新内容又来了
    settleLayout();
    // 用户没再动过手,不许因为「刚才碰巧贴底」就把他拽回去
    expect(box.scrollTop).not.toBe(maxTopOf(geom));
  });
});

describe('限高与遮罩:被推翻的那两样不许回来', () => {
  const CSS = readFileSync(
    resolve(__dirname, '../../../src/components/chat/primitives/record.module.css'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '');

  function declsOf(selector: string): string {
    for (const block of CSS.split('}')) {
      const [head, body] = block.split('{');
      if (head == null || body == null) continue;
      if (head.split(',').map((s) => s.replace(/\s+/g, ' ').trim()).includes(selector)) return body;
    }
    return '';
  }

  it('限高走 `max-height`,不是定高 —— 短内容完全不出滚动条', () => {
    const cap = declsOf('.fold .body.scroll');
    expect(cap).toMatch(/max-height: 96px/);
    expect(cap).toMatch(/overflow-y: auto/);
    expect(declsOf('.stream')).not.toMatch(/(^|[^-])height:/);
  });

  it('一道渐隐都不许留', () => {
    expect(CSS).not.toMatch(/mask-image/);
    expect(CSS).not.toMatch(/--stream-fade/);
  });

  it('跟随是一次到底,不是一步一停的慢速分步滚', () => {
    /*
     * 被推翻的那套是 rAF 驱动的分步缓动(走一步、停住让人读完、再走一步),
     * 用户原话「滚动太慢了」。现在只允许**一次写到底**。
     */
    const hook = readFileSync(
      resolve(__dirname, '../../../src/components/chat/primitives/useThinkingFollow.ts'),
      'utf8',
    );
    expect(hook).not.toMatch(/requestAnimationFrame/);
    expect(hook).not.toMatch(/STEP_MS|MOVE_RATIO|planStep|ease/);
    // 判据复用 ChatPane 那一套,不另写一份
    expect(hook).toMatch(/stick-to-bottom/);
    expect(hook).toMatch(/nextFollowIntent/);
  });
});
