/**
 * 选区浮条(设计稿组件 23 · 第 65 / 66 格)。
 *
 * 在助手正文里选中一段话,这条浮条浮在选区**上方、水平居中**(稿子 23-1);
 * 上方被面板顶边挤住时翻到下方(稿子 23-2)。判据在 `runtime/chat/quote-selection.ts`,
 * 能脱离 DOM 测。
 *
 * 为什么用 `position: fixed` 而不是稿子的 `absolute`:稿子把浮条画在
 * `<mark class="sel">` 里面 —— 那是静态稿唯一能摆的方式。真实的选区是 DOM Range,
 * 没法给它包一层标签,所以按选区矩形定位。位置一样,承载方式不同。
 *
 * 而 `fixed` 只有在**包含块真的是视口**时才等于「视口坐标」—— 见下面
 * `QuoteBarLayer` 的注释:浮条必须 portal 到 body,不能留在 ChatPane 的 `.pane` 里。
 */
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../i18n';
import {
  QUOTE_BAR_DEFAULT_HEIGHT_PX,
  QUOTE_BAR_DEFAULT_WIDTH_PX,
  isQuotable,
  normalizeQuoteText,
  quoteBarPosition,
  type QuoteRect,
} from '../../runtime/chat/quote-selection';
import { chatSeam } from './ChatRoot';
import styles from './QuoteBar.module.css';

export interface QuoteBarProps {
  /** 只在这个容器里的选区才算数 —— 输入框、侧栏里的选中不该弹这条 */
  scopeRef: React.RefObject<HTMLElement | null>;
  /** 「添加到对话」 */
  onQuote: (text: string, messageId: string | null) => void;
  /** 有效正文选区会临时暂停 chat 的流式追尾，避免下一 token 把选区滚走。 */
  onSelectionActivityChange?: (active: boolean) => void;
}

interface BarState {
  left: number;
  top: number;
  placement: 'above' | 'below';
  text: string;
  messageId: string | null;
  measuredWidth: number;
  measuredHeight: number;
}

interface SelectionGeometry {
  range: Range;
  /** 选区**首行**矩形 —— 浮条朝上时贴的就是它 */
  firstRect: QuoteRect;
  /** 选区**末行**矩形 —— 翻到下方时贴的是它;单行选区与 `firstRect` 相同 */
  lastRect: QuoteRect;
  panelRect: DOMRect;
  scrollTop: number;
  text: string;
}

const GEOMETRY_EPSILON = 0.5;

/**
 * 一个文本节点上**真正被选中的那一段**,取不到就 null。
 *
 * 首尾两个文本节点通常只被选中一半,所以要按 Range 的边界收一刀;
 * `commonAncestorContainer` 底下还有落在首尾之外的文本节点,靠边界比较剔掉。
 * 只剩空白的切片也不算 —— 折行处那些换行与缩进在屏幕上什么都没画。
 */
function selectedSliceOf(range: Range, node: Text): Range | null {
  const doc = node.ownerDocument;
  if (!doc) return null;
  const slice = doc.createRange();
  slice.selectNodeContents(node);
  if (node === range.startContainer) slice.setStart(node, range.startOffset);
  if (node === range.endContainer) slice.setEnd(node, range.endOffset);
  if (slice.collapsed) return null;
  // 起点在选区之前 / 终点在选区之后 = 这个文本节点压根没被选中
  if (range.compareBoundaryPoints(Range.START_TO_START, slice) > 0) return null;
  if (range.compareBoundaryPoints(Range.END_TO_END, slice) < 0) return null;
  if (!slice.toString().trim()) return null;
  return slice;
}

/** 一个文本切片画出来的、有面积的那些行 */
function paintedRectsOf(slice: Range): QuoteRect[] {
  return Array.from(slice.getClientRects() ?? []).filter(
    (rect) => rect.width > 0 && rect.height > 0,
  );
}

