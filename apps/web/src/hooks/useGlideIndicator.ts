// Sliding active-item indicator for horizontal tab strips.
//
// Positions one persistent, absolutely-positioned indicator element in the
// scroll container's CONTENT coordinates (left: 0 + translateX + width) so it
// scrolls together with the items. The hook only measures and writes inline
// transform/width; the glide/snap motion itself lives in CSS transitions on
// the indicator element, so a mid-flight retarget (clicking a third tab while
// the pill is still moving) is handled natively by the browser.
//
// Two update paths:
// - Animated: only when `activeKey` changes (a real activation). Also stamps
//   `data-dir="left|right"` for direction-aware stretch keyframes and replays
//   the stretch animation on `pillRef`.
// - Instant: everything else (first measure, layout reflow, ResizeObserver /
//   scroll re-syncs, `frozen`, prefers-reduced-motion) — transition is
//   suppressed for one write so the pill snaps without a fake slide.
//
// Selector-driven and container-generic on purpose: no knowledge of tabs,
// glass, or the workspace shell, so other tab rows can adopt it later.

import { useLayoutEffect, useRef, type RefObject } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export interface GlideIndicatorOptions {
  /** Scroll container hosting the items and the indicator (content coords). */
  containerRef: RefObject<HTMLElement | null>;
  /** Absolutely-positioned indicator shell inside the container. */
  indicatorRef: RefObject<HTMLElement | null>;
  /** Inner element that receives the stretch pulse animation (optional). */
  pillRef?: RefObject<HTMLElement | null>;
  /** Selector for the active item, e.g. '.workspace-tab.is-active'. */
  activeSelector: string;
  /** Identity of the active item. A CHANGE here is the only animated update. */
  activeKey: string | null;
  /** Layout epoch (e.g. item ids joined). A change forces an instant re-measure. */
  layoutKey?: string;
  /** True while drag-reordering: every update instant, stretch suppressed. */
  frozen?: boolean;
  /**
   * Re-sync instantly on container scroll. Needed when the active item is
   * position: sticky — its visual rect diverges from layout coords once the
   * container scrolls, and rect-based measurement must chase it.
   */
  trackScroll?: boolean;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function useGlideIndicator(options: GlideIndicatorOptions): void {
  const {
    containerRef,
    indicatorRef,
    pillRef,
    activeSelector,
    activeKey,
    layoutKey,
    frozen = false,
    trackScroll = false,
  } = options;

  // The key the indicator is currently parked under; null until first apply.
  const appliedKeyRef = useRef<string | null>(null);
  const appliedXRef = useRef(0);
  const appliedWidthRef = useRef(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (!container || !indicator) return undefined;

    // Layout coordinates (offsetLeft) by default: transforms never affect
    // offset*, so in-flight FLIP slides of displaced siblings (the tab
    // strip's drag-reorder effect) can't skew the measurement. Only for a
    // position:sticky active item (trackScroll) do we need the VISUAL rect,
    // because its stuck position diverges from layout coords once the
    // container scrolls — and a sticky item is never FLIP-displaced.
    const measure = (): { x: number; width: number } | null => {
      const active = container.querySelector<HTMLElement>(activeSelector);
      if (!active) return null;
      if (trackScroll) {
        const containerRect = container.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        return {
          x: activeRect.left - containerRect.left + container.scrollLeft,
          width: activeRect.width,
        };
      }
      return { x: active.offsetLeft, width: active.offsetWidth };
    };

    const apply = (animated: boolean) => {
      const measured = measure();
      if (!measured) {
        // Transient: fade the pill out (base CSS keeps opacity 0 without
        // data-ready) and forget the parked key so the next activation is
        // measured fresh instead of sliding in from a stale position.
        delete indicator.dataset.ready;
        appliedKeyRef.current = null;
        return;
      }
      const { x, width } = measured;

      const animate = animated && !frozen && !prefersReducedMotion();
      if (!animate) {
        const prevTransition = indicator.style.transition;
        indicator.style.transition = 'none';
        indicator.style.transform = `translateX(${x}px)`;
        indicator.style.width = `${width}px`;
        // Force the un-transitioned write to commit before restoring.
        void indicator.offsetWidth;
        indicator.style.transition = prevTransition;
        delete indicator.dataset.dir;
      } else {
        indicator.dataset.dir = x >= appliedXRef.current ? 'right' : 'left';
        indicator.style.transform = `translateX(${x}px)`;
        indicator.style.width = `${width}px`;
        const pill = pillRef?.current;
        if (pill) {
          // Replay the stretch keyframe from frame zero on every activation.
          pill.style.animation = 'none';
          void pill.offsetWidth;
          pill.style.animation = '';
        }
      }
      appliedXRef.current = x;
      appliedWidthRef.current = width;
      indicator.dataset.ready = '';
      container.dataset.glideReady = '';
    };

    // Animated only on a real activation change; first-ever measure and
    // layout-only epochs (tab add/close/reorder) position instantly.
    const isActivation =
      appliedKeyRef.current !== null && activeKey !== null && appliedKeyRef.current !== activeKey;
    apply(isActivation);
    appliedKeyRef.current = activeKey;

    // Re-sync instantly on any size change of the container or the active
    // item (window resize, tabs shrinking toward min-width on overflow, …).
    // ResizeObserver fires an initial report for every observe() call — that
    // one arrives right after the animated apply above and would kill the
    // in-flight transition, so a sync only lands when the measurement really
    // moved away from what was last applied.
    let frame = 0;
    const requestSync = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const measured = measure();
        if (
          measured &&
          Math.abs(measured.x - appliedXRef.current) < 0.5 &&
          Math.abs(measured.width - appliedWidthRef.current) < 0.5
        ) {
          return;
        }
        apply(false);
      });
    };
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(requestSync);
    if (resizeObserver) {
      resizeObserver.observe(container);
      const active = container.querySelector<HTMLElement>(activeSelector);
      if (active) resizeObserver.observe(active);
    }
    if (trackScroll) container.addEventListener('scroll', requestSync, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      if (trackScroll) container.removeEventListener('scroll', requestSync);
    };
  }, [containerRef, indicatorRef, pillRef, activeSelector, activeKey, layoutKey, frozen, trackScroll]);
}
