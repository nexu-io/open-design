// @vitest-environment jsdom
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QuoteBar } from '../../../src/components/chat/QuoteBar';

const originalResizeObserver = globalThis.ResizeObserver;
const resizeCallbacks: ResizeObserverCallback[] = [];

beforeEach(() => {
  resizeCallbacks.length = 0;
  class ResizeObserverMock {
    constructor(callback: ResizeObserverCallback) {
      resizeCallbacks.push(callback);
    }
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
  };
}

function QuoteBarHarness() {
  const scopeRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={scopeRef} data-testid="chat-scroll-scope">
        <p data-message-id="assistant-1">一段可以添加到对话的选中文案</p>
      </div>
      <QuoteBar scopeRef={scopeRef} onQuote={vi.fn()} />
    </>
  );
}

describe('Add to chat 选区浮层的滚动生命周期', () => {
  function selectText(options: {
    scopeBottom?: number;
    selectionTop?: number;
    selectionBottom?: number;
  } = {}) {
    render(<QuoteBarHarness />);
    const scope = screen.getByTestId('chat-scroll-scope');
    const geometry = {
      scopeBottom: options.scopeBottom ?? 640,
      selectionTop: options.selectionTop ?? 180,
      selectionBottom: options.selectionBottom ?? 204,
    };
    vi.spyOn(scope, 'getBoundingClientRect').mockImplementation(
      () => rect(0, 0, 480, geometry.scopeBottom),
    );

    const textNode = scope.querySelector('p')?.firstChild;
    if (!textNode) throw new Error('missing selectable message text');
    const range = document.createRange();
    range.selectNodeContents(textNode);
    vi.spyOn(range, 'getBoundingClientRect').mockImplementation(
      () => rect(120, geometry.selectionTop, 160, geometry.selectionBottom - geometry.selectionTop),
    );
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => '添加到对话的选中文案',
    } as unknown as Selection);

    fireEvent(document, new Event('selectionchange'));
    expect(screen.getByTestId('chat-quote-bar')).toBeInTheDocument();
    return { geometry, scope };
  }

  it('保留没有改变 chat viewport / Range 几何的 nested 或 no-op scroll', () => {
    const { scope } = selectText();

    // scroll 是捕获阶段的全页信号；如果 log 与选区都没动，它不能把仍在原位的操作浮层关掉。
    fireEvent.scroll(scope);
    expect(screen.getByTestId('chat-quote-bar')).toBeInTheDocument();
  });

  /*
   * 这一条原来的标题逐字是「chat viewport 真正位移时**关闭**,并等待下一次
   * selectionchange 才重新出现」,断言的是「一滚就藏」。**那半条裁决在 2026-09-04
   * 被用户当面推翻**:「选中文本后,『添加到对话』按钮怎么一滚动就消失了?消失
   * 不会再显示吗?」—— 滚一下就没,而且不重新选一次就再也不回来。
   *
   * 另外半条理由仍然成立,不许跟着一起丢:OPEND-2541「滚动会话时选中文案的
   * Add to chat 浮层随内容移动」说的是真问题 —— 浮条是 `position: fixed`,滚动时
   * 若不重算就停在原地,变成一条指着不存在内容的鬼影。当年的修法是「那就藏了」;
   * 现在换成「每帧重新贴」:鬼影同样不可能出现(位置每次都按新几何算),而且这才是
   * 稿子的行为(`729fa43ce7:docs/design/chat-panel/src/components.css:3136` 把
   * `.selbar` 用 `absolute` 挂在 `.sel` 自己身上,天然跟着内容滚)。选区真的滚出
   * 画面那一档仍然要藏,判据是 `QuoteBar.selectionOnScreen`,钉在
   * `quote-bar-follows-scroll.test.tsx` ②③ 两条。
   *
   * 所以这里断言两件事:视口真的动了 → 浮条**还在**,而且**位置跟着新几何走**。
   * 只断言「还在」会给鬼影放行 —— 停在原地的浮条也「还在」。
   */
  it('chat viewport 真正位移时跟着重新定位，不再需要下一次 selectionchange', () => {
    const { geometry, scope } = selectText();
    const barTop = (): number =>
      Number.parseFloat(screen.getByTestId('chat-quote-bar').style.top);
    const before = barTop();

    // 真浏览器滚动时这两样一起变:容器的 scrollTop,和选区在**屏幕上**的坐标。
    scope.scrollTop = 48;
    geometry.selectionTop -= 48;
    geometry.selectionBottom -= 48;
    fireEvent.scroll(scope);

    expect(screen.getByTestId('chat-quote-bar')).toBeInTheDocument();
    expect(
      Math.round(before - barTop()),
      '选区上移 48px,浮条也要上移 48px;差值 0 = 停在原地的鬼影(OPEND-2541)',
    ).toBe(48);
  });

  /*
   * 浮条默认朝上,只有上方被面板顶边挤住才翻到下方(稿子 23-2)。所以这一条
   * 要的是「翻下去之后,下方又被 queue / composer 吃掉」——placement 必须跟着
   * panelBottom 重算,而不是只在 scroll 时才更新。
   */
  it('queue / composer 改变 log 可用高度但没有 scroll 时重新翻面', () => {
    const { geometry } = selectText({
      scopeBottom: 120,
      selectionTop: 20,
      selectionBottom: 44,
    });
    // 上方只剩 20px,放不下浮条 —— 翻到下方
    expect(screen.getByTestId('chat-quote-bar')).toHaveAttribute('data-placement', 'below');

    // queue 展开,log 可用高度被吃掉:下方只剩 16px,比上方还窄
    geometry.scopeBottom = 60;
    expect(resizeCallbacks).toHaveLength(1);
    act(() => {
      resizeCallbacks[0]!([], {} as ResizeObserver);
    });

    expect(screen.getByTestId('chat-quote-bar')).toHaveAttribute('data-placement', 'above');
  });
});
