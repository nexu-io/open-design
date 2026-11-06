import { useEffect, useRef, type RefObject } from "react";
import { requestOverlayFrames } from "./overlayFrameLoop";
import { useDomEditCompositionRect } from "./useDomEditCompositionRect";

export type { DomEditCompositionRect as PreviewCompositionRect } from "./useDomEditCompositionRect";

/**
 * Where the composition sits inside `overlayRef`, in overlay pixels, plus the scale from
 * composition units to pixels.
 */
export function usePreviewCompositionRect(
  overlayRef: RefObject<HTMLDivElement | null>,
  iframe: HTMLIFrameElement | null,
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(iframe);
  iframeRef.current = iframe;
  useEffect(() => {
    requestOverlayFrames();
  }, [iframe]);
  return useDomEditCompositionRect({ iframeRef, overlayRef });
}
