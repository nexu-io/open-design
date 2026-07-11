// Browser-side bridge for measuring an element's box (width/height/scroll
// offset) and re-measuring on resize/scroll. Lives in providers/ because it
// touches `ResizeObserver`/`window`; slice hooks reach it through an injected
// port so they stay DOM-free and unit-testable.
export type ElementSize = { width: number; height: number; scrollLeft?: number; scrollTop?: number };

export function observeElementSize(
  el: HTMLElement,
  onMeasure: (size: ElementSize) => void,
): () => void {
  const measure = () => {
    const rect = el.getBoundingClientRect();
    onMeasure({
      width: rect.width,
      height: rect.height,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    });
  };
  measure();
  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure);
    observer.observe(el);
  }
  el.addEventListener('scroll', measure, { passive: true });
  if (typeof window !== 'undefined') window.addEventListener('resize', measure);
  return () => {
    observer?.disconnect();
    el.removeEventListener('scroll', measure);
    if (typeof window !== 'undefined') window.removeEventListener('resize', measure);
  };
}
