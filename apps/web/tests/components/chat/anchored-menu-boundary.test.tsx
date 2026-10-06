// @vitest-environment jsdom
/**
 * 浮层不许跑出「会裁掉它的那个框」—— **两条路都算**。
 *
 * `anchored-menu-shell.test.tsx` 钉的是产物卡那条路(portal 出去的那份)。
 * 这一份钉的是**工具栏那条路**:菜单原地长在 `.chrome-share-menu` 里,靠
 * `.chrome-share-menu .share-menu-popover { right: 0 }` 贴着触发键的右缘。
 *
 * 2026-08-27 用户报「这个会超出去的问题怎么还没修好?」,配图是预览区工具栏
 * 上那枚「发布」点开的菜单往左长、被左边的深色 chrome 切掉半截。原因是
 * `AnchoredMenuShell` 在 `anchorId == null` 时**直接 `return menu`** ——
 * 既不 portal 也不量任何东西,横向修正只覆盖了产物卡那条路。
 *
 * 这一组同时钉住调研补上的三档(Floating UI 的 `size` / 双轴 `detectOverflow` /
 * `hide`):
 *   · 平移不够时要**限尺寸并内部滚动**,不是硬塞出去(`size`)
 *   · 夹取要看 `overflow-x` **和** `overflow-y`,且**多层嵌套要取交集**
 *   · 锚点滚出可视区(或从 DOM 里没了)要发「已不可见」信号(`hide`)
 *
 * ⚠️ jsdom 不排版:这里所有几何都是喂进去的假 rect,测的是**算法**,不是真实
 * 布局。真实坐标另用 headless Chrome 走 CDP 量(`.tmp/popover-measure.mjs`)。
 */
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnchoredMenuShell } from '../../../src/components/chat/AnchoredMenuShell';

const MENU_CLS = 'share-menu-popover chrome-unified-popover';
const WRAP_CLS = 'share-menu chrome-share-menu chrome-share-menu--unified';

function box(left: number, top: number, width: number, height: number): DOMRect {
  const b = { x: left, y: top, left, top, right: left + width, bottom: top + height, width, height };
  return { ...b, toJSON: () => b } as DOMRect;
}

afterEach(() => {
  cleanup();
  document.querySelectorAll('[data-artifact-anchor]').forEach((el) => el.remove());
  document.body.querySelectorAll('.boundary').forEach((el) => el.remove());
  vi.restoreAllMocks();
});

/**
 * 建一个「工具栏那条路」的真实形状:
 *   .boundary (overflow:hidden 的那个框)
 *     └ .share-menu.chrome-share-menu (position:relative,触发键的包裹盒)
 *         └ <AnchoredMenuShell anchorId={null}>  → 原地渲染的菜单
 *
 * `menuBox` 是「既有 CSS 排出来的」菜单盒子:右缘对齐 `.share-menu` 的右缘。
 */
