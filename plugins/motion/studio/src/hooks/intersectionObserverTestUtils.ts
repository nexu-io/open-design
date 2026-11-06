// Test-only IntersectionObserver stand-in: everything observed is reported near the screen, asynchronously.
export function NearScreenIntersectionObserver(callback: IntersectionObserverCallback) {
  const observer = {
    observe(target: Element) {
      queueMicrotask(() =>
        callback(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          observer as unknown as IntersectionObserver,
        ),
      );
    },
    unobserve() {},
    disconnect() {},
  };
  return observer;
}
