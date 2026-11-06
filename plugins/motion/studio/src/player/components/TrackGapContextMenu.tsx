import { useI18n } from "../../i18n/I18n";
import { memo } from "react";
import { createPortal } from "react-dom";
import { useContextMenuDismiss } from "../../hooks/useContextMenuDismiss";
import { menuClasses } from "../../components/ui/menuStyle";

interface TrackGapContextMenuProps {
  x: number;
  y: number;
  /** Width (seconds) of the gap under the pointer, or null when no clip exists to the right. */
  gapWidth: number | null;
  /** "Close gap" actionable: a gap exists AND every clip that must shift is movable. */
  canCloseGap: boolean;
  /** "Close all gaps" actionable: the lane has gaps AND every shifting clip is movable. */
  canCloseAllGaps: boolean;
  /** The lane has at least one gap (distinguishes the two disabled reasons). */
  hasAnyGaps: boolean;
  onClose: () => void;
  onCloseGap: () => void;
  onCloseAllGaps: () => void;
  /** Hover state for the gap-strip highlight overlay (null = nothing hovered).
   *  Only reported for ACTIONABLE rows — a disabled row closes nothing, so
   *  highlighting from it would promise an action that can't happen. */
  onHoverAction: (action: "close-gap" | "close-all" | null) => void;
}

/**
 * Context menu for right-clicking EMPTY space on a timeline lane
 * (CapCut/Premiere-style). Offers "Close gap" (collapse the clicked gap by
 * shifting the following clips on that lane left) and "Close all gaps"
 * (compact the whole lane contiguous from 0). Both rows are ALWAYS present —
 * an inapplicable action dims with a tooltip explaining why, rather than
 * vanishing into a one-item menu. Hovering an actionable row highlights the
 * gap strip(s) it would close (via onHoverAction → TimelineCanvas overlay).
 * Styling mirrors ClipContextMenu.
 */
export const TrackGapContextMenu = memo(function TrackGapContextMenu({
  x,
  y,
  gapWidth,
  canCloseGap,
  canCloseAllGaps,
  hasAnyGaps,
  onClose,
  onCloseGap,
  onCloseAllGaps,
  onHoverAction,
}: TrackGapContextMenuProps) {
  const { t } = useI18n();
  const menuRef = useContextMenuDismiss(onClose);

  const menuWidth = 200;
  const menuHeight = 68;
  const overflowY = y + menuHeight - window.innerHeight;
  const adjustedX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
  const adjustedY = overflowY > 0 ? y - overflowY - 8 : y;

  const itemClass = (enabled: boolean) =>
    `${menuClasses.row} flex items-center justify-between ${enabled ? menuClasses.rowEnabled : menuClasses.rowDisabled}`;

  // Disabled reasons: no gap under the pointer beats the lock reason — a
  // pointer not on a gap has nothing to close regardless of movability.
  const closeGapTitle = canCloseGap
    ? undefined
    : gapWidth == null
      ? "No gap here"
      : "A clip on this track can't be moved";
  const closeAllTitle = canCloseAllGaps
    ? undefined
    : hasAnyGaps
      ? "A clip on this track can't be moved"
      : "No gaps on this track";

  return createPortal(
    <div
      ref={menuRef}
      className={`${menuClasses.panel} fixed z-200 min-w-[180px]`}
      style={{ left: adjustedX, top: adjustedY }}
      onPointerLeave={() => onHoverAction(null)}
    >
      <button
        type="button"
        className={itemClass(canCloseGap)}
        disabled={!canCloseGap}
        title={closeGapTitle}
        onPointerEnter={() => onHoverAction(canCloseGap ? "close-gap" : null)}
        onClick={() => {
          if (!canCloseGap) return;
          onCloseGap();
          onClose();
        }}
      >
        <span>{t("Close gap")}</span>
        {gapWidth != null && (
          <span className="text-neutral-500 text-[10px] ml-3">{gapWidth.toFixed(2)}s</span>
        )}
      </button>
      <button
        type="button"
        className={itemClass(canCloseAllGaps)}
        disabled={!canCloseAllGaps}
        title={closeAllTitle}
        onPointerEnter={() => onHoverAction(canCloseAllGaps ? "close-all" : null)}
        onClick={() => {
          if (!canCloseAllGaps) return;
          onCloseAllGaps();
          onClose();
        }}
      >
        <span>{t("Close all gaps")}</span>
      </button>
    </div>,
    document.body,
  );
});
