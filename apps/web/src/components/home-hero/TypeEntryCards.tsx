// Shared Home entry cards for both browser and desktop shells.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Button } from '@open-design/components';
import type { HomeHeroChip } from './chips';
import { HOME_TYPE_ROW_IDS, HOME_TYPE_ROW_MORE_IDS } from './chips';
import type { TemplateDemo } from '../CommunityTemplatePreview';
import { TemplateThumb } from '../CommunityView';
import { Icon } from '../Icon';
import { useT } from '../../i18n';
import styles from './TypeEntryCards.module.css';

interface Props {
  chips: HomeHeroChip[];
  disabled?: boolean;
  labelFor: (chipId: string) => string;
  descriptionFor: (chipId: string) => string;
  /** A community template per type id, whose poster and title dress that
   *  type's cover in the scrolling row. Types without one fall back to their
   *  icon and description. */
  covers?: Partial<Record<string, TemplateDemo>>;
  onPick: (chip: HomeHeroChip) => void;
}

export function TypeEntryCards({
  chips,
  disabled,
  labelFor,
  descriptionFor,
  covers,
  onPick,
}: Props) {
  const t = useT();
  const byId = (ids: readonly string[]) =>
    ids
      .map((id) => chips.find((chip) => chip.id === id))
      .filter((chip): chip is HomeHeroChip => Boolean(chip));
  const mainChips = byId(HOME_TYPE_ROW_IDS);
  const imageChip = chips.find((chip) => chip.id === 'image');
  const moreChips = byId(HOME_TYPE_ROW_MORE_IDS).filter((chip) => chip.id !== 'image');

  if (mainChips.length === 0 && moreChips.length === 0) return null;

  return (
    <div className={styles.root} data-testid="home-hero-type-cards">
      <div className={styles.grid}>
        <div className={styles.stack}>
          {mainChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={styles.card}
              data-type={chip.id}
              disabled={disabled}
              data-testid={`home-hero-type-card-${chip.id}`}
              onClick={() => onPick(chip)}
            >
              <span className={styles.copy}>
                <span className={styles.iconBadge} data-type={chip.id}>
                  <Icon name={chip.icon} size={18} />
                </span>
                <span className={styles.title}>
                  {labelFor(chip.id)}
                  <Icon name="chevron-right" size={16} />
                </span>
                <span className={styles.desc}>{descriptionFor(chip.id)}</span>
              </span>
              {chip.id === 'prototype' ? <PrototypeArt /> : null}
            </button>
          ))}
        </div>
        <div className={styles.side}>
          {imageChip ? (
            <button
              type="button"
              className={`${styles.card} ${styles.imageCard}`}
              data-type="image"
              disabled={disabled}
              data-testid="home-hero-type-card-image"
              onClick={() => onPick(imageChip)}
            >
              <span className={styles.copy}>
                <span className={styles.iconBadge} data-type="image">
                  <Icon name={imageChip.icon} size={18} />
                </span>
                <span className={styles.title}>
                  {labelFor(imageChip.id)}
                  <Icon name="chevron-right" size={16} />
                </span>
                <span className={styles.desc}>{descriptionFor(imageChip.id)}</span>
              </span>
              <ImageArt />
            </button>
          ) : null}
        </div>
      </div>
      {moreChips.length > 0 ? (
        <CoverCarousel label={t('homeHero.subTypeMore')}>
          {moreChips.map((chip) => {
            const cover = covers?.[chip.id];
            return (
              <button
                key={chip.id}
                type="button"
                className={styles.coverCard}
                disabled={disabled}
                data-testid={`home-hero-type-pill-${chip.id}-more`}
                onClick={() => onPick(chip)}
              >
                <span className={styles.cover}>
                  {cover ? (
                    <span className={styles.coverThumb} aria-hidden>
                      <TemplateThumb template={cover} />
                    </span>
                  ) : (
                    <span className={styles.coverFallback} aria-hidden>
                      <Icon name={chip.icon} size={28} />
                    </span>
                  )}
                  <span className={styles.coverBadge}>
                    <Icon name={chip.icon} size={14} />
                    {labelFor(chip.id)}
                  </span>
                </span>
                <span className={styles.coverTitle}>{cover?.title ?? descriptionFor(chip.id)}</span>
              </button>
            );
          })}
        </CoverCarousel>
      ) : null}
    </div>
  );
}

/** Three and a half covers per view, paged sideways with the edge arrows (or a swipe /
 *  trackpad scroll). Each arrow shows only while there is more in its
 *  direction. */
