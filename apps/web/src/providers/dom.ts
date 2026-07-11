// Thin browser-global reads/subscriptions for the chat-pane slice. Kept as a
// provider (not inlined in a feature) so `features/**` stays DOM-free per the
// `check-web-slice-boundaries` guard — the slice reaches this only through its
// own port + `dependencies.ts`.

/** The document body, or `null` outside the browser (SSR). */
export function getDocumentBody(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.body;
}

/** Rect the composer's portal layer should be positioned at, relative to
 *  `slot`'s box and the viewport's bottom edge. */
export interface ComposerPortalRect {
  left: number;
  width: number;
  bottom: number;
}

/**
 * Watches `slot`'s box (and its `.pane` ancestor, and viewport resize) and
 * reports the composer portal's target rect on every change. A no-op
 * subscription outside the browser (SSR).
 */
export function subscribeComposerPortalRect(
  slot: HTMLElement,
  onRect: (rect: ComposerPortalRect) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  let frame: number | null = null;
  const updateRect = () => {
    frame = null;
    const rect = slot.getBoundingClientRect();
    onRect({
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      bottom: Math.max(0, Math.round(window.innerHeight - rect.bottom)),
    });
  };
  const scheduleUpdate = () => {
    if (frame !== null) return;
    frame = window.requestAnimationFrame(updateRect);
  };
  updateRect();
  const resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleUpdate)
      : null;
  resizeObserver?.observe(slot);
  const pane = slot.closest('.pane');
  if (pane) resizeObserver?.observe(pane);
  window.addEventListener('resize', scheduleUpdate);
  window.visualViewport?.addEventListener('resize', scheduleUpdate);
  return () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    window.removeEventListener('resize', scheduleUpdate);
    window.visualViewport?.removeEventListener('resize', scheduleUpdate);
  };
}

/**
 * Watches `layer`'s box height and reports it on every change. A no-op
 * subscription outside the browser (SSR).
 */
export function subscribeComposerLayerHeight(
  layer: HTMLElement,
  onHeight: (height: number) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  let frame: number | null = null;
  const updateHeight = () => {
    frame = null;
    onHeight(Math.ceil(layer.getBoundingClientRect().height));
  };
  const scheduleUpdate = () => {
    if (frame !== null) return;
    frame = window.requestAnimationFrame(updateHeight);
  };
  updateHeight();
  const resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleUpdate)
      : null;
  resizeObserver?.observe(layer);
  return () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
  };
}

/**
 * Fires `onClose` on a `mousedown` outside `container.current`, or on
 * Escape anywhere. A no-op subscription outside the browser (SSR).
 */
export function subscribeOutsideClickOrEscape(
  container: { current: HTMLElement | null },
  onClose: () => void,
): () => void {
  if (typeof document === 'undefined') return () => {};
  function onPointer(e: MouseEvent) {
    const target = e.target as Node;
    if (container.current?.contains(target)) return;
    onClose();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
  document.addEventListener('mousedown', onPointer);
  document.addEventListener('keydown', onKey);
  return () => {
    document.removeEventListener('mousedown', onPointer);
    document.removeEventListener('keydown', onKey);
  };
}

/**
 * Adds a `window` event listener for `eventName` and returns the matching
 * removal function. A no-op subscription outside the browser (SSR).
 */
export function subscribeWindowEvent(
  eventName: string,
  onEvent: (event: Event) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(eventName, onEvent);
  return () => window.removeEventListener(eventName, onEvent);
}

/**
 * Fires `onVisible` when the tab regains focus or becomes visible again
 * (e.g. returning from an external AMR sign-in tab) — skipped while the tab
 * itself is hidden, since `visibilitychange` also fires on the way out.
 * A no-op subscription outside the browser (SSR).
 */
export function subscribeVisibleFocusOrVisibilityChange(onVisible: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => {
    if (document.visibilityState === 'hidden') return;
    onVisible();
  };
  window.addEventListener('focus', handler);
  document.addEventListener('visibilitychange', handler);
  return () => {
    window.removeEventListener('focus', handler);
    document.removeEventListener('visibilitychange', handler);
  };
}

/** Runs `callback` every `ms` via `window.setInterval`; the returned
 *  function clears it. A no-op outside the browser (SSR). */
export function scheduleInterval(callback: () => void, ms: number): () => void {
  if (typeof window === 'undefined') return () => {};
  const id = window.setInterval(callback, ms);
  return () => window.clearInterval(id);
}

/** Runs `callback` once after `ms` via `window.setTimeout`; the returned
 *  function cancels it. A no-op outside the browser (SSR). */
export function scheduleTimeout(callback: () => void, ms: number): () => void {
  if (typeof window === 'undefined') return () => {};
  const id = window.setTimeout(callback, ms);
  return () => window.clearTimeout(id);
}

/** Opens `url` in a new tab (`noopener,noreferrer`); a no-op outside the
 *  browser (SSR). */
export function openExternalUrl(url: string): void {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
