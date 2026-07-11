// Browser-side bridge for dismissing a popover/menu on an outside mousedown
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

// Same dismiss contract, but listens for `pointerdown` instead of `mousedown`
// so it also fires for touch/pen input — some outside-dismiss menus in the
// original orchestrator used pointerdown, others mousedown; both are
// preserved as distinct bridges rather than unified, to avoid a behavior
// change on either call site.
export function subscribeOutsidePointerDismiss(
  getContainer: () => HTMLElement | null,
  onDismiss: () => void,
): () => void {
  if (typeof document === 'undefined') return () => {};
  const onPointerDown = (event: PointerEvent) => {
    const container = getContainer();
    if (!container) return;
    if (!container.contains(event.target as Node)) onDismiss();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onDismiss();
  };
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('keydown', onKey);
  return () => {
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('keydown', onKey);
  };
}
