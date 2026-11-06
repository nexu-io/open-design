import { useEffect, useState, type RefObject } from "react";
import { useLivePreviewIframe } from "../player/store/previewIframeStore";
import { readPreviewCompositionSize } from "../utils/previewCompositionSize";
import { useMountEffect } from "./useMountEffect";
import type { CompositionDimensions } from "../components/renders/RenderQueue";
import { acceptStudioRuntimeMessage } from "../player/lib/runtimeProtocol";

function readCompositionSizeMessage(data: unknown): CompositionDimensions | null {
  if (!isStageSizeMessage(data)) return null;
  const message = data;
  if (!acceptStudioRuntimeMessage(message)) return null;
  return readPositiveDimensions(message.width, message.height);
}

function isStageSizeMessage(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object") return false;
  if (value === null) return false;
  const message = value as Record<string, unknown>;
  return message.source === "hf-preview" && message.type === "stage-size";
}

function readPositiveNumber(value: unknown): number | null {
  if (typeof value !== "number") return null;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function readPositiveDimensions(width: unknown, height: unknown): CompositionDimensions | null {
  const parsedWidth = readPositiveNumber(width);
  const parsedHeight = readPositiveNumber(height);
  if (parsedWidth === null || parsedHeight === null) return null;
  return { width: parsedWidth, height: parsedHeight };
}

export function useCompositionDimensions(iframeRef: RefObject<HTMLIFrameElement | null>) {
  const [compositionDimensions, setCompositionDimensions] = useState<CompositionDimensions | null>(
    null,
  );

  const livePreviewIframe = useLivePreviewIframe();

  // The runtime posts stage-size once per document, so a promoted reload's message was sent
  // before this listener could accept it. The size is authored on the document: read it there.
  useEffect(() => {
    const dimensions = readPreviewCompositionSize(livePreviewIframe);
    if (!dimensions) return;
    setCompositionDimensions((prev) =>
      prev && prev.width === dimensions.width && prev.height === dimensions.height
        ? prev
        : dimensions,
    );
  }, [livePreviewIframe]);

  useMountEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.source || e.source !== iframeRef.current?.contentWindow) return;
      const dimensions = readCompositionSizeMessage(e.data);
      if (!dimensions) return;
      setCompositionDimensions((prev) =>
        prev && prev.width === dimensions.width && prev.height === dimensions.height
          ? prev
          : dimensions,
      );
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  });

  return compositionDimensions;
}
