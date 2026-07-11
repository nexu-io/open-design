// Browser-side reads/writes for the run-completion-notification tab-visibility
// gate: whether the tab is hidden or unfocused (so a background tab still
// surfaces a desktop notification), and refocusing the window when the user
// clicks one. SSR-guarded so the project-view slice stays DOM-free (ADR 0002).

/** Whether the document is currently hidden (backgrounded tab). `false` when
 *  there is no document (SSR). */
export function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

/** Whether the document currently has focus. `true` when there is no
 *  document (SSR) — matches the caller's "don't suppress" default. */
export function isDocumentFocused(): boolean {
  return typeof document === 'undefined' ? true : document.hasFocus();
}

/** Focuses the browser window, if one exists. */
export function focusWindow(): void {
  if (typeof window !== 'undefined') window.focus();
}
