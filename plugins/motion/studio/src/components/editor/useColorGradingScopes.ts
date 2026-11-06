import { useEffect, useRef, useState } from "react";
import type { ColorGradingCapturedFrame } from "./useColorGradingPreviews";
import {
  analyzeColorGradingFrame,
  readColorGradingFramePixels,
  type ColorGradingScopeAnalysis,
} from "./colorGradingFrameAnalysis";

type ColorGradingScopeStatus = "idle" | "loading" | "ready" | "unavailable";
const CAPTURE_DEBOUNCE_MS = 180;

export function useColorGradingScopes({
  open,
  captureFrame,
  refreshKey,
}: {
  open: boolean;
  captureFrame: () => Promise<ColorGradingCapturedFrame | null>;
  refreshKey: string;
}) {
  const [analysis, setAnalysis] = useState<ColorGradingScopeAnalysis | null>(null);
  const [status, setStatus] = useState<ColorGradingScopeStatus>("idle");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const captureRef = useRef(captureFrame);
  captureRef.current = captureFrame;

  useEffect(() => {
    if (!open) {
      setAnalysis(null);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setAnalysis(null);
      setStatus("loading");
      try {
        const frame = await captureRef.current();
        if (cancelled) return;
        if (!frame) {
          setStatus("unavailable");
          return;
        }
        const pixels = await readColorGradingFramePixels(frame);
        if (!pixels) throw new Error("Canvas 2D unavailable");
        const next = analyzeColorGradingFrame(pixels, frame.width, frame.height);
        if (!cancelled) {
          setAnalysis(next);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    }, CAPTURE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, refreshKey, refreshVersion]);

  return { analysis, status, refresh: () => setRefreshVersion((version) => version + 1) };
}
