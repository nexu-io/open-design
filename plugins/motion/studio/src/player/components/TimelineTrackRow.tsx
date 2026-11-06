import { useI18n } from "../../i18n/I18n";
import type { ReactNode } from "react";
import { timelineLogicalRowCellId } from "./timelineNavigationIdentity";
import type { TimelineLogicalRow } from "./timelineKeyboardNavigation";

interface TimelineTrackRowProps {
  index: number;
  rowKey: number;
  logicalRow: TimelineLogicalRow;
  propertyRows: readonly TimelineLogicalRow[];
  /** Names the canvas-side content cell — the active clip's own property lanes,
   *  minted with this single id in TimelinePropertyLanes. */
  lanesId: string;
  /** Names the header cell. Space-separated because the caret it lives under
   *  expands two disjoint subtrees (the clip's keyframe lanes AND the track's
   *  automation lanes) — see TimelineTrackHeader for why they cannot share one id. */
  headerLanesId: string;
  top: number;
  height: number;
  virtualized: boolean;
  background: string;
  borderColor: string;
  rovingTargetId?: string | null;
  children: ReactNode;
}

/** Accessible row shell; edit geometry owns its exact top and height. */
export function TimelineTrackRow({
  index,
  rowKey,
  logicalRow,
  propertyRows,
  lanesId,
  headerLanesId,
  top,
  height,
  virtualized,
  background,
  borderColor,
  rovingTargetId = null,
  children,
}: TimelineTrackRowProps) {
  const { t } = useI18n();
  return (
    <div
      role="rowgroup"
      data-index={index}
      data-timeline-row={index}
      data-timeline-row-key={rowKey}
      className={virtualized ? "absolute left-0 right-0" : "relative"}
      style={{
        top: virtualized ? top : undefined,
        height,
        background,
        borderBottom: `1px solid ${borderColor}`,
      }}
    >
      <div
        role="row"
        aria-rowindex={logicalRow.logicalIndex + 1}
        aria-level={logicalRow.level}
        aria-expanded={logicalRow.expandable ? logicalRow.expanded : undefined}
        data-timeline-logical-row-id={logicalRow.id}
        data-timeline-focus-id={logicalRow.id}
        tabIndex={rovingTargetId === logicalRow.id ? 0 : -1}
        className="flex"
        style={{ height }}
      >
        {children}
      </div>
      {propertyRows.map((row) => {
        const group = row.propertyGroup;
        const keyframeCount = row.items.filter((item) => item.kind === "keyframe").length;
        const easeCount = row.items.filter((item) => item.kind === "ease").length;
        return (
          // ponytail: aria-owns maps this hidden logical row onto the two visible
          // property-lane cells without duplicating interactive controls.
          <div
            key={row.id}
            role="row"
            aria-rowindex={row.logicalIndex + 1}
            aria-level={row.level}
            data-property-group={group}
            data-timeline-logical-row-id={row.id}
            className="sr-only"
          >
            <div
              role="rowheader"
              aria-colindex={1}
              aria-owns={timelineLogicalRowCellId(headerLanesId, row.id, "header")}
            >
              {group}
            </div>
            <div
              role="gridcell"
              aria-colindex={2}
              aria-owns={timelineLogicalRowCellId(lanesId, row.id, "content")}
            >
              {keyframeCount} {t("keyframes,")}{" "}{easeCount} {t("ease controls")}</div>
          </div>
        );
      })}
    </div>
  );
}
