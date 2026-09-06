/**
 * 把**一块已经存在的菜单**搬到某枚按钮旁边开 —— 只换位置,不换东西。
 *
 * ## 为什么是这个形状
 *
 * 产品 2026-08-27:产物卡上那两枚胶囊点开的,必须就是预览区现在那两块菜单
 * (「为啥不直接复用现在那个分享弹窗??」「导出这个样式也不对呢, 为啥不直接复用?」),
 * 只是位置要贴着按钮(「动态根据上下空间判断是显示在按钮上面还是下面」)。
 *
 * 两条路走不通,所以选了第三条:
 *  · **把菜单抽成共享组件、两处各挂一份** —— 那块分享面板吃三十多个 viewer 状态
 *    (`filePublished` / `publishedFileUrl` / `sharePageUrl` / 部署配置 / 正文……)
 *    和二十来个 handler。卡上要凑齐这些,等于把 viewer 的取数再实现一遍,
 *    最后是两份状态、两份菜单 —— 正是这次要消掉的东西。
 *  · **把菜单整块复制到卡上** —— 同上,而且更糟。
 *  · ✅ **菜单留在原处,让它换个地方开**。JSX 一行不动,只是外面套上这层壳:
 *    给了锚点就 portal 到 body 并按锚点定位,没给就原地渲染。
 *    一份实现,改一处两处都变。
 *
 * ## 祖先类必须跟着走
 *
 * 菜单的宽度、内边距、底色、阴影、以及「贴在触发键下面」这件事,全写在**后代
 * 选择器**上(`shell.css`):
 *
 *     .chrome-share-menu .share-menu-popover        { top: calc(100% + 6px); right: 0 }
 *     .chrome-share-menu--unified .chrome-unified-popover { width; min/max-width; padding;
 *                                                          border-radius; background; box-shadow }
 *
 * portal 出去时如果只搬那个 `.share-menu-popover`,这些规则**集体失配** ——
 * 而 CSS 文本一个字没改,读代码完全看不出来,页面上是一块没有底色、没有宽度的
 * 裸菜单。所以 `wrapperClassName` 把那两个祖先类一起带出去,包裹盒**盖在按钮的
 * 矩形上**(同位置同尺寸),于是 `top: calc(100% + 6px); right: 0` 原封不动地
 * 就得到「贴在按钮下缘、右缘对齐」——既有的 CSS 继续干它本来的活。
 *
 * 往上翻的那一档由 `[data-placement="above"]` 覆写(见 `AnchoredMenuShell.module.css`)。
 *
 * ## 两条路都要夹,不是只夹搬走的那一份
 *
 * 2026-08-27 用户第二次报「这个会超出去的问题怎么还没修好?」,配图是**预览区
 * 工具栏**上那枚「发布」点开的菜单被切掉一截。原因就在这层壳里:`anchorId`
 * 为空时它**直接 `return menu`**,既不 portal 也不量任何东西 —— 横向修正只
 * 覆盖了产物卡那条路,工具栏那条路从来没被修过。
 *
 * 现在两条路都过同一套测量,只是**修正落在不同的盒子上**:
 *  · 搬走那份:加在**包裹盒**的 `left` 上(包裹盒不可见也不吃事件,整体平移,
 *    菜单自己的 `right: 0` 一个字不用改)。
 *  · 原地那份:没有包裹盒可挪,加在**菜单自己**的 `transform: translateX()` 上。
 *    `.share-menu-popover` / `.chrome-unified-popover` 上没有任何 transform 或
 *    动画(查过),不会打架。
 *
 * **放得下就一个字节都不写。** 产品当初要求工具栏这条路「和搬动之前逐字一致」,
 * 所以修正是按需的:不越界时既不加 `transform` 也不加 `max-*`,DOM 和以前一样。
 *
 * ## 锚点看不见了就收起来
 *
 * 产品 2026-08-27:「在界面中如果原 button 不可见, 就自动收起来 下拉框吧?」
 * 壳这一层只做**可逆的那一半** —— `visibility: hidden` + `pointer-events: none`
 * (Floating UI 的 `hide` 和 Radix 的 `hideWhenDetached` 都是这么落的:留在
 * DOM 里,滚回来自己就回来了)。真要**关掉**是调用方的决定,走 `onAnchorHidden`。
 * 两者不冲突:先视觉隐藏,同一帧把信号交给调用方,由它决定关不关。
 *
 * ## 层位
 *
 * portal 到 body 之后,菜单不再被 `.artifact-card-acts`(`position:absolute;
 * z-index:2`,自成层叠上下文)困住;层位取 `--z-menu`,和 `.od-select-menu`
 * 同一档,在提示层 `--z-hint` 之上 —— 人主动打开的面板不该被一条没人要求的
 * 提示盖住(2026-08-27 用户截图)。
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useAnchoredPopover } from '../../hooks/useAnchoredPopover';
import styles from './AnchoredMenuShell.module.css';

/** 卡上那两枚胶囊各自的锚点属性;`FileViewer` 靠它把菜单找回按钮身边。 */
export const ARTIFACT_ANCHOR_ATTR = 'data-artifact-anchor';

