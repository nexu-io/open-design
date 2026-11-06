import { useLayoutEffect, useRef } from "react";
import { GestureTrailOverlay } from "../components/editor/GestureTrailOverlay";
import type { UseGestureCommitResult } from "./useGestureCommit";

/** The live gesture trail drawn over the preview while a gesture is recording, or nothing. */
export function useGestureTrailOverlay(
  {
    gestureState,
    gestureRecording,
  }: Pick<UseGestureCommitResult, "gestureState" | "gestureRecording">,
  previewIframe: HTMLIFrameElement | null,
  compositionSize: { width: number; height: number } | null,
) {
  const canvasRectRef = useRef<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (gestureState !== "recording" || !previewIframe) {
      canvasRectRef.current = null;
      return;
    }
    canvasRectRef.current = previewIframe.getBoundingClientRect();
  }, [gestureState, previewIframe]);
  if (gestureState !== "recording" || !previewIframe) return undefined;
  return (
    <GestureTrailOverlay
      samples={gestureRecording.samplesRef.current}
      sampleCount={gestureRecording.samplesRef.current.length}
      trail={gestureRecording.trailRef.current}
      canvasRect={canvasRectRef.current!}
      compositionSize={compositionSize ?? undefined}
      mode="recording"
    />
  );
}
