// Browser-side bridge for the deck/slide-nav postMessage protocol between the
// host and the preview iframe: `od:slide` (host -> iframe: next/prev/first/
// last, or an explicit `go`+index) and `od:slide-state` (iframe -> host:
// active index + total count). Also owns the host-side deck keyboard
// shortcut (←/→/PageUp/PageDown/Home/End), which posts through the same
// channel. Lives in providers/ because it touches `window`/`document`; the
// slice hook reaches it through an injected port so it stays DOM-free and
// unit-testable.
import type { DeckSlideAction } from '../../features/file-viewer';

/** Post a nav action ('next'/'prev'/'first'/'last') to the iframe's contentWindow. */
export function postSlideAction(iframe: HTMLIFrameElement | null, action: DeckSlideAction): void {
  const win = iframe?.contentWindow;
  if (!win) return;
  win.postMessage({ type: 'od:slide', action }, '*');
}

/** Post an explicit slide index ('go') to the iframe's contentWindow. */
export function postSlideIndex(iframe: HTMLIFrameElement | null, index: number): void {
  const win = iframe?.contentWindow;
  if (!win) return;
  win.postMessage({ type: 'od:slide', action: 'go', index }, '*');
}

/**
 * Subscribe to the preview iframe's `od:slide-state` reports (active index +
 * total count), filtered to message sources the caller accepts. Returns an
 * unsubscribe function.
 */
export function subscribeSlideState(
  isAcceptedSource: (source: MessageEventSource | null) => boolean,
  onSlideState: (state: { active: number; count: number }) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  function onMessage(ev: MessageEvent) {
    if (!isAcceptedSource(ev.source)) return;
    const data = ev?.data as { type?: string; active?: number; count?: number } | null;
    if (!data || data.type !== 'od:slide-state') return;
    if (typeof data.active !== 'number' || typeof data.count !== 'number') return;
    onSlideState({ active: data.active, count: data.count });
  }
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

/**
 * Subscribe to the host-side deck keyboard shortcuts (←/→/PageUp/PageDown for
 * prev/next, Home/End for first/last). Skips when the preview iframe itself
 * has focus, or when the keydown's target is a text input/textarea/
 * contenteditable element, so typing in the chat composer or any other host
 * control never hijacks arrow keys.
 */
export function subscribeDeckKeyboardNav(
  getPreviewIframe: () => HTMLIFrameElement | null,
  onAction: (action: DeckSlideAction) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  function onKey(e: KeyboardEvent) {
    if (document.activeElement === getPreviewIframe()) return;
    const target = e.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
    }
    if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      onAction('next');
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      onAction('prev');
    } else if (e.key === 'Home') {
      e.preventDefault();
      onAction('first');
    } else if (e.key === 'End') {
      e.preventDefault();
      onAction('last');
    }
  }
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
