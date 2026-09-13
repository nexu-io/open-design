import {
  useEffect, useLayoutEffect, useRef, useState,
  type CSSProperties, type DragEventHandler, type MutableRefObject, type ReactNode,
} from 'react';
import styles from './QueuedSendStack.module.css';

type Banner = { id: string; content: ReactNode };
type DisplayBanner = Banner & { phase: 'enter' | 'ready' | 'exit'; depth: number };
const CLOSE_MS = 250;
const SPREAD_GAP = 4;
// 22px controls, 6px vertical padding on each side, and the card's two borders.
const MIN_BANNER_HEIGHT = 36;
const FULLY_VISIBLE_BANNERS = 5;

function expandedHeightLimit(bannerHeight: number): number {
  // Five complete cards and their gaps, then half of the sixth card.
  return FULLY_VISIBLE_BANNERS * (bannerHeight + SPREAD_GAP) + bannerHeight / 2;
}

/** Presentation only: collapsed overflow never removes a queued message. */
export function QueuedSendStack({ items, label, containerRef, dragging, onDragLeave, onExpandedChange }: {
  items: Banner[];
  label: string;
  containerRef?: MutableRefObject<HTMLDivElement | null>;
  dragging: boolean;
  onDragLeave: DragEventHandler<HTMLDivElement>;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [banners, setBanners] = useState<DisplayBanner[]>([]);
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const [bannerHeight, setBannerHeight] = useState(MIN_BANNER_HEIGHT);
  const [availableHeight, setAvailableHeight] = useState(expandedHeightLimit(MIN_BANNER_HEIGHT));
  const exitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latestItems = useRef(items);
  latestItems.current = items;
  const ids = JSON.stringify(items.map((item) => item.id));
  const spread = pointerInside || focusInside || dragging;
  const liveCount = items.length;
  const count = Math.max(liveCount, banners.filter((item) => item.phase === 'exit').length ? 1 : 0);
  const fullHeight = Math.max(bannerHeight, liveCount * (bannerHeight + SPREAD_GAP) - SPREAD_GAP);

  useLayoutEffect(() => {
    const current = latestItems.current;
    setBanners((previous) => [
      ...current.map((item, index): DisplayBanner => ({
        ...item,
        depth: current.length - 1 - index,
        phase: previous.some((old) => old.id === item.id && old.phase !== 'exit') ? 'ready' : 'enter',
      })),
      ...previous.filter((old) => !current.some((item) => item.id === old.id))
        .map((old): DisplayBanner => ({ ...old, phase: 'exit' })),
    ]);
    if (!current.length) {
      setPointerInside(false);
      setFocusInside(false);
    }
  }, [ids]);

  useLayoutEffect(() => {
    if (!banners.some((item) => item.phase === 'enter') || !rootRef.current) return;
    // Commit the starting transform before removing it, even in throttled windows.
    void rootRef.current.offsetHeight;
    setBanners((current) => current.map((item) => item.phase === 'enter' ? { ...item, phase: 'ready' } : item));
  }, [banners]);

  useEffect(() => {
    const timers = exitTimers.current;
    for (const banner of banners) {
      if (banner.phase === 'exit' && !timers.has(banner.id)) {
        timers.set(banner.id, setTimeout(() => {
          timers.delete(banner.id);
          setBanners((current) => current.filter((item) => item.id !== banner.id || item.phase !== 'exit'));
        }, CLOSE_MS));
      } else if (banner.phase !== 'exit' && timers.has(banner.id)) {
        clearTimeout(timers.get(banner.id));
        timers.delete(banner.id);
      }
    }
  }, [banners]);

  useEffect(() => () => {
    exitTimers.current.forEach(clearTimeout);
    exitTimers.current.clear();
  }, []);

  const mounted = banners.length > 0;
  const expanded = mounted && liveCount > 0 && spread;
  // The host's floating controls yield while this stack occupies the transcript.
  useLayoutEffect(() => { onExpandedChange?.(expanded); }, [expanded, onExpandedChange]);
  useLayoutEffect(() => () => { onExpandedChange?.(false); }, [onExpandedChange]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const contents = root.querySelectorAll<HTMLElement>('[data-queue-banner-content]');
      setBannerHeight(Math.max(MIN_BANNER_HEIGHT, ...Array.from(contents, (node) => node.scrollHeight + 2)));
      const bottom = root.getBoundingClientRect().bottom;
      const paneTop = root.closest('.pane')?.getBoundingClientRect().top ?? 0;
      setAvailableHeight(Math.max(MIN_BANNER_HEIGHT, bottom - paneTop - 4));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(root);
    root.querySelectorAll('[data-queue-banner-content]').forEach((node) => observer?.observe(node));
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [ids, mounted]);

  useLayoutEffect(() => {
    // Start with the first queued message so overflow can be read by scrolling down.
    // Content updates must not reset a scroll position chosen by the user.
    if (spread && viewportRef.current) viewportRef.current.scrollTop = 0;
  }, [spread]);

  useEffect(() => {
    if (!pointerInside) return;
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const rect = viewportRef.current?.getBoundingClientRect();
      // The whole expanded rectangle owns its gaps, not just the individual cards.
      if (rect && (event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom)) setPointerInside(false);
    };
    const leaveWindow = () => setPointerInside(false);
    document.addEventListener('pointermove', move);
    window.addEventListener('blur', leaveWindow);
    return () => { document.removeEventListener('pointermove', move); window.removeEventListener('blur', leaveWindow); };
  }, [pointerInside]);

  if (!mounted) return null;
  const currentItems = new Map(items.map((item) => [item.id, item.content]));
  return (
    <div
      ref={(node) => { rootRef.current = node; if (containerRef) containerRef.current = node; }}
      className={styles.stack}
      data-testid="chat-queued-send-strip"
      role="region"
      aria-label={label}
      tabIndex={0}
      data-expanded={expanded}
      style={{
        '--chat-queue-banner-height': `${bannerHeight}px`,
        '--chat-queue-reserve': `${bannerHeight + Math.min(Math.max(count - 1, 0), 2) * 12}px`,
        '--chat-queue-column-height': `${fullHeight}px`,
        '--chat-queue-viewport-height': `${Math.min(fullHeight, expandedHeightLimit(bannerHeight), availableHeight)}px`,
      } as CSSProperties}
      onPointerEnter={(event) => { if (event.pointerType !== 'touch') setPointerInside(true); }}
      onFocusCapture={() => setFocusInside(true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusInside(false); }}
      onDragLeave={onDragLeave}
    >
      <div ref={viewportRef} className={styles.viewport}>
        <div className={styles.column}>
          {banners.map((banner) => {
            const inactive = banner.phase === 'exit' || (!spread && banner.depth > 0);
            return (
              <div
                key={banner.id}
                className={styles.banner}
                data-testid="queued-send-banner"
                data-depth={banner.depth}
                data-phase={banner.phase}
                data-overflow={banner.depth > 2}
                aria-hidden={inactive || undefined}
                ref={(node) => { if (node) node.inert = inactive; }}
                style={{ '--chat-queue-depth': Math.min(banner.depth, 3), '--chat-queue-offset': `${banner.depth * (bannerHeight + SPREAD_GAP)}px`, zIndex: banner.phase === 'exit' ? 0 : Math.max(1, liveCount - banner.depth) } as CSSProperties}
              >
                <div data-queue-banner-content="">{currentItems.get(banner.id) ?? banner.content}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
