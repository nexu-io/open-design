// Virtualized deck thumbnail rail (film strip) for the deck preview.
//
// The naive shape — one `<iframe srcDoc={whole deck}>` per slide, all mounted
// eagerly — made every deck open execute the full deck N+1 times: N×
// buildSrcdoc on every source change plus N live documents each running every
// slide's scripts, fonts and animations. On real decks that saturates main
// thread and compositor (the user-visible symptom is the stage and rail
// blacking out under GPU memory pressure).
//
// Contract:
// - srcdoc strings are built LAZILY, once per slide, only when that slide's
//   thumbnail actually needs a live iframe; cached until `buildThumbSrcDoc`
//   identity changes (i.e. the deck source changed).
// - Only thumbnails near the rail viewport hold a live iframe; far-away
//   slides render an empty numbered frame. Once seen, a slide stays mounted
//   while it remains inside the recently-visible LRU window so scrolling back
//   never re-parses the document; the cap bounds worst-case (100-slide)
//   decks. The active slide is always mounted so navigation never lands on an
//   empty frame.
// - Thumbnail documents are built by the host with `freezeMotion` so looping
//   deck animations settle at their final frame instead of keeping N
//   compositor layers rasterizing forever.

import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useT } from '../i18n';
import { useInView } from './plugins-home/useInView';
import { DeckSlideThumbnail } from './DeckSlideThumbnail';
import type { ParsedDeckThumbnails } from '../runtime/deck-thumbnail-parser';

/**
 * Upper bound on concurrently mounted thumbnail iframes. Currently-visible
 * thumbnails and the active slide are never evicted, so the effective cap is
 * `max(cap, visible + active)`; the constant only bounds the keep-alive tail
 * for very long decks.
 */
export const MOUNTED_THUMBNAIL_CAP = 16;

/**
 * Pure LRU step for the set of thumbnail indices that keep a live iframe.
 *
 * `prevOrder` is the previous mounted list in least→most recently relevant
 * order. Every currently `visible` index plus `activeIndex` moves to the
 * most-recent end; anything beyond `cap` falls off the least-recent end
 * unless it is visible or active right now. Indices outside `[0, count)` are
 * dropped (deck shrank). Returns `prevOrder` itself when nothing changed so
 * callers can bail out of state updates by identity.
 */
export function nextMountedThumbnails(
  prevOrder: readonly number[],
  visible: ReadonlySet<number>,
  activeIndex: number,
  count: number,
  cap: number = MOUNTED_THUMBNAIL_CAP,
): readonly number[] {
  const pinned = new Set<number>();
  for (const index of visible) {
    if (index >= 0 && index < count) pinned.add(index);
  }
  if (activeIndex >= 0 && activeIndex < count) pinned.add(activeIndex);

  const stale = prevOrder.filter((index) => index >= 0 && index < count && !pinned.has(index));
  const next = [...stale, ...[...pinned].sort((a, b) => a - b)];
  const evictable = Math.max(0, next.length - Math.max(cap, pinned.size));
  const bounded = evictable > 0 ? next.slice(evictable) : next;

  if (
    bounded.length === prevOrder.length
    && bounded.every((index, i) => index === prevOrder[i])
  ) {
    return prevOrder;
  }
  return bounded;
}

interface DeckThumbnailItemProps {
  index: number;
  active: boolean;
  mounted: boolean;
  label: string;
  listRef: RefObject<HTMLDivElement | null>;
  /**
   * Parsed deck for shadow-root single-slide rendering. When present a mounted
   * thumbnail renders a `<DeckSlideThumbnail>`; when null it falls back to the
   * full-deck iframe built by `getSrcDoc`.
   */
  parsedDeck: ParsedDeckThumbnails | null;
  getSrcDoc: (index: number) => string;
  onSelect: (index: number) => void;
  onVisibilityChange: (index: number, inView: boolean) => void;
}