/**
 * 选区**首行 / 末行**那两块矩形 —— 只认被高亮的**文字**画出来的行。
 *
 * 为什么不能拿整段 Range 的 `getClientRects()`:按 CSSOM,凡是被 Range **整个包住**
 * 的元素,它的 border box 也在那个列表里,和文字行混在一起。拖选收尾越过气泡一点点,
 * Range 就会连着吞下 `.chat-log-tail-spacer`(高度由 ChatPane 逐帧写、满宽、一个字都没有)
 * 或整块 `.msg.user` —— 屏幕上一处高亮都没多,列表里却多出一块贴着日志底部的满宽矩形。
 * 它**有面积**,所以「只留有面积的矩形」那一版补丁放它过去,浮条于是追着它掉到
 * 输入框上沿、水平居中到面板正中(用户 2026-09-02 在自己的黑气泡里复现)。
 *
 * 文字矩形才是「看得见的选区」的定义:没有文字就没有高亮,没有高亮就不该有锚点。
 *
 * 走法是**从两头各走一小段**,不是遍历整个 `commonAncestorContainer`:
 * `selectionchange` 跟着鼠标移动逐帧来,跨消息拖选时公共祖先会一路涨到 `.chat-log`,
 * 全量遍历等于每一帧把整份记录的文本节点都量一遍。首行从 `startContainer` 往后找、
 * 末行从 `endContainer` 往前找,跳过的只有边界上那几个空白 / 越界节点。
 */
function selectionEdgeTextRects(range: Range): { first: QuoteRect; last: QuoteRect } | null {
  const root = range.commonAncestorContainer;
  const doc = root.ownerDocument ?? (root as Document);
  const textRectsOf = (node: Node): QuoteRect[] => {
    if (node.nodeType !== Node.TEXT_NODE) return [];
    const slice = selectedSliceOf(range, node as Text);
    return slice ? paintedRectsOf(slice) : [];
  };

  if (root.nodeType === Node.TEXT_NODE) {
    const rects = textRectsOf(root);
    const first = rects[0];
    const last = rects[rects.length - 1];
    return first && last ? { first, last } : null;
  }
  if (typeof doc.createTreeWalker !== 'function') return null;

  const forward = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  forward.currentNode = range.startContainer;
  let first: QuoteRect | undefined = textRectsOf(range.startContainer)[0];
  while (!first) {
    const node = forward.nextNode();
    if (!node) break;
    first = textRectsOf(node)[0];
  }

  const backward = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  backward.currentNode = range.endContainer;
  const endRects = textRectsOf(range.endContainer);
  let last: QuoteRect | undefined = endRects[endRects.length - 1];
  while (!last) {
    const node = backward.previousNode();
    if (!node) break;
    const rects = textRectsOf(node);
    last = rects[rects.length - 1];
  }

  return first && last ? { first, last } : null;
}

/**
 * 选区里**看得见的**那两块矩形(首行 / 末行)。
 *
 * 首选被高亮文字自己的矩形(`selectionEdgeTextRects`)。取不到时才依次退回
 * 整段 client rect(仍只留有面积的)与并集 —— 后两条是给**没有排版信息**的环境
 * (jsdom)兜底的,浏览器里非折叠选区总能量到文字。
 *
 * 并集永远是最后一档:它混着选区末端那个**零宽**的光标矩形,拖选稍微过界一点,
 * 末端就落到下一个区块的行首 —— 屏幕上一个字都没高亮,并集的下沿却已经跑到那一行。
 */
function visibleSelectionRects(range: Range): { first: QuoteRect; last: QuoteRect } | null {
  const fromText = selectionEdgeTextRects(range);
  if (fromText) return fromText;
  const painted = Array.from(range.getClientRects() ?? []).filter(
    (rect) => rect.width > 0 && rect.height > 0,
  );
  const first = painted[0];
  const last = painted[painted.length - 1];
  if (first && last) return { first, last };
  const union = range.getBoundingClientRect();
  if (union.width === 0 && union.height === 0) return null;
  return { first: union, last: union };
}

function readSelectionGeometry(scope: HTMLElement): SelectionGeometry | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!scope.contains(range.commonAncestorContainer)) return null;
  const text = normalizeQuoteText(selection.toString());
  if (!isQuotable(text)) return null;
  const rects = visibleSelectionRects(range);
  if (!rects) return null;
  return {
    range,
    firstRect: rects.first,
    lastRect: rects.last,
    panelRect: scope.getBoundingClientRect(),
    scrollTop: scope.scrollTop,
    text,
  };
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < GEOMETRY_EPSILON;
}

