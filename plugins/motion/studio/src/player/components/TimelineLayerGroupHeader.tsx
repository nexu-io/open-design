import { useI18n } from "../../i18n/I18n";
import type { TimelineTheme } from "./timelineTheme";
import { GUTTER } from "./timelineLayout";
import type { StackingTimelineLayer, TimelineLayerId } from "./timelineTrackOrder";

export const TIMELINE_LAYER_GROUP_HEADER_H = 18;

export function shouldShowTimelineLayerGroupHeader(
  contextKey: string,
  previousContextKey: string,
): boolean {
  return contextKey !== "" && contextKey !== previousContextKey;
}

export function getTimelineLayerGroupHeaderTotalHeight(
  layerOrder: readonly TimelineLayerId[],
  layers: readonly StackingTimelineLayer[],
): number {
  const layerById = new Map<TimelineLayerId, StackingTimelineLayer>();
  for (const layer of layers) layerById.set(layer.id, layer);

  let previousContextKey = "";
  let count = 0;
  for (const layerId of layerOrder) {
    const contextKey = layerById.get(layerId)?.contextKey ?? "";
    if (shouldShowTimelineLayerGroupHeader(contextKey, previousContextKey)) count += 1;
    previousContextKey = contextKey;
  }
  return count * TIMELINE_LAYER_GROUP_HEADER_H;
}

interface TimelineLayerGroupHeaderProps {
  contextKey: string;
  trackContentWidth: number;
  theme: TimelineTheme;
  accentColor: string;
}

export function TimelineLayerGroupHeader({
  contextKey,
  trackContentWidth,
  theme,
  accentColor,
}: TimelineLayerGroupHeaderProps) {
  const { t } = useI18n();
  return (
    <div
      className="relative"
      style={{
        height: TIMELINE_LAYER_GROUP_HEADER_H,
        // Fill the full canvas width (min 100% of the panel) so the context
        // header spans the timeline at any zoom; minWidth preserves the intrinsic
        // composition width when zoomed in and scrolling.
        width: "100%",
        minWidth: GUTTER + trackContentWidth,
        background: theme.gutterBackground,
        borderBottom: `1px solid ${theme.rowBorder}`,
      }}
    >
      <div
        className="sticky left-0 z-13 flex h-full items-center"
        style={{
          width: Math.min(GUTTER + 220, GUTTER + trackContentWidth),
          background: theme.gutterBackground,
        }}
      >
        <div
          className="relative h-full shrink-0"
          style={{
            width: GUTTER,
            borderRight: `1px solid ${theme.gutterBorder}`,
          }}
        >
          <span
            className="absolute bottom-0 top-0"
            style={{
              left: 8,
              width: 2,
              background: accentColor,
              opacity: 0.72,
            }}
          />
        </div>
        <div className="min-w-0 px-2">
          <span
            className="block truncate font-mono uppercase leading-none"
            style={{
              color: theme.textSecondary,
              fontSize: 10,
              letterSpacing: 0,
            }}
          >
            {t("Inside:")}{" "}{contextKey}
          </span>
        </div>
      </div>
    </div>
  );
}
