// @vitest-environment jsdom
/**
 * 取词浮条「位置还是不对」(用户 2026-09-02 第二次指认,现场是**自己发的**那条黑气泡)。
 *
 * 这一组钉两件事,它们各自都能单独把浮条送到离选区一屏远的地方:
 *
 * 1. **只有真正被高亮的文字才算选区几何。**
 *    `Range.getClientRects()` 返回的不只是被划蓝的那几行 —— CSSOM 规定,凡是被
 *    Range **整个包住**的元素,它的 border box 也在里面。拖选收尾稍微越过气泡一点,
 *    Range 就会连着吞进 `.chat-log-tail-spacer`(高度由 ChatPane 逐帧写,满宽、
 *    一个字都没有)或整块 `.msg.user`。这些盒子 `width>0 && height>0`,老过滤器放行,
 *    于是「选区末行」变成一块贴着日志底部、满宽的空盒子:浮条翻到下方后追着它掉下去,
 *    水平也居中到面板正中 —— 截图里那条离选区几百像素、大致居中的浮条就是这么来的。
 *    零宽光标那一版补丁(`quote-bar-anchor.test.tsx`)挡不住它:空盒子是**有面积**的。
 *
 * 2. **浮条不能长在会重设 `position: fixed` 参照系的那层里。**
 *    `quoteBarPosition` 算出来的是**视口坐标**,浮条也确实写着 `position: fixed`;
 *    但 `.app .split-chat-slot > .pane`(就是 ChatPane 的根,`viewer/routines.css:1495`)
 *    带着 `backdrop-filter: var(--material-regular-backdrop)`(`material.css:31` 解析成
 *    `blur(...) saturate(1.6)`,非 none)。带 filter / backdrop-filter 的祖先会成为
 *    fixed 后代的**包含块**,于是那对视口坐标被当成「相对 .pane 的坐标」用 ——
 *    整条浮条恒定下移一个 `.pane` 顶边的距离;而同一条规则的 `overflow: hidden`
 *    还会把落到 pane 外面的浮条直接裁掉。同一个坑这个仓踩过:输入框正是因此
 *    portal 到 body 的(`routines.css:1496` 的注释:「the composer is a separate
 *    fixed/portaled layer, so it isn't clipped」)。
 *
 * ⚠️ jsdom 没有排版:`getBoundingClientRect()` 默认全 0。所以这里**每一个几何数字
 * 都是显式桩**(面板矩形、文字行矩形、被吞掉的空盒子矩形),红绿都是真的读数。
 */
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QuoteBar } from '../../../src/components/chat/QuoteBar';
import { QUOTE_BAR_GAP_BELOW_PX } from '../../../src/runtime/chat/quote-selection';

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  class ResizeObserverMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  globalThis.ResizeObserver = originalResizeObserver;
});

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

/*
 * 现场那一屏的几何(chat-log 可视区 = 输入框上沿以上的那块):
 * 刚发出去的用户气泡被 tail spacer 顶到日志最上面,气泡下面是一大片空白。
 */
const PANEL = rect(0, 100, 480, 600); // 100..700,下沿就是 composer 上沿
const SELECTED_LINE = rect(150, 130, 260, 22); // 黑气泡里被划蓝的那一行:130..152
const SWALLOWED_BLANK = rect(18, 160, 444, 260); // 被拖选顺手吞掉的空盒子:160..420

const SENTENCE = '这个位置还是不对';

/**
 * 把一次「选中气泡里整句话、收尾越过气泡落进下面空白」的拖选摆到 DOM 上。
 *
 * 排版全靠桩:文本节点自己的切片只量到那一行(浏览器里就是高亮的那一行),
 * 而整段 Range 会连着吐出被吞掉的空盒子 —— 这正是 Chrome 的真实行为。
 */
function selectSentenceOvershootingIntoBlank(scope: HTMLElement): void {
  const paragraph = scope.querySelector('p');
  const blank = scope.querySelector('[data-testid="tail-spacer"]');
  const textNode = paragraph?.firstChild;
  if (!textNode || !blank) throw new Error('missing fixture nodes');

  const range = document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(blank, 0);

  vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function (
    this: Range,
  ): DOMRectList {
    const sameTextNode =
      this.startContainer === this.endContainer && this.startContainer.nodeType === Node.TEXT_NODE;
    const rects = sameTextNode ? [SELECTED_LINE] : [SELECTED_LINE, SWALLOWED_BLANK];
    return rects as unknown as DOMRectList;
  });
  vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(() =>
    rect(18, 130, 444, 290),
  );
  vi.spyOn(scope, 'getBoundingClientRect').mockImplementation(() => PANEL);
  vi.spyOn(window, 'getSelection').mockReturnValue({
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => range,
    toString: () => SENTENCE,
  } as unknown as Selection);

  fireEvent(document, new Event('selectionchange'));
}

/** ChatPane 的根 `.pane`:带 backdrop-filter + overflow:hidden 的那一层 */
function Harness() {
  const scopeRef = useRef<HTMLDivElement>(null);
  return (
    <div data-testid="chat-pane-stand-in">
      <div ref={scopeRef} data-testid="chat-scroll-scope">
        <p data-message-id="user-1">{SENTENCE}</p>
        <div data-testid="tail-spacer" />
      </div>
      <QuoteBar scopeRef={scopeRef} onQuote={vi.fn()} />
    </div>
  );
}