function sameRect(a: QuoteRect, b: QuoteRect): boolean {
  return (
    near(a.left, b.left) &&
    near(a.top, b.top) &&
    near(a.right, b.right) &&
    near(a.bottom, b.bottom)
  );
}

function sameVisibleGeometry(a: SelectionGeometry, b: SelectionGeometry): boolean {
  return (
    near(a.scrollTop, b.scrollTop) &&
    sameRect(a.panelRect, b.panelRect) &&
    sameRect(a.firstRect, b.firstRect) &&
    sameRect(a.lastRect, b.lastRect)
  );
}

/**
 * **浮条在不在,只由这一条决定:选区自己还在可视区里露着吗。**
 *
 * 必须成立的是「浮条一定贴着**看得见的**选区」。`quoteBarPosition` 只保证坐标
 * 落在面板里 —— 选区整个滚出画面之后它仍会算出一个位置,而那个位置是被边缘夹取
 * 拽到面板边上的,浮条就悬在一段与它毫无关系的正文头上。所以「贴得住」这件事
 * 不能交给定位函数,得在这里先问一句。
 *
 * 判据是**竖直方向的交集**:选区从首行上沿到末行下沿这一整段,和面板的可视区
 * 有没有重叠。用整段而不是「首行或末行任一露头」,是为了照顾比一屏还高的选区 ——
 * 首尾都滚出去了、中间那段正占满画面,那当然还看得见。
 *
 * 只看竖直:聊天日志只竖着滚,横向没有能让选区离开画面的自由度。
 */
function selectionOnScreen(geometry: SelectionGeometry): boolean {
  const { firstRect, lastRect, panelRect } = geometry;
  /*
   * 量不到的面板不算「选区在屏外」的证据。
   *
   * 判据是选区跨度和面板的竖向交叠,而那要求面板**有高度**。面板高度为 0 时
   * (还没布局、被隐藏、或者测试环境里根本没人给它坐标)交叠恒为假 —— 于是这条
   * 规则会把每一个选区都判成看不见,浮条永远不出来。那不是保守,是把"没测量"
   * 当成了"测量结果为否"。
   *
   * 实测撞到过:`chat-scroll-following.test.tsx` 那条选区暂停追尾的用例只 mock 了
   * 选区矩形、没 mock 面板矩形,于是浮条整个消失。真浏览器里面板当然有高度,
   * 但"我的判据依赖一个没写出来的前提"这件事本身是缺陷,不该靠环境凑巧成立。
   */
  if (!(panelRect.bottom > panelRect.top)) return true;
  const top = Math.min(firstRect.top, lastRect.top);
  const bottom = Math.max(firstRect.bottom, lastRect.bottom);
  return bottom > panelRect.top && top < panelRect.bottom;
}

/** 从选区往上找出它落在哪条消息里 —— 之后要回跳定位靠它 */
function messageIdOf(node: Node | null): string | null {
  let el = node instanceof Element ? node : node?.parentElement ?? null;
  while (el) {
    const id = el.getAttribute?.('data-message-id');
    if (id) return id;
    el = el.parentElement;
  }
  return null;
}

