import { useI18n } from "../../i18n/I18n";
import { buildProjectApiPath } from "../../utils/projectRouting";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useThumbnailLease } from "../../hooks/useThumbnailLease";
import {
  thumbnailScheduler,
  type ThumbnailRequest,
  type ThumbnailSnapshot,
} from "../../player/lib/thumbnailScheduler";
import {
  buildCompositionThumbnailUrl,
  compositionThumbnailRequest,
  resolveThumbnailSeekTime,
  THUMBNAIL_SEEK_TIME_SECONDS,
} from "../../player/components/CompositionThumbnail";
import { setPreviewMediaMuted } from "../../player/lib/timelineIframeHelpers";
import { postFrameDisplayScale } from "../../player/lib/runtimeProtocol";
import { usePlayerStore } from "../../player/store/playerStore";
import { thumbnailRevisionOf } from "../../player/store/thumbnailSlice";
import { encodePreviewPath } from "../../player/components/thumbnailUtils";
import { TIMELINE_COMPOSITION_MIME } from "../../utils/timelineCompositionDrop";
import { Tooltip } from "../ui/Tooltip";

interface CompositionsTabProps {
  projectId: string;
  compositions: string[];
  activeComposition: string | null;
  /** The project's root composition (same value App.tsx auto-opens on load), or null if none. */
  masterCompositionPath?: string | null;
  onSelect: (comp: string) => void;
  onRenderComposition?: (comp: string) => void;
  onAddToTimeline?: (comp: string) => void;
  isRendering?: boolean;
  lintFindingsByFile?: Map<string, { count: number; messages: string[] }>;
}

const DEFAULT_PREVIEW_STAGE = { width: 1920, height: 1080 };
const CARD_W = 80;
const CARD_H = 45;
const THUMBNAIL_PLAYBACK_SYNC_ATTEMPTS = 10;

type PreviewWindow = Window & {
  __player?: {
    play?: () => void;
    pause?: () => void;
    seek?: (time: number) => void;
    getDuration?: () => number;
  };
};

export function resolveCompositionPreviewScale(input: {
  cardWidth: number;
  cardHeight: number;
  stageWidth: number;
  stageHeight: number;
}): number {
  const safeStageWidth =
    Number.isFinite(input.stageWidth) && input.stageWidth > 0
      ? input.stageWidth
      : DEFAULT_PREVIEW_STAGE.width;
  const safeStageHeight =
    Number.isFinite(input.stageHeight) && input.stageHeight > 0
      ? input.stageHeight
      : DEFAULT_PREVIEW_STAGE.height;
  const scaleX = input.cardWidth / safeStageWidth;
  const scaleY = input.cardHeight / safeStageHeight;
  return Math.min(scaleX, scaleY);
}

function compositionPreviewUrl(projectId: string, comp: string): string {
  return buildProjectApiPath(projectId, `/preview/comp/${encodePreviewPath(comp)}`);
}

export function compositionCardThumbnailUrl(
  projectId: string,
  comp: string,
  contentRevision: number,
): string {
  return buildCompositionThumbnailUrl({
    previewUrl: compositionPreviewUrl(projectId, comp),
    seekTime: THUMBNAIL_SEEK_TIME_SECONDS,
    duration: 0,
    origin: window.location.origin,
    contentRevision,
  });
}

