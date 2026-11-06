import { useI18n } from "../../i18n/I18n";
import { memo, useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { canSplitElement } from "../../utils/timelineElementSplit";
import { useContextMenuDismiss } from "../../hooks/useContextMenuDismiss";
import { useMenuKeyboardNav } from "./menuKeyboardNav";
import type { TimelineClipMenuItem } from "./TimelineTypes";
import { ClipMenuToolItems } from "./clipMenuToolItems";
import { ClipMenuAudioItems } from "./clipMenuAudioItems";
import { ClipMenuLinkItems } from "./clipMenuLinkItems";
import { menuClasses } from "../../components/ui/menuStyle";
import { useTimelineEditContextOptional } from "../../contexts/TimelineEditContext";
import { keyHint, useStudioKeys } from "./studioShortcuts";

const MENU_MARGIN = 8;

function useMeasuredHeight(ref: RefObject<HTMLDivElement | null>, anchorKey: string): number {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    setHeight(node.offsetHeight);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, anchorKey]);
  return height;
}

interface ClipContextMenuProps {
  x: number;
  y: number;
  element: TimelineElement;
  currentTime: number;
  onClose: () => void;
  onSplit: (element: TimelineElement, splitTime: number) => void;
  onDelete: (element: TimelineElement) => void;
  onCopy?: () => boolean;
  onPaste?: () => Promise<void>;
  onDuplicate?: () => Promise<boolean>;
  canPaste?: boolean;
  hostItems?: readonly TimelineClipMenuItem[] | undefined;
  splitShortcut?: string | undefined;
}

const itemClass = (enabled: boolean) =>
  `${menuClasses.row} flex items-center justify-between ${enabled ? menuClasses.rowEnabled : menuClasses.rowDisabled}`;

/** The host's items, above Studio's. A pick closes the menu; focus the item moves stays where it went. */
function HostItems({
  items,
  onClose,
}: {
  items: readonly TimelineClipMenuItem[];
  onClose: () => void;
}) {
  return (
    <>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={itemClass(!item.disabled)}
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          <span className="flex items-center gap-2">
            {item.icon}
            {item.label}
          </span>
          {item.shortcut && (
            <span className="text-neutral-500 text-[10px] ml-3">{item.shortcut}</span>
          )}
        </button>
      ))}
    </>
  );
}

