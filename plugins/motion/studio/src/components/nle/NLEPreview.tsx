import { useI18n } from "../../i18n/I18n";
import {
  readPreviewCompositionSize,
  type PreviewCompositionSize,
} from "../../utils/previewCompositionSize";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Player } from "../../player";
import { postFrameDisplayScale } from "../../player/lib/runtimeProtocol";
import type { NLEContextValue } from "./NLEContext";
import {
  DEFAULT_PREVIEW_ZOOM,
  canStartPreviewPan,
  clampPreviewPan,
  clampPreviewZoomPercent,
  isPreviewAtFit,
  ownsPreviewPanTarget,
  resolvePreviewWheelPan,
  resolvePreviewWheelZoom,
  toDomPrecision,
  type PreviewZoomState,
} from "./previewZoom";
import { RULER_GUTTER_PX, usePreviewGuidesStore } from "../editor/previewGuidesStore";
import { PreviewZoomOverlay, usePreviewNavigator } from "./PreviewZoomOverlay";
import {
  PREVIEW_STAGE_INSET_PX,
  resolvePreviewStageSize,
  SHADOW_IFRAME_STYLE,
} from "./previewStage";
import { usePreviewFirstFrameTelemetry } from "../../player/hooks/usePreviewFirstFrameTelemetry";
import { PreviewPoster, usePreviewPoster } from "./PreviewPoster";
interface NLEPreviewProps extends Pick<
  NLEContextValue,
  | "projectId"
  | "onIframeLoad"
  | "previewSlots"
  | "onShadowIframeLoad"
  | "onShadowReadyChange"
  | "onShadowError"
  | "setShadowIframeNode"
  | "resetPreviewSlots"
> {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onCompositionLoadingChange?: (loading: boolean) => void;
  portrait?: boolean;
  directUrl?: string;
  suppressLoadingOverlay?: boolean;
  loadingUi?: "studio" | "host";
  onStageRef?: (ref: React.RefObject<HTMLDivElement | null>) => void;
  /** Reports the authored composition size measured from the loaded preview. */
  onCompositionSizeChange?: (size: PreviewCompositionSize | null) => void;
  /** Draws the picture edge to edge in this box, without Studio's inset band. */
  fillBox?: boolean;
  compositionSizeHint?: PreviewCompositionSize;
}

export function getPreviewPlayerKey({
  projectId,
  directUrl,
}: {
  projectId: string;
  directUrl?: string;
}): string {
  return directUrl ?? projectId;
}

const ZOOM_HUD_TIMEOUT_MS = 1200;
const ZOOM_SETTLE_MS = 200;

