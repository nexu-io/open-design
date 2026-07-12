// In-memory (module-singleton) cache mapping a preview surface's key to its
// last-known deck slide state (active index + total slide count), so
// switching files/tabs and back — which remounts the preview iframe — restores
// the deck to wherever the user left it instead of snapping back to slide 0.
// A plain JS Map is not DOM/transport, so it may live in the slice (mirrors
// `viewport-cache.ts`); capped LRU-by-insertion eviction keeps memory bounded
// across a long session.
import type { SlideState } from './types';

const MAX_CACHED_SLIDE_STATES = 64;
const slideStateCache = new Map<string, SlideState>();

export function getCachedSlideState(key: string): SlideState | undefined {
  return slideStateCache.get(key);
}

export function setCachedSlideState(key: string, state: SlideState): void {
  slideStateCache.set(key, state);
  if (slideStateCache.size > MAX_CACHED_SLIDE_STATES) {
    const oldest = slideStateCache.keys().next().value;
    if (oldest != null) slideStateCache.delete(oldest);
  }
}
