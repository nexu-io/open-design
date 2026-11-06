import { useCallback } from "react";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import type { ClipContextMenuState } from "./TimelineProvider";
import { selectClipWithLinks } from "./timelineLinkSelection";

/** A clicked member of an active multi-selection keeps the whole group
 *  selected, so the context menu it opens acts on all of it. */
export function useClipContextMenu(
  onSelectElement: ((element: TimelineElement | null) => void) | undefined,
  dismissGapMenu: () => void,
  setClipContextMenu: (state: ClipContextMenuState | null) => void,
) {
  const selectedElementIds = usePlayerStore((s) => s.selectedElementIds);
  const setSelectedElementId = usePlayerStore((s) => s.setSelectedElementId);
  return useCallback(
    (e: React.MouseEvent, el: TimelineElement) => {
      e.preventDefault();
      const id = el.key ?? el.id;
      if (!(selectedElementIds.size > 1 && selectedElementIds.has(id))) {
        selectClipWithLinks(id, e.altKey, setSelectedElementId);
        onSelectElement?.(el);
      }
      dismissGapMenu();
      setClipContextMenu({
        x: e.clientX,
        y: e.clientY,
        element: el,
        sessionEpoch: usePlayerStore.getState().timelineSessionEpoch,
      });
    },
    [selectedElementIds, setSelectedElementId, onSelectElement, dismissGapMenu, setClipContextMenu],
  );
}
