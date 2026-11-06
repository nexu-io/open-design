import { useCallback, useMemo, type FocusEvent, type KeyboardEvent, type RefObject } from "react";
import { matchesKey } from "./studioShortcuts";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { RULER_H, TRACK_H, type TimelineRowGeometry } from "./timelineLayout";
import {
  isTimelineNavigationKey,
  locateTimelineLogicalTarget,
  resolveTimelineNavigationTarget,
  type TimelineLogicalRow,
} from "./timelineKeyboardNavigation";

interface TimelineKeyboardActorInput {
  logicalRows: readonly TimelineLogicalRow[];
  focusedTargetId: string | null;
  rowGeometry: TimelineRowGeometry;
  scrollRef: RefObject<HTMLDivElement | null>;
  onToggleRow: (target: TimelineLogicalRow) => void;
  onDrillDown?: (element: TimelineElement) => void;
}

type ClipPickupAction =
  | { kind: "move"; step: -1 | 1 }
  | { kind: "commit" }
  | { kind: "cancel" }
  | { kind: "focus" }
  | { kind: "consume" };

function clipPickupKeyboardAction(event: globalThis.KeyboardEvent): ClipPickupAction | null {
  if (matchesKey(event, "pickupUp")) return { kind: "move", step: -1 };
  if (matchesKey(event, "pickupDown")) return { kind: "move", step: 1 };
  if (matchesKey(event, "pickupDrop")) return { kind: event.repeat ? "focus" : "commit" };
  if (matchesKey(event, "cancel")) return { kind: "cancel" };
  return matchesKey(event, "pickupClip") ? { kind: "consume" } : null;
}

export function handleClipPickupKeyboardEvent(
  event: globalThis.KeyboardEvent,
  actions: {
    move: (step: -1 | 1) => void;
    commit: () => void;
    cancel: () => void;
    focus: () => void;
  },
): void {
  const action = clipPickupKeyboardAction(event);
  if (!action) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  switch (action.kind) {
    case "move":
      actions.move(action.step);
      break;
    case "commit":
      actions.commit();
      actions.focus();
      break;
    case "cancel":
      actions.cancel();
      actions.focus();
      break;
    case "focus":
      actions.focus();
      break;
    case "consume":
      break;
    default: {
      const unreachable: never = action;
      throw new Error(`Unknown pickup action: ${unreachable}`);
    }
  }
}

export function scrollKeyboardInsertRow(
  viewport: HTMLDivElement,
  geometry: TimelineRowGeometry,
  row: number,
): void {
  const top = geometry.getRowTop(row);
  if (top < viewport.scrollTop + RULER_H) viewport.scrollTop = Math.max(0, top - RULER_H);
  else if (top + TRACK_H > viewport.scrollTop + viewport.clientHeight)
    viewport.scrollTop = top + TRACK_H - viewport.clientHeight;
}

export function timelineKeyboardEventTarget(
  target: EventTarget | null,
  container: HTMLElement,
): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  // Header actions stay native Tab stops because they have no row-level shortcut.
  // The nearest interactive ancestor wins so their events never masquerade as row events.
  const nearest = target.closest<HTMLElement>(
    "button, input, select, textarea, a[href], [contenteditable], [role='slider'], [data-timeline-focus-id]",
  );
  return nearest?.dataset.timelineFocusId && container.contains(nearest) ? nearest : null;
}

