import { useEffect, useMemo, useRef } from "react";
import type { TimelineElement } from "../player";
import type { DomEditSelection } from "../components/editor/domEditing";
import { resolveTimelineIdForSelection } from "../utils/studioHelpers";
import { logSelect } from "../utils/selectDebug";
import { recordRetryAttempt, type RetryBudgetState } from "../utils/retryBudget";

interface UseTimelineSelectionPreviewSyncParams {
  selectedElementId: string | null;
  selectedElementIds: Set<string>;
  timelineElements: TimelineElement[];
  domEditSelection: DomEditSelection | null;
  domEditGroupSelections: DomEditSelection[];
  activeCompPath: string | null;
  buildDomSelectionForTimelineElement: (
    element: TimelineElement,
  ) => Promise<DomEditSelection | null>;
  applyDomSelection: (
    selection: DomEditSelection | null,
    options?: {
      revealPanel?: boolean;
      additive?: boolean;
      preserveGroup?: boolean;
      announce?: boolean;
    },
  ) => void;
  applyMarqueeSelection: (selections: DomEditSelection[], additive: boolean) => void;
  onSelectionNotFound: () => void;
}

// A member still resolving (a just-dropped/pasted/duplicated clip, or a preview
// still reloading) heals within a few retries. One that never will (deleted out
// of band, a stale id) would otherwise bail forever; past this cap, apply
// whatever did resolve instead of leaving the group selection stuck.
const MAX_UNRESOLVED_SYNC_RETRIES = 3;

function orderSelectedIds(ids: Set<string>, anchor: string | null): string[] {
  const ordered = [...ids];
  if (!anchor || !ids.has(anchor)) return ordered;
  return [anchor, ...ordered.filter((id) => id !== anchor)];
}

function selectionIdsMatch(
  currentIds: string[],
  selectedIds: string[],
  currentAnchor: string | null,
  wantedAnchor: string | null,
): boolean {
  // Compare as sets in BOTH directions: length equality misreads duplicates (two DOM
  // children resolving to the same clip id) as a full match and skips mirroring the
  // members that never made it into the preview.
  const current = new Set(currentIds);
  const selected = new Set(selectedIds);
  if (current.size !== selected.size) return false;
  for (const id of selected) {
    if (!current.has(id)) return false;
  }
  // The primary/anchor must also agree, or a change of just the anchor within the
  // same set would never re-sync the preview's primary selection.
  return currentAnchor === wantedAnchor;
}

/**
 * The invariant this file owes the Delete key, now that Delete prefers the
 * canvas: the canvas selection never points outside the current timeline
 * selection. A member still resolving has no anchor of its own yet, so it is
 * not caught here — only a canvas selection that belongs to something else.
 */
function anchorIsOutsideSelection(anchor: string | null, selectedIds: string[]): boolean {
  return anchor !== null && !selectedIds.includes(anchor);
}

async function resolveSelectionsForIds(
  ids: string[],
  timelineElements: TimelineElement[],
  buildDomSelectionForTimelineElement: UseTimelineSelectionPreviewSyncParams["buildDomSelectionForTimelineElement"],
): Promise<DomEditSelection[]> {
  // Each element's resolution fires its own network probe; a selection of N
  // members used to pay N sequential round trips here instead of one.
  const elements = ids
    .map((id) => timelineElements.find((item) => (item.key ?? item.id) === id))
    .filter((element): element is TimelineElement => Boolean(element));
  const resolved = await Promise.all(
    elements.map((element) => buildDomSelectionForTimelineElement(element)),
  );
  return resolved.filter((selection): selection is DomEditSelection => Boolean(selection));
}

function applyResolvedSelections(
  selections: DomEditSelection[],
  applyDomSelection: UseTimelineSelectionPreviewSyncParams["applyDomSelection"],
  applyMarqueeSelection: UseTimelineSelectionPreviewSyncParams["applyMarqueeSelection"],
): void {
  if (selections.length === 0) {
    applyDomSelection(null, { revealPanel: false });
  } else if (selections.length === 1) {
    applyDomSelection(selections[0]);
  } else {
    applyMarqueeSelection(selections, false);
  }
}

