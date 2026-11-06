import { useEffect, type RefObject } from "react";
import { usePlayerStore } from "../store/playerStore";
import { postRuntimeControlMessage } from "../lib/runtimeProtocol";

/** Sends the preview quality, and each retry, to the live preview; a reloaded preview asks again when it is ready. */
export function usePreviewQualityForwarding(iframeRef: RefObject<HTMLIFrameElement | null>): void {
  const level = usePlayerStore((state) => state.previewQuality);
  const retries = usePlayerStore((state) => state.previewCopiesRetry);
  useEffect(() => {
    const frame = iframeRef.current;
    if (frame) postRuntimeControlMessage(frame.contentWindow, "set-preview-quality", { level });
  }, [iframeRef, level]);
  const factsRequests = usePlayerStore((state) => state.previewFactsRequests);
  useEffect(() => {
    const frame = iframeRef.current;
    if (frame && factsRequests > 0)
      postRuntimeControlMessage(frame.contentWindow, "request-preview-facts");
  }, [iframeRef, factsRequests]);
  useEffect(() => {
    const frame = iframeRef.current;
    if (frame && retries > 0)
      postRuntimeControlMessage(frame.contentWindow, "retry-preview-copies");
  }, [iframeRef, retries]);
}
