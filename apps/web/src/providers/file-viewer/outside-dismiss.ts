// Browser-side bridge for dismissing a popover/menu on an outside pointerdown
// or Escape. Lives in providers/ because it touches `document`; slice hooks
// reach it through an injected port so they stay DOM-free and unit-testable.
export function subscribeOutsideDismiss(
  getContainer: () => HTMLElement | null,
  onDismiss: () => void,
): () => void {
  if (typeof document === 'undefined') return () => {};
  const onDocClick = (event: MouseEvent) => {
    const container = getContainer();
    if (!container) return;
    if (!container.contains(event.target as Node)) onDismiss();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onDismiss();
  };
  document.addEventListener('mousedown', onDocClick);
  document.addEventListener('keydown', onKey);
  return () => {
    document.removeEventListener('mousedown', onDocClick);
    document.removeEventListener('keydown', onKey);
  };
}
