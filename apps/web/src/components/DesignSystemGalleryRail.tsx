import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@open-design/components';
import { useI18n } from '../i18n';
import { RemixIcon } from './RemixIcon';
import styles from './DesignSystemsTab.module.css';

export function DesignSystemGalleryRail({ children, enabled = true }: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const { t } = useI18n();
  const railId = useId();
  const railRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ previous: false, next: false });
  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail || !enabled) return;
    const position = Math.abs(rail.scrollLeft);
    const maximum = rail.scrollWidth - rail.clientWidth;
    const previous = maximum > 1 && position > 1;
    const next = maximum > 1 && position < maximum - 1;
    setEdges((current) => current.previous === previous && current.next === next
      ? current : { previous, next });
  }, [enabled]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !enabled || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [enabled, measure]);

  // Filtering changes the scroll extent even when the viewport stays the same.
  useEffect(measure, [children, measure]);

  const move = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    const first = rail.children[0] as HTMLElement | undefined;
    const second = rail.children[1] as HTMLElement | undefined;
    const pitch = first && second ? Math.abs(second.offsetLeft - first.offsetLeft) : first?.offsetWidth;
    const distance = pitch ? Math.max(1, Math.floor(rail.clientWidth / pitch)) * pitch : rail.clientWidth;
    const sign = getComputedStyle(rail).direction === 'rtl' ? -1 : 1;
    rail.scrollBy({
      left: direction * sign * distance,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  const overflowing = edges.previous || edges.next;
  return (
    <div className={styles.galleryCarousel}>
      <div ref={railRef} id={railId} className={styles.galleryRail}
        data-testid="design-systems-list" onScroll={measure}>
        {children}
      </div>
      <div className={`${styles.galleryEdge} ${styles.galleryEdgePrevious}`}
        hidden={!edges.previous} data-active={edges.previous}>
        <Button variant="ghost" className={styles.galleryArrow}
          data-testid="design-systems-previous" aria-label={t('designFiles.prev')}
          aria-controls={railId} disabled={!edges.previous} onClick={() => move(-1)}>
          <RemixIcon name="arrow-drop-left-line" size={28} />
        </Button>
      </div>
      <div className={`${styles.galleryEdge} ${styles.galleryEdgeNext}`}
        hidden={!overflowing} data-active={edges.next}>
        <Button variant="ghost" className={styles.galleryArrow}
          data-testid="design-systems-next" aria-label={t('designFiles.next')}
          aria-controls={railId} disabled={!edges.next} onClick={() => move(1)}>
          <RemixIcon name="arrow-drop-right-line" size={28} />
        </Button>
      </div>
    </div>
  );
}
