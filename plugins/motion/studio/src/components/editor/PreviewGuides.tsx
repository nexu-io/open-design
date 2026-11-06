import { memo, useRef, type RefObject } from "react";
import { useDomEditCompositionRect } from "./useDomEditCompositionRect";
import { RULER_GUTTER_PX } from "./previewGuidesStore";
import { SAFE_BOX_PERCENTS, safeBoxInsetPercent } from "../../utils/previewSafeMargins";
import { usePreviewOverlayContext } from "./PreviewOverlayProvider";

const TICKS = Array.from({ length: 11 }, (_, i) => i * 10);
const INK = "color-mix(in srgb, white 70%, transparent)";

/** Ruler and safe-margin boxes drawn over the preview pane, never inside the composition. */
export const PreviewGuides = memo(function PreviewGuides() {
  const { state } = usePreviewOverlayContext();
  const { rulerVisible, safeMarginsVisible } = state;
  if (!rulerVisible && !safeMarginsVisible) return null;
  return (
    <ActiveGuides
      iframeRef={state.iframeRef}
      rulerVisible={rulerVisible}
      safeMarginsVisible={safeMarginsVisible}
    />
  );
});

interface ActiveGuidesProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  rulerVisible: boolean;
  safeMarginsVisible: boolean;
}

/** Owns the composition-rect subscription, so it only runs while a guide is on. */
function ActiveGuides({ iframeRef, rulerVisible, safeMarginsVisible }: ActiveGuidesProps) {
  const paneRef = useRef<HTMLDivElement>(null);
  const rect = useDomEditCompositionRect({ iframeRef, overlayRef: paneRef });
  const ready = rect.width > 0 && rect.height > 0;

  return (
    <div ref={paneRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
      {ready && rulerVisible && (
        <>
          <div
            data-testid="preview-ruler-top"
            className="absolute bg-black/70"
            style={{
              left: rect.left,
              top: rect.top - RULER_GUTTER_PX,
              width: rect.width,
              height: RULER_GUTTER_PX,
            }}
          >
            {TICKS.map((pct) => (
              <span
                key={pct}
                className="absolute bottom-0 border-l text-[9px] leading-none tabular-nums pl-0.5 h-2.5"
                style={{ left: `${pct}%`, borderColor: INK, color: INK }}
              >
                {pct}
              </span>
            ))}
          </div>
          <div
            data-testid="preview-ruler-left"
            className="absolute bg-black/70"
            style={{
              left: rect.left - RULER_GUTTER_PX,
              top: rect.top,
              width: RULER_GUTTER_PX,
              height: rect.height,
            }}
          >
            {TICKS.map((pct) => (
              <span
                key={pct}
                className="absolute right-0 border-t text-[9px] leading-none tabular-nums pt-0.5 w-2.5"
                style={{ top: `${pct}%`, borderColor: INK, color: INK }}
              >
                {pct}
              </span>
            ))}
          </div>
        </>
      )}
      {ready && safeMarginsVisible && (
        <div
          className="absolute"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        >
          {SAFE_BOX_PERCENTS.map((boxPercent) => (
            <SafeBox key={boxPercent} boxPercent={boxPercent} />
          ))}
        </div>
      )}
    </div>
  );
}

const TICK_PX = 7;
const EDGE_MIDPOINTS = [
  { edge: "top", style: { left: "50%", top: -(TICK_PX + 1) / 2, width: 1, height: TICK_PX } },
  { edge: "bottom", style: { left: "50%", bottom: -(TICK_PX + 1) / 2, width: 1, height: TICK_PX } },
  { edge: "left", style: { top: "50%", left: -(TICK_PX + 1) / 2, width: TICK_PX, height: 1 } },
  { edge: "right", style: { top: "50%", right: -(TICK_PX + 1) / 2, width: TICK_PX, height: 1 } },
] as const;

/** One thin white box inset from every edge, with a tick at the midpoint of each edge. */
function SafeBox({ boxPercent }: { boxPercent: number }) {
  const inset = `${safeBoxInsetPercent(boxPercent)}%`;
  return (
    <div
      data-testid={`preview-safe-${boxPercent}`}
      className="absolute border border-white/90"
      style={{
        left: inset,
        top: inset,
        right: inset,
        bottom: inset,
      }}
    >
      {EDGE_MIDPOINTS.map(({ edge, style }) => (
        <span key={edge} className="absolute bg-white/90" style={style} />
      ))}
    </div>
  );
}