export const NLEPreview = memo(function NLEPreview({
  projectId,
  iframeRef,
  onIframeLoad,
  previewSlots,
  onShadowIframeLoad,
  onShadowReadyChange,
  onShadowError,
  setShadowIframeNode,
  resetPreviewSlots,
  onCompositionLoadingChange,
  portrait,
  directUrl,
  suppressLoadingOverlay,
  loadingUi,
  onStageRef,
  onCompositionSizeChange,
  fillBox,
  compositionSizeHint,
}: NLEPreviewProps) {
  const { t } = useI18n();
  const activeKey = getPreviewPlayerKey({ projectId, directUrl });
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => {
    onStageRef?.(stageRef);
  }, [onStageRef]);

  // Composition switch: drop any in-flight shadow reload (skipped on first mount).
  const previousActiveKeyRef = useRef(activeKey);
  useEffect(() => {
    if (previousActiveKeyRef.current === activeKey) return;
    previousActiveKeyRef.current = activeKey;
    resetPreviewSlots();
  }, [activeKey, resetPreviewSlots]);

  const liveGenRef = useRef<number | null>(null);
  const reportPreviewFirstFrame = usePreviewFirstFrameTelemetry(previewSlots);
  const [compositionSize, setCompositionSize] = useState<PreviewCompositionSize | null>(null);
  const poster = usePreviewPoster(projectId, activeKey, directUrl);
  const gutterPx = usePreviewGuidesStore((s) => (s.rulerVisible ? RULER_GUTTER_PX : 0));
  const insetPx = fillBox ? 0 : PREVIEW_STAGE_INSET_PX;
  const [stageSize, setStageSize] = useState(() => resolvePreviewStageSize(0, 0, null, portrait));
  const hintWidth = compositionSizeHint?.width;
  const hintHeight = compositionSizeHint?.height;

  const zoomRef = useRef<PreviewZoomState>(DEFAULT_PREVIEW_ZOOM);
  const [settledZoom, setSettledZoom] = useState<PreviewZoomState>(DEFAULT_PREVIEW_ZOOM);
  useEffect(() => postFrameDisplayScale(previewIframeRef.current), [settledZoom]);
  const hudRef = useRef<HTMLDivElement>(null);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomingRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateStageSize = () => {
      const rect = viewport.getBoundingClientRect();
      setStageSize(
        resolvePreviewStageSize(
          rect.width,
          rect.height,
          compositionSize ??
            (hintWidth && hintHeight ? { width: hintWidth, height: hintHeight } : null),
          portrait,
          gutterPx,
          insetPx,
        ),
      );
    };

    updateStageSize();
    const observer = new ResizeObserver(updateStageSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [compositionSize, hintWidth, hintHeight, portrait, gutterPx, insetPx]);

  const onCompositionSizeChangeRef = useRef(onCompositionSizeChange);
  onCompositionSizeChangeRef.current = onCompositionSizeChange;

  const updateCompositionSizeFromPreview = useCallback(() => {
    const next = readPreviewCompositionSize(previewIframeRef.current);
    // Pure updater; the effect below notifies the parent (Strict Mode may run updaters twice).
    setCompositionSize((prev) =>
      prev?.width === next?.width && prev?.height === next?.height ? prev : next,
    );
  }, []);

  useEffect(() => {
    onCompositionSizeChangeRef.current?.(compositionSize);
  }, [compositionSize]);

  const setPreviewIframeRef = useCallback(
    (node: HTMLIFrameElement | null) => {
      previewIframeRef.current = node;
      iframeRef.current = node;
    },
    [iframeRef],
  );

  const stageSizeRef = useRef(stageSize);
  stageSizeRef.current = stageSize;

  const { draw: drawNavigator, setRegion: setNavigatorRegion } = usePreviewNavigator(
    viewportRef,
    stageSize,
    zoomRef,
  );
  const writeTransform = useCallback(
    (state: PreviewZoomState) => {
      const stage = stageRef.current;
      if (!stage) return;
      const s = toDomPrecision(state.zoomPercent / 100);
      const px = toDomPrecision(state.panX);
      const py = toDomPrecision(state.panY);
      stage.style.transform = `translate3d(${px}px, ${py}px, 0) scale(${s})`;
      drawNavigator(state);
    },
    [drawNavigator],
  );

  const zoomProjectRef = useRef(projectId);
  // Before paint, so the next project never shows a frame at the previous one's zoom.
  useLayoutEffect(() => {
    if (zoomProjectRef.current === projectId) return;
    zoomProjectRef.current = projectId;
    zoomRef.current = DEFAULT_PREVIEW_ZOOM;
    writeTransform(DEFAULT_PREVIEW_ZOOM);
    setSettledZoom(DEFAULT_PREVIEW_ZOOM);
  }, [projectId, writeTransform]);

  const applyTransform = useCallback(
    (next: PreviewZoomState, showHud: boolean) => {
      const clamped: PreviewZoomState = {
        zoomPercent: clampPreviewZoomPercent(next.zoomPercent),
        panX: Number.isFinite(next.panX) ? next.panX : 0,
        panY: Number.isFinite(next.panY) ? next.panY : 0,
      };
      zoomRef.current = clamped;

      if (showHud) {
        const hud = hudRef.current;
        if (hud) {
          if (!zoomingRef.current) {
            zoomingRef.current = true;
            hud.style.opacity = "1";
          }
          // Live per-frame readout — without this the HUD shows an empty pill
          // on the first-ever zoom and a stale percentage mid-gesture.
          hud.textContent = isPreviewAtFit(clamped) ? "Fit" : `${Math.round(clamped.zoomPercent)}%`;
        }
      }

      writeTransform(clamped);

      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(() => {
        zoomingRef.current = false;
        const final = zoomRef.current;
        setSettledZoom((prev) =>
          prev.zoomPercent === final.zoomPercent &&
          prev.panX === final.panX &&
          prev.panY === final.panY
            ? prev
            : final,
        );
        if (showHud) {
          const hud = hudRef.current;
          if (hud) {
            hud.textContent = isPreviewAtFit(final) ? "Fit" : `${Math.round(final.zoomPercent)}%`;
            if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
            hudTimerRef.current = setTimeout(() => {
              if (hudRef.current) hudRef.current.style.opacity = "0";
            }, ZOOM_HUD_TIMEOUT_MS);
          }
        }
      }, ZOOM_SETTLE_MS);
    },
    [writeTransform],
  );

  const applyZoom = useCallback(
    (next: PreviewZoomState) => applyTransform(next, true),
    [applyTransform],
  );

  const applyPan = useCallback(
    (next: PreviewZoomState) => applyTransform(next, false),
    [applyTransform],
  );

  const applyInitialZoom = useCallback(() => {
    const z = zoomRef.current;
    if (!isPreviewAtFit(z)) {
      // A composition reload can bring a different frame size than the pan was made on; clamp first.
      const viewport = viewportRef.current;
      const rect = viewport?.getBoundingClientRect();
      const sz = stageSizeRef.current;
      if (rect && rect.width > 0 && rect.height > 0 && sz.width > 0 && sz.height > 0) {
        const pan = clampPreviewPan({
          panX: z.panX,
          panY: z.panY,
          zoomPercent: z.zoomPercent,
          viewportWidth: rect.width,
          viewportHeight: rect.height,
          contentWidth: sz.width,
          contentHeight: sz.height,
        });
        zoomRef.current = { ...z, ...pan };
      }
      writeTransform(zoomRef.current);
    }
  }, [writeTransform]);

  // A promotion does not re-fire Player.onLoad: re-sync the local iframe ref, size and zoom.
  useEffect(() => {
    const live = previewSlots.find((slot) => slot.role === "live");
    if (!live || live.gen === liveGenRef.current) return;
    const isPromotion = liveGenRef.current !== null;
    liveGenRef.current = live.gen;
    if (!isPromotion) return;
    previewIframeRef.current = iframeRef.current;
    updateCompositionSizeFromPreview();
    applyInitialZoom();
  }, [previewSlots, iframeRef, updateCompositionSizeFromPreview, applyInitialZoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      const rect = viewport.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        return;
      }

      const isZoomGesture = event.ctrlKey || event.metaKey;

      if (isZoomGesture) {
        event.preventDefault();
        event.stopPropagation();

        const sz = stageSizeRef.current;
        const cursorX = event.clientX - (rect.left + rect.width / 2);
        const cursorY = event.clientY - (rect.top + rect.height / 2);
        const next = resolvePreviewWheelZoom({
          state: zoomRef.current,
          deltaY: event.deltaY,
          viewportWidth: rect.width,
          viewportHeight: rect.height,
          contentWidth: sz.width,
          contentHeight: sz.height,
          cursorX,
          cursorY,
        });
        applyZoom(next);
        return;
      }

      if (!ownsPreviewPanTarget(event.target, stageRef.current)) return;

      event.preventDefault();
      event.stopPropagation();

      const sz = stageSizeRef.current;
      const next = resolvePreviewWheelPan({
        state: zoomRef.current,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        viewportWidth: rect.width,
        viewportHeight: rect.height,
        contentWidth: sz.width,
        contentHeight: sz.height,
      });
      applyPan(next);
    };

    document.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => document.removeEventListener("wheel", handleWheel, { capture: true });
  }, [applyZoom, applyPan]);

  useEffect(() => {
    const isInsideViewport = (clientX: number, clientY: number): DOMRect | null => {
      const viewport = viewportRef.current;
      if (!viewport) return null;
      const rect = viewport.getBoundingClientRect();
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return null;
      }
      return rect;
    };

    const handlePointerDown = (event: PointerEvent) => {
      const rect = isInsideViewport(event.clientX, event.clientY);
      if (!rect) return;
      if (!ownsPreviewPanTarget(event.target, stageRef.current)) return;
      if (!canStartPreviewPan(event.button)) return;
      event.preventDefault();
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: zoomRef.current.panX,
        originY: zoomRef.current.panY,
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const viewport = viewportRef.current;
      if (!drag || !viewport || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const sz = stageSizeRef.current;
      const pan = clampPreviewPan({
        panX: drag.originX + event.clientX - drag.startX,
        panY: drag.originY + event.clientY - drag.startY,
        zoomPercent: zoomRef.current.zoomPercent,
        viewportWidth: rect.width,
        viewportHeight: rect.height,
        contentWidth: sz.width,
        contentHeight: sz.height,
      });
      applyPan({ ...zoomRef.current, ...pan });
    };

    const finishDrag = (event: PointerEvent) => {
      if (dragRef.current?.pointerId === event.pointerId) {
        dragRef.current = null;
      }
    };

    const handleAuxClick = (event: MouseEvent) => {
      if (event.button !== 1) return;
      if (!isInsideViewport(event.clientX, event.clientY)) return;
      if (!ownsPreviewPanTarget(event.target, stageRef.current)) return;
      event.preventDefault();
    };

    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    document.addEventListener("pointermove", handlePointerMove, { capture: true });
    document.addEventListener("pointerup", finishDrag, { capture: true });
    document.addEventListener("pointercancel", finishDrag, { capture: true });
    document.addEventListener("auxclick", handleAuxClick, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      document.removeEventListener("pointermove", handlePointerMove, { capture: true });
      document.removeEventListener("pointerup", finishDrag, { capture: true });
      document.removeEventListener("pointercancel", finishDrag, { capture: true });
      document.removeEventListener("auxclick", handleAuxClick, { capture: true });
    };
  }, [applyPan]);

  const initial = zoomRef.current;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        ref={viewportRef}
        className="relative flex-1 flex items-center justify-center overflow-hidden min-h-0 outline-hidden focus:ring-1 focus:ring-studio-accent/40 bg-[var(--studio-preview-bg,var(--color-neutral-950))]"
        tabIndex={0}
        aria-label={t("Composition preview")}
      >
        <div
          className="absolute flex items-center justify-center pointer-events-none"
          style={{ inset: insetPx }}
        >
          <div
            ref={stageRef}
            className="relative shrink-0 pointer-events-auto shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_4px_32px_rgba(0,0,0,0.7)]"
            style={{
              width: `${stageSize.width}px`,
              height: `${stageSize.height}px`,
              transform: `translate3d(${toDomPrecision(initial.panX)}px, ${toDomPrecision(initial.panY)}px, 0) scale(${toDomPrecision(initial.zoomPercent / 100)})`,
              // resolvePreviewWheelZoom cursor math assumes center-center pivot
              transformOrigin: "center center",
            }}
            data-testid="preview-zoom-stage"
          >
            {directUrl?.includes("/components/") && (
              <Player
                key={`backdrop-${projectId}`}
                projectId={projectId}
                onLoad={() => {}}
                portrait={portrait}
                suppressLoadingOverlay
                style={{ position: "absolute", inset: 0, zIndex: 0 }}
              />
            )}
            {previewSlots.map((slot) =>
              slot.role === "live" ? (
                <Player
                  key={`${activeKey}-${slot.gen}`}
                  ref={setPreviewIframeRef}
                  projectId={directUrl ? undefined : projectId}
                  directUrl={directUrl}
                  onLoad={() => {
                    updateCompositionSizeFromPreview();
                    onIframeLoad();
                    applyInitialZoom();
                  }}
                  onCompositionLoadingChange={onCompositionLoadingChange}
                  onReadyToShowChange={poster.onLiveReadyToShowChange}
                  onPreviewError={poster.onPreviewError}
                  onPainted={(details) => reportPreviewFirstFrame(slot, details)}
                  portrait={portrait}
                  suppressLoadingOverlay={suppressLoadingOverlay}
                  loadingUi={loadingUi}
                  style={
                    directUrl?.includes("/components/")
                      ? { position: "absolute", inset: 0, zIndex: 1 }
                      : undefined
                  }
                />
              ) : (
                // Loads hidden behind the live slot until promoted.
                <Player
                  key={`${activeKey}-${slot.gen}`}
                  ref={setShadowIframeNode}
                  directUrl={slot.url}
                  onLoad={() => onShadowIframeLoad(slot.gen)}
                  onReadyToShowChange={(ready) => onShadowReadyChange(slot.gen, ready)}
                  onPainted={(details) => reportPreviewFirstFrame(slot, details)}
                  onPreviewError={(message) => onShadowError(slot.gen, message)}
                  portrait={portrait}
                  suppressLoadingOverlay
                  noLoadTimeout
                  style={SHADOW_IFRAME_STYLE}
                />
              ),
            )}
            {poster.mountPoster && (
              <PreviewPoster
                key={activeKey}
                projectId={projectId}
                hidden={poster.hidePoster}
                onSize={(size) => setCompositionSize((prev) => prev ?? size)}
                onLoaded={poster.onPosterLoaded}
                onMissing={poster.onPosterMissing}
              />
            )}
          </div>
        </div>
        <div
          ref={hudRef}
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 rounded-lg px-4 py-2 text-sm font-mono tabular-nums text-white/90 bg-black/60 backdrop-blur-xs shadow-lg"
          style={{ opacity: 0, transition: "opacity 200ms ease-in" }}
          aria-live="polite"
        />
        <PreviewZoomOverlay
          zoom={settledZoom}
          stageSize={stageSize}
          onFit={() => {
            applyZoom(DEFAULT_PREVIEW_ZOOM);
            viewportRef.current?.focus();
          }}
          navigatorRegionRef={setNavigatorRegion}
        />
      </div>
    </div>
  );
});
