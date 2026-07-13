// Browser-side bridges for the automation modal: the Escape key, the
// body-scroll lock while the modal is open, and the "focus the title field
// shortly after open" timer. These live in providers/ rather than a feature
// file because they touch `window`/`document`; the slice reaches every one of
// them through an injected port/callback, so its hooks stay DOM-free and
// unit-testable with a fake.

/** Subscribe to the Escape key while the modal is open. Returns unsubscribe. */
export function subscribeEscapeKey(onEscape: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onEscape();
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}

/** Lock page scroll while the modal is open. Returns the restore function. */
export function lockBodyScroll(): () => void {
  if (typeof window === 'undefined') return () => {};
  const prev = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  return () => {
    document.body.style.overflow = prev;
  };
}

/** Native confirm dialog for the destructive "delete automation" action. */
export function confirmDialog(message: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.confirm(message);
}

/** Schedule `fn` to run after `delayMs` (used for the "focus the title field
 * shortly after open" and "clear the focus highlight after N seconds" timers).
 * Returns a cancel function. */
export function scheduleTimeout(fn: () => void, delayMs: number): () => void {
  if (typeof window === 'undefined') return () => {};
  const id = window.setTimeout(fn, delayMs);
  return () => window.clearTimeout(id);
}
