import { useI18n } from "../../i18n/I18n";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useContextMenuDismiss } from "../../hooks/useContextMenuDismiss";
import { useMenuKeyboardNav } from "./menuKeyboardNav";
import type { TimelineElement } from "../store/playerStore";
import type { TimelineKeyframeTarget } from "./timelineKeyframeIdentity";
import { menuClasses } from "../../components/ui/menuStyle";

export interface KeyframeDiamondContextMenuState {
  x: number;
  y: number;
  /** Timeline project session that created this portaled target. */
  sessionEpoch?: number;
  element: TimelineElement;
  elementId: string;
  percentage: number;
  tweenPercentage?: number;
  propertyGroup?: string;
  animationId?: string;
  currentEase?: string;
}

interface KeyframeDiamondContextMenuProps {
  state: KeyframeDiamondContextMenuState;
  onClose: () => void;
  /** Omitted where this node cannot be deleted on its own (see the arc-waypoint
   *  floor in removeMotionPathPointInScript): an entry that silently no-ops is
   *  worse than no entry. */
  onDelete?: (elementId: string, keyframe: TimelineKeyframeTarget) => void;
  onDeleteAll: (element: TimelineElement, animationId?: string) => void;
  /** Focus this keyframe's ease segment in the inspector. Omitted when the
   *  keyframe carries no tween identity to focus. */
  onEditEase?: (elementId: string, keyframe: TimelineKeyframeTarget) => void;
  /** Copy the keyframe's properties to the clipboard; resolves false on failure. */
  onCopyProperties?: (
    elementId: string,
    keyframe: TimelineKeyframeTarget,
  ) => Promise<boolean> | boolean | void;
  /** Retime the keyframe to the current playhead, preserving its value + ease. */
  onMoveToPlayhead?: (element: TimelineElement, keyframe: TimelineKeyframeTarget) => void;
}

const ITEM_CLS = `${menuClasses.row} ${menuClasses.rowEnabled} flex items-center gap-2`;
const DESTRUCTIVE_ITEM_CLS = `${menuClasses.row} text-danger-ink hover:bg-neutral-800 focus-visible:bg-neutral-800 cursor-pointer flex items-center gap-2`;

export function KeyframeDiamondContextMenu({
  state,
  onClose,
  onDelete,
  onDeleteAll,
  onEditEase,
  onCopyProperties,
  onMoveToPlayhead,
}: KeyframeDiamondContextMenuProps) {
  const { t } = useI18n();
  const menuRef = useContextMenuDismiss(onClose);
  // The clicked diamond's identity, built once: the menu's mutating entries
  // all act on it, and they must not disagree about which keyframe was clicked.
  const keyframe: TimelineKeyframeTarget = {
    percentage: state.percentage,
    tweenPercentage: state.tweenPercentage,
    propertyGroup: state.propertyGroup,
    animationId: state.animationId,
  };
  useMenuKeyboardNav(menuRef);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  const handleCopyProperties = async () => {
    if (!onCopyProperties) return;
    const result = await onCopyProperties(state.elementId, keyframe);
    if (result === false) {
      setCopyStatus("failed");
      setTimeout(() => setCopyStatus("idle"), 1500);
      return;
    }
    setCopyStatus("copied");
    setTimeout(onClose, 700);
  };

  const menuWidth = 200;
  // Measured off the rendered rows, so the flip-up test below stays right as
  // optional entries drop out. The separator counts as roughly a third of a row.
  const rows =
    1 +
    (onMoveToPlayhead ? 1 : 0) +
    (onEditEase ? 1 : 0) +
    (onCopyProperties ? 1 : 0) +
    (onDelete ? 1 : 0);
  const menuHeight = 10 + rows * 30 + 9;
  const overflowY = state.y + menuHeight - window.innerHeight;
  const adjustedX = state.x + menuWidth > window.innerWidth ? state.x - menuWidth : state.x;
  const adjustedY = Math.max(8, overflowY > 0 ? state.y - overflowY - 8 : state.y);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={t("Keyframe actions")}
      className={`${menuClasses.panel} fixed z-200 min-w-[180px] overflow-y-auto`}
      style={{ left: adjustedX, top: adjustedY, maxHeight: `calc(100vh - ${adjustedY + 8}px)` }}
    >
      {onMoveToPlayhead && (
        <button
          type="button"
          role="menuitem"
          className={ITEM_CLS}
          onClick={() => {
            // Pass clip-% — resolveKeyframeTarget keys the cache lookup on clip-%
            // and returns the tween-% for the mutation. Passing tween-% here would
            // miss the lookup on any tween whose window is shorter than the clip.
            onMoveToPlayhead(state.element, keyframe);
            onClose();
          }}
        >
          {t("Move to Playhead")}</button>
      )}

      {onEditEase && (
        <button
          type="button"
          role="menuitem"
          className={`${ITEM_CLS} justify-between`}
          onClick={() => {
            onEditEase(state.elementId, keyframe);
            onClose();
          }}
        >
          <span>{t("Edit Ease…")}</span>
          <span className="text-[10px] text-neutral-500">{state.currentEase ?? "default"}</span>
        </button>
      )}

      {onCopyProperties && (
        <button
          type="button"
          role="menuitem"
          className={ITEM_CLS}
          onClick={() => {
            void handleCopyProperties();
          }}
        >
          {copyStatus === "copied"
            ? t("Copied!")
            : copyStatus === "failed"
              ? t("Copy failed. Check permissions")
              : t("Copy Properties")}
        </button>
      )}

      {/* Delete */}
      {onDelete && (
        <button
          type="button"
          role="menuitem"
          className={DESTRUCTIVE_ITEM_CLS}
          onClick={() => {
            onDelete(state.elementId, keyframe);
            onClose();
          }}
        >
          {t("Delete Keyframe")}</button>
      )}

      {/* Deleting every keyframe sat adjacent to the single delete and styled
          identically. Separate and mark it so the two cannot be misread. */}
      <div className={menuClasses.divider} role="separator" />
      <div className="h-1" aria-hidden="true" />
      <div className={menuClasses.divider} role="separator" />

      <button
        type="button"
        role="menuitem"
        className={`${menuClasses.row} ${menuClasses.rowDanger} flex items-center gap-2`}
        onClick={() => {
          onDeleteAll(state.element, state.animationId);
          onClose();
        }}
      >
        {t("Delete All Keyframes")}</button>
    </div>,
    document.body,
  );
}
