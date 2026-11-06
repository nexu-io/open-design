import { useI18n } from "../../i18n/I18n";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  isFitZoom,
  isPreviewAtFit,
  resolvePreviewVisibleRegion,
  toDomPrecision,
  type PreviewZoomState,
} from "./previewZoom";

const NAVIGATOR_PX = 112;

function zoomChipLabel(zoomPercent: number): string {
  return isFitZoom(zoomPercent) ? "Panned" : `Zoomed ${Math.round(zoomPercent)}%`;
}

function navigatorFrameSize(stage: { width: number; height: number }) {
  const ratio = stage.width > 0 && stage.height > 0 ? stage.width / stage.height : 16 / 9;
  return ratio >= 1
    ? { width: NAVIGATOR_PX, height: toDomPrecision(NAVIGATOR_PX / ratio) }
    : { width: toDomPrecision(NAVIGATOR_PX * ratio), height: NAVIGATOR_PX };
}

/** `draw` moves the navigator's highlight without a render, so it can follow every transform write. */
export function usePreviewNavigator(
  viewportRef: RefObject<HTMLDivElement | null>,
  stageSize: { width: number; height: number },
  zoomRef: RefObject<PreviewZoomState>,
) {
  const regionRef = useRef<HTMLDivElement | null>(null);
  const stageSizeRef = useRef(stageSize);
  stageSizeRef.current = stageSize;
  const draw = useCallback(
    (state: PreviewZoomState) => {
      const region = regionRef.current;
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!region || !rect) return;
      const visible = resolvePreviewVisibleRegion({
        state,
        viewportWidth: rect.width,
        viewportHeight: rect.height,
        contentWidth: stageSizeRef.current.width,
        contentHeight: stageSizeRef.current.height,
      });
      region.style.left = `${visible.left * 100}%`;
      region.style.top = `${visible.top * 100}%`;
      region.style.width = `${visible.width * 100}%`;
      region.style.height = `${visible.height * 100}%`;
    },
    [viewportRef],
  );
  const setRegion = useCallback(
    (node: HTMLDivElement | null) => {
      regionRef.current = node;
      draw(zoomRef.current);
    },
    [draw, zoomRef],
  );
  useEffect(() => draw(zoomRef.current), [stageSize, draw, zoomRef]);
  return { draw, setRegion };
}

export function PreviewZoomOverlay({
  zoom,
  stageSize,
  onFit,
  navigatorRegionRef,
}: {
  zoom: PreviewZoomState;
  stageSize: { width: number; height: number };
  onFit: () => void;
  navigatorRegionRef: (node: HTMLDivElement | null) => void;
}) {
  const { t } = useI18n();
  if (isPreviewAtFit(zoom)) return null;
  return (
    <>
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 rounded-md py-1 pl-2.5 pr-1 text-xs text-white/80 bg-black/60 backdrop-blur-xs"
        data-testid="preview-zoom-chip"
        // The pane clears the timeline selection on a pointerdown outside the frame.
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span className="tabular-nums">{zoomChipLabel(zoom.zoomPercent)}</span>
        <span aria-hidden="true" className="text-white/30">
          ·
        </span>
        <button
          type="button"
          className="rounded px-1.5 py-0.5 font-medium text-accent-ink hover:bg-white/10 transition-colors"
          onClick={onFit}
          aria-label={t("Fit the whole frame in view")}
          data-testid="preview-zoom-fit"
        >
          {t("Fit")}</button>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-3 right-3 z-50 rounded-md p-1.5 bg-black/60 backdrop-blur-xs"
        data-testid="preview-zoom-navigator"
      >
        <div className="relative overflow-hidden bg-white/10" style={navigatorFrameSize(stageSize)}>
          <div
            ref={navigatorRegionRef}
            className="absolute rounded-[1px] border border-studio-accent bg-studio-accent/15"
            data-testid="preview-zoom-navigator-region"
          />
        </div>
      </div>
    </>
  );
}
