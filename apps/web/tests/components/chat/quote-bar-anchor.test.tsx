// @vitest-environment jsdom
/**
 * 取词浮条**贴不贴得住选中的那几个字**(设计稿组件 23-1 / 23-2)。
 *
 * 现场缺陷:在「执行计划」的展开列表里选中一行,浮条掉到了几百像素以下的
 * 「运行…」那一行上、几乎压到输入框。两条独立的原因叠在一起:
 *
 * 1. 稿子的默认是**朝上**(`.selbar { bottom: calc(100% + 7px) }`),
 *    翻面才朝下(`.selbar.mod-below { top: calc(100% + 6px) }`);产品反了。
 * 2. 定位读的是 `Range.getBoundingClientRect()` —— 那是**所有** client rect 的并集,
 *    包含选区末端那个**零宽**的光标矩形。拖选稍微过界一点,末端会落在下一个
 *    区块的行首:屏幕上什么都没高亮,并集的下沿却已经跑到那一行去了。
 *
 * 所以这一组问的是同一件事的两半:浮条贴的必须是**看得见的**那块选区矩形。
 */
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QuoteBar } from '../../../src/components/chat/QuoteBar';

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

function unionOf(rects: DOMRect[]): DOMRect {
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return rect(left, top, right - left, bottom - top);
}

function Harness() {
  const scopeRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={scopeRef} data-testid="chat-scroll-scope">
        <p data-message-id="assistant-1">执行计划里的一行文案</p>
      </div>
      <QuoteBar scopeRef={scopeRef} onQuote={vi.fn()} />
    </>
  );
}

/**
 * `panel` 是 chat-log 可视区,`rects` 是选区的 client rect 列表
 * (顺序即文档顺序,零宽的那些就是末端光标位置)。
 */
function selectWithClientRects(panel: DOMRect, rects: DOMRect[]) {
  render(<Harness />);
  const scope = screen.getByTestId('chat-scroll-scope');
  vi.spyOn(scope, 'getBoundingClientRect').mockImplementation(() => panel);

  const textNode = scope.querySelector('p')?.firstChild;
  if (!textNode) throw new Error('missing selectable message text');
  const range = document.createRange();
  range.selectNodeContents(textNode);
  vi.spyOn(range, 'getClientRects').mockImplementation(
    () => rects as unknown as DOMRectList,
  );
  vi.spyOn(range, 'getBoundingClientRect').mockImplementation(() => unionOf(rects));
  vi.spyOn(window, 'getSelection').mockReturnValue({
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => range,
    toString: () => '执行计划里的一行文案',
  } as unknown as Selection);

  fireEvent(document, new Event('selectionchange'));
  const bar = screen.getByTestId('chat-quote-bar');
  return {
    bar,
    top: Number.parseFloat(bar.style.top),
    left: Number.parseFloat(bar.style.left),
    placement: bar.getAttribute('data-placement'),
  };
}

describe('取词浮条紧贴选中的那几个字', () => {
  /*
   * 稿子 23-1:上方放得下就朝上,7px 缝。产品原来默认朝下 —— 于是浮条挡住
   * 用户接着要读的下一行,而且一旦并集的下沿跑远,它就跟着跑远。
   */
  it('上方放得下时朝上,离选中行 7px', () => {
    const line = rect(120, 300, 200, 24);
    const { top, placement } = selectWithClientRects(rect(0, 100, 480, 800), [line]);
    expect(placement).toBe('above');
    // transform 是 translate(-50%, -100%),所以 top 就是浮条的下沿
    expect(top).toBe(293);
  });

  /*
   * 现场那一发。选中的是 y=300 那一行,但拖选末端落在了下面「运行…」行的行首,
   * 留下一个零宽矩形(屏幕上没有任何高亮)。并集的下沿因此是 820 ——
   * 浮条原来就贴着它,于是掉到输入框上沿。
   */
  it('末端那个零宽光标矩形不能把浮条拽到几百像素以下', () => {
    const visibleLine = rect(120, 300, 200, 24);
    const trailingCaret = rect(40, 800, 0, 20); // 「运行…」那一行的行首
    const { top, left, placement } = selectWithClientRects(
      rect(0, 100, 480, 800),
      [visibleLine, trailingCaret],
    );
    expect(placement).toBe('above');
    expect(top).toBe(293);
    // 居中也只认看得见的那块:并集会把中心拉到 180(40..320)
    expect(left).toBe(220);
  });

  /*
   * 稿子 23-2:只有上方顶到面板边才翻下去,而且是 6px 不是 7px。
   * 翻下去之后贴的必须是**末行**矩形的下沿,同样不能被零宽矩形拽走。
   */
  it('选区贴着面板顶边才翻到下方,离选中行 6px', () => {
    const visibleLine = rect(120, 110, 200, 24);
    const trailingCaret = rect(40, 800, 0, 20);
    const { top, placement } = selectWithClientRects(
      rect(0, 100, 480, 800),
      [visibleLine, trailingCaret],
    );
    expect(placement).toBe('below');
    expect(top).toBe(140);
  });
});

