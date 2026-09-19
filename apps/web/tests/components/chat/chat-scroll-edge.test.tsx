// @vitest-environment jsdom
/**
 * 红测:**消息列表顶部的渐进模糊边缘只在列表离开顶端后出现,并跟着列表走。**
 *
 * ── 背景 ────────────────────────────────────────────────────────────────
 * 项目页的 `.chat-project-header` 原本靠自身的玻璃底色加一段 `::after` 白色
 * 渐变盖头把滚到下面的消息压住。设计稿(#8113)改成:头部透明,列表视口顶部
 * 叠一层 40px 的四段 `backdrop-filter` 渐进模糊(`ChatScrollEdge`),再给
 * `.chat-log-viewport` 加遮罩,让底下真实表面露出来。
 *
 * ── 这份规格钉什么 ──────────────────────────────────────────────────────
 *  · 列表在顶端(`scrollTop <= 1`)时 `data-active="false"`;
 *  · 列表滚动到 `scrollTop > 1` 后翻成 `"true"`,滚回顶端再翻回来;
 *  · 挂载时用 rAF 读一次初始位置 —— 恢复的滚动位置不必等用户再滚一下;
 *  · 卸载时把 `scroll` 监听摘干净,不给已卸载的组件留一条通向 setState 的路。
 *
 * jsdom 不做布局,`scrollTop` 用可写属性顶替;`ChatScrollEdge` 只读这个数,
 * 不碰几何。
 */
import { act, cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatScrollEdge } from '../../../src/components/chat/ChatScrollEdge';

function Harness({ initialTop = 0, onLog }: { initialTop?: number; onLog: (log: HTMLDivElement) => void }) {
  const logRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className="chat-log-viewport">
      <ChatScrollEdge scrollRef={logRef} />
      <div
        className="chat-log"
        data-testid="log"
        ref={(el) => {
          logRef.current = el;
          if (el) {
            Object.defineProperty(el, 'scrollTop', { value: initialTop, writable: true, configurable: true });
            onLog(el);
          }
        }}
      />
    </div>
  );
}

function mount(initialTop = 0) {
  let log: HTMLDivElement | null = null;
  const utils = render(<Harness initialTop={initialTop} onLog={(el) => { log = el; }} />);
  if (!log) throw new Error('log ref never attached');
  const edge = utils.container.querySelector('[data-active]') as HTMLElement | null;
  if (!edge) throw new Error('ChatScrollEdge did not render its data-active root');
  return { ...utils, log: log as HTMLDivElement, edge };
}

function scrollTo(log: HTMLDivElement, top: number) {
  act(() => {
    log.scrollTop = top;
    log.dispatchEvent(new Event('scroll'));
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ChatScrollEdge', () => {
  it('stays inactive while the transcript sits at the top', () => {
    const { edge } = mount(0);
    expect(edge.getAttribute('data-active')).toBe('false');
    expect(edge.getAttribute('aria-hidden')).toBe('true');
    expect(edge.querySelectorAll(':scope > span')).toHaveLength(4);
  });

  it('activates once the transcript scrolls past the first pixel and releases on the way back', () => {
    const { edge, log } = mount(0);

    scrollTo(log, 1);
    expect(edge.getAttribute('data-active'), 'scrollTop 1 is still "at the top"').toBe('false');

    scrollTo(log, 2);
    expect(edge.getAttribute('data-active')).toBe('true');

    scrollTo(log, 0);
    expect(edge.getAttribute('data-active')).toBe('false');
  });

  it('reads a restored scroll position on the next frame without waiting for a scroll event', async () => {
    const { edge } = mount(120);
    expect(edge.getAttribute('data-active'), 'first paint is the synchronous default').toBe('false');
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    expect(edge.getAttribute('data-active')).toBe('true');
  });

  it('removes its scroll listener on unmount', () => {
    const { log, unmount } = mount(0);
    const removeSpy = vi.spyOn(log, 'removeEventListener');
    unmount();
    const scrollRemovals = removeSpy.mock.calls.filter(([type]) => type === 'scroll');
    expect(scrollRemovals, 'the scroll listener must be detached with the component').toHaveLength(1);
  });
});