export function artifactAnchorId(
  kind: 'publish' | 'export',
  name: string,
  scope?: string,
): string {
  return scope ? `${kind}:${scope}:${name}` : `${kind}:${name}`;
}

/**
 * 从计算样式里把 `translateX` 读出来 —— 原地那条路的修正就落在这儿。
 *
 * 浏览器把 `transform` 归一成 `matrix(a,b,c,d,tx,ty)`(有 3D 分量时是
 * `matrix3d`,平移在第 13 个);jsdom 不归一,原样回吐 `translateX(67px)`。
 * 三种形态都认,因为测试跑在 jsdom、真机跑在 Blink。
 */
function readTranslateX(el: HTMLElement | null): number {
  if (!el) return 0;
  let t = '';
  try {
    t = window.getComputedStyle(el).transform || '';
  } catch {
    t = '';
  }
  if (!t || t === 'none') {
    // jsdom 有时连 computed 都不给,退回内联值
    t = el.style.transform || '';
  }
  const m3 = /matrix3d\(([^)]+)\)/.exec(t);
  if (m3) return Number.parseFloat(m3[1]!.split(',')[12] ?? '0') || 0;
  const m = /matrix\(([^)]+)\)/.exec(t);
  if (m) return Number.parseFloat(m[1]!.split(',')[4] ?? '0') || 0;
  const tx = /translateX\((-?[\d.]+)px\)/.exec(t);
  if (tx) return Number.parseFloat(tx[1]!) || 0;
  return 0;
}

function findAnchor(anchorId: string | null): HTMLElement | null {
  if (!anchorId) return null;
  return document.querySelector<HTMLElement>(
    `[${ARTIFACT_ANCHOR_ATTR}="${CSS.escape(anchorId)}"]`,
  );
}

