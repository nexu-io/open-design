// @vitest-environment jsdom
/**
 * 真机复现件:2026-08-27 部署到真实 runtime 之后,用户仍旧看到菜单跑到左边去。
 *
 * CDP 在真实 app 里量到的硬数据(视口 1770×861,产物卡上那枚 Publish 胶囊,
 * 也就是 portal 那条路):
 *
 *     锚点   [data-artifact-anchor]     left=131  right=189  width=58
 *     包裹盒 [data-anchored-menu]       style.left = "131.086px"  ← 等于 rect.left
 *     菜单   .chrome-unified-popover    left=-59  right=189  width=248
 *                                       transform = none
 *                                       maxHeight = 284.148px   ← 小数 = JS 算的
 *                                       overflowY = auto
 *
 * 读法很关键:
 *  · `maxHeight` 是小数,说明 `size` 那一档**跑过了**,也就说明当时
 *    `panelRect.width > 0` 为真 —— 限高和横移在同一个 `if` 里,不可能一个进
 *    一个不进。所以「拿不到 menuRef」不是原因。
 *  · `inlineShift` 却是 0。按几何该是 `0 + 8 - (-59) = 67`。
 *
 * 也就是说:**修正算出来过,又被抹回 0 了。**
 */
import { cleanup, render, screen } from '@testing-library/react';
import { StrictMode, act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AnchoredMenuShell } from '../../../src/components/chat/AnchoredMenuShell';

const MENU_CLS = 'share-menu-popover chrome-unified-popover';
const WRAP_CLS = 'share-menu chrome-share-menu chrome-share-menu--unified';
const ANCHOR_ID = 'publish:creator-analytics-dashboard.html';

/* 真机那一组数字,原样搬过来 */
const VIEWPORT = { w: 1770, h: 861 };
const ANCHOR = { left: 131.086, top: 390.352, width: 58, height: 24.797 };
const MENU_W = 248;
const MENU_H = 284.148;

function box(left: number, top: number, width: number, height: number): DOMRect {
  const b = { x: left, y: top, left, top, right: left + width, bottom: top + height, width, height };
  return { ...b, toJSON: () => b } as DOMRect;
}

let originalRect: typeof HTMLElement.prototype.getBoundingClientRect;

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: VIEWPORT.w, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: VIEWPORT.h, configurable: true });
  originalRect = HTMLElement.prototype.getBoundingClientRect;
});

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalRect;
  cleanup();
  document.querySelectorAll('[data-artifact-anchor]').forEach((el) => el.remove());
});

/**
 * 真机的排版规则只有一条参与:菜单 `right: 0` 贴着包裹盒右缘,向左长 248px。
 * 包裹盒的 `left` 是组件写的内联样式,菜单的盒子从它推出来 —— 和真机一致
 * (包裹盒 left=131 → 菜单 right=131+58=189 → 菜单 left=189-248=-59)。
 *
 * 锚点**直接挂在 body 下**:真机 dump 里菜单的父链是 [包裹盒] → BODY → HTML,
 * 一个裁剪祖先都没有。夹取框因此退回视口 —— 这正是修正该发挥作用的场景,
 * 不能因为「没有裁剪祖先」就跳过。
 */
function mount() {
  const anchor = document.createElement('button');
  anchor.setAttribute('data-artifact-anchor', ANCHOR_ID);
  anchor.getBoundingClientRect = () => box(ANCHOR.left, ANCHOR.top, ANCHOR.width, ANCHOR.height);
  document.body.appendChild(anchor);

  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList.contains('share-menu-popover')) {
      const host = this.parentElement as HTMLElement | null;
      const hostLeft = Number.parseFloat(host?.style.left ?? '0') || 0;
      const hostWidth = Number.parseFloat(host?.style.width ?? '0') || 0;
      return box(hostLeft + hostWidth - MENU_W, 415.149, MENU_W, MENU_H);
    }
    return originalRect.call(this);
  };

  render(
    <AnchoredMenuShell
      anchorId={ANCHOR_ID}
      wrapperClassName={WRAP_CLS}
      className={MENU_CLS}
      testId="unified-action-menu"
    >
      <button type="button">row</button>
    </AnchoredMenuShell>,
  );
  const menu = screen.getByTestId('unified-action-menu');
  return { menu, wrapper: menu.parentElement as HTMLElement, anchor };
}