describe('浮条贴的是被划蓝的那一行,不是被顺手吞掉的空盒子', () => {
  it('拖选越界吞进满宽空盒子时,浮条仍贴着高亮那一行', () => {
    render(<Harness />);
    selectSentenceOvershootingIntoBlank(screen.getByTestId('chat-scroll-scope'));

    const bar = screen.getByTestId('chat-quote-bar');
    const top = Number.parseFloat(bar.style.top);
    const left = Number.parseFloat(bar.style.left);

    // 翻到下方(气泡被顶到日志最上面,上方放不下),贴的是高亮行的下沿 + 稿子的 6px
    expect(bar.getAttribute('data-placement')).toBe('below');
    expect(top).toBe(SELECTED_LINE.bottom + QUOTE_BAR_GAP_BELOW_PX);
    // 水平居中于高亮那一行,不是居中于满宽空盒子(那会落到面板正中 240)
    expect(left).toBe(SELECTED_LINE.left + SELECTED_LINE.width / 2);
    // 说人话的那条:浮条离高亮行不许超过一道缝
    expect(top - SELECTED_LINE.bottom).toBeLessThanOrEqual(QUOTE_BAR_GAP_BELOW_PX);
  });
});

/*
 * 跨节点的那一发:一句话被 `<strong>` 切成三个文本节点、折成两行。
 * 首行要取第一个文本节点画出来的行,末行要取最后一个 —— 中间那个行内元素
 * 与末尾被吞掉的空盒子都不许当锚点。这一格钉的是「两头各走一小段」真的走对了,
 * 而不是只在「整段选区就一个文本节点」那种退化情形下碰巧成立。
 */
const LINE_A = rect(150, 130, 120, 22); // 「这个位置」:130..152
const LINE_B = rect(270, 130, 60, 22); // <strong>还是</strong>,同一行
const LINE_C = rect(150, 152, 80, 22); // 「不对」折到第二行:152..174

function SplitHarness() {
  const scopeRef = useRef<HTMLDivElement>(null);
  return (
    <div data-testid="chat-pane-stand-in">
      <div ref={scopeRef} data-testid="chat-scroll-scope">
        <p data-message-id="user-1">
          {'这个位置'}
          <strong>{'还是'}</strong>
          {'不对'}
        </p>
        <div data-testid="tail-spacer" />
      </div>
      <QuoteBar scopeRef={scopeRef} onQuote={vi.fn()} />
    </div>
  );
}

describe('一句话被行内标签切成好几个文本节点时,首尾仍取文字', () => {
  it('首行取第一个文本节点、末行取最后一个,不取被吞掉的空盒子', () => {
    render(<SplitHarness />);
    const scope = screen.getByTestId('chat-scroll-scope');
    const paragraph = scope.querySelector('p');
    const blank = scope.querySelector('[data-testid="tail-spacer"]');
    const head = paragraph?.firstChild;
    if (!head || !blank) throw new Error('missing fixture nodes');

    const range = document.createRange();
    range.setStart(head, 0);
    range.setEnd(blank, 0);

    const byText: Record<string, DOMRect> = {
      这个位置: LINE_A,
      还是: LINE_B,
      不对: LINE_C,
    };
    vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function (
      this: Range,
    ): DOMRectList {
      const sameTextNode =
        this.startContainer === this.endContainer && this.startContainer.nodeType === Node.TEXT_NODE;
      const own = sameTextNode ? byText[this.startContainer.textContent ?? ''] : undefined;
      const rects = own ? [own] : [LINE_A, LINE_B, LINE_C, SWALLOWED_BLANK];
      return rects as unknown as DOMRectList;
    });
    vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(() =>
      rect(18, 130, 444, 290),
    );
    vi.spyOn(scope, 'getBoundingClientRect').mockImplementation(() => PANEL);
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => SENTENCE,
    } as unknown as Selection);

    fireEvent(document, new Event('selectionchange'));

    const bar = screen.getByTestId('chat-quote-bar');
    expect(bar.getAttribute('data-placement')).toBe('below');
    // 贴末行(第二行「不对」)的下沿 + 6px,而不是空盒子的 420 + 6
    expect(Number.parseFloat(bar.style.top)).toBe(LINE_C.bottom + QUOTE_BAR_GAP_BELOW_PX);
    // 居中于末行,不是居中于满宽空盒子
    expect(Number.parseFloat(bar.style.left)).toBe(LINE_C.left + LINE_C.width / 2);
  });
});

describe('浮条不能长在会重设 fixed 参照系的那层里', () => {
  /*
   * 断言的是**结构**,不是像素:jsdom 没有包含块这回事,量不出那段偏移。
   * 能验的是「浮条有没有待在 .pane 的子树里」—— 只要它还在里面,
   * `position: fixed` 的坐标就不是视口坐标,而且会被 pane 的 overflow:hidden 裁。
   */
  it('浮条 portal 到 body,不留在 .pane 子树里', () => {
    render(<Harness />);
    selectSentenceOvershootingIntoBlank(screen.getByTestId('chat-scroll-scope'));

    const bar = screen.getByTestId('chat-quote-bar');
    const pane = screen.getByTestId('chat-pane-stand-in');
    expect(pane.contains(bar)).toBe(false);
    expect(document.body.contains(bar)).toBe(true);
  });

  /*
   * portal 出去之后 `--chat-*` 会整片失效(自定义属性按 DOM 树继承,body 下面
   * 落在聊天接缝之外)。这个仓为此栽过三次:联系支持弹窗、产物卡浮层、输入框。
   * 浮条的底色 / 圆角 / 描边全是 `var(--chat-…)`,所以接缝必须跟着 portal 一起出去。
   */
  it('portal 出去的那一层自带聊天接缝', () => {
    render(<Harness />);
    selectSentenceOvershootingIntoBlank(screen.getByTestId('chat-scroll-scope'));

    const bar = screen.getByTestId('chat-quote-bar');
    expect(bar.closest('[data-chat-root]')).not.toBeNull();
  });
});
