import { useI18n } from "../../i18n/I18n";
/**
 * CapCut-style asset preview overlay rendered inside PreviewPane.
 *
 * Shown when the user clicks an asset card that has NOT yet been added to the
 * timeline. Displays the media (image / video / audio) as a compact floating
 * card over the canvas — the canvas stays visible behind a barely-tinted
 * click-catcher — without modifying the composition (no undo entry, no file
 * mutation).
 *
 * Dismiss: X button, Escape key, click outside the card, or any playhead
 * activity (starting playback / seeking) — the canvas refocuses.
 * Switching to another not-added asset replaces the current preview.
 */
import { useEffect, useCallback } from "react";
import { VIDEO_EXT, IMAGE_EXT } from "../../utils/mediaTypes";
import { useAssetPreviewStore } from "../../utils/assetPreviewStore";
import { usePlayerStore } from "../../player/store/playerStore";
import { shouldDismissAssetPreview } from "../../utils/assetPreviewDismiss";
import { resolveMediaPreviewUrl } from "../../player/components/thumbnailUtils";

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

type AssetKind = "image" | "video" | "audio";

function resolveAssetKind(path: string): AssetKind {
  if (VIDEO_EXT.test(path)) return "video";
  if (IMAGE_EXT.test(path)) return "image";
  return "audio";
}

/** The media element for a previewed asset, chosen by kind. */
function AssetPreviewMedia({
  kind,
  serveUrl,
  name,
}: {
  kind: AssetKind;
  serveUrl: string;
  name: string;
}) {
  if (kind === "image") {
    return (
      <img
        src={serveUrl}
        alt={name}
        className="max-w-full max-h-[40vh] rounded-sm object-contain"
      />
    );
  }
  if (kind === "video") {
    return (
      <video
        src={serveUrl}
        controls
        autoPlay
        muted
        playsInline
        className="max-w-full max-h-[40vh] rounded-sm"
      />
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-4">
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-neutral-500"
      >
        <path d="M9 18V5l12-2v13" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
      <audio src={serveUrl} controls className="w-64" />
    </div>
  );
}

export function AssetPreviewOverlay() {
  const { t } = useI18n();
  const previewAsset = useAssetPreviewStore((s) => s.previewAsset);
  const previewProjectId = useAssetPreviewStore((s) => s.previewProjectId);
  const clearPreviewAsset = useAssetPreviewStore((s) => s.clearPreviewAsset);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") clearPreviewAsset();
    },
    [clearPreviewAsset],
  );

  useEffect(() => {
    if (!previewAsset) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewAsset, handleKeyDown]);

  // The canvas refocuses on any playhead activity: starting playback or a
  // seek/scrub away from where the playhead sat when the preview opened
  // dismisses it. openedTime is captured per preview open (previewAsset dep),
  // so a stale render can never dismiss against the wrong reference time.
  useEffect(() => {
    if (!previewAsset) return;
    const opened = usePlayerStore.getState();
    const openedTime = opened.currentTime;
    // Level-triggered, not edge-triggered: a preview opened while playback is
    // ALREADY running (the RAF loop bypasses the store) or while a seek is
    // already in flight gets no store change to react to, so evaluate the
    // current state once, through the same shared predicate the subscription
    // uses. openedTime is this snapshot's own currentTime, so the
    // time-diverged branch can't false-positive at open — only the
    // isPlaying / requestedSeekTime branches can fire here.
    if (shouldDismissAssetPreview(openedTime, opened)) {
      clearPreviewAsset();
      return;
    }
    return usePlayerStore.subscribe((state) => {
      if (shouldDismissAssetPreview(openedTime, state)) clearPreviewAsset();
    });
  }, [previewAsset, clearPreviewAsset]);

  if (!previewAsset || !previewProjectId) return null;

  const serveUrl = resolveMediaPreviewUrl(previewAsset, previewProjectId);
  const name = basename(previewAsset);

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/20"
      onClick={clearPreviewAsset}
      role="dialog"
      aria-label={t("Preview: {name}", { name: name })}
    >
      {/* Floating preview card — compact, canvas stays visible around it */}
      <div
        className="relative flex flex-col items-center gap-2 max-w-[58%] rounded-lg border border-neutral-800 bg-neutral-950/95 p-2 pt-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-raised hover:bg-press text-text-2 hover:text-text-0 flex items-center justify-center transition-colors z-10"
          onClick={(e) => {
            e.stopPropagation();
            clearPreviewAsset();
          }}
          aria-label={t("Close preview")}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <AssetPreviewMedia kind={resolveAssetKind(previewAsset)} serveUrl={serveUrl} name={name} />

        {/* Filename label */}
        <span className="text-[12px] text-neutral-400 truncate max-w-full px-2 text-center">
          {name}
        </span>
      </div>
    </div>
  );
}
