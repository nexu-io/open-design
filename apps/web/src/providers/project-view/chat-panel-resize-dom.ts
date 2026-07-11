// Browser-side bridges for the chat/workspace split-panel resize interaction.
// Owns the DOM side-effects (ResizeObserver / window-resize fallback,
// computed-style RTL detection, rAF-throttled pointer-capture drag listeners)
// so the project-view slice's resize hook stays DOM-free (ADR 0002).

/** Watch a split element's width, calling back immediately and on every
 * resize. Falls back to a window `resize` listener when `ResizeObserver` is
 * unavailable. Returns an unsubscribe that tears the watcher down. */
export function subscribeSplitResize(
  split: HTMLDivElement,
  onResize: (splitWidth: number) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handleResize = () => onResize(split.clientWidth);
  handleResize();
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(handleResize);
    observer.observe(split);
    return () => observer.disconnect();
  }
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}

/** Whether a split element's computed text direction is RTL. `null` (not yet
 * mounted) reads as LTR, matching the keyboard-resize handler's fallback. */
export function getSplitIsRtl(split: HTMLDivElement | null): boolean {
  if (typeof window === 'undefined' || !split) return false;
  return window.getComputedStyle(split).direction === 'rtl';
}

/** Handlers a chat-panel pointer-drag subscription drives. `onMove` receives
 * the rAF-throttled pointer clientX; `onEnd`/`onCancel` each fire after any
 * buffered move has been flushed, so the caller always sees the final
 * position before the drag settles. */
export interface ChatPanelPointerDragHandlers {
  onMove: (clientX: number) => void;
  onEnd: () => void;
  onCancel: () => void;
}

/** Start a chat-panel resize drag: listens for pointer move/up/cancel and
 * window blur, throttling move delivery to one per animation frame. Returns
 * an unsubscribe that tears down the listeners and cancels any pending
 * frame. */
export function subscribeChatPanelPointerDrag(
  handlers: ChatPanelPointerDragHandlers,
): () => void {
  if (typeof window === 'undefined') return () => {};
  let frame: number | null = null;
  let pendingClientX: number | null = null;

  const flushPendingMove = () => {
    if (frame !== null) {
      window.cancelAnimationFrame(frame);
      frame = null;
    }
    const clientX = pendingClientX;
    pendingClientX = null;
    if (clientX !== null) handlers.onMove(clientX);
  };

  const handlePointerMove = (event: PointerEvent) => {
    pendingClientX = event.clientX;
    if (frame !== null) return;
    frame = window.requestAnimationFrame(() => {
      frame = null;
      flushPendingMove();
    });
  };
  const handlePointerEnd = () => {
    flushPendingMove();
    handlers.onEnd();
  };
  const handlePointerCancel = () => {
    flushPendingMove();
    handlers.onCancel();
  };

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerEnd);
  window.addEventListener('pointercancel', handlePointerCancel);
  window.addEventListener('blur', handlePointerCancel);

  return () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerEnd);
    window.removeEventListener('pointercancel', handlePointerCancel);
    window.removeEventListener('blur', handlePointerCancel);
  };
}
