// Feature-local hook for the preview-viewport switcher's open/dismiss state:
// closes the menu on an outside pointerdown or Escape via the injected
// dismiss port, so the component itself stays DOM-free.
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { dismissPort as realDismissPort } from '../dependencies';
import type { DismissPort } from '../ports';

export interface PreviewViewportMenuController {
  open: boolean;
  setOpen: (open: boolean) => void;
  menuRef: MutableRefObject<HTMLDivElement | null>;
}

export function usePreviewViewportMenu(dismissPort: DismissPort): PreviewViewportMenuController {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    return dismissPort.subscribeOutsidePointerDismiss(
      () => menuRef.current,
      () => setOpen(false),
    );
  }, [dismissPort, open]);

  return { open, setOpen, menuRef };
}

export function useWiredPreviewViewportMenu(): PreviewViewportMenuController {
  return usePreviewViewportMenu(realDismissPort);
}