export function QuoteBar({
  scopeRef,
  onQuote,
  onSelectionActivityChange,
}: QuoteBarProps): ReactElement | null {
  const t = useT();
  const [bar, setBar] = useState<BarState | null>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const geometryRef = useRef<SelectionGeometry | null>(null);
  const selectionActiveRef = useRef(false);
  const onSelectionActivityChangeRef = useRef(onSelectionActivityChange);

  useEffect(() => {
    onSelectionActivityChangeRef.current = onSelectionActivityChange;
  }, [onSelectionActivityChange]);

  const setSelectionActive = useCallback((active: boolean) => {
    if (selectionActiveRef.current === active) return;
    selectionActiveRef.current = active;
    onSelectionActivityChangeRef.current?.(active);
  }, []);

  const hideBar = useCallback(() => {
    geometryRef.current = null;
    setBar(null);
  }, []);

  /**
   * 把一帧**有效选区**的几何画出来 —— 看得见就贴上去,看不见就收起来。
   *
   * 两条路都要先把 `geometry` 记进 `geometryRef`,收起来那一路尤其不能漏:
   * 滚动回调靠它判断「视口是不是真的动了」,更靠它在选区滚回画面时把浮条接回来。
   * 收起时若像 `hideBar` 那样把它清成 null,复原的依据就跟着没了 —— 那正是用户
   * 2026-09-04 说的后半句「消失不会再显示吗」。
   */
  const renderBar = useCallback((geometry: SelectionGeometry) => {
    // 选区仍然有效 —— 哪怕被滚出画面,ChatPane 也不许因此恢复追尾:
    // 只有用户自己清掉选区(或显式回到最新)才算数。
    setSelectionActive(true);
    geometryRef.current = geometry;
    if (!selectionOnScreen(geometry)) {
      setBar(null);
      return;
    }
    const measuredBar = barRef.current?.getBoundingClientRect();
    const measuredWidth = measuredBar?.width || QUOTE_BAR_DEFAULT_WIDTH_PX;
    const measuredHeight = measuredBar?.height || QUOTE_BAR_DEFAULT_HEIGHT_PX;
    const position = quoteBarPosition({
      first: geometry.firstRect,
      last: geometry.lastRect,
      panel: geometry.panelRect,
      barWidth: measuredWidth,
      barHeight: measuredHeight,
    });
    setBar({
      left: position.left,
      top: position.top,
      placement: position.placement,
      text: geometry.text,
      messageId: messageIdOf(geometry.range.commonAncestorContainer),
      measuredWidth,
      measuredHeight,
    });
  }, [setSelectionActive]);

  const sync = useCallback(() => {
    const scope = scopeRef.current;
    if (!scope) {
      setSelectionActive(false);
      return hideBar();
    }
    const geometry = readSelectionGeometry(scope);
    if (!geometry) {
      setSelectionActive(false);
      return hideBar();
    }
    renderBar(geometry);
  }, [hideBar, renderBar, scopeRef, setSelectionActive]);

  // The first selection pass cannot measure a bar that does not exist yet.
  // Re-run once after mount so long localized labels use their real width for
  // edge clamping; the measured dimensions make the second pass idempotent.
  useLayoutEffect(() => {
    if (!bar || !barRef.current) return;
    const measured = barRef.current.getBoundingClientRect();
    if (measured.width <= 0 || measured.height <= 0) return;
    if (near(measured.width, bar.measuredWidth) && near(measured.height, bar.measuredHeight)) return;
    sync();
  }, [bar, sync]);

  useEffect(() => {
    // `selectionchange` 是唯一能同时覆盖鼠标拖选、双击选词、键盘 Shift+方向的信号
    /**
     * 视口动了就**重新贴一次**,而不是把浮条藏掉。
     *
     * 稿子(`729fa43ce7:docs/design/chat-panel/src/components.css:3136`)把浮条
     * `position: absolute` 挂在 `<mark class="sel">` 自己身上,天然跟着内容滚,
     * 所以稿子里根本没有「滚动怎么办」这个问题。我们改用 `fixed`(真实选区是
     * DOM Range,没法给它包一层标签),错位才成了我们自己的问题 —— 于是也该由
     * 我们自己每帧重算来还上,而不是把它转嫁成「一滚就消失」。
     *
     * OPEND-2541 那条鬼影(滚动时浮条停在原地、指着不存在的东西)仍然被防着,
     * 只是换了个防法:重新贴 = 不可能停在原地,选区滚出画面时 `renderBar` 会
     * 按 `selectionOnScreen` 收起来 = 不可能悬在无关正文上。当时选的「那就藏了」
     * 是实现方式带出来的副作用,用户 2026-09-04 当面推翻了它的后半段。
     *
     * 几何没变就早退:`scroll` 是捕获阶段的全页信号,页面上任何一个可滚元素
     * 动一下都会来一发,不能每一发都 setState。
     */
    function followScrolledSelection(): void {
      const scope = scopeRef.current;
      const previous = geometryRef.current;
      if (!scope || !previous) return;
      const current = readSelectionGeometry(scope);
      if (!current) {
        setSelectionActive(false);
        hideBar();
        return;
      }
      if (sameVisibleGeometry(previous, current)) return;
      renderBar(current);
    }
    document.addEventListener('selectionchange', sync);
    window.addEventListener('scroll', followScrolledSelection, true);
    window.addEventListener('resize', sync);
    const scope = scopeRef.current;
    const resizeObserver =
      scope && typeof ResizeObserver === 'function'
        ? new ResizeObserver(sync)
        : null;
    if (scope) resizeObserver?.observe(scope);
    return () => {
      document.removeEventListener('selectionchange', sync);
      window.removeEventListener('scroll', followScrolledSelection, true);
      window.removeEventListener('resize', sync);
      resizeObserver?.disconnect();
      setSelectionActive(false);
    };
  }, [hideBar, renderBar, scopeRef, setSelectionActive, sync]);

  if (!bar) return null;
  return (
    <QuoteBarLayer>
      <QuoteBarView
        ref={barRef}
        placement={bar.placement}
        style={{
          left: `${bar.left}px`,
          top: `${bar.top}px`,
          transform: bar.placement === 'above' ? 'translate(-50%, -100%)' : 'translateX(-50%)',
        }}
        onQuote={() => onQuote(bar.text, bar.messageId)}
      />
    </QuoteBarLayer>
  );
}

