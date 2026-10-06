/**
 * Stable DOM anchor used when an in-chat control swaps content with a
 * different height. Prefer the first visible message; the named control is a
 * fallback for hosts without usable viewport geometry.
 */
export interface ElementScrollAnchor {
  root: HTMLElement;
  anchorId: string | null;
  viewportTop: number;
}

const CONTROL_ATTRIBUTE = 'data-chat-preserve-scroll-anchor';
const ANCHOR_ATTRIBUTE = 'data-chat-scroll-anchor';
const MESSAGE_SELECTOR = '[data-chat-message-id], [data-assistant-message-id]';

function anchorInRoot(root: HTMLElement, anchorId: string): HTMLElement | null {
  return Array.from(root.querySelectorAll<HTMLElement>(`[${ANCHOR_ATTRIBUTE}]`)).find(
    (candidate) => candidate.getAttribute(ANCHOR_ATTRIBUTE) === anchorId,
  ) ?? null;
}

export function captureElementScrollAnchor(
  container: HTMLElement,
  eventTarget: HTMLElement,
): ElementScrollAnchor | null {
  const control = eventTarget.closest<HTMLElement>(`[${CONTROL_ATTRIBUTE}]`);
  if (!control || !container.contains(control)) return null;
  const anchorId = control.getAttribute(CONTROL_ATTRIBUTE);
  const root = control.closest<HTMLElement>('[data-form-id]');
  if (!anchorId || !root) return null;

  // Preserve what the user was reading, not the control that caused the
  // relayout. A stepped question can replace a short body with a tall one (or
  // vice versa); pinning its footer / "own answer" row converts that local
  // height delta into a scrollTop jump for every message above it.
  const containerRect = container.getBoundingClientRect();
  if (containerRect.bottom > containerRect.top) {
    for (const candidate of container.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR)) {
      const rect = candidate.getBoundingClientRect();
      if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
        return {
          root: candidate,
          anchorId: null,
          viewportTop: rect.top,
        };
      }
    }
  }

  // Geometry-less environments and legacy hosts may not expose message
  // bounds. Retain the existing named-control fallback so these interactions
  // still preserve a stable local element rather than doing nothing.
  const anchor = anchorInRoot(root, anchorId);
  if (!anchor) return null;
  return {
    root,
    anchorId,
    viewportTop: anchor.getBoundingClientRect().top,
  };
}

export function scrollTopForElementScrollAnchor(
  container: HTMLElement,
  snapshot: ElementScrollAnchor,
): number | null {
  if (!snapshot.root.isConnected || !container.contains(snapshot.root)) return null;
  const anchor = snapshot.anchorId === null
    ? snapshot.root
    : anchorInRoot(snapshot.root, snapshot.anchorId);
  if (!anchor) return null;
  return Math.max(
    0,
    container.scrollTop + anchor.getBoundingClientRect().top - snapshot.viewportTop,
  );
}
