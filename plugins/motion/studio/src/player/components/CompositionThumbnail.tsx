import { memo, useMemo, type CSSProperties } from "react";
import { useThumbnailLease } from "../../hooks/useThumbnailLease";
import { useThumbnailStripSize } from "../../hooks/useThumbnailStripSize";
import {
  createThumbnailKey,
  type ThumbnailPriority,
  type ThumbnailRequest,
} from "../lib/thumbnailScheduler";
import { TIMELINE_VIEWPORT_BUDGETS } from "../lib/timelineViewportBudgets";
import { ThumbnailTiles } from "./ThumbnailTiles";
import { computeThumbnailStrip, probeImageAspect } from "./thumbnailUtils";
import { studioApiFetch } from "../../utils/studioApiFetch";

interface CompositionThumbnailProps {
  previewUrl: string;
  label: string;
  labelColor: string;
  selector?: string;
  selectorIndex?: number;
  seekTime?: number;
  duration?: number;
  width?: number;
  height?: number;
  projectId?: string;
  sessionEpoch?: number;
  contentRevision?: number;
  priority?: ThumbnailPriority;
  rich?: boolean;
}

const THUMBNAIL_URL_VERSION = "v3";
export const THUMBNAIL_SEEK_TIME_SECONDS = 3;

export function resolveThumbnailSeekTime(durationSeconds: number | null | undefined): number {
  if (
    Number.isFinite(durationSeconds) &&
    durationSeconds != null &&
    durationSeconds > 0 &&
    durationSeconds <= THUMBNAIL_SEEK_TIME_SECONDS
  ) {
    return durationSeconds / 2;
  }

  return THUMBNAIL_SEEK_TIME_SECONDS;
}

export function buildCompositionThumbnailUrl({
  previewUrl,
  seekTime = 2,
  duration = 5,
  selector,
  selectorIndex,
  origin,
  output,
  contentRevision = 0,
}: {
  previewUrl: string;
  seekTime?: number;
  duration?: number;
  selector?: string;
  selectorIndex?: number;
  origin: string;
  /**
   * Capture density. Omitted, the route bounds the image to its preview cap —
   * right for the timeline, where thumbnails are small and numerous and their
   * decoded bytes are budgeted. `"source"` uses the composition's own dimensions.
   */
  output?: "source";
  contentRevision?: number;
}): string {
  const thumbnailBase = previewUrl
    .replace("/preview/comp/", "/thumbnail/")
    .replace(/\/preview$/, "/thumbnail/index.html");
  const thumbnailUrl = new URL(thumbnailBase, origin);
  thumbnailUrl.searchParams.set("t", (seekTime + duration / 2).toFixed(2));
  thumbnailUrl.searchParams.set("v", THUMBNAIL_URL_VERSION);
  thumbnailUrl.searchParams.set("revision", String(contentRevision));
  if (output) thumbnailUrl.searchParams.set("output", output);
  if (selector) {
    thumbnailUrl.searchParams.set("selector", selector);
    if (selectorIndex != null && selectorIndex > 0) {
      thumbnailUrl.searchParams.set("selectorIndex", String(selectorIndex));
    }
  }
  return thumbnailUrl.toString();
}

/** The composition a preview URL renders: `/preview/comp/<path>`, or the root for `/preview`. */
export function compositionPathOfPreviewUrl(previewUrl: string): string {
  const match = /\/preview\/comp\/([^?#]+)/.exec(previewUrl);
  return match?.[1] ? decodeURIComponent(match[1]) : "index.html";
}

export function compositionThumbnailRequest(
  url: string,
  projectId: string,
  { sessionEpoch = 0, priority = "visible", rich = false }: Partial<ThumbnailRequest> = {},
): ThumbnailRequest {
  return {
    key: createThumbnailKey({ kind: "composition", url }),
    projectId,
    sessionEpoch,
    kind: "composition",
    priority,
    rich,
    load: (signal: AbortSignal) => loadCompositionImage(url, signal),
  };
}

async function loadCompositionImage(url: string, signal: AbortSignal) {
  const response = await studioApiFetch(url, { signal });
  if (!response.ok) throw new Error(`Composition thumbnail failed (${response.status})`);
  const blob = await response.blob();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const objectUrl = URL.createObjectURL(blob);
  try {
    const aspect = await probeImageAspect(objectUrl, signal);
    return {
      value: { kind: "image" as const, url: objectUrl, aspect },
      weight:
        TIMELINE_VIEWPORT_BUDGETS.posterMaxPhysicalWidth *
        TIMELINE_VIEWPORT_BUDGETS.posterMaxPhysicalHeight *
        4,
      dispose: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/** Server-rendered composition poster, deduplicated and budgeted by project/session. */
export const CompositionThumbnail = memo(function CompositionThumbnail({
  previewUrl,
  label,
  labelColor,
  selector,
  selectorIndex,
  seekTime = 2,
  duration = 5,
  projectId = previewUrl,
  sessionEpoch = 0,
  contentRevision = 0,
  priority = "visible",
}: CompositionThumbnailProps) {
  const [container, setContainerRef, watchGap] = useThumbnailStripSize();
  const url = buildCompositionThumbnailUrl({
    previewUrl,
    seekTime,
    duration,
    selector,
    selectorIndex,
    origin: window.location.origin,
    contentRevision,
  });
  const request = useMemo(
    () => compositionThumbnailRequest(url, projectId, { sessionEpoch, priority, rich: true }),
    [priority, projectId, sessionEpoch, url],
  );
  const snapshot = useThumbnailLease(request);
  const value =
    snapshot.status === "ready" && snapshot.value.kind === "image" ? snapshot.value : null;
  const { frameW, frameCount } = computeThumbnailStrip(
    container.width,
    value?.aspect ?? 16 / 9,
    container.height,
    48,
  );

  return (
    <div ref={setContainerRef} className="absolute inset-0 overflow-hidden">
      {value && (
        <ThumbnailTiles
          strip={container}
          frameW={frameW}
          frameCount={frameCount}
          watchGap={watchGap}
          style={{
            animation: "hf-thumb-fade 200ms ease-out",
            mixBlendMode:
              "var(--timeline-composition-thumbnail-blend)" as CSSProperties["mixBlendMode"],
          }}
        >
          {(index) => (
            <div
              key={index}
              className="relative h-full shrink-0 overflow-hidden"
              style={{ width: frameW }}
            >
              <img
                src={value.url}
                alt=""
                draggable={false}
                className="absolute inset-0 h-full w-full object-contain"
                style={{ opacity: "var(--timeline-composition-thumbnail-opacity)" }}
              />
            </div>
          )}
        </ThumbnailTiles>
      )}
      {snapshot.status === "loading" && (
        <div className="absolute inset-0 animate-pulse bg-text-0/[0.035]" />
      )}
      {label && (
        <div className="absolute inset-y-0 left-3 z-10 flex items-center">
          <span
            className="block max-w-full truncate text-[10px] font-semibold leading-none"
            style={{
              color: labelColor,
              textShadow: value ? "0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6)" : "none",
            }}
          >
            {label}
          </span>
        </div>
      )}
    </div>
  );
});