function renderToolbarMenu(opts: {
  boundary: { left: number; right: number; top: number; bottom: number };
  triggerLeft: number;
  triggerWidth: number;
  menuWidth: number;
  menuHeight: number;
  overflowAxis?: 'x' | 'y' | 'both';
  onAnchorHidden?: () => void;
}) {
  const host = document.createElement('div');
  host.className = 'boundary';
  const axis = opts.overflowAxis ?? 'both';
  host.style.overflowX = axis === 'y' ? 'visible' : 'hidden';
  host.style.overflowY = axis === 'x' ? 'visible' : 'hidden';
  host.getBoundingClientRect = () =>
    box(opts.boundary.left, opts.boundary.top, opts.boundary.right - opts.boundary.left, opts.boundary.bottom - opts.boundary.top);
  document.body.appendChild(host);

  const original = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList.contains('share-menu-popover')) {
      // 既有 CSS:`right: 0` —— 菜单右缘贴着 `.share-menu` 的右缘,向左长。
      // 组件如果加了 translateX 修正,这里要反映出来(真实浏览器里会)。
      const shift = readShift(this);
      const right = opts.triggerLeft + opts.triggerWidth;
      return box(right - opts.menuWidth + shift, 300, opts.menuWidth, opts.menuHeight);
    }
    if (this.classList.contains('share-menu')) {
      return box(opts.triggerLeft, 300, opts.triggerWidth, 21);
    }
    return original.call(this);
  };

  const { unmount } = render(
    <div className={WRAP_CLS}>
      <AnchoredMenuShell
        anchorId={null}
        wrapperClassName={WRAP_CLS}
        className={MENU_CLS}
        testId="unified-action-menu"
        onAnchorHidden={opts.onAnchorHidden}
      >
        <button type="button">row</button>
      </AnchoredMenuShell>
    </div>,
    { container: host },
  );
  const menu = screen.getByTestId('unified-action-menu');
  return {
    menu,
    rect: () => menu.getBoundingClientRect(),
    restore: () => { HTMLElement.prototype.getBoundingClientRect = original; unmount(); },
  };
}

function readShift(el: HTMLElement): number {
  const t = el.style.transform;
  const m = /translateX\((-?[\d.]+)px\)/.exec(t || '');
  return m ? Number.parseFloat(m[1]!) : 0;
}

describe('工具栏那条路:横向也要夹回框内', () => {
  it('菜单会越出框的左缘时,把它平移回来', () => {
    // 框 [200, 700];触发键靠框左侧,右缘对齐会把 300px 宽的菜单推到 -60
    const h = renderToolbarMenu({
      boundary: { left: 200, right: 700, top: 0, bottom: 800 },
      triggerLeft: 240, triggerWidth: 60, menuWidth: 300, menuHeight: 200,
    });
    const r = h.rect();
    h.restore();
    expect(r.left, `菜单左缘 ${r.left} 越过了框左缘 200`).toBeGreaterThanOrEqual(200);
  });

  it('放得下的时候一个像素都不许动(反向对照)', () => {
    // 触发键靠框右侧,右缘对齐后菜单完全在框内 —— 不该出现任何修正样式
    const h = renderToolbarMenu({
      boundary: { left: 200, right: 700, top: 0, bottom: 800 },
      triggerLeft: 620, triggerWidth: 60, menuWidth: 300, menuHeight: 200,
    });
    const shift = readShift(h.menu);
    const r = h.rect();
    h.restore();
    expect(shift, '放得下却被平移了').toBe(0);
    expect(r.left).toBe(380);
  });

  it('框比菜单还窄时限宽并内部滚动(`size`),不是硬塞出去', () => {
    // 框只有 260 宽,菜单 300 —— 平移救不了,必须限宽
    const h = renderToolbarMenu({
      boundary: { left: 200, right: 460, top: 0, bottom: 800 },
      triggerLeft: 380, triggerWidth: 60, menuWidth: 300, menuHeight: 200,
    });
    const maxW = h.menu.style.maxWidth;
    const minW = h.menu.style.minWidth;
    const overflowX = h.menu.style.overflowX;
    h.restore();
    expect(maxW, '没有限宽,菜单只能溢出').toBeTruthy();
    expect(Number.parseFloat(maxW)).toBeLessThanOrEqual(260);
    expect(Number.parseFloat(maxW)).toBeGreaterThan(0);
    expect(overflowX, '限了宽却不给滚动 = 内容被吃掉').toBe('auto');
    /*
     * 下限必须跟着一起降。CSS 的最终宽度是 `max(min-width, min(max-width, width))`
     * —— `min-width` 永远最后生效,压得过 `max-width`。既有样式表里正好有
     * `.chrome-share-menu--unified .chrome-unified-popover { min-width: min(248px, …) }`,
     * 只写 `max-width` 是**完全无效**的:无头 Chrome 里实测,限到 244px 之后
     * 量出来仍旧是 248px,一个像素没动。
     *
     * jsdom 不做层叠,这里只能钉「两条一起写了」这个结构;真的压不压得住
     * 由浏览器实测负责(`.tmp/popover-browser-claims.html` 的 C 段)。
     */
    expect(minW, '只降了上限没降下限 —— min-width 会把它顶回去').toBe(maxW);
  });

  it('下方空间不够时限高并内部滚动(`size` 的竖轴)', () => {
    // 框底在 420,菜单从 y=321 起要 200 高 —— 只剩 ~99
    const h = renderToolbarMenu({
      boundary: { left: 200, right: 700, top: 0, bottom: 420 },
      triggerLeft: 620, triggerWidth: 60, menuWidth: 300, menuHeight: 200,
    });
    const maxH = h.menu.style.maxHeight;
    const overflowY = h.menu.style.overflowY;
    h.restore();
    expect(maxH, '没有限高').toBeTruthy();
    expect(Number.parseFloat(maxH)).toBeLessThanOrEqual(420 - 300);
    expect(overflowY).toBe('auto');
  });
});

