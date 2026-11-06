import { useState, type RefObject } from "react";
import { useMountEffect } from "../../hooks/useMountEffect";
import { subscribeOverlayFrame } from "./overlayFrameLoop";

export interface DomEditCompositionRect {
  left: number;
  top: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}

function sameRect(a: DomEditCompositionRect, b: DomEditCompositionRect): boolean {
  const d = (k: keyof DomEditCompositionRect) => Math.abs(a[k] - b[k]);
  return (
    d("left") < 0.5 &&
    d("top") < 0.5 &&
    d("width") < 0.5 &&
    d("height") < 0.5 &&
    d("scaleX") < 0.001 &&
    d("scaleY") < 0.001
  );
}

export function useDomEditCompositionRect({
  iframeRef,
  overlayRef,
}: {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  overlayRef: RefObject<HTMLDivElement | null>;
}): DomEditCompositionRect {
  const [compRect, setCompRect] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    scaleX: 1,
    scaleY: 1,
  });

  useMountEffect(() => {
    // fallow-ignore-next-line complexity
    const update = () => {
      const iframe = iframeRef.current;
      const overlayEl = overlayRef.current;
      if (!iframe || !overlayEl) return;
      const iRect = iframe.getBoundingClientRect();
      const oRect = overlayEl.getBoundingClientRect();
      const left = iRect.left - oRect.left;
      const top = iRect.top - oRect.top;
      if (iRect.width <= 0 || iRect.height <= 0) return;
      const doc = iframe.contentDocument;
      const root = doc?.querySelector<HTMLElement>("[data-composition-id]") ?? doc?.documentElement;
      const dw = Number.parseFloat(root?.getAttribute("data-width") ?? "");
      const dh = Number.parseFloat(root?.getAttribute("data-height") ?? "");
      const scaleX = dw > 0 ? iRect.width / dw : 1;
      const scaleY = dh > 0 ? iRect.height / dh : 1;
      const next = { left, top, width: iRect.width, height: iRect.height, scaleX, scaleY };
      setCompRect((prev) => (sameRect(prev, next) ? prev : next));
    };
    return subscribeOverlayFrame(update);
  });

  return compRect;
}
