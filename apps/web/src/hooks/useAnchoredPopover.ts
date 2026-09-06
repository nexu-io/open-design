import { useCallback, useLayoutEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';

export type AnchoredPlacement = 'above' | 'below';

/** 夹取框内缘留的余量 —— 菜单不贴死在框的边线上。 */
const INLINE_PAD = 8;

/** `contain` 里出现这几个值就会**裁剪**内容(`layout` / `style` 不裁)。 */
const CONTAIN_CLIPS = /\b(paint|strict|content)\b/;

export interface ClipRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function viewportRect(): ClipRect {
  return { left: 0, top: 0, right: window.innerWidth || 0, bottom: window.innerHeight || 0 };
}

/**
 * 「这枚锚点会被谁裁掉」——**所有**裁剪祖先取交集,再和视口取交集。
 *
 * 三条都是 2026-08-27 调研 Floating UI 的 `detectOverflow` 之后补的,原来那版
 * 各差一档:
 *
 *  1. **两条轴都要看**。原来只读 `overflow-x`,于是竖向那些 `overflow-y: auto`
 *     的滚动容器一个都没认出来 —— 浮层可以直接从聊天流底下捅出去。
 *     判据抄 Floating UI 的 `isOverflowElement`:`auto|scroll|overlay|hidden|clip`
 *     任一即可,顺带认 `contain: paint|strict|content`(它也裁,而且是硬裁,
 *     `overflow: visible` 覆盖不掉 —— 本仓库 `.split-focus .viewer` 就是这个)。
 *  2. **要一直走到顶,不是找到第一个就返回**。嵌套滚动容器里,最近的那个未必
 *     最紧;只认最近的,外层更窄的框就漏了。
 *  3. **和视口取交集**。祖先自己可能有一半在屏幕外。
 *
 * 按计算样式找而不是认类名:这是个通用组件,不该知道 `.pane` 是什么。
 * (仓库里另外三处浮层各自 `closest('.pane')` / `closest('.entry-main--scroll')`
 *  硬编码类名 —— 那是它们的事,别顺手统一。)
 */
export function clippingRect(anchor: HTMLElement): ClipRect {
  const clip = viewportRect();
  let node: HTMLElement | null = anchor.parentElement;
  while (node && node !== document.documentElement && node !== document.body) {
    let style: CSSStyleDeclaration | null = null;
    try {
      style = window.getComputedStyle(node);
    } catch {
      style = null;
    }
    if (style) {
      const scrolls = /auto|scroll|overlay|hidden|clip/.test(
        `${style.overflow}${style.overflowX}${style.overflowY}`,
      );
      const paints = CONTAIN_CLIPS.test(style.contain || '');
      if (scrolls || paints) {
        const rect = node.getBoundingClientRect();
        clip.left = Math.max(clip.left, rect.left);
        clip.top = Math.max(clip.top, rect.top);
        clip.right = Math.min(clip.right, rect.right);
        clip.bottom = Math.min(clip.bottom, rect.bottom);
      }
    }
    node = node.parentElement;
  }
  return clip;
}

/**
 * 「锚点已经整个被裁掉了」—— Floating UI 的 `hide({ strategy: 'referenceHidden' })`
 * 那一档:**任一条边整个越过去**才算不可见,露出一条缝仍算可见(它的
 * `isAnySideFullyClipped` 也没有比例阈值)。
 *
 * 用「整个越过」而不是「有交集」是有意的:滚动时锚点会连续地被切掉一部分,
 * 按面积比例判会在边界上抖动,一帧收起一帧展开。
 */
export function isFullyClipped(rect: DOMRect, clip: ClipRect): boolean {
  return (
    rect.bottom <= clip.top ||
    rect.top >= clip.bottom ||
    rect.right <= clip.left ||
    rect.left >= clip.right
  );
}

/**
 * 「这块面板**不受我们自己的限制**时有多高多宽」。
 *
 * 判据不能取被自己改过的量 —— 这是 2026-08-27 那个每帧一翻的死循环的根子:
 * `placement` 决定 `maxHeight`,而量到的高度又被 `maxHeight` 改小,回头改变了
 * 下一轮 `placement` 的输入。两者互相喂,一帧一翻。
 *
 * `scrollHeight` / `scrollWidth` 量的是**内容**,只要元素是滚动容器
 * (`overflow: auto|scroll|hidden`),它们就**不受 `max-height` 影响** —— 正是
 * 需要的那个不变量。Floating UI 的维护者给的解法就是这一条(issue #2954):
 *
 *     maxHeight = availableHeight >= floating.scrollHeight ? '' : availableHeight
 *
 * 边框补偿用 `clientTop` / `clientLeft`(上/左边框宽度)乘二,**不是**
 * `offset* - client*` —— 后者还含着横向滚动条的高度,有滚动条时会把补偿量算大。
 * 这是抄 Floating UI 的 `_deprecated-inner.ts`(`scrollHeight + clientTop * 2`)。
 * 反正这里只是个不等式判据,差一两个像素只会让阈值稍微保守一点。
 *
 * 取 `max(当前盒子, 内容+边框)`:没被限制时当前盒子就是真值(内容可能更矮,
 * 比如面板有 `min-height`);被限制时内容更高,取内容。
 *
 * 不用「临时撤掉 maxHeight 再量一次」是因为那会**强制同步重排两次**,而这个
 * 函数每次滚动都要跑;也不用「第一次量到的值缓存起来」,因为菜单内容是会变的
 * (分享/导出两块面板互换、发布状态异步回来),缓存立刻就过期。
 */
function naturalSize(panel: HTMLElement, rect: DOMRect): { width: number; height: number } {
  const borderX = (panel.clientLeft || 0) * 2;
  const borderY = (panel.clientTop || 0) * 2;
  const scrollW = panel.scrollWidth || 0;
  const scrollH = panel.scrollHeight || 0;
  return {
    width: Math.max(rect.width, scrollW > 0 ? scrollW + borderX : 0),
    height: Math.max(rect.height, scrollH > 0 ? scrollH + borderY : 0),
  };
}

export interface AnchoredPopover {
  placement: AnchoredPlacement;
  /**
   * 横向要往回收多少物理像素,才不越出夹取框。0 = 本来就放得下,别动它。
   *
   * 是**平移量**而不是一个算好的 `left`:面板的横向位置由既有的 CSS 决定
   * (`.chrome-share-menu .share-menu-popover { right: 0 }`),这里只做修正。
   * 用物理像素也让 RTL 自然成立 —— 量的是真实盒子越了哪边,不预设「起点在左边」。
   */
  inlineShift: number;
  /**
   * 限宽 / 限高(Floating UI 的 `size` 中间件那一档),`null` = 放得下,别管它。
   *
   * 平移只能解决「放得下但站错了地方」。框比浮层还窄时平移无解,只能**限尺寸
   * 并让它内部滚动** —— 否则内容必然被裁掉一截,正是用户报的那个样子。
   */
  maxInlineSize: number | null;
  maxBlockSize: number | null;
  /** 锚点已经看不见了(滚出裁剪框,或从 DOM 里没了)。 */
  anchorHidden: boolean;
}

const INITIAL: AnchoredPopover = {
  placement: 'below',
  inlineShift: 0,
  maxInlineSize: null,
  maxBlockSize: null,
  anchorHidden: false,
};

/**
 * 「贴着这枚按钮开,上面开不下就翻到下面,横着放不下就收回来」。
 *
 * ## 为什么要 portal(调用方那一侧的事,记在这里免得又踩)
 *
 * 就地 `position:absolute` 是不够的。产物卡的动作行 `.artifact-card-acts` 是
 * `position:absolute; z-index:2` —— 它**自己就是一个层叠上下文**,浮层留在
 * 里面时,不管写多大的 z-index,都只在这个 z=2 的盒子内部排序。
 *
 * ## 幂等:已生效的修正必须**量回来**,不能凭记忆
 *
 * 修正量是加在浮层身上的,于是下一次量到的盒子**已经带着上一次的修正**。要还原
 * 成「没修正时它会在哪儿」,就得知道现在身上有多少修正。
 *
 * 第一版把它记在一个 ref 里(「我上次告诉 DOM 偏移多少」)。**那是错的** ——
 * 记忆和 DOM 会分家,而且是两种分法,2026-08-27 真机上两种都撞见了:
 *
 *  · **同一帧里连着量两次、中间没有重排**:第二次量到的还是没修正的盒子,却
 *    按「已经修了 N」去还原,凭空多减一个 N —— 修正量翻倍。React 18 的
 *    `StrictMode`(Next.js dev 默认开着)正是这么跑的:effect 挂载 → 卸载 →
 *    再挂载。真实浏览器实测:普通 shift=108.36,StrictMode shift=216.72。
 *  · **某一轮量不到面板**(portal 重挂的那一帧):`inlineShift` 保持 0 并被
 *    写进状态,浮层弹回锚点原位;而之后没有任何事件再触发重算,它就停在错的
 *    位置上。真机量到的 `style.left` 正好等于 `rect.left`,就是这一半。
 *
 * 所以现在**从 DOM 上读回来**(`readAppliedShift`,由调用方提供 —— 只有它知道
 * 自己把修正放在了哪个盒子的哪个属性上)。读多少次都是同一个值,和调用次数、
 * 挂载次数、有没有重排统统无关。
 *
 * ## 决策的输入不许是自己的输出
 *
 * 这一条是硬约束,不是风格问题。翻面(`placement`)、限尺寸(`max*`)、平移
 * (`inlineShift`)三件事互相之间**只能单向依赖**,一旦成环就是每帧一翻:
 *
 *     锚点矩形 + 夹取框 + 自然尺寸   ← 全部与本 hook 的输出无关
 *              ↓
 *          placement
 *              ↓
 *        maxBlockSize / maxInlineSize
 *
 * 所以:
 *  · `placement` 只看**自然高度**,不看被 `maxBlockSize` 改小之后的高度;
 *  · 竖向预算按**刚定下来的 placement** 配合锚点矩形算,不按面板此刻量到的
 *    位置算 —— 面板的位置本身就是 `placement` 的产物,拿它当输入就是绕回来了;
 *  · 横向同理,限宽的判据取自然宽度。
 *
 * 2026-08-27 真机上撞过的那个环:`below` 时自然高 337 → 下面只剩 193 → 翻
 * `above` → 限高 185 生效 → 量到的高度变成 185 → 下面 193 塞得下了 → 判回
 * `below` → 限高撤掉 → 高度弹回 337 → 循环。
 *
 * ## 为什么是 useLayoutEffect
 *
 * 方向和坐标必须在这一帧画出来之前定好,否则浮层会先在错的位置闪一下再跳过去。
 *
 * jsdom 里 `getBoundingClientRect()` 全是 0。**这带来一个陷阱**:全 0 的锚点
 * 矩形对任何夹取框都满足「整个越过上边」,`anchorHidden` 会在第一帧误判成真。
 * 所以退化矩形(0×0)一律不判可见性 —— 只有真量到尺寸、或者锚点真的从 DOM
 * 里没了,才敢说它不可见。
 */
export function useAnchoredPopover(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null> | null,
  /**
   * 「浮层身上**现在**有多少横向修正」—— 每次量之前现读,不记账(见上「幂等」)。
   * 由调用方提供是因为只有它知道修正落在哪儿:搬走那份在包裹盒的 `left` 上,
   * 原地那份在菜单自己的 `transform` 上。
   */
  readAppliedShift: MutableRefObject<() => number>,
  options: { estimatedHeight: number; gap?: number; flipEnabled?: boolean } = { estimatedHeight: 0 },
): AnchoredPopover {
  const { estimatedHeight, gap = 6, flipEnabled = true } = options;
  const [state, setState] = useState<AnchoredPopover>(INITIAL);
  // 内联箭头每次渲染都是新的;放进 ref 后监听器只在开合时绑一次。
  const optionsRef = useRef({ estimatedHeight, gap, flipEnabled });
  optionsRef.current = { estimatedHeight, gap, flipEnabled };

  const measure = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor || typeof anchor.getBoundingClientRect !== 'function') return;
    const rect = anchor.getBoundingClientRect();
    const { estimatedHeight: estH, gap: g, flipEnabled: canFlip } = optionsRef.current;
    const clip = clippingRect(anchor);

    /*
     * 锚点还在不在?两种「不可见」分开判:
     *  · **从 DOM 里没了**(消息被虚拟化掉、文件被关)—— 只能问 `isConnected`。
     *    detached 元素的 rect 全 0,靠几何算术兜出来是巧合(Floating UI 里
     *    `referenceHidden` 对 detached 恰好为真,纯粹因为 `0 >= 0`),
     *    换个 rootBoundary 就不成立,不能依赖。
     *  · **滚出去了** —— 几何判,但退化矩形不算(见 docblock 里的 jsdom 陷阱)。
     */
    const degenerate = rect.width === 0 && rect.height === 0;
    const anchorHidden = anchor.isConnected === false || (!degenerate && isFullyClipped(rect, clip));

    // 面板一旦挂上就用真实尺寸;第一帧还没有,退回估值。
    const panel = panelRef?.current ?? null;
    const panelRect = panel?.getBoundingClientRect?.();
    const natural = panel && panelRect ? naturalSize(panel, panelRect) : null;
    // 翻面只看**自然高度** —— 看被限高改小之后的高度就会成环(见 docblock)。
    const height = natural && natural.height > 0 ? natural.height : estH;

    const spaceBelow = clip.bottom - rect.bottom - g;
    const spaceAbove = rect.top - clip.top - g;
    /*
     * 原地那条路(工具栏)根本不消费 `placement` —— 它的方向由既有 CSS
     * (`top: calc(100% + 6px)`)钉死向下。给它算一个永远不会生效的 `above`,
     * 只会让下面的竖向预算按错误的方向去配,所以直接不翻。
     */
    const placement: AnchoredPlacement =
      canFlip && spaceBelow < height && spaceAbove > spaceBelow ? 'above' : 'below';

    /*
     * 量不到面板时**保持现状**,不是归零 —— 归零会让浮层弹回锚点原位,而且
     * 之后没有任何事件再触发重算,它就停在那儿了(真机那一半)。
     */
    const applied = readAppliedShift.current();
    let inlineShift = applied;
    let maxInlineSize: number | null = null;
    let maxBlockSize: number | null = null;

    if (panelRect && natural && panelRect.width > 0) {
      // 还原成「没有修正时它会在哪儿」——否则修正会和自己打架(见 docblock)。
      const naturalLeft = panelRect.left - applied;
      const naturalRight = panelRect.right - applied;

      /*
       * 先限尺寸,再平移 —— 顺序不能反。Floating UI 的 `size` 也排在 `shift`
       * 之前:宽度定下来之后位置才有意义,反过来则是拿旧宽度算的位移。
       *
       * `>=` 而不是 `>`:一旦被限到正好等于可用宽度,下一轮仍要判定为「需要限」,
       * 否则限宽会被撤掉、内容撑回原宽、再被限回来,来回抖。
       */
      const availableInline = clip.right - clip.left - INLINE_PAD * 2;
      if (availableInline > 0 && natural.width >= availableInline) {
        maxInlineSize = availableInline;
      }

      const overStart = clip.left + INLINE_PAD - naturalLeft;
      const overEnd = naturalRight - (clip.right - INLINE_PAD);
      // 两边都超(框比菜单还窄)时先保左缘:被切掉的开头比结尾更难读。
      inlineShift = 0;
      if (overStart > 0) inlineShift = overStart;
      else if (overEnd > 0) inlineShift = -overEnd;

      /*
       * 竖向预算按**刚定下来的 placement** 配合锚点矩形算 —— 不按面板此刻量到
       * 的位置算。面板的位置是 `placement` 的产物,拿它当输入就绕回来了,那是
       * 死循环的另一半(上一版正是这么写的)。
       *
       * 两档的落位由既有 CSS 决定,这里只是把它算出来:
       *   below:面板顶边 = 锚点下缘 + gap,底边顶到夹取框下缘
       *   above:面板底边 = 锚点上缘 − gap,顶边顶到夹取框上缘
       *
       * 判据同样取**自然高度**:拿被限高改小之后的高度去判「要不要限高」,
       * 会在边界上反复撤销又加回。
       */
      const availableBlock =
        placement === 'above'
          ? rect.top - g - clip.top - INLINE_PAD
          : clip.bottom - (rect.bottom + g) - INLINE_PAD;
      if (availableBlock > 0 && natural.height >= availableBlock) {
        maxBlockSize = availableBlock;
      }
    }

    setState((prev) =>
      prev.placement === placement &&
      prev.inlineShift === inlineShift &&
      prev.maxInlineSize === maxInlineSize &&
      prev.maxBlockSize === maxBlockSize &&
      prev.anchorHidden === anchorHidden
        ? prev
        : { placement, inlineShift, maxInlineSize, maxBlockSize, anchorHidden },
    );
    // `anchorRef` / `panelRef` 是稳定的 ref 对象,不进依赖 —— 进了就等于把
    // 「每帧新建一个 ref-like 对象」的调用方拖进死循环。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    // 面板挂上之后真实高度才有 —— 再量一次,把第一帧的估值换掉。
    const raf = requestAnimationFrame(measure);
    /*
     * `capture: true`:scroll 事件**不冒泡**,但它走捕获阶段 —— 在 window 上以
     * capture 监听,内层滚动容器(聊天流)的 scroll 一样收得到。这是本仓库
     * 十来处浮层共用的写法,2026-08-27 在无头 Chrome 里实测确认过。
     */
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    /*
     * `ResizeObserver` 补的是 scroll/resize 都照不到的那一档:**盒子自己变了**。
     * 菜单内容异步加载完(发布状态回来、URL 行出现)会把面板撑高,锚点所在的
     * 工具栏也可能因为窄栏折行而变高 —— 这两件事都不产生 scroll 也不产生
     * window resize,不看就只能等下一次滚动才纠正。
     *
     * 对照 Floating UI 的 `autoUpdate`:它还有一档 `layoutShift`,用
     * IntersectionObserver 反算「元素被别人挤动了」。那一档这里先不做 ——
     * 它需要每次触发后重建 observer,而且锚点被完全裁掉时会退化成 1Hz 轮询;
     * 我们的收起判定不该慢一秒。
     */
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(measure);
      if (anchorRef.current) ro.observe(anchorRef.current);
      if (panelRef?.current) ro.observe(panelRef.current);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, measure]);

  return state;
}
