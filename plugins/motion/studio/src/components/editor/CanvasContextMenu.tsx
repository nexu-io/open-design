import { useI18n } from "../../i18n/I18n";
/**
 * Right-click context menu for a selected canvas element.
 *
 * Mirrors the look, positioning, and dismiss behavior of
 * player/components/ClipContextMenu.tsx — portaled to document.body,
 * overflow-adjusted, dismissed on outside-click or Escape via
 * useContextMenuDismiss.
 *
 * ── Wiring (z-order persistence) ─────────────────────────────────────────────
 * Z-index changes are resolved against the live iframe DOM via
 * `resolveZOrderChange`, which returns a MULTI-element patch list (tie-aware:
 * moving a target past an equal-z sibling can require renumbering the affected
 * set). The patches are surfaced through the `onApplyZIndex` prop; the menu
 * itself never mutates element styles — handleDomZIndexReorderCommit applies
 * the live z-index (and injects position when needed) in the same synchronous
 * flow, and captures the TRUE prior styles for its failure rollback.
 *
 * The prop MUST be wired at the call site to route through the full persist
 * path. useDomEditZOrder.ts builds the per-patch PatchTargets (the selected
 * element carries its full selection identity; sibling elements are iframe DOM
 * nodes, so their id / selector are derived from the node and they share the
 * selection's sourceFile) and forwards them to handleDomZIndexReorderCommit.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { memo } from "react";
import { createPortal } from "react-dom";
import type { DomEditSelection } from "./domEditing";
import { useContextMenuDismiss } from "../../hooks/useContextMenuDismiss";
import {
  isZOrderActionEnabled,
  resolveZOrderStep,
  type ZOrderAction,
  type ZOrderPatch,
} from "./canvasContextMenuZOrder";
import { menuClasses } from "../ui/menuStyle";

interface CanvasContextMenuProps {
  /** Viewport x of the right-click event. */
  x: number;
  /** Viewport y of the right-click event. */
  y: number;
  selection: DomEditSelection;
  onClose: () => void;
  /**
   * Called with the resolved z-order patch list and the menu action that
   * produced it (the action feeds the undo coalesce key, so two DIFFERENT
   * actions never merge into one undo step). Each patch is an
   * { element, zIndex } pair (the target and, when a renumber is needed,
   * affected siblings). The menu does NOT touch the live DOM — wire to
   * handleDomZIndexReorderCommit, which applies the live styles itself
   * (see module-level wiring comment).
   *
   * `crossed` is the sibling a forward/backward step moved past, resolved from
   * the SAME pre-mutation render order as the patches (null for front/back or
   * when there is no neighbor). The host uses it to mirror the z action into a
   * timeline lane move (resolveZMirrorLaneMove's crossedKey).
   */
  onApplyZIndex?: (
    patches: ZOrderPatch[],
    action: ZOrderAction,
    crossed: HTMLElement | null,
  ) => void;
  /**
   * Called after a successful bring-forward / send-backward with the sibling
   * the target stepped over (resolved from the SAME pre-mutation state as the
   * patches), so the host can flash a highlight on it in the studio overlay.
   * Never called for front/back or no-op actions.
   */
  onZOrderCrossed?: (crossed: HTMLElement, action: ZOrderAction) => void;
  /**
   * Delete the selected element. Wire to handleDomEditElementDelete from
   * useDomEditActionsContext — same path as the Delete/Backspace hotkey.
   * Absent when the caller wires no delete persist path (e.g. a legacy mount):
   * the Delete item is then hidden rather than shown as a silent no-op.
   */
  onDelete?: (selection: DomEditSelection) => void;
}

type ZAction = "bring-forward" | "send-backward" | "bring-to-front" | "send-to-back";

// Stacked-layer + arrow glyphs, one per z action (16px, stroke, currentColor —
// matches the studio's inline-SVG conventions: fill="none", 1.2 stroke, round
// caps/joins). Single actions show ONE layer diamond with the arrow stepping
// one way; front/back show a TWO-diamond stack with the arrow piercing through
// and beyond it. `paths` are the d attributes, drawn in order.
const Z_ACTION_ICONS: Record<ZAction, string[]> = {
  "bring-forward": [
    "M3 11 L8 8.5 L13 11 L8 13.5 Z", // layer diamond (bottom)
    "M8 8.5 L8 2", // arrow shaft up
    "M5.5 4.5 L8 2 L10.5 4.5", // arrow head
  ],
  "send-backward": [
    "M3 5 L8 2.5 L13 5 L8 7.5 Z", // layer diamond (top)
    "M8 7.5 L8 14", // arrow shaft down
    "M5.5 11.5 L8 14 L10.5 11.5", // arrow head
  ],
  "bring-to-front": [
    "M3 9.5 L8 7 L13 9.5 L8 12 Z", // upper layer of the stack
    "M3 12.5 L8 10 L13 12.5 L8 15 Z", // lower layer of the stack
    "M8 12.5 L8 2", // arrow piercing up through/above the stack
    "M5.5 4.5 L8 2 L10.5 4.5", // arrow head
  ],
  "send-to-back": [
    "M3 4 L8 1.5 L13 4 L8 6.5 Z", // upper layer of the stack
    "M3 7 L8 4.5 L13 7 L8 9.5 Z", // lower layer of the stack
    "M8 3.5 L8 14", // arrow piercing down through/below the stack
    "M5.5 11.5 L8 14 L10.5 11.5", // arrow head
  ],
};

