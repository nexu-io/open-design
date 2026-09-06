// @vitest-environment jsdom
/**
 * 预览区那块菜单被搬到产物卡按钮旁边时,**只换位置,不换东西**。
 *
 * 产品 2026-08-27 推翻了卡上自制的窄浮层:「为啥不直接复用现在那个分享弹窗??」
 * 于是卡上那两枚胶囊不再有自己的菜单,改成让预览区把**它本来那块**开在按钮旁边。
 *
 * 这一层只负责壳:给了锚点就 portal 到 body 并按锚点定位,没给就原地渲染。
 * 内容(分享面板 / 导出面板)仍旧长在 `FileViewer` 里,一份实现。
 *
 * ⚠️ 最容易出事的是**层叠上下文与祖先选择器**:
 *   · `.chrome-share-menu .share-menu-popover { top: calc(100% + 6px); right: 0 }`
 *   · `.chrome-share-menu--unified .chrome-unified-popover { width…; background…; box-shadow… }`
 * 两条都是**后代选择器**。portal 出去时如果不把那两个祖先类一起带走,菜单会
 * 丢掉宽度、内边距、底色和阴影 —— 而 CSS 规则文本一个字没改,光读代码看不出来。
 * 所以这里钉住「祖先类必须跟着走」,真实层叠另外用 headless Chrome 量。
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AnchoredMenuShell } from '../../../src/components/chat/AnchoredMenuShell';

afterEach(() => {
  cleanup();
  /*
   * `anchorAt` 直接往 body 上挂,`cleanup()` 只收 testing-library 自己建的容器 ——
   * 不手动清掉,上一条用例的锚点会留在文档里,而 `findAnchor` 取的是**第一个**
   * 匹配,于是下一条量到的是上一条那枚按钮的位置(写这组时被它骗过一次:
   * 「翻到上面」那条一直报 below)。
   */
  document.querySelectorAll('[data-artifact-anchor]').forEach((el) => el.remove());
  document.querySelectorAll('.pane').forEach((el) => el.remove());
});

const ANCHOR_ID = 'publish:landing.html';