function viewportPageSize(
  logicalRowCountByTrack: ReadonlyMap<number, number>,
  focusedTrackKey: number,
  geometry: TimelineRowGeometry,
  viewport: HTMLDivElement | null,
): number {
  if (!viewport || logicalRowCountByTrack.size === 0) return 1;
  const focusedRow = geometry.getRowIndex(focusedTrackKey);
  const first = Math.max(
    0,
    focusedRow >= 0 ? focusedRow : Math.floor(geometry.getRowFromY(viewport.scrollTop)),
  );
  const pageTop = focusedRow >= 0 ? geometry.getRowTop(focusedRow) : viewport.scrollTop;
  // Stay just inside the viewport so an exact row boundary does not count the next row.
  const last = Math.min(
    geometry.rowKeys.length - 1,
    Math.floor(geometry.getRowFromY(pageTop + Math.max(0, viewport.clientHeight - 0.001))),
  );
  let count = 0;
  for (let index = first; index <= last; index += 1) {
    count += logicalRowCountByTrack.get(geometry.rowKeys[index]!) ?? 0;
  }
  return Math.max(1, count);
}

function openContextMenu(target: HTMLElement): void {
  const bounds = target.getBoundingClientRect();
  target.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    }),
  );
}

/** The timeline's sole keyboard actor; controls only describe their logical identity. */
export function useTimelineKeyboardActor({
  logicalRows,
  focusedTargetId,
  rowGeometry,
  scrollRef,
  onToggleRow,
  onDrillDown,
}: TimelineKeyboardActorInput) {
  const rovingTargetId =
    (focusedTargetId && locateTimelineLogicalTarget(logicalRows, focusedTargetId)?.target.id) ??
    logicalRows[0]?.id ??
    null;
  const logicalRowCountByTrack = useMemo(() => {
    const counts = new Map<number, number>();
    for (const row of logicalRows) {
      counts.set(row.physicalTrackKey, (counts.get(row.physicalTrackKey) ?? 0) + 1);
    }
    return counts;
  }, [logicalRows]);

  const onFocus = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      const id = timelineKeyboardEventTarget(event.target, event.currentTarget)?.dataset
        .timelineFocusId;
      if (id && id !== focusedTargetId) usePlayerStore.getState().requestTimelineFocus(id);
    },
    // ponytail: This closure must see the current id or coordinator-driven focus bumps the nonce twice.
    [focusedTargetId],
  );

  const onKeyDown = useCallback(
    // One handler owns navigation, context-menu, and disclosure keyboard semantics.
    // fallow-ignore-next-line complexity
    (event: KeyboardEvent<HTMLElement>) => {
      const targetElement = timelineKeyboardEventTarget(event.target, event.currentTarget);
      const id = targetElement?.dataset.timelineFocusId;
      if (!targetElement || !id) return;
      const located = locateTimelineLogicalTarget(logicalRows, id);
      if (!located) return;

      if (isTimelineNavigationKey(event.key)) {
        if (
          located.target.kind === "row" &&
          ((event.key === "ArrowRight" && located.target.expandable && !located.target.expanded) ||
            (event.key === "ArrowLeft" && located.target.expandable && located.target.expanded))
        ) {
          event.preventDefault();
          onToggleRow(located.target);
          return;
        }
        const next = resolveTimelineNavigationTarget(logicalRows, id, event.key, {
          pageSize: viewportPageSize(
            logicalRowCountByTrack,
            located.row.physicalTrackKey,
            rowGeometry,
            scrollRef.current,
          ),
          timelineBoundary: event.ctrlKey || event.metaKey,
        });
        event.preventDefault();
        if (next && next.id !== id) usePlayerStore.getState().requestTimelineFocus(next.id);
        return;
      }
      if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
        event.preventDefault();
        openContextMenu(targetElement);
        return;
      }
      const composition = located.target.kind === "clip" && located.target.element;
      if (event.key === "Enter" && composition && composition.compositionSrc && onDrillDown) {
        event.preventDefault();
        onDrillDown(composition);
        return;
      }
      if (
        (event.key !== "Enter" && event.key !== " ") ||
        located.target.kind !== "row" ||
        !located.target.expandable
      ) {
        return;
      }
      event.preventDefault();
      onToggleRow(located.target);
    },
    [logicalRowCountByTrack, logicalRows, onDrillDown, onToggleRow, rowGeometry, scrollRef],
  );

  return { rovingTargetId, onFocus, onKeyDown };
}
