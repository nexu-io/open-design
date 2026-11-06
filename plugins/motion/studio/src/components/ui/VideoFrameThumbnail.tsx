import { useState, useEffect } from "react";

/**
 * Extracts a representative JPEG frame from a video URL using a hidden
 * video + canvas. Seeks to ~10% of duration to avoid black opening frames.
 * Used by AssetThumbnail (assets tab) and RenderQueueItem (renders tab).
 */
export function VideoFrameThumbnail({
  src,
  fallbackLabel,
}: {
  src: string;
  /** Shown instead of an endless shimmer when the video can't be decoded. */
  fallbackLabel?: string;
}) {
  const [frame, setFrame] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "metadata";

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Clearing src fires one more `error` on the video, so the error handler
    // must be detached first — otherwise error → cleanup → error spins forever.
    const cleanup = () => {
      video.removeEventListener("error", onError);
      video.src = "";
      video.load();
    };
    const onError = () => {
      // Ignore the synthetic error cleanup itself just triggered.
      if (!video.getAttribute("src")) return;
      setFailed(true);
      cleanup();
    };

    video.addEventListener("loadedmetadata", () => {
      video.currentTime = Math.min(2, video.duration * 0.1 || 2);
    });

    video.addEventListener("seeked", () => {
      if (!ctx) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      setFrame(canvas.toDataURL("image/jpeg", 0.7));
      cleanup();
    });

    video.addEventListener("error", onError);
    video.src = src;
    video.load();

    return cleanup;
  }, [src]);

  if (failed && !frame) {
    return (
      <div className="w-full h-full bg-neutral-800 flex items-center justify-center">
        <span className="text-[9px] font-medium text-neutral-600">{fallbackLabel ?? "VIDEO"}</span>
      </div>
    );
  }

  if (!frame) {
    return <div data-thumbnail-loading className="w-full h-full bg-panel-surface" />;
  }

  return <img src={frame} alt="" draggable={false} className="w-full h-full object-contain" />;
}