function ZActionIcon({ action }: { action: ZAction }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mr-2 shrink-0"
      aria-hidden="true"
    >
      {Z_ACTION_ICONS[action].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const Z_ACTIONS: Array<{ action: ZAction; label: string }> = [
  { action: "bring-to-front", label: "Bring to front" },
  { action: "bring-forward", label: "Bring forward" },
  { action: "send-backward", label: "Send backward" },
  { action: "send-to-back", label: "Send to back" },
];

export const CanvasContextMenu = memo(function CanvasContextMenu({
  x,
  y,
  selection,
  onClose,
  onApplyZIndex,
  onZOrderCrossed,
  onDelete,
}: CanvasContextMenuProps) {
  const { t } = useI18n();
  const menuRef = useContextMenuDismiss(onClose);

  // Gate each item group on the presence of its persist handler. Without the
  // handler the action can't be persisted, so showing it would be a dead-end:
  // a z-write reverts on reload and Delete silently no-ops. Hide the group
  // instead. If nothing is actionable (a legacy mount with no handlers at all),
  // don't render the menu — an empty menu is itself a dead-end.
  const hasZActions = Boolean(onApplyZIndex);
  const hasDelete = Boolean(onDelete);
  const hasDivider = hasZActions && hasDelete;

  // Overflow correction — match ClipContextMenu approach. Only the rendered
  // groups contribute height (keeps positioning correct when a group is hidden).
  const menuWidth = 200;
  const menuHeight =
    8 + (hasZActions ? Z_ACTIONS.length * 28 : 0) + (hasDivider ? 1 : 0) + (hasDelete ? 28 : 0) + 8; // padding + items + divider + delete + padding
  const overflowY = y + menuHeight - window.innerHeight;
  const adjustedX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
  const adjustedY = overflowY > 0 ? y - overflowY - 8 : y;

  const el = selection.element;

  function handleZAction(action: ZAction) {
    if (!onApplyZIndex) return;
    // Resolved BEFORE the commit path mutates live styles. `crossed` is always
    // resolved (not only for the flash): the host mirrors it into a lane move.
    const step = resolveZOrderStep(el, action);
    if (step === null) return;
    const { patches, crossed } = step;
    // Do NOT pre-apply styles here: handleDomZIndexReorderCommit writes the
    // live z-index (and injects position:relative for static elements) in the
    // same synchronous flow, so feedback is still instant — and it must read
    // the PRE-change styles itself, both to capture true rollback values and
    // to detect a static position that needs persisting.
    onApplyZIndex(patches, action, crossed);
    if (crossed && onZOrderCrossed) onZOrderCrossed(crossed, action);
    onClose();
  }

  function handleDelete() {
    if (!onDelete) return;
    onDelete(selection);
    onClose();
  }

  if (!hasZActions && !hasDelete) return null;

  // The menu is portaled to document.body, but in the React tree it is still a
  // child of the DomEditOverlay <div>. React synthetic events bubble through the
  // REACT tree (not the DOM tree), so a click on any menu control would otherwise
  // bubble into the overlay's onPointerDown / onMouseDown handlers — which
  // preventDefault() to start a marquee and re-resolve the selection. That
  // preventDefault cancels the button's own click and the item action never runs.
  //
  // Stop pointer/mouse propagation at the menu root so overlay gesture handlers
  // never see these events, and drive the item actions on pointerDown (which
  // fires before any outside-click / dismiss logic can unmount the menu).
  const stopBubble = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return createPortal(
    <div
      ref={menuRef}
      className={`${menuClasses.panel} fixed z-200 min-w-[180px]`}
      style={{ left: adjustedX, top: adjustedY }}
      onPointerDown={stopBubble}
      onMouseDown={stopBubble}
      onClick={stopBubble}
      onContextMenu={(e) => {
        // Keep a right-click on the menu itself from re-opening / bubbling.
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {hasZActions &&
        Z_ACTIONS.map(({ action, label }) => {
          const enabled = isZOrderActionEnabled(el, action);
          return (
            <button
              key={action}
              type="button"
              className={`w-full flex items-center px-3 py-1.5 text-xs text-left ${
                enabled
                  ? "text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                  : "text-neutral-600 cursor-not-allowed"
              }`}
              disabled={!enabled}
              // Act on pointerDown, not click: a pointerDown that reaches the
              // overlay/document would otherwise re-select or dismiss the menu
              // before the trailing click fires. Running here guarantees the
              // action lands. Guard `button === 0` so a right-press is ignored.
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                if (enabled) handleZAction(action);
              }}
            >
              {/* Icon inherits the item's text color via currentColor, so the
                  disabled muted tone applies to both icon and label. */}
              <ZActionIcon action={action} />
              <span>{label}</span>
            </button>
          );
        })}

      {hasDivider && <div className={menuClasses.divider} />}

      {hasDelete && (
        <button
          type="button"
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-danger-ink hover:bg-neutral-800 cursor-pointer text-left"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            handleDelete();
          }}
        >
          <span>{t("Delete")}</span>
          <span className="text-neutral-500 text-[10px] ml-3">⌫</span>
        </button>
      )}
    </div>,
    document.body,
  );
});
