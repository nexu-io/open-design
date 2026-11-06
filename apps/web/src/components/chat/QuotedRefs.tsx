/**
 * 引用芯片(设计稿组件 23 · 第 67 / 68 / 69 格)。
 *
 * 一枚芯片装**所有**引用,写着「N 条注释」—— 稿子第 69 格的意义就是证明
 * 「一条和五条一样高」:条数只改数字,不改高度。全文在 hover 的浮层里按序号列出来。
 */
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { Icon } from '../Icon';
import { useT } from '../../i18n';
import type { ChatQuote } from '../../runtime/chat/quote-selection';
import { quotePopoverMaxHeight } from '../../runtime/chat/quote-popover';
import { STROKE_ICON } from './primitives/icons';
import styles from './QuotedRefs.module.css';

export interface QuotedRefsProps {
  quotes: ChatQuote[];
  onClear: () => void;
}

export function QuotedRefs({ quotes, onClear }: QuotedRefsProps): ReactElement | null {
  const t = useT();
  const refsRef = useRef<HTMLSpanElement>(null);
  const [popoverMaxHeight, setPopoverMaxHeight] = useState(0);
  const syncPopoverHeight = useCallback(() => {
    const node = refsRef.current;
    if (!node || typeof window === 'undefined') return;

    const portalBoundary = node.closest<HTMLElement>('[data-chat-panel-top]');
    const portalTop = Number(portalBoundary?.dataset.chatPanelTop);
    const pane = node.closest<HTMLElement>('.pane');
    const panelTop = Number.isFinite(portalTop)
      ? portalTop
      : (pane?.getBoundingClientRect().top ?? window.visualViewport?.offsetTop ?? 0);
    const next = quotePopoverMaxHeight({
      anchorTop: node.getBoundingClientRect().top,
      panelTop,
    });
    setPopoverMaxHeight((current) => (current === next ? current : next));
  }, []);

  useLayoutEffect(() => {
    const node = refsRef.current;
    if (!node || typeof window === 'undefined') return;
    syncPopoverHeight();

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(syncPopoverHeight);
    observer?.observe(node);
    const pane = node.closest<HTMLElement>('.pane');
    if (pane) observer?.observe(pane);
    window.addEventListener('resize', syncPopoverHeight);
    window.visualViewport?.addEventListener('resize', syncPopoverHeight);
    window.visualViewport?.addEventListener('scroll', syncPopoverHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncPopoverHeight);
      window.visualViewport?.removeEventListener('resize', syncPopoverHeight);
      window.visualViewport?.removeEventListener('scroll', syncPopoverHeight);
    };
  }, [quotes.length, syncPopoverHeight]);

  if (quotes.length === 0) return null;
  return (
    <span
      ref={refsRef}
      className={styles.refs}
      data-testid="chat-quoted-refs"
      onMouseEnter={syncPopoverHeight}
    >
      {/* 芯片最前面那**一格**里叠着两枚记号:静止时是气泡,指到芯片上换成移除键
          (OPEND-2713)。原来移除键在**右**边、`opacity: 0` 藏着 —— 藏着也照样占位,
          真机量到文字右缘到芯片内缘 31px、左边只有 9px,那 22px 的不对称就是它。
          搬到同一格之后右边只剩内距,两侧回到 9/9,而移除键该在的时候仍然在。

          两枚同格靠 `.quoteLead` 那条 grid 规则(两个孩子都落在 1/1),不是绝对定位:
          这一格的宽度得**真的**参与芯片的横向排布,否则芯片会缩到只剩文字。

          按钮在前、气泡在后是**故意的**:气泡因此盖在按钮上面,
          `.remove:focus-visible ~ .icon` 这条兄弟选择器才写得出来(键盘聚焦时
          让气泡让位);代价是气泡必须 `pointer-events: none`,不然它会把点击
          吃在自己身上 —— 那条规则因此是承重的,不是保险。 */}
      <span className={styles.quoteLead}>
        <button
          type="button"
          className={styles.remove}
          onClick={onClear}
          aria-label={t('chat.quote.removeAria')}
          title={t('chat.quote.removeAria')}
        >
          {/* 稿子 `.del svg { width: 10px; height: 10px }` */}
          <Icon name="close" size={10} />
        </button>
        {/* 稿子 `.refs .ic` 是**描边的对话气泡**,不是实心引号。
            原来这里画的是 ❝ —— 用户第一眼就问「注释的样式怎么是这样的??」。
            气泡说的是「这是从对话里摘出来的一段」,引号说的是「这是引文」;
            稿子选的是前者,而这一族的其它记号(浮条、芯片)也都是描边的。 */}
        {/* 笔画走 chat 描边图标的同一份基线(`STROKE_ICON`)——
            自己再写一遍 `fill/stroke` 就会漏掉粗细,那正是这枚气泡原来
            掉回浏览器默认 1 用户单位、13px 上只剩 0.54px 的原因。
            尺寸和颜色仍由 `.icon` 给。 */}
        <svg {...STROKE_ICON} className={styles.icon}>
          <path d="M20 15a2 2 0 01-2 2H8l-4 4V5a2 2 0 012-2h12a2 2 0 012 2z" />
        </svg>
      </span>
      <span>{t('chat.quote.count', { count: quotes.length })}</span>
      <span
        className={styles.pop}
        data-testid="chat-quoted-refs-popover"
        role="tooltip"
        style={{ maxHeight: `${popoverMaxHeight}px` }}
      >
        <ol>
          {quotes.map((q) => (
            <li key={q.id}>
              <span>{q.text}</span>
            </li>
          ))}
        </ol>
      </span>
    </span>
  );
}