function anchorAt(box: { top: number; left: number; width?: number; height?: number }) {
  const el = document.createElement('button');
  el.setAttribute('data-artifact-anchor', ANCHOR_ID);
  const width = box.width ?? 60;
  const height = box.height ?? 21;
  const rect = {
    x: box.left,
    y: box.top,
    left: box.left,
    top: box.top,
    right: box.left + width,
    bottom: box.top + height,
    width,
    height,
  };
  el.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

function shell(anchorId: string | null) {
  return (
    <AnchoredMenuShell
      anchorId={anchorId}
      wrapperClassName="share-menu chrome-share-menu chrome-share-menu--unified"
      className="share-menu-popover chrome-unified-popover"
      testId="unified-action-menu"
    >
      <button type="button" data-testid="a-row">row</button>
    </AnchoredMenuShell>
  );
}

describe('AnchoredMenuShell', () => {
  it('没有锚点时**原地**渲染,和搬动之前一模一样', () => {
    const { container } = render(<div className="share-menu chrome-share-menu chrome-share-menu--unified">{shell(null)}</div>);
    const menu = screen.getByTestId('unified-action-menu');
    expect(menu.className).toBe('share-menu-popover chrome-unified-popover');
    expect(menu.getAttribute('role')).toBe('menu');
    // 留在原地 = 还在调用方的子树里,没有 portal
    expect(container.contains(menu)).toBe(true);
    expect(menu.parentElement).not.toBe(document.body);
    // 原地形态不该带落位标记 —— 位置由那两条既有的后代选择器管
    expect(menu.getAttribute('data-placement')).toBeNull();
    /*
     * 预览区那块菜单靠 `.chrome-share-menu .share-menu-popover { right: 0 }` 贴在
     * 它自己那枚触发键下面 —— **横向修正一点都不许漏到这条路上**。
     * 漏了的形态:多包一层、或者给菜单挂上内联偏移。两样都要挡住,否则
     * 「搬走那份的修正」会把工具栏下面那份也挪歪。
     * (这一条是补的:第一版只查了类名,一次故意的越界改动没被它拦下来。)
     */
    expect(menu.parentElement, '原地形态多包了一层').toBe(container.firstElementChild);
    expect(menu.getAttribute('style')).toBeNull();
    expect((menu.parentElement as HTMLElement).getAttribute('style')).toBeNull();
  });

  it('有锚点时 portal 到 body,并且**把祖先类一起带走**', () => {
    anchorAt({ top: 300, left: 600 });
    render(shell(ANCHOR_ID));

    const menu = screen.getByTestId('unified-action-menu');
    expect(menu.parentElement?.parentElement).toBe(document.body);
    // 菜单自己的类名一个字不改 —— 内容是同一块
    expect(menu.className).toBe('share-menu-popover chrome-unified-popover');
    // 祖先类跟着走,否则 `.chrome-share-menu .share-menu-popover` 一族集体失配
    const wrapper = menu.parentElement as HTMLElement;
    for (const cls of ['share-menu', 'chrome-share-menu', 'chrome-share-menu--unified']) {
      expect(wrapper.classList.contains(cls), `portal 之后丢了祖先类 ${cls}`).toBe(true);
    }
    // 里面的行原样在
    expect(screen.getByTestId('a-row')).toBeTruthy();
  });

  it('包裹盒**盖在按钮上**:既有的 `top: calc(100% + 6px)` 因此落在按钮下缘', () => {
    const anchor = anchorAt({ top: 300, left: 600, width: 60, height: 21 });
    render(shell(ANCHOR_ID));
    const wrapper = screen.getByTestId('unified-action-menu').parentElement as HTMLElement;
    const rect = anchor.getBoundingClientRect();
    expect(wrapper.style.position).toBe('fixed');
    expect(Number.parseFloat(wrapper.style.top)).toBe(rect.top);
    // 横向可以为了不越界而平移(见下面「横轴不许跑出夹取框」),这里的锚点
    // 放在栏中央、菜单放得下,所以不该被移动。
    expect(Number.parseFloat(wrapper.style.left)).toBe(rect.left);
    expect(Number.parseFloat(wrapper.style.width)).toBe(rect.width);
    expect(Number.parseFloat(wrapper.style.height)).toBe(rect.height);
  });

  it('按钮在视口中段 → 往下开', () => {
    anchorAt({ top: 300, left: 600 });
    render(shell(ANCHOR_ID));
    expect(screen.getByTestId('unified-action-menu').getAttribute('data-placement')).toBe('below');
  });

  it('按钮贴着视口下缘 → 翻到上面', () => {
    anchorAt({ top: (window.innerHeight || 768) - 40, left: 600 });
    render(shell(ANCHOR_ID));
    expect(screen.getByTestId('unified-action-menu').getAttribute('data-placement')).toBe('above');
  });

  it('锚点还没挂上来(文件正在打开)时不硬画在角上', () => {
    // 卡上点一下会先把文件开进工作区,菜单要等 viewer 挂好 —— 这中间锚点可能还在
    render(shell('publish:not-in-dom-yet'));
    expect(screen.queryByTestId('unified-action-menu'), '锚点找不到就不该先画一块出来').toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * 横轴:不许跑出夹取框
 * ------------------------------------------------------------------ *
 * 2026-08-27 真机:菜单开在聊天栏左半边那张卡上,左侧三分之一被切掉,
 * 「…OpenDesign 托管)」「…分享链接」「…Vercel」。用户原话:「这弹窗都跑外面去了..」
 *
 * 成因是**故意保留**的那条既有 CSS:`.chrome-share-menu .share-menu-popover
 * { right: 0 }`。在预览区那条宽工具栏上它是对的(触发键本来就靠右);搬到窄聊天栏
 * 里一张卡的右上角之后,把一块 ~271px 的菜单按右缘对齐到一枚已经靠左的按钮,
 * 左边自然就出去了。
 *
 * 竖轴早有「放不下就翻面」;横轴要有对应的一条:放不下就**平移**回来。
 *
 * 夹到哪个框?—— **锚点本来会被谁裁掉,就夹到谁**。这里是 `.pane`
 * (`overflow: hidden`)。夹到视口是不够的:真机量过,视口夹取之后菜单仍旧压在
 * 聊天栏左边那条 chrome 上(measure-inline.mjs:`insetFromPaneLeft: -48`)。
 */
describe('横轴不许跑出夹取框', () => {
  const MENU_W = 271;
  const PANE = { left: 56, right: 401 };
  const PAD = 8;

  /**
   * jsdom 不排版,所以这里**模拟那唯一一条参与的 CSS**:菜单右缘对齐包裹盒右缘
   * (`right: 0`)。包裹盒的 left 由组件写在内联样式上,菜单的盒子就从它推出来。
   * 真实排版下的坐标另外用 headless Chrome 走 CDP 量,不在这一层冒充。
   */
  function stubLayout(paneEl: HTMLElement, anchorEl: HTMLElement, anchorBox: { left: number; width: number }) {
    const rect = (left: number, width: number, top = 300, height = 21) => {
      const box = { x: left, y: top, left, top, right: left + width, bottom: top + height, width, height };
      return { ...box, toJSON: () => box } as DOMRect;
    };
    paneEl.getBoundingClientRect = () => rect(PANE.left, PANE.right - PANE.left, 0, 800);
    anchorEl.getBoundingClientRect = () => rect(anchorBox.left, anchorBox.width);
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.classList.contains('share-menu-popover')) {
        const host = this.parentElement as HTMLElement | null;
        const hostLeft = Number.parseFloat(host?.style.left ?? '0') || 0;
        const hostWidth = Number.parseFloat(host?.style.width ?? '0') || 0;
        // right: 0 —— 菜单右缘贴着包裹盒右缘
        return rect(hostLeft + hostWidth - MENU_W, MENU_W);
      }
      return original.call(this);
    };
    return () => { HTMLElement.prototype.getBoundingClientRect = original; };
  }

  function openAt(anchorLeft: number, anchorWidth = 42) {
    const pane = document.createElement('div');
    pane.className = 'pane';
    // 这是「会裁掉它」的那个祖先 —— 组件靠 overflow-x 找它,不认类名
    pane.style.overflowX = 'hidden';
    const anchor = document.createElement('button');
    anchor.setAttribute('data-artifact-anchor', ANCHOR_ID);
    pane.appendChild(anchor);
    document.body.appendChild(pane);
    const restore = stubLayout(pane, anchor, { left: anchorLeft, width: anchorWidth });
    render(shell(ANCHOR_ID));
    const menu = screen.getByTestId('unified-action-menu');
    const wrapper = menu.parentElement as HTMLElement;
    const box = menu.getBoundingClientRect();
    restore();
    return { wrapper, menu, left: box.left, right: box.right };
  }

  it('靠左那张卡:菜单被平移回栏内,不再切掉左边', () => {
    // 真机那次的形状:按钮在栏左半边,右缘对齐会把菜单推到 -60
    const { left, right } = openAt(170);
    expect(left, `菜单左缘 ${left},夹取框左缘 ${PANE.left}`).toBeGreaterThanOrEqual(PANE.left + PAD - 0.5);
    expect(right).toBeLessThanOrEqual(PANE.right - PAD + 0.5);
  });

  it('夹到的是**聊天栏**,不是视口 —— 只夹视口仍旧压在左边那条 chrome 上', () => {
    const { left } = openAt(170);
    // 只夹视口的话这里会是 8(真机量过);夹到栏是 64
    expect(left).toBeGreaterThanOrEqual(PANE.left);
  });

  it('靠右那张卡放得下:一像素都不许动(反向对照)', () => {
    const anchorLeft = 334;
    const { wrapper, left } = openAt(anchorLeft);
    expect(Number.parseFloat(wrapper.style.left), '放得下却被挪了').toBe(anchorLeft);
    expect(left).toBeGreaterThanOrEqual(PANE.left + PAD - 0.5);
  });

  it('右侧越界同样往回收(左右两边都管)', () => {
    // 把按钮推到栏右缘之外,菜单右缘就会越过夹取框
    const { right } = openAt(PANE.right + 60);
    expect(right).toBeLessThanOrEqual(PANE.right - PAD + 0.5);
  });

  it('没有会裁它的祖先时退回视口,不是不夹', () => {
    const anchor = document.createElement('button');
    anchor.setAttribute('data-artifact-anchor', ANCHOR_ID);
    document.body.appendChild(anchor);
    const rect = (left: number, width: number) => {
      const box = { x: left, y: 300, left, top: 300, right: left + width, bottom: 321, width, height: 21 };
      return { ...box, toJSON: () => box } as DOMRect;
    };
    anchor.getBoundingClientRect = () => rect(40, 42);
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.classList.contains('share-menu-popover')) {
        const host = this.parentElement as HTMLElement | null;
        const hostLeft = Number.parseFloat(host?.style.left ?? '0') || 0;
        const hostWidth = Number.parseFloat(host?.style.width ?? '0') || 0;
        return rect(hostLeft + hostWidth - MENU_W, MENU_W);
      }
      return original.call(this);
    };
    render(shell(ANCHOR_ID));
    const box = screen.getByTestId('unified-action-menu').getBoundingClientRect();
    HTMLElement.prototype.getBoundingClientRect = original;
    expect(box.left).toBeGreaterThanOrEqual(PAD - 0.5);
  });
});
