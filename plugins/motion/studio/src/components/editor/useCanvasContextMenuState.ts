/**
 * Canvas right-click context-menu state for DomEditOverlay: where the menu is
 * open (viewport x/y) and which selection it targets, plus the right-click
 * handler that resolves/selects the element under the pointer before opening.
 */
import { useCallback, useEffect, useState, type RefObject } from "react";
import type { DomEditSelection } from "./domEditing";

export interface CanvasContextMenuState {
  x: number;
  y: number;
  sel: DomEditSelection;
}

interface UseCanvasContextMenuStateParams {
  selection: DomEditSelection | null;
  selectionRef: RefObject<DomEditSelection | null>;
  hoverSelectionRef: RefObject<DomEditSelection | null>;
  onCanvasPointerMoveRef: RefObject<
    (
      event: React.PointerEvent<HTMLDivElement>,
      options?: { preferClipAncestor?: boolean },
    ) => Promise<DomEditSelection | null>
  >;
  onSelectionChangeRef: RefObject<
    (selection: DomEditSelection, options?: { revealPanel?: boolean; additive?: boolean }) => void
  >;
}

export function useCanvasContextMenuState({
  selection,
  selectionRef,
  hoverSelectionRef,
  onCanvasPointerMoveRef,
  onSelectionChangeRef,
}: UseCanvasContextMenuStateParams): {
  contextMenu: CanvasContextMenuState | null;
  closeContextMenu: () => void;
  handleContextMenu: (event: React.MouseEvent<HTMLDivElement>) => Promise<void>;
} {
  // Context menu state: position of the right-click that opened it.
  // contextMenu.sel is the element the menu targets — captured at right-click
  // time so the menu can open even before the React selection state settles.
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Close the context menu whenever the selection moves off the element the menu
  // targets (a click that reselects elsewhere, a deselect, or a preview reload
  // that rebuilds the selection). Without this the menu can linger — orphaned —
  // over a stale target after the underlying element is gone. A right-click that
  // OPENS the menu also selects its target, so the common open path keeps the
  // menu (same element) rather than immediately dismissing it.
  useEffect(() => {
    if (!contextMenu) return;
    if (!selection || selection.element !== contextMenu.sel.element) {
      setContextMenu(null);
    }
  }, [selection, contextMenu]);

  // Right-click: select element first (if not already selected), then open menu.
  const handleContextMenu = useCallback(
    async (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();

      // If no element is selected yet, resolve it from the pointer position first.
      const currentSel = selectionRef.current;
      let activeSel: DomEditSelection | null = currentSel;
      if (!currentSel) {
        const pointerEvent = event as unknown as React.PointerEvent<HTMLDivElement>;
        const resolved = await onCanvasPointerMoveRef.current(pointerEvent);
        if (!resolved) return; // Nothing under the cursor — skip menu.
        onSelectionChangeRef.current(resolved, { revealPanel: true });
        // Use `resolved` directly: React state (and therefore selectionRef) won't
        // update synchronously after onSelectionChange — we'd be reading stale null.
        activeSel = resolved;
      } else {
        // Check if the user right-clicked on an unselected element (hover target).
        const hover = hoverSelectionRef.current;
        if (hover && hover.element !== currentSel.element) {
          onSelectionChangeRef.current(hover, { revealPanel: true });
          activeSel = hover;
        }
      }

      if (!activeSel) return;
      setContextMenu({ x: event.clientX, y: event.clientY, sel: activeSel });
    },
    [selectionRef, hoverSelectionRef, onCanvasPointerMoveRef, onSelectionChangeRef],
  );

  return { contextMenu, closeContextMenu, handleContextMenu };
}
