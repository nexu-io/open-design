// @vitest-environment jsdom
/**
 * W129 ① —— **让 tooltip 的淡入真的发生**(产品裁决 2026-09-03:做重构)。
 *
 * 稿子基线 `729fa43ce7`(PR #7170),原件
 * `docs/design/chat-panel/src/components.css:2699-2711`:气泡挂在一个**一直存在**的
 * `::after` 上,`opacity: 0` 起手,`transition: opacity var(--duration-faster) var(--ease-out)`,
 * hover / focus-visible 时 `opacity: 1`。
 *
 * 产品这边是 body portal(`TooltipLayer.tsx`),W126 那一轮 hide 时直接
 * `return null` 卸载 —— 元素根本没机会从 `opacity:0` 走到 `1`,光加一条
 * `transition` 是**死 CSS**(W126 的撤销复验正是这么把它标成多余的)。
 * 这一轮按产品拍板改成:**保持挂载 + 切 opacity**。
 *
 * ## 这次重构最容易做错的地方:读屏
 *
 * 一个一直挂在 DOM 里的 `role="tooltip"` 节点,不能让读屏软件在它不可见时
 * 还念得出来。下面「读屏」那一组就是钉这件事的:
 * 隐藏态必须 `aria-hidden="true"`,`getByRole('tooltip')` 必须拿不到它,
 * 而 `querySelector('.od-tooltip-layer')` 必须还拿得到 —— 后者证明前者不是
 * 「整个组件没渲染」造成的**真空通过**。
 *
 * ## 判据为什么只读真 DOM 属性 / inline style
 *
 * jsdom 不加载样式表,`getComputedStyle` 对 CSS 文件里的声明一律读空串;
 * `aria-hidden` 与 `style.opacity` 是 React 直接写进 DOM 的,不经样式管道。
 * CSS 那一半(`transition` 的字面值)在
 * `tests/styles/w126-tooltip-design-parity.test.ts` 里读源文件字节。
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TooltipLayer } from '../../src/components/TooltipLayer';

afterEach(() => cleanup());

/** 气泡节点。取不到就抛 —— 「节点不在」和「属性不对」必须是两种失败。 */
function bubble(): HTMLElement {
  const node = document.querySelector('.od-tooltip-layer');
  if (!(node instanceof HTMLElement)) {
    throw new Error('文档里没有 .od-tooltip-layer —— 气泡没有常驻挂载');
  }
  return node;
}

function mount() {
  render(
    <>
      <button type="button" className="od-tooltip" data-tooltip="设置">
        Settings
      </button>
      <TooltipLayer />
    </>,
  );
  return screen.getByRole('button', { name: 'Settings' });
}

describe('气泡常驻挂载 —— 过渡要有东西可跑', () => {
  it('还没 hover 过就已经在 DOM 里,且 opacity 是 0', () => {
    mount();
    expect(bubble().style.opacity).toBe('0');
  });

  it('hover 时同一个节点被复用,opacity 切到 1', () => {
    const button = mount();
    const before = bubble();

    fireEvent.pointerOver(button);

    const after = bubble();
    expect(after, 'hover 之后换了一个节点 —— 换节点就没有过渡可言').toBe(before);
    expect(after.style.opacity).toBe('1');
  });

  it('移开之后节点不卸载,只把 opacity 退回 0(退场过渡才跑得起来)', () => {
    const button = mount();
    fireEvent.pointerOver(button);
    const shown = bubble();

    fireEvent.pointerOut(button);

    expect(bubble(), '移开之后气泡被卸载了 —— 退场过渡永远看不到').toBe(shown);
    expect(bubble().style.opacity).toBe('0');
  });

  it('淡出时保留最后那句话 —— 不能一边淡出一边塌成空盒', () => {
    const button = mount();
    fireEvent.pointerOver(button);
    expect(bubble().textContent).toBe('设置');

    fireEvent.pointerOut(button);
    expect(bubble().textContent, '淡出过程中文案被清空,盒子会先塌再淡').toBe('设置');
  });
});

describe('按下去要立刻让位 —— 不许留一截淡出印进截图', () => {
  /*
   * 常驻挂载之后,「移开」和「按下去」必须分开处理:
   * 移开可以淡 100ms;按下去不行 —— `FileViewer.captureExportImageSnapshot`
   * 只等两帧(~32ms)就让宿主合成器抓屏,而 `cubic-bezier(0,0,0,1)` 走到 32ms
   * 才淡掉约 76%,还剩两成多的不透明度会原样印进截图。
   * 所以按下去那一路走 `visibility: hidden`,一刀切掉。
   * 守卫另一半在 `tests/components/file-viewer-screenshot-tooltip.test.tsx`。
   */
  it('hover 时是画出来的,pointerDown 之后立刻 visibility: hidden', () => {
    const button = mount();
    fireEvent.pointerOver(button);
    expect(bubble().style.visibility, 'hover 时气泡就没画出来 —— 判据看不见东西').toBe('visible');

    fireEvent.pointerDown(button);

    expect(
      bubble().style.visibility,
      '按下去之后气泡还在画 —— 那 100ms 会印进截图',
    ).toBe('hidden');
  });

  it('鼠标移开那一路照旧留着画,让淡出跑完', () => {
    const button = mount();
    fireEvent.pointerOver(button);
    fireEvent.pointerOut(button);

    expect(bubble().style.visibility, '移开就一刀切,退场过渡等于没有').toBe('visible');
    expect(bubble().style.opacity).toBe('0');
  });
});

describe('读屏 —— 隐藏态不许被念出来', () => {
  it('隐藏态挂 aria-hidden="true",可访问性树里查不到 tooltip', () => {
    mount();

    /* 先证判据看得见东西:节点确实在,下面的 toBeNull 才不是真空通过 */
    expect(bubble().getAttribute('aria-hidden')).toBe('true');
    expect(
      screen.queryByRole('tooltip'),
      '隐藏态还留在可访问性树里 —— 读屏会一直念它',
    ).toBeNull();
  });

  it('显示态摘掉 aria-hidden,读屏重新拿得到', () => {
    const button = mount();
    fireEvent.pointerOver(button);

    expect(bubble().getAttribute('aria-hidden')).toBeNull();
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toBe('设置');
  });

  it('淡出之后重新挂回 aria-hidden —— 不是只在首帧挂一次', () => {
    const button = mount();
    fireEvent.pointerOver(button);
    expect(screen.getByRole('tooltip').textContent).toBe('设置');

    fireEvent.pointerOut(button);

    expect(bubble().getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