function CoverCarousel({ label, children }: { label: string; children: ReactNode }) {
  const t = useT();
  const trackRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ prev: false, next: false });
  const syncEdges = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setEdges({
      prev: track.scrollLeft > 1,
      next: track.scrollLeft + track.clientWidth < track.scrollWidth - 1,
    });
  }, []);
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    syncEdges();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(syncEdges);
    observer.observe(track);
    return () => observer.disconnect();
  }, [syncEdges]);
  const page = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    track.scrollBy({ left: direction * track.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' });
  };
  return (
    <div className={styles.carousel} role="group" aria-label={label}>
      <div ref={trackRef} className={styles.carouselTrack} onScroll={syncEdges}>
        {children}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className={`${styles.carouselArrow} ${styles.carouselArrowPrev}${edges.prev ? ` ${styles.isShown}` : ''}`}
        aria-label={t('homeHero.typeCoversScrollPrev')}
        tabIndex={edges.prev ? 0 : -1}
        onClick={() => page(-1)}
      >
        <Icon name="chevron-left" size={18} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={`${styles.carouselArrow} ${styles.carouselArrowNext}${edges.next ? ` ${styles.isShown}` : ''}`}
        aria-label={t('homeHero.typeCoversScrollNext')}
        tabIndex={edges.next ? 0 : -1}
        onClick={() => page(1)}
      >
        <Icon name="chevron-right" size={18} />
      </Button>
    </div>
  );
}

// Wireframe app window tucked into the prototype card's bottom-right corner;
// its right and bottom edges are open so they run off the card.
function PrototypeArt() {
  // On card hover the strokes trace in (frame → header → sidebar → panels) and
  // the filled blocks settle in after them; at rest the drawing is complete.
  return (
    <svg className={styles.cornerArt} width="216" height="88" viewBox="0 0 216 88" fill="none" aria-hidden>
      <path d="M215.5 0.5H12.5C5.87258 0.5 0.5 5.87258 0.5 12.5V87" stroke="currentColor" pathLength={1} className={styles.drawLine} style={{ '--draw-i': 0 } as CSSProperties} />
      <path d="M0.5 28.5H215.5" stroke="currentColor" pathLength={1} className={styles.drawLine} style={{ '--draw-i': 1 } as CSSProperties} />
      <path d="M34.5 87.5L34.5 28.5" stroke="currentColor" pathLength={1} className={styles.drawLine} style={{ '--draw-i': 2 } as CSSProperties} />
      <path d="M48.5 37H126.5C130.642 37 134 40.3579 134 44.5V75.5C134 79.6421 130.642 83 126.5 83H48.5C44.3579 83 41 79.6421 41 75.5V44.5C41 40.3579 44.3579 37 48.5 37Z" stroke="currentColor" pathLength={1} className={styles.drawLine} style={{ '--draw-i': 3 } as CSSProperties} />
      <path d="M215.5 36.5H145.5C141.082 36.5 137.5 40.0817 137.5 44.5V75.5C137.5 79.9183 141.082 83.5 145.5 83.5H215.5" stroke="currentColor" pathLength={1} className={styles.drawLine} style={{ '--draw-i': 4 } as CSSProperties} />
      <rect x="6.5" y="11.5" width="8" height="8" rx="4" fill="currentColor" className={styles.drawFill} style={{ '--draw-i': 0 } as CSSProperties} />
      <rect x="19.5" y="11.5" width="8" height="8" rx="4" fill="currentColor" className={styles.drawFill} style={{ '--draw-i': 1 } as CSSProperties} />
      <rect x="32.5" y="11.5" width="8" height="8" rx="4" fill="currentColor" className={styles.drawFill} style={{ '--draw-i': 2 } as CSSProperties} />
      <rect x="6.5" y="36.5" width="21" height="21" rx="2.08" fill="currentColor" className={styles.drawFill} style={{ '--draw-i': 3 } as CSSProperties} />
      <rect x="6.5" y="62.5" width="21" height="21" rx="2.08" fill="currentColor" className={styles.drawFill} style={{ '--draw-i': 4 } as CSSProperties} />
    </svg>
  );
}

function ImageArt() {
  return (
    <svg className={`${styles.cornerArt} ${styles.imageArt}`} width="237" height="127" viewBox="0 0 237 127" fill="none" aria-hidden="true">
      <path d="M235.5 0.5H12.5C5.87258 0.5 0.5 5.87258 0.5 12.5V126.5" stroke="currentColor" pathLength={1} className={styles.drawLine} style={{ '--draw-i': 0 } as CSSProperties} />
      <path d="M0.5 28L235.5 28" stroke="currentColor" pathLength={1} className={styles.drawLine} style={{ '--draw-i': 1 } as CSSProperties} />
      <path d="M53.5 126.5L115.132 72.037L174.868 103.833L236.5 58.5" stroke="currentColor" pathLength={1} className={styles.drawLine} style={{ '--draw-i': 2 } as CSSProperties} />
      <rect x="10.5" y="10.5" width="7" height="7" rx="3.5" fill="currentColor" className={styles.drawFill} style={{ '--draw-i': 0 } as CSSProperties} />
      <rect x="22.5" y="10.5" width="7" height="7" rx="3.5" fill="currentColor" className={styles.drawFill} style={{ '--draw-i': 1 } as CSSProperties} />
      <rect x="34.5" y="10.5" width="7" height="7" rx="3.5" fill="currentColor" className={styles.drawFill} style={{ '--draw-i': 2 } as CSSProperties} />
      <rect x="37.5" y="42.5" width="30" height="30" rx="15" fill="currentColor" className={styles.drawFill} style={{ '--draw-i': 3 } as CSSProperties} />
    </svg>
  );
}
