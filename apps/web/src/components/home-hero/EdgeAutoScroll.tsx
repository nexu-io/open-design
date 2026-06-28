// Edge hover/click auto-scroll for the Home horizontal rails.
//
// The scenario rail and the example-prompt presets row both overflow
// horizontally. On a trackpad you swipe; without one (a plain mouse on
// Windows/Linux) there's no easy horizontal scroll. These edge zones make the
// overflow reachable: hover an edge to glide continuously, or click it to jump.
//
// Used by both rails so the behavior — and the freeze fix (no `scroll-snap`,
// which fought the per-frame scroll) — stays in one place.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Icon } from '../Icon';

const STEP_PX = 9; // per-frame hover-glide speed
const NUDGE_PX = 332; // click jump (~2 small cards / one large card + gap)

export interface EdgeAutoScroll {
  scrollRef: RefObject<HTMLDivElement>;
  edges: { left: boolean; right: boolean };
  startAutoScroll: (direction: 1 | -1) => void;
  stopAutoScroll: () => void;
  nudge: (direction: 1 | -1) => void;
}

/**
 * Wire a horizontally-scrolling element (assign `scrollRef` to it) with
 * edge-driven auto-scroll. `contentKey` should change whenever the item count
 * changes so the reachable-edge state is re-measured.
 */
export function useEdgeAutoScroll(contentKey?: unknown): EdgeAutoScroll {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [edges, setEdges] = useState<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  });

  const stopAutoScroll = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startAutoScroll = useCallback(
    (direction: 1 | -1) => {
      stopAutoScroll();
      const step = () => {
        const el = scrollRef.current;
        if (!el) return;
        const maxScroll = el.scrollWidth - el.clientWidth;
        el.scrollLeft += direction * STEP_PX;
        const reachedEnd =
          direction < 0 ? el.scrollLeft <= 0 : el.scrollLeft >= maxScroll;
        if (reachedEnd) {
          stopAutoScroll();
          return;
        }
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [stopAutoScroll],
  );

  const nudge = useCallback((direction: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * NUDGE_PX, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const updateEdges = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      setEdges({
        left: el.scrollLeft > 1,
        right: el.scrollLeft < maxScroll - 1,
      });
    };
    updateEdges();
    el.addEventListener('scroll', updateEdges, { passive: true });
    // ResizeObserver is absent in jsdom; the scroll listener still keeps edges
    // fresh, so observing the viewport is a best-effort extra.
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateEdges)
        : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', updateEdges);
      observer?.disconnect();
    };
  }, [contentKey]);

  // Cancel any in-flight glide when the rail unmounts.
  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  return { scrollRef, edges, startAutoScroll, stopAutoScroll, nudge };
}

/**
 * The two edge overlays. Render as siblings of the scroll element inside a
 * `position: relative` wrapper. Each zone is only visible/interactive when
 * there is content to scroll toward (driven by `edges`).
 */
export function EdgeScrollZones({
  edges,
  startAutoScroll,
  stopAutoScroll,
  nudge,
}: Pick<
  EdgeAutoScroll,
  'edges' | 'startAutoScroll' | 'stopAutoScroll' | 'nudge'
>) {
  return (
    <>
      <div
        className="home-hero__rail-edge home-hero__rail-edge--left"
        data-active={edges.left ? 'true' : undefined}
        aria-hidden
        onPointerEnter={() => startAutoScroll(-1)}
        onPointerLeave={stopAutoScroll}
        onPointerDown={stopAutoScroll}
        onClick={() => nudge(-1)}
      >
        <Icon name="chevron-left" size={18} className="home-hero__rail-edge-icon" />
      </div>
      <div
        className="home-hero__rail-edge home-hero__rail-edge--right"
        data-active={edges.right ? 'true' : undefined}
        aria-hidden
        onPointerEnter={() => startAutoScroll(1)}
        onPointerLeave={stopAutoScroll}
        onPointerDown={stopAutoScroll}
        onClick={() => nudge(1)}
      >
        <Icon name="chevron-right" size={18} className="home-hero__rail-edge-icon" />
      </div>
    </>
  );
}