/**
 * 浮条挂的那一层:`<body>` 下面,**不在 ChatPane 的 `.pane` 里**。
 *
 * `quoteBarPosition` 算的是视口坐标,浮条也写着 `position: fixed` —— 但
 * `fixed` 的参照系是「最近的**包含块**」,而带 `transform` / `filter` /
 * `backdrop-filter` / `contain` 的祖先会把自己变成 fixed 后代的包含块。
 * ChatPane 的根正是这样一层:`.app .split-chat-slot > .pane`
 * (`styles/viewer/routines.css`)挂着 `backdrop-filter: var(--material-regular-backdrop)`,
 * 亮暗两档都解析成 `blur(...) saturate(1.6)`(`styles/material.css`),不是 none。
 * 于是那对视口坐标被当成「相对 .pane 的坐标」用,浮条恒定下移一个 `.pane` 顶边的
 * 距离;同一条规则的 `overflow: hidden` 还会把落到 pane 外面的浮条整个裁掉。
 *
 * 这不是新发现的坑:输入框正是为此 portal 出去的(routines.css 那条规则自己的
 * 注释写着「the composer is a separate fixed/portaled layer, so it isn't clipped」)。
 *
 * portal 出去要**自带 `--chat-*` 接缝**:自定义属性按 DOM 树继承,挂在 `<body>` 下
 * 就落在聊天接缝之外,浮条的底色 / 圆角 / 描边(全是 `var(--chat-…)`)会**静默**
 * 解析成空串。这个仓为此栽过三次(联系支持弹窗、产物卡浮层、输入框)。
 */
function QuoteBarLayer({ children }: { children: ReactElement }): ReactElement | null {
  if (typeof document === 'undefined') return null;
  return createPortal(<div {...chatSeam()}>{children}</div>, document.body);
}

/**
 * 浮条的**呈现层** —— 只管长什么样,不碰选区。
 *
 * 拆出来是为了能静态渲染:陈列页要照这一格,而真实浮条的位置来自 DOM Range,
 * `renderToStaticMarkup` 里根本没有选区。行为那一半仍然在 `QuoteBar` 上,
 * 由 `runtime/chat/quote-selection` 的纯判据驱动。
 */
export const QuoteBarView = forwardRef<HTMLSpanElement, {
  placement: 'above' | 'below';
  style?: CSSProperties;
  onQuote?: () => void;
}>(function QuoteBarView({ placement, style, onQuote }, ref): ReactElement {
  const t = useT();
  /*
   * 根节点是 `<span>` 不是 `<div>` —— 稿子的 `.selbar` 也是 span。
   * 理由不只是对齐:浮条会被摆进正文里(居中于被划线的那几个字),
   * 而 `<div>` 放进 `<p>` 会让浏览器**当场把 `<p>` 截断**,DOM 被重排、
   * 浮条落到别处 —— 陈列页第 65 格照出来就是浮条整个不见了。
   */
  return (
    <span
      ref={ref}
      className={styles.bar}
      data-testid="chat-quote-bar"
      data-placement={placement}
      style={style}
      // 鼠标按在浮条上会先清掉选区,按钮的 click 就永远等不到
      onMouseDown={(event) => event.preventDefault()}
    >
      <button type="button" className={styles.action} onClick={onQuote}>
        {t('chat.quote.add')}
      </button>
    </span>
  );
});