export function AnchoredMenuShell({
  anchorId,
  className,
  wrapperClassName,
  testId,
  portalRef,
  onAnchorHidden,
  children,
}: {
  /** null = 原地渲染(工具栏点开的那一条路)。位置修正**两条路都做**。 */
  anchorId: string | null;
  /** 菜单本体的类名 —— 原样照抄调用处,一个字都不改。 */
  className: string;
  /** 后代选择器依赖的那些祖先类,portal 时要一起带走。 */
  wrapperClassName: string;
  testId?: string;
  /** portal 出去那一份的引用 —— 调用方的「点在外面就关」要认它作「里面」。 */
  portalRef?: { current: HTMLDivElement | null };
  /**
   * 锚点已经看不见了(滚出裁剪框,或从 DOM 里没了)。壳自己已经把菜单视觉隐藏,
   * 这里是给调用方的信号 —— **要不要真的关掉是调用方的决定**,不是这层的。
   */
  onAnchorHidden?: () => void;
  children: ReactNode;
}) {
  /*
   * 锚点是**按 id 在文档里现查**的,不是点击时冻结的一个矩形:卡上点一下会先把
   * 文件开进工作区,菜单要等 viewer 挂好、`canShare` 翻真才出现,这中间聊天流
   * 可能已经滚过了。查元素还让位置能随滚动重算(`useAnchoredPopover` 自己会跟)。
   */
  const [anchor, setAnchor] = useState<HTMLElement | null>(() => findAnchor(anchorId));
  useEffect(() => {
    setAnchor(findAnchor(anchorId));
  }, [anchorId]);
  /*
   * 稳定的 ref,不是每次渲染新建的 `{ current: anchor }` —— 后者会让 hook 里的
   * `measure` 每帧换一个身份,布局 effect 于是每帧重跑并 setState,直接把
   * 「Maximum update depth exceeded」撞出来(写这段时踩过一次)。
   */
  const anchorRef = useRef<HTMLElement | null>(anchor);
  // 菜单本体的引用:横向修正要量它**真实的盒子**,因为它的横向位置来自既有 CSS
  // (`.chrome-share-menu .share-menu-popover { right: 0 }`),不是这里算出来的。
  const menuRef = useRef<HTMLDivElement | null>(null);
  /*
   * 原地那条路没有「锚点按钮」可查 —— 它的定位参照就是菜单自己的**定位父级**
   * (`.share-menu`,`position: relative`),既有 CSS 本来就是相对它排的。
   * 用 ref 回调而不是渲染期赋值:节点挂上的那一刻就能拿到,赶得上同一帧的
   * `useLayoutEffect`;渲染期读 `menuRef.current` 第一帧永远是 null。
   */
  const attachMenu = useCallback((el: HTMLDivElement | null) => {
    menuRef.current = el;
    if (!anchorId) anchorRef.current = el?.parentElement ?? null;
  }, [anchorId]);
  /** 搬走那份的包裹盒 —— 修正落在它的 `left` 上,要读回来就得认得它。 */
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const attachWrapper = useCallback((el: HTMLDivElement | null) => {
    wrapperRef.current = el;
    if (portalRef) portalRef.current = el;
  }, [portalRef]);
  /*
   * 「浮层身上现在有多少修正」—— 现读,不记账。两条路放的地方不一样:
   *  · 搬走那份:包裹盒的 `left` 被写成 `锚点 left + 修正`,所以拿它现在的
   *    **内联 left** 减去锚点现在的 left,就是它身上真实生效的修正。
   *    读内联样式而不是 `getBoundingClientRect()`:前者是「盒子现在被摆在哪儿」
   *    的真值,而且同一帧里连量两次也不会变 —— 没有重排,它就还没动。
   *    (后者在 jsdom 里恒为 0,量不出来。)
   *  · 原地那份:菜单自己的 `transform: translateX()`,从计算样式里读回来。
   * 每次渲染重新赋值即可 —— 它进的是 ref,不参与任何 effect 的依赖。
   */
  const readAppliedShift = useRef<() => number>(() => 0);
  readAppliedShift.current = () => {
    if (!anchorId) return readTranslateX(menuRef.current);
    const wrap = wrapperRef.current;
    const anchorEl = anchorRef.current;
    if (!wrap || !anchorEl) return 0;
    const placed = Number.parseFloat(wrap.style.left);
    if (!Number.isFinite(placed)) return 0;
    return placed - anchorEl.getBoundingClientRect().left;
  };
  if (anchorId) anchorRef.current = anchor;
  // 包裹盒盖在按钮上,所以它的尺寸就是按钮的尺寸;菜单相对它排。
  const rect = anchor?.getBoundingClientRect?.();
  const open = anchorId ? Boolean(anchor) : true;
  const { placement, inlineShift, maxInlineSize, maxBlockSize, anchorHidden } = useAnchoredPopover(
    open,
    anchorRef,
    menuRef,
    readAppliedShift,
    {
      // 分享面板最高,导出面板矮一些;只用来判上/下,不必精确。
      estimatedHeight: 320,
      /*
       * 只有搬走那份会翻面。原地那份的方向由既有 CSS 钉死在下面
       * (`.chrome-share-menu .share-menu-popover { top: calc(100% + 6px) }`),
       * 它连 `data-placement` 都不写 —— 给它算 `above` 只会让竖向预算配错方向。
       */
      flipEnabled: Boolean(anchorId),
    },
  );

  /*
   * 信号交给调用方 —— 在 effect 里发,不在渲染里发:渲染期 setState 别人的
   * 状态会撞 React 的「Cannot update a component while rendering a different
   * component」。`anchorHidden` 翻真时发一次,翻假时不发。
   */
  useEffect(() => {
    if (anchorHidden) onAnchorHidden?.();
  }, [anchorHidden, onAnchorHidden]);

  /*
   * 尺寸限制两条路都加在**菜单自己**身上(包裹盒是按钮那么大的,限它没意义)。
   * 限了宽/高就必须给滚动,否则等于把内容裁掉 —— 那正是这次要修的毛病。
   * 放得下时 `maxInlineSize` / `maxBlockSize` 是 null,这里一个字节都不写。
   */
  const sizeStyle: CSSProperties = {};
  if (maxInlineSize != null) {
    sizeStyle.maxWidth = maxInlineSize;
    /*
     * `min-width` **压得过** `max-width` —— CSS 的最终宽度是
     * `max(min-width, min(max-width, width))`,下限永远最后生效。
     *
     * 而既有样式表里正好有一条下限:
     *     .chrome-share-menu--unified .chrome-unified-popover { min-width: min(248px, …) }
     * 于是只写 `max-width` 完全没有效果 —— 在无头 Chrome 里实测过:限到 244px,
     * 量出来仍旧是 248px,一个像素没动。光读 CSS 文本看不出来这条反转。
     *
     * 所以限宽时必须同时把下限降到实际可用宽度。不限宽时一个字都不写,
     * 既有的 248px 下限继续管事(窄菜单不至于显得局促,那是它原本的用意)。
     */
    sizeStyle.minWidth = maxInlineSize;
    sizeStyle.overflowX = 'auto';
  }
  if (maxBlockSize != null) {
    sizeStyle.maxHeight = maxBlockSize;
    sizeStyle.overflowY = 'auto';
  }
  if (anchorHidden) {
    // 可逆的隐藏,不是卸载 —— 滚回来自己就回来了。`pointer-events` 一起关掉,
    // 免得子元素重新声明 `visibility: visible` 时它还在吃点击(Radix 同款)。
    sizeStyle.visibility = 'hidden';
    sizeStyle.pointerEvents = 'none';
  }

  const menu = (
    <div
      ref={attachMenu}
      className={className}
      role="menu"
      {...(anchorId ? { 'data-placement': placement } : {})}
      {...(testId ? { 'data-testid': testId } : {})}
      {...(anchorId
        ? Object.keys(sizeStyle).length > 0
          ? { style: sizeStyle }
          : {}
        : /*
           * 原地那条路没有包裹盒可挪,横向修正只能落在菜单自己的 `transform` 上。
           * 放得下(shift 0、无尺寸限制)时不写 `style`,DOM 与搬动之前逐字一致。
           */
          inlineShift !== 0 || Object.keys(sizeStyle).length > 0
          ? { style: { ...sizeStyle, transform: `translateX(${inlineShift}px)` } }
          : {})}
    >
      {children}
    </div>
  );

  if (!anchorId) return menu;
  /*
   * 拿不到锚点时什么都不画,但**两种拿不到的含义相反**,别混成一件事:
   *
   *  · `anchor === null` —— **从来没解析到过**。卡上点一下会先把文件开进工作区,
   *    菜单要等 viewer 挂好、`canShare` 翻真才出现,这中间锚点可能还没进 DOM。
   *    这一档是「在等」,不发收起信号,等它出现。
   *  · `anchor.isConnected === false` —— **解析到过,又离开了文档**(消息被虚拟化、
   *    卡片重渲染、文件被关)。这一档是「走了」:hook 已经在同一轮里发过
   *    `anchorHidden`,这里只要保证**不再照着那个游离节点画**。
   *
   * 后一条是用户 2026-08-27 要的那句「出画面再回来就不再重新显示」的落点:
   * 游离节点的 rect 是它离开前的旧坐标,照着画就是一块悬在半空、跟谁都对不上的
   * 菜单 —— 正是截图里那个样子。
   */
  if (!anchor || !rect) return null;
  if (anchor.isConnected === false) return null;

  return createPortal(
    <div
      ref={attachWrapper}
      className={`${wrapperClassName} ${styles.anchored}`}
      style={{
        position: 'fixed',
        top: rect.top,
        /*
         * 横向修正加在**包裹盒**上,不加在菜单上:包裹盒不可见也不吃事件,挪动它
         * 等于整体平移,而菜单自己的 `right: 0` 一个字不用改 —— 既有 CSS 继续
         * 干它本来的活。加在菜单上则要动 `transform`,会跟它自己的动画打架。
         */
        left: rect.left + inlineShift,
        width: rect.width,
        height: rect.height,
      }}
      data-anchored-menu={anchorId}
    >
      {menu}
    </div>,
    document.body,
  );
}
