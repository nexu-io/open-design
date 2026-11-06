import { useI18n } from "../../i18n/I18n";
/**
 * Context menu for a right-click inside an automation time selection: the four
 * utility shapes, then Simplify. Portal + dismiss handling mirror
 * TrackGapContextMenu; rows never vanish — an inapplicable Simplify dims with
 * a reason instead of leaving a shorter menu.
 */
import { memo } from "react";
import { createPortal } from "react-dom";
import { useContextMenuDismiss } from "../../hooks/useContextMenuDismiss";
import { AUTOMATION_SHAPES, type AutomationShapeId } from "./automationShapes";
import { menuClasses } from "../../components/ui/menuStyle";

interface AutomationSelectionMenuProps {
  x: number;
  y: number;
  onClose(): void;
  onInsertShape(shape: AutomationShapeId): void;
  onSimplify(): void;
  /** At least three points in the range — fewer has nothing to thin. */
  canSimplify: boolean;
}

export const AutomationSelectionMenu = memo(function AutomationSelectionMenu({
  x,
  y,
  onClose,
  onInsertShape,
  onSimplify,
  canSimplify,
}: AutomationSelectionMenuProps) {
  const { t } = useI18n();
  const menuRef = useContextMenuDismiss(onClose);
  const row =
    "block w-full px-2 py-1 text-left text-[11px] text-panel-text-1 hover:bg-panel-hover disabled:opacity-40";
  // Same edge-clamping precedent as TrackGapContextMenu: without it a
  // right-click near the bottom/right of the timeline renders this menu
  // partially off-screen.
  const menuWidth = 140;
  const menuHeight = AUTOMATION_SHAPES.length * 24 + 32;
  const overflowY = y + menuHeight - window.innerHeight;
  const adjustedX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
  const adjustedY = overflowY > 0 ? y - overflowY - 8 : y;
  return createPortal(
    <div
      ref={menuRef}
      // z-200 for the same reason the timeline's FX popover uses it: this is
      // portaled to `document.body`, but the ruler's sticky header sits at z-70
      // in the SAME root stacking context, so a z-50 menu opened near the top of
      // the timeline is painted through by the ruler and the playhead.
      className={`${menuClasses.panel} hf-automation-menu fixed z-200 min-w-[140px]`}
      style={{ left: adjustedX, top: adjustedY }}
    >
      {AUTOMATION_SHAPES.map((shape) => (
        <button
          key={shape.id}
          type="button"
          className={row}
          onClick={() => {
            onInsertShape(shape.id);
            onClose();
          }}
        >
          {shape.label}
        </button>
      ))}
      <div className={menuClasses.divider} />
      <button
        type="button"
        className={row}
        disabled={!canSimplify}
        title={canSimplify ? undefined : t("Fewer than three points in the selection")}
        onClick={() => {
          onSimplify();
          onClose();
        }}
      >
        {t("Simplify")}</button>
    </div>,
    document.body,
  );
});
