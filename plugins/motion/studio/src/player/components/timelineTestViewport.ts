/** Configure the shared viewport geometry used by timeline gesture hook tests. */
export function configureTimelineTestViewport(scroll: HTMLElement, scrollHeight: number): void {
  scroll.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 800, bottom: 240, width: 800, height: 240 }) as DOMRect;
  Object.defineProperties(scroll, {
    scrollLeft: { configurable: true, writable: true, value: 0 },
    scrollTop: { configurable: true, writable: true, value: 0 },
    scrollWidth: { configurable: true, value: 10_000 },
    scrollHeight: { configurable: true, value: scrollHeight },
    clientWidth: { configurable: true, value: 800 },
    clientHeight: { configurable: true, value: 240 },
  });
}