// A menu with many independently gated items (Split/Delete/Copy/Paste/Duplicate).
// fallow-ignore-next-line complexity
export const ClipContextMenu = memo(function ClipContextMenu({
  x,
  y,
  element,
  currentTime,
  onClose,
  onSplit,
  onDelete,
  onCopy,
  onPaste,
  onDuplicate,
  canPaste,
  hostItems = [],
  splitShortcut,
}: ClipContextMenuProps) {
  const { t } = useI18n();
  const keys = useStudioKeys();
  const menuRef = useContextMenuDismiss(onClose);
  useMenuKeyboardNav(menuRef);
  const tools = useTimelineEditContextOptional().clipMenuTools !== false;
  // The right-clicked clip's own id: a member of the live multi-selection
  // means Copy/Duplicate act on the whole group, matching onContextMenuClip's
  // selection-preserving behaviour for a right-click inside it.
  const selectionSize = usePlayerStore((s) => {
    const id = element.key ?? element.id;
    return s.selectedElementIds.size > 1 && s.selectedElementIds.has(id)
      ? s.selectedElementIds.size
      : 1;
  });

  const isSplittable = canSplitElement(element) && ["video", "audio", "img"].includes(element.tag);
  const canSplit =
    isSplittable && currentTime > element.start && currentTime < element.start + element.duration;

  const splitLabel = !isSplittable
    ? null
    : canSplit
      ? t("Split at {value0}s", { value0: currentTime.toFixed(2) })
      : "Split (move playhead inside clip)";

  const menuWidth = 200;
  const adjustedX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
  const menuHeight = useMeasuredHeight(menuRef, `${x},${y},${element.key ?? element.id}`);
  const overflowY = y + menuHeight - window.innerHeight;
  const adjustedY = overflowY > 0 ? Math.max(MENU_MARGIN, y - overflowY - MENU_MARGIN) : y;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={t("Clip actions")}
      className={`${menuClasses.panel} fixed z-200 min-w-[180px]`}
      style={{ left: adjustedX, top: adjustedY }}
    >
      {hostItems.length > 0 && (
        <div role="group" aria-label={t("Host")} className={menuClasses.group}>
          <HostItems items={hostItems} onClose={onClose} />
        </div>
      )}
      <div role="group" aria-label={t("Time")} className={menuClasses.group}>
        {splitLabel && (
          <button
            type="button"
            role="menuitem"
            className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left outline-hidden focus-visible:bg-neutral-800 ${
              canSplit
                ? "text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                : "text-neutral-600 cursor-not-allowed"
            }`}
            disabled={!canSplit}
            onClick={() => {
              if (canSplit) {
                onSplit(element, currentTime);
                onClose();
              }
            }}
          >
            <span>{splitLabel}</span>
            <span className="text-neutral-500 text-[10px] ml-3">
              {splitShortcut ?? keyHint("split", keys)}
            </span>
          </button>
        )}
        {tools && splitLabel && (
          <ClipMenuToolItems
            group="time"
            element={element}
            currentTime={currentTime}
            onClose={onClose}
          />
        )}
      </div>

      <div role="group" aria-label={t("Sound")} className={menuClasses.group}>
        {tools && (
          <>
            <ClipMenuAudioItems part="gain" element={element} onClose={onClose} />
            <ClipMenuToolItems
              group="sound"
              element={element}
              currentTime={currentTime}
              onClose={onClose}
            />
            <ClipMenuLinkItems part="link" element={element} onClose={onClose} />
            <ClipMenuAudioItems part="duck" element={element} onClose={onClose} />
          </>
        )}
      </div>

      <div role="group" aria-label={t("Picture")} className={menuClasses.group}>
        {tools && (
          <ClipMenuToolItems
            group="picture"
            element={element}
            currentTime={currentTime}
            onClose={onClose}
          />
        )}
      </div>

      <div role="group" aria-label={t("Clipboard")} className={menuClasses.group}>
        {onCopy && (
          <button
            type="button"
            role="menuitem"
            className={itemClass(true)}
            onClick={() => {
              onCopy();
              onClose();
            }}
          >
            <span>{selectionSize > 1 ? t("Copy {selectionSize} clips", { selectionSize: selectionSize }) : t("Copy")}</span>
            <span className="text-neutral-500 text-[10px] ml-3">{keyHint("copy", keys)}</span>
          </button>
        )}
        {onPaste && (
          <button
            type="button"
            role="menuitem"
            className={itemClass(!!canPaste)}
            disabled={!canPaste}
            onClick={() => {
              if (!canPaste) return;
              void onPaste();
              onClose();
            }}
          >
            <span>{t("Paste")}</span>
            <span className="text-neutral-500 text-[10px] ml-3">{keyHint("paste", keys)}</span>
          </button>
        )}
        {onDuplicate && (
          <button
            type="button"
            role="menuitem"
            className={itemClass(true)}
            onClick={() => {
              void onDuplicate();
              onClose();
            }}
          >
            <span>{selectionSize > 1 ? t("Duplicate {selectionSize} clips", { selectionSize: selectionSize }) : t("Duplicate")}</span>
            <span className="text-neutral-500 text-[10px] ml-3">{keyHint("duplicate", keys)}</span>
          </button>
        )}
      </div>

      <div role="group" aria-label={t("Delete")}>
        <button
          type="button"
          role="menuitem"
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-danger-ink hover:bg-neutral-800 focus-visible:bg-neutral-800 outline-hidden cursor-pointer text-left"
          onClick={() => {
            onDelete(element);
            onClose();
          }}
        >
          <span>{t("Delete")}</span>
          <span className="text-neutral-500 text-[10px] ml-3">⌫</span>
        </button>
        {tools && <ClipMenuLinkItems part="delete" element={element} onClose={onClose} />}
      </div>
    </div>,
    document.body,
  );
});
