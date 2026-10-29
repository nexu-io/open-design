import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { PreviewComment } from '../types';
import { Icon } from './Icon';
import { placeCommentPopover } from '../comments/popover-geometry';
import styles from './CommentBrowse.module.css';

export function useCommentHoverPreview(suppressed: boolean) {
  const [preview, setPreview] = useState<{ comment: PreviewComment; anchor: DOMRect; preferLeft: boolean; animation: 'enter' | 'switch' } | null>(null);
  const [closing, setClosing] = useState(false);
  const current = useRef(preview);
  const isSuppressed = useRef(suppressed);
  isSuppressed.current = suppressed;
  const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const cancelClose = () => { clearTimeout(closeTimer.current); clearTimeout(fadeTimer.current); setClosing(false); };
  const dismiss = () => {
    clearTimeout(showTimer.current); cancelClose(); current.current = null; setPreview(null);
  };
  useEffect(() => { if (suppressed) dismiss(); }, [suppressed]);
  useEffect(() => () => { clearTimeout(showTimer.current); clearTimeout(closeTimer.current); clearTimeout(fadeTimer.current); }, []);
  return {
    preview: suppressed ? null : preview,
    closing,
    show: (comment: PreviewComment, node: HTMLElement, preferLeft = false) => {
      clearTimeout(showTimer.current); cancelClose();
      if (isSuppressed.current) return;
      const reveal = () => {
        if (isSuppressed.current) return;
        const next = { comment, anchor: node.getBoundingClientRect(), preferLeft, animation: current.current ? 'switch' as const : 'enter' as const };
        current.current = next; setPreview(next);
      };
      if (current.current || reducedMotion()) reveal();
      else showTimer.current = setTimeout(reveal, 150);
    },
    keep: cancelClose,
    dismiss,
    leave: () => {
      clearTimeout(showTimer.current); cancelClose();
      if (!current.current) return;
      if (reducedMotion()) { dismiss(); return; }
      closeTimer.current = setTimeout(() => {
        setClosing(true);
        fadeTimer.current = setTimeout(() => { current.current = null; setPreview(null); setClosing(false); }, 100);
      }, 200);
    },
  };
}

export function CommentHoverPreview({ state, author, bounds, images = [], imageFailedLabel = 'Image unavailable' }: {
  state: ReturnType<typeof useCommentHoverPreview>;
  author: ReactNode;
  bounds?: DOMRect;
  images?: { url: string; name: string }[];
  imageFailedLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: 120 });
  const preview = state.preview;
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      const width = node.offsetWidth || rect.width, height = node.offsetHeight || rect.height;
      if (height > 0) setSize(current => current.width === width && current.height === height ? current : { width, height });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [preview]);
  if (!preview) return null;
  const { anchor, comment } = preview;
  const viewport = {
    left: Math.max(0, bounds?.left ?? 0), top: Math.max(0, bounds?.top ?? 0),
    width: Math.min(window.innerWidth, bounds?.right ?? window.innerWidth) - Math.max(0, bounds?.left ?? 0),
    height: Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight) - Math.max(0, bounds?.top ?? 0),
  };
  const placement = placeCommentPopover({ left: anchor.left, top: anchor.top, width: anchor.width, height: anchor.height }, viewport, size.height);
  if (!placement) return null;
  return createPortal(<div ref={ref} key={comment.id} className={`${styles.preview} ${preview.animation === 'switch' ? styles.switching : styles.entering}${state.closing ? ` ${styles.closing}` : ''}`} role="tooltip"
    style={placement}
    onMouseEnter={state.keep} onMouseLeave={state.leave}>
    {author}{comment.note ? <p dir="auto">{comment.note}</p> : null}
    {images.length > 0 ? <div className={styles.previewImages}>{images.map(image => <a key={image.url} href={image.url} target="_blank" rel="noopener noreferrer" title={image.name}><CommentImage src={image.url} name={image.name} failedLabel={imageFailedLabel} /></a>)}</div> : null}
  </div>, document.body);
}

export function CommentAvatarRail({ comments, activeId, unreadIds, renderAvatar, label, moreLabel, onOpen, onExpand, toggleRef, hover, expandLabel = 'Show comments' }: {
  comments: PreviewComment[];
  activeId: string | null;
  unreadIds: ReadonlySet<string>;
  renderAvatar: (comment: PreviewComment) => ReactNode;
  label: (comment: PreviewComment) => string;
  moreLabel: (count: number) => string;
  onOpen: (comment: PreviewComment, origin?: HTMLElement) => void;
  onExpand: () => void;
  expandLabel?: string;
  toggleRef: React.RefObject<HTMLButtonElement>;
  hover: ReturnType<typeof useCommentHoverPreview>;
}) {
  const sortedComments = [...comments].sort((a, b) => b.createdAt - a.createdAt);
  const hidden = Math.max(0, sortedComments.length - 5);
  return <aside className={`${styles.rail} comment-side-rail`} data-testid="comment-side-collapsed-rail">
    <button ref={toggleRef} className={styles.toggle} type="button" onClick={onExpand} aria-expanded={false} aria-label={expandLabel} title={expandLabel}>
      <Icon name="chevron-left" size={14} /><Icon name="chevron-left" size={14} />
    </button>
    <div className={styles.avatars}>
      {sortedComments.slice(0, 5).map(comment => <button key={comment.id} type="button"
        className={styles.avatar}
        aria-label={label(comment)} aria-current={activeId === comment.id ? 'true' : undefined}
        onClick={event => { hover.dismiss(); onOpen(comment, event.currentTarget); }}>
        {renderAvatar(comment)}{unreadIds.has(comment.id) ? <i className={styles.unread} /> : null}
      </button>)}
      {hidden > 0 ? <button type="button" className={styles.more} aria-expanded={false} aria-label={moreLabel(hidden)} title={moreLabel(hidden)} onClick={onExpand}>+{Math.min(99, hidden)}
        {sortedComments.slice(5).some(comment => unreadIds.has(comment.id)) ? <i className={styles.unread} /> : null}
      </button> : null}
    </div>
  </aside>;
}

export function CommentImage({ src, name, failedLabel }: { src: string; name: string; failedLabel: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className={styles.imageFailed} role="img" aria-label={`${name}: ${failedLabel}`}>{failedLabel}</span>
    : <img src={src} alt={name} onError={() => setFailed(true)} />;
}
