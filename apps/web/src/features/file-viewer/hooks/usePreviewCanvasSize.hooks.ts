// Feature-local hook that measures a ref'd element's box (width/height/scroll
// offset), re-measuring on resize/scroll via the injected element-size port.
// Shared by every preview/board canvas that needs its container size to scale
// an iframe or position overlays.
import { useEffect, useRef, useState } from 'react';
import { elementSizePort as realElementSizePort } from '../dependencies';
import type { ElementSizePort } from '../ports';
import type { PreviewCanvasSize } from '../types';

export function usePreviewCanvasSize<T extends HTMLElement>(port: ElementSizePort) {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<PreviewCanvasSize | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return port.observeElementSize(el, setSize);
  }, [port]);

  return [ref, size] as const;
}

export function useWiredPreviewCanvasSize<T extends HTMLElement>() {
  return usePreviewCanvasSize<T>(realElementSizePort);
}