function mountStrict() {
  const anchor = document.createElement('button');
  anchor.setAttribute('data-artifact-anchor', ANCHOR_ID);
  anchor.getBoundingClientRect = () => box(ANCHOR.left, ANCHOR.top, ANCHOR.width, ANCHOR.height);
  document.body.appendChild(anchor);
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList.contains('share-menu-popover')) {
      const host = this.parentElement as HTMLElement | null;
      const hostLeft = Number.parseFloat(host?.style.left ?? '0') || 0;
      const hostWidth = Number.parseFloat(host?.style.width ?? '0') || 0;
      return box(hostLeft + hostWidth - MENU_W, 415.149, MENU_W, MENU_H);
    }
    return originalRect.call(this);
  };
  render(
    <StrictMode>
      <AnchoredMenuShell anchorId={ANCHOR_ID} wrapperClassName={WRAP_CLS} className={MENU_CLS} testId="unified-action-menu">
        <button type="button">row</button>
      </AnchoredMenuShell>
    </StrictMode>,
  );
  const menu = screen.getByTestId('unified-action-menu');
  return { menu, wrapper: menu.parentElement as HTMLElement };
}

describe('真机几何:产物卡 Publish 菜单不许跑到视口外', () => {
  it('包裹盒的 left 必须带上 67px 修正(真机量到的是 0)', () => {
    const { wrapper } = mount();
    const left = Number.parseFloat(wrapper.style.left);
    // 真机:131.086(= rect.left,一点没修)。应有:131.086 + 67 = 198.086
    expect(left, `包裹盒 left=${left},等于锚点 left 就说明修正是 0`).toBeGreaterThan(ANCHOR.left + 60);
  });

  it('菜单左缘不许越过视口左边(留 8px 余量)', () => {
    const { menu } = mount();
    const r = menu.getBoundingClientRect();
    expect(r.left, `菜单左缘 ${r.left} 跑到视口外面了`).toBeGreaterThanOrEqual(8 - 0.5);
  });

  it('放得下的竖轴不该被限高(反向对照)', () => {
    // 这个夹具没有裁剪祖先,竖向预算 = 视口,面板 284 < 预算,不该限
    const { menu } = mount();
    expect(menu.style.maxHeight, '没超出却限了高').toBeFalsy();
  });

  /**
   * 真机那个「限高有、横移没有」的组合,只有一种成因:某一轮 `measure` 拿不到
   * 菜单(`panelRect` 为空),于是 `inlineShift` 保持 0 —— 而 `appliedShiftRef`
   * **也被写成 0**,状态跟着回落成 0,包裹盒弹回 `rect.left`。之后没有任何事件
   * 再触发重算,它就停在错的位置上。
   *
   * 这一条把那一轮**显式**造出来:先正常量一轮(修正落到 67),再让菜单临时
   * 量不到,然后触发一次重算。修正不许被这一轮抹掉。
   */
  it('某一轮量不到菜单时,不许把已生效的修正抹回 0', () => {
    const { wrapper } = mount();
    const good = Number.parseFloat(wrapper.style.left);
    expect(good, '第一轮就没修正,这条对照是空的').toBeGreaterThan(ANCHOR.left + 60);

    // 菜单临时量不到(portal 重挂 / ref 断开的那一帧)
    const shifted = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.classList.contains('share-menu-popover')) return box(0, 0, 0, 0);
      return shifted.call(this);
    };
    act(() => { window.dispatchEvent(new Event('resize')); });
    HTMLElement.prototype.getBoundingClientRect = shifted;

    const after = Number.parseFloat(wrapper.style.left);
    expect(after, `量不到菜单的那一轮把修正抹成了 ${after}(应保持 ${good})`).toBeCloseTo(good, 1);
  });

  /**
   * **真机回归的那一条。**
   *
   * `appliedShiftRef` 记的是「我上次告诉 DOM 的偏移」,而不是「DOM 现在真实的
   * 偏移」。这两者在一种情况下会分家:**同一帧里连着量两次、中间没有重排**。
   * 于是第二次量到的还是没修正的盒子,却按「已经修了 N」去还原,凭空多减一个 N,
   * 修正量翻倍。
   *
   * React 18 的 `StrictMode` 在开发模式下正是这么跑的(effect 挂载 → 卸载 →
   * 再挂载),而 Next.js dev 默认开着它。真实浏览器里量到:
   *     普通:       shift = 108.36  菜单左缘 64   ✓
   *     StrictMode: shift = 216.72  菜单左缘 172  ✗(正好两倍)
   *
   * 修法是**别再记账**:偏移量从 DOM 上读回来(computed transform),
   * 量多少次都是同一个值。
   */
  it('StrictMode 下重复挂载 effect,修正量不许翻倍', () => {
    const { wrapper } = mountStrict();
    const left = Number.parseFloat(wrapper.style.left);
    const shift = left - ANCHOR.left;
    // 正确值 67(视口夹取);翻倍会是 134
    expect(shift, `修正量 ${shift} —— 67 是对的,134 说明加了两次`).toBeLessThan(100);
    expect(shift, '完全没修正').toBeGreaterThan(60);
  });
});
