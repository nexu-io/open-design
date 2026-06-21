import { useEffect } from 'react';

export const MODAL_WINDOW_DRAG_STRIP_HEIGHT = 56;

export const MODAL_WINDOW_DRAG_BACKDROP_SELECTOR = [
  '.modal-backdrop',
  '.new-project-modal-backdrop',
  '.automation-modal-backdrop',
  '.use-everywhere-modal-backdrop',
  '.plugin-details-modal-backdrop',
  '.plugins-import-modal__backdrop',
  '.ds-modal-backdrop',
  '.prompt-template-modal-backdrop',
  '.prompt-template-lightbox-backdrop',
  '.home-hero-confirm__backdrop',
  '.project-ds-picker-fullscreen',
  '.staged-preview-modal',
  '.qs-overlay',
].join(',');

export function eventHitsModalWindowDragStrip(event: MouseEvent | PointerEvent): boolean {
  const target = event.target;
  return (
    event.clientY >= 0 &&
    event.clientY <= MODAL_WINDOW_DRAG_STRIP_HEIGHT &&
    target instanceof Element &&
    target.matches(MODAL_WINDOW_DRAG_BACKDROP_SELECTOR)
  );
}

export function useModalWindowDragGuard() {
  useEffect(() => {
    const stopBackdropDismissInDragStrip = (event: MouseEvent | PointerEvent) => {
      if (eventHitsModalWindowDragStrip(event)) {
        event.stopPropagation();
      }
    };

    document.addEventListener('pointerdown', stopBackdropDismissInDragStrip, true);
    document.addEventListener('mousedown', stopBackdropDismissInDragStrip, true);
    document.addEventListener('click', stopBackdropDismissInDragStrip, true);
    return () => {
      document.removeEventListener('pointerdown', stopBackdropDismissInDragStrip, true);
      document.removeEventListener('mousedown', stopBackdropDismissInDragStrip, true);
      document.removeEventListener('click', stopBackdropDismissInDragStrip, true);
    };
  }, []);
}