const DeckThumbnailItem = memo(function DeckThumbnailItem({
  index,
  active,
  mounted,
  label,
  listRef,
  parsedDeck,
  getSrcDoc,
  onSelect,
  onVisibilityChange,
}: DeckThumbnailItemProps) {
  // `once: false` so scrolling a thumbnail far away releases its slot in the
  // LRU window instead of pinning every slide ever seen. The list is the
  // observation root: thumbnails clipped by its overflow never intersect the
  // viewport, so a viewport root could not pre-mount the ones just below the
  // fold.
  const { ref, inView } = useInView<HTMLButtonElement>({
    once: false,
    rootMargin: '320px',
    root: listRef,
  });
  useEffect(() => {
    onVisibilityChange(index, inView);
  }, [index, inView, onVisibilityChange]);
  useEffect(() => () => onVisibilityChange(index, false), [index, onVisibilityChange]);

  // If the shadow build throws for this slide, drop to the iframe fallback.
  // Reset when the deck source (parsedDeck identity) or index changes so a new
  // deck retries the cheap path.
  const [shadowFailed, setShadowFailed] = useState(false);
  useEffect(() => setShadowFailed(false), [parsedDeck, index]);
  const useShadow = parsedDeck !== null && !shadowFailed;
  const [thumbnailReady, setThumbnailReady] = useState(false);
  useEffect(() => {
    setThumbnailReady(false);
  }, [mounted, useShadow, parsedDeck, index]);
  const handleThumbnailReady = useCallback(() => setThumbnailReady(true), []);
  const handleShadowError = useCallback(() => {
    setThumbnailReady(false);
    setShadowFailed(true);
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      className={`deck-thumbnail-button${active ? ' active' : ''}`}
      aria-current={active ? 'true' : undefined}
      title={label}
      onClick={() => onSelect(index)}
    >
      <span className="deck-thumbnail-number">{index + 1}</span>
      <span className="deck-thumbnail-frame" aria-hidden="true">
        {mounted ? (
          useShadow ? (
            <DeckSlideThumbnail
              parsed={parsedDeck}
              index={index}
              onError={handleShadowError}
              onReady={handleThumbnailReady}
            />
          ) : (
            <iframe
              title={label}
              sandbox="allow-scripts allow-downloads"
              srcDoc={getSrcDoc(index)}
              tabIndex={-1}
              onLoad={handleThumbnailReady}
            />
          )
        ) : null}
        {mounted && !thumbnailReady ? (
          <span className="deck-thumbnail-loading" aria-hidden="true" />
        ) : null}
      </span>
    </button>
  );
});

export interface DeckThumbnailRailProps {
  /** Number of slides to list. */
  count: number;
  /** Active slide index (highlighted + always mounted). */
  activeIndex: number;
  /** Display total for the per-slide accessibility label. */
  labelTotal: number;
  /**
   * Build the per-slide thumbnail document. Must be referentially stable for
   * a given deck source — its identity is the srcdoc cache key. Used only for
   * the iframe fallback (when `parsedDeck` is null or a slide fails to render).
   */
  buildThumbSrcDoc: (index: number) => string;
  /**
   * Parsed deck for shadow-root single-slide thumbnails. Null → every mounted
   * thumbnail uses the iframe fallback (decks we can't statically render).
   */
  parsedDeck?: ParsedDeckThumbnails | null;
  onSelect: (index: number) => void;
}

export const DeckThumbnailRail = memo(function DeckThumbnailRail({
  count,
  activeIndex,
  labelTotal,
  buildThumbSrcDoc,
  parsedDeck = null,
  onSelect,
}: DeckThumbnailRailProps) {
  const t = useT();
  const listRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState<ReadonlySet<number>>(() => new Set());
  const [mountedOrder, setMountedOrder] = useState<readonly number[]>([]);

  const onVisibilityChange = useCallback((index: number, inView: boolean) => {
    setVisible((prev) => {
      if (prev.has(index) === inView) return prev;
      const next = new Set(prev);
      if (inView) next.add(index);
      else next.delete(index);
      return next;
    });
  }, []);

  useEffect(() => {
    setMountedOrder((prev) => nextMountedThumbnails(prev, visible, activeIndex, count));
  }, [visible, activeIndex, count]);

  // Render-phase memo cache: one srcdoc per slide per deck source. A plain
  // Map (not per-item useMemo) so slides share the cache across LRU
  // mount/unmount churn.
  const srcDocCache = useMemo(() => new Map<number, string>(), [buildThumbSrcDoc]);
  const getSrcDoc = useCallback((index: number) => {
    let doc = srcDocCache.get(index);
    if (doc === undefined) {
      doc = buildThumbSrcDoc(index);
      srcDocCache.set(index, doc);
    }
    return doc;
  }, [srcDocCache, buildThumbSrcDoc]);

  const mounted = useMemo(() => new Set(mountedOrder), [mountedOrder]);

  return (
    <aside className="deck-thumbnail-rail" aria-label="Slides">
      <div className="deck-thumbnail-list" ref={listRef}>
        {Array.from({ length: count }, (_, index) => (
          <DeckThumbnailItem
            key={index}
            index={index}
            active={index === activeIndex}
            mounted={mounted.has(index)}
            label={t('fileViewer.speakerNotesSlide', {
              current: index + 1,
              total: labelTotal,
            })}
            listRef={listRef}
            parsedDeck={parsedDeck}
            getSrcDoc={getSrcDoc}
            onSelect={onSelect}
            onVisibilityChange={onVisibilityChange}
          />
        ))}
      </div>
    </aside>
  );
});
