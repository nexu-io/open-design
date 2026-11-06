import { useEffect, useRef, useState, type RefObject } from "react";
import { useMountEffect } from "../../hooks/useMountEffect";
import type { DomEditCompositionRect } from "./useDomEditCompositionRect";
import { type OffCanvasRect } from "./OffCanvasIndicators";
import { startOffCanvasIndicatorRefresh } from "./offCanvasIndicatorRefresh";

export function useOffCanvasIndicators({
  iframeRef,
  overlayRef,
  compRectRef,
  activeCompositionPathRef,
  activeCompositionPath,
}: {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  overlayRef: RefObject<HTMLDivElement | null>;
  compRectRef: React.MutableRefObject<DomEditCompositionRect>;
  activeCompositionPathRef: React.MutableRefObject<string | null>;
  activeCompositionPath: string | null;
}): {
  offCanvasRects: OffCanvasRect[];
  offCanvasElementsRef: React.MutableRefObject<Map<string, HTMLElement>>;
} {
  const offCanvasElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [offCanvasRects, setOffCanvasRects] = useState<OffCanvasRect[]>([]);
  const offCanvasDirtyRef = useRef(true);
  const offCanvasSigRef = useRef("");
  const offCanvasObserverRef = useRef<MutationObserver | null>(null);
  const offCanvasObservedDocRef = useRef<Document | null>(null);

  useMountEffect(() =>
    startOffCanvasIndicatorRefresh({
      iframeRef,
      overlayRef,
      compRectRef,
      activeCompositionPathRef,
      dirtyRef: offCanvasDirtyRef,
      sigRef: offCanvasSigRef,
      observerRef: offCanvasObserverRef,
      observedDocRef: offCanvasObservedDocRef,
      elementsRef: offCanvasElementsRef,
      setRects: setOffCanvasRects,
    }),
  );

  useEffect(() => {
    offCanvasDirtyRef.current = true;
  }, [activeCompositionPath]);

  return { offCanvasRects, offCanvasElementsRef };
}
