/**
 * Z-order "show your work" flash: after a bring-forward / send-backward, the
 * sibling that was stepped over gets a brief (600ms) highlight so the action
 * is legible even when the visual change is subtle.
 *
 * Drawn in the STUDIO's own overlay layer above the preview iframe — nothing
 * is written into the iframe DOM or the composition, so a concurrent preview
 * reload can never leave a stuck highlight; the timeout merely clears
 * studio-local state. The crossed element is resolved by the context menu
 * (resolveCrossedNeighbor) from the same pre-mutation render order as the
 * z patches; z-index writes don't move layout, so measuring its rect after
 * the commit applied live styles is still accurate.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { toVisibleOverlayRect, type OverlayRect } from "./domEditOverlayGeometry";

const Z_ORDER_CROSSED_FLASH_MS = 600;

interface UseZOrderCrossedFlashParams {
  overlayRef: RefObject<HTMLDivElement | null>;
  iframeRef: RefObject<HTMLIFrameElement | null>;
}

export function useZOrderCrossedFlash({ overlayRef, iframeRef }: UseZOrderCrossedFlashParams): {
  zOrderFlashRect: OverlayRect | null;
  handleZOrderCrossed: (crossed: HTMLElement) => void;
} {
  const [zOrderFlashRect, setZOrderFlashRect] = useState<OverlayRect | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const handleZOrderCrossed = useCallback(
    (crossed: HTMLElement) => {
      const overlayEl = overlayRef.current;
      const iframe = iframeRef.current;
      if (!overlayEl || !iframe) return;
      const rect = toVisibleOverlayRect(overlayEl, iframe, crossed);
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setZOrderFlashRect(rect);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setZOrderFlashRect(null);
      }, Z_ORDER_CROSSED_FLASH_MS);
    },
    [overlayRef, iframeRef],
  );

  return { zOrderFlashRect, handleZOrderCrossed };
}

/** The flash chrome itself — a pulsing accent outline over the crossed sibling. */
export function ZOrderCrossedFlash({ rect }: { rect: OverlayRect | null }) {
  if (!rect) return null;
  return (
    <div
      aria-hidden="true"
      data-dom-edit-z-flash="true"
      className="pointer-events-none absolute rounded-md border-2 border-studio-accent shadow-[0_0_0_2px_rgba(60,230,172,0.35)] animate-pulse"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    />
  );
}