/**
 * 跨屏选区(现场第二发)。
 *
 * 现场:从助手消息最顶上的「Codex」那一行一路拖到最后一段结论,七八个块、
 * 几乎占满整屏。起点贴着面板顶边 → 上方放不下 → 翻到下方,然后浮条飞过大半屏,
 * **压在产物卡的预览图上**。
 *
 * 这一组原来钉的是「选区比半屏还高就翻下去贴起点」(`isLongSelection`,比例 0.5)。
 * 那条判据已经删了,两条理由:
 *
 * 1. **它当初看到的现场有一部分是假的。** 「压在产物卡预览图上」正是选区把一块
 *    **没有文字的元素 border box** 吞进了 `getClientRects()`(CSSOM:被 Range 整个
 *    包住的元素,它的盒子也在列表里)。那才是「末块」跑到几百像素以下的原因,
 *    不是选区长。源头已经堵在 `QuoteBar.selectionEdgeTextRects`(只认被高亮的
 *    文字画出来的行),护栏在 `quote-bar-anchor-truth.test.tsx`。
 * 2. **它在猜,而正确的问题量得出来。** 用户 2026-09-02 的裁决是「浮条**始终保持
 *    在画面里**,并**尽可能贴近选区**,跑太远肯定就是 bug」——「选区有哪一段在
 *    画面里」用选区矩形和可视区一交就有答案,不需要一个 0.5 的比例去代替它。
 *    新判据在 `runtime/chat/quote-selection.ts` 的 `visibleQuoteAnchors`,
 *    纯函数那一层的用例在 `tests/runtime/chat/quote-bar-in-view.test.ts`。
 *
 * 于是这一组改钉「可见 / 不可见」两侧。
 */
describe('跨屏选区', () => {
  const panel = rect(0, 100, 480, 800); // 100..900,可视高度 800

  /*
   * 选区很高,但首尾**都还在画面里** —— 这一档回到稿子:翻下去让开整段、贴末行。
   * (裁决原文:「选区完全在画面内 → 行为不变」。)末行看得见,贴它就不存在
   * 「丢到几屏之外」这回事;而且向下拖选时用户的光标正停在末行上,浮条出现在
   * 那儿就是出现在他正看着的地方。
   */
  it('整段都在画面里的高选区,翻下去贴末行(稿子 23-2)', () => {
    const codexLine = rect(120, 120, 200, 24); // 「Codex」那一行:120..144
    const lastConclusion = rect(120, 776, 300, 24); // 最后一段结论:776..800,仍在 900 以内
    const { top, left, placement } = selectWithClientRects(panel, [
      codexLine,
      rect(120, 300, 320, 24),
      rect(120, 520, 280, 24),
      lastConclusion,
    ]);

    expect(placement).toBe('below');
    // 贴末行下沿 + 稿子的 6px
    expect(top).toBe(lastConclusion.bottom + 6);
    // 水平跟着贴的那一块走
    expect(left).toBe(lastConclusion.left + lastConclusion.width / 2);
    // 说人话的那条:离它贴的那一行不许超过一道缝
    expect(top - lastConclusion.bottom).toBeLessThanOrEqual(6);
  });

  /*
   * 选区比面板还高,**首尾都在画面外**(中间那段占满整屏)。
   *
   * 稿子没有这一格,W32 定:落在可视区**顶边**。整屏都是被选中的字,没有
   * 「选区的边」可贴;顶边与稿子默认的朝上/贴起点方向同向,而且离底下的输入框
   * 最远,不会压住用户接着要点的地方。
   */
  it('选区比面板还高(首尾都在视口外)时浮条贴在可视区顶边', () => {
    const above = rect(120, -200, 200, 24); // 起点已经滚出视口上方
    const below = rect(120, 1100, 300, 24); // 末尾在视口下方
    const { top, placement } = selectWithClientRects(panel, [
      above,
      rect(120, 400, 320, 24),
      below,
    ]);

    expect(placement).toBe('above');
    // 朝上时浮条占 [top - 34, top],所以盒子上沿正好是 panel.top + 8
    expect(top - 34).toBe(panel.top + 8);
    // 夹进面板安全区,而不是跑到 1106 去
    expect(top).toBeGreaterThanOrEqual(108);
    expect(top).toBeLessThanOrEqual(858);
    // 而且要夹在**靠起点那一头**:钉在 composer 上沿等于又飞了一次
    expect(top).toBeLessThan(300);
  });

  it('短的跨行选区照旧让开整段选区', () => {
    const firstLine = rect(120, 110, 200, 24); // 110..134,贴着面板顶边
    const secondLine = rect(120, 134, 160, 24); // 134..158
    const { top, placement } = selectWithClientRects(panel, [firstLine, secondLine]);

    expect(placement).toBe('below');
    // 让开的是**整段**:末行下沿 158 + 6
    expect(top).toBe(164);
  });
});
