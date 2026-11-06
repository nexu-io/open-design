import { useI18n } from "../i18n/I18n";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { LinkSimple } from "@phosphor-icons/react";
import { useContextMenuDismiss } from "../hooks/useContextMenuDismiss";
import { useMenuKeyboardNav } from "../player/components/menuKeyboardNav";
import { useLinkedClipPreferences } from "../utils/linkedClipPreferences";
import { Tooltip } from "./ui";
import { flatActive, flatIdle } from "./timelineToolbarStyles";
import { menuClasses } from "./ui/menuStyle";

function SyncIndicatorMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const { t } = useI18n();
  const menuRef = useContextMenuDismiss(onClose);
  useMenuKeyboardNav(menuRef);
  const visible = useLinkedClipPreferences((s) => s.syncIndicatorsVisible);
  const setVisible = useLinkedClipPreferences((s) => s.setSyncIndicatorsVisible);
  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={t("Linked clips")}
      className={`${menuClasses.panel} fixed z-200 min-w-[200px]`}
      style={{ left: x, top: y }}
    >
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={visible}
        className={`${menuClasses.row} ${menuClasses.rowEnabled} flex items-center gap-2`}
        onClick={() => {
          setVisible(!visible);
          onClose();
        }}
      >
        <span className="w-3 text-studio-accent">{visible ? "✓" : ""}</span>
        {t("Show out-of-sync indicators")}</button>
    </div>,
    document.body,
  );
}

/** Premiere's Linked Selection; right-click holds the out-of-sync indicator preference. */
export function LinkedSelectionToggle() {
  const { t } = useI18n();
  const linkedSelection = useLinkedClipPreferences((s) => s.linkedSelection);
  const setLinkedSelection = useLinkedClipPreferences((s) => s.setLinkedSelection);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const closeMenu = useCallback(() => setMenuAt(null), []);
  return (
    <>
      <Tooltip
        label={
          linkedSelection
            ? t("Linked Selection on: a click selects both halves (⌥-click for one)")
            : t("Linked Selection off: a click selects one clip")
        }
      >
        <button
          type="button"
          onClick={() => setLinkedSelection(!linkedSelection)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenuAt({ x: e.clientX, y: e.clientY });
          }}
          aria-label={t("Linked Selection")}
          aria-pressed={linkedSelection}
          className={linkedSelection ? flatActive : flatIdle}
        >
          <LinkSimple size={16} weight="bold" aria-hidden="true" />
        </button>
      </Tooltip>
      {menuAt && <SyncIndicatorMenu x={menuAt.x} y={menuAt.y} onClose={closeMenu} />}
    </>
  );
}