export function useTimelineSelectionPreviewSync({
  selectedElementId,
  selectedElementIds,
  timelineElements,
  domEditSelection,
  domEditGroupSelections,
  activeCompPath,
  buildDomSelectionForTimelineElement,
  applyDomSelection,
  applyMarqueeSelection,
  onSelectionNotFound,
}: UseTimelineSelectionPreviewSyncParams): void {
  const selectedIds = useMemo(
    () => orderSelectedIds(selectedElementIds, selectedElementId),
    [selectedElementId, selectedElementIds],
  );
  const selectedKey = selectedIds.join("\0");
  const domEditSelectionRef = useRef(domEditSelection);
  const domEditGroupSelectionsRef = useRef(domEditGroupSelections);
  const lastSyncedSelectedKeyRef = useRef("");
  const missingSelectionKeyRef = useRef("");
  const unresolvedAttemptsRef = useRef<RetryBudgetState<string>>({ id: "", count: 0 });
  domEditSelectionRef.current = domEditSelection;
  domEditGroupSelectionsRef.current = domEditGroupSelections;

  useEffect(() => {
    const previousSelectedKey = lastSyncedSelectedKeyRef.current;
    lastSyncedSelectedKeyRef.current = selectedKey;
    const currentDomEditSelection = domEditSelectionRef.current;
    const currentDomEditGroupSelections = domEditGroupSelectionsRef.current;
    const currentSelections =
      currentDomEditGroupSelections.length > 1
        ? currentDomEditGroupSelections
        : currentDomEditSelection
          ? [currentDomEditSelection]
          : [];
    const currentIds = currentSelections
      .map((selection) =>
        resolveTimelineIdForSelection(selection, timelineElements, activeCompPath),
      )
      .filter((id): id is string => Boolean(id));
    const currentAnchor = currentDomEditSelection
      ? resolveTimelineIdForSelection(currentDomEditSelection, timelineElements, activeCompPath)
      : null;

    if (selectedIds.length === 0) {
      missingSelectionKeyRef.current = "";
      // A deselect is the one unambiguous "new attempt" signal: without it, reselecting the
      // same permanently-unresolvable id later picks up an already-exhausted retry budget
      // and skips straight to the degraded fallback instead of getting a fresh grace window.
      unresolvedAttemptsRef.current = { id: "", count: 0 };
      // The timeline holds nothing, so the canvas is about to hold nothing either.
      // This is the path that silently drops a selection the user can still see.
      logSelect("timeline-empty", {
        had: currentIds.length,
        previousKey: previousSelectedKey.length > 0,
        clearing: previousSelectedKey.length > 0 && currentIds.length > 0,
      });
      if (previousSelectedKey.length > 0 && currentIds.length > 0) {
        applyDomSelection(null, { revealPanel: false });
      }
      return;
    }
    if (selectionIdsMatch(currentIds, selectedIds, currentAnchor, selectedElementId)) {
      missingSelectionKeyRef.current = "";
      return;
    }

    let cancelled = false;
    // One warning per selection, however many times the effect retries it.
    const warnSelectionMissingOnce = () => {
      if (missingSelectionKeyRef.current === selectedKey) return;
      missingSelectionKeyRef.current = selectedKey;
      onSelectionNotFound();
    };
    const syncSelection = async () => {
      const selections = await resolveSelectionsForIds(
        selectedIds,
        timelineElements,
        buildDomSelectionForTimelineElement,
      );
      if (cancelled) return;
      if (selections.length < selectedIds.length) {
        if (recordRetryAttempt(unresolvedAttemptsRef, selectedKey, MAX_UNRESOLVED_SYNC_RETRIES)) {
          // Still within the retry grace window: stay quiet (warn only once
          // exhausted, below). Delete acts on the canvas first, so only an
          // anchor OUTSIDE this selection is cleared here, quietly.
          if (anchorIsOutsideSelection(currentAnchor, selectedIds)) {
            applyDomSelection(null, { revealPanel: false, announce: false });
          }
          return;
        }
        // Budget exhausted: warn once (missingSelectionKeyRef dedupes further
        // reruns of this same still-unresolved key) and apply whatever did resolve.
        warnSelectionMissingOnce();
      } else {
        unresolvedAttemptsRef.current = { id: "", count: 0 };
        missingSelectionKeyRef.current = "";
      }
      logSelect("timeline-sync", {
        wanted: selectedIds.length,
        had: currentIds.length,
        resolved: selections.length,
      });
      applyResolvedSelections(selections, applyDomSelection, applyMarqueeSelection);
    };

    void syncSelection();
    return () => {
      cancelled = true;
    };
    // DOM selection changes are read through refs. Depending on them directly
    // would let the preview-to-timeline echo cancel an in-flight timeline click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeCompPath,
    applyDomSelection,
    applyMarqueeSelection,
    buildDomSelectionForTimelineElement,
    onSelectionNotFound,
    selectedElementId,
    selectedIds,
    selectedKey,
    timelineElements,
  ]);
}
