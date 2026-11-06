import { useMemo, useState, useCallback, useRef, type MouseEvent } from "react";
import { useMountEffect } from "./useMountEffect";
import { liveTime, usePlayerStore } from "../player";
import { buildFrameCaptureFilename, buildFrameCaptureUrl } from "../utils/frameCapture";
import { studioApiFetch } from "../utils/studioApiFetch";

interface UseFrameCaptureParams {
  projectId: string | null;
  activeCompPath: string | null;
  showToast: (message: string, tone?: "error" | "info") => void;
  waitForPendingDomEditSaves: () => Promise<void>;
}

export function useFrameCapture({
  projectId,
  activeCompPath,
  showToast,
  waitForPendingDomEditSaves,
}: UseFrameCaptureParams) {
  const [captureFrameTime, setCaptureFrameTime] = useState(
    () => usePlayerStore.getState().currentTime,
  );
  const [capturing, setCapturing] = useState(false);
  const capturingRef = useRef(false);
  const livePlayheadRef = useRef(captureFrameTime);

  useMountEffect(() =>
    liveTime.subscribe((time) => {
      livePlayheadRef.current = time;
    }),
  );

  const playheadTime = useCallback(() => {
    const { isPlaying, currentTime } = usePlayerStore.getState();
    return isPlaying ? livePlayheadRef.current : currentTime;
  }, []);

  const [captureStamp, setCaptureStamp] = useState(Date.now);
  const refreshCaptureFrameTime = useCallback(() => {
    setCaptureFrameTime(playheadTime());
    setCaptureStamp(Date.now());
  }, [playheadTime]);

  const handleCaptureFrameClick = useCallback(
    async (event: MouseEvent<HTMLAnchorElement>) => {
      if (!projectId) return;
      event.preventDefault();
      // A capture can take up to ~35s (save drain + server render) — ignore
      // re-entrant clicks instead of firing parallel captures.
      if (capturingRef.current) return;
      capturingRef.current = true;
      setCapturing(true);
      try {
        const time = playheadTime();
        setCaptureFrameTime(time);
        await Promise.race([
          waitForPendingDomEditSaves(),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error("Save queue timed out")), 5000),
          ),
        ]);
        const href = buildFrameCaptureUrl({
          projectId,
          compositionPath: activeCompPath,
          currentTime: time,
        });
        const filename = buildFrameCaptureFilename(activeCompPath, time);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
          const response = await studioApiFetch(href, {
            cache: "no-store",
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (!response.ok) {
            let msg = `Capture failed (${response.status})`;
            try {
              const json = await response.json();
              if (json?.error) msg = json.error;
            } catch {
              /* non-JSON response — use default message */
            }
            throw new Error(msg);
          }
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        } catch (fetchErr) {
          clearTimeout(timeout);
          if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
            throw new Error("Capture timed out: the server took too long to respond");
          }
          throw fetchErr;
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Capture failed", "error");
      } finally {
        capturingRef.current = false;
        setCapturing(false);
      }
    },
    [activeCompPath, playheadTime, projectId, showToast, waitForPendingDomEditSaves],
  );

  const captureFrameHref = useMemo(
    () =>
      projectId
        ? buildFrameCaptureUrl({
            projectId,
            compositionPath: activeCompPath,
            currentTime: captureFrameTime,
            version: captureStamp,
          })
        : "#",
    [projectId, activeCompPath, captureFrameTime, captureStamp],
  );
  const captureFrameFilename = buildFrameCaptureFilename(activeCompPath, captureFrameTime);

  return {
    captureFrameHref,
    captureFrameFilename,
    handleCaptureFrameClick,
    refreshCaptureFrameTime,
    capturing,
  };
}