describe('夹取框要认全:两条轴 + 多层嵌套', () => {
  it('只有 `overflow-y: hidden` 的祖先也算裁剪框(现在只看了 overflow-x)', () => {
    const h = renderToolbarMenu({
      boundary: { left: 200, right: 700, top: 0, bottom: 420 },
      triggerLeft: 620, triggerWidth: 60, menuWidth: 300, menuHeight: 200,
      overflowAxis: 'y',
    });
    const maxH = h.menu.style.maxHeight;
    h.restore();
    expect(maxH, 'overflow-y 的祖先没被认成裁剪框').toBeTruthy();
    expect(Number.parseFloat(maxH)).toBeLessThanOrEqual(120);
  });

  it('多层裁剪祖先取**交集**,不是只认最近的那一个', () => {
    // 外框 [100, 900],内框 [300, 700] —— 内框更紧,但内框是 overflow:visible,
    // 外面还有一层更紧的。构造:近的框松(宽),远的框紧。
    const outer = document.createElement('div');
    outer.className = 'boundary';
    outer.style.overflowX = 'hidden';
    outer.getBoundingClientRect = () => box(300, 0, 400, 800); // [300,700] 紧
    const inner = document.createElement('div');
    inner.style.overflowX = 'hidden';
    inner.getBoundingClientRect = () => box(100, 0, 800, 800); // [100,900] 松
    outer.appendChild(inner);
    document.body.appendChild(outer);

    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.classList.contains('share-menu-popover')) {
        const shift = readShift(this);
        return box(340 + 60 - 300 + shift, 300, 300, 200);
      }
      if (this.classList.contains('share-menu')) return box(340, 300, 60, 21);
      return original.call(this);
    };
    render(
      <div className={WRAP_CLS}>
        <AnchoredMenuShell anchorId={null} wrapperClassName={WRAP_CLS} className={MENU_CLS} testId="unified-action-menu">
          <button type="button">row</button>
        </AnchoredMenuShell>
      </div>,
      { container: inner },
    );
    const menu = screen.getByTestId('unified-action-menu');
    const r = menu.getBoundingClientRect();
    HTMLElement.prototype.getBoundingClientRect = original;
    // 只认最近的(松的 [100,900])→ 菜单左缘 100,不会被夹;
    // 取交集(紧的 [300,700])→ 必须夹到 >= 300
    expect(r.left, `只认了最近那层裁剪祖先 (${r.left}),没和外层取交集`).toBeGreaterThanOrEqual(300);
  });
});

