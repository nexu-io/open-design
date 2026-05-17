// IntersectionObserver-backed visibility hook used by the plugin
// preview tiles to defer expensive work — image fetches, srcDoc
// iframes, autoplaying video — until the card actually scrolls
// into view. Once a tile has been visible at least once we keep it
// "armed" so re-scrolling does not cause repeated mount churn.
//
// Centralised here so every preview variant (media / iframe /
// design-system) shares one lazy-mount contract. Tests can stub
// IntersectionObserver to force eager mounting.

import { useEffect, useRef, useState } from 'react';

export interface UseInViewOptions {
  rootMargin?: string;
  /** Stop observing after the first time the node becomes visible. */
  once?: boolean;
}

export function useInView<T extends Element = HTMLElement>(
  options: UseInViewOptions = {},
): { ref: React.MutableRefObject<T | null>; inView: boolean } {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (options.once !== false) {
              observer.disconnect();
            }
          } else if (options.once === false) {
            setInView(false);
          }
        }
      },
      { rootMargin: options.rootMargin ?? '240px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [options.once, options.rootMargin]);

  return { ref, inView };
}