function parsePositiveNumber(value: string | null): number | null {
  if (value == null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// fallow-ignore-next-line complexity
function resolveIframeDuration(iframe: HTMLIFrameElement | null): number | null {
  try {
    const win = iframe?.contentWindow as PreviewWindow | null;
    const playerDuration = win?.__player?.getDuration?.();
    if (Number.isFinite(playerDuration) && playerDuration != null && playerDuration > 0) {
      return playerDuration;
    }
  } catch {
    /* cross-origin iframe */
  }

  try {
    const doc = iframe?.contentDocument;
    const root = doc?.querySelector("[data-composition-id]") ?? doc?.documentElement ?? null;
    return (
      parsePositiveNumber(root?.getAttribute("data-composition-duration") ?? null) ??
      parsePositiveNumber(root?.getAttribute("data-duration") ?? null)
    );
  } catch {
    return null;
  }
}

export function syncIframePlayback(iframe: HTMLIFrameElement | null, shouldPlay: boolean): boolean {
  try {
    const player = (iframe?.contentWindow as PreviewWindow | null)?.__player;
    if (!player) return false;

    if (shouldPlay) {
      setPreviewMediaMuted(iframe, true);
      player.play?.();
      return true;
    }

    player.pause?.();
    player.seek?.(resolveThumbnailSeekTime(resolveIframeDuration(iframe)));
    return true;
  } catch {
    return false;
  }
}

const imageUrlOf = (snapshot: ThumbnailSnapshot) =>
  snapshot.status === "ready" && snapshot.value.kind === "image" ? snapshot.value.url : null;

// A layout effect takes the old frame's lease before the passive cleanup drops the first one.
function useLastFrame(request: ThumbnailRequest | null, snapshot: ThumbnailSnapshot) {
  const current = imageUrlOf(snapshot);
  const [kept, setKept] = useState<{ request: ThumbnailRequest; url: string } | null>(null);
  if (request && current && kept?.request !== request) setKept({ request, url: current });
  useLayoutEffect(() => {
    if (!kept || kept.request === request) return;
    const lease = thumbnailScheduler.acquire(kept.request, () => {});
    return () => lease.release();
  }, [kept, request]);
  return current ?? kept?.url ?? null;
}

function useNearViewport<T extends Element>(): [(element: T | null) => void, boolean] {
  const [element, setElement] = useState<T | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!element || near) return;
    if (typeof IntersectionObserver === "undefined") return setNear(true);
    const observer = new IntersectionObserver(
      (entries) => entries.some((entry) => entry.isIntersecting) && setNear(true),
      { root: element.closest("[data-composition-list]"), rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, near]);
  return [setElement, near];
}

function CompCard({
  projectId,
  comp,
  isActive,
  isRoot,
  onSelect,
  onRender,
  isRendering,
  lintInfo,
  onAddToTimeline,
  contentRevision,
  previewBooted,
}: {
  projectId: string;
  comp: string;
  isActive: boolean;
  isRoot: boolean;
  onSelect: () => void;
  onRender?: () => void;
  isRendering?: boolean;
  lintInfo?: { count: number; messages: string[] };
  onAddToTimeline?: () => void;
  contentRevision: number;
  previewBooted: boolean;
}) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [stageSize, setStageSize] = useState(DEFAULT_PREVIEW_STAGE);
  const [livePreviewLoaded, setLivePreviewLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggedRef = useRef(false);

  const requestIframePlaybackSync = useCallback((shouldPlay: boolean) => {
    if (syncTimer.current) {
      clearTimeout(syncTimer.current);
      syncTimer.current = null;
    }

    const sync = (remainingAttempts: number) => {
      if (syncIframePlayback(iframeRef.current, shouldPlay) || remainingAttempts <= 0) return;

      syncTimer.current = setTimeout(() => sync(remainingAttempts - 1), 100);
    };

    sync(THUMBNAIL_PLAYBACK_SYNC_ATTEMPTS);
  }, []);

  const handleEnter = () => {
    hoverTimer.current = setTimeout(() => setHovered(true), 300);
  };
  const handleLeave = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    if (syncTimer.current) {
      clearTimeout(syncTimer.current);
      syncTimer.current = null;
    }
    setHovered(false);
    setLivePreviewLoaded(false);
  };
  const name = comp.replace(/^compositions\//, "").replace(/\.html$/, "");
  const previewUrl = compositionPreviewUrl(projectId, comp);
  const thumbnailUrl = compositionCardThumbnailUrl(projectId, comp, contentRevision);
  const [thumbnailBox, nearViewport] = useNearViewport<HTMLDivElement>();
  const timelineSessionEpoch = usePlayerStore((state) => state.timelineSessionEpoch);
  const thumbnailRequest = useMemo(
    () =>
      previewBooted && nearViewport
        ? compositionThumbnailRequest(thumbnailUrl, projectId, {
            sessionEpoch: timelineSessionEpoch,
            rich: true,
          })
        : null,
    [previewBooted, nearViewport, thumbnailUrl, projectId, timelineSessionEpoch],
  );
  const thumbnail = useThumbnailLease(thumbnailRequest);
  const frameUrl = useLastFrame(thumbnailRequest, thumbnail);
  const thumbnailFailed = thumbnail.status === "error";
  const previewScale = resolveCompositionPreviewScale({
    cardWidth: CARD_W,
    cardHeight: CARD_H,
    stageWidth: stageSize.width,
    stageHeight: stageSize.height,
  });
  const thumbnailOffsetX = (CARD_W - stageSize.width * previewScale) / 2;
  const thumbnailOffsetY = (CARD_H - stageSize.height * previewScale) / 2;

  useEffect(() => {
    if (hovered) requestIframePlaybackSync(true);
  }, [hovered, requestIframePlaybackSync]);

  useEffect(() => {
    if (livePreviewLoaded) postFrameDisplayScale(iframeRef.current);
  }, [livePreviewLoaded, previewScale]);

  useEffect(() => {
    if (!hovered) return;
    const onRuntimeReady = (event: MessageEvent) => {
      const frame = iframeRef.current;
      if (frame && event.source === frame.contentWindow && event.data?.type === "ready") {
        postFrameDisplayScale(frame);
      }
    };
    window.addEventListener("message", onRuntimeReady);
    return () => window.removeEventListener("message", onRuntimeReady);
  }, [hovered]);

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, []);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      aria-label={t("Open composition {name}", { name: name })}
      aria-pressed={isActive}
      onDragStart={(event) => {
        draggedRef.current = true;
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(TIMELINE_COMPOSITION_MIME, JSON.stringify({ sourcePath: comp }));
      }}
      onDragEnd={() => {
        window.setTimeout(() => {
          draggedRef.current = false;
        }, 0);
      }}
      onClick={() => {
        if (!draggedRef.current) onSelect();
      }}
      onKeyDown={(event) => {
        // Only when the row itself is focused — keydowns bubbling from the
        // inner controls (play button) must keep their native activation.
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
      className={`group/card w-full select-none text-left px-2 py-1.5 flex items-center gap-2.5 transition-colors cursor-grab active:cursor-grabbing outline-hidden focus-visible:bg-neutral-800/60 ${
        isActive
          ? "bg-studio-accent/10 border-l-2 border-studio-accent"
          : "border-l-2 border-transparent hover:bg-neutral-800/50"
      }`}
    >
      <div
        ref={thumbnailBox}
        className="w-20 h-[45px] rounded-sm overflow-hidden bg-neutral-900 shrink-0 relative"
      >
        {thumbnailFailed ? (
          <div className="absolute inset-0 flex items-center justify-center px-1 text-center text-[8px] leading-tight text-neutral-600">
            {t("Preview unavailable")}</div>
        ) : !frameUrl ? null : (
          <img
            src={frameUrl}
            alt=""
            draggable={false}
            decoding="async"
            className={`absolute inset-0 h-full w-full object-contain transition-opacity ${
              livePreviewLoaded ? "opacity-0" : "opacity-100"
            }`}
          />
        )}
        {hovered && (
          <iframe
            ref={iframeRef}
            src={previewUrl}
            sandbox="allow-scripts allow-same-origin"
            className="absolute border-none pointer-events-none"
            style={{
              transformOrigin: "0 0",
              width: stageSize.width,
              height: stageSize.height,
              left: thumbnailOffsetX,
              top: thumbnailOffsetY,
              transform: `scale(${previewScale})`,
            }}
            onLoad={(e) => {
              try {
                const iframe = e.currentTarget;
                const root = iframe.contentDocument?.querySelector("[data-composition-id]");
                const width =
                  Number(root?.getAttribute("data-width")) || DEFAULT_PREVIEW_STAGE.width;
                const height =
                  Number(root?.getAttribute("data-height")) || DEFAULT_PREVIEW_STAGE.height;
                setStageSize({ width, height });
                setLivePreviewLoaded(true);
                requestIframePlaybackSync(true);
              } catch {
                setStageSize(DEFAULT_PREVIEW_STAGE);
              }
            }}
            title={t("{name} preview", { name: name })}
            tabIndex={-1}
          />
        )}
      </div>
      <div
        className="min-w-0 flex-1"
        title={lintInfo && lintInfo.count > 0 ? lintInfo.messages.join("\n") : undefined}
      >
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-medium text-neutral-300 truncate">{name}</span>
          {isRoot && (
            <span
              aria-label={t("Root composition: opens automatically on load")}
              title={t("Root composition: opens automatically on load")}
              className="flex-shrink-0 rounded-full bg-neutral-700/60 px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-neutral-300"
            >
              {t("Root")}</span>
          )}
          {lintInfo && lintInfo.count > 0 && (
            <span
              aria-label={t("{count} lint findings", { count: lintInfo.count })}
              className="shrink-0 min-w-[16px] text-center rounded-full bg-amber-500/20 px-1 text-[8px] font-bold text-warning-ink"
            >
              {lintInfo.count}
            </span>
          )}
        </div>
        <span className="text-[9px] text-neutral-600 truncate block">{comp}</span>
      </div>
      {onAddToTimeline && (
        <button
          type="button"
          title={t("Add {name} to timeline at playhead", { name: name })}
          aria-label={t("Add {name} to timeline at playhead", { name: name })}
          onClick={(event) => {
            event.stopPropagation();
            onAddToTimeline();
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-neutral-600 opacity-0 transition-[color,background-color,opacity] hover:bg-neutral-800 hover:text-accent-ink group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus:opacity-100"
        >
          <span aria-hidden="true">+</span>
        </button>
      )}
      {onRender && (
        <Tooltip label={isRendering ? t("A render is already in progress") : t("Render {name}", { name: name })}>
          <button
            type="button"
            aria-label={isRendering ? t("A render is already in progress") : t("Render {name}", { name: name })}
            disabled={isRendering}
            onClick={(e) => {
              e.stopPropagation();
              onRender();
            }}
            // h-6 w-6 = the 24x24 WCAG 2.2 (2.5.8) minimum target; the 14px glyph
            // is unchanged, only the box grows. The sibling "+" button is h-8 w-8,
            // so the card row already has the room.
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors ${
              isRendering
                ? "text-neutral-600 cursor-not-allowed"
                : "text-neutral-600 hover:text-accent-ink hover:bg-neutral-800"
            }`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        </Tooltip>
      )}
    </div>
  );
}

export const CompositionsTab = memo(function CompositionsTab({
  projectId,
  compositions,
  activeComposition,
  masterCompositionPath = null,
  onSelect,
  onRenderComposition,
  onAddToTimeline,
  isRendering,
  lintFindingsByFile,
}: CompositionsTabProps) {
  const { t } = useI18n();
  const thumbnailRevisions = usePlayerStore((state) => state.thumbnailRevisions);
  const previewBooted = usePlayerStore((state) => state.previewBooted);
  if (compositions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <p className="text-xs text-neutral-600 text-center">{t("No compositions found")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" data-composition-list>
      {compositions.map((comp) => (
        <CompCard
          key={`${projectId}:${comp}`}
          projectId={projectId}
          comp={comp}
          isActive={activeComposition === comp}
          isRoot={comp === masterCompositionPath}
          onSelect={() => onSelect(comp)}
          onRender={onRenderComposition ? () => onRenderComposition(comp) : undefined}
          onAddToTimeline={onAddToTimeline ? () => onAddToTimeline(comp) : undefined}
          isRendering={isRendering}
          lintInfo={lintFindingsByFile?.get(comp)}
          contentRevision={thumbnailRevisionOf(thumbnailRevisions, comp)}
          previewBooted={previewBooted}
        />
      ))}
    </div>
  );
});