/* ------------------------------------------------------------------ *
 * 锚点看不见了就收起来
 * ------------------------------------------------------------------ *
 * 产品 2026-08-27:「我们会话里的这个卡片的弹出框, 会随着对话上下滚动的哈,
 * 这个别忘了, 在界面中如果原 button 不可见, 就自动收起来 下拉框吧?」
 *
 * 判据抄 Floating UI 的 `hide({ strategy: 'referenceHidden' })`:
 *   · 夹取框 = **裁剪祖先 ∩ 视口**(不是只看视口)—— 锚点滚出聊天流可视区、
 *     但坐标仍落在视口矩形里,是最常见的一种,只按视口判会漏。
 *   · 阈值 = **整个越过某一条边**才算不可见;露出一条缝仍算可见(Floating UI
 *     的 `isAnySideFullyClipped`,没有比例阈值)。
 *   · 锚点**从 DOM 里没了**(消息被虚拟化 / 文件被关)单独判,不靠几何 ——
 *     detached 元素的 rect 全 0,靠算术兜出来是巧合,不可依赖。
 */
describe('锚点不可见 → 发出收起信号', () => {
  const ANCHOR_ID = 'publish:landing.html';

  function mountAnchored(opts: {
    scrollRect: { left: number; right: number; top: number; bottom: number };
    anchorRect: { left: number; top: number; width: number; height: number } | null;
    onAnchorHidden: () => void;
  }) {
    const scroller = document.createElement('div');
    scroller.className = 'boundary';
    scroller.style.overflowY = 'auto';
    scroller.getBoundingClientRect = () =>
      box(opts.scrollRect.left, opts.scrollRect.top, opts.scrollRect.right - opts.scrollRect.left, opts.scrollRect.bottom - opts.scrollRect.top);
    document.body.appendChild(scroller);

    if (opts.anchorRect) {
      const anchor = document.createElement('button');
      anchor.setAttribute('data-artifact-anchor', ANCHOR_ID);
      const a = opts.anchorRect;
      anchor.getBoundingClientRect = () => box(a.left, a.top, a.width, a.height);
      scroller.appendChild(anchor);
    }

    render(
      <AnchoredMenuShell
        anchorId={ANCHOR_ID}
        wrapperClassName={WRAP_CLS}
        className={MENU_CLS}
        testId="unified-action-menu"
        onAnchorHidden={opts.onAnchorHidden}
      >
        <button type="button">row</button>
      </AnchoredMenuShell>,
    );
  }

  it('锚点在滚动容器可视区内 → **不**收起(正向对照)', () => {
    const onAnchorHidden = vi.fn();
    mountAnchored({
      scrollRect: { left: 0, right: 400, top: 100, bottom: 600 },
      anchorRect: { left: 100, top: 300, width: 60, height: 21 },
      onAnchorHidden,
    });
    // 对照的前提:菜单确实开着。没有这一条,菜单压根没渲染时下面也会「绿」。
    expect(screen.queryByTestId('unified-action-menu'), '菜单没开,这条对照是空的').not.toBeNull();
    expect(onAnchorHidden).not.toHaveBeenCalled();
  });

  it('锚点整个滚到滚动容器上方 → 收起', () => {
    const onAnchorHidden = vi.fn();
    mountAnchored({
      scrollRect: { left: 0, right: 400, top: 100, bottom: 600 },
      // 锚点 bottom=71 < 容器 top=100:整个在容器上边界之外
      anchorRect: { left: 100, top: 50, width: 60, height: 21 },
      onAnchorHidden,
    });
    expect(onAnchorHidden).toHaveBeenCalled();
  });

  it('锚点滚出容器但仍在视口矩形内 → 也要收起(只按视口判会漏)', () => {
    const onAnchorHidden = vi.fn();
    mountAnchored({
      // 容器只占视口中段;锚点在容器下方、但仍在 window 里
      scrollRect: { left: 0, right: 400, top: 100, bottom: 300 },
      anchorRect: { left: 100, top: 420, width: 60, height: 21 },
      onAnchorHidden,
    });
    expect(onAnchorHidden, '按视口判会认为它还可见').toHaveBeenCalled();
  });

  it('只露出一条缝仍算可见 → 不收起(没有比例阈值)', () => {
    const onAnchorHidden = vi.fn();
    mountAnchored({
      scrollRect: { left: 0, right: 400, top: 100, bottom: 600 },
      // 锚点 top=90 bottom=111:上面被切了 10px,下面还有 11px 露在容器里
      anchorRect: { left: 100, top: 90, width: 60, height: 21 },
      onAnchorHidden,
    });
    expect(onAnchorHidden, '部分可见被误判成不可见').not.toHaveBeenCalled();
  });

  it('锚点从 DOM 里没了(消息被虚拟化 / 文件被关)→ 收起', () => {
    const onAnchorHidden = vi.fn();
    const scroller = document.createElement('div');
    scroller.className = 'boundary';
    scroller.style.overflowY = 'auto';
    scroller.getBoundingClientRect = () => box(0, 100, 400, 500);
    document.body.appendChild(scroller);
    const anchor = document.createElement('button');
    anchor.setAttribute('data-artifact-anchor', ANCHOR_ID);
    anchor.getBoundingClientRect = () => box(100, 300, 60, 21);
    scroller.appendChild(anchor);

    render(
      <AnchoredMenuShell anchorId={ANCHOR_ID} wrapperClassName={WRAP_CLS} className={MENU_CLS}
        testId="unified-action-menu" onAnchorHidden={onAnchorHidden}>
        <button type="button">row</button>
      </AnchoredMenuShell>,
    );
    expect(onAnchorHidden, '还在 DOM 里就不该收').not.toHaveBeenCalled();

    // 把锚点摘掉,再触发一次重算(真实里是滚动/ResizeObserver 触发的)
    act(() => {
      anchor.remove();
      window.dispatchEvent(new Event('resize'));
    });
    expect(onAnchorHidden, '锚点没了却还开着').toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ *
 * 修正必须幂等
 * ------------------------------------------------------------------ *
 * 修正量加在浮层身上,所以下一次量到的盒子**已经带着上一次的修正**。直接拿它
 * 再算一次,会得出「现在不越界了 → 修正归零 → 又越界了」的来回翻:静止时看不
 * 出来(只在 rAF 那一次重算),一滚动就开始抖。
 *
 * `measure` 因此先把已生效的 shift 减掉,还原成「没修正时它会在哪儿」。这一条
 * 钉的就是那个还原。
 */
describe('重复重算不会把自己抖回去', () => {
  it('连续三次重算,修正量和最终位置都不变', () => {
    const h = renderToolbarMenu({
      boundary: { left: 200, right: 700, top: 0, bottom: 800 },
      triggerLeft: 240, triggerWidth: 60, menuWidth: 300, menuHeight: 200,
    });
    const first = { shift: readShift(h.menu), left: h.rect().left };
    // 真实里每次滚动都会重跑一遍 measure
    for (let i = 0; i < 3; i++) {
      act(() => { window.dispatchEvent(new Event('resize')); });
    }
    const after = { shift: readShift(h.menu), left: h.rect().left };
    h.restore();
    expect(first.shift, '第一轮就没夹住').not.toBe(0);
    expect(after.shift, `重算把修正抖没了:${first.shift} → ${after.shift}`).toBe(first.shift);
    expect(after.left).toBe(first.left);
    expect(after.left).toBeGreaterThanOrEqual(200);
  });
});

/* ------------------------------------------------------------------ *
 * 走了就是走了 —— 不许回来
 * ------------------------------------------------------------------ *
 * 用户 2026-08-27:「如果 publish 按钮出画面再回来, 就不再重新显示吧,
 * 感觉这里重新显示会有 bug」。
 *
 * 要区分的是两种「现在拿不到锚点」,它们的正确行为相反:
 *  · **从来没出现过,在等** —— 点卡片会先把文件开进工作区,菜单要等 viewer
 *    挂好、`canShare` 翻真才出现,这中间锚点可能还没进 DOM。这一档要**继续等**。
 *  · **出现过、又走了** —— 消息被虚拟化、卡片重渲染、文件被关。这一档要**收掉**,
 *    而且回来也不自己恢复。
 *
 * 两者的分界就是「有没有解析到过」:一旦解析到,组件就攥着那个节点,它离开
 * 文档时 `isConnected` 立刻为假 —— 这是个确定信号,不是超时猜的。
 */
describe('锚点走了就不许再画', () => {
  const ANCHOR_ID2 = 'publish:gone.html';

  function mountWithAnchor(present: boolean) {
    const onAnchorHidden = vi.fn();
    if (present) {
      const a = document.createElement('button');
      a.setAttribute('data-artifact-anchor', ANCHOR_ID2);
      a.getBoundingClientRect = () => box(100, 300, 60, 21);
      document.body.appendChild(a);
    }
    render(
      <AnchoredMenuShell anchorId={ANCHOR_ID2} wrapperClassName={WRAP_CLS} className={MENU_CLS}
        testId="unified-action-menu" onAnchorHidden={onAnchorHidden}>
        <button type="button">row</button>
      </AnchoredMenuShell>,
    );
    return { onAnchorHidden };
  }

  it('锚点离开文档后,菜单不再渲染 —— 即使又插回来一枚同 id 的', () => {
    const { onAnchorHidden } = mountWithAnchor(true);
    expect(screen.queryByTestId('unified-action-menu'), '一开始就没画,这条对照是空的').not.toBeNull();

    const anchor = document.querySelector(`[data-artifact-anchor="${ANCHOR_ID2}"]`)!;
    act(() => {
      anchor.remove();
      window.dispatchEvent(new Event('resize'));
    });
    expect(onAnchorHidden, '锚点没了却没发信号').toHaveBeenCalled();
    expect(
      screen.queryByTestId('unified-action-menu'),
      '锚点已经离开文档,却还照着那个游离节点画',
    ).toBeNull();

    // 卡片重新渲染,插回来一枚同 id 的按钮 —— 菜单**不许**自己回来
    act(() => {
      const fresh = document.createElement('button');
      fresh.setAttribute('data-artifact-anchor', ANCHOR_ID2);
      fresh.getBoundingClientRect = () => box(100, 300, 60, 21);
      document.body.appendChild(fresh);
      window.dispatchEvent(new Event('resize'));
    });
    expect(
      screen.queryByTestId('unified-action-menu'),
      '锚点回来之后菜单自己又冒出来了 —— 正是用户报的那个形状',
    ).toBeNull();
  });

  it('**从来没出现过**时继续等,不发收起信号(反向对照)', () => {
    const { onAnchorHidden } = mountWithAnchor(false);
    // 还没画出来是对的 —— 但这是「在等」,不是「已经收掉」
    expect(screen.queryByTestId('unified-action-menu')).toBeNull();
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(
      onAnchorHidden,
      '把「还没出现」误判成「已经走了」—— 首次打开的等待路径会被一起关掉',
    ).not.toHaveBeenCalled();
  });

  it('等到锚点出现(anchorId 换成已在 DOM 里的那个)时照常打开(反向对照)', () => {
    const a = document.createElement('button');
    a.setAttribute('data-artifact-anchor', ANCHOR_ID2);
    a.getBoundingClientRect = () => box(100, 300, 60, 21);
    document.body.appendChild(a);
    render(
      <AnchoredMenuShell anchorId={ANCHOR_ID2} wrapperClassName={WRAP_CLS} className={MENU_CLS}
        testId="unified-action-menu">
        <button type="button">row</button>
      </AnchoredMenuShell>,
    );
    expect(screen.queryByTestId('unified-action-menu'), '锚点在 DOM 里却没开').not.toBeNull();
  });
});
